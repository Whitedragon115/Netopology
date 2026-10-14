'use client';

import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useInternalNode, useReactFlow, type EdgeProps, type InternalNode } from '@xyflow/react';
import { memo, useState } from 'react';
import { LINK_KIND } from '@/lib/domain';
import { cn } from '@/lib/cn';
import { useCanvasActions } from './actions';
import type { FlowEdge } from './flow';
import { LINK_WIDTHS, lookOf } from './linkOverride';

type Rect = { x: number; y: number; w: number; h: number };
const rectOf = (n: InternalNode): Rect => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  w: n.measured.width ?? 0,
  h: n.measured.height ?? 0,
});

/** Attach to the facing sides of the two cards: left/right when side by side, top/bottom when stacked. */
function anchors(a: Rect, b: Rect) {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) {
    const right = dx > 0;
    return {
      sx: right ? a.x + a.w : a.x, sy: a.y + a.h / 2, sp: right ? Position.Right : Position.Left,
      tx: right ? b.x : b.x + b.w, ty: b.y + b.h / 2, tp: right ? Position.Left : Position.Right,
    };
  }
  const down = dy > 0;
  return {
    sx: a.x + a.w / 2, sy: down ? a.y + a.h : a.y, sp: down ? Position.Bottom : Position.Top,
    tx: b.x + b.w / 2, ty: down ? b.y : b.y + b.h, tp: down ? Position.Top : Position.Bottom,
  };
}

type Pt = { x: number; y: number };

/** A polyline through the bend points with rounded corners. */
function routedPath(pts: Pt[], radius = 14) {
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const a = pts[i - 1]!;
    const b = pts[i + 1]!;
    const la = Math.hypot(p.x - a.x, p.y - a.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(radius, la / 2, lb / 2);
    const p1 = { x: p.x + ((a.x - p.x) / (la || 1)) * r, y: p.y + ((a.y - p.y) / (la || 1)) * r };
    const p2 = { x: p.x + ((b.x - p.x) / (lb || 1)) * r, y: p.y + ((b.y - p.y) / (lb || 1)) * r };
    d += ` L ${p1.x} ${p1.y} Q ${p.x} ${p.y} ${p2.x} ${p2.y}`;
  }
  const last = pts.at(-1)!;
  return `${d} L ${last.x} ${last.y}`;
}

const dot = (p: Pt): Rect => ({ x: p.x, y: p.y, w: 0, h: 0 });

