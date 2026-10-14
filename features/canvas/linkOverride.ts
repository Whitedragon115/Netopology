import type { CanvasView, Point } from '@/lib/api/types';
import type { LocalOp } from './local';

/**
 * How one link is drawn on one canvas (OpLinkOverride): its route (bend points, absolute canvas
 * coordinates) and its look. Other canvases keep drawing the link with the defaults.
 */
export const LINK_COLORS = ['gray', 'blue', 'teal', 'green', 'yellow', 'rose', 'violet'] as const;
export type LinkColor = (typeof LINK_COLORS)[number];
export const LINK_WIDTHS = { thin: 1.25, normal: 2, thick: 3.5 } as const;
export type LinkWidth = keyof typeof LINK_WIDTHS;

export type LinkLook = { color?: LinkColor; width?: LinkWidth };

/** The look stored in an override's free-form style object. */
export function lookOf(style: Record<string, unknown> | undefined): LinkLook {
  const color = LINK_COLORS.find((c) => c === style?.color);
  const width = (['thin', 'normal', 'thick'] as const).find((w) => w === style?.width);
  return { ...(color ? { color } : {}), ...(width ? { width } : {}) };
}

/** The operations that change a link's override, and the ones that put it back as it is now (for undo). */
export function overrideEdit(view: CanvasView, linkId: string, patch: { style?: Record<string, unknown>; waypoints?: Point[] | null }) {
  const prev = view.linkOverrides.find((o) => o.linkId === linkId);
  const next = {
    style: patch.style ?? prev?.style ?? {},
    waypoints: patch.waypoints !== undefined ? patch.waypoints : (prev?.waypoints ?? null),
  };
  // nothing left to override: drop the override instead of storing an empty one
  const empty = !Object.keys(next.style).length && !next.waypoints?.length && !prev?.hidden;
  const ops: LocalOp[] = [empty ? { op: 'link.reset', linkId } : { op: 'link.override', linkId, style: next.style, waypoints: next.waypoints?.length ? next.waypoints : null }];
  const inverse: LocalOp[] = [
    prev ? { op: 'link.override', linkId, hidden: prev.hidden, style: prev.style, waypoints: prev.waypoints ?? null } : { op: 'link.reset', linkId },
  ];
  return { ops, inverse };
}
