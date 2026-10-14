'use client';

import { createContext, useContext } from 'react';
import type { CanvasView } from '@/lib/api/types';

/** Actions custom canvas nodes can trigger (provided by CanvasArea). */
export interface CanvasActions {
  viewer: CanvasView['viewer'];
  toggleCollapse: (placementId: string, collapsed: boolean) => void;
  enterArea: (areaId: string) => void;
  leaveArea: () => void;
  /** Save a new size (and top-left, which moves when resizing from the left/top edge). */
  resize: (flowNodeId: string, rect: { x: number; y: number; width: number; height: number }) => void;
  /** Save edited text of a sticky note or a text shape. */
  commitText: (target: { type: 'note' | 'shape'; id: string }, text: string) => void;
  /** Save a link's route on this canvas (bend points in canvas coordinates; empty = straight again). */
  setWaypoints: (linkId: string, points: { x: number; y: number }[]) => void;
  /** Flow node id currently being edited in place (double-click), or null. */
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}

export const CanvasActionsContext = createContext<CanvasActions | null>(null);
export function useCanvasActions() {
  const ctx = useContext(CanvasActionsContext);
  if (!ctx) throw new Error('useCanvasActions must be used inside CanvasActionsContext');
  return ctx;
}
