'use client';

import { useEffect } from 'react';
import { defaultLinkKind } from '@/lib/domain';
import { useWorkspace } from '../workspace/context';
import { useUi, type Tool } from '../workspace/store';
import { copyPicked, pasteHere, pickedIds, removeFlowIds, selectAll } from './commands';
import type { Editor } from './editor';
import { useHistory } from './history';

/** Single-key tool shortcuts (shown in the toolbar tooltips). */
const TOOL_KEYS: Record<string, Tool> = {
  v: { kind: 'select' },
  h: { kind: 'pan' },
  n: { kind: 'node', category: 'generic' },
  a: { kind: 'area', color: 'yellow' },
  t: { kind: 'note', color: 'yellow' },
  s: { kind: 'shape', shape: 'text' },
};

export function typingIn(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Undo now: shared by the keyboard, the toolbar buttons and the right-click menu. */
export function runUndo(direction: 'undo' | 'redo', toast: (m: string) => void) {
  const label = useHistory.getState()[direction]();
  if (label) toast(`${direction === 'undo' ? 'Undid' : 'Redid'}: ${label}`);
}

/**
 * Canvas keyboard. Ignored while typing in a field.
 * - Space (hold): pan with the hand tool, back to the previous tool on release. Works read-only too.
 * - Ctrl+C copy, Ctrl+A select all (read-only too); Ctrl+V paste, Delete/Backspace remove,
 *   Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo and redo, V H N A L T S pick tools.
 */
export function useCanvasKeys({ editor, editing }: { editor: Editor; editing: boolean }) {
  const { view, toast } = useWorkspace();

  // Space: temporary pan
  useEffect(() => {
    let before: Tool | null = null;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || editing || typingIn(e.target) || useUi.getState().paletteOpen) return;
      // a focused button would be "clicked" by Space: pan instead
      e.preventDefault();
      const ui = useUi.getState();
      if (ui.tool.kind === 'pan' || before) return;
      before = ui.tool;
      ui.setTool({ kind: 'pan' });
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !before) return;
      useUi.getState().setTool(before);
      before = null;
    };
    const blur = () => {
      if (before) useUi.getState().setTool(before);
      before = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [editing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!view || editing || typingIn(e.target) || useUi.getState().paletteOpen || useUi.getState().section) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'c' && !window.getSelection()?.toString()) {
        e.preventDefault();
        copyPicked(view, toast);
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        selectAll(view);
        return;
      }

      const canEdit = view.viewer.canEdit && !view.canvas.lock;
      if (!canEdit) return;

      if (mod && key === 'v') {
        e.preventDefault();
        pasteHere(editor, view);
        return;
      }
      if (mod && key === 'z') {
        e.preventDefault();
        runUndo(e.shiftKey ? 'redo' : 'undo', toast);
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        runUndo('redo', toast);
        return;
      }
      if (mod || e.altKey) return;

      if (key === 'delete' || key === 'backspace') {
        const sel = useUi.getState().selection;
        if (sel?.type === 'link') {
          e.preventDefault();
          useUi.getState().select(null);
          editor.ops('Hide link', [{ op: 'link.override', linkId: sel.id, hidden: true }], [{ op: 'link.override', linkId: sel.id, hidden: false }]);
          toast('Link hidden on this canvas only. Delete it for good from the details panel.');
          return;
        }
        const ids = pickedIds(view);
        if (!ids.length) return;
        e.preventDefault();
        removeFlowIds(editor, view, ids);
        if (ids.some((id) => view.placements.find((p) => p.id === id && p.item.type !== 'note')))
          toast('Removed from this canvas. Nodes and areas stay in the inventory (Ctrl+Z to undo).');
        return;
      }

      const t = key === 'l' ? ({ kind: 'link', linkKind: defaultLinkKind(view.canvas.settings.hiddenLinkKinds) } as const) : TOOL_KEYS[key];
      if (t) {
        e.preventDefault();
        useUi.getState().setTool(t);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, editing, view, toast]);
}
