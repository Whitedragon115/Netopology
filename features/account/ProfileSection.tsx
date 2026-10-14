'use client';

import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Modal, ModalClose } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import type { Me } from '@/lib/api/types';
import { useAuthProviders, useSession } from '../auth/api';
import { Avatar, Panel, Row } from '../sections/parts';
import { useWorkspace } from '../workspace/context';
import { linkIdentityUrl, useChangePassword, useIdentities, useUnlinkIdentity, useUpdateMe } from './api';

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';

function accountError(e: unknown) {
  if (!(e instanceof ApiError)) return 'Could not reach the server.';
  if (e.code === 'auth.last_sign_in_method') return 'You need at least one way to sign in. Set a password or link another account first.';
  if (e.code === 'auth.invalid_credentials' || e.status === 401) return 'The current password is wrong.';
  return e.message;
}

/** Your own account: name, email, password and linked Google/Discord sign-ins. */
/** Settings → Profile: your name and email. */
export function ProfilePage() {
  const me = useSession().data;
  if (!me) return null;
  return <ProfilePanel me={me} />;
}

/** Settings → Password & sign-in: change your password, link Google or Discord. */
export function SecurityPage() {
  const me = useSession().data;
  if (!me) return null;
  return (
    <div className="grid content-start gap-4">
      <PasswordPanel me={me} />
      <SignInPanel />
    </div>
  );
}

function ProfilePanel({ me }: { me: Me }) {
  const { toast } = useWorkspace();
  const update = useUpdateMe();
  const [form, setForm] = useState({ displayName: me.displayName, email: me.email ?? '' });
  const dirty = form.displayName !== me.displayName || form.email !== (me.email ?? '');
  const emailError = form.email && !/^[^@\s]+@[^@\s]+$/.test(form.email) ? 'Not an email address.' : '';
  return (
    <Panel title="Profile">
      <Row label="Username" hint="Can't be changed">
        <span className="flex items-center gap-2.5">
          <Avatar name={me.displayName || me.username} />
          <span className="font-mono text-[13px]">@{me.username}</span>
        </span>
      </Row>
      <Row label="Display name">
        <Input value={form.displayName} maxLength={100} placeholder={me.username} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </Row>
      <Row label="Email" hint="Lets a Google/Discord sign-in with the same verified email link to you">
        <Field label="" error={emailError || undefined}>
          {(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
      </Row>
      <div className="mt-3.5 flex justify-end">
        <Button
          variant="primary"
          disabled={!dirty || !!emailError || update.isPending}
          onClick={() =>
            update.mutate(
              { displayName: form.displayName.trim(), email: form.email.trim() || null },
              { onSuccess: () => toast('Profile saved.'), onError: (e) => toast(accountError(e), 'danger') },
            )
          }
        >
          Save
        </Button>
      </div>
    </Panel>
  );
}

function PasswordPanel({ me }: { me: Me }) {
  const { toast } = useWorkspace();
  const change = useChangePassword();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const tooShort = f.next.length > 0 && f.next.length < 12;
  const mismatch = f.confirm.length > 0 && f.confirm !== f.next;
  return (
    <Panel
      title="Password"
      description={me.hasPassword ? 'Changing it keeps you signed in here.' : 'You sign in with Google/Discord only. Setting a first password needs a recent sign-in with one of them.'}
    >
      <form
        className="grid max-w-sm gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          change.mutate(
            { currentPassword: f.current, newPassword: f.next },
            { onSuccess: () => { setF({ current: '', next: '', confirm: '' }); toast('Password changed.'); }, onError: (err) => setError(accountError(err)) },
          );
        }}
      >
        {me.hasPassword && (
          <Field label="Current password">
            {(p) => <Input {...p} type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />}
          </Field>
        )}
        <Field label="New password" hint="At least 12 characters." error={tooShort ? 'At least 12 characters.' : undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />}
        </Field>
        <Field label="Confirm new password" error={mismatch ? 'Passwords do not match.' : undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />}
        </Field>
        {error && <p className="text-xs text-down">{error}</p>}
        <div>
          <Button type="submit" variant="primary" disabled={change.isPending || f.next.length < 12 || f.next !== f.confirm || (me.hasPassword && !f.current)}>
            {me.hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function SignInPanel() {
  const { toast } = useWorkspace();
  const identities = useIdentities();
  const providers = useAuthProviders();
  const unlink = useUnlinkIdentity();
  const linked = new Set(identities.data?.items.map((i) => i.provider));
  const available = providers.data?.providers ?? [];
  return (
    <Panel title="Sign-in methods" description="Google and Discord can only sign you in after you link them here (or a server admin set your email).">
      <div className="grid gap-2">
        <div className="flex items-center gap-3 rounded-sm border border-border px-3 py-2.5 text-[13px]">
          <span className="font-medium">Password</span>
          <span className="ml-auto text-xs text-faint">{identities.data?.hasPassword ? 'Set' : 'Not set'}</span>
        </div>
        {identities.data?.items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 rounded-sm border border-border px-3 py-2.5 text-[13px]">
            <span className="font-medium capitalize">{i.provider}</span>
            <span className="truncate text-xs text-muted">{i.email ?? i.displayName ?? ''}</span>
            <Modal
              title={`Unlink ${i.provider}?`}
              description={`You can no longer sign in with this ${i.provider} account until you link it again.`}
              trigger={<Button size="sm" variant="ghost" className="ml-auto">Unlink</Button>}
              footer={
                <>
                  <ModalClose asChild><Button>Cancel</Button></ModalClose>
                  <ModalClose asChild>
                    <Button variant="danger" onClick={() => unlink.mutate(i.id, { onSuccess: () => toast(`${i.provider} unlinked.`), onError: (e) => toast(accountError(e), 'danger') })}>Unlink</Button>
                  </ModalClose>
                </>
              }
            />
          </div>
        ))}
        {available
          .filter((p) => !linked.has(p.id))
          .map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-sm border border-dashed border-border-strong px-3 py-2.5 text-[13px]">
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-faint">Not linked</span>
              <a
                href={linkIdentityUrl(p.id)}
                onClick={(e) => {
                  if (MOCKING) {
                    e.preventDefault();
                    toast('Linking Google/Discord needs the real backend (the mock API is running).');
                  }
                }}
                className={buttonVariants({ size: 'sm' }) + ' ml-auto'}
              >
                Link {p.name}
              </a>
            </div>
          ))}
        {!available.length && <p className="text-xs text-faint">Google and Discord sign-in are not enabled on this server.</p>}
      </div>
    </Panel>
  );
}
