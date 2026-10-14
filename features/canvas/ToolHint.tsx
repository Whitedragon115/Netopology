'use client';

import { CATEGORY, LINK_KIND } from '@/lib/domain';
import { Kbd } from '@/components/status';
import type { Tool } from '../workspace/store';

/** A small pill under the top edge telling you what the active tool expects next. */
export function ToolHint({ tool, linkSource }: { tool: Tool; linkSource: string | null }) {
  let text: string | null = null;
  switch (tool.kind) {
    case 'node':
      text = `Click to add a ${CATEGORY[tool.category].label.toLowerCase()} node (inside an area box to put it in that area)`;
      break;
    case 'area':
      text = 'Drag a rectangle around nodes to group them, or click for an empty area';
      break;
    case 'link':
      text = linkSource ? `Now click the node to connect ${linkSource} to` : `Click the first node of the ${LINK_KIND[tool.linkKind].label.toLowerCase()} link`;
      break;
    case 'note':
      text = 'Click to place a sticky note';
      break;
    case 'shape':
      text = {
        text: 'Click to add text',
        rectangle: 'Drag to draw a rectangle',
        ellipse: 'Drag to draw an ellipse',
        arrow: 'Drag to draw an arrow',
        freehand: 'Drag to draw freehand',
      }[tool.shape];
      break;
  }
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-muted shadow-lg" role="status">
      {text} · <Kbd>Esc</Kbd> to cancel
    </div>
  );
}
