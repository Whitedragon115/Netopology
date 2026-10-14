import type { ReactNode } from 'react';
import { RequireAuth } from '@/features/auth/RequireAuth';

/** Everything under /w/ needs a signed-in user. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
