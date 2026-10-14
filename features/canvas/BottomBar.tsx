'use client';

import { useReactFlow, useViewport } from '@xyflow/react';
import {
  Boxes,
  Eye,
  EyeOff,
  Hand,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Search,
  SlidersHorizontal,
  SquareDashed,
  SquarePlus,
  StickyNote,
  Type,
  Undo2,
  Spline,
  Lock,
  LockOpen,
  Square,
  Circle,
  MoveUpRight,
  PenLine,
  type LucideIcon,
} from 'lucide-react';
import { HoverCard, Popover } from 'radix-ui';
import { create } from 'zustand';
import { useState, type ReactNode } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import type { InvNode, LinkKind, NoteColor } from '@/lib/api/types';
import { AREA_COLORS, CATEGORIES, CATEGORY, defaultLinkKind, LINK_KIND, LINK_KINDS, nodeType } from '@/lib/domain';
import { cn } from '@/lib/cn';
import { useCanvasLock, useMembers, useNodes } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { fitPadding, RAIL_WIDTH, useUi, type DrawShape, type Tool } from '../workspace/store';
import { Kbd } from '@/components/status';
import { useEditor } from './editor';
import { useHistory } from './history';
import { runUndo } from './useCanvasKeys';
import { useCanvasActions } from './actions';
import { NODE_DRAG_TYPE } from './place';
import { LinkSample, ShapeSample } from './samples';

/*
 * DRA-53. No floating tooltips on the toolbar: what the pointer is on is named at once in a small label
 * area at the toolbar's right end. A create button's flyout opens as soon as the pointer is on it, and
 * only one flyout is ever open: moving to the next button closes the previous one immediately.
 */

/** What the toolbar's label area shows; popovers outside the toolbar (link visibility) set it too. */
const useHint = create<{ hint: string | null }>(() => ({ hint: null }));
const setHint = (hint: string | null) => useHint.setState({ hint });
const hintProps = (label: string) => ({ onPointerEnter: () => setHint(label), onPointerLeave: () => setHint(null), onFocus: () => setHint(label), onBlur: () => setHint(null) });

/** Which create flyout is open (one at a time). */
type MenuState = { openId: string | null; setOpenId: (u: (cur: string | null) => string | null) => void };

