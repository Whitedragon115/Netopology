'use client';

import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow, useViewport, type NodeMouseHandler } from '@xyflow/react';
import { Eye, KeyRound, Maximize, Minus, Plus, X } from 'lucide-react';
import { Tooltip } from 'radix-ui';
import { useEffect, useMemo, useState } from 'react';
import { StatusChip } from '@/components/status';
import { Button, IconButton } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import type { CanvasView } from '@/lib/api/types';
import { CATEGORY, LINK_KIND, nodeType } from '@/lib/domain';
import { AuthLayout, FormError, Logo } from '../auth/AuthLayout';
import { CanvasActionsContext, type CanvasActions } from '../canvas/actions';
import { buildFlow, type FlowNode } from '../canvas/flow';
import { EdgeMarkers, edgeTypes } from '../canvas/LinkEdge';
import { nodeTypes } from '../canvas/nodes';
import type { Selection } from '../workspace/store';
import { shareInfo, unlockShare, useSharedView } from './api';

/*
 * What a share link opens (WP-12): /share/{token}. No account. If the link has a password, the guest
 * types it first; unlocking sets a cookie for this link only. Then one canvas, read-only, already
 * redacted by the server (no sensitive values, health messages, names of people).
 */

type Phase = { kind: 'checking' } | { kind: 'password'; error?: string } | { kind: 'open' } | { kind: 'gone' } | { kind: 'error'; message: string };

export function GuestView({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const view = useSharedView(token, phase.kind === 'open');

  useEffect(() => {
    try {
      const theme = localStorage.getItem('netopology.theme');
      if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
    } catch {
      /* default theme */
    }
  }, []);

  // check the link, then open it right away when it has no password
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const info = await shareInfo(token);
        if (!live) return;
        if (info.requiresPassword) return setPhase({ kind: 'password' });
        await unlockShare(token);
        if (live) setPhase({ kind: 'open' });
      } catch (e) {
        if (!live) return;
        setPhase(e instanceof ApiError && e.status === 404 ? { kind: 'gone' } : { kind: 'error', message: e instanceof Error ? e.message : 'Could not open the link.' });
      }
    })();
    return () => {
      live = false;
    };
  }, [token]);

  // the guest cookie expired or the link was revoked while open
  const lost = phase.kind === 'open' && view.error instanceof ApiError ? view.error : null;
  const shown: Phase = lost ? (lost.status === 404 ? { kind: 'gone' } : { kind: 'password' }) : phase;

  if (shown.kind === 'checking' || (shown.kind === 'open' && view.isLoading)) return <div className="grid min-h-dvh place-items-center bg-bg text-faint">Opening the shared map…</div>;

  if (shown.kind === 'gone')
    return (
      <AuthLayout title="This link doesn't work" subtitle="It may have expired or been revoked by the person who shared it. Ask them for a new link.">
        <span />
      </AuthLayout>
    );
  if (shown.kind === 'error')
    return (
      <AuthLayout title="Couldn't open the link" subtitle={shown.message}>
        <Button variant="primary" size="lg" onClick={() => location.reload()}>Try again</Button>
      </AuthLayout>
    );
  if (shown.kind === 'password')
    return (
      <AuthLayout title="This map is protected" subtitle="Type the password you were given with the link.">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await unlockShare(token, password);
              setPhase({ kind: 'open' });
              if (lost) void view.refetch();
            } catch (err) {
              const m =
                err instanceof ApiError && err.status === 401
                  ? 'That password is not right.'
                  : err instanceof ApiError && err.status === 429
                    ? 'Too many tries. Wait a minute and try again.'
                    : err instanceof ApiError && err.status === 404
                      ? 'This link no longer works.'
                      : 'Could not reach the server.';
              setPhase({ kind: 'password', error: m });
            } finally {
              setBusy(false);
            }
          }}
        >
          <FormError>{shown.error}</FormError>
          <Field label="Password">{(p) => <Input {...p} type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Button type="submit" variant="primary" size="lg" disabled={!password || busy}>
            <KeyRound className="size-4" />
            Open the map
          </Button>
        </form>
      </AuthLayout>
    );

  if (!view.data) return null;
  return (
    <Tooltip.Provider>
      <ReactFlowProvider>
        <GuestCanvas view={view.data} />
      </ReactFlowProvider>
    </Tooltip.Provider>
  );
}

const noop = () => undefined;

