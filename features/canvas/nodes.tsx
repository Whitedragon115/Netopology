'use client';

import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { ChevronLeft, LayoutGrid, Minimize2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { StatusChip, StatusIcon } from '@/components/status';
import { CATEGORY, nodeType } from '@/lib/domain';
import { cn } from '@/lib/cn';
import type { FlowNode } from './flow';
import { useCanvasActions } from './actions';

/** Links attach to the nearest card side (see LinkEdge); one hidden handle pair is all React Flow needs. */
function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="!pointer-events-none !opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="!pointer-events-none !opacity-0" isConnectable={false} />
    </>
  );
}

// Outline-drawn shapes. viewBox 0..100 stretched to the card; strokes do not scale.
const CLOUD = (
  <>
    <rect x="0" y="36" width="100" height="64" rx="12" ry="24" />
    <ellipse cx="28" cy="44" rx="20" ry="30" />
    <ellipse cx="56" cy="31" rx="25" ry="30" />
    <ellipse cx="80" cy="46" rx="17" ry="26" />
  </>
);
function CloudFrame() {
  return (
    <svg className="shape-frame pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <g className="frame-outline">{CLOUD}</g>
      <g className="frame-fill">{CLOUD}</g>
    </svg>
  );
}
/** Elongated hexagon with arrow tips: a router passes traffic both ways. */
function HexFrame() {
  return (
    <svg className="shape-frame pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <polygon className="frame-fill" points="9,0 91,0 100,50 91,100 9,100 0,50" />
      <polygon className="frame-stroke" points="9,0 91,0 100,50 91,100 9,100 0,50" vectorEffect="non-scaling-stroke" />
      <polyline className="frame-arrow" points="6.5,36 3,50 6.5,64" vectorEffect="non-scaling-stroke" />
      <polyline className="frame-arrow" points="93.5,36 97,50 93.5,64" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const PADDING = {
  rounded: 'px-3 py-2.5',
  square: 'px-3 py-2.5',
  cloud: 'px-7 pt-7 pb-3.5',
  hexagon: 'px-8 py-2.5',
} as const;

export const InvNodeCard = memo(function InvNodeCard({ data, selected }: NodeProps<Extract<FlowNode, { type: 'inv' }>>) {
  const n = data.node;
  const cat = CATEGORY[n.category];
  const t = nodeType(n.type);
  const Icon = t.icon;
  const outline = cat.shape === 'cloud' || cat.shape === 'hexagon';
  return (
    <div
      className={cn(
        'node-card relative w-max max-w-65 min-w-44',
        outline ? 'shape-outline' : `shape-${cat.shape}`,
        !outline && cat.border !== 'solid' && `border-${cat.border}`,
        PADDING[cat.shape],
        cat.border === 'double' && 'px-2.5 py-2',
        n.health.status === 'down' && 'is-down',
        selected && 'is-selected',
      )}
      title={`${n.name}: ${n.health.status}`}
    >
      {cat.shape === 'cloud' && <CloudFrame />}
      {cat.shape === 'hexagon' && <HexFrame />}
      <div className="relative grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-sm bg-node-icon-bg text-node-icon">
          <Icon className="size-4.5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] leading-tight font-semibold">{n.name}</div>
          <div className="truncate text-2xs leading-tight text-faint">{t.label}</div>
        </div>
        <StatusIcon status={n.health.status} className="self-start" />
      </div>
      {n.description && (
        <div className={cn('relative mt-2 truncate text-xs text-muted', cat.shape !== 'cloud' && 'border-t border-border pt-2')}>{n.description}</div>
      )}
      <Handles />
    </div>
  );
});

/** Resize handles in the accent color, shown on the selected item when you may edit. */
function Resizer({ id, selected, minWidth, minHeight, widthOnly }: { id: string; selected?: boolean; minWidth: number; minHeight?: number; widthOnly?: boolean }) {
  const actions = useCanvasActions();
  if (!actions.viewer.canEdit) return null;
  return (
    <NodeResizer
      isVisible={!!selected}
      minWidth={minWidth}
      minHeight={minHeight ?? 24}
      lineClassName="resize-line"
      handleClassName={cn('resize-handle', widthOnly && 'width-only')}
      onResizeEnd={(_, r) => actions.resize(id, { x: r.x, y: r.y, width: r.width, height: r.height })}
    />
  );
}

export const AreaBoxNode = memo(function AreaBoxNode({ id, data, selected }: NodeProps<Extract<FlowNode, { type: 'areaBox' }>>) {
  const { area, placement, health } = data;
  const actions = useCanvasActions();
  return (
    <div className={cn('area-box size-full rounded-lg', `area-${area.color}`, selected && 'is-selected')}>
      <Resizer id={id} selected={selected} minWidth={240} minHeight={140} />
      <div className="flex h-10 items-center gap-2 pr-2 pl-3.5 text-[13px]">
        <span className="size-2.5 rounded-[3px] bg-[var(--area)]" />
        <b className="font-semibold text-[var(--area)]">{area.name}</b>
        {area.cidr !== null && <span className="font-mono text-xs text-faint">{area.cidr}</span>}
        {area.cidr === null && actions.viewer.role !== 'guest' && !actions.viewer.canViewSensitive && <span className="font-mono text-xs tracking-wider text-faint">•••</span>}
        <span className="ml-auto flex items-center gap-1.5">
          <StatusChip status={health} />
          {actions.viewer.canEdit && (
            <button
              type="button"
              aria-label="Collapse area"
              title="Collapse into a block"
              className="nodrag grid size-6.5 place-items-center rounded-sm text-muted hover:bg-surface-raised hover:text-text"
              onClick={(e) => {
                e.stopPropagation();
                actions.toggleCollapse(placement.id, true);
              }}
            >
              <Minimize2 className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      <Handles />
    </div>
  );
});

export const AreaCardNode = memo(function AreaCardNode({ data, selected }: NodeProps<Extract<FlowNode, { type: 'areaCard' }>>) {
  const { area, memberCount, health } = data;
  const actions = useCanvasActions();
  return (
    <div
      className={cn('node-card area-card relative w-max max-w-70 min-w-54 rounded-md py-2.5 pr-3 pl-4.5', `area-${area.color}`, selected && 'is-selected')}
      title={actions.viewer.role === 'guest' ? area.name : `${area.name}: double-click to enter`}
    >
      <span className="absolute inset-y-0 left-0 w-1.5 rounded-l-[10px] bg-[var(--area)]" />
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-sm bg-[color-mix(in_oklch,var(--area)_14%,var(--node-bg))] text-[var(--area)]">
          <LayoutGrid className="size-4.5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] leading-tight font-semibold">{area.name}</div>
          <div className="truncate text-2xs text-faint">Area · {memberCount} nodes</div>
        </div>
        <StatusIcon status={health} className="self-start" />
      </div>
      <div className="mt-2 truncate border-t border-border pt-2 text-xs text-muted">
        {health === 'healthy' ? 'All healthy' : `Contains ${health} nodes`}
        {actions.viewer.role !== 'guest' && <span className="font-medium text-accent"> · double-click to enter</span>}
      </div>
      <Handles />
    </div>
  );
});

export const GhostNode = memo(function GhostNode({ data }: NodeProps<Extract<FlowNode, { type: 'ghost' }>>) {
  const actions = useCanvasActions();
  return (
    <button
      type="button"
      onClick={() => actions.leaveArea()}
      className="flex items-center gap-2 rounded-md border-[1.5px] border-dashed border-border-strong bg-[color-mix(in_oklch,var(--node-bg)_60%,transparent)] px-3 py-2 text-xs whitespace-nowrap text-muted hover:border-accent hover:text-accent"
      title="Outside this area. Click to go back."
    >
      <ChevronLeft className="size-3.5" />
      {data.node.name}
      <span className="text-faint">· {data.areaName ? `in ${data.areaName}` : 'outside'}</span>
      <Handles />
    </button>
  );
});

/** Text that becomes a textarea on double-click (sticky notes and text shapes). */
function EditableText({ flowId, target, text, className, placeholder }: { flowId: string; target: { type: 'note' | 'shape'; id: string }; text: string; className?: string; placeholder: string }) {
  const actions = useCanvasActions();
  const editing = actions.editingId === flowId;
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [wasEditing, setWasEditing] = useState(editing);
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) setDraft(text);
  }
  useEffect(() => {
    if (!editing) return;
    // Focus at the end. A node React Flow hasn't measured yet is visibility:hidden and can't take
    // focus (a freshly created note), so retry briefly until it shows up.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length);
      else if (tries++ < 20) timer = setTimeout(attempt, 50);
    };
    attempt();
    return () => clearTimeout(timer);
  }, [editing]);
  if (!editing) return <div className={cn('break-words whitespace-pre-wrap', className, !text && 'text-faint')}>{text || placeholder}</div>;
  const done = () => {
    actions.setEditingId(null);
    if (draft !== text) actions.commitText(target, draft);
  };
  return (
    <textarea
      ref={ref}
      value={draft}
      rows={Math.max(2, draft.split('\n').length)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        e.stopPropagation(); // keep Delete/Backspace/shortcuts inside the text
        if (e.key === 'Escape') {
          setDraft(text);
          actions.setEditingId(null);
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) done();
      }}
      className={cn('nodrag nowheel block w-full resize-none bg-transparent outline-none', className)}
      placeholder={placeholder}
      aria-label="Edit text"
    />
  );
}

