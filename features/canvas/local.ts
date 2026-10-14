import type {
  Area,
  AreaCreate,
  CanvasOperation,
  CanvasView,
  InvNode,
  Link,
  LinkCreate,
  Note,
  NoteCreate,
  NodeCreate,
  Placement,
  Shape,
} from '@/lib/api/types';

/**
 * The same changes the server makes, applied to a CanvasView in the browser so edits show at once
 * (features/canvas/sync.ts). Only needs to be close: the server's view replaces it when the save
 * returns. Every function returns a new view and never mutates its input.
 */

/** A canvas operation with the client id of what it creates (place, shape.create). Stripped before sending. */
export type LocalOp = CanvasOperation & { localId?: string };

const now = () => new Date().toISOString();
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Links hidden on a canvas, kept so "show it again" (undo) can draw them before the server answers. */
const hiddenLinks = new Map<string, Link>();

export function applyOpsLocal(view: CanvasView, ops: LocalOp[]): CanvasView {
  return ops.reduce(applyOne, view);
}

function applyOne(v: CanvasView, op: LocalOp): CanvasView {
  switch (op.op) {
    case 'place': {
      if (!op.localId || v.placements.some((p) => p.id === op.localId)) return v;
      const p: Placement = {
        id: op.localId,
        item: op.item,
        parentPlacementId: op.parentPlacementId ?? null,
        x: op.x ?? 0,
        y: op.y ?? 0,
        width: op.width ?? null,
        height: op.height ?? null,
        zIndex: op.zIndex ?? 0,
        collapsed: op.collapsed ?? false,
        style: op.style ?? {},
      };
      return { ...v, placements: [...v.placements, p] };
    }
    case 'update': {
      const { op: _op, placementId, ...patch } = op;
      const target = v.placements.find((p) => p.id === placementId);
      if (!target) return v;
      let next: CanvasView = { ...v, placements: v.placements.map((p) => (p.id === placementId ? { ...p, ...defined(patch) } : p)) };
      // dropping a node into (or out of) an area box changes its area in the inventory
      if (target.item.type === 'node' && patch.parentPlacementId !== undefined) {
        const box = patch.parentPlacementId ? v.placements.find((p) => p.id === patch.parentPlacementId) : undefined;
        const areaId = box?.item.type === 'area' ? box.item.id : null;
        next = { ...next, nodes: next.nodes.map((n) => (n.id === target.item.id ? { ...n, areaId } : n)) };
      }
      return next;
    }
    case 'remove':
      return removePlacements(v, [op.placementId]);
    case 'shape.create': {
      if (!op.localId || v.shapes.some((s) => s.id === op.localId)) return v;
      const s: Shape = {
        id: op.localId,
        kind: op.kind,
        x: op.x ?? 0,
        y: op.y ?? 0,
        width: op.width ?? null,
        height: op.height ?? null,
        rotation: op.rotation ?? 0,
        zIndex: op.zIndex ?? 0,
        style: op.style ?? {},
        data: op.data ?? {},
      };
      return { ...v, shapes: [...v.shapes, s] };
    }
    case 'shape.update': {
      const { op: _op, shapeId, ...patch } = op;
      return { ...v, shapes: v.shapes.map((s) => (s.id === shapeId ? { ...s, ...defined(patch) } : s)) };
    }
    case 'shape.delete':
      return { ...v, shapes: v.shapes.filter((s) => s.id !== op.shapeId) };
    case 'link.override': {
      let next = v;
      if (op.hidden === true) {
        const l = v.links.find((x) => x.id === op.linkId);
        if (l) hiddenLinks.set(l.id, l);
        next = { ...next, links: next.links.filter((x) => x.id !== op.linkId) };
      }
      if (op.hidden === false) {
        const l = hiddenLinks.get(op.linkId);
        if (l && !next.links.some((x) => x.id === l.id)) next = { ...next, links: [...next.links, l] };
      }
      // restyle / reroute: create or update this canvas's override
      const prev = v.linkOverrides.find((o) => o.linkId === op.linkId);
      const o = {
        linkId: op.linkId,
        hidden: op.hidden ?? prev?.hidden ?? false,
        style: op.style ?? prev?.style ?? {},
        waypoints: op.waypoints !== undefined ? op.waypoints : (prev?.waypoints ?? null),
      };
      return { ...next, linkOverrides: [...next.linkOverrides.filter((x) => x.linkId !== op.linkId), o] };
    }
    case 'link.reset':
      return { ...v, linkOverrides: v.linkOverrides.filter((x) => x.linkId !== op.linkId) };
  }
}

/** Remove placements; things drawn inside a removed box stay where they were on screen. */
export function removePlacements(v: CanvasView, ids: string[]): CanvasView {
  const gone = new Set(ids);
  const byId = new Map(v.placements.map((p) => [p.id, p]));
  const placements = v.placements
    .filter((p) => !gone.has(p.id))
    .map((p) => {
      let parent = p.parentPlacementId ? byId.get(p.parentPlacementId) : undefined;
      if (!parent || !gone.has(parent.id)) return p;
      let { x, y } = p;
      while (parent && gone.has(parent.id)) {
        x += parent.x;
        y += parent.y;
        parent = parent.parentPlacementId ? byId.get(parent.parentPlacementId) : undefined;
      }
      return { ...p, x, y, parentPlacementId: parent?.id ?? null };
    });
  return { ...v, placements };
}

