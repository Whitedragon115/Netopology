'use client';

import { createContext, useContext } from 'react';
import type { ToastTone } from '@/components/toast';
import type { CanvasView, Workspace } from '@/lib/api/types';

export interface WorkspaceCtx {
  workspace: Workspace;
  canvasId: string;
  view: CanvasView | undefined;
  goToCanvas: (canvasId: string) => void;
  enterArea: (areaId: string) => Promise<void>;
  /** Open whichever canvas shows this node (current one first) and select it. */
  revealNode: (nodeId: string) => Promise<void>;
  toast: (message: string, tone?: ToastTone) => void;
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null);
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceContext');
  return ctx;
}
