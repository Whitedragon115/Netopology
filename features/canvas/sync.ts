'use client';

import { create } from 'zustand';
import { ApiError } from '@/lib/api/client';
import type { CanvasView } from '@/lib/api/types';

/**
 * Optimistic saving (docs/design/ui-5-7-decisions.md §2).
 *
 * An edit is two parts: `apply` changes the canvas in the browser at once, `run` saves it. Saves go
 * to the server one at a time, in order. The query cache keeps the server's copy of each canvas;
 * what you see is that copy with every edit still waiting applied on top (useCanvasView). When a
 * save returns, it stores the server's new view and drops its own edit in the same step, so nothing
 * flickers. A save that fails drops its edit too, which undoes it on screen.
 */

export interface PendingEdit {
  id: number;
  canvasId: string;
  apply: (v: CanvasView) => CanvasView;
}

interface SyncState {
  /** Edits shown but not saved yet, oldest first. */
  pending: PendingEdit[];
  /** Saves not finished (edits plus saves without a canvas effect). */
  queued: number;
  online: boolean;
  /** The last save that failed, until the next one succeeds. */
  error: string | null;
}

export const useSync = create<SyncState>(() => ({ pending: [], queued: 0, online: true, error: null }));

interface Task {
  label: string;
  editId?: number;
  /** Save it. Call `confirm()` right after storing the server's answer, so the edit and the answer swap in one render. */
  run: (confirm: () => void) => Promise<void>;
  onFail?: (e: unknown) => void;
}

const tasks: Task[] = [];
let running = false;
let nextId = 1;
let hooks: { drained: () => void; failed: (message: string) => void } = { drained: () => undefined, failed: () => undefined };

/** Set by the workspace screen: refresh everything once the queue is empty, and show save errors. */
export function configureSync(h: typeof hooks) {
  hooks = h;
}

export function message(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof TypeError) return 'Could not reach the server';
  return e instanceof Error && e.message ? e.message : 'Something went wrong';
}

/** Show an edit now and save it in the background. */
export function enqueue(t: { label: string; canvasId?: string; apply?: (v: CanvasView) => CanvasView; run: Task['run']; onFail?: (e: unknown) => void }) {
  const editId = t.apply && t.canvasId ? nextId++ : undefined;
  useSync.setState((s) => ({
    pending: editId ? [...s.pending, { id: editId, canvasId: t.canvasId!, apply: t.apply! }] : s.pending,
    queued: s.queued + 1,
  }));
  tasks.push({ label: t.label, editId, run: t.run, onFail: t.onFail });
  void pump();
}

const drop = (editId?: number) => editId && useSync.setState((s) => ({ pending: s.pending.filter((p) => p.id !== editId) }));

async function waitOnline() {
  if (typeof navigator === 'undefined' || navigator.onLine) return;
  await new Promise<void>((resolve) => window.addEventListener('online', () => resolve(), { once: true }));
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (tasks.length) {
      await waitOnline();
      const t = tasks.shift()!;
      try {
        await t.run(() => drop(t.editId));
        useSync.setState({ error: null });
      } catch (e) {
        const m = `Couldn't save “${t.label}”: ${message(e).replace(/\.+$/, '')}`;
        useSync.setState({ error: m });
        t.onFail?.(e);
        hooks.failed(m);
      } finally {
        drop(t.editId);
        useSync.setState((s) => ({ queued: s.queued - 1 }));
      }
    }
  } finally {
    running = false;
    hooks.drained();
  }
}

/** The server's view with every edit still waiting for this canvas applied on top. */
export function withPending(view: CanvasView, pending: PendingEdit[]): CanvasView {
  let v = view;
  for (const p of pending) if (p.canvasId === view.canvas.id) v = p.apply(v);
  return v;
}

// online / offline and "leave with unsaved changes" warnings
if (typeof window !== 'undefined') {
  useSync.setState({ online: navigator.onLine });
  window.addEventListener('online', () => useSync.setState({ online: true }));
  window.addEventListener('offline', () => useSync.setState({ online: false }));
  window.addEventListener('beforeunload', (e) => {
    if (useSync.getState().queued > 0) e.preventDefault();
  });
}
