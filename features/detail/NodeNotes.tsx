'use client';

import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import type { Note } from '@/lib/api/types';
import { relative } from '@/lib/time';
import { useCreateNodeNote, useDeleteNodeNote, useUpdateNodeNote } from '../workspace/api';
import { useWorkspace } from '../workspace/context';

/*
 * The Notes tab of a node: notes *about* the node (target = node), not sticky notes on a canvas.
 * Editors and up can add, edit and delete them. Marking one sensitive hides it from people without
 * sensitive access, so only people who have that access can set it (they could not read it back otherwise).
 */

type Draft = { title: string; body: string; isSensitive: boolean };
const empty: Draft = { title: '', body: '', isSensitive: false };

export function NodeNotes({ nodeId, notes, loading, canEdit, canSensitive }: { nodeId: string; notes: Note[] | undefined; loading: boolean; canEdit: boolean; canSensitive: boolean }) {
  const { workspace, toast } = useWorkspace();
  const create = useCreateNodeNote(workspace.id, nodeId);
  const update = useUpdateNodeNote(workspace.id, nodeId);
  const del = useDeleteNodeNote(workspace.id, nodeId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Could not reach the server.');

  return (
    <div className="grid gap-2">
      {canEdit &&
        (adding ? (
          <NoteForm
            initial={empty}
            canSensitive={canSensitive}
            pending={create.isPending}
            onCancel={() => setAdding(false)}
            onSave={(d) => create.mutate({ title: d.title.trim(), body: d.body.trim(), isSensitive: d.isSensitive }, { onSuccess: () => setAdding(false), onError: fail })}
          />
        ) : (
          <Button size="sm" className="justify-self-start" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            Add note
          </Button>
        ))}
      {loading && <p className="text-[13px] text-faint">Loading…</p>}
      {notes?.map((n) =>
        n.redacted ? (
          <div key={n.id} className="flex items-center gap-1.5 rounded-sm border border-dashed border-border-strong px-3 py-2.5 text-[13px] text-faint">
            <Lock className="size-3.5" />
            Sensitive note · hidden for your role
          </div>
        ) : editing === n.id ? (
          <NoteForm
            key={n.id}
            initial={{ title: n.title, body: n.body, isSensitive: n.isSensitive }}
            canSensitive={canSensitive}
            pending={update.isPending}
            onCancel={() => setEditing(null)}
            onSave={(d) => update.mutate({ noteId: n.id, body: { title: d.title.trim(), body: d.body.trim(), isSensitive: d.isSensitive } }, { onSuccess: () => setEditing(null), onError: fail })}
          />
        ) : (
          <div key={n.id} className="group rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-[13px]">
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                {n.title && (
                  <div className="mb-0.5 flex items-center gap-1.5 font-semibold">
                    {n.isSensitive && <Lock className="size-3 text-faint" aria-label="Sensitive" />}
                    {n.title}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words text-muted">{n.body || <span className="text-faint">Empty note</span>}</div>
                <div className="mt-1 text-2xs text-faint">Edited {relative(n.updatedAt)}</div>
              </div>
              {canEdit &&
                (confirm === n.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="danger" disabled={del.isPending} onClick={() => del.mutate(n.id, { onError: fail, onSettled: () => setConfirm(null) })}>
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <IconButton size="sm" label="Edit note" onClick={() => setEditing(n.id)}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton size="sm" label="Delete note" onClick={() => setConfirm(n.id)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </span>
                ))}
            </div>
          </div>
        ),
      )}
      {!loading && !notes?.length && !adding && <p className="text-[13px] text-faint">No notes about this node yet.</p>}
    </div>
  );
}

function NoteForm({ initial, canSensitive, pending, onSave, onCancel }: { initial: Draft; canSensitive: boolean; pending: boolean; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState(initial);
  const ok = !!(d.title.trim() || d.body.trim());
  return (
    <form
      className="grid gap-2 rounded-sm border border-accent/50 bg-surface p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave(d);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && ok) onSave(d);
      }}
    >
      <Input aria-label="Note title" placeholder="Title (optional)" value={d.title} maxLength={200} className="h-8" onChange={(e) => setD({ ...d, title: e.target.value })} />
      <textarea
        aria-label="Note text"
        autoFocus
        rows={4}
        placeholder="Write something. Markdown is kept as typed."
        value={d.body}
        onChange={(e) => setD({ ...d, body: e.target.value })}
        className="w-full resize-y rounded-sm border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-3 focus:ring-ring"
      />
      <div className="flex items-center gap-2">
        {canSensitive && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <Switch checked={d.isSensitive} onChange={(e) => setD({ ...d, isSensitive: e.target.checked })} />
            <Lock className="size-3" />
            Sensitive
          </label>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary" disabled={!ok || pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
