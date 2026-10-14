'use client';

import { KeyRound, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Select, Switch } from '@/components/ui/controls';
import { Modal, ModalClose } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import type { Account, Me } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { useSession } from '../auth/api';
import { Avatar, Panel, Row } from '../sections/parts';
import { useWorkspace } from '../workspace/context';
import { useCreateUser, useInstanceSettings, useResetPassword, useUpdateInstanceSettings, useUpdateUser, useUsers } from './api';

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{1,38}[A-Za-z0-9]$/;
const ROLE = { owner: 'Server owner', admin: 'Server admin', member: 'Member' } as const;

function adminError(e: unknown) {
  if (!(e instanceof ApiError)) return 'Could not reach the server.';
  if (e.status === 409) return e.message || 'That username or email is already used.';
  if (e.code === 'role.insufficient' || e.status === 403) return 'Server admins cannot change the server owner or other admins, or grant admin.';
  return e.message;
}

/**
 * Server administration (server owner and server admins): accounts and server settings.
 * This is the server, not the workspace: it gives no access to anyone's workspace content.
 */
export function AccountsPage() {
  const me = useSession().data;
  if (!me || (me.instanceRole !== 'owner' && me.instanceRole !== 'admin')) return null;
  return <Accounts me={me} />;
}

/** The "New account" button for the Accounts page header. */
export function AccountsActions() {
  const me = useSession().data;
  if (!me || (me.instanceRole !== 'owner' && me.instanceRole !== 'admin')) return null;
  return <CreateAccountDialog me={me} />;
}

export function ServerSettingsPage() {
  const me = useSession().data;
  if (!me || (me.instanceRole !== 'owner' && me.instanceRole !== 'admin')) return null;
  return <ServerSettings />;
}

