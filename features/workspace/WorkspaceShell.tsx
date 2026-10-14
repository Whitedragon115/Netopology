'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Tooltip } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useToasts } from '@/components/toast';
import { api, unwrap } from '@/lib/api/client';
import type { Canvas } from '@/lib/api/types';
import { useSession } from '../auth/api';
import { CanvasArea } from '../canvas/CanvasArea';
import { configureSync } from '../canvas/sync';
import { CommandPalette } from '../command/CommandPalette';
import { DetailPanel } from '../detail/DetailPanel';
import { LeftPanel } from '../panel/LeftPanel';
import { SectionOverlay } from '../sections/SectionOverlay';
import { SettingsWindow } from '../settings/SettingsWindow';
import { fetchAreaCanvas, keys, useCanvases, useCanvasView, useWorkspaceBySlug } from './api';
import { WorkspaceContext, type WorkspaceCtx } from './context';
import { useUi } from './store';
import { EmptyWorkspace } from './EmptyWorkspace';
import { useLiveUpdates } from './live';
import { TopRight } from './TopRight';

/** The whole workspace screen: a full-screen canvas with floating panels (CONVENTIONS.md §5.5). */
export function WorkspaceShell({ slug, canvasId }: { slug: string; canvasId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: workspace, isLoading } = useWorkspaceBySlug(slug);
  const canvases = useCanvases(workspace?.id);
  const activeCanvasId = canvasId ?? canvases.data?.[0]?.id;
  const view = useCanvasView(workspace?.id, activeCanvasId);
  const { push: toast, view: toastView } = useToasts();
  const { select, hydrate, openSection } = useUi();

  useEffect(() => {
    hydrate();
    try {
      const theme = localStorage.getItem('netopology.theme');
      if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
    } catch {
      /* default theme */
    }
  }, [hydrate]);

  // Esc: close section → clear selection → leave area
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // the settings window handles its own Esc
      if (e.key !== 'Escape' || useUi.getState().paletteOpen || useUi.getState().settings) return;
      const s = useUi.getState();
      if (s.tool.kind !== 'select' && s.tool.kind !== 'pan') s.setTool({ kind: 'select' });
      else if (s.section) openSection(null);
      else if (s.selection) select(null);
      else if (view.data?.canvas.kind === 'area') {
        const host = view.data.breadcrumb.at(-2);
        if (host) router.push(`/w/${slug}/c/${host.canvasId}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSection, select, view.data, router, slug]);

  const goToCanvas = useCallback(
    (id: string) => {
      openSection(null);
      router.push(`/w/${slug}/c/${id}`);
    },
    [router, slug, openSection],
  );

  // saves run in the background: refresh everything once they're done, and say when one fails
  useEffect(() => {
    if (!workspace) return;
    configureSync({
      drained: () => void qc.invalidateQueries({ queryKey: keys.ws(workspace.id) }),
      failed: (m) => toast(`${m}. It was undone.`),
    });
  }, [workspace, qc, toast]);

  // while another canvas loads, the previous one stays on screen (and stays the one you edit)
  const shownCanvasId = view.data?.canvas.id ?? activeCanvasId;

  // live updates from other people (WP-11); if they delete the canvas you're on, move to another one
  const me = useSession().data?.id;
  const shownRef = useRef(shownCanvasId);
  useEffect(() => {
    shownRef.current = shownCanvasId;
  }, [shownCanvasId]);
  const onCanvasDeleted = useCallback(
    (id: string) => {
      if (id !== shownRef.current || !workspace) return;
      toast('Someone deleted the canvas you were on.');
      const next = qc.getQueryData<Canvas[]>(keys.canvases(workspace.id))?.find((c) => c.id !== id);
      router.replace(next ? `/w/${slug}/c/${next.id}` : `/w/${slug}`);
    },
    [workspace, toast, qc, router, slug],
  );
  useLiveUpdates(workspace?.id, me, onCanvasDeleted);

  const ctx: WorkspaceCtx | null = useMemo(() => {
    if (!workspace || !shownCanvasId) return null;
    return {
      workspace,
      canvasId: shownCanvasId,
      view: view.data,
      goToCanvas,
      toast,
      enterArea: async (areaId) => {
        const areaView = await qc.fetchQuery({ queryKey: keys.areaCanvas(workspace.id, areaId), queryFn: () => fetchAreaCanvas(workspace.id, areaId) });
        qc.setQueryData(keys.view(workspace.id, areaView.canvas.id), areaView);
        select(null);
        goToCanvas(areaView.canvas.id);
      },
      revealNode: async (nodeId) => {
        const onHere = view.data?.placements.some((p) => p.item.type === 'node' && p.item.id === nodeId);
        if (onHere) {
          select({ type: 'node', id: nodeId });
          return;
        }
        const usage = unwrap(await api.GET('/workspaces/{wsId}/nodes/{nodeId}/usage', { params: { path: { wsId: workspace.id, nodeId } } }));
        const target = usage.canvases[0];
        if (!target) {
          toast('This node is not drawn on any canvas you can see.');
          return;
        }
        select({ type: 'node', id: nodeId });
        goToCanvas(target.id);
      },
    };
  }, [workspace, shownCanvasId, view.data, goToCanvas, toast, qc, select]);

  if (isLoading) return <div className="grid h-full place-items-center text-faint">Loading…</div>;
  if (canvases.isError) return <div className="grid h-full place-items-center text-faint">Could not load canvases. Please reload.</div>;
  if (!workspace) return <div className="grid h-full place-items-center text-faint">Workspace not found.</div>;
  if (canvases.data?.length === 0 && !canvasId) return <EmptyWorkspace workspace={workspace} />;
  if (!ctx) return <div className="grid h-full place-items-center text-faint">Loading canvas…</div>;

  return (
    <WorkspaceContext.Provider value={ctx}>
      <Tooltip.Provider>
        <main className="fixed inset-0 overflow-hidden bg-bg">
          {view.isError ? (
            <div className="grid h-full place-items-center text-faint">This canvas does not exist or you cannot see it.</div>
          ) : (
            <CanvasArea key={shownCanvasId} />
          )}
          <LeftPanel />
          <TopRight />
          <DetailPanel />
          <SectionOverlay />
          <SettingsWindow />
        </main>
        <CommandPalette />
        {toastView}
      </Tooltip.Provider>
    </WorkspaceContext.Provider>
  );
}