/** A create tool button: hovering opens its flyout of variants (ui.md §8.6), clicking picks the tool. */
function ToolWithMenu({
  id,
  menu,
  icon: Icon,
  label,
  active,
  onClick,
  title,
  children,
}: {
  id: string;
  menu: MenuState;
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  title: string;
  children: (close: () => void) => ReactNode;
}) {
  const open = menu.openId === id;
  const setOpen = (o: boolean) => menu.setOpenId((cur) => (o ? id : cur === id ? null : cur));
  const close = () => setOpen(false);
  return (
    <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={0} closeDelay={140}>
      <HoverCard.Trigger asChild>
        <span className="relative">
          <IconButton label={label} pressed={active} noTip onClick={() => (active ? setOpen(!open) : (onClick(), close()))}>
            <Icon className="size-4" />
          </IconButton>
          <span aria-hidden className="pointer-events-none absolute right-1 bottom-1 size-1.5 bg-faint [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
        </span>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content side="top" sideOffset={10} className="float-panel z-[60] w-64 p-2">
          <div className="px-2 pt-1 pb-2 text-2xs font-semibold tracking-wider text-faint uppercase">{title}</div>
          {children(close)}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function MenuItem({ onClick, children, hint, active }: { onClick: () => void; children: ReactNode; hint?: string; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-surface-raised aria-pressed:bg-accent-subtle aria-pressed:text-accent">
      {children}
      {hint && <span className="ml-auto text-2xs text-faint">{hint}</span>}
    </button>
  );
}

const NOTE_COLORS: { color: NoteColor; label: string }[] = [
  { color: 'yellow', label: 'Yellow' },
  { color: 'teal', label: 'Teal' },
  { color: 'violet', label: 'Violet' },
  { color: 'rose', label: 'Rose' },
  { color: 'default', label: 'Plain' },
];
const SHAPES: { shape: DrawShape; label: string; icon: LucideIcon; hint: string }[] = [
  { shape: 'text', label: 'Text', icon: Type, hint: 'click' },
  { shape: 'rectangle', label: 'Rectangle', icon: Square, hint: 'drag' },
  { shape: 'ellipse', label: 'Ellipse', icon: Circle, hint: 'drag' },
  { shape: 'arrow', label: 'Arrow', icon: MoveUpRight, hint: 'drag' },
  { shape: 'freehand', label: 'Freehand', icon: PenLine, hint: 'drag' },
];

export function BottomBar({ canvasId, onPlace }: { canvasId: string; onPlace: (n: InvNode, at?: { x: number; y: number }) => void }) {
  const { tool, setTool, legendOpen, setLegend, selection, rightWidth, leftWidth, leftCollapsed } = useUi();
  const { toast, view, workspace } = useWorkspace();
  const { viewer } = useCanvasActions();
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const canUndo = useHistory((s) => s.past.length > 0);
  const canRedo = useHistory((s) => s.future.length > 0);
  const undoLabel = useHistory((s) => s.past.at(-1)?.label);
  const redoLabel = useHistory((s) => s.future.at(-1)?.label);
  const lock = useCanvasLock(workspace.id, canvasId);
  const members = useMembers(workspace.id);
  const lockedBy = view?.canvas.lock ? members.data?.find((m) => m.user.id === view.canvas.lock?.userId)?.user : undefined;
  // who may lock/unlock: the same people who may edit (permissions.md rule 8: a safety catch, not a permission)
  const mayLock = !!view && view.viewer.role !== 'viewer' && view.viewer.role !== 'guest';
  const toggleLock = (on: boolean) =>
    lock.mutate(on, {
      onSuccess: () => toast(on ? 'Canvas locked. Nobody can change it until it is unlocked.' : 'Canvas unlocked.'),
      onError: (e) => toast(e.message, 'danger'),
    });
  const [openId, setOpenId] = useState<string | null>(null);
  const menu: MenuState = { openId, setOpenId };
  const hovered = useHint((s) => s.hint);
  const nameOf = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.('button[aria-label]')?.getAttribute('aria-label') ?? null;
  const ShapeIcon = tool.kind === 'shape' ? (SHAPES.find((x) => x.shape === tool.shape)?.icon ?? Type) : Type;
  // centered in the free space: right of the side panel, and left of the details panel while it is open (DRA-55)
  const right = selection ? rightWidth + 12 : 0;
  const left = (leftCollapsed ? RAIL_WIDTH : leftWidth) + 12;

  return (
    <div
      className="float-panel absolute bottom-3 z-20 flex -translate-x-1/2 items-center gap-0.5 p-1 transition-[left] duration-200 ease-[var(--ease)]"
      style={{ left: `calc(${left}px + (100% - ${left + right}px) / 2)` }}
      role="toolbar"
      aria-label="Canvas tools"
      onPointerOver={(e) => setHint(nameOf(e.target))}
      onPointerLeave={() => setHint(null)}
      onFocus={(e) => setHint(nameOf(e.target))}
      onBlur={() => setHint(null)}
    >
      <IconButton label="Select (V)" pressed={tool.kind === 'select'} onClick={() => setTool({ kind: 'select' })} noTip>
        <MousePointer2 className="size-4" />
      </IconButton>
      <IconButton label="Pan (H)" pressed={tool.kind === 'pan'} onClick={() => setTool({ kind: 'pan' })} noTip>
        <Hand className="size-4" />
      </IconButton>
      <span className="mx-1 h-5 w-px bg-border" />
      {view?.canvas.lock ? (
        <span className="flex h-7 items-center gap-1.5 px-2.5 text-xs text-muted">
          <Lock className="size-3.5" />
          Locked{lockedBy ? ` by ${lockedBy.displayName || lockedBy.username}` : ''}
          {mayLock && (
            <Button size="sm" className="ml-1.5" disabled={lock.isPending} onClick={() => toggleLock(false)}>
              <LockOpen className="size-3.5" />
              Unlock
            </Button>
          )}
        </span>
      ) : viewer.canEdit ? (
        <>
          <ToolWithMenu id="node" menu={menu} icon={SquarePlus} label="Add node (N)" title="Pick a kind, then click the canvas" active={tool.kind === 'node'} onClick={() => setTool({ kind: 'node', category: 'generic' })}>
            {(close) =>
              CATEGORIES.map((c) => (
                <MenuItem key={c} active={tool.kind === 'node' && tool.category === c} onClick={() => { setTool({ kind: 'node', category: c }); close(); }} hint={CATEGORY[c].shape}>
                  <ShapeSample category={c} />
                  {CATEGORY[c].label}
                </MenuItem>
              ))
            }
          </ToolWithMenu>
          <InventoryPicker onPlace={onPlace} />
          <ToolWithMenu id="area" menu={menu} icon={SquareDashed} label="Add area (A)" title="Pick a color, then drag around nodes" active={tool.kind === 'area'} onClick={() => setTool({ kind: 'area', color: 'yellow' })}>
            {(close) => (
              <>
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  {AREA_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`${c} area`}
                      aria-pressed={tool.kind === 'area' && tool.color === c}
                      onClick={() => { setTool({ kind: 'area', color: c }); close(); }}
                      className={cn('size-6 rounded-sm border-2 border-transparent bg-[var(--area)] hover:border-text aria-pressed:border-text', `area-${c}`)}
                    />
                  ))}
                </div>
                <p className="px-2 pt-1.5 pb-0.5 text-xs text-faint">Nodes inside the rectangle join the area on every canvas.</p>
              </>
            )}
          </ToolWithMenu>
          <ToolWithMenu id="link" menu={menu} icon={Spline} label="Draw link (L)" title="Pick a kind, then click two nodes" active={tool.kind === 'link'} onClick={() => setTool({ kind: 'link', linkKind: defaultLinkKind(view?.canvas.settings.hiddenLinkKinds) })}>
            {(close) =>
              LINK_KINDS.map((k) => (
                <MenuItem key={k} active={tool.kind === 'link' && tool.linkKind === k} onClick={() => { setTool({ kind: 'link', linkKind: k }); close(); }} hint={LINK_KIND[k].directed ? 'one-way' : undefined}>
                  <LinkSample kind={k} />
                  {LINK_KIND[k].label}
                </MenuItem>
              ))
            }
          </ToolWithMenu>
          <ToolWithMenu id="note" menu={menu} icon={StickyNote} label="Sticky note (T)" title="Pick a color, then click the canvas" active={tool.kind === 'note'} onClick={() => setTool({ kind: 'note', color: 'yellow' })}>
            {(close) =>
              NOTE_COLORS.map(({ color, label }) => (
                <MenuItem key={color} active={tool.kind === 'note' && tool.color === color} onClick={() => { setTool({ kind: 'note', color }); close(); }}>
                  <span className="size-4 rounded-[4px] border border-border" style={{ background: `var(--note-${color})` }} />
                  {label}
                </MenuItem>
              ))
            }
          </ToolWithMenu>
          <ToolWithMenu id="shape" menu={menu} icon={ShapeIcon} label="Text and shapes (S)" title="Text and free drawing" active={tool.kind === 'shape'} onClick={() => setTool({ kind: 'shape', shape: 'text' })}>
            {(close) =>
              SHAPES.map(({ shape, label, icon: Icon, hint }) => (
                <MenuItem key={shape} active={tool.kind === 'shape' && tool.shape === shape} onClick={() => { setTool({ kind: 'shape', shape }); close(); }} hint={hint}>
                  <Icon className="size-4 text-muted" />
                  {label}
                </MenuItem>
              ))
            }
          </ToolWithMenu>
          <span className="mx-1 h-5 w-px bg-border" />
          <IconButton label={canUndo ? `Undo: ${undoLabel} (Ctrl Z)` : 'Undo (Ctrl Z)'} disabled={!canUndo} onClick={() => runUndo('undo', toast)} noTip>
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton label={canRedo ? `Redo: ${redoLabel} (Ctrl Shift Z)` : 'Redo (Ctrl Shift Z)'} disabled={!canRedo} onClick={() => runUndo('redo', toast)} noTip>
            <Redo2 className="size-4" />
          </IconButton>
          <IconButton label="Lock canvas" disabled={lock.isPending} onClick={() => toggleLock(true)} noTip>
            <Lock className="size-4" />
          </IconButton>
        </>
      ) : (
        <span className="flex h-7 items-center gap-1.5 px-2.5 text-xs text-muted">
          <Eye className="size-3.5" />
          {viewer.role === 'guest' ? 'Shared view · read-only' : 'View only'}
        </span>
      )}
      <span className="mx-1 h-5 w-px bg-border" />
      <Popover.Root open={legendOpen} onOpenChange={setLegend}>
        <Popover.Trigger asChild>
          <span>
            <IconButton label="Link visibility" pressed={legendOpen} noTip>
              <SlidersHorizontal className="size-4" />
            </IconButton>
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="top" align="end" sideOffset={10} className="float-panel z-[60] w-72 p-3.5">
            <Legend />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <span className="mx-1 h-5 w-px bg-border" />
      <IconButton label="Zoom out" onClick={() => rf.zoomOut({ duration: 150 })} noTip>
        <Minus className="size-4" />
      </IconButton>
      <span className="min-w-11 text-center font-mono text-xs text-muted">{Math.round(zoom * 100)}%</span>
      <IconButton label="Zoom in" onClick={() => rf.zoomIn({ duration: 150 })} noTip>
        <Plus className="size-4" />
      </IconButton>
      <IconButton label="Fit to screen" onClick={() => rf.fitView({ padding: fitPadding(), maxZoom: 1, duration: 200 })} noTip>
        <Maximize className="size-4" />
      </IconButton>
      <HoverLabel hovered={hovered} idle={toolName(tool)} />
    </div>
  );
}

