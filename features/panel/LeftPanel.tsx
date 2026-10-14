'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ChevronDown, Gauge, Layers, List, Lock, PanelLeft, Plus, Puzzle, Shield, Users, Workflow, type LucideIcon } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton, Tip } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useCanvases, useCreateCanvas, useNodes, viewQuery } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { PANEL_MAX, PANEL_MIN, RAIL_WIDTH, useUi, type Section } from '../workspace/store';
import { CanvasMenu } from './CanvasMenu';
import { LiveDot, SyncStatus } from './SyncStatus';
import { MONITOR_PAGES } from '../sections/MonitorSection';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

/*
 * The side panel (DRA-64 … DRA-67):
 *   Canvases (foldable)
 *   Workspace: Inventory, Members
 *   Operate: Monitor (with Uptime, Resources, SNMP, Traffic under it), Activity (owners and admins)
 *   Extend: Workflows, Plugins (coming in later phases)
 *   footer: save status
 * Collapsed, it becomes a rail of the same icons.
 */

type Entry = { id: Exclude<Section, null>; label: string; icon: LucideIcon; soon?: string; badge?: ReactNode };

function Item({ active, onClick, onPointerEnter, icon, children, end, child, soon }: { active?: boolean; onClick: () => void; onPointerEnter?: () => void; icon: ReactNode; children: ReactNode; end?: ReactNode; child?: boolean; soon?: boolean }) {
  return (
    <button
      type="button"
      aria-current={active || undefined}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 text-left text-muted hover:bg-surface-raised hover:text-text aria-[current]:bg-accent-subtle aria-[current]:font-medium aria-[current]:text-accent',
        child ? 'h-7 pl-7.5 text-xs' : 'h-8 text-[13px]',
        soon && 'text-faint',
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
      {end && <span className="ml-auto flex items-center text-faint">{end}</span>}
    </button>
  );
}

function GroupHead({ children }: { children: ReactNode }) {
  return <div className="flex h-7.5 items-center px-2 text-2xs font-semibold tracking-wider text-faint uppercase">{children}</div>;
}

const Soon = () => <span className="rounded-full border border-border px-1.5 text-[10px] leading-4 font-medium">soon</span>;

/** Drag the right edge to resize (ui.md §8.7). */
function ResizeHandle() {
  const setLeftWidth = useUi((s) => s.setLeftWidth);
  const dragging = useRef(false);
  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && setLeftWidth(e.clientX - 12);
    const up = () => {
      dragging.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [setLeftWidth]);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize side panel"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        document.body.style.cursor = 'col-resize';
      }}
      onKeyDown={(e) => {
        const w = useUi.getState().leftWidth;
        if (e.key === 'ArrowLeft') setLeftWidth(w - 16);
        if (e.key === 'ArrowRight') setLeftWidth(w + 16);
      }}
      className="group absolute inset-y-3 -right-1.5 z-10 w-3 cursor-col-resize"
    >
      <span className="mx-auto block h-full w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-accent group-focus-visible:bg-accent" />
    </div>
  );
}

function useEntries() {
  const { workspace } = useWorkspace();
  const nodes = useNodes(workspace.id);
  // the audit log is for owners and admins (permissions.md: audit.list)
  const manage = workspace.membership.role === 'owner' || workspace.membership.role === 'admin';
  const problems = (nodes.data ?? []).filter((n) => n.health.status === 'down' || n.health.status === 'degraded').length;
  const badge = problems ? <span className="grid h-4 min-w-4 place-items-center rounded-full bg-down px-1 text-[10px] font-semibold text-on-accent">{problems}</span> : undefined;
  const groups: { title: string; items: Entry[] }[] = [
    { title: 'Workspace', items: [{ id: 'inventory', label: 'Inventory', icon: List }, { id: 'members', label: 'Members', icon: Users }] },
    { title: 'Operate', items: [{ id: 'monitor', label: 'Monitor', icon: Gauge, badge }, ...(manage ? [{ id: 'activity' as const, label: 'Activity', icon: Activity }] : [])] },
    { title: 'Extend', items: [{ id: 'workflows', label: 'Workflows', icon: Workflow, soon: 'Phase C4' }, { id: 'plugins', label: 'Plugins', icon: Puzzle, soon: 'Phase C3' }] },
  ];
  return { groups, problems };
}