const NOTE_BG: Record<string, string> = {
  default: 'bg-[var(--note-default)]',
  yellow: 'bg-[var(--note-yellow)]',
  teal: 'bg-[var(--note-teal)]',
  violet: 'bg-[var(--note-violet)]',
  rose: 'bg-[var(--note-rose)]',
};

export const NoteNode = memo(function NoteNode({ id, data, selected }: NodeProps<Extract<FlowNode, { type: 'note' }>>) {
  const { note, width } = data;
  return (
    <div
      style={{ width }}
      className={cn(
        'h-full rounded-sm border border-border px-3 py-2.5 text-xs leading-normal text-note-text shadow-sm',
        NOTE_BG[note.color] ?? NOTE_BG.default,
        selected && 'ring-2 ring-accent',
      )}
    >
      <Resizer id={id} selected={selected} minWidth={140} widthOnly />
      {note.title && <div className="mb-1 font-semibold">{note.title}</div>}
      {note.redacted ? (
        <span className="text-faint">Sensitive note · hidden</span>
      ) : (
        <EditableText flowId={id} target={{ type: 'note', id: note.id }} text={note.body} placeholder="Double-click to write…" />
      )}
    </div>
  );
});

/** Free drawing (canvas_shapes). Colors reuse the area palette, so they follow the theme. */
export const ShapeNode = memo(function ShapeNode({ id, data, selected }: NodeProps<Extract<FlowNode, { type: 'shape' }>>) {
  const s = data.shape;
  const color = typeof s.style.color === 'string' ? s.style.color : 'gray';
  const fill = s.style.fill === true;
  const size = s.style.size === 'lg' ? 'text-xl font-semibold' : s.style.size === 'sm' ? 'text-xs' : 'text-sm';
  const points = (Array.isArray(s.data.points) ? s.data.points : []) as { x: number; y: number }[];
  const ring = selected ? 'outline-2 outline-offset-4 outline-accent outline-dashed' : '';

  if (s.kind === 'text')
    return (
      <div className={cn('min-w-16 px-1 text-text', size, ring)} style={{ width: s.width ?? undefined }}>
        <Resizer id={id} selected={selected} minWidth={60} widthOnly />
        <EditableText flowId={id} target={{ type: 'shape', id: s.id }} text={String(s.data.text ?? '')} placeholder="Double-click to type" />
      </div>
    );
  if (s.kind === 'rectangle' || s.kind === 'ellipse')
    return (
      <div className={cn('size-full', `area-${color}`, ring)}>
        <Resizer id={id} selected={selected} minWidth={20} minHeight={20} />
        <div
          className={cn('size-full border-2 border-[var(--area)]', s.kind === 'ellipse' ? 'rounded-[50%]' : 'rounded-md')}
          style={{ background: fill ? 'color-mix(in oklch, var(--area) 14%, transparent)' : undefined }}
        />
      </div>
    );
  // arrow, line, freehand: points are relative to the shape's top-left
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  return (
    <svg width={s.width ?? 1} height={s.height ?? 1} className={cn('overflow-visible', `area-${color}`, ring)} aria-hidden>
      <path d={d} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-[var(--area)]" markerEnd={s.kind === 'arrow' ? 'url(#shape-arrow)' : undefined} />
      {/* wide invisible stroke so thin lines are easy to click */}
      <path d={d} fill="none" strokeWidth={14} stroke="transparent" style={{ pointerEvents: 'stroke' }} />
    </svg>
  );
});

export const nodeTypes = { inv: InvNodeCard, areaBox: AreaBoxNode, areaCard: AreaCardNode, ghost: GhostNode, note: NoteNode, shape: ShapeNode };
