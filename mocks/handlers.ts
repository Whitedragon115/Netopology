import { delay, http, HttpResponse } from 'msw';
import type {
  Area,
  AuditEntry,
  AreaCreate,
  LinkCreate,
  LinkUpdate,
  NoteCreate,
  NoteUpdate,
  Canvas,
  CanvasOperation,
  CanvasView,
  Field,
  InvNode,
  Link,
  Member,
  Note,
  Placement,
  Role,
  ViewerRole,
} from '@/lib/api/types';
import { completeSetup, currentMember, currentRole, db, MOCK_PASSWORD, needsSetup, newId, placeItem, signIn, signOut, type DbNote } from './db';

/**
 * Mock implementation of backend/api/contract.yaml (first slice). Same rules as the real API:
 * server-side redaction, editor canvas grants, links drawn when both ends are placed, area canvases.
 */
const BASE = '/api/v1';
const problem = (status: number, code: string, title: string) =>
  HttpResponse.json({ type: 'about:blank', title, status, code }, { status, headers: { 'Content-Type': 'application/problem+json' } });

// ───────── access ─────────
// the auth guard (first handler) guarantees a signed-in member for every other handler
// while answering a guest (share link) request, the caller is a read-only guest without sensitive access
let guest = false;
const GUEST = { userId: '', role: 'viewer', canViewSensitive: false, canvasIds: [] as string[] } as unknown as NonNullable<ReturnType<typeof currentMember>>;
const me = () => (guest ? GUEST : currentMember()!);
const canEdit = () => ['owner', 'admin', 'editor'].includes(me().role);
const canSeeSensitive = () => ['owner', 'admin'].includes(me().role) || me().canViewSensitive;
const canSeeCanvas = (c: Canvas) => {
  const m = me();
  if (m.role !== 'editor') return true;
  if (c.areaId) return db.placements.some((p) => p.item.type === 'area' && p.item.id === c.areaId && m.canvasIds.includes(p.canvasId));
  return m.canvasIds.includes(c.id);
};
const viewerRole = (): ViewerRole => (guest ? 'guest' : me().role);

// ───────── redaction (applied to every response) ─────────
const redactFields = (fields: Field[]): Field[] =>
  canSeeSensitive() ? fields : fields.map((f) => (f.sensitive ? { key: f.key, label: f.label, sensitive: true, redacted: true } : f));
const outNode = (n: InvNode): InvNode => ({ ...n, properties: redactFields(n.properties) });
const outArea = (a: Area): Area => (canSeeSensitive() ? a : { ...a, cidr: null, vlanId: null });
const outNote = (n: DbNote): Note => {
  const { placement: _placement, ...rest } = n;
  return n.isSensitive && !canSeeSensitive() ? { ...rest, title: '', body: '', redacted: true } : rest;
};

// ───────── canvas view ─────────
function buildView(canvasId: string): CanvasView | null {
  const canvas = db.canvases.find((c) => c.id === canvasId);
  if (!canvas || !canSeeCanvas(canvas)) return null;
  const placements = db.placements.filter((p) => p.canvasId === canvasId);
  const placedNodes = new Set(placements.filter((p) => p.item.type === 'node').map((p) => p.item.id));
  const hidden = new Set(canvas.settings.hiddenLinkKinds ?? []);
  const overrides = db.linkOverrides.filter((o) => o.canvasId === canvasId);
  const hiddenLinks = new Set(overrides.filter((o) => o.hidden).map((o) => o.linkId));
  const isAreaCanvas = !!canvas.areaId;

  const links = db.links.filter((l) => {
    if (hidden.has(l.kind) || hiddenLinks.has(l.id)) return false;
    const s = placedNodes.has(l.sourceNodeId);
    const t = placedNodes.has(l.targetNodeId);
    return isAreaCanvas ? s || t : s && t; // area canvases also get links crossing the boundary
  });
  const nodeIds = new Set([...placedNodes, ...links.flatMap((l) => [l.sourceNodeId, l.targetNodeId])]);
  const nodes = db.nodes.filter((n) => nodeIds.has(n.id));
  const areaIds = new Set([
    ...placements.filter((p) => p.item.type === 'area').map((p) => p.item.id),
    ...nodes.map((n) => n.areaId).filter((x): x is string => !!x),
  ]);
  if (canvas.areaId) areaIds.add(canvas.areaId);
  const noteIds = new Set(placements.filter((p) => p.item.type === 'note').map((p) => p.item.id));

  const breadcrumb = [];
  if (canvas.areaId) {
    const host = db.placements.find((p) => p.item.type === 'area' && p.item.id === canvas.areaId);
    const hostCanvas = host && db.canvases.find((c) => c.id === host.canvasId);
    if (hostCanvas) breadcrumb.push({ areaId: null, name: hostCanvas.name, canvasId: hostCanvas.id });
    breadcrumb.push({ areaId: canvas.areaId, name: canvas.name, canvasId: canvas.id });
  }

  return {
    canvas,
    viewer: { role: viewerRole(), canEdit: canEdit(), canViewSensitive: canSeeSensitive() },
    breadcrumb,
    placements: placements.map(({ canvasId: _c, ...p }) => p),
    linkOverrides: overrides.filter((o) => !o.hidden).map(({ canvasId: _c, ...o }) => o),
    nodes: nodes.map(outNode),
    links,
    areas: db.areas.filter((a) => areaIds.has(a.id)).map(outArea),
    notes: db.notes.filter((n) => noteIds.has(n.id)).map(outNote),
    shapes: db.shapes.filter((s) => s.canvasId === canvasId).map(({ canvasId: _c, ...s }) => s),
  };
}

// when a node changes area, re-parent its drawings (mirrors the DB trigger nodes_reparent)
function reparent(nodeId: string, areaId: string | null) {
  for (const p of db.placements.filter((x) => x.item.type === 'node' && x.item.id === nodeId)) {
    const box = areaId ? db.placements.find((b) => b.canvasId === p.canvasId && b.item.type === 'area' && b.item.id === areaId) : undefined;
    const oldBox = p.parentPlacementId ? db.placements.find((b) => b.id === p.parentPlacementId) : undefined;
    // keep the absolute position stable: convert relative ↔ absolute
    const absX = p.x + (oldBox?.x ?? 0);
    const absY = p.y + (oldBox?.y ?? 0);
    p.parentPlacementId = box?.id ?? null;
    p.x = absX - (box?.x ?? 0);
    p.y = absY - (box?.y ?? 0);
  }
}