// ───────── inventory items made in the browser (replaced by the server's copy on save) ─────────

const stamp = () => ({ createdAt: now(), updatedAt: now(), version: 1 });

export function localNode(id: string, b: NodeCreate): InvNode {
  return {
    id,
    slug: '',
    name: b.name,
    category: b.category,
    type: b.type ?? 'builtin.generic',
    icon: b.icon ?? null,
    description: b.description ?? '',
    areaId: b.areaId ?? null,
    properties: b.properties ?? [],
    health: { status: 'unknown', source: 'manual' },
    isProtected: b.isProtected ?? false,
    ...stamp(),
  };
}

export function localArea(id: string, b: AreaCreate): Area {
  return {
    id,
    parentId: b.parentId ?? null,
    name: b.name,
    kind: b.kind ?? 'custom',
    color: b.color ?? 'yellow',
    cidr: b.cidr ?? null,
    vlanId: b.vlanId ?? null,
    description: b.description ?? '',
    properties: b.properties ?? [],
    ...stamp(),
  };
}

export function localNote(id: string, b: NoteCreate): Note {
  return { id, target: b.target, kind: b.kind ?? 'note', title: b.title ?? '', body: b.body, isSensitive: b.isSensitive ?? false, color: b.color ?? 'default', ...stamp() };
}

export function localLink(id: string, b: LinkCreate): Link {
  return {
    id,
    sourceNodeId: b.sourceNodeId,
    targetNodeId: b.targetNodeId,
    kind: b.kind,
    directed: b.directed ?? false,
    label: b.label ?? '',
    sourcePort: b.sourcePort ?? null,
    targetPort: b.targetPort ?? null,
    properties: b.properties ?? [],
    health: { status: 'unknown', source: 'manual' },
    ...stamp(),
  };
}

/** The placement created together with an item (`placeOn`). */
export function localPlacement(id: string, item: Placement['item'], on: { parentPlacementId?: string; x?: number; y?: number; width?: number; height?: number }): Placement {
  return { id, item, parentPlacementId: on.parentPlacementId ?? null, x: on.x ?? 0, y: on.y ?? 0, width: on.width ?? null, height: on.height ?? null, zIndex: 0, collapsed: false, style: {} };
}

export function addItem(v: CanvasView, item: { node?: InvNode; area?: Area; note?: Note; link?: Link; placement?: Placement }): CanvasView {
  const next = { ...v };
  if (item.node && !v.nodes.some((n) => n.id === item.node!.id)) next.nodes = [...v.nodes, item.node];
  if (item.area && !v.areas.some((a) => a.id === item.area!.id)) next.areas = [...v.areas, item.area];
  if (item.note && !v.notes.some((n) => n.id === item.note!.id)) next.notes = [...v.notes, item.note];
  if (item.link && !v.links.some((l) => l.id === item.link!.id)) next.links = [...v.links, item.link];
  if (item.placement && !v.placements.some((p) => p.id === item.placement!.id)) next.placements = [...v.placements, item.placement];
  return next;
}

/** Delete an inventory item: it disappears from the canvas with its placements (and a node's links). */
export function removeItem(v: CanvasView, type: 'node' | 'area' | 'note' | 'link', id: string): CanvasView {
  if (type === 'link') return { ...v, links: v.links.filter((l) => l.id !== id) };
  const placementIds = v.placements.filter((p) => p.item.type === type && p.item.id === id).map((p) => p.id);
  let next = removePlacements(v, placementIds);
  if (type === 'node') next = { ...next, nodes: next.nodes.filter((n) => n.id !== id), links: next.links.filter((l) => l.sourceNodeId !== id && l.targetNodeId !== id) };
  if (type === 'area') next = { ...next, areas: next.areas.filter((a) => a.id !== id), nodes: next.nodes.map((n) => (n.areaId === id ? { ...n, areaId: null } : n)) };
  if (type === 'note') next = { ...next, notes: next.notes.filter((n) => n.id !== id) };
  return next;
}

export function patchItem(v: CanvasView, type: 'node' | 'area' | 'note' | 'link', id: string, patch: Record<string, unknown>): CanvasView {
  const p = defined(patch);
  if (type === 'node') return { ...v, nodes: v.nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) };
  if (type === 'area') return { ...v, areas: v.areas.map((a) => (a.id === id ? { ...a, ...p } : a)) };
  if (type === 'note') return { ...v, notes: v.notes.map((n) => (n.id === id ? { ...n, ...p } : n)) };
  return { ...v, links: v.links.map((l) => (l.id === id ? { ...l, ...p } : l)) };
}
