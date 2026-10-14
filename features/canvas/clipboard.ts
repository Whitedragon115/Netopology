'use client';

import type { CanvasView, InvNode, Note, Placement, Shape } from '@/lib/api/types';
import type { Selection } from '../workspace/store';
import { grouped } from './history';
import type { Editor } from './editor';

/**
 * Copy / paste inside the editor (Ctrl+C, Ctrl+V, right-click menu). An in-app clipboard: the system
 * clipboard is left alone. Positions are absolute canvas coordinates.
 *
 * A canvas shows each node at most once. Pasting a node this canvas doesn't show yet places that same
 * node (e.g. copied on another canvas); pasting one it already shows creates a new node, a copy.
 * Area boxes are not copied: an area is one inventory record with members, not a drawing.
 */
type ClipItem =
  | { kind: 'node'; node: InvNode; x: number; y: number }
  | { kind: 'note'; note: Note; x: number; y: number; width: number | null }
  | { kind: 'shape'; shape: Shape };

let clip: { items: ClipItem[]; pastes: number } | null = null;
const STEP = 32;

export const hasClip = () => !!clip?.items.length;

/** Absolute position of a placement (children are stored relative to their area box). */
export function absoluteOf(view: CanvasView, p: Placement) {
  const byId = new Map(view.placements.map((x) => [x.id, x]));
  let { x, y } = p;
  let parent = p.parentPlacementId ? byId.get(p.parentPlacementId) : undefined;
  while (parent) {
    x += parent.x;
    y += parent.y;
    parent = parent.parentPlacementId ? byId.get(parent.parentPlacementId) : undefined;
  }
  return { x, y };
}

/** Copy React Flow node ids (placement ids, `shape:<id>`). Returns how many things were copied. */
export function copyItems(view: CanvasView, flowIds: string[]): number {
  const items: ClipItem[] = [];
  for (const fid of flowIds) {
    if (fid.startsWith('shape:')) {
      const s = view.shapes.find((x) => x.id === fid.slice(6));
      if (s) items.push({ kind: 'shape', shape: s });
      continue;
    }
    const p = view.placements.find((x) => x.id === fid);
    if (!p) continue;
    const at = absoluteOf(view, p);
    if (p.item.type === 'node') {
      const n = view.nodes.find((x) => x.id === p.item.id);
      if (n) items.push({ kind: 'node', node: n, ...at });
    } else if (p.item.type === 'note') {
      const n = view.notes.find((x) => x.id === p.item.id);
      if (n && !n.redacted) items.push({ kind: 'note', note: n, ...at, width: p.width ?? null });
    }
  }
  clip = items.length ? { items, pastes: 0 } : clip;
  return items.length;
}

/**
 * Paste onto the open canvas: offset a little more each time, or with its top-left corner at `at`.
 * Returns what was pasted (React Flow ids, and the selection for one item). One undo step.
 */
export function paste(editor: Editor, view: CanvasView, at?: { x: number; y: number }): { ids: string[]; single: Selection } {
  if (!clip) return { ids: [], single: null };
  clip.pastes += 1;
  const xs = clip.items.map((i) => (i.kind === 'shape' ? i.shape.x : i.x));
  const ys = clip.items.map((i) => (i.kind === 'shape' ? i.shape.y : i.y));
  const dx = at ? at.x - Math.min(...xs) : STEP * clip.pastes;
  const dy = at ? at.y - Math.min(...ys) : STEP * clip.pastes;
  const placed = new Set(view.placements.filter((p) => p.item.type === 'node').map((p) => p.item.id));
  const canvasId = editor.canvasId;
  const ids: string[] = [];
  let single: Selection = null;
  const items = clip.items;

  grouped(items.length > 1 ? `Paste ${items.length} items` : 'Paste', () => {
    for (const it of items) {
      if (it.kind === 'shape') {
        const s = it.shape;
        const id = editor.createShape({
          op: 'shape.create',
          kind: s.kind,
          x: Math.round(s.x + dx),
          y: Math.round(s.y + dy),
          ...(s.width ? { width: s.width } : {}),
          ...(s.height ? { height: s.height } : {}),
          rotation: s.rotation,
          style: s.style,
          data: s.data,
        });
        ids.push(`shape:${id}`);
        single = { type: 'shape', id };
      } else if (it.kind === 'note') {
        const n = it.note;
        const r = editor.createNote({
          target: { type: 'canvas', id: canvasId },
          kind: n.kind,
          title: n.title,
          body: n.body,
          isSensitive: n.isSensitive,
          color: n.color,
          placeOn: { canvasId, x: Math.round(it.x + dx), y: Math.round(it.y + dy), ...(it.width ? { width: it.width } : {}) },
        });
        if (r.placementId) ids.push(r.placementId);
        single = { type: 'note', id: r.noteId };
      } else {
        const n = it.node;
        const x = Math.round(it.x + dx);
        const y = Math.round(it.y + dy);
        if (!placed.has(n.id)) {
          // the same node, drawn here for the first time (inside its area's box when that box is here)
          const box = n.areaId ? view.placements.find((p) => p.item.type === 'area' && p.item.id === n.areaId && !p.collapsed) : undefined;
          const origin = box ? absoluteOf(view, box) : { x: 0, y: 0 };
          const id = editor.placeItem(
            `Place ${n.name}`,
            box ? { op: 'place', item: { type: 'node', id: n.id }, parentPlacementId: box.id, x: Math.max(8, x - origin.x), y: Math.max(40, y - origin.y) } : { op: 'place', item: { type: 'node', id: n.id }, x, y },
            { node: n },
          );
          placed.add(n.id);
          ids.push(id);
          single = { type: 'node', id: n.id };
        } else {
          // already on this canvas: a new node with the same details (sensitive values you can't read are left out)
          const r = editor.createNode(
            {
              name: `${n.name} copy`,
              category: n.category,
              type: n.type,
              description: n.description,
              properties: n.properties.filter((f) => !f.redacted).map(({ redacted: _r, ...f }) => f),
              placeOn: { canvasId, x, y },
            },
            'Paste node',
          );
          if (r.placementId) ids.push(r.placementId);
          single = { type: 'node', id: r.nodeId };
        }
      }
    }
  });
  return { ids, single: ids.length === 1 ? single : null };
}