export function LeftPanel() {
  const { workspace, canvasId, goToCanvas, toast } = useWorkspace();
  const qc = useQueryClient();
  const { leftWidth, leftCollapsed, toggleLeft, fold, toggleFold, section, openSection, monitorTab, openMonitor } = useUi();
  const canvases = useCanvases(workspace.id);
  const createCanvas = useCreateCanvas(workspace.id);
  const { groups } = useEntries();
  const manage = workspace.membership.role === 'owner' || workspace.membership.role === 'admin';
  const open = (id: Exclude<Section, null>) => openSection(section === id ? null : id);
  // load a canvas while the pointer is on its row, so switching shows it right away
  const warm = (id: string) => void qc.prefetchQuery({ ...viewQuery(workspace.id, id), staleTime: 15_000 });

  if (leftCollapsed) return <Rail groups={groups} open={open} warm={warm} />;

  return (
    <aside className="float-panel absolute top-3 bottom-3 left-3 z-40 flex flex-col" style={{ width: leftWidth }} aria-label="Workspace">
      <div className="flex items-center gap-1 px-2 pt-2.5 pb-2">
        <WorkspaceSwitcher />
        <IconButton label="Collapse side panel" onClick={toggleLeft}>
          <PanelLeft className="size-4" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-2 pb-2">
        <section className="pt-1.5">
          <button
            type="button"
            aria-expanded={fold.canvases}
            onClick={() => toggleFold('canvases')}
            className="flex h-7.5 w-full items-center gap-1.5 rounded-sm px-1.5 text-2xs font-semibold tracking-wider text-faint uppercase hover:text-muted"
          >
            <ChevronDown className={cn('size-3.5 transition-transform', !fold.canvases && '-rotate-90')} />
            Canvases
            <span className="ml-auto font-medium tracking-normal normal-case">{canvases.data?.length}</span>
          </button>
          {fold.canvases && (
            <div>
              {canvases.data?.map((c) => (
                <div key={c.id}>
                  <div className="group relative">
                    <Item
                      active={c.id === canvasId && !section}
                      onClick={() => goToCanvas(c.id)}
                      onPointerEnter={() => c.id !== canvasId && warm(c.id)}
                      icon={<Layers className="size-4 shrink-0" />}
                      end={
                        <span className={cn('flex items-center gap-1', manage && 'pr-6')}>
                          {c.lock && <Lock className="size-3.5" aria-label="Locked" />}
                          {c.isProtected && <Shield className="size-3.5" aria-label="Protected" />}
                        </span>
                      }
                    >
                      {c.name}
                    </Item>
                    {manage && (
                      <span className="absolute top-1 right-1">
                        <CanvasMenu canvas={c} />
                      </span>
                    )}
                  </div>
                  <CanvasAreas canvasId={c.id} />
                </div>
              ))}
              {manage && (
                <NewCanvas
                  pending={createCanvas.isPending}
                  onCreate={(name, done) =>
                    createCanvas.mutate(name, {
                      onSuccess: (canvas) => {
                        done();
                        goToCanvas(canvas.id);
                        toast(`Canvas “${canvas.name}” created. Add nodes from the toolbar or place existing ones from the inventory.`);
                      },
                      onError: (error) => toast(error.message, 'danger'),
                    })
                  }
                />
              )}
            </div>
          )}
        </section>

        {groups.map((g) => (
          <nav key={g.title} className="mt-1.5 border-t border-border pt-1.5" aria-label={g.title}>
            <GroupHead>{g.title}</GroupHead>
            <div className="grid gap-0.5">
              {g.items.map((e) =>
                e.id === 'monitor' ? (
                  <div key={e.id} className="grid gap-0.5">
                    <Item active={section === 'monitor' && monitorTab === 'overview'} onClick={() => (section === 'monitor' && monitorTab === 'overview' ? openSection(null) : openMonitor('overview'))} icon={<e.icon className="size-4 shrink-0" />} end={e.badge}>
                      {e.label}
                    </Item>
                    {MONITOR_PAGES.map((m) => (
                      <Item key={m.id} child active={section === 'monitor' && monitorTab === m.id} onClick={() => openMonitor(m.id)} icon={<m.icon className="size-3.5 shrink-0" />}>
                        {m.label}
                      </Item>
                    ))}
                  </div>
                ) : (
                  <Item key={e.id} active={section === e.id} onClick={() => open(e.id)} icon={<e.icon className="size-4 shrink-0" />} soon={!!e.soon} end={e.soon ? <Soon /> : e.badge}>
                    {e.label}
                  </Item>
                ),
              )}
            </div>
          </nav>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-border px-3.5 py-2.5">
        <SyncStatus />
        <LiveDot />
      </div>
      <ResizeHandle />
    </aside>
  );
}

/** The collapsed side panel: the same entries as icons with tooltips (DRA-65). */
function Rail({ groups, open, warm }: { groups: { title: string; items: Entry[] }[]; open: (id: Exclude<Section, null>) => void; warm: (id: string) => void }) {
  const { workspace, canvasId, goToCanvas } = useWorkspace();
  const { toggleLeft, section } = useUi();
  const canvases = useCanvases(workspace.id);
  return (
    <aside className="float-panel absolute top-3 bottom-3 left-3 z-40 flex flex-col items-center gap-0.5 py-2" style={{ width: RAIL_WIDTH }} aria-label="Workspace">
      <span aria-hidden className="mb-1 grid size-8 place-items-center rounded-sm bg-accent text-[13px] font-bold text-on-accent">{workspace.name[0]?.toUpperCase()}</span>
      <IconButton label="Expand side panel" onClick={toggleLeft} tooltipSide="right">
        <PanelLeft className="size-4" />
      </IconButton>
      <span className="my-1 h-px w-6 bg-border" />
      <DropdownMenu.Root>
        <Tip label="Canvases" side="right">
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label="Canvases" className="grid size-8 place-items-center rounded-sm text-muted outline-none hover:bg-surface-raised hover:text-text focus-visible:ring-3 focus-visible:ring-ring data-[state=open]:bg-surface-raised">
              <Layers className="size-4" />
            </button>
          </DropdownMenu.Trigger>
        </Tip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content side="right" align="start" sideOffset={10} className="float-panel z-[60] max-h-[70vh] w-60 overflow-y-auto p-1.5">
            <DropdownMenu.Label className="px-2 pt-1 pb-1.5 text-2xs font-semibold tracking-wider text-faint uppercase">Canvases</DropdownMenu.Label>
            {canvases.data?.map((c) => (
              <DropdownMenu.Item
                key={c.id}
                onSelect={() => goToCanvas(c.id)}
                onPointerEnter={() => warm(c.id)}
                className={cn('flex h-8 cursor-default items-center gap-2.5 rounded-sm px-2 text-[13px] outline-none select-none data-[highlighted]:bg-surface-raised', c.id === canvasId && !section && 'font-medium text-accent')}
              >
                <Layers className="size-4 shrink-0 text-muted" />
                <span className="truncate">{c.name}</span>
                {c.lock && <Lock className="ml-auto size-3.5 text-faint" />}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {groups.map((g) => (
        <div key={g.title} className="contents">
          <span className="my-1 h-px w-6 bg-border" />
          {g.items.map((e) => (
            <span key={e.id} className="relative">
              <IconButton label={e.soon ? `${e.label} (coming: ${e.soon})` : e.label} pressed={section === e.id} onClick={() => open(e.id)} tooltipSide="right" className={cn(e.soon && 'text-faint')}>
                <e.icon className="size-4" />
              </IconButton>
              {e.badge && <span className="pointer-events-none absolute -top-0.5 -right-0.5 scale-90">{e.badge}</span>}
            </span>
          ))}
        </div>
      ))}
      <div className="mt-auto">
        <SyncStatus compact />
      </div>
    </aside>
  );
}

/** "New canvas" row that turns into a name field (owner/admin only). */
function NewCanvas({ onCreate, pending }: { onCreate: (name: string, done: () => void) => void; pending: boolean }) {
  const [name, setName] = useState<string | null>(null);
  if (name === null)
    return (
      <Item onClick={() => setName('')} icon={<Plus className="size-4" />}>
        <span className="text-xs text-faint">New canvas</span>
      </Item>
    );
  const submit = () => {
    const v = name.trim();
    if (!v) return setName(null);
    onCreate(v, () => setName(null));
  };
  return (
    <form
      className="px-1 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        autoFocus
        value={name}
        maxLength={100}
        disabled={pending}
        placeholder="Canvas name, e.g. VLANs"
        aria-label="New canvas name"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => !name.trim() && setName(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setName(null);
          }
        }}
        className="h-8 w-full rounded-sm border border-accent bg-surface px-2.5 text-[13px] outline-none focus:ring-3 focus:ring-ring"
      />
    </form>
  );
}

/**
 * The area boxes drawn on one canvas, always listed under it (each canvas's view is loaded once and
 * cached). Clicking one opens that area's inner canvas; the list stays the same while you are inside.
 */
function CanvasAreas({ canvasId }: { canvasId: string }) {
  const { workspace, view, enterArea } = useWorkspace();
  const section = useUi((s) => s.section);
  const areas = useQuery({
    ...viewQuery(workspace.id, canvasId),
    staleTime: 30_000,
    select: (v) => v.placements.filter((p) => p.item.type === 'area').flatMap((p) => v.areas.filter((a) => a.id === p.item.id)),
  });
  return areas.data?.map((a) => (
    <Item
      key={a.id}
      child
      active={view?.canvas.kind === 'area' && view.canvas.areaId === a.id && !section}
      onClick={() => void enterArea(a.id)}
      icon={<span className={cn('size-2.5 shrink-0 rounded-[3px] bg-[var(--area)]', `area-${a.color}`)} />}
    >
      {a.name}
    </Item>
  ));
}
