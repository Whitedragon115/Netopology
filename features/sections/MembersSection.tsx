'use client';

import { Info, LoaderCircle, Lock, LogOut, Plus, Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Chip } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Select, Switch } from '@/components/ui/controls';
import { Modal, ModalClose } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import type { Member, Role, User } from '@/lib/api/types';
import { useSession } from '../auth/api';
import { lookupUser, useAddMember, useCanvases, useMembers, useRemoveMember, useSetCanvasGrants, useUpdateMember } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { Avatar, SectionHeader } from './parts';

const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer'];
const ROLE_HINT: Record<Role, string> = {
  owner: 'Everything, including deleting the workspace',
  admin: 'Manage members, canvases and sharing',
  editor: 'Edit the canvases you grant them',
  viewer: 'Read only',
};

/** Human text for the member errors the API returns. */
function memberError(e: unknown) {
  if (!(e instanceof ApiError)) return 'Could not reach the server.';
  switch (e.code) {
    case 'member.last_owner':
      return 'A workspace needs at least one owner. Make someone else owner first.';
    case 'role.insufficient':
      return 'Your role does not allow this. Admins cannot change owners or grant the owner role.';
    case 'not_found':
      return 'No account with that username.';
    default:
      return e.message;
  }
}

export function MembersSection() {
  const { workspace, toast } = useWorkspace();
  const router = useRouter();
  const me = useSession().data;
  const members = useMembers(workspace.id);
  const canvases = useCanvases(workspace.id);
  const update = useUpdateMember(workspace.id);
  const remove = useRemoveMember(workspace.id);
  const myRole = workspace.membership.role;
  const manage = myRole === 'owner' || myRole === 'admin';
  const tabCanvases = (canvases.data ?? []).filter((c) => c.kind === 'tab');

  /** Admins can't change owners or make owners (permissions.md rule 7). */
  const canChange = (m: Member) => manage && (myRole === 'owner' || m.role !== 'owner');
  const roleChoices = myRole === 'owner' ? ROLES : ROLES.filter((r) => r !== 'owner');

  const setRole = (m: Member, role: Role) =>
    update.mutate(
      { userId: m.user.id, body: { role } },
      { onSuccess: () => toast(`${m.user.displayName || m.user.username} is now ${role}.`), onError: (e) => toast(memberError(e)) },
    );
  const setSensitive = (m: Member, canViewSensitive: boolean) =>
    update.mutate({ userId: m.user.id, body: { canViewSensitive } }, { onError: (e) => toast(memberError(e)) });

  return (
    <>
      <SectionHeader title="Members" badge={<Chip>{workspace.name}</Chip>} actions={manage && <AddMemberDialog canvases={tabCanvases} roleChoices={roleChoices} />} />
      <div className="overflow-auto px-5 pb-5">
        <div className="mb-3.5 flex gap-2.5 rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-[13px] text-muted">
          {manage ? <Info className="mt-0.5 size-4 shrink-0" /> : <Lock className="mt-0.5 size-4 shrink-0" />}
          {manage ? (
            <span>
              People need an account first. Accounts are created by the <b>server owner or a server admin</b>; there is no self-signup.
            </span>
          ) : (
            'Only the workspace owner and admins can change members.'
          )}
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="bg-surface-raised text-left text-xs text-faint">
                {(manage ? ['Member', 'Role', 'Sensitive info', 'Canvases', ''] : ['Member', 'Role', '']).map((h, i) => (
                  <th key={i} className="border-b border-border px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.data?.map((m) => {
                const self = m.user.id === me?.id;
                const name = m.user.displayName || m.user.username;
                return (
                  <tr key={m.user.id} className="[&>td]:border-b [&>td]:border-border last:[&>td]:border-0">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={name} />
                        <span>
                          <span className="block">{name}{self && <span className="text-faint"> (you)</span>}</span>
                          <span className="block font-mono text-2xs text-faint">@{m.user.username}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {canChange(m) && !self ? (
                        <Select aria-label={`Role of ${name}`} size="sm" value={m.role} onValueChange={(r) => setRole(m, r as Role)} className="capitalize" options={roleChoices.map((r) => ({ value: r, label: <span className="capitalize">{r}</span> }))} />
                      ) : (
                        <span className="capitalize" title={ROLE_HINT[m.role]}>{m.role}</span>
                      )}
                    </td>
                    {manage && (
                      <td className="px-3 py-2">
                        {m.role === 'owner' || m.role === 'admin' ? (
                          <Chip>Always</Chip>
                        ) : (
                          <label className="flex items-center gap-2 text-xs text-muted">
                            <Switch checked={!!m.canViewSensitive} onChange={(e) => setSensitive(m, e.target.checked)} aria-label={`${name} can see sensitive info`} />
                            {m.canViewSensitive ? 'Allowed' : 'Hidden'}
                          </label>
                        )}
                      </td>
                    )}
                    {manage && (
                      <td className="px-3 py-2">
                        {m.role === 'editor' ? <GrantsDialog member={m} canvases={tabCanvases} /> : <span className="text-faint">All canvases</span>}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      {self ? (
                        <ConfirmRemove
                          label="Leave"
                          title={`Leave ${workspace.name}?`}
                          text="You lose access to this workspace until someone adds you again."
                          pending={remove.isPending}
                          onConfirm={() =>
                            remove.mutate(m.user.id, { onSuccess: () => router.replace('/'), onError: (e) => toast(memberError(e)) })
                          }
                        />
                      ) : (
                        canChange(m) && (
                          <ConfirmRemove
                            label="Remove"
                            title={`Remove ${name}?`}
                            text={`${name} loses access to ${workspace.name}. Their account stays.`}
                            pending={remove.isPending}
                            onConfirm={() => remove.mutate(m.user.id, { onSuccess: () => toast(`Removed ${name}.`), onError: (e) => toast(memberError(e)) })}
                          />
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ConfirmRemove({ label, title, text, onConfirm, pending }: { label: string; title: string; text: string; onConfirm: () => void; pending: boolean }) {
  return (
    <Modal
      title={title}
      description={text}
      trigger={
        <Button size="sm" variant="ghost">
          {label === 'Leave' ? <LogOut className="size-3.5" /> : <Trash2 className="size-3.5" />}
          {label}
        </Button>
      }
      footer={
        <>
          <ModalClose asChild><Button>Cancel</Button></ModalClose>
          <ModalClose asChild><Button variant="danger" disabled={pending} onClick={onConfirm}>{label}</Button></ModalClose>
        </>
      }
    />
  );
}

/** Which canvases an editor may open and edit. */
function GrantsDialog({ member, canvases }: { member: Member; canvases: { id: string; name: string }[] }) {
  const { workspace, toast } = useWorkspace();
  const grants = useSetCanvasGrants(workspace.id);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const ids = member.canvasIds ?? [];
  const name = member.user.displayName || member.user.username;
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setPicked(new Set(ids));
      }}
      title={`Canvases for ${name}`}
      description="Editors only see and edit the canvases granted here, plus the inner canvases of areas drawn on them."
      trigger={
        <button type="button" className="flex flex-wrap items-center gap-1 rounded-sm px-1 py-0.5 text-left hover:bg-surface-raised">
          {ids.length ? ids.map((id) => <Chip key={id}>{canvases.find((c) => c.id === id)?.name ?? 'Canvas'}</Chip>) : <Chip dashed>None yet</Chip>}
          <span className="text-xs text-accent">Edit</span>
        </button>
      }
      footer={
        <>
          <ModalClose asChild><Button>Cancel</Button></ModalClose>
          <Button
            variant="primary"
            disabled={grants.isPending}
            onClick={() =>
              grants.mutate(
                { userId: member.user.id, canvasIds: [...picked] },
                { onSuccess: () => { setOpen(false); toast(`Canvas access for ${name} saved.`); }, onError: (e) => toast(memberError(e)) },
              )
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-1">
        {canvases.map((c) => (
          <label key={c.id} className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] hover:bg-surface-raised">
            <input
              type="checkbox"
              checked={picked.has(c.id)}
              onChange={(e) => {
                const next = new Set(picked);
                if (e.target.checked) next.add(c.id);
                else next.delete(c.id);
                setPicked(next);
              }}
              className="size-3.5 accent-[var(--accent)]"
            />
            {c.name}
          </label>
        ))}
        {!canvases.length && <p className="text-[13px] text-faint">This workspace has no canvases yet.</p>}
      </div>
    </Modal>
  );
}

/** Add an existing account (by exact username) with a role. */
function AddMemberDialog({ canvases, roleChoices }: { canvases: { id: string; name: string }[]; roleChoices: Role[] }) {
  const { workspace, toast } = useWorkspace();
  const add = useAddMember(workspace.id);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [found, setFound] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [role, setRole] = useState<Role>('viewer');
  const [sensitive, setSensitive] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const reset = () => {
    setUsername('');
    setFound(null);
    setError('');
    setRole('viewer');
    setSensitive(false);
    setPicked(new Set());
  };
  const find = async () => {
    if (!username.trim()) return;
    setSearching(true);
    setError('');
    try {
      setFound(await lookupUser(username.trim()));
    } catch (e) {
      setFound(null);
      setError(memberError(e));
    } finally {
      setSearching(false);
    }
  };
  const submit = () => {
    if (!found) return;
    add.mutate(
      {
        userId: found.id,
        role,
        ...(role === 'editor' || role === 'viewer' ? { canViewSensitive: sensitive } : {}),
        ...(role === 'editor' ? { canvasIds: [...picked] } : {}),
      },
      {
        onSuccess: () => {
          toast(`Added ${found.displayName || found.username} as ${role}.`);
          setOpen(false);
          reset();
        },
        onError: (e) => setError(e instanceof ApiError && e.status === 409 ? 'Already a member of this workspace.' : memberError(e)),
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      wide
      title="Add member"
      description="Find someone by their exact username. Ask a server admin to create the account first if they don't have one."
      trigger={<Button variant="primary"><Plus className="size-3.5" />Add member</Button>}
      footer={
        <>
          <ModalClose asChild><Button>Cancel</Button></ModalClose>
          <Button variant="primary" disabled={!found || add.isPending} onClick={submit}>Add</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <div className="flex-1">
            <Field label="Username" error={error || undefined}>
              {(p) => <Input {...p} autoFocus autoComplete="off" spellCheck={false} value={username} onChange={(e) => { setUsername(e.target.value); setFound(null); }} placeholder="e.g. chen" />}
            </Field>
          </div>
          <Button type="submit" disabled={searching || !username.trim()} className="mb-px h-9">
            {searching ? <LoaderCircle className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Find
          </Button>
        </form>
        {found && (
          <>
            <div className="flex items-center gap-2.5 rounded-sm border border-border bg-surface-raised px-3 py-2">
              <Avatar name={found.displayName || found.username} />
              <span className="text-[13px]">
                <span className="block font-medium">{found.displayName || found.username}</span>
                <span className="block font-mono text-2xs text-faint">@{found.username}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-[480px]:grid-cols-1">
              {roleChoices.map((r) => (
                <label key={r} className="flex cursor-pointer items-start gap-2.5 rounded-sm border border-border p-2.5 has-checked:border-accent has-checked:bg-accent-subtle">
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-0.5 accent-[var(--accent)]" />
                  <span>
                    <span className="block text-[13px] font-medium capitalize">{r}</span>
                    <span className="block text-xs text-muted">{ROLE_HINT[r]}</span>
                  </span>
                </label>
              ))}
            </div>
            {(role === 'editor' || role === 'viewer') && (
              <label className="flex items-center gap-2.5 text-[13px]">
                <Switch checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
                Can see sensitive info (IP addresses, CIDRs, sensitive notes)
              </label>
            )}
            {role === 'editor' && (
              <div>
                <div className="mb-1.5 text-xs font-medium">Canvases they may edit</div>
                <div className="flex flex-wrap gap-1.5">
                  {canvases.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs has-checked:border-accent has-checked:bg-accent-subtle has-checked:text-accent">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={picked.has(c.id)}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          setPicked(next);
                        }}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
