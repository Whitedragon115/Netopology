import { uuid } from '@/lib/api/ids';
/**
 * In-memory mock database used by the MSW handlers until the Go backend exists.
 * Seeded with the author's homelab. It applies the same rules as the real API
 * (redaction per role, links shown when both ends are placed, area boxes, ...)
 * so the UI is built against realistic behavior. Resets on page reload.
 */
import type { Area, Canvas, Field, InvNode, Link, LinkOverride, Note, Placement, Role, Shape } from '@/lib/api/types';

const now = new Date('2026-10-13T09:00:00Z').toISOString();

export type MockRole = 'owner' | 'editor' | 'viewer';
export interface DbPlacement extends Placement {
  canvasId: string;
}
export interface DbLinkOverride extends LinkOverride {
  canvasId: string;
}
export interface DbShape extends Shape {
  canvasId: string;
}
export interface DbNote extends Note {
  placement?: { canvasId: string; x: number; y: number; width: number };
}

const ip = (v: string): Field => ({ key: 'ip', label: 'IP address', value: v, sensitive: true });
const health = (status: InvNode['health']['status'], message: string | null = null): InvNode['health'] => ({
  status,
  source: 'manual',
  message,
  checkedAt: now,
});

function node(
  id: string,
  name: string,
  category: InvNode['category'],
  type: string,
  areaId: string | null,
  description: string,
  properties: Field[],
  status: InvNode['health']['status'] = 'healthy',
  message: string | null = null,
): InvNode {
  return {
    id,
    slug: id.replace(/^n-/, ''),
    name,
    category,
    type,
    icon: null,
    description,
    areaId,
    properties,
    health: health(status, message),
    isProtected: false,
    createdBy: 'u-alice',
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

export const db = {
  workspaces: [
    { id: 'ws-home', slug: 'home-lab', name: 'Home lab', description: '', isProtected: false, version: 1 },
    { id: 'ws-labb', slug: 'lab-b', name: 'Lab B', description: '', isProtected: false, version: 1 },
  ],
  /** Accounts that exist on the server but are not members of the demo workspace. */
  extraAccounts: [{ userId: 'u-finn', username: 'finn', displayName: 'Finn', signin: ['Password'] }] as { userId: string; username: string; displayName: string; signin: string[] }[],
  /** Per-account server state the mock keeps (status, email, server role overrides). */
  accountState: {} as Record<string, { status?: 'active' | 'disabled'; email?: string | null; instanceRole?: 'owner' | 'admin' | 'member' }>,
  instanceSettings: { sessionTtlHours: 168, oauthAutoLinkByEmail: true },
  members: [
    { userId: 'u-alice', username: 'alice', displayName: 'Alice', role: 'owner' as Role, canViewSensitive: true, canvasIds: [] as string[], signin: ['Password', 'Google'] },
    { userId: 'u-bob', username: 'bob', displayName: 'Bob', role: 'admin' as Role, canViewSensitive: true, canvasIds: [], signin: ['Discord'] },
    { userId: 'u-chen', username: 'chen', displayName: 'Chen', role: 'editor' as Role, canViewSensitive: false, canvasIds: ['c-physical', 'c-services'], signin: ['Password'] },
    { userId: 'u-dana', username: 'dana', displayName: 'Dana', role: 'viewer' as Role, canViewSensitive: true, canvasIds: [], signin: ['Google'] },
    { userId: 'u-eve', username: 'eve', displayName: 'Eve', role: 'viewer' as Role, canViewSensitive: false, canvasIds: [], signin: ['Password', 'Discord'] },
  ],
  areas: [
    { id: 'a-main', parentId: null, name: 'Main LAN', kind: 'network', color: 'yellow', cidr: '192.168.1.0/24', vlanId: null, description: '', properties: [], createdAt: now, updatedAt: now, version: 1 },
    { id: 'a-remote', parentId: null, name: 'Remote site (L2TP)', kind: 'site', color: 'teal', cidr: '10.20.0.0/24', vlanId: null, description: '', properties: [], createdAt: now, updatedAt: now, version: 1 },
  ] as Area[],
  nodes: [
    node('n-internet', 'Internet', 'external', 'builtin.internet', null, 'Public network', []),
    node('n-cloudflare', 'Cloudflare', 'external', 'builtin.cloud_service', null, 'Zone example.com', [
      { key: 'zone', label: 'Zone', value: 'example.com', sensitive: false },
      { key: 'account', label: 'Account ID', value: '9f2c41ab0e77', sensitive: true },
    ]),
    node('n-router', 'Router', 'network', 'builtin.router', 'a-main', 'OPNsense · gateway for Main LAN', [
      ip('192.168.1.1'),
      { key: 'model', label: 'Model', value: 'OPNsense 24.7', sensitive: false },
      { key: 'wan', label: 'WAN IP', value: '203.0.113.24', sensitive: true },
    ]),
    node('n-npm', 'Nginx Proxy Manager', 'service', 'builtin.reverse_proxy', 'a-main', 'Routes *.example.com', [
      ip('192.168.1.20'),
      { key: 'admin_port', label: 'Admin port', value: '81', sensitive: false },
    ]),
    node('n-dokploy', 'Dokploy host', 'compute', 'builtin.docker_host', 'a-main', 'Apps via Dokploy + Traefik', [ip('192.168.1.30')], 'degraded', 'Traefik container restarting (3x in 10 min)'),
    node('n-truenas', 'TrueNAS', 'storage', 'builtin.nas', 'a-main', 'tank · 12 TB · 61% used', [ip('192.168.1.40')]),
    node('n-dns', 'Local DNS', 'service', 'builtin.dns', 'a-main', 'AdGuard Home', [ip('192.168.1.53')]),
    node('n-l2tp', 'L2TP gateway', 'network', 'builtin.vpn_gateway', 'a-remote', 'L2TP endpoint', [ip('10.20.0.1')]),
    node('n-ptero', 'Pterodactyl', 'service', 'builtin.game_panel', 'a-remote', 'Manages game servers', [ip('10.20.0.10')]),
    node('n-vm1', 'Game VM 1', 'compute', 'builtin.vm', 'a-remote', 'Minecraft', [ip('10.20.0.21')]),
    node('n-vm2', 'Game VM 2', 'compute', 'builtin.vm', 'a-remote', 'Valheim', [ip('10.20.0.22')], 'down', 'No response for 4 min'),
    node('n-backup', 'Backup NAS', 'storage', 'builtin.nas', 'a-remote', 'Offsite backups', [], 'unknown', 'Never checked'),
  ],
  links: [] as Link[],
  notes: [] as DbNote[],
  canvases: [] as Canvas[],
  placements: [] as DbPlacement[],
  linkOverrides: [] as DbLinkOverride[],
  shapes: [] as DbShape[],
};

// ── links ──
const L = (id: string, s: string, t: string, kind: Link['kind'], label = '', down = false): Link => ({
  id,
  sourceNodeId: s,
  targetNodeId: t,
  kind,
  directed: kind === 'proxy_route' || kind === 'dns_dependency',
  label,
  sourcePort: null,
  targetPort: null,
  properties: [],
  health: health(down ? 'down' : 'unknown'),
  createdAt: now,
  updatedAt: now,
  version: 1,
});
db.links.push(
  L('l-wan', 'n-internet', 'n-router', 'physical', 'WAN'),
  L('l-https', 'n-internet', 'n-cloudflare', 'proxy_route', 'HTTPS'),
  L('l-cf-npm', 'n-cloudflare', 'n-npm', 'proxy_route'),
  L('l-r-npm', 'n-router', 'n-npm', 'physical'),
  L('l-r-dok', 'n-router', 'n-dokploy', 'physical'),
  L('l-r-nas', 'n-router', 'n-truenas', 'physical'),
  L('l-r-dns', 'n-router', 'n-dns', 'physical'),
  L('l-npm-dok', 'n-npm', 'n-dokploy', 'proxy_route'),
  L('l-dok-nas', 'n-dokploy', 'n-truenas', 'storage_mount', 'NFS'),
  L('l-npm-dns', 'n-npm', 'n-dns', 'dns_dependency'),
  L('l-vpn', 'n-router', 'n-l2tp', 'vpn_tunnel', 'L2TP'),
  L('l-gw-ptero', 'n-l2tp', 'n-ptero', 'physical'),
  L('l-gw-vm1', 'n-l2tp', 'n-vm1', 'physical'),
  L('l-gw-vm2', 'n-l2tp', 'n-vm2', 'physical', '', true),
  L('l-gw-backup', 'n-l2tp', 'n-backup', 'physical'),
  L('l-ptero-vm1', 'n-ptero', 'n-vm1', 'logical'),
);

// ── notes ──
const note = (id: string, nodeId: string | null, title: string, body: string, isSensitive = false): DbNote => ({
  id,
  target: nodeId ? { type: 'node', id: nodeId } : { type: 'canvas', id: 'c-physical' },
  kind: 'note',
  title,
  body,
  isSensitive,
  color: nodeId ? 'default' : 'yellow',
  createdBy: 'u-alice',
  updatedBy: 'u-alice',
  createdAt: now,
  updatedAt: now,
  version: 1,
});
db.notes.push(
  note('t-reboot', 'n-router', 'Reboot window', 'Ask before rebooting: family streams on Fridays.'),
  note('t-admin', 'n-router', 'Admin access', 'Credentials live in the vault entry "router-admin".', true),
  note('t-cert', 'n-npm', 'Certificates', 'Wildcard cert for *.example.com renews via DNS challenge.'),
  { ...note('t-sticky', null, '', 'Ask before rebooting the router: family streams on Fridays.'), placement: { canvasId: 'c-physical', x: 1060, y: 40, width: 240 } },
);

// ── canvases & placements (x/y = top-left; children relative to their area box) ──
const canvas = (id: string, name: string, sortOrder: number, hiddenLinkKinds: Link['kind'][] = [], areaId: string | null = null, isProtected = false): Canvas => ({
  id,
  kind: areaId ? 'area' : 'tab',
  areaId,
  name,
  description: '',
  sortOrder,
  viewport: { x: 0, y: 0, zoom: 1 },
  settings: { hiddenLinkKinds },
  isProtected,
  lock: null,
  createdAt: now,
  updatedAt: now,
  version: 1,
});
db.canvases.push(
  canvas('c-physical', 'Physical', 0, [], null, true),
  canvas('c-services', 'Services', 1, ['physical']),
  canvas('c-traffic', 'Public traffic path', 2, ['physical', 'storage_mount', 'dns_dependency']),
  canvas('c-area-remote', 'Remote site (L2TP)', 0, [], 'a-remote'),
);

/** New ids are UUIDs, like the real API (the client's id layer, lib/api/ids.ts, relies on it). */
export const newId = (_prefix: string) => uuid();
function place(canvasId: string, type: 'node' | 'area' | 'note', id: string, x: number, y: number, extra: Partial<DbPlacement> = {}) {
  const p: DbPlacement = { id: newId('p'), canvasId, item: { type, id }, parentPlacementId: null, x, y, width: null, height: null, zIndex: 0, collapsed: false, style: {}, ...extra };
  db.placements.push(p);
  return p;
}

// Physical
place('c-physical', 'node', 'n-cloudflare', 10, 60);
place('c-physical', 'node', 'n-internet', 10, 260);
const mainBox = place('c-physical', 'area', 'a-main', 320, 30, { width: 700, height: 520 });
for (const [id, x, y] of [['n-npm', 50, 80], ['n-router', 50, 250], ['n-dns', 420, 80], ['n-dokploy', 420, 250], ['n-truenas', 420, 410]] as const)
  place('c-physical', 'node', id, x, y, { parentPlacementId: mainBox.id });
const remoteBox = place('c-physical', 'area', 'a-remote', 380, 660, { width: 720, height: 470, collapsed: true });
for (const [id, x, y] of [['n-l2tp', 60, 190], ['n-ptero', 430, 70], ['n-vm1', 430, 200], ['n-vm2', 430, 330], ['n-backup', 60, 330]] as const)
  place('c-physical', 'node', id, x, y, { parentPlacementId: remoteBox.id });
place('c-physical', 'note', 't-sticky', 1060, 40, { width: 240 });
// Services
for (const [id, x, y] of [['n-cloudflare', 20, 150], ['n-npm', 360, 150], ['n-dokploy', 720, 60], ['n-truenas', 720, 270], ['n-dns', 360, 340]] as const) place('c-services', 'node', id, x, y);
// Public traffic path
for (const [id, x, y] of [['n-internet', 20, 150], ['n-cloudflare', 330, 150], ['n-npm', 640, 150], ['n-dokploy', 980, 150]] as const) place('c-traffic', 'node', id, x, y);
// Inner canvas of the remote area
for (const [id, x, y] of [['n-l2tp', 300, 250], ['n-ptero', 700, 80], ['n-vm1', 700, 250], ['n-vm2', 700, 420], ['n-backup', 300, 420]] as const) place('c-area-remote', 'node', id, x, y);

export function placeItem(canvasId: string, type: 'node' | 'area' | 'note', id: string, x: number, y: number, extra: Partial<DbPlacement> = {}) {
  return place(canvasId, type, id, x, y, extra);
}

// ── mock accounts and session ──────────────────────────────────────────────
// Seeded accounts sign in with MOCK_PASSWORD (only those with 'Password' in `signin`; the others are
// Google/Discord-only, like on a real server). The session survives reloads (localStorage); the rest
// of the mock database resets on every reload.
//   ?as=owner|editor|viewer   sign in instantly as alice / chen / eve (dev shortcut)
//   ?mock=fresh               an empty server: first-run setup is shown
export const MOCK_PASSWORD = 'netopology-demo';
const SESSION_KEY = 'netopology.mock.session';
const FRESH_KEY = 'netopology.mock.fresh';
const SETUP_KEY = 'netopology.mock.setup';
const USER_FOR: Record<MockRole, string> = { owner: 'u-alice', editor: 'u-chen', viewer: 'u-eve' };

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: state is not remembered */
  }
}
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Runs once when the mock starts: applies URL switches and a setup completed earlier. */
export function bootMockSession() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('mock') === 'fresh') {
    store(FRESH_KEY, '1');
    store(SETUP_KEY, null);
    store(SESSION_KEY, null);
  }
  const as = params.get('as');
  if (as === 'owner' || as === 'editor' || as === 'viewer') {
    store(FRESH_KEY, null);
    store(SESSION_KEY, USER_FOR[as]);
  }
  // an account created through the mock's first-run setup takes the seeded owner's seat
  const done = read(SETUP_KEY);
  if (done) applySetup(JSON.parse(done) as SetupResult);
}

interface SetupResult {
  username: string;
  displayName: string;
  workspaceName?: string;
}
function applySetup(r: SetupResult) {
  const owner = db.members.find((m) => m.userId === 'u-alice')!;
  owner.username = r.username;
  owner.displayName = r.displayName || r.username;
  owner.signin = ['Password'];
  const first = db.workspaces[0];
  if (r.workspaceName && first) first.name = r.workspaceName;
}

export const needsSetup = () => read(FRESH_KEY) === '1';
export function completeSetup(r: SetupResult) {
  store(FRESH_KEY, null);
  store(SETUP_KEY, JSON.stringify(r));
  applySetup(r);
  store(SESSION_KEY, 'u-alice');
}
export const signIn = (userId: string) => store(SESSION_KEY, userId);
export const signOut = () => store(SESSION_KEY, null);

/** The signed-in member, or null (anonymous). */
export function currentMember() {
  if (needsSetup()) return null;
  const id = read(SESSION_KEY);
  return db.members.find((m) => m.userId === id) ?? null;
}
export function currentRole(): MockRole | null {
  const m = currentMember();
  return m ? (Object.entries(USER_FOR).find(([, id]) => id === m.userId)?.[0] as MockRole | undefined) ?? 'viewer' : null;
}
