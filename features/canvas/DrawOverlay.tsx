'use client';

import { useReactFlow } from '@xyflow/react';
import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import type { Tool } from '../workspace/store';

type Pt = { x: number; y: number };
/** Everything in flow coordinates (the same space as placements and shapes). */
export interface DrawResult {
  start: Pt;
  rect: { x: number; y: number; w: number; h: number };
  points: Pt[];
  /** No real drag happened: the tool should use a default size at `start`. */
  click: boolean;
}

/**
 * A transparent layer over the canvas while a "create" tool is active. It turns one press-drag-release
 * into a rectangle / line / freehand path and shows a preview, so the canvas below doesn't pan or select.
 */
export function DrawOverlay({ tool, onDraw }: { tool: Tool; onDraw: (d: DrawResult) => void }) {
  const rf = useReactFlow();
  const ref = useRef<HTMLDivElement>(null);
  // the ref is the truth (events can arrive faster than React re-renders); state only drives the preview
  const dragRef = useRef<{ start: Pt; cur: Pt; path: Pt[] } | null>(null);
  const [drag, setDragState] = useState<{ start: Pt; cur: Pt; path: Pt[] } | null>(null);
  const setDrag = (d: { start: Pt; cur: Pt; path: Pt[] } | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  const local = (e: PointerEvent): Pt => {
    const b = ref.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const toFlow = (p: Pt): Pt => {
    const b = ref.current!.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: p.x + b.left, y: p.y + b.top });
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no capturable pointer */
    }
    const p = local(e);
    setDrag({ start: p, cur: p, path: [p] });
  };
  const onMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = local(e);
    const last = d.path.at(-1)!;
    const far = Math.hypot(p.x - last.x, p.y - last.y) > 3;
    setDrag({ ...d, cur: p, path: far ? [...d.path, p] : d.path });
  };
  const onUp = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    // the release point counts even if no move event reported it
    const cur = local(e);
    const { start } = d;
    const last = d.path.at(-1)!;
    const path = last.x === cur.x && last.y === cur.y ? d.path : [...d.path, cur];
    setDrag(null);
    const a = toFlow(start);
    const b = toFlow(cur);
    onDraw({
      start: a,
      rect: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) },
      points: path.map(toFlow),
      click: Math.hypot(cur.x - start.x, cur.y - start.y) < 6,
    });
  };
  // keep zooming available while drawing
  const onWheel = (e: WheelEvent) => {
    if (e.deltaY < 0) void rf.zoomIn({ duration: 80 });
    else void rf.zoomOut({ duration: 80 });
  };

  const shape = tool.kind === 'shape' ? tool.shape : tool.kind;
  const x = drag ? Math.min(drag.start.x, drag.cur.x) : 0;
  const y = drag ? Math.min(drag.start.y, drag.cur.y) : 0;
  const w = drag ? Math.abs(drag.cur.x - drag.start.x) : 0;
  const h = drag ? Math.abs(drag.cur.y - drag.start.y) : 0;

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-[5] cursor-crosshair touch-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
      onWheel={onWheel}
      aria-label="Drawing area: click or drag to place"
    >
      {drag && (
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          {(shape === 'area' || shape === 'rectangle') && <rect x={x} y={y} width={w} height={h} rx={shape === 'area' ? 10 : 6} className="draw-preview" />}
          {shape === 'ellipse' && <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} className="draw-preview" />}
          {shape === 'arrow' && <line x1={drag.start.x} y1={drag.start.y} x2={drag.cur.x} y2={drag.cur.y} className="draw-preview-line" markerEnd="url(#shape-arrow)" />}
          {shape === 'freehand' && <polyline points={drag.path.map((p) => `${p.x},${p.y}`).join(' ')} className="draw-preview-line" />}
        </svg>
      )}
    </div>
  );
}
