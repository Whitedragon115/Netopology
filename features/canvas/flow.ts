import type { Edge, Node } from '@xyflow/react';
import type { Area, CanvasView, InvNode, Link, LinkOverride, Note, Placement, Shape } from '@/lib/api/types';
import type { Selection } from '../workspace/store';

/**
 * Turns a CanvasView (API) into React Flow nodes and edges.
 * - React Flow node id = placement id; inventory ids live in `data`.
 * - Area placements become boxes (expanded) or cards (collapsed); children of a collapsed box are hidden
 *   and their links are re-routed to the area card.
 * - On an area canvas, linked nodes outside the area become "ghost" markers.
 */
export type InvNodeData = { node: InvNode };
export type AreaData = { area: Area; placement: Placement; memberCount: number; health: InvNode['health']['status'] };
export type GhostData = { node: InvNode; areaName: string | null };
export type NoteData = { note: Note; width: number };
export type ShapeData = { shape: Shape };
export type LinkData = { link: Link; override?: LinkOverride };

export type FlowNode =
  | Node<InvNodeData, 'inv'>
  | Node<AreaData, 'areaBox'>
  | Node<AreaData, 'areaCard'>
  | Node<GhostData, 'ghost'>
  | Node<NoteData, 'note'>
  | Node<ShapeData, 'shape'>;
export type FlowEdge = Edge<LinkData, 'link'>;

const SEVERITY = ['healthy', 'unknown', 'degraded', 'down'] as const;

/**
 * @param selection   what the store has selected (drives the `selected` flag; React Flow's own selection is off)
 * @param linkSource  inventory node id picked as the start of a new link (link tool)
 * @param multi       React Flow ids of a multi-selection (box select, Ctrl+A, paste)
 */
export function buildFlow(view: CanvasView, selection: Selection, linkSource: string | null = null, multi: string[] = []) {
  const picked = new Set(multi);
  const isSel = (type: NonNullable<Selection>['type'], id: string, flowId: string) => picked.has(flowId) || (selection?.type === type && selection.id === id);
  const byId = new Map(view.placements.map((p) => [p.id, p]));
  const nodesById = new Map(view.nodes.map((n) => [n.id, n]));
  const areasById = new Map(view.areas.map((a) => [a.id, a]));
  const notesById = new Map(view.notes.map((n) => [n.id, n]));

  // a placement is hidden when any ancestor area box is collapsed; remember which card it collapses into
  const collapsedAncestor = (p: Placement): Placement | null => {
    let cur = p.parentPlacementId ? byId.get(p.parentPlacementId) : undefined;
    let found: Placement | null = null;
    while (cur) {
      if (cur.collapsed) found = cur;
      cur = cur.parentPlacementId ? byId.get(cur.parentPlacementId) : undefined;
    }
    return found;
  };
  const depth = (p: Placement): number => (p.parentPlacementId && byId.get(p.parentPlacementId) ? 1 + depth(byId.get(p.parentPlacementId)!) : 0);

  const nodes: FlowNode[] = [];
  const anchorOfNode = new Map<string, string>(); // inventory node id -> flow node id that links attach to

  // parents must come before children in React Flow
  const ordered = [...view.placements].sort((a, b) => depth(a) - depth(b));
  for (const p of ordered) {
    const parentId = p.parentPlacementId && byId.has(p.parentPlacementId) ? p.parentPlacementId : undefined;
    const hiddenBy = collapsedAncestor(p);
    const base = { id: p.id, position: { x: p.x, y: p.y }, parentId, hidden: !!hiddenBy };
    if (p.item.type === 'area') {
      const area = areasById.get(p.item.id);
      if (!area) continue;
      const members = view.nodes.filter((n) => n.areaId === area.id);
      const health = members.reduce<InvNode['health']['status']>(
        (w, n) => (SEVERITY.indexOf(n.health.status) > SEVERITY.indexOf(w) ? n.health.status : w),
        'healthy',
      );
      const data: AreaData = { area, placement: p, memberCount: members.length, health };
      const selected = isSel('area', area.id, p.id);
      if (p.collapsed) nodes.push({ ...base, type: 'areaCard', data, zIndex: 2, selected });
      else nodes.push({ ...base, type: 'areaBox', data, zIndex: -1, selected, style: { width: p.width ?? 600, height: p.height ?? 400 } });
    } else if (p.item.type === 'node') {
      const node = nodesById.get(p.item.id);
      if (!node) continue;
      nodes.push({
        ...base,
        type: 'inv',
        data: { node },
        selected: isSel('node', node.id, p.id),
        className: linkSource === node.id ? 'is-link-source' : undefined,
        zIndex: 3,
      });
      anchorOfNode.set(node.id, hiddenBy ? hiddenBy.id : p.id);
    } else if (p.item.type === 'note') {
      const note = notesById.get(p.item.id);
      if (note) nodes.push({ ...base, type: 'note', data: { note, width: p.width ?? 220 }, selected: isSel('note', note.id, p.id), zIndex: 1 });
    }
  }

  // free shapes: text above the drawing, outlines behind the cards (so the cards stay clickable)
  for (const s of view.shapes) {
    nodes.push({
      id: `shape:${s.id}`,
      type: 'shape',
      position: { x: s.x, y: s.y },
      data: { shape: s },
      selected: isSel('shape', s.id, `shape:${s.id}`),
      zIndex: s.kind === 'text' ? 4 : 0,
      style: { width: s.width ?? undefined, height: s.kind === 'text' ? undefined : (s.height ?? undefined) },
    });
  }

  // ghosts: linked nodes outside an area canvas, stacked to the left of the drawing
  if (view.canvas.kind === 'area') {
    const outside = view.nodes.filter((n) => !anchorOfNode.has(n.id));
    const placedXs = nodes.filter((n) => n.type === 'inv').map((n) => n.position.x);
    const placedYs = nodes.filter((n) => n.type === 'inv').map((n) => n.position.y);
    const left = (placedXs.length ? Math.min(...placedXs) : 0) - 300;
    const top = placedYs.length ? (Math.min(...placedYs) + Math.max(...placedYs)) / 2 : 0;
    outside.forEach((n, i) => {
      const id = `ghost:${n.id}`;
      nodes.push({
        id,
        type: 'ghost',
        position: { x: left, y: top + i * 70 },
        data: { node: n, areaName: n.areaId ? (areasById.get(n.areaId)?.name ?? null) : null },
        draggable: false,
        selectable: false,
      });
      anchorOfNode.set(n.id, id);
    });
  }

  const edges: FlowEdge[] = [];
  const overrides = new Map(view.linkOverrides.map((o) => [o.linkId, o]));
  const seen = new Set<string>();
  for (const link of view.links) {
    const s = anchorOfNode.get(link.sourceNodeId);
    const t = anchorOfNode.get(link.targetNodeId);
    if (!s || !t || s === t) continue;
    const key = `${s}|${t}|${link.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: link.id, source: s, target: t, type: 'link', data: { link, override: overrides.get(link.id) }, zIndex: 0 });
  }
  return { nodes, edges };
}