function Accounts({ me }: { me: Me }) {
  const { toast } = useWorkspace();
  const [q, setQ] = useState('');
  const users = useUsers(q.trim());
  const update = useUpdateUser();
  const isOwner = me.instanceRole === 'owner';
  // server admins can't modify the owner or other admins (permissions.md, Instance)
  const canEdit = (a: Account) => a.id !== me.id && (isOwner || a.instanceRole === 'member');
  const save = (a: Account, body: Parameters<typeof update.mutate>[0]['body'], done: string) =>
    update.mutate({ userId: a.id, body }, { onSuccess: () => toast(done), onError: (e) => toast(adminError(e)) });

  return (
    <>
      <p className="mb-3.5 text-[13px] text-muted">
        Everyone who can sign in to this server. Add people to a workspace from that workspace&apos;s Members page.
      </p>
      <label className="relative mb-3 inline-block">
        <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username or name…" aria-label="Search accounts" className="h-8 w-64 rounded-sm border border-border-strong bg-surface pr-3 pl-8.5 text-[13px] shadow-xs focus:border-accent focus:outline-none" />
      </label>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="bg-surface-raised text-left text-xs text-faint">
              {['Account', 'Email', 'Server role', 'Sign-in', 'Status', ''].map((h, i) => <th key={i} className="border-b border-border px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {users.data?.items.map((a) => {
              const name = a.displayName || a.username;
              const editable = canEdit(a);
              return (
                <tr key={a.id} className={cn('[&>td]:border-b [&>td]:border-border last:[&>td]:border-0', a.status === 'disabled' && 'opacity-60')}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={name} />
                      <span>
                        <span className="block">{name}{a.id === me.id && <span className="text-faint"> (you)</span>}</span>
                        <span className="block font-mono text-2xs text-faint">@{a.username}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted">{a.email ?? <span className="text-faint">-</span>}</td>
                  <td className="px-3 py-2">
                    {editable && a.instanceRole !== 'owner' ? (
                      <Select
                        aria-label={`Server role of ${name}`}
                        value={a.instanceRole}
                        disabled={!isOwner}
                        title={isOwner ? undefined : 'Only the server owner can grant admin'}
                        size="sm"
                        options={[{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Server admin' }]}
                        onValueChange={(v) => save(a, { instanceRole: v as Account['instanceRole'] }, `${name} is now ${ROLE[v as Account['instanceRole']].toLowerCase()}.`)}
                      />
                    ) : (
                      ROLE[a.instanceRole]
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {a.hasPassword && <Chip>Password</Chip>}
                      {a.identities.map((p) => <Chip key={p}>{p === 'google' ? 'Google' : 'Discord'}</Chip>)}
                      {!a.hasPassword && !a.identities.length && <Chip dashed>None yet</Chip>}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <Switch
                          checked={a.status === 'active'}
                          onChange={(e) => save(a, { status: e.target.checked ? 'active' : 'disabled' }, e.target.checked ? `${name} can sign in again.` : `${name} is disabled and signed out everywhere.`)}
                          aria-label={`${name} can sign in`}
                        />
                        {a.status === 'active' ? 'Active' : 'Disabled'}
                      </label>
                    ) : (
                      <span className="capitalize">{a.status}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {editable && <ResetPasswordDialog account={a} />}
                    {isOwner && a.id !== me.id && a.status === 'active' && <TransferDialog account={a} />}
                  </td>
                </tr>
              );
            })}
            {users.data && !users.data.items.length && <tr><td colSpan={6} className="px-3 py-4 text-faint">No accounts match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CreateAccountDialog({ me }: { me: Me }) {
  const { toast } = useWorkspace();
  const create = useCreateUser();
  const empty = { username: '', displayName: '', email: '', password: '', admin: false };
  const [f, setF] = useState(empty);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const userErr = f.username && !USERNAME.test(f.username) ? '3–40 characters: letters, digits, dot, dash, underscore.' : '';
  const pwErr = f.password && f.password.length < 12 ? 'At least 12 characters.' : '';
  const emailErr = f.email && !/^[^@\s]+@[^@\s]+$/.test(f.email) ? 'Not an email address.' : '';
  const ok = USERNAME.test(f.username) && !pwErr && !emailErr && (f.password || f.email);
  return (
    <Modal
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) { setF(empty); setError(''); } }}
      title="Create account"
      description="Give it a password, an email, or both. With an email, the person's first Google/Discord sign-in with that verified email links automatically."
      trigger={<Button variant="primary"><Plus className="size-3.5" />Create account</Button>}
      footer={
        <>
          <ModalClose asChild><Button>Cancel</Button></ModalClose>
          <Button
            variant="primary"
            disabled={!ok || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  username: f.username,
                  ...(f.displayName.trim() ? { displayName: f.displayName.trim() } : {}),
                  ...(f.email.trim() ? { email: f.email.trim() } : {}),
                  ...(f.password ? { password: f.password } : {}),
                  instanceRole: f.admin ? 'admin' : 'member',
                },
                { onSuccess: (a) => { toast(`Account @${a.username} created. Add them to a workspace from its Members page.`); setOpen(false); setF(empty); }, onError: (e) => setError(adminError(e)) },
              )
            }
          >
            Create
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
          <Field label="Username" error={userErr || undefined}>{(p) => <Input {...p} autoFocus autoComplete="off" spellCheck={false} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />}</Field>
          <Field label="Display name" optional>{(p) => <Input {...p} value={f.displayName} maxLength={100} onChange={(e) => setF({ ...f, displayName: e.target.value })} />}</Field>
        </div>
        <Field label="Email" optional error={emailErr || undefined}>{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label="Password" optional hint="Leave empty for a Google/Discord-only account (then an email is required)." error={pwErr || undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}
        </Field>
        {me.instanceRole === 'owner' && (
          <label className="flex items-center gap-2.5 text-[13px]">
            <Switch checked={f.admin} onChange={(e) => setF({ ...f, admin: e.target.checked })} />
            Server admin (can create accounts and workspaces)
          </label>
        )}
        {error && <p className="text-xs text-down">{error}</p>}
      </div>
    </Modal>
  );
}

function ResetPasswordDialog({ account }: { account: Account }) {
  const { toast } = useWorkspace();
  const reset = useResetPassword();
  const [pw, setPw] = useState('');
  const name = account.displayName || account.username;
  return (
    <Modal
      title={`Reset password for ${name}`}
      description="Sets a new password and signs them out everywhere. Tell them the new password yourself."
      onOpenChange={(o) => !o && setPw('')}
      trigger={<Button size="sm" variant="ghost"><KeyRound className="size-3.5" />Reset password</Button>}
      footer={
        <>
          <ModalClose asChild><Button>Cancel</Button></ModalClose>
          <ModalClose asChild>
            <Button variant="primary" disabled={pw.length < 12 || reset.isPending} onClick={() => reset.mutate({ userId: account.id, newPassword: pw }, { onSuccess: () => toast(`Password reset for ${name}.`), onError: (e) => toast(adminError(e)) })}>
              Reset
            </Button>
          </ModalClose>
        </>
      }
    >
      <Field label="New password" hint="At least 12 characters.">{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
    </Modal>
  );
}

/** Server owner only: hand the server over; you become a server admin. */
function TransferDialog({ account }: { account: Account }) {
  const { toast } = useWorkspace();
  const update = useUpdateUser();
  const name = account.displayName || account.username;
  return (
    <Modal
      title={`Make ${name} the server owner?`}
      description="You become a server admin. Only the new owner can give ownership back. Workspace roles don't change."
      trigger={<Button size="sm" variant="ghost">Make owner</Button>}
      footer={
        <>
          <ModalClose asChild><Button>Cancel</Button></ModalClose>
          <ModalClose asChild>
            <Button variant="danger" onClick={() => update.mutate({ userId: account.id, body: { instanceRole: 'owner' } }, { onSuccess: () => toast(`${name} is now the server owner.`), onError: (e) => toast(adminError(e)) })}>
              Transfer ownership
            </Button>
          </ModalClose>
        </>
      }
    />
  );
}

function ServerSettings() {
  const { toast } = useWorkspace();
  const settings = useInstanceSettings();
  const update = useUpdateInstanceSettings();
  const [hours, setHours] = useState<string | null>(null);
  if (!settings.data) return <p className="text-[13px] text-faint">Loading…</p>;
  const s = settings.data;
  const ttl = hours ?? String(s.sessionTtlHours ?? 168);
  const ttlOk = /^\d+$/.test(ttl) && Number(ttl) >= 1 && Number(ttl) <= 8760;
  return (
    <div className="grid gap-4">
      <Panel title="Sign-in">
        <Row label="Session length" hint="Hours without activity before you have to sign in again (1–8760)">
          <div className="flex items-center gap-2">
            <Input value={ttl} onChange={(e) => setHours(e.target.value)} inputMode="numeric" className="w-28" />
            <span className="text-xs text-faint">hours ({ttlOk ? `${Math.round(Number(ttl) / 24)} days` : 'invalid'})</span>
            <Button
              variant="primary"
              size="sm"
              disabled={!ttlOk || Number(ttl) === s.sessionTtlHours || update.isPending}
              onClick={() => update.mutate({ ...s, sessionTtlHours: Number(ttl) }, { onSuccess: () => { setHours(null); toast('Session length saved. It applies to new sign-ins.'); }, onError: (e) => toast(adminError(e)) })}
            >
              Save
            </Button>
          </div>
        </Row>
        <Row label="Link by email" hint="A first Google/Discord sign-in links to the account with the same provider-verified email">
          <Switch
            checked={s.oauthAutoLinkByEmail ?? true}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ ...s, oauthAutoLinkByEmail: e.target.checked }, { onError: (err) => toast(adminError(err)) })}
            aria-label="Link Google/Discord sign-ins by verified email"
          />
        </Row>
      </Panel>
      <p className="text-xs text-faint">Google and Discord client credentials are set in the server&apos;s environment, not here.</p>
    </div>
  );
}
