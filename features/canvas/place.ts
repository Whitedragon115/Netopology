'use client';

import type { CanvasView, InvNode } from '@/lib/api/types';
import { absoluteOf } from './clipboard';
import type { Editor } from './editor';

/**
 * Draw an existing inventory node on the open canvas (Inventory page, toolbar inventory, drag and drop).
 * A canvas shows each node at most once: returns null when it is already here.
 * - `at` (absolute canvas point, where the card's center goes): inside the area box under it, if it's the node's own area.
 * - no `at`: inside its area's box when that box is drawn here, else to the right of the drawing.
 */
export function placeNode(editor: Editor, view: CanvasView, n: InvNode, at?: { x: number; y: number }): string | null {
  if (view.placements.some((p) => p.item.type === 'node' && p.item.id === n.id)) return null;
  const box = n.areaId ? view.placements.find((p) => p.item.type === 'area' && p.item.id === n.areaId && !p.collapsed) : undefined;
  const item = { type: 'node' as const, id: n.id };
  if (at) {
    const x = Math.round(at.x - 100);
    let y = Math.round(at.y - 35);
    // don't drop it exactly on top of a card that is already there
    const taken = view.placements.filter((p) => !p.parentPlacementId && p.item.type !== 'area');
    for (let i = 0; i < 12 && taken.some((p) => Math.abs(p.x - x) < 120 && Math.abs(p.y - y) < 60); i++) y += 90;
    if (box) {
      const o = absoluteOf(view, box);
      const inside = at.x > o.x && at.y > o.y && at.x < o.x + (box.width ?? 600) && at.y < o.y + (box.height ?? 400);
      if (inside) return editor.placeItem(`Place ${n.name}`, { op: 'place', item, parentPlacementId: box.id, x: Math.max(8, x - o.x), y: Math.max(40, y - o.y) }, { node: n });
    }
    return editor.placeItem(`Place ${n.name}`, { op: 'place', item, x, y }, { node: n });
  }
  if (box) return editor.placeItem(`Place ${n.name}`, { op: 'place', item, parentPlacementId: box.id, x: 40, y: 56 }, { node: n });
  const top = view.placements.filter((p) => !p.parentPlacementId);
  const right = top.length ? Math.max(...top.map((p) => p.x + (p.width ?? 240))) : 0;
  const y = top.length ? Math.min(...top.map((p) => p.y)) : 0;
  return editor.placeItem(`Place ${n.name}`, { op: 'place', item, x: Math.round(right + 80), y: Math.round(y) }, { node: n });
}

/** Drag and drop from the toolbar inventory onto the canvas. */
export const NODE_DRAG_TYPE = 'application/x-netopology-node';
