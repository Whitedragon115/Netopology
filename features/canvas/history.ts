'use client';

import { create } from 'zustand';

/**
 * Undo / redo for canvas edits (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y).
 *
 * Every edit made through the editor (features/canvas/editor.ts) pushes one entry. Undo and redo are
 * edits themselves: they show at once and save in the background (features/canvas/sync.ts).
 * Recreating something keeps its id in the app (lib/api/ids.ts binds the new server id to it), so
 * later entries keep working.
 *
 * History is per canvas and only lives in this tab: switching canvas or reloading clears it.
 */
export interface HistoryEntry {
  label: string;
  undo: () => void;
  redo: () => void;
}

interface HistoryState {
  canvasId: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  push: (e: HistoryEntry) => void;
  /** Drop an entry whose save failed (it never happened on the server). */
  forget: (e: HistoryEntry) => void;
  reset: (canvasId: string) => void;
  undo: () => string | null;
  redo: () => string | null;
}

const LIMIT = 100;
let group: HistoryEntry[] | null = null;

export const useHistory = create<HistoryState>((set, get) => ({
  canvasId: null,
  past: [],
  future: [],
  push: (e) => {
    if (group) group.push(e);
    else set((s) => ({ past: [...s.past.slice(-(LIMIT - 1)), e], future: [] }));
  },
  forget: (e) => set((s) => ({ past: s.past.filter((x) => x !== e), future: s.future.filter((x) => x !== e) })),
  reset: (canvasId) => {
    if (get().canvasId !== canvasId) set({ canvasId, past: [], future: [] });
  },
  // returns the label of what was undone (for the toast), or null if nothing happened
  undo: () => {
    const e = get().past.at(-1);
    if (!e) return null;
    set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, e] }));
    e.undo();
    return e.label;
  },
  redo: () => {
    const e = get().future.at(-1);
    if (!e) return null;
    set((s) => ({ future: s.future.slice(0, -1), past: [...s.past, e] }));
    e.redo();
    return e.label;
  },
}));

/** Run several edits as ONE undo step (paste, delete a multi-selection, …). */
export function grouped(label: string, fn: () => void) {
  if (group) return fn(); // already inside a group
  group = [];
  try {
    fn();
  } finally {
    const entries = group;
    group = null;
    if (entries.length)
      useHistory.getState().push({
        label,
        undo: () => [...entries].reverse().forEach((e) => e.undo()),
        redo: () => entries.forEach((e) => e.redo()),
      });
  }
}