/** What the active tool is called, shown in the label area while nothing is hovered. */
function toolName(t: Tool): string {
  switch (t.kind) {
    case 'select':
      return 'Select';
    case 'pan':
      return 'Pan';
    case 'node':
      return `Add ${CATEGORY[t.category].label.toLowerCase()} node`;
    case 'area':
      return 'Add area';
    case 'link':
      return `Draw ${LINK_KIND[t.linkKind].label.toLowerCase()} link`;
    case 'note':
      return 'Sticky note';
    case 'shape':
      return SHAPES.find((x) => x.shape === t.shape)?.label ?? 'Shape';
  }
}

/** The toolbar's label area: names what the pointer is on, at once; otherwise the active tool, dimmed. */
function HoverLabel({ hovered, idle }: { hovered: string | null; idle: string }) {
  const text = hovered ?? idle;
  // "Add node (N)" → "Add node" + a key chip
  const m = /^(.*?)\s*\(([^)]+)\)$/.exec(text);
  const name = m ? m[1] : text;
  const keys = m ? m[2] : null;
  return (
    <span aria-live="polite" className="ml-1 flex w-44 items-center justify-center gap-1.5 border-l border-border px-2 text-center text-xs max-[720px]:hidden">
      <span className={cn('truncate', hovered ? 'text-text' : 'text-faint')}>{name}</span>
      {keys && hovered && <Kbd className="shrink-0">{keys}</Kbd>}
    </span>
  );
}