function applyOperation(canvasId: string, op: CanvasOperation, index: number) {
  switch (op.op) {
    case 'place': {
      const p = placeItem(canvasId, op.item.type, op.item.id, op.x ?? 0, op.y ?? 0, {
        parentPlacementId: op.parentPlacementId ?? null,
        width: op.width ?? null,
        height: op.height ?? null,
        collapsed: op.collapsed ?? false,
        style: op.style ?? {},
      });
      // placing an area box adopts its member nodes already on this canvas (contract: OpPlace)
      if (op.item.type === 'area') {
        for (const child of db.placements.filter((x) => x.canvasId === canvasId && x.item.type === 'node' && x.parentPlacementId === null)) {
          if (db.nodes.find((n) => n.id === child.item.id)?.areaId === op.item.id) {
            child.parentPlacementId = p.id;
            child.x -= p.x;
            child.y -= p.y;
          }
        }
      }
      return { index, clientId: op.clientId, id: p.id };
    }
    case 'update': {
      const p = db.placements.find((x) => x.id === op.placementId && x.canvasId === canvasId);
      if (!p) throw new Error('placement not found');
      if (op.parentPlacementId !== undefined && op.parentPlacementId !== p.parentPlacementId && p.item.type === 'node') {
        // dropping a node into another area box changes its area in the inventory
        const box = op.parentPlacementId ? db.placements.find((b) => b.id === op.parentPlacementId) : undefined;
        const node = db.nodes.find((n) => n.id === p.item.id)!;
        node.areaId = box?.item.id ?? null;
        node.version++;
        reparent(node.id, node.areaId);
      }
      Object.assign(p, Object.fromEntries(Object.entries(op).filter(([k, v]) => v !== undefined && !['op', 'placementId', 'parentPlacementId'].includes(k))));
      return { index, id: p.id };
    }
    case 'remove': {
      const p = db.placements.find((x) => x.id === op.placementId && x.canvasId === canvasId);
      if (!p) throw new Error('placement not found');
      // children of a removed area box stay on the canvas, at the same absolute position
      for (const child of db.placements.filter((x) => x.parentPlacementId === p.id)) {
        child.parentPlacementId = null;
        child.x += p.x;
        child.y += p.y;
      }
      db.placements = db.placements.filter((x) => x.id !== p.id);
      return { index };
    }
    case 'shape.create': {
      const s = {
        id: newId('s'), canvasId, kind: op.kind, x: op.x ?? 0, y: op.y ?? 0, width: op.width ?? null, height: op.height ?? null,
        rotation: op.rotation ?? 0, zIndex: op.zIndex ?? 0, style: op.style ?? {}, data: op.data ?? {},
      };
      db.shapes.push(s);
      return { index, clientId: op.clientId, id: s.id };
    }
    case 'shape.update': {
      const s = db.shapes.find((x) => x.id === op.shapeId && x.canvasId === canvasId);
      if (!s) throw new Error('shape not found');
      Object.assign(s, Object.fromEntries(Object.entries(op).filter(([k, v]) => v !== undefined && !['op', 'shapeId'].includes(k))));
      return { index, id: s.id };
    }
    case 'shape.delete': {
      if (!db.shapes.some((x) => x.id === op.shapeId && x.canvasId === canvasId)) throw new Error('shape not found');
      db.shapes = db.shapes.filter((x) => x.id !== op.shapeId);
      return { index };
    }
    case 'link.override': {
      let o = db.linkOverrides.find((x) => x.canvasId === canvasId && x.linkId === op.linkId);
      if (!o) { o = { canvasId, linkId: op.linkId, hidden: false, style: {}, waypoints: null }; db.linkOverrides.push(o); }
      if (op.hidden !== undefined) o.hidden = op.hidden;
      if (op.style) o.style = op.style;
      if (op.waypoints !== undefined) o.waypoints = op.waypoints;
      return { index };
    }
    case 'link.reset': {
      db.linkOverrides = db.linkOverrides.filter((x) => !(x.canvasId === canvasId && x.linkId === op.linkId));
      return { index };
    }
    default:
      return { index };
  }
}

const memberOut = (m: (typeof db.members)[number]): Member => {
  const base: Member = { user: { id: m.userId, username: m.username, displayName: m.displayName }, role: m.role };
  if (me().role !== 'owner' && me().role !== 'admin') return base;
  return {
    ...base,
    canViewSensitive: m.role === 'owner' || m.role === 'admin' ? true : m.canViewSensitive,
    canvasIds: m.canvasIds,
    createdAt: '2026-03-01T10:00:00Z',
  };
};

