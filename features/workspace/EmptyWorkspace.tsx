'use client';

import { ArrowRight, Layers, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import type { Workspace } from '@/lib/api/types';
import { useLogout } from '../auth/api';
import { useCreateCanvas, useWorkspaces } from './api';

/**
 * A workspace without any canvas you can open: owners/admins create the first one; everyone can
 * switch to another workspace or sign out (the side panel needs a canvas, so it isn't shown here).
 */
export function EmptyWorkspace({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const create = useCreateCanvas(workspace.id);
  const others = (useWorkspaces().data ?? []).filter((w) => w.id !== workspace.id);
  const logout = useLogout();
  const [name, setName] = useState('Overview');
  const canCreate = workspace.membership.role === 'owner' || workspace.membership.role === 'admin';

  return (
    <main className="auth-backdrop grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="float-panel w-full max-w-[420px] p-7 max-[480px]:p-5">
        <div className="mb-1 flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-sm bg-accent text-sm font-bold text-on-accent">{workspace.name[0]?.toUpperCase()}</span>
          <h1 className="text-lg font-semibold">{workspace.name}</h1>
        </div>
        {canCreate ? (
          <>
            <p className="mt-2 text-[13px] text-muted">No canvases yet. A canvas is one view of this workspace&apos;s network: physical cabling, services, a traffic path…</p>
            <form
              className="mt-5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) create.mutate(name.trim(), { onSuccess: (c) => router.push(`/w/${workspace.slug}/c/${c.id}`) });
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} aria-label="First canvas name" />
              <Button type="submit" variant="primary" className="h-9 shrink-0" disabled={!name.trim() || create.isPending}>
                <Layers className="size-3.5" />
                Create canvas
              </Button>
            </form>
            {create.isError && <p role="alert" className="mt-2 text-xs text-down">{create.error.message}</p>}
          </>
        ) : (
          <p className="mt-2 text-[13px] text-muted">There are no canvases you can open here yet. Ask a workspace owner or admin to give you access.</p>
        )}
        {others.length > 0 && (
          <div className="mt-6">
            <div className="mb-1.5 text-2xs font-semibold tracking-wider text-faint uppercase">Other workspaces</div>
            <div className="grid gap-0.5">
              {others.map((w) => (
                <Link key={w.id} href={`/w/${w.slug}`} className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] hover:bg-surface-raised">
                  <span className="grid size-6 place-items-center rounded-sm bg-accent-subtle text-xs font-bold text-accent">{w.name[0]?.toUpperCase()}</span>
                  {w.name}
                  <ArrowRight className="ml-auto size-3.5 text-faint" />
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}>
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
