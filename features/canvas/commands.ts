'use client';

import type { CanvasView } from '@/lib/api/types';
import { useUi, type Selection } from '../workspace/store';
import { copyItems, paste } from './clipboard';
import type { Editor } from './editor';
import { grouped } from './history';

/**
 * Canvas commands shared by the keyboard (useCanvasKeys) and the right-click menu (CanvasMenu).
 * They work on React Flow node ids: a placement id, or `shape:<id>` for a free drawing.
 */

const SHAPE = 'shape:';

/** The React Flow ids the user has picked: the multi-selection, or the single selection. */
export function pickedIds(view: CanvasView): string[] {
  const { multi, selection } = useUi.getState();
  if (multi.length) return multi;
  return selection ? flowIdOf(view, selection) : [];
}

export function flowIdOf(view: CanvasView, sel: NonNullable<Selection>): string[] {
  if (sel.type === 'shape') return [SHAPE + sel.id];
  if (sel.type === 'link') return [];
  const p = view.placements.find((x) => x.item.type === sel.type && x.item.id === sel.id);
  return p ? [p.id] : [];
}

/** Select what a React Flow id points at (several ids: a multi-selection). */
export function selectFlowIds(view: CanvasView, ids: string[]) {
  const ui = useUi.getState();
  if (ids.length > 1) return ui.setMulti(ids);
  const id = ids[0];
  if (!id) return ui.select(null);
  if (id.startsWith(SHAPE)) return ui.select({ type: 'shape', id: id.slice(SHAPE.length) });
  const p = view.placements.find((x) => x.id === id);
  if (p) ui.select({ type: p.item.type, id: p.item.id });
}

/** Take things off this canvas: nodes and area boxes are only removed here (they stay in the inventory); notes and drawings are deleted. */
export function removeFlowIds(editor: Editor, view: CanvasView, ids: string[]) {
  grouped(ids.length > 1 ? `Delete ${ids.length} items` : 'Delete', () => {
    for (const id of ids) {
      if (id.startsWith(SHAPE)) {
        const s = view.shapes.find((x) => x.id === id.slice(SHAPE.length));
        if (s) editor.deleteShape(s);
        continue;
      }
      const p = view.placements.find((x) => x.id === id);
      if (!p) continue;
      if (p.item.type === 'note') editor.deleteNote(p.item.id);
      else editor.removePlacement(p, p.item.type === 'node' ? 'Remove node from canvas' : 'Remove area box');
    }
  });
  useUi.getState().select(null);
}

export function copyPicked(view: CanvasView, toast: (m: string) => void) {
  const ids = pickedIds(view);
  if (!ids.length) return;
  const n = copyItems(view, ids);
  toast(n ? `Copied ${n} item${n > 1 ? 's' : ''}. Ctrl+V to paste.` : 'Area boxes and links are not copied. Select nodes, notes or drawings.');
}

export function pasteHere(editor: Editor, view: CanvasView, at?: { x: number; y: number }) {
  const { ids, single } = paste(editor, view, at);
  if (ids.length > 1) useUi.getState().setMulti(ids);
  else if (single) useUi.getState().select(single);
}

export function selectAll(view: CanvasView) {
  const ids = [...view.placements.map((p) => p.id), ...view.shapes.map((s) => SHAPE + s.id)];
  selectFlowIds(view, ids);
}
