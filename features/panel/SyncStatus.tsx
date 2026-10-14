'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CloudOff, LoaderCircle } from 'lucide-react';
import { Tip } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useSync } from '../canvas/sync';
import { useLive } from '../workspace/live';
import { keys } from '../workspace/api';
import { useWorkspace } from '../workspace/context';

/**
 * Save state at the bottom of the side panel (DRA-58): edits show at once and are saved in the
 * background. Saving N changes… / All changes saved / Offline, changes wait / Last change wasn't saved (click to dismiss).
 */
export function SyncStatus({ compact }: { compact?: boolean }) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const queued = useSync((s) => s.queued);
  const online = useSync((s) => s.online);
  const error = useSync((s) => s.error);

  const reload = () => {
    useSync.setState({ error: null });
    void qc.invalidateQueries({ queryKey: keys.ws(workspace.id) });
  };

  const state = !online
    ? { icon: <CloudOff className="size-3.5 text-degraded" />, text: queued ? `Offline · ${queued} change${queued > 1 ? 's' : ''} wait` : 'Offline', tone: 'text-degraded' }
    : queued
      ? { icon: <LoaderCircle className="size-3.5 animate-spin text-accent" />, text: `Saving ${queued} change${queued > 1 ? 's' : ''}…`, tone: 'text-muted' }
      : error
        ? { icon: <AlertTriangle className="size-3.5 text-down" />, text: "Last change wasn't saved", tone: 'text-down' }
        : { icon: <Check className="size-3.5 text-healthy" />, text: 'All changes saved', tone: 'text-faint' };

  const tip = error && online && !queued ? `${error}. It was undone and the canvas reloaded. Click to dismiss.` : !online ? 'Your edits are kept and saved when the connection is back.' : state.text;
  const body = (
    <button
      type="button"
      onClick={error ? reload : undefined}
      aria-live="polite"
      className={cn('flex min-w-0 items-center gap-1.5 rounded-sm text-2xs', state.tone, error ? 'cursor-pointer hover:underline' : 'cursor-default', compact && 'grid size-8 place-items-center')}
      aria-label={compact ? state.text : undefined}
    >
      {state.icon}
      {!compact && <span className="truncate">{state.text}</span>}
    </button>
  );
  return <Tip label={tip} side={compact ? 'right' : 'top'}>{body}</Tip>;
}

/** Whether live updates from other people are flowing (WP-11). */
export function LiveDot() {
  const state = useLive((s) => s.state);
  if (state === 'off') return null;
  const live = state === 'live';
  return (
    <Tip label={live ? 'Changes made by others appear here as they happen.' : state === 'connecting' ? 'Connecting to live updates…' : 'Reconnecting to live updates…'} side="top">
      <span className={cn('ml-auto flex shrink-0 items-center gap-1.5 text-2xs', live ? 'text-faint' : 'text-degraded')}>
        <span className={cn('size-2 rounded-full', live ? 'bg-healthy' : 'animate-pulse bg-degraded')} />
        {live ? 'Live' : state === 'connecting' ? 'Connecting' : 'Reconnecting'}
      </span>
    </Tip>
  );
}