function GuestCanvas({ view }: { view: CanvasView }) {
  const rf = useReactFlow<FlowNode>();
  const { zoom } = useViewport();
  const [selection, setSelection] = useState<Selection>(null);
  const { nodes, edges } = useMemo(() => buildFlow(view, selection), [view, selection]);
  const actions: CanvasActions = useMemo(
    () => ({ viewer: view.viewer, toggleCollapse: noop, setWaypoints: noop, enterArea: noop, leaveArea: noop, resize: noop, commitText: noop, editingId: null, setEditingId: noop }),
    [view.viewer],
  );
  const fit = () => void rf.fitView({ padding: 0.15, maxZoom: 1, duration: 200 });

  const onNodeClick: NodeMouseHandler<FlowNode> = (_, n) => {
    if (n.type === 'inv' || n.type === 'ghost') setSelection({ type: 'node', id: n.data.node.id });
    else if (n.type === 'areaBox' || n.type === 'areaCard') setSelection({ type: 'area', id: n.data.area.id });
    else setSelection(null);
  };

  return (
    <CanvasActionsContext.Provider value={actions}>
      <main className="fixed inset-0 overflow-hidden bg-bg">
        <EdgeMarkers />
        <ReactFlow<FlowNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          onEdgeClick={(_, e) => setSelection({ type: 'link', id: e.id })}
          onPaneClick={() => setSelection(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.25}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--grid-dot)" />
        </ReactFlow>

        <header className="float-panel absolute top-3 left-3 z-20 flex h-10 items-center gap-2.5 pr-3 pl-1.5">
          <Logo className="size-7" />
          <span className="text-[13px] font-semibold">{view.canvas.name}</span>
          <span className="flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-2xs text-muted">
            <Eye className="size-3" />
            Shared view · read-only
          </span>
        </header>

        {selection && <GuestDetails view={view} selection={selection} onClose={() => setSelection(null)} />}

        <div className="float-panel absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 p-1" role="toolbar" aria-label="View">
          <IconButton label="Zoom out" onClick={() => rf.zoomOut({ duration: 150 })} tooltipSide="top">
            <Minus className="size-4" />
          </IconButton>
          <span className="min-w-11 text-center font-mono text-xs text-muted">{Math.round(zoom * 100)}%</span>
          <IconButton label="Zoom in" onClick={() => rf.zoomIn({ duration: 150 })} tooltipSide="top">
            <Plus className="size-4" />
          </IconButton>
          <IconButton label="Fit to screen" onClick={fit} tooltipSide="top">
            <Maximize className="size-4" />
          </IconButton>
        </div>
        <a href="/login" className="absolute right-3 bottom-3 z-20 rounded-full bg-surface/80 px-2.5 py-1 text-2xs text-faint hover:text-text">
          Made with Netopology
        </a>
      </main>
    </CanvasActionsContext.Provider>
  );
}

/** A small read-only card for what the guest clicked: name, kind, health colour. */
function GuestDetails({ view, selection, onClose }: { view: CanvasView; selection: NonNullable<Selection>; onClose: () => void }) {
  let title = '';
  let rows: [string, React.ReactNode][] = [];
  if (selection.type === 'node') {
    const n = view.nodes.find((x) => x.id === selection.id);
    if (!n) return null;
    title = n.name;
    const area = view.areas.find((a) => a.id === n.areaId);
    rows = [
      ['Kind', `${CATEGORY[n.category].label} · ${nodeType(n.type).label}`],
      ['Health', <StatusChip key="h" status={n.health.status} />],
      ...(area ? ([['Area', area.name]] as [string, string][]) : []),
      ...(n.description ? ([['About', n.description]] as [string, string][]) : []),
      ...n.properties.filter((f) => !f.redacted && f.value).map((f): [string, React.ReactNode] => [f.label, <span key={f.key} className="font-mono text-xs">{f.value}</span>]),
    ];
  } else if (selection.type === 'area') {
    const a = view.areas.find((x) => x.id === selection.id);
    if (!a) return null;
    title = a.name;
    rows = [['Kind', `Area · ${a.kind}`], ['Nodes', String(view.nodes.filter((n) => n.areaId === a.id).length)]];
  } else if (selection.type === 'link') {
    const l = view.links.find((x) => x.id === selection.id);
    if (!l) return null;
    const name = (id: string) => view.nodes.find((n) => n.id === id)?.name ?? 'Outside node';
    title = `${name(l.sourceNodeId)} ${l.directed ? '→' : '↔'} ${name(l.targetNodeId)}`;
    rows = [['Kind', LINK_KIND[l.kind].label], ...(l.label ? ([['Label', l.label]] as [string, string][]) : [])];
  }
  return (
    <aside className="float-panel absolute top-3 right-3 z-30 w-80 animate-[detail-in_200ms_var(--ease)] p-4 max-[600px]:left-3 max-[600px]:w-auto" aria-label="Details">
      <div className="mb-3 flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-base leading-snug font-semibold break-words">{title}</h2>
        <IconButton label="Close" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-faint">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
