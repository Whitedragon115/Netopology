'use client';

import { Check, Copy, KeyRound, Link2, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '@/components/status';
import { Button, IconButton } from '@/components/ui/button';
import { Select } from '@/components/ui/controls';
import { Modal } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import type { Canvas, ShareLink, ShareLinkUpdate } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { fullDate, isPast, relative } from '@/lib/time';
import { useWorkspace } from '../workspace/context';
import { useCreateShareLink, useRevokeShareLink, useShareLinks, useUpdateShareLink } from './api';

/*
 * Share a canvas with a read-only guest link (WP-12, permissions.md rule 7). Owners and admins only.
 * The link's token is shown once, right after it is created: the server keeps only its hash.
 */

const EXPIRY = [
  { value: 'never', label: 'Never expires' },
  { value: '1', label: 'Expires in 1 day' },
  { value: '7', label: 'Expires in 7 days' },
  { value: '30', label: 'Expires in 30 days' },
  { value: '90', label: 'Expires in 90 days' },
] as const;
type Expiry = (typeof EXPIRY)[number]['value'];
const expiresAt = (e: Expiry) => (e === 'never' ? undefined : new Date(Date.now() + Number(e) * 86_400_000).toISOString());

function problem(e: unknown) {
  if (e instanceof ApiError) return e.message;
  return 'Could not reach the server.';
}

export function ShareDialog({ open, onOpenChange, canvas }: { open: boolean; onOpenChange: (o: boolean) => void; canvas: Canvas }) {
  const { workspace, toast } = useWorkspace();
  const links = useShareLinks(workspace.id, canvas.id, open);
  const create = useCreateShareLink(workspace.id, canvas.id);
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState<Expiry>('never');
  const [created, setCreated] = useState<{ url: string; label: string } | null>(null);
  const [error, setError] = useState('');
  const pwError = password && password.length < 8 ? 'At least 8 characters.' : '';

  const reset = () => {
    setLabel('');
    setPassword('');
    setExpiry('never');
    setError('');
  };
  const submit = () =>
    create.mutate(
      { ...(label.trim() ? { label: label.trim() } : {}), ...(password ? { password } : {}), ...(expiresAt(expiry) ? { expiresAt: expiresAt(expiry) } : {}) },
      {
        onSuccess: (r) => {
          setCreated({ url: r.url, label: r.shareLink.label });
          reset();
        },
        onError: (e) => setError(problem(e)),
      },
    );

  const items = [...(links.data ?? [])].sort((a, b) => Number(state(a) !== 'active') - Number(state(b) !== 'active') || b.createdAt.localeCompare(a.createdAt));

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setCreated(null);
          reset();
        }
      }}
      wide
      title={`Share “${canvas.name}”`}
      description="Anyone with a link can view this canvas read-only, without an account. Guests never see sensitive values, health messages, notes marked sensitive or who made changes."
    >
      <div className="grid gap-5">
        {created ? (
          <div className="grid gap-2.5 rounded-md border border-accent/40 bg-accent-subtle p-3.5">
            <div className="flex items-center gap-2 text-[13px] font-medium text-text">
              <Check className="size-4 text-accent" />
              Link created{created.label ? `: ${created.label}` : ''}
            </div>
            <div className="flex gap-2">
              <Input readOnly value={created.url} aria-label="Share link" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="primary"
                className="h-9 shrink-0"
                onClick={() => {
                  void navigator.clipboard?.writeText(created.url).then(
                    () => toast('Link copied.'),
                    () => toast('Copy failed: select the link and copy it yourself.', 'danger'),
                  );
                }}
              >
                <Copy className="size-3.5" />
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted">Copy it now: for safety the link is shown only this once. You can make another one any time.</p>
            <div>
              <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Create another link</Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-3 rounded-md border border-border p-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pwError) submit();
            }}
          >
            <h3 className="text-sm font-semibold">New guest link</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Label" hint="Only you see it, e.g. “For the ISP”">{(p) => <Input {...p} value={label} maxLength={100} placeholder="Optional" onChange={(e) => setLabel(e.target.value)} />}</Field>
              <Field label="Password" hint="Optional. Guests type it before they see the map." error={pwError || undefined}>
                {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} placeholder="No password" onChange={(e) => setPassword(e.target.value)} />}
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label="Link expiry" value={expiry} onValueChange={setExpiry} options={EXPIRY.map((x) => ({ value: x.value, label: x.label }))} />
              <Button type="submit" variant="primary" className="ml-auto" disabled={create.isPending || !!pwError}>
                <Link2 className="size-3.5" />
                Create link
              </Button>
            </div>
            {error && <p role="alert" className="text-xs text-down">{error}</p>}
          </form>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold">Links to this canvas</h3>
          {links.isLoading ? (
            <p className="text-[13px] text-faint">Loading…</p>
          ) : items.length ? (
            <div className="overflow-hidden rounded-md border border-border">
              {items.map((l) => <LinkRow key={l.id} link={l} canvasId={canvas.id} />)}
            </div>
          ) : (
            <p className="text-[13px] text-faint">No links yet. Nobody outside the workspace can see this canvas.</p>
          )}
        </section>
      </div>
    </Modal>
  );
}

