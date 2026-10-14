'use client';

import { EyeOff, Lock, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '@/components/status';
import { Button, IconButton } from '@/components/ui/button';
import { Select, Switch } from '@/components/ui/controls';
import { Modal, ModalClose } from '@/components/ui/dialog';
import { Field as FormField, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import type { Field, InvNode, NodeCategory, NodeUpdate } from '@/lib/api/types';
import { CATEGORIES, CATEGORY, NODE_TYPES, nodeType } from '@/lib/domain';
import { useAreas, useDeleteNode, useNodeUsage, useUpdateNode } from '../workspace/api';
import { useWorkspace } from '../workspace/context';

/*
 * Edit or delete a node from the Inventory page, without opening a canvas.
 * Fields: a sensitive value you can't read stays hidden and is sent back as received, which keeps its
 * stored value (contract: NodeUpdate.properties).
 */

type Row = Field & { _id: number };
let rowId = 0;
const toKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 40) || 'field';

function problem(e: unknown) {
  if (e instanceof ApiError) return e.code === 'protected' ? 'This node is protected. Only an owner or admin can change that.' : e.message;
  return 'Could not reach the server.';
}

export function EditNodeDialog({ node, open, onOpenChange }: { node: InvNode; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { workspace, toast } = useWorkspace();
  const areas = useAreas(workspace.id);
  const update = useUpdateNode(workspace.id);
  const manage = workspace.membership.role === 'owner' || workspace.membership.role === 'admin';
  const init = () => ({
    name: node.name,
    category: node.category,
    type: node.type,
    areaId: node.areaId ?? 'none',
    description: node.description,
    isProtected: node.isProtected,
    fields: node.properties.map((f): Row => ({ ...f, _id: ++rowId })),
  });
  const [f, setF] = useState(init);
  const [error, setError] = useState('');

  const types = Object.entries(NODE_TYPES).filter(([, t]) => t.category === f.category);
  if (!types.some(([id]) => id === f.type)) types.unshift([f.type, nodeType(f.type)]);
  const keys = f.fields.map((r) => r.key);
  const dupKey = keys.find((k, i) => keys.indexOf(k) !== i);
  const invalid = !f.name.trim() || f.fields.some((r) => !r.label.trim()) || !!dupKey;

  const setRow = (id: number, patch: Partial<Row>) => setF({ ...f, fields: f.fields.map((r) => (r._id === id ? { ...r, ...patch } : r)) });

  const save = () => {
    const body: NodeUpdate = {};
    if (f.name.trim() !== node.name) body.name = f.name.trim();
    if (f.category !== node.category) body.category = f.category;
    if (f.type !== node.type) body.type = f.type;
    const areaId = f.areaId === 'none' ? null : f.areaId;
    if (areaId !== node.areaId) body.areaId = areaId;
    if (f.description !== node.description) body.description = f.description;
    if (manage && f.isProtected !== node.isProtected) body.isProtected = f.isProtected;
    const properties = f.fields.map(({ _id, ...r }) => (r.redacted ? { key: r.key, label: r.label, sensitive: true, redacted: true } : { key: r.key, label: r.label.trim(), value: r.value ?? '', sensitive: !!r.sensitive }));
    if (JSON.stringify(properties) !== JSON.stringify(node.properties.map((r) => (r.redacted ? { key: r.key, label: r.label, sensitive: true, redacted: true } : { key: r.key, label: r.label, value: r.value ?? '', sensitive: !!r.sensitive }))))
      body.properties = properties as Field[];
    if (!Object.keys(body).length) return onOpenChange(false);
    update.mutate(
      { nodeId: node.id, body },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast(`Saved ${f.name.trim()}. It changed on every canvas.`);
        },
        onError: (e) => setError(problem(e)),
      },
    );
  };

  return (
    <Modal
      wide
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setF(init());
          setError('');
        }
      }}
      title={`Edit ${node.name}`}
      description="Changes apply everywhere this node is drawn."
      footer={
        <>
          <ModalClose asChild><Button>Cancel</Button></ModalClose>
          <Button variant="primary" disabled={invalid || update.isPending} onClick={save}>Save</Button>
        </>
      }
    >
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Name">{(p) => <Input {...p} value={f.name} maxLength={100} onChange={(e) => setF({ ...f, name: e.target.value })} />}</FormField>
          <FormField label="Area">
            {() => (
              <Select
                aria-label="Area"
                className="w-full"
                value={f.areaId}
                onValueChange={(areaId) => setF({ ...f, areaId })}
                options={[{ value: 'none', label: 'No area' }, ...(areas.data ?? []).map((a) => ({ value: a.id, label: a.name, icon: <span className={`size-2.5 rounded-[3px] bg-[var(--area)] area-${a.color}`} /> }))]}
              />
            )}
          </FormField>
          <FormField label="Category">
            {() => (
              <Select
                aria-label="Category"
                className="w-full"
                value={f.category}
                onValueChange={(c) => {
                  const category = c as NodeCategory;
                  const keep = NODE_TYPES[f.type]?.category === category;
                  setF({ ...f, category, type: keep ? f.type : (Object.entries(NODE_TYPES).find(([, t]) => t.category === category)?.[0] ?? f.type) });
                }}
                options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY[c].label }))}
              />
            )}
          </FormField>
          <FormField label="Type">
            {() => <Select aria-label="Type" className="w-full" value={f.type} onValueChange={(type) => setF({ ...f, type })} options={types.map(([id, t]) => ({ value: id, label: t.label, icon: <t.icon className="size-3.5 text-muted" /> }))} />}
          </FormField>
        </div>
        <FormField label="Description">
          {(p) => (
            <textarea
              {...p}
              rows={2}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              className="w-full resize-y rounded-sm border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] shadow-xs outline-none focus:border-accent focus:ring-3 focus:ring-ring"
            />
          )}
        </FormField>

        <section>
          <div className="mb-1.5 flex items-center">
            <h3 className="text-[13px] font-medium">Fields</h3>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setF({ ...f, fields: [...f.fields, { _id: ++rowId, key: '', label: '', value: '', sensitive: false }] })}>
              <Plus className="size-3.5" />
              Add field
            </Button>
          </div>
          {f.fields.length ? (
            <div className="grid gap-1.5">
              {f.fields.map((r) => (
                <div key={r._id} className="grid grid-cols-[1fr_1.4fr_auto_auto] items-center gap-2">
                  <Input
                    aria-label="Field name"
                    placeholder="Name, e.g. IP address"
                    value={r.label}
                    maxLength={60}
                    disabled={r.redacted}
                    // a new field's key follows its name; an existing key never changes
                    onChange={(e) => setRow(r._id, { label: e.target.value, ...(node.properties.some((x) => x.key === r.key) ? {} : { key: toKey(e.target.value) }) })}
                  />
                  {r.redacted ? (
                    <Chip dashed className="h-8 justify-center">
                      <EyeOff className="size-3" />
                      Hidden for your role
                    </Chip>
                  ) : (
                    <Input aria-label={`${r.label || 'Field'} value`} placeholder="Value" value={r.value ?? ''} maxLength={2000} className={r.sensitive ? 'font-mono' : undefined} onChange={(e) => setRow(r._id, { value: e.target.value })} />
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-muted" title="Sensitive: hidden from people without sensitive access, and from guests">
                    <Switch checked={!!r.sensitive} disabled={r.redacted} onChange={(e) => setRow(r._id, { sensitive: e.target.checked })} />
                    <Lock className="size-3" />
                  </label>
                  <IconButton label="Remove field" size="sm" onClick={() => setF({ ...f, fields: f.fields.filter((x) => x._id !== r._id) })}>
                    <X className="size-3.5" />
                  </IconButton>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-faint">No fields. Add things like IP address, model or location.</p>
          )}
          {dupKey && <p className="mt-1.5 text-xs text-down">Two fields have the same name.</p>}
        </section>

        {manage && (
          <label className="flex items-center gap-2.5 text-[13px]">
            <Switch checked={f.isProtected} onChange={(e) => setF({ ...f, isProtected: e.target.checked })} />
            Protected: only owners and admins can delete it
          </label>
        )}
        {error && <p role="alert" className="text-xs text-down">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function DeleteNodeDialog({ node, open, onOpenChange }: { node: InvNode; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { workspace, toast } = useWorkspace();
  const usage = useNodeUsage(workspace.id, node.id, open);
  const del = useDeleteNode(workspace.id);
  const blocked = (usage.data?.hiddenCanvasCount ?? 0) > 0 && workspace.membership.role === 'editor';
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete “${node.name}”?`}
      description={<>It is removed from the inventory and from <b>every canvas</b>, with its {usage.data?.linkCount ?? '…'} links and {usage.data?.noteCount ?? '…'} notes. This can&apos;t be undone.</>}
      footer={
        <>
          <ModalClose asChild><Button>Cancel</Button></ModalClose>
          <Button
            variant="danger"
            disabled={blocked || del.isPending}
            onClick={() => del.mutate(node.id, { onSuccess: () => { onOpenChange(false); toast(`Deleted ${node.name}.`); }, onError: (e) => toast(problem(e), 'danger') })}
          >
            <Trash2 className="size-3.5" />
            Delete everywhere
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {!!usage.data?.canvases.length && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-faint">Drawn on:</span>
            {usage.data.canvases.map((c) => <Chip key={c.id}>{c.name}</Chip>)}
            {!!usage.data.hiddenCanvasCount && <Chip dashed>+{usage.data.hiddenCanvasCount} you can&apos;t see</Chip>}
          </div>
        )}
        {node.isProtected && <p className="text-xs text-muted">This node is protected: only owners and admins can delete it.</p>}
        {blocked && (
          <div className="flex gap-2.5 rounded-sm border border-down/40 bg-down-subtle px-3 py-2.5 text-[13px]">
            <Lock className="mt-0.5 size-4 shrink-0" />
            It is also drawn on a canvas you can&apos;t see, so you can&apos;t delete it. Ask an owner or admin.
          </div>
        )}
      </div>
    </Modal>
  );
}
