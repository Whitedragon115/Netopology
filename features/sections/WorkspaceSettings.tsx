'use client';

import { Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Modal, ModalClose } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import { useDeleteWorkspace, useUpdateWorkspace } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { useUi } from '../workspace/store';
import { Panel, Row } from './parts';

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);

function settingsError(e: unknown) {
  if (!(e instanceof ApiError)) return 'Could not reach the server.';
  if (e.code === 'slug.taken') return 'Another workspace already uses that link name.';
  if (e.status === 412) return 'Someone else changed this workspace first. Reload and try again.';
  if (e.code === 'protected') return 'Only the workspace owner can do this while it is protected.';
  return e.message;
}

/** Workspace settings (the ⚙ button): name, link, description, protection, delete. */
export function WorkspaceSettings() {
  const { workspace, canvasId, toast } = useWorkspace();
  const router = useRouter();
  const openSection = useUi((s) => s.openSection);
  const update = useUpdateWorkspace();
  const role = workspace.membership.role;
  const manage = role === 'owner' || role === 'admin';
  const [form, setForm] = useState({ name: workspace.name, slug: workspace.slug, description: workspace.description });
  const [error, setError] = useState('');
  const dirty = form.name !== workspace.name || form.slug !== workspace.slug || form.description !== workspace.description;
  const slugError = form.slug && !SLUG.test(form.slug) ? 'Lowercase letters, digits and dashes; start with a letter or digit.' : '';

  // the link name follows the name while it still matches the old name (i.e. was never customized)
  const followsName = workspace.slug === toSlug(workspace.name);
  const setName = (name: string) => setForm({ ...form, name, ...(followsName && form.slug === toSlug(form.name) ? { slug: toSlug(name) || form.slug } : {}) });

  const save = async () => {
    setError('');
    const oldSlug = workspace.slug;
    try {
      // awaited, not an onSuccess callback: saving a new slug swaps the workspace under this screen,
      // which unmounts it before a component callback could run, so the move would never happen
      const ws = await update.mutateAsync({ ws: workspace, body: { name: form.name.trim(), slug: form.slug, description: form.description } });
      toast('Workspace saved.');
      if (ws.slug !== oldSlug) router.replace(`/w/${ws.slug}/c/${canvasId}`);
    } catch (e) {
      setError(settingsError(e));
    }
  };
  // admins may protect but not unprotect (permissions.md rule 6)
  const toggleProtected = (on: boolean) =>
    update.mutate(
      { ws: workspace, body: { isProtected: on } },
      { onSuccess: () => toast(on ? 'Workspace protected: only the owner can delete it.' : 'Protection removed.'), onError: (e) => toast(settingsError(e), 'danger') },
    );

  return (
    <>
      <div className="grid content-start gap-4">
        <Panel title="General">
          <Row label="Name">
            <Input value={form.name} maxLength={100} disabled={!manage} onChange={(e) => setName(e.target.value)} />
          </Row>
          <Row label="Link name" hint={`Used in the address: /w/${form.slug || '…'}`}>
            <Field label="" error={slugError || undefined}>
              {(p) => <Input {...p} value={form.slug} maxLength={63} disabled={!manage} spellCheck={false} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} className="font-mono" />}
            </Field>
          </Row>
          <Row label="Description" hint="Optional">
            <textarea
              value={form.description}
              disabled={!manage}
              rows={3}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full resize-y rounded-sm border border-border-strong bg-surface px-3 py-2 text-[13px] shadow-xs outline-none focus:border-accent focus:ring-3 focus:ring-ring disabled:opacity-50"
            />
          </Row>
          {manage && (
            <div className="mt-3.5 flex items-center justify-end gap-3">
              {error && <span className="text-xs text-down">{error}</span>}
              <Button disabled={!dirty || update.isPending} onClick={() => setForm({ name: workspace.name, slug: workspace.slug, description: workspace.description })}>Reset</Button>
              <Button variant="primary" disabled={!dirty || !form.name.trim() || !!slugError || update.isPending} onClick={save}>Save changes</Button>
            </div>
          )}
          {!manage && <p className="mt-3 text-xs text-faint">Only the workspace owner and admins can change settings.</p>}
        </Panel>

        {manage && (
          <Panel title="Protection" description="A protected workspace can't be deleted by accident. Only the owner can remove protection.">
            <label className="flex items-center gap-3 text-[13px]">
              <Switch
                checked={workspace.isProtected}
                disabled={update.isPending || (workspace.isProtected && role !== 'owner')}
                onChange={(e) => toggleProtected(e.target.checked)}
              />
              <Shield className="size-4 text-muted" />
              {workspace.isProtected ? 'Protected' : 'Not protected'}
              {workspace.isProtected && role !== 'owner' && <span className="text-xs text-faint">(only the owner can turn this off)</span>}
            </label>
          </Panel>
        )}

        {role === 'owner' && <DeletePanel onDeleted={() => { openSection(null); router.replace('/'); }} />}
      </div>
    </>
  );
}

function DeletePanel({ onDeleted }: { onDeleted: () => void }) {
  const { workspace, toast } = useWorkspace();
  const del = useDeleteWorkspace();
  const [typed, setTyped] = useState('');
  return (
    <Panel danger title="Delete workspace" description="Deletes every canvas, node, link, area, note and member of this workspace. This can't be undone.">
      {workspace.isProtected ? (
        <p className="text-[13px] text-muted">Turn off protection first.</p>
      ) : (
        <Modal
          title={`Delete ${workspace.name}?`}
          description={<>Type <b>{workspace.slug}</b> to confirm. Everything in it is deleted for everyone.</>}
          onOpenChange={(o) => !o && setTyped('')}
          trigger={<Button variant="danger">Delete workspace</Button>}
          footer={
            <>
              <ModalClose asChild><Button>Cancel</Button></ModalClose>
              <Button
                variant="danger"
                disabled={typed !== workspace.slug || del.isPending}
                onClick={() => del.mutate(workspace, { onSuccess: () => { toast(`Deleted ${workspace.name}.`); onDeleted(); }, onError: (e) => toast(settingsError(e), 'danger') })}
              >
                Delete for good
              </Button>
            </>
          }
        >
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={workspace.slug} aria-label="Type the link name to confirm" className="font-mono" />
        </Modal>
      )}
    </Panel>
  );
}
