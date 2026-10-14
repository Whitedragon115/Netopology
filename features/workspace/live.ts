'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { LiveEvent } from '@/lib/api/types';
import { useSync } from '../canvas/sync';
import { keys } from './api';

/**
 * Live updates (WP-11): one Server-Sent Events stream per open workspace. The server filters and
 * redacts events like normal reads, so this only says *what* changed; the app then refetches it
 * (TanStack Query), which keeps one source of truth.
 *
 * Your own edits are already on screen (optimistic saving), so their echoes are ignored while
 * saves are in flight; the queue refreshes everything once it drains anyway.
 */

export type LiveState = 'off' | 'connecting' | 'live' | 'reconnecting';
export const useLive = create<{ state: LiveState }>(() => ({ state: 'off' }));

const TYPES: LiveEvent['type'][] = [
  'node.created',
  'node.updated',
  'node.deleted',
  'link.created',
  'link.updated',
  'link.deleted',
  'area.created',
  'area.updated',
  'area.deleted',
  'note.created',
  'note.updated',
  'note.deleted',
  'canvas.created',
  'canvas.updated',
  'canvas.deleted',
  'canvas.operations_applied',
  'health.changed',
  'member.changed',
];

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';
const QUIET_MS = 300; // gather a burst of events into one refetch

export function useLiveUpdates(wsId: string | undefined, me: string | undefined, onCanvasDeleted: (canvasId: string) => void) {
  const qc = useQueryClient();

  useEffect(() => {
    // the in-browser mock API has no event stream
    if (!wsId || MOCKING || typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let flush: ReturnType<typeof setTimeout> | undefined;
    let wait = 2_000;
    let closed = false;
    let members = false;

    const refresh = () => {
      flush = undefined;
      // saves still running: their drain refreshes everything, and refetching now could fight them
      if (useSync.getState().queued > 0) return;
      void qc.invalidateQueries({ queryKey: keys.ws(wsId) });
      if (members) void qc.invalidateQueries({ queryKey: keys.workspaces });
      members = false;
    };

    const onEvent = (msg: MessageEvent<string>) => {
      let e: LiveEvent;
      try {
        e = JSON.parse(msg.data) as LiveEvent;
      } catch {
        return;
      }
      if (e.actorId && e.actorId === me && useSync.getState().queued > 0) return; // our own echo
      if (e.type === 'canvas.deleted' && typeof e.data.id === 'string' && e.actorId !== me) onCanvasDeleted(e.data.id);
      if (e.type === 'member.changed') members = true;
      if (!flush) flush = setTimeout(refresh, QUIET_MS);
    };

    const connect = () => {
      if (closed) return;
      useLive.setState({ state: source ? 'reconnecting' : 'connecting' });
      source = new EventSource(`/api/v1/workspaces/${wsId}/events`, { withCredentials: true });
      source.onopen = () => {
        wait = 2_000;
        useLive.setState({ state: 'live' });
        // anything missed while disconnected
        refresh();
      };
      source.onmessage = onEvent;
      for (const t of TYPES) source.addEventListener(t, onEvent as EventListener);
      source.onerror = () => {
        // the browser retries by itself while the stream is CONNECTING; a CLOSED stream (401/404/5xx) needs us
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          useLive.setState({ state: 'reconnecting' });
          retry = setTimeout(connect, wait);
          wait = Math.min(wait * 2, 60_000);
        } else if (useLive.getState().state === 'live') useLive.setState({ state: 'reconnecting' });
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      clearTimeout(flush);
      source?.close();
      useLive.setState({ state: 'off' });
    };
  }, [wsId, me, qc, onCanvasDeleted]);
}