function state(l: ShareLink): 'active' | 'expired' | 'revoked' {
  if (l.revokedAt) return 'revoked';
  if (isPast(l.expiresAt)) return 'expired';
  return 'active';
}

/** One existing link: what it is, how much it was used, and change or revoke it. */
function LinkRow({ link, canvasId }: { link: ShareLink; canvasId: string }) {
  const { workspace, toast } = useWorkspace();
  const update = useUpdateShareLink(workspace.id, canvasId);
  const revoke = useRevokeShareLink(workspace.id, canvasId);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [label, setLabel] = useState(link.label);
  const [password, setPassword] = useState('');
  const [pwMode, setPwMode] = useState<'keep' | 'set' | 'remove'>('keep');
  const [expiry, setExpiry] = useState<Expiry | 'keep'>('keep');
  const s = state(link);

  const save = () => {
    const body: ShareLinkUpdate = {};
    if (label.trim() !== link.label) body.label = label.trim();
    if (pwMode === 'set') body.password = password;
    if (pwMode === 'remove') body.password = null;
    if (expiry !== 'keep') body.expiresAt = expiry === 'never' ? null : expiresAt(expiry)!;
    if (!Object.keys(body).length) return setEditing(false);
    update.mutate({ id: link.id, body }, { onSuccess: () => { setEditing(false); toast('Link updated.'); }, onError: (e) => toast(problem(e), 'danger') });
  };

  const meta = [
    link.hasPassword ? 'Password' : 'No password',
    s === 'revoked' ? `Revoked ${relative(link.revokedAt)}` : link.expiresAt ? (s === 'expired' ? `Expired ${relative(link.expiresAt)}` : `Expires ${relative(link.expiresAt)}`) : 'Never expires',
    `Opened ${link.useCount} time${link.useCount === 1 ? '' : 's'}${link.lastUsedAt ? `, last ${relative(link.lastUsedAt)}` : ''}`,
  ];

  return (
    <div className={cn('border-b border-border px-3.5 py-3 last:border-0', s !== 'active' && 'bg-surface-raised/60')}>
      <div className="flex items-center gap-3">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-sm', s === 'active' ? 'bg-accent-subtle text-accent' : 'bg-surface-raised text-faint')}>
          {link.hasPassword ? <KeyRound className="size-4" /> : <Link2 className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('truncate text-[13px] font-medium', !link.label && 'text-muted')}>{link.label || 'Untitled link'}</span>
            {s !== 'active' && <Chip>{s === 'revoked' ? 'Revoked' : 'Expired'}</Chip>}
          </div>
          <div className="truncate text-xs text-faint" title={`Created ${fullDate(link.createdAt)}`}>{meta.join(' · ')}</div>
        </div>
        {s !== 'revoked' && !confirm && (
          <>
            <IconButton label="Change link" pressed={editing} onClick={() => setEditing(!editing)}>
              <Pencil className="size-4" />
            </IconButton>
            <IconButton label="Revoke link" onClick={() => setConfirm(true)}>
              <Trash2 className="size-4" />
            </IconButton>
          </>
        )}
        {confirm && (
          <span className="flex items-center gap-1.5">
            <Button size="sm" variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate(link.id, { onSuccess: () => toast('Link revoked. It stopped working right away.'), onError: (e) => toast(problem(e), 'danger'), onSettled: () => setConfirm(false) })}>
              Revoke
            </Button>
            <IconButton label="Cancel" size="sm" onClick={() => setConfirm(false)}>
              <X className="size-3.5" />
            </IconButton>
          </span>
        )}
      </div>
      {editing && (
        <form
          className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field label="Label">{(p) => <Input {...p} value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} />}</Field>
          <Field label="Password">
            {(p) => (
              <div className="flex gap-2">
                <Select
                  aria-label="Password"
                  value={pwMode}
                  onValueChange={setPwMode}
                  options={[
                    { value: 'keep', label: link.hasPassword ? 'Keep password' : 'No password' },
                    { value: 'set', label: link.hasPassword ? 'New password' : 'Add password' },
                    ...(link.hasPassword ? [{ value: 'remove' as const, label: 'Remove password' }] : []),
                  ]}
                />
                {pwMode === 'set' && <Input {...p} type="password" autoComplete="new-password" value={password} placeholder="8+ characters" onChange={(e) => setPassword(e.target.value)} />}
              </div>
            )}
          </Field>
          <Select
            aria-label="Expiry"
            value={expiry}
            onValueChange={setExpiry}
            options={[{ value: 'keep', label: link.expiresAt ? `Keep: expires ${relative(link.expiresAt)}` : 'Keep: never expires' }, ...EXPIRY.map((x) => ({ value: x.value, label: x.label }))]}
          />
          <div className="flex items-center justify-end gap-2">
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={update.isPending || (pwMode === 'set' && password.length < 8)}>Save</Button>
          </div>
        </form>
      )}
    </div>
  );
}