export const LinkEdge = memo(function LinkEdge({ id, source, target, data, selected }: EdgeProps<FlowEdge>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const rf = useReactFlow();
  const actions = useCanvasActions();
  // bend points while dragging one (shown at once, saved on release)
  const [draft, setDraft] = useState<Pt[] | null>(null);
  if (!s || !t || !data) return null;
  const { link, override } = data;
  const saved = override?.waypoints ?? [];
  const way = draft ?? saved;
  const look = lookOf(override?.style);

  let path: string;
  let labelX: number;
  let labelY: number;
  let g: ReturnType<typeof anchors>;
  if (way.length) {
    // attach each end on the side facing its nearest bend point
    const a = anchors(rectOf(s), dot(way[0]!));
    const b = anchors(dot(way.at(-1)!), rectOf(t));
    g = { ...a, tx: b.tx, ty: b.ty, tp: b.tp };
    const pts = [{ x: g.sx, y: g.sy }, ...way, { x: g.tx, y: g.ty }];
    path = routedPath(pts);
    const mid = Math.floor((pts.length - 1) / 2);
    labelX = (pts[mid]!.x + pts[mid + 1]!.x) / 2;
    labelY = (pts[mid]!.y + pts[mid + 1]!.y) / 2;
  } else {
    g = anchors(rectOf(s), rectOf(t));
    [path, labelX, labelY] = getBezierPath({ sourceX: g.sx, sourceY: g.sy, sourcePosition: g.sp, targetX: g.tx, targetY: g.ty, targetPosition: g.tp, curvature: 0.35 });
  }

  const down = link.health.status === 'down';
  const directed = LINK_KIND[link.kind].directed;
  const colored = !!look.color && !selected && !down;
  const marker = directed ? (colored ? 'url(#shape-arrow)' : `url(#arrow-${selected ? 'selected' : down ? 'down' : 'default'})`) : undefined;
  const width = look.width ? LINK_WIDTHS[look.width] : undefined;
  const lineStyle = { ...(colored ? { stroke: 'var(--area)' } : {}), ...(width ? { strokeWidth: width } : {}) };
  const editable = selected && actions.viewer.canEdit;

  /** Drag bend point `i` of `pts`; save the route on release. */
  const drag = (e: React.PointerEvent, pts: Pt[], i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let cur = pts;
    setDraft(cur);
    const move = (ev: PointerEvent) => {
      const p = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      cur = cur.map((q, j) => (j === i ? p : q));
      setDraft(cur);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setDraft(null);
      actions.setWaypoints(link.id, cur);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  // a "+" in the middle of each segment: dragging it adds a bend there
  const ends = [{ x: g.sx, y: g.sy }, ...way, { x: g.tx, y: g.ty }];
  const mids = ends.slice(1).map((p, i) => ({ x: (ends[i]!.x + p.x) / 2, y: (ends[i]!.y + p.y) / 2, at: i }));

  return (
    <>
      {link.kind === 'storage_mount' ? (
        <>
          <path d={path} className={cn('edge-casing', selected && 'selected')} style={width ? { strokeWidth: width + 3 } : undefined} />
          <path d={path} className="edge-core" />
        </>
      ) : (
        <g className={look.color ? `area-${look.color}` : undefined}>
          <BaseEdge id={id} path={path} markerEnd={marker} className={cn('edge-path', link.kind, down && 'down', selected && 'selected')} style={lineStyle} interactionWidth={14} />
        </g>
      )}
      <circle cx={g.sx} cy={g.sy} r={3} className="fill-surface stroke-[var(--link-line)]" strokeWidth={1.5} />
      {!directed && <circle cx={g.tx} cy={g.ty} r={3} className="fill-surface stroke-[var(--link-line)]" strokeWidth={1.5} />}
      {(link.label || editable) && (
        <EdgeLabelRenderer>
          {link.label && (
            <div
              className="nodrag nopan pointer-events-auto absolute rounded-full border border-border bg-surface px-2 py-px font-mono text-[10.5px] font-medium text-muted"
              style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            >
              {link.label}
            </div>
          )}
          {editable && (
            <>
              {way.map((p, i) => (
                <div
                  key={`w${i}`}
                  title="Drag to move this bend · double-click to remove it"
                  onPointerDown={(e) => drag(e, way, i)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    actions.setWaypoints(link.id, way.filter((_, j) => j !== i));
                  }}
                  className="nodrag nopan pointer-events-auto absolute size-3 cursor-move rounded-full border-2 border-accent bg-surface shadow-sm"
                  style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }}
                />
              ))}
              {!draft &&
                mids.map((m) => (
                  <div
                    key={`m${m.at}`}
                    title="Drag to bend the link here"
                    onPointerDown={(e) => drag(e, [...way.slice(0, m.at), { x: m.x, y: m.y }, ...way.slice(m.at)], m.at)}
                    className="nodrag nopan pointer-events-auto absolute grid size-3.5 cursor-copy place-items-center rounded-full border border-accent/60 bg-surface text-[10px] leading-none text-accent opacity-70 hover:opacity-100"
                    style={{ transform: `translate(-50%, -50%) translate(${m.x}px, ${m.y}px)` }}
                  >
                    +
                  </div>
                ))}
            </>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
});

/** Arrowhead markers, one per color state (SVG markers can't inherit the edge's stroke). */
export function EdgeMarkers() {
  const marker = (id: string, color: string) => (
    <marker id={id} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 10 5 0 10z" style={{ fill: color }} />
    </marker>
  );
  return (
    <svg className="absolute size-0" aria-hidden>
      <defs>
        {marker('arrow-default', 'var(--link-line)')}
        {marker('arrow-down', 'var(--status-down)')}
        {marker('arrow-selected', 'var(--accent)')}
        {/* free-drawn arrows take the color of their own stroke */}
        <marker id="shape-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" style={{ fill: 'context-stroke' }} />
        </marker>
      </defs>
    </svg>
  );
}

export const edgeTypes = { link: LinkEdge };
