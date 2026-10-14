'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { WorkspaceShell } from '@/features/workspace/WorkspaceShell';

/**
 * The workspace screen lives in the layout, so it stays mounted when you switch canvases: the previous
 * canvas keeps showing until the next one has loaded, with no blank flash (DRA-59). The pages under it
 * (/w/{slug} and /w/{slug}/c/{canvas-id}) only name the route.
 */
export default function WorkspaceScreenLayout({ children }: { children: ReactNode }) {
  const { ws, canvasId } = useParams<{ ws: string; canvasId?: string }>();
  return (
    <>
      <WorkspaceShell slug={ws} canvasId={canvasId} />
      {children}
    </>
  );
}