type AccountLike = { userId: string; username: string; displayName: string; signin: string[] };
const instanceRoleOf = (id: string) => db.accountState[id]?.instanceRole ?? (id === 'u-alice' ? 'owner' : id === 'u-bob' ? 'admin' : 'member');
const account = (m: AccountLike) => ({
  id: m.userId, username: m.username, displayName: m.displayName, email: db.accountState[m.userId]?.email ?? null,
  instanceRole: instanceRoleOf(m.userId),
  hasPassword: m.signin.includes('Password'),
  identities: m.signin.filter((s) => s !== 'Password').map((s) => s.toLowerCase()),
  status: db.accountState[m.userId]?.status ?? 'active', lastLoginAt: null, createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z',
});
const allAccounts = (): AccountLike[] => [...db.members, ...db.extraAccounts];
const isStaff = () => ['owner', 'admin'].includes(instanceRoleOf(me().userId));
const manages = () => me().role === 'owner' || me().role === 'admin';
const wsOut = (w: (typeof db.workspaces)[number]) => ({
  ...w, settings: {}, membership: { role: me().role, canViewSensitive: canSeeSensitive() },
  createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z',
});
const stale = (request: Request, version: number) => {
  const h = request.headers.get('If-Match');
  return !!h && h.replace(/"/g, '') !== String(version);
};

// login rate limit, like the real API (permissions.md: auth.login is rate-limited)
const failures: number[] = [];
const PUBLIC = new Set(['/setup', '/auth/login', '/auth/providers']);

// ───────── handlers ─────────
// ───────── share links and audit log (in memory, reset on reload) ─────────
const shareLinks: { id: string; canvasId: string; label: string; hasPassword: boolean; password: string | null; expiresAt: string | null; revokedAt: string | null; createdBy: string; createdAt: string; lastUsedAt: string | null; useCount: number; token: string }[] = [];
const unlocked = new Set<string>();
const liveLink = (token: string) => shareLinks.find((l) => l.token === token && !l.revokedAt && !(l.expiresAt && l.expiresAt < new Date().toISOString()));
const auditLog: AuditEntry[] = [];
function audit(action: string, type: string, id: string) {
  const m = currentMember();
  const name = m ? (db.extraAccounts.find((a) => a.userId === m.userId)?.displayName ?? m.userId.replace('u-', '')) : null;
  auditLog.push({ id: newId('au'), actor: { type: 'user', id: m?.userId ?? null, displayName: name }, action, target: { type, id }, metadata: {}, ip: '127.0.0.1', createdAt: new Date().toISOString() });
}

export const handlers = [
  // auth guard: anonymous callers get 401 everywhere except the public endpoints
  http.all(`${BASE}/*`, ({ request }) => {
    const path = new URL(request.url).pathname.slice(BASE.length);
    if (!PUBLIC.has(path) && !path.startsWith('/share/') && !currentMember()) return problem(401, 'auth.required', 'Unauthorized');
  }),

  http.get(`${BASE}/setup`, async () => {
    await delay(60);
    return HttpResponse.json({ needsSetup: needsSetup() });
  }),

  http.post(`${BASE}/setup`, async ({ request }) => {
    await delay(300);
    if (!needsSetup()) return problem(409, 'setup.already_completed', 'Conflict');
    const body = (await request.json()) as { username: string; password: string; displayName?: string; workspaceName?: string };
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,38}[A-Za-z0-9]$/.test(body.username ?? '') || (body.password ?? '').length < 12)
      return problem(422, 'validation', 'Unprocessable Entity');
    completeSetup({ username: body.username, displayName: body.displayName?.trim() ?? '', workspaceName: body.workspaceName?.trim() });
    return HttpResponse.json(account(currentMember()!), { status: 201 });
  }),

  http.get(`${BASE}/auth/providers`, async () => {
    await delay(40);
    return HttpResponse.json({ password: true, providers: [{ id: 'google', name: 'Google' }, { id: 'discord', name: 'Discord' }] });
  }),

  http.post(`${BASE}/auth/login`, async ({ request }) => {
    await delay(350);
    const now = Date.now();
    while (failures.length && now - failures[0]! > 60_000) failures.shift();
    const oldest = failures[0];
    if (failures.length >= 5 && oldest !== undefined) {
      const retry = Math.ceil((60_000 - (now - oldest)) / 1000);
      return HttpResponse.json(
        { title: 'Too Many Requests', status: 429, code: 'rate_limited', detail: 'Too many attempts. Try again later.' },
        { status: 429, headers: { 'Content-Type': 'application/problem+json', 'Retry-After': String(retry) } },
      );
    }
    const body = (await request.json()) as { username: string; password: string };
    const m = db.members.find((x) => x.username.toLowerCase() === (body.username ?? '').toLowerCase());
    if (!m || !m.signin.includes('Password') || body.password !== MOCK_PASSWORD) {
      failures.push(now);
      return problem(401, 'auth.invalid_credentials', 'Unauthorized');
    }
    signIn(m.userId);
    return HttpResponse.json(account(m));
  }),

  http.post(`${BASE}/auth/logout`, async () => {
    await delay(80);
    signOut();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/me`, async () => {
    await delay(80);
    return HttpResponse.json(account(me()));
  }),

  http.get(`${BASE}/workspaces`, async () => {
    await delay(80);
    return HttpResponse.json({ items: db.workspaces.map(wsOut) });
  }),

  // NOTE: the mock keeps one shared demo dataset, so every workspace shows the same canvases.
  http.post(`${BASE}/workspaces`, async ({ request }) => {
    if (!isStaff()) return problem(403, 'role.insufficient', 'Only the server owner or a server admin can create workspaces');
    const body = (await request.json()) as { name: string; slug?: string; description?: string };
    const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
    if (db.workspaces.some((w) => w.slug === slug)) return problem(409, 'slug.taken', 'Slug taken');
    const w = { id: newId('ws'), slug, name: body.name, description: body.description ?? '', isProtected: false, version: 1 };
    db.workspaces.push(w);
    return HttpResponse.json(wsOut(w), { status: 201 });
  }),

  http.patch(`${BASE}/workspaces/:ws`, async ({ params, request }) => {
    const w = db.workspaces.find((x) => x.id === params.ws);
    if (!w) return problem(404, 'not_found', 'Not found');
    if (!manages()) return problem(403, 'role.insufficient', 'Forbidden');
    if (stale(request, w.version)) return problem(412, 'version.stale', 'Precondition Failed');
    const body = (await request.json()) as Partial<typeof w>;
    if (body.isProtected === false && w.isProtected && me().role !== 'owner') return problem(403, 'protected', 'Only the owner can remove protection');
    if (body.slug && body.slug !== w.slug && db.workspaces.some((x) => x.slug === body.slug)) return problem(409, 'slug.taken', 'Slug taken');
    Object.assign(w, body, { version: w.version + 1 });
    return HttpResponse.json(wsOut(w));
  }),

  http.delete(`${BASE}/workspaces/:ws`, async ({ params }) => {
    const w = db.workspaces.find((x) => x.id === params.ws);
    if (!w) return problem(404, 'not_found', 'Not found');
    if (me().role !== 'owner') return problem(403, 'role.insufficient', 'Forbidden');
    if (w.isProtected) return problem(403, 'protected', 'Protected');
    db.workspaces = db.workspaces.filter((x) => x.id !== w.id);
    return new HttpResponse(null, { status: 204 });
  }),

  // ───── members ─────
  http.get(`${BASE}/users/lookup`, async ({ request }) => {
    if (!manages()) return problem(403, 'role.insufficient', 'Forbidden');
    const u = new URL(request.url).searchParams.get('username')?.toLowerCase();
    const a = allAccounts().find((x) => x.username.toLowerCase() === u);
    return a ? HttpResponse.json({ id: a.userId, username: a.username, displayName: a.displayName }) : problem(404, 'not_found', 'No such user');
  }),

  http.post(`${BASE}/workspaces/:ws/members`, async ({ request }) => {
    if (!manages()) return problem(403, 'role.insufficient', 'Forbidden');
    const body = (await request.json()) as { userId: string; role: Role; canViewSensitive?: boolean; canvasIds?: string[] };
    if (body.role === 'owner' && me().role !== 'owner') return problem(403, 'role.insufficient', 'Admins cannot add owners');
    if (db.members.some((m) => m.userId === body.userId)) return problem(409, 'member.exists', 'Already a member');
    const a = db.extraAccounts.find((x) => x.userId === body.userId);
    if (!a) return problem(404, 'not_found', 'No such user');
    db.extraAccounts = db.extraAccounts.filter((x) => x.userId !== a.userId);
    const m = { ...a, role: body.role, canViewSensitive: body.canViewSensitive ?? false, canvasIds: body.role === 'editor' ? (body.canvasIds ?? []) : [] };
    db.members.push(m);
    return HttpResponse.json(memberOut(m), { status: 201 });
  }),

  http.patch(`${BASE}/workspaces/:ws/members/:uid`, async ({ params, request }) => {
    const m = db.members.find((x) => x.userId === params.uid);
    if (!m) return problem(404, 'not_found', 'Not found');
    if (!manages() || (me().role === 'admin' && m.role === 'owner')) return problem(403, 'role.insufficient', 'Forbidden');
    const body = (await request.json()) as { role?: Role; canViewSensitive?: boolean };
    if (body.role === 'owner' && me().role !== 'owner') return problem(403, 'role.insufficient', 'Admins cannot grant owner');
    if (m.role === 'owner' && body.role && body.role !== 'owner' && db.members.filter((x) => x.role === 'owner').length === 1)
      return problem(409, 'member.last_owner', 'Last owner');
    if (body.role) m.role = body.role;
    if (body.canViewSensitive !== undefined) m.canViewSensitive = body.canViewSensitive;
    if (m.role !== 'editor') m.canvasIds = [];
    return HttpResponse.json(memberOut(m));
  }),

  http.put(`${BASE}/workspaces/:ws/members/:uid/canvas-grants`, async ({ params, request }) => {
    const m = db.members.find((x) => x.userId === params.uid);
    if (!m) return problem(404, 'not_found', 'Not found');
    if (!manages()) return problem(403, 'role.insufficient', 'Forbidden');
    if (m.role !== 'editor') return problem(422, 'validation', 'Only editors have canvas grants');
    m.canvasIds = ((await request.json()) as { canvasIds: string[] }).canvasIds;
    return HttpResponse.json(memberOut(m));
  }),

  http.delete(`${BASE}/workspaces/:ws/members/:uid`, async ({ params }) => {
    const m = db.members.find((x) => x.userId === params.uid);
    if (!m) return problem(404, 'not_found', 'Not found');
    const self = m.userId === me().userId;
    if (!self && (!manages() || (me().role === 'admin' && m.role === 'owner'))) return problem(403, 'role.insufficient', 'Forbidden');
    if (m.role === 'owner' && db.members.filter((x) => x.role === 'owner').length === 1) return problem(409, 'member.last_owner', 'Last owner');
    db.members = db.members.filter((x) => x.userId !== m.userId);
    db.extraAccounts.push({ userId: m.userId, username: m.username, displayName: m.displayName, signin: m.signin });
    return new HttpResponse(null, { status: 204 });
  }),

  // ───── your account ─────
  http.patch(`${BASE}/me`, async ({ request }) => {
    const body = (await request.json()) as { displayName?: string; email?: string | null };
    const m = me();
    if (body.displayName !== undefined) m.displayName = body.displayName || m.username;
    if (body.email !== undefined) db.accountState[m.userId] = { ...db.accountState[m.userId], email: body.email };
    return HttpResponse.json(account(m));
  }),

  http.post(`${BASE}/me/password`, async ({ request }) => {
    const body = (await request.json()) as { currentPassword: string; newPassword: string };
    if (me().signin.includes('Password') && body.currentPassword !== MOCK_PASSWORD) return problem(401, 'auth.invalid_credentials', 'Wrong password');
    if (!me().signin.includes('Password')) me().signin.push('Password');
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/me/identities`, async () => {
    const m = me();
    return HttpResponse.json({
      hasPassword: m.signin.includes('Password'),
      items: m.signin.filter((s) => s !== 'Password').map((s) => ({ id: `${m.userId}-${s.toLowerCase()}`, provider: s.toLowerCase(), email: `${m.username}@example.com`, displayName: m.displayName, createdAt: '2026-03-01T10:00:00Z', lastUsedAt: null })),
    });
  }),

  http.delete(`${BASE}/me/identities/:id`, async ({ params }) => {
    const m = me();
    const provider = String(params.id).split('-').at(-1);
    const rest = m.signin.filter((s) => s.toLowerCase() !== provider);
    if (!rest.length) return problem(409, 'auth.last_sign_in_method', 'Last sign-in method');
    m.signin = rest;
    return new HttpResponse(null, { status: 204 });
  }),

  // ───── server administration ─────
  http.get(`${BASE}/users`, async ({ request }) => {
    if (!isStaff()) return problem(403, 'role.insufficient', 'Forbidden');
    const q = new URL(request.url).searchParams.get('q')?.toLowerCase() ?? '';
    const items = allAccounts().filter((a) => !q || a.username.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q)).map(account);
    return HttpResponse.json({ items, nextCursor: null });
  }),

  http.post(`${BASE}/users`, async ({ request }) => {
    if (!isStaff()) return problem(403, 'role.insufficient', 'Forbidden');
    const body = (await request.json()) as { username: string; displayName?: string; email?: string; password?: string; instanceRole?: 'admin' | 'member' };
    if (allAccounts().some((a) => a.username.toLowerCase() === body.username.toLowerCase())) return problem(409, 'user.username_taken', 'That username is already used.');
    if (body.instanceRole === 'admin' && instanceRoleOf(me().userId) !== 'owner') return problem(403, 'role.insufficient', 'Only the owner creates admins');
    const a = { userId: newId('u'), username: body.username, displayName: body.displayName || body.username, signin: body.password ? ['Password'] : [] };
    db.extraAccounts.push(a);
    db.accountState[a.userId] = { email: body.email ?? null, instanceRole: body.instanceRole ?? 'member' };
    return HttpResponse.json(account(a), { status: 201 });
  }),

  http.patch(`${BASE}/users/:id`, async ({ params, request }) => {
    if (!isStaff()) return problem(403, 'role.insufficient', 'Forbidden');
    const a = allAccounts().find((x) => x.userId === params.id);
    if (!a) return problem(404, 'not_found', 'Not found');
    const owner = instanceRoleOf(me().userId) === 'owner';
    const body = (await request.json()) as { status?: 'active' | 'disabled'; instanceRole?: 'owner' | 'admin' | 'member'; displayName?: string; email?: string | null };
    if (!owner && (instanceRoleOf(a.userId) !== 'member' || body.instanceRole)) return problem(403, 'role.insufficient', 'Forbidden');
    if (body.instanceRole === 'owner') db.accountState[me().userId] = { ...db.accountState[me().userId], instanceRole: 'admin' };
    db.accountState[a.userId] = { ...db.accountState[a.userId], ...(body.status ? { status: body.status } : {}), ...(body.instanceRole ? { instanceRole: body.instanceRole } : {}), ...(body.email !== undefined ? { email: body.email } : {}) };
    if (body.displayName) a.displayName = body.displayName;
    return HttpResponse.json(account(a));
  }),

  http.post(`${BASE}/users/:id/password`, async ({ params }) => {
    if (!isStaff()) return problem(403, 'role.insufficient', 'Forbidden');
    const a = allAccounts().find((x) => x.userId === params.id);
    if (!a) return problem(404, 'not_found', 'Not found');
    if (!a.signin.includes('Password')) a.signin.push('Password');
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/instance/settings`, async () => (isStaff() ? HttpResponse.json(db.instanceSettings) : problem(403, 'role.insufficient', 'Forbidden'))),

  http.patch(`${BASE}/instance/settings`, async ({ request }) => {
    if (!isStaff()) return problem(403, 'role.insufficient', 'Forbidden');
    Object.assign(db.instanceSettings, await request.json());
    return HttpResponse.json(db.instanceSettings);
  }),

  http.get(`${BASE}/workspaces/:ws/canvases`, async () => {
    await delay(60);
    return HttpResponse.json({ items: db.canvases.filter((c) => !c.areaId && canSeeCanvas(c)).sort((a, b) => a.sortOrder - b.sortOrder) });
  }),

  http.post(`${BASE}/workspaces/:ws/canvases`, async ({ request }) => {
    if (me().role !== 'owner' && me().role !== 'admin') return problem(403, 'role.insufficient', 'Forbidden');
    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name || name.length > 100) return problem(422, 'validation', 'Invalid canvas name');
    if (db.canvases.some((canvas) => !canvas.areaId && canvas.name === name)) return problem(409, 'canvas.name_taken', 'Canvas name already used');
    const now = new Date().toISOString();
    const created: Canvas = {
      id: crypto.randomUUID(), kind: 'tab', areaId: null, name, description: '', sortOrder: db.canvases.length,
      viewport: { x: 0, y: 0, zoom: 1 }, settings: {}, isProtected: false, lock: null,
      createdAt: now, updatedAt: now, version: 1,
    };
    db.canvases.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch(`${BASE}/workspaces/:ws/canvases/:cid`, async ({ params, request }) => {
    if (!canEdit() || me().role === 'editor') return problem(403, 'role.insufficient', 'Forbidden');
    const c = db.canvases.find((x) => x.id === params.cid);
    if (!c) return problem(404, 'canvas.not_found', 'Not found');
    if (stale(request, c.version)) return problem(412, 'version.stale', 'Precondition Failed');
    const body = (await request.json()) as Partial<Canvas>;
    if (body.isProtected === false && c.isProtected && me().role !== 'owner') return problem(403, 'protected', 'Only the owner can remove protection');
    Object.assign(c, body, { version: c.version + 1 });
    return HttpResponse.json(c);
  }),

  http.delete(`${BASE}/workspaces/:ws/canvases/:cid`, async ({ params }) => {
    if (!manages()) return problem(403, 'role.insufficient', 'Forbidden');
    const c = db.canvases.find((x) => x.id === params.cid);
    if (!c) return problem(404, 'not_found', 'Not found');
    if (c.isProtected && me().role !== 'owner') return problem(403, 'protected', 'Protected');
    db.canvases = db.canvases.filter((x) => x.id !== c.id);
    db.placements = db.placements.filter((x) => x.canvasId !== c.id);
    db.shapes = db.shapes.filter((x) => x.canvasId !== c.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/workspaces/:ws/canvases/:cid/lock`, async ({ params }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const c = db.canvases.find((x) => x.id === params.cid);
    if (!c) return problem(404, 'not_found', 'Not found');
    c.lock = { userId: me().userId, lockedAt: new Date().toISOString() };
    c.version++;
    return HttpResponse.json(c);
  }),

  http.delete(`${BASE}/workspaces/:ws/canvases/:cid/lock`, async ({ params }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const c = db.canvases.find((x) => x.id === params.cid);
    if (!c) return problem(404, 'not_found', 'Not found');
    c.lock = null;
    c.version++;
    return HttpResponse.json(c);
  }),

  http.get(`${BASE}/workspaces/:ws/canvases/:cid/view`, async ({ params }) => {
    await delay(120);
    const view = buildView(params.cid as string);
    return view ? HttpResponse.json(view) : problem(404, 'canvas.not_found', 'Not found');
  }),

  http.get(`${BASE}/workspaces/:ws/areas/:aid/canvas`, async ({ params }) => {
    await delay(100);
    let c = db.canvases.find((x) => x.areaId === params.aid);
    const area = db.areas.find((a) => a.id === params.aid);
    if (!area) return problem(404, 'area.not_found', 'Not found');
    if (!c) {
      // created on first open, with the area's members pre-placed in a grid
      const created: Canvas = { ...db.canvases[0]!, id: newId('c'), kind: 'area', areaId: area.id, name: area.name, isProtected: false, settings: { hiddenLinkKinds: [] }, version: 1 };
      db.canvases.push(created);
      db.nodes.filter((n) => n.areaId === area.id).forEach((n, i) => placeItem(created.id, 'node', n.id, 300 + (i % 3) * 320, 120 + Math.floor(i / 3) * 170));
      c = created;
    }
    const view = buildView(c.id);
    return view ? HttpResponse.json(view) : problem(404, 'canvas.not_found', 'Not found');
  }),

  http.post(`${BASE}/workspaces/:ws/canvases/:cid/operations`, async ({ params, request }) => {
    await delay(60);
    const canvas = db.canvases.find((c) => c.id === params.cid);
    if (!canvas || !canSeeCanvas(canvas)) return problem(404, 'canvas.not_found', 'Not found');
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    if (canvas.lock) return problem(423, 'canvas.locked', 'This canvas is locked. Unlock it to edit.');
    const { operations } = (await request.json()) as { operations: CanvasOperation[] };
    // all or nothing, like the real API: roll the whole batch back if one operation fails
    const snapshot = structuredClone({ placements: db.placements, shapes: db.shapes, linkOverrides: db.linkOverrides, nodes: db.nodes });
    try {
      const results = operations.map((op, i) => applyOperation(canvas.id, op, i));
      return HttpResponse.json({ results, view: buildView(canvas.id) });
    } catch (e) {
      Object.assign(db, snapshot);
      return problem(409, 'canvas.invalid_operation', e instanceof Error ? e.message : 'Invalid operation');
    }
  }),

  http.get(`${BASE}/workspaces/:ws/nodes`, async ({ request }) => {
    await delay(80);
    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.toLowerCase();
    const category = url.searchParams.get('category');
    const items = db.nodes
      .filter((n) => (!q || n.name.toLowerCase().includes(q) || n.slug.includes(q)) && (!category || n.category === category))
      .map(outNode);
    return HttpResponse.json({ items, nextCursor: null });
  }),

  http.post(`${BASE}/workspaces/:ws/nodes`, async ({ request }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const body = (await request.json()) as { name: string; category: InvNode['category']; type?: string; areaId?: string; description?: string; placeOn?: { canvasId: string; x?: number; y?: number; parentPlacementId?: string } };
    if (me().role === 'editor' && !body.placeOn) return problem(422, 'node.place_on_required', 'Editors must place new nodes on a canvas');
    const slugBase = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'node';
    let slug = slugBase;
    for (let i = 2; db.nodes.some((n) => n.slug === slug); i++) slug = `${slugBase}-${i}`;
    const n: InvNode = {
      id: newId('n'), slug, name: body.name, category: body.category, type: body.type ?? 'builtin.generic', icon: null,
      description: body.description ?? '', areaId: body.areaId ?? null, properties: [],
      health: { status: 'unknown', source: 'manual', message: null, checkedAt: null }, isProtected: false,
      createdBy: me().userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1,
    };
    db.nodes.push(n);
    if (body.placeOn) placeItem(body.placeOn.canvasId, 'node', n.id, body.placeOn.x ?? 0, body.placeOn.y ?? 0, { parentPlacementId: body.placeOn.parentPlacementId ?? null });
    return HttpResponse.json(outNode(n), { status: 201 });
  }),

  http.patch(`${BASE}/workspaces/:ws/nodes/:id`, async ({ params, request }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const n = db.nodes.find((x) => x.id === params.id);
    if (!n) return problem(404, 'node.not_found', 'Not found');
    const body = (await request.json()) as Partial<InvNode>;
    if (body.areaId !== undefined && body.areaId !== n.areaId) reparent(n.id, body.areaId);
    Object.assign(n, body, { version: n.version + 1, updatedAt: new Date().toISOString() });
    return HttpResponse.json(outNode(n));
  }),

  http.put(`${BASE}/workspaces/:ws/nodes/:id/health`, async ({ params, request }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const n = db.nodes.find((x) => x.id === params.id);
    if (!n) return problem(404, 'node.not_found', 'Not found');
    const body = (await request.json()) as { status: InvNode['health']['status']; message?: string };
    n.health = { status: body.status, source: 'manual', message: body.message ?? null, checkedAt: new Date().toISOString() };
    return HttpResponse.json(outNode(n));
  }),

  http.delete(`${BASE}/workspaces/:ws/nodes/:id`, async ({ params }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const id = params.id as string;
    const used = db.placements.filter((p) => p.item.type === 'node' && p.item.id === id);
    if (me().role === 'editor' && used.some((p) => !canSeeCanvas(db.canvases.find((c) => c.id === p.canvasId)!)))
      return problem(409, 'inventory.used_elsewhere', 'It is drawn on a canvas you cannot access');
    db.nodes = db.nodes.filter((n) => n.id !== id);
    db.links = db.links.filter((l) => l.sourceNodeId !== id && l.targetNodeId !== id);
    db.placements = db.placements.filter((p) => !(p.item.type === 'node' && p.item.id === id));
    db.notes = db.notes.filter((n) => !(n.target.type === 'node' && n.target.id === id));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/workspaces/:ws/nodes/:id/usage`, async ({ params }) => {
    const used = db.placements.filter((p) => p.item.type === 'node' && p.item.id === params.id).map((p) => db.canvases.find((c) => c.id === p.canvasId)!);
    const visible = used.filter(canSeeCanvas);
    return HttpResponse.json({
      canvases: visible.map((c) => ({ id: c.id, name: c.name })),
      hiddenCanvasCount: used.length - visible.length,
      linkCount: db.links.filter((l) => l.sourceNodeId === params.id || l.targetNodeId === params.id).length,
      noteCount: db.notes.filter((n) => n.target.type === 'node' && n.target.id === params.id).length,
    });
  }),

  http.get(`${BASE}/workspaces/:ws/notes`, async ({ request }) => {
    const nodeId = new URL(request.url).searchParams.get('nodeId');
    const items = db.notes.filter((n) => (nodeId ? n.target.type === 'node' && n.target.id === nodeId : n.target.type === 'workspace')).map(outNote);
    return HttpResponse.json({ items, nextCursor: null });
  }),

  http.get(`${BASE}/workspaces/:ws/areas`, async () => HttpResponse.json({ items: db.areas.map(outArea), nextCursor: null })),

  http.patch(`${BASE}/workspaces/:ws/areas/:id`, async ({ params, request }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const a = db.areas.find((x) => x.id === params.id);
    if (!a) return problem(404, 'area.not_found', 'Not found');
    Object.assign(a, (await request.json()) as Partial<Area>, { version: a.version + 1 });
    return HttpResponse.json(outArea(a));
  }),

  http.post(`${BASE}/workspaces/:ws/areas`, async ({ request }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const body = (await request.json()) as AreaCreate;
    if (me().role === 'editor' && !body.placeOn) return problem(422, 'inventory.place_on_required', 'Editors must place new areas on a canvas');
    const now = new Date().toISOString();
    const a: Area = {
      id: newId('a'), parentId: body.parentId ?? null, name: body.name, kind: body.kind ?? 'custom', color: body.color ?? 'yellow',
      cidr: body.cidr ?? null, vlanId: body.vlanId ?? null, description: body.description ?? '', properties: body.properties ?? [],
      createdAt: now, updatedAt: now, version: 1,
    };
    db.areas.push(a);
    if (body.placeOn) {
      const po = body.placeOn;
      placeItem(po.canvasId, 'area', a.id, po.x ?? 0, po.y ?? 0, { width: po.width ?? 480, height: po.height ?? 320, parentPlacementId: po.parentPlacementId ?? null });
    }
    return HttpResponse.json(outArea(a), { status: 201 });
  }),

  http.delete(`${BASE}/workspaces/:ws/areas/:id`, async ({ params }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const id = params.id as string;
    if (!db.areas.some((a) => a.id === id)) return problem(404, 'not_found', 'Not found');
    // member nodes stay, without an area; their drawings leave the box (mirrors ON DELETE SET NULL + trigger)
    for (const n of db.nodes.filter((x) => x.areaId === id)) {
      reparent(n.id, null);
      n.areaId = null;
    }
    for (const box of db.placements.filter((p) => p.item.type === 'area' && p.item.id === id))
      for (const child of db.placements.filter((x) => x.parentPlacementId === box.id)) {
        child.parentPlacementId = null;
        child.x += box.x;
        child.y += box.y;
      }
    db.placements = db.placements.filter((p) => !(p.item.type === 'area' && p.item.id === id));
    db.canvases = db.canvases.filter((c) => c.areaId !== id);
    db.areas = db.areas.filter((a) => a.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/workspaces/:ws/links`, async ({ request }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const body = (await request.json()) as LinkCreate;
    if (body.sourceNodeId === body.targetNodeId) return problem(422, 'validation', 'A link needs two different nodes');
    if (!db.nodes.some((n) => n.id === body.sourceNodeId) || !db.nodes.some((n) => n.id === body.targetNodeId)) return problem(404, 'not_found', 'Not found');
    const now = new Date().toISOString();
    const l: Link = {
      id: newId('l'), sourceNodeId: body.sourceNodeId, targetNodeId: body.targetNodeId, kind: body.kind, directed: body.directed ?? false,
      label: body.label ?? '', sourcePort: body.sourcePort ?? null, targetPort: body.targetPort ?? null, properties: body.properties ?? [],
      health: { status: 'unknown', source: 'manual', message: null, checkedAt: null }, createdAt: now, updatedAt: now, version: 1,
    };
    db.links.push(l);
    return HttpResponse.json(l, { status: 201 });
  }),

  http.patch(`${BASE}/workspaces/:ws/links/:id`, async ({ params, request }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const l = db.links.find((x) => x.id === params.id);
    if (!l) return problem(404, 'not_found', 'Not found');
    Object.assign(l, (await request.json()) as LinkUpdate, { version: l.version + 1, updatedAt: new Date().toISOString() });
    return HttpResponse.json(l);
  }),

  http.delete(`${BASE}/workspaces/:ws/links/:id`, async ({ params }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    if (!db.links.some((l) => l.id === params.id)) return problem(404, 'not_found', 'Not found');
    db.links = db.links.filter((l) => l.id !== params.id);
    db.linkOverrides = db.linkOverrides.filter((o) => o.linkId !== params.id);
    db.notes = db.notes.filter((n) => !(n.target.type === 'link' && n.target.id === params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/workspaces/:ws/notes`, async ({ request }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const body = (await request.json()) as NoteCreate;
    if (body.target.type === 'workspace' && me().role === 'editor') return problem(403, 'role.insufficient', 'Only owners and admins can add workspace notes');
    const now = new Date().toISOString();
    const n: DbNote = {
      id: newId('t'), target: body.target, kind: body.kind ?? 'note', title: body.title ?? '', body: body.body, isSensitive: body.isSensitive ?? false,
      color: body.color ?? 'default', createdBy: me().userId, updatedBy: me().userId, createdAt: now, updatedAt: now, version: 1,
    };
    db.notes.push(n);
    if (body.placeOn) placeItem(body.placeOn.canvasId, 'note', n.id, body.placeOn.x ?? 0, body.placeOn.y ?? 0, { width: body.placeOn.width ?? 220 });
    return HttpResponse.json(outNote(n), { status: 201 });
  }),

  http.patch(`${BASE}/workspaces/:ws/notes/:id`, async ({ params, request }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    const n = db.notes.find((x) => x.id === params.id);
    if (!n) return problem(404, 'not_found', 'Not found');
    Object.assign(n, (await request.json()) as NoteUpdate, { version: n.version + 1, updatedAt: new Date().toISOString(), updatedBy: me().userId });
    return HttpResponse.json(outNote(n));
  }),

  http.delete(`${BASE}/workspaces/:ws/notes/:id`, async ({ params }) => {
    if (!canEdit()) return problem(403, 'role.insufficient', 'Forbidden');
    if (!db.notes.some((n) => n.id === params.id)) return problem(404, 'not_found', 'Not found');
    db.notes = db.notes.filter((n) => n.id !== params.id);
    db.placements = db.placements.filter((p) => !(p.item.type === 'note' && p.item.id === params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/workspaces/:ws/members`, async () => {
    await delay(80);
    return HttpResponse.json({ items: db.members.map(memberOut) });
  }),

  http.get(`${BASE}/workspaces/:ws/links`, async () => HttpResponse.json({ items: db.links satisfies Link[], nextCursor: null })),

  // ───────── share links (WP-12) ─────────
  http.get(`${BASE}/workspaces/:ws/canvases/:cid/share-links`, async ({ params }) => {
    await delay(60);
    if (!['owner', 'admin'].includes(me().role)) return problem(403, 'role.insufficient', 'Forbidden');
    return HttpResponse.json({ items: shareLinks.filter((l) => l.canvasId === params.cid).map(({ token: _t, password: _p, ...l }) => l) });
  }),
  http.post(`${BASE}/workspaces/:ws/canvases/:cid/share-links`, async ({ params, request }) => {
    await delay(120);
    if (!['owner', 'admin'].includes(me().role)) return problem(403, 'role.insufficient', 'Forbidden');
    const body = (await request.json()) as { label?: string; password?: string; expiresAt?: string };
    const token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
    const link = {
      id: newId('sl'), canvasId: String(params.cid), label: body.label ?? '', hasPassword: !!body.password, password: body.password ?? null,
      expiresAt: body.expiresAt ?? null, revokedAt: null as string | null, createdBy: me().userId, createdAt: new Date().toISOString(), lastUsedAt: null as string | null, useCount: 0, token,
    };
    shareLinks.push(link);
    audit('share_link.create', 'share_link', link.id);
    const { token: _t, password: _p, ...shareLink } = link;
    return HttpResponse.json({ shareLink, token, url: `${location.origin}/share/${token}` }, { status: 201 });
  }),
  http.patch(`${BASE}/workspaces/:ws/share-links/:id`, async ({ params, request }) => {
    await delay(80);
    const l = shareLinks.find((x) => x.id === params.id);
    if (!l) return problem(404, 'not_found', 'Not found');
    const body = (await request.json()) as { label?: string; password?: string | null; expiresAt?: string | null };
    if (body.label !== undefined) l.label = body.label;
    if (body.password !== undefined) {
      l.password = body.password;
      l.hasPassword = !!body.password;
    }
    if (body.expiresAt !== undefined) l.expiresAt = body.expiresAt;
    audit('share_link.update', 'share_link', l.id);
    const { token: _t, password: _p, ...out } = l;
    return HttpResponse.json(out);
  }),
  http.delete(`${BASE}/workspaces/:ws/share-links/:id`, async ({ params }) => {
    await delay(80);
    const l = shareLinks.find((x) => x.id === params.id);
    if (!l) return problem(404, 'not_found', 'Not found');
    l.revokedAt = new Date().toISOString();
    audit('share_link.revoke', 'share_link', l.id);
    return new HttpResponse(null, { status: 204 });
  }),
  // guest side
  http.get(`${BASE}/share/:token`, async ({ params }) => {
    const l = liveLink(String(params.token));
    return l ? HttpResponse.json({ requiresPassword: l.hasPassword }) : problem(404, 'not_found', 'Not found');
  }),
  http.post(`${BASE}/share/:token/unlock`, async ({ params, request }) => {
    await delay(150);
    const l = liveLink(String(params.token));
    if (!l) return problem(404, 'not_found', 'Not found');
    const body = (await request.json().catch(() => ({}))) as { password?: string };
    if (l.hasPassword && body.password !== l.password) return problem(401, 'share.password', 'Wrong password');
    unlocked.add(l.token);
    l.useCount += 1;
    l.lastUsedAt = new Date().toISOString();
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${BASE}/share/:token/view`, async ({ params }) => {
    await delay(80);
    const l = liveLink(String(params.token));
    if (!l) return problem(404, 'not_found', 'Not found');
    if (!unlocked.has(l.token)) return problem(401, 'auth.required', 'Unauthorized');
    guest = true;
    try {
      const v = buildView(l.canvasId);
      if (!v) return problem(404, 'not_found', 'Not found');
      // guests see health colors only, and nothing sensitive
      v.nodes = v.nodes.map((n) => ({ ...n, health: { status: n.health.status, source: n.health.source }, createdBy: null }));
      v.notes = v.notes.filter((n) => !n.isSensitive);
      return HttpResponse.json(v);
    } finally {
      guest = false;
    }
  }),

  // ───────── audit log (WP-13) ─────────
  http.get(`${BASE}/workspaces/:ws/audit-log`, async ({ request }) => {
    await delay(80);
    if (!['owner', 'admin'].includes(me().role)) return problem(403, 'role.insufficient', 'Forbidden');
    const q = new URL(request.url).searchParams;
    const action = q.get('action');
    const actorId = q.get('actorId');
    const since = q.get('since');
    const items = auditLog.filter((e) => (!action || e.action.startsWith(action)) && (!actorId || e.actor.id === actorId) && (!since || e.createdAt >= since));
    return HttpResponse.json({ items: [...items].reverse(), nextCursor: null });
  }),
];

export { currentRole };
export type { Placement };
