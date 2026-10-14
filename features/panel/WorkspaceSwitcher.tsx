'use client';

import { Check, ChevronDown, Plus, Settings } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, ModalClose } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import type { Role } from '@/lib/api/types';
import { useSession } from '../auth/api';
import { useCreateWorkspace, useWorkspaces } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { useUi } from '../workspace/store';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

/** The workspace name at the top of the left panel: switch workspaces, open settings, create one (server staff). */
export function WorkspaceSwitcher() {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const all = useWorkspaces().data ?? [];
  const me = useSession().data;
  const openSettings = useUi((s) => s.openSettings);
  const staff = me?.instanceRole === 'owner' || me?.instanceRole === 'admin';
  const [creating, setCreating] = useState(false);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm p-1.5 text-left outline-none hover:bg-surface-raised focus-visible:ring-3 focus-visible:ring-ring data-[state=open]:bg-surface-raised">
            <Badge name={workspace.name} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{workspace.name}</span>
              <span className="block text-2xs text-faint">{ROLE_LABEL[workspace.membership.role]}</span>
            </span>
            <ChevronDown className="ml-auto size-3.5 shrink-0 text-faint" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={6} className="float-panel z-[60] w-64 p-1.5">
            <DropdownMenu.Label className="px-2 pt-1 pb-1.5 text-2xs font-semibold tracking-wider text-faint uppercase">Workspaces</DropdownMenu.Label>
            {all.map((w) => (
              <MenuItem key={w.id} onSelect={() => w.id !== workspace.id && router.push(`/w/${w.slug}`)}>
                <Badge name={w.name} small />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{w.name}</span>
                  <span className="block text-2xs text-faint">{ROLE_LABEL[w.membership.role]}</span>
                </span>
                {w.id === workspace.id && <Check className="size-4 text-accent" />}
              </MenuItem>
            ))}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <MenuItem onSelect={() => openSettings('workspace')}>
              <Settings className="size-4 text-muted" />
              Workspace settings
            </MenuItem>
            {staff && (
              <MenuItem onSelect={() => setCreating(true)}>
                <Plus className="size-4 text-muted" />
                New workspace
              </MenuItem>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function Badge({ name, small }: { name: string; small?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-sm bg-accent font-bold text-on-accent ${small ? 'size-6 text-xs' : 'size-7 text-[13px]'}`}>
      {name[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

function MenuItem({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className="flex cursor-default items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] outline-none select-none data-[highlighted]:bg-surface-raised">
      {children}
    </DropdownMenu.Item>
  );
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);

/** Server owner/admin: a new, empty workspace. You become its owner. */
function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState<string | null>(null); // null = follow the name
  const [error, setError] = useState('');
  const effective = slug ?? toSlug(name);
  const slugErr = effective && !SLUG.test(effective) ? 'Lowercase letters, digits and dashes.' : '';
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setName('');
      setSlug(null);
      setError('');
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="New workspace"
      description="A workspace is one network with its own inventory, canvases and members. You become its owner."
      footer={
        <>
          <ModalClose asChild><Button>Cancel</Button></ModalClose>
          <Button
            variant="primary"
            disabled={!name.trim() || !!slugErr || create.isPending}
            onClick={() =>
              create.mutate(
                { name: name.trim(), ...(effective ? { slug: effective } : {}) },
                {
                  onSuccess: (ws) => {
                    close(false);
                    router.push(`/w/${ws.slug}`);
                  },
                  onError: (e) => setError(e instanceof ApiError && e.code === 'slug.taken' ? 'That link name is already used.' : e instanceof Error ? e.message : 'Could not create it'),
                },
              )
            }
          >
            Create workspace
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Name">{(p) => <Input {...p} autoFocus value={name} maxLength={100} placeholder="e.g. Office network" onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Link name" hint={`Address: /w/${effective || '…'}`} error={slugErr || error || undefined}>
          {(p) => <Input {...p} value={effective} spellCheck={false} maxLength={63} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="font-mono" />}
        </Field>
      </div>
    </Modal>
  );
}
