'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CenteredMessage, RequireAuth } from '@/features/auth/RequireAuth';
import { useWorkspaces } from '@/features/workspace/api';

/** Entry: open the first workspace the user is a member of. */
export default function Home() {
  return (
    <RequireAuth>
      <OpenFirstWorkspace />
    </RequireAuth>
  );
}

function OpenFirstWorkspace() {
  const router = useRouter();
  const workspaces = useWorkspaces();
  const first = workspaces.data?.[0];
  useEffect(() => {
    if (first) router.replace(`/w/${first.slug}`);
  }, [first, router]);
  if (workspaces.data && !first)
    return (
      <CenteredMessage>
        You are not a member of any workspace yet.
        <br />
        Ask a workspace owner or a server admin to add you.
      </CenteredMessage>
    );
  return <CenteredMessage>Loading…</CenteredMessage>;
}
