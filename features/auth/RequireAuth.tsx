'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession, useSetupStatus } from './api';

/**
 * Renders children only for a signed-in user. Otherwise sends the browser to first-run setup
 * (empty server) or to the sign-in page, remembering where it wanted to go.
 * The server enforces all of this anyway; this only decides which screen to show.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const setup = useSetupStatus();
  const session = useSession();

  const needsSetup = setup.data?.needsSetup;
  // decide only once both answers are in, so an empty server never flashes the sign-in page
  const signedOut = setup.isSuccess && session.isSuccess && session.data === null;
  useEffect(() => {
    if (needsSetup) router.replace('/setup');
    else if (signedOut) router.replace(path && path !== '/' ? `/login?next=${encodeURIComponent(path)}` : '/login');
  }, [needsSetup, signedOut, router, path]);

  if (session.data) return children;
  if (session.isError || setup.isError)
    return <CenteredMessage>Can&apos;t reach the server. Check that the backend is running, then reload.</CenteredMessage>;
  return <CenteredMessage>Loading…</CenteredMessage>;
}

export function CenteredMessage({ children }: { children: ReactNode }) {
  return <div className="grid h-full min-h-dvh place-items-center px-6 text-center text-[13px] text-faint">{children}</div>;
}