/**
 * Inventory in the toolbar (DRA-57): nodes this canvas doesn't show yet. Click one to place it in the
 * middle of the view, or drag it onto the canvas. A canvas shows each node once, so placed ones aren't listed.
 */
function InventoryPicker({ onPlace }: { onPlace: (n: InvNode, at?: { x: number; y: number }) => void }) {
  const { workspace, view } = useWorkspace();
  const rf = useReactFlow();
  const nodes = useNodes(workspace.id);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const placed = new Set(view?.placements.filter((p) => p.item.type === 'node').map((p) => p.item.id) ?? []);
  const all = nodes.data ?? [];
  const free = all.filter((n) => !placed.has(n.id));
  const shown = free.filter((n) => !q || n.name.toLowerCase().includes(q.toLowerCase()) || n.slug.includes(q.toLowerCase()));
  const center = () => {
    const { rightWidth, selection } = useUi.getState();
    return rf.screenToFlowPosition({ x: (window.innerWidth - (selection ? rightWidth : 0)) / 2, y: window.innerHeight / 2 });
  };
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <Popover.Trigger asChild>
        <span>
          <IconButton label="Place from inventory" pressed={open} noTip>
            <Boxes className="size-4" />
          </IconButton>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={10} className="float-panel z-[60] flex max-h-[min(440px,70vh)] w-80 flex-col p-2">
          <div className="px-2 pt-1 pb-2 text-2xs font-semibold tracking-wider text-faint uppercase">Place from inventory</div>
          <label className="relative mx-1 mb-1.5 block">
            <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search nodes…"
              aria-label="Search inventory"
              className="h-8 w-full rounded-sm border border-border-strong bg-surface pr-3 pl-8.5 text-[13px] shadow-xs focus:border-accent focus:outline-none"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.map((n) => {
              const Icon = nodeType(n.type).icon;
              return (
                <button
                  key={n.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(NODE_DRAG_TYPE, n.id);
                    e.dataTransfer.effectAllowed = 'copy';
                    setTimeout(() => setOpen(false), 0); // get the popover out of the way of the drop
                  }}
                  onClick={() => { onPlace(n, center()); setOpen(false); }}
                  className="flex w-full cursor-grab items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-surface-raised active:cursor-grabbing"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-node-icon-bg text-node-icon"><Icon className="size-4" /></span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{n.name}</span>
                    <span className="block truncate text-2xs text-faint">{nodeType(n.type).label}</span>
                  </span>
                </button>
              );
            })}
            {!shown.length && (
              <p className="px-2 py-3 text-[13px] text-faint">
                {!all.length ? 'The inventory is empty. Add a node with the tool on the left.' : !free.length ? 'Every node is already on this canvas.' : 'No nodes match.'}
              </p>
            )}
          </div>
          <p className="border-t border-border px-2 pt-2 text-2xs text-faint">Click to place in the middle, or drag onto the canvas. A canvas shows each node once.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Legend() {
  const { view } = useWorkspace();
  const editor = useEditor();
  const hidden = new Set<LinkKind>(view?.canvas.settings.hiddenLinkKinds ?? []);
  const canChange = view?.viewer.role === 'owner' || view?.viewer.role === 'admin';
  // instant, undoable, rolled back if the server refuses (features/canvas/sync.ts)
  const toggle = (k: LinkKind) => {
    const next = new Set(hidden);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    editor.setHiddenLinkKinds([...next], `${next.has(k) ? 'Hide' : 'Show'} ${LINK_KIND[k].label.toLowerCase()} links`);
  };
  return (
    <div>
      <h3 className="mb-2 text-2xs font-semibold tracking-wider text-faint uppercase">Links on this canvas</h3>
      {LINK_KINDS.map((k) => (
        <div key={k} className={cn('flex items-center gap-2.5 py-0.5 text-[13px]', hidden.has(k) && 'opacity-45')}>
          <LinkSample kind={k} />
          {LINK_KIND[k].label}
          <span className="ml-auto">
            {canChange ? (
              <IconButton size="sm" noTip {...hintProps(`${hidden.has(k) ? 'Show' : 'Hide'} ${LINK_KIND[k].label.toLowerCase()} links`)} label={`${hidden.has(k) ? 'Show' : 'Hide'} ${LINK_KIND[k].label}`} pressed={!hidden.has(k)} onClick={() => toggle(k)}>
                {hidden.has(k) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </IconButton>
            ) : (
              hidden.has(k) && <span className="text-xs text-faint">hidden</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
