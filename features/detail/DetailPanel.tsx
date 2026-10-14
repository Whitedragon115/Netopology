'use client';

import { DropdownMenu } from 'radix-ui';
import {
  EyeOff,
  LayoutGrid,
  LogIn,
  Lock,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Shapes,
  Spline,
  StickyNote,
  Trash2,
  Unplug,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/field';
import { Chip, StatusChip } from '@/components/status';
import { Button, IconButton } from '@/components/ui/button';
import { Select, Switch } from '@/components/ui/controls';
import { Modal, ModalClose } from '@/components/ui/dialog';
import type { HealthStatus, InvNode, LinkKind, NoteColor } from '@/lib/api/types';
import { AREA_COLORS, CATEGORY, LINK_KIND, LINK_KINDS, nodeType, SEVERITY, STATUS, worst } from '@/lib/domain';
import { cn } from '@/lib/cn';
import { LinkSample } from '../canvas/samples';
import { restorePlacement, useEditor } from '../canvas/editor';
import { useNodeNotes, useNodeUsage } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { RIGHT_MAX, RIGHT_MIN, useUi } from '../workspace/store';
import { EditNodeDialog } from '../sections/NodeDialogs';
import { NodeNotes } from './NodeNotes';
import { LINK_COLORS, lookOf, overrideEdit, type LinkLook, type LinkWidth } from '../canvas/linkOverride';

/*
 * The details panel (DRA-60, DRA-61, DRA-62, DRA-63). Every kind of item has the same layout:
 *   header: icon, name (click to rename), what it is, close
 *   actions: the main buttons in one row, the rest (and anything destructive) in the "…" menu
 *   tabs: only when there is more than one, each holding one kind of information
 * It runs the full height of the window, its left edge can be dragged, and edits are instant (editor.ts).
 */

/** Click-to-edit text (titles, descriptions). Saves on Enter or blur; Esc cancels. */
function InlineEdit({ value, onSave, label, multiline, allowEmpty, className, placeholder }: { value: string; onSave: (v: string) => void; label: string; multiline?: boolean; /** single line, but saving it empty clears it */ allowEmpty?: boolean; className?: string; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null)
    return (
      <button type="button" onClick={() => setDraft(value)} className={cn('group -mx-1 flex max-w-full items-start gap-1.5 rounded-sm px-1 text-left hover:bg-surface-raised', className)} title={`Edit ${label}`}>
        <span className={cn('min-w-0 break-words whitespace-pre-wrap', !value && 'text-faint')}>{value || placeholder || `Add ${label}`}</span>
        <Pencil className="mt-1 size-3 shrink-0 text-faint opacity-0 group-hover:opacity-100" />
      </button>
    );
  const save = () => {
    const v = draft.trim();
    setDraft(null);
    if (v !== value && (v || multiline || allowEmpty)) onSave(v);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setDraft(null);
    } else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) save();
  };
  return multiline ? (
    <textarea autoFocus aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={keys} rows={3}
      className="w-full resize-y rounded-sm border border-accent bg-surface px-2 py-1.5 text-[13px] outline-none focus:ring-3 focus:ring-ring" />
  ) : (
    <Input autoFocus aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={keys} className="h-8" maxLength={100} />
  );
}

// ───────── shared layout ─────────

type MenuEntry = { label: string; icon: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean };

function Shell({
  icon,
  title,
  sub,
  onRename,
  actions,
  menu,
  tabs,
  children,
}: {
  icon: ReactNode;
  title: string;
  sub: ReactNode;
  onRename?: (name: string) => void;
  actions?: ReactNode;
  menu?: MenuEntry[];
  tabs?: { id: string; label: ReactNode; content: ReactNode }[];
  children?: ReactNode;
}) {
  const select = useUi((s) => s.select);
  const [tab, setTab] = useState(tabs?.[0]?.id);
  const active = tabs?.find((t) => t.id === tab) ?? tabs?.[0];
  const hasMenu = !!menu?.length;
  return (
    <>
      <header className="px-4 pt-3.5">
        <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-node-icon-bg text-node-icon">{icon}</span>
          <div className="min-w-0 pt-0.5">
            {onRename ? <InlineEdit value={title} onSave={onRename} label="name" className="text-base leading-snug font-semibold" /> : <h2 className="truncate text-base leading-snug font-semibold">{title}</h2>}
            <div className="mt-0.5 truncate text-xs text-faint">{sub}</div>
          </div>
          <IconButton label="Close details (Esc)" onClick={() => select(null)}>
            <X className="size-4" />
          </IconButton>
        </div>
        {(actions || hasMenu) && (
          <div className="mt-3 flex items-center gap-1.5">
            {actions}
            {hasMenu && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button size="sm" className="ml-auto w-7 px-0" aria-label="More actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="float-panel z-[60] min-w-52 p-1.5">
                    {menu.map((m, i) => (
                      <div key={m.label}>
                        {m.danger && i > 0 && !menu[i - 1]?.danger && <DropdownMenu.Separator className="my-1 h-px bg-border" />}
                        <DropdownMenu.Item
                          disabled={m.disabled}
                          onSelect={m.onSelect}
                          className={cn('flex h-8 cursor-default items-center gap-2.5 rounded-sm px-2 text-[13px] outline-none select-none data-[disabled]:text-faint data-[highlighted]:bg-surface-raised [&>svg]:size-4', m.danger ? 'text-down' : '[&>svg]:text-muted')}
                        >
                          {m.icon}
                          {m.label}
                        </DropdownMenu.Item>
                      </div>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        )}
      </header>
      {tabs && tabs.length > 1 ? (
        <>
          <div className="mt-3 flex gap-1 border-b border-border px-3" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active?.id === t.id}
                onClick={() => setTab(t.id)}
                className="-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-2 py-2 text-[13px] text-muted hover:text-text aria-selected:border-accent aria-selected:font-medium aria-selected:text-text"
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 py-4">{active?.content}</div>
        </>
      ) : (
        <div className="mt-3 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto border-t border-border px-4 py-4">{tabs?.[0]?.content ?? children}</div>
      )}
    </>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center text-2xs font-semibold tracking-wider text-faint uppercase">
        {title}
        {aside && <span className="ml-auto font-normal tracking-normal normal-case">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}
function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-2.5 text-[13px]">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="flex items-center gap-1 text-faint">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
const Hidden = () => (
  <Chip dashed>
    <EyeOff className="size-3" />
    Hidden
  </Chip>
);
const Count = ({ n }: { n: number }) => <span className="rounded-full bg-surface-raised px-1.5 text-2xs text-faint">{n}</span>;
const Empty = ({ children }: { children: ReactNode }) => <p className="text-[13px] text-faint">{children}</p>;
const rows = (cond: unknown, ...r: [ReactNode, ReactNode][]) => (cond ? r : []);

function ColorPicker<T extends string>({ colors, value, onPick, swatch }: { colors: readonly T[]; value: T; onPick: (c: T) => void; swatch: (c: T) => { className?: string; style?: React.CSSProperties } }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button key={c} type="button" aria-label={c} aria-pressed={value === c} onClick={() => onPick(c)} {...swatch(c)}
          className={cn('size-5.5 rounded-[6px] border-2 border-transparent outline-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring aria-pressed:border-text', swatch(c).className)} />
      ))}
    </div>
  );
}

// ───────── node ─────────

function NodeDetails({ node }: { node: InvNode }) {
  const { workspace, view, toast } = useWorkspace();
  const select = useUi((s) => s.select);
  const notes = useNodeNotes(workspace.id, node.id);
  const guest = view?.viewer.role === 'guest';
  const usage = useNodeUsage(workspace.id, node.id, !guest);
  const editor = useEditor();
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const canEdit = !!view?.viewer.canEdit && !view.canvas.lock;
  const t = nodeType(node.type);
  const Icon = t.icon;
  const area = node.areaId ? view?.areas.find((a) => a.id === node.areaId) : undefined;
  const links = view?.links.filter((l) => l.sourceNodeId === node.id || l.targetNodeId === node.id) ?? [];
  const placement = view?.placements.find((p) => p.item.type === 'node' && p.item.id === node.id);
  const anyRedacted = node.properties.some((f) => f.redacted);
  const rename = (name: string) => editor.updateNode(node.id, { name }, { name: node.name }, 'Rename node');

  const overview = (
    <>
      <Section title="Health">
        <div className="grid gap-2 rounded-md border border-border bg-surface-raised/50 p-3">
          <div className="flex items-center gap-2">
            <StatusChip status={node.health.status} />
            {canEdit && (
              <Select
                aria-label="Set health manually"
                size="sm"
                className="ml-auto"
                value={node.health.status}
                options={SEVERITY.map((s) => ({ value: s, label: STATUS[s].label }))}
                onValueChange={(s) => {
                  editor.setHealth(node.id, s as HealthStatus, node.health.status);
                  toast('Health set by hand. Plugins will set it automatically later.');
                }}
              />
            )}
          </div>
          {!guest && <p className="text-xs text-muted">{node.health.message || (node.health.source === 'manual' ? 'Set by hand.' : 'No message.')}</p>}
        </div>
      </Section>
      {(canEdit || node.description) && (
        <Section title="Description">
          {canEdit ? <InlineEdit value={node.description} onSave={(description) => editor.updateNode(node.id, { description }, { description: node.description })} label="description" multiline className="text-[13px]" /> : <p className="text-[13px] whitespace-pre-wrap">{node.description}</p>}
        </Section>
      )}
      <Section title="About">
        <KV
          rows={[
            ['Kind', `${CATEGORY[node.category].label} · ${t.label}`],
            ['Area', area ? <span className={cn('inline-flex items-center gap-1.5', `area-${area.color}`)}><span className="size-2 rounded-full bg-[var(--area)]" />{area.name}</span> : <span className="text-faint">No area</span>],
            ...rows(!guest && node.slug, ['Slug', <span key="s" className="font-mono text-xs">{node.slug}</span>]),
            ...rows(!guest && usage.data, [
              'Drawn on',
              <div key="u" className="flex flex-wrap gap-1">
                {usage.data?.canvases.map((c) => <Chip key={c.id}>{c.name}</Chip>)}
                {!!usage.data?.hiddenCanvasCount && <Chip dashed>+{usage.data.hiddenCanvasCount} hidden</Chip>}
              </div>,
            ]),
          ]}
        />
      </Section>
    </>
  );

  const fields = (
    <Section title="Fields">
      {node.properties.length ? (
        <KV rows={node.properties.map((f) => [<>{f.sensitive && <Lock className="size-3" aria-label="Sensitive" />}{f.label}</>, f.redacted ? <Hidden /> : <span className="font-mono text-[12.5px]">{f.value}</span>])} />
      ) : (
        <Empty>No fields.</Empty>
      )}
      {anyRedacted && <p className="mt-3 text-xs text-faint">Sensitive values are hidden for your role. A workspace owner or admin can give you access.</p>}
    </Section>
  );

  const connections = (
    <div className="grid gap-0.5">
      {links.map((l) => {
        const otherId = l.sourceNodeId === node.id ? l.targetNodeId : l.sourceNodeId;
        const other = view?.nodes.find((n) => n.id === otherId);
        return (
          <button key={l.id} type="button" onClick={() => select({ type: 'link', id: l.id })} className="flex items-center gap-2.5 rounded-sm px-2 py-2 text-left text-[13px] hover:bg-surface-raised">
            <LinkSample kind={l.kind} width={28} />
            <span className="min-w-0 flex-1 truncate">{other?.name ?? 'Outside node'}</span>
            <span className="text-xs text-faint">{l.label || LINK_KIND[l.kind].label}</span>
          </button>
        );
      })}
      {!links.length && <Empty>No links on this canvas. Use the link tool (L) to connect it.</Empty>}
    </div>
  );

  const notesTab = <NodeNotes nodeId={node.id} notes={notes.data} loading={notes.isLoading} canEdit={canEdit} canSensitive={!!view?.viewer.canViewSensitive} />;

  return (
    <>
      <Shell
        icon={<Icon className="size-5" />}
        title={node.name}
        sub={`${t.label}${area ? ` · in ${area.name}` : ''}`}
        onRename={canEdit ? rename : undefined}
        actions={
          canEdit && (
            <>
              <Button size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />Edit details
              </Button>
              {placement && (
                <Button size="sm" onClick={() => { select(null); editor.removePlacement(placement, 'Remove node from canvas'); toast(`Removed ${node.name} from this canvas. It is still in the inventory (Ctrl+Z to undo).`); }}>
                  <Unplug className="size-3.5" />Remove from canvas
                </Button>
              )}
            </>
          )
        }
        menu={canEdit ? [{ label: 'Delete everywhere…', icon: <Trash2 />, danger: true, onSelect: () => setDeleting(true) }] : undefined}
        tabs={[
          { id: 'overview', label: 'Overview', content: overview },
          { id: 'fields', label: <>Fields <Count n={node.properties.length} /></>, content: fields },
          ...(!guest
            ? [
                { id: 'links', label: <>Links <Count n={links.length} /></>, content: connections },
                { id: 'notes', label: <>Notes <Count n={notes.data?.length ?? 0} /></>, content: notesTab },
              ]
            : []),
        ]}
      />
      <DeleteNodeDialog node={node} open={deleting} onOpenChange={setDeleting} />
      {editing && <EditNodeDialog node={node} open onOpenChange={(o) => !o && setEditing(false)} />}
    </>
  );
}

function DeleteNodeDialog({ node, open, onOpenChange }: { node: InvNode; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { workspace, toast } = useWorkspace();
  const select = useUi((s) => s.select);
  const editor = useEditor();
  const usage = useNodeUsage(workspace.id, node.id, open);
  const blocked = (usage.data?.hiddenCanvasCount ?? 0) > 0 && workspace.membership.role === 'editor';
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete “${node.name}”?`}
      description={<>This removes it from the inventory and from <b>every canvas</b>, with its {usage.data?.linkCount ?? '…'} links and {usage.data?.noteCount ?? '…'} notes. It can&apos;t be undone. To take it off this canvas only, use <i>Remove from canvas</i>.</>}
      footer={
        <>
          <ModalClose asChild><Button>Cancel</Button></ModalClose>
          <Button variant="danger" disabled={blocked} onClick={() => { onOpenChange(false); select(null); editor.deleteEverywhere('node', node.id, `Delete ${node.name}`); toast(`Deleted ${node.name} from the inventory and every canvas.`); }}>
            <Trash2 className="size-3.5" />Delete everywhere
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-1.5">
          {usage.data?.canvases.map((c) => <Chip key={c.id}>{c.name}</Chip>)}
          {!!usage.data?.hiddenCanvasCount && <Chip dashed>+{usage.data.hiddenCanvasCount} you can&apos;t see</Chip>}
        </div>
        {blocked && (
          <div className="flex gap-2.5 rounded-sm border border-down/40 bg-down-subtle px-3 py-2.5 text-[13px]">
            <Lock className="mt-0.5 size-4 shrink-0" />You can&apos;t delete this node: it is also drawn on a canvas you don&apos;t have access to. Remove it from this canvas instead, or ask an admin.
          </div>
        )}
      </div>
    </Modal>
  );
}

// ───────── area ─────────

function AreaDetails({ areaId }: { areaId: string }) {
  const { view, enterArea, toast } = useWorkspace();
  const select = useUi((s) => s.select);
  const editor = useEditor();
  const [deleting, setDeleting] = useState(false);
  const area = view?.areas.find((a) => a.id === areaId);
  if (!area || !view) return null;
  const members = view.nodes.filter((n) => n.areaId === area.id);
  const placement = view.placements.find((p) => p.item.type === 'area' && p.item.id === area.id);
  const health = worst(members.map((n) => n.health.status));
  const canEdit = view.viewer.canEdit && !view.canvas.lock;
  const guest = view.viewer.role === 'guest';
  const color = area.color ?? 'yellow';
  const saveCidr = (v: string) => {
    const cidr = v.trim() || null;
    if (cidr && !/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(cidr)) return toast('Use a network like 192.168.1.0/24.');
    editor.updateArea(area.id, { cidr }, { cidr: area.cidr ?? null }, 'Change CIDR');
  };
  const saveVlan = (v: string) => {
    const t = v.trim();
    const vlanId = t ? Number(t) : null;
    if (vlanId !== null && !(Number.isInteger(vlanId) && vlanId >= 1 && vlanId <= 4094)) return toast('A VLAN ID is a whole number from 1 to 4094.');
    editor.updateArea(area.id, { vlanId }, { vlanId: area.vlanId ?? null }, 'Change VLAN');
  };

  const overview = (
    <>
      <Section title="Health">
        <div className="rounded-md border border-border bg-surface-raised/50 p-3">
          <StatusChip status={health} label={`${STATUS[health].label} (worst inside)`} />
        </div>
      </Section>
      <Section title="About">
        <KV
          rows={[
            ['Kind', <span key="k" className="capitalize">{area.kind}</span>],
            // CIDR and VLAN are sensitive: only people who can see them can change them
            ...rows(!guest, [
              <><Lock className="size-3" />CIDR</>,
              !view.viewer.canViewSensitive ? (
                <Hidden />
              ) : canEdit ? (
                <InlineEdit key="c" value={area.cidr ?? ''} label="CIDR" placeholder="e.g. 192.168.1.0/24" className="font-mono text-[12.5px]" allowEmpty onSave={(v) => saveCidr(v)} />
              ) : area.cidr ? (
                <span className="font-mono text-[12.5px]">{area.cidr}</span>
              ) : (
                <span className="text-faint">Not set</span>
              ),
            ]),
            ...rows(!guest && (view.viewer.canViewSensitive || area.vlanId != null), [
              <><Lock className="size-3" />VLAN</>,
              !view.viewer.canViewSensitive ? (
                <Hidden />
              ) : canEdit ? (
                <InlineEdit key="v" value={area.vlanId != null ? String(area.vlanId) : ''} label="VLAN ID" placeholder="1 to 4094" className="font-mono text-[12.5px]" allowEmpty onSave={(v) => saveVlan(v)} />
              ) : area.vlanId != null ? (
                <span className="font-mono text-[12.5px]">{area.vlanId}</span>
              ) : (
                <span className="text-faint">Not set</span>
              ),
            ]),
            ...rows(placement, ['On this canvas', placement?.collapsed ? 'Collapsed block' : 'Expanded box']),
            ['Color', canEdit ? <ColorPicker key="c" colors={AREA_COLORS} value={color} onPick={(c) => editor.updateArea(area.id, { color: c }, { color }, 'Recolor area')} swatch={(c) => ({ className: cn('bg-[var(--area)]', `area-${c}`) })} /> : <span className="capitalize">{color}</span>],
          ]}
        />
      </Section>
      {canEdit && <p className="text-xs text-faint">Drag a node into or out of this box to change its area: that applies on every canvas. Drag the corners to resize the box.</p>}
    </>
  );
  const nodesTab = (
    <div className="grid gap-0.5">
      {members.map((n) => (
        <button key={n.id} type="button" onClick={() => select({ type: 'node', id: n.id })} className="flex items-center gap-2.5 rounded-sm px-2 py-2 text-left text-[13px] hover:bg-surface-raised">
          <StatusChip status={n.health.status} label="" className="h-auto bg-transparent p-0" />
          <span className="min-w-0 flex-1 truncate">{n.name}</span>
          <span className="text-xs text-faint">{nodeType(n.type).label}</span>
        </button>
      ))}
      {!members.length && <Empty>No nodes in this area yet.</Empty>}
    </div>
  );

  return (
    <>
      <Shell
        icon={<LayoutGrid className={cn('size-5 text-[var(--area)]', `area-${color}`)} />}
        title={area.name}
        sub={`Area · ${members.length} node${members.length === 1 ? '' : 's'}`}
        onRename={canEdit ? (name) => editor.updateArea(area.id, { name }, { name: area.name }, 'Rename area') : undefined}
        actions={
          <>
            {!guest && <Button size="sm" variant="primary" onClick={() => void enterArea(area.id)}><LogIn className="size-3.5" />Enter</Button>}
            {canEdit && placement && (
              <Button size="sm" onClick={() => editor.ops(placement.collapsed ? 'Expand area' : 'Collapse area', [{ op: 'update', placementId: placement.id, collapsed: !placement.collapsed }], [restorePlacement(placement)])}>
                {placement.collapsed ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
                {placement.collapsed ? 'Expand' : 'Collapse'}
              </Button>
            )}
          </>
        }
        menu={
          canEdit
            ? [
                ...(placement ? [{ label: 'Remove box from canvas', icon: <Unplug />, onSelect: () => { select(null); editor.removePlacement(placement, 'Remove area box'); toast('Box removed from this canvas. The area and its nodes are unchanged (Ctrl+Z to undo).'); } }] : []),
                { label: 'Delete area…', icon: <Trash2 />, danger: true, onSelect: () => setDeleting(true) },
              ]
            : undefined
        }
        tabs={[
          { id: 'overview', label: 'Overview', content: overview },
          { id: 'nodes', label: <>Nodes <Count n={members.length} /></>, content: nodesTab },
        ]}
      />
      <Modal
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete area “${area.name}”?`}
        description={`The area is removed from the inventory and from every canvas, including its inner canvas.${members.length ? ` Its ${members.length} node${members.length > 1 ? 's stay' : ' stays'}, without an area.` : ''} This can't be undone.`}
        footer={
          <>
            <ModalClose asChild><Button>Cancel</Button></ModalClose>
            <Button variant="danger" onClick={() => { setDeleting(false); select(null); editor.deleteEverywhere('area', area.id, `Delete ${area.name}`); toast(`Deleted area ${area.name}.`); }}>Delete area</Button>
          </>
        }
      />
    </>
  );
}

// ───────── link ─────────

function LinkDetails({ linkId }: { linkId: string }) {
  const { view, toast } = useWorkspace();
  const select = useUi((s) => s.select);
  const editor = useEditor();
  const link = view?.links.find((l) => l.id === linkId);
  if (!link || !view) return null;
  const canEdit = view.viewer.canEdit && !view.canvas.lock;
  const name = (id: string) => view.nodes.find((n) => n.id === id)?.name ?? 'Unknown';
  const arrow = link.directed ? '→' : '↔';
  const node = (id: string) => (
    <button type="button" className="truncate text-left hover:text-accent" onClick={() => select({ type: 'node', id })}>{name(id)}</button>
  );
  return (
    <Shell
      icon={<Spline className="size-5" />}
      title={`${name(link.sourceNodeId)} ${arrow} ${name(link.targetNodeId)}`}
      sub={`${LINK_KIND[link.kind].label} link`}
      actions={
        canEdit && (
          <Button size="sm" onClick={() => { select(null); editor.ops('Hide link', [{ op: 'link.override', linkId, hidden: true }], [{ op: 'link.override', linkId, hidden: false }]); toast('Link hidden on this canvas only. It still shows on other canvases.'); }}>
            <EyeOff className="size-3.5" />Hide here
          </Button>
        )
      }
      menu={canEdit ? [{ label: 'Delete link', icon: <Trash2 />, danger: true, onSelect: () => { select(null); editor.deleteLink(linkId); toast('Link deleted from every canvas (Ctrl+Z to undo).'); } }] : undefined}
    >
      <Section title="Link">
        <KV
          rows={[
            [
              'Kind',
              canEdit ? (
                <Select
                  key="k"
                  aria-label="Link kind"
                  size="sm"
                  value={link.kind}
                  options={LINK_KINDS.map((k) => ({ value: k, label: LINK_KIND[k].label, icon: <LinkSample kind={k} width={22} /> }))}
                  onValueChange={(k) => editor.updateLink(link.id, { kind: k as LinkKind, directed: LINK_KIND[k as LinkKind].directed }, { kind: link.kind, directed: link.directed }, 'Change link kind')}
                />
              ) : (
                <span key="k" className="flex items-center gap-2"><LinkSample kind={link.kind} />{LINK_KIND[link.kind].label}</span>
              ),
            ],
            ['From', node(link.sourceNodeId)],
            ['To', node(link.targetNodeId)],
            ['Label', canEdit ? <InlineEdit key="l" value={link.label} onSave={(label) => editor.updateLink(link.id, { label }, { label: link.label }, 'Label link')} label="label" placeholder="Add a label (e.g. HTTPS, VLAN 20)" /> : link.label || <span className="text-faint">None</span>],
            ...rows(link.sourcePort || link.targetPort, ['Ports', <span key="p" className="font-mono text-xs">{link.sourcePort ?? '–'} {arrow} {link.targetPort ?? '–'}</span>]),
            ['Health', <StatusChip key="h" status={link.health.status} label={link.health.status === 'unknown' ? 'Not measured' : undefined} />],
          ]}
        />
      </Section>
      <Section title="On this canvas">
        {(() => {
          const ov = view.linkOverrides.find((o) => o.linkId === link.id);
          const look = lookOf(ov?.style);
          const bends = ov?.waypoints?.length ?? 0;
          const restyle = (patch: LinkLook, label: string) => {
            const style = { ...(ov?.style ?? {}), ...patch } as Record<string, unknown>;
            for (const k of Object.keys(patch) as (keyof LinkLook)[]) if (patch[k] === undefined) delete style[k];
            const { ops, inverse } = overrideEdit(view, link.id, { style });
            editor.ops(label, ops, inverse);
          };
          return canEdit ? (
            <KV
              rows={[
                [
                  'Color',
                  <div key="c" className="flex flex-wrap items-center gap-1.5">
                    <button type="button" aria-label="Default color" aria-pressed={!look.color} onClick={() => restyle({ color: undefined }, 'Link color')}
                      className="grid size-5.5 place-items-center rounded-[6px] border-2 border-border text-[10px] text-faint hover:border-border-strong aria-pressed:border-text">A</button>
                    {LINK_COLORS.map((c) => (
                      <button key={c} type="button" aria-label={c} aria-pressed={look.color === c} onClick={() => restyle({ color: c }, 'Link color')}
                        className={cn('size-5.5 rounded-[6px] border-2 border-transparent bg-[var(--area)] hover:border-border-strong aria-pressed:border-text', `area-${c}`)} />
                    ))}
                  </div>,
                ],
                [
                  'Width',
                  <Select key="w" aria-label="Line width" size="sm" value={look.width ?? 'normal'} onValueChange={(w) => restyle({ width: w === 'normal' ? undefined : (w as LinkWidth) }, 'Link width')}
                    options={[{ value: 'thin', label: 'Thin' }, { value: 'normal', label: 'Normal' }, { value: 'thick', label: 'Thick' }]} />,
                ],
                [
                  'Route',
                  <span key="r" className="flex items-center gap-2">
                    <span className="text-muted">{bends ? `${bends} bend${bends > 1 ? 's' : ''}` : 'Automatic'}</span>
                    {bends > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => { const { ops, inverse } = overrideEdit(view, link.id, { waypoints: null }); editor.ops('Straighten link', ops, inverse); }}>
                        Straighten
                      </Button>
                    )}
                  </span>,
                ],
              ]}
            />
          ) : (
            <p className="text-[13px] text-muted">{bends ? `Drawn with ${bends} bend${bends > 1 ? 's' : ''} on this canvas.` : 'Drawn with the default route.'}</p>
          );
        })()}
        {canEdit && <p className="mt-2 text-xs text-faint">Drag the + on the selected link to bend it, drag a bend to move it, double-click a bend to remove it. Only this canvas changes.</p>}
      </Section>
      <p className="text-xs text-faint">This link exists once in the inventory and appears on every canvas where both nodes are placed.</p>
    </Shell>
  );
}

// ───────── note ─────────

const NOTE_COLORS: NoteColor[] = ['default', 'yellow', 'teal', 'violet', 'rose'];

function NoteDetails({ noteId }: { noteId: string }) {
  const { view } = useWorkspace();
  const select = useUi((s) => s.select);
  const editor = useEditor();
  const note = view?.notes.find((n) => n.id === noteId);
  if (!note || !view) return null;
  const canEdit = view.viewer.canEdit && !view.canvas.lock && !note.redacted;
  return (
    <Shell
      icon={<StickyNote className="size-5" />}
      title={note.title || 'Sticky note'}
      sub="Note on this canvas"
      onRename={canEdit ? (title) => editor.updateNote(note.id, { title }, { title: note.title }, 'Rename note') : undefined}
      menu={canEdit ? [{ label: 'Delete note', icon: <Trash2 />, danger: true, onSelect: () => { select(null); editor.deleteNote(note.id); } }] : undefined}
    >
      {note.redacted ? (
        <Empty>Sensitive note · hidden for your role</Empty>
      ) : canEdit ? (
        <>
          <Section title="Text">
            <InlineEdit value={note.body} onSave={(body) => editor.updateNote(note.id, { body }, { body: note.body })} label="text" multiline placeholder="Write something" className="text-[13px]" />
            <p className="mt-1.5 text-xs text-faint">Or double-click the note on the canvas. Markdown is kept as typed.</p>
          </Section>
          <Section title="Look">
            <KV
              rows={[
                ['Color', <ColorPicker key="c" colors={NOTE_COLORS} value={note.color} onPick={(c) => editor.updateNote(note.id, { color: c }, { color: note.color }, 'Recolor note')} swatch={(c) => ({ className: 'border-border', style: { background: `var(--note-${c})` } })} />],
                [
                  <><Lock className="size-3" />Sensitive</>,
                  <label key="s" className="flex items-center gap-2 text-[13px] text-muted">
                    <Switch checked={note.isSensitive} onChange={(e) => editor.updateNote(note.id, { isSensitive: e.target.checked }, { isSensitive: note.isSensitive }, 'Note sensitivity')} />
                    Hide from people without sensitive access
                  </label>,
                ],
              ]}
            />
          </Section>
        </>
      ) : (
        <div className="text-[13px] whitespace-pre-wrap text-muted">{note.body}</div>
      )}
    </Shell>
  );
}

// ───────── shape ─────────

const SHAPE_LABEL = { text: 'Text', rectangle: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', freehand: 'Drawing' } as const;
const SHAPE_COLORS = ['gray', 'blue', 'teal', 'green', 'yellow', 'rose', 'violet'] as const;

function ShapeDetails({ shapeId }: { shapeId: string }) {
  const { view } = useWorkspace();
  const select = useUi((s) => s.select);
  const editor = useEditor();
  const shape = view?.shapes.find((s) => s.id === shapeId);
  if (!shape || !view) return null;
  const canEdit = view.viewer.canEdit && !view.canvas.lock;
  const restyle = (patch: Record<string, unknown>) =>
    editor.ops('Restyle', [{ op: 'shape.update', shapeId: shape.id, style: { ...shape.style, ...patch } }], [{ op: 'shape.update', shapeId: shape.id, style: shape.style }]);
  const color = (typeof shape.style.color === 'string' ? shape.style.color : 'gray') as (typeof SHAPE_COLORS)[number];
  const size = (shape.style.size ?? 'md') as 'sm' | 'md' | 'lg';
  return (
    <Shell
      icon={<Shapes className="size-5" />}
      title={SHAPE_LABEL[shape.kind]}
      sub="Drawing on this canvas only"
      menu={canEdit ? [{ label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => { select(null); editor.deleteShape(shape); } }] : undefined}
    >
      {canEdit ? (
        <Section title="Look">
          <KV
            rows={[
              ['Color', <ColorPicker key="c" colors={SHAPE_COLORS} value={color} onPick={(c) => restyle({ color: c })} swatch={(c) => ({ className: cn('bg-[var(--area)]', `area-${c}`) })} />],
              ...rows(shape.kind === 'rectangle' || shape.kind === 'ellipse', ['Fill', <label key="f" className="flex items-center gap-2 text-[13px] text-muted"><Switch checked={shape.style.fill === true} onChange={(e) => restyle({ fill: e.target.checked })} />Tinted fill</label>]),
              ...rows(shape.kind === 'text', [
                'Size',
                <Select key="z" aria-label="Text size" size="sm" value={size} onValueChange={(z) => restyle({ size: z })} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Normal' }, { value: 'lg', label: 'Heading' }]} />,
              ]),
            ]}
          />
          {shape.kind === 'text' && <p className="mt-3 text-xs text-faint">Double-click the text on the canvas to edit it.</p>}
        </Section>
      ) : (
        <Empty>A free drawing on this canvas.</Empty>
      )}
    </Shell>
  );
}

// ───────── the panel ─────────

/** Drag the left edge to change the panel's width (remembered). */
function ResizeEdge() {
  const setRightWidth = useUi((s) => s.setRightWidth);
  const dragging = useRef(false);
  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && setRightWidth(window.innerWidth - e.clientX - 12);
    const up = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [setRightWidth]);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize details panel"
      aria-valuemin={RIGHT_MIN}
      aria-valuemax={RIGHT_MAX}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
      onKeyDown={(e) => {
        const w = useUi.getState().rightWidth;
        if (e.key === 'ArrowLeft') setRightWidth(w + 16);
        if (e.key === 'ArrowRight') setRightWidth(w - 16);
      }}
      className="group absolute inset-y-3 -left-1.5 z-10 w-3 cursor-col-resize max-[900px]:hidden"
    >
      <span className="mx-auto block h-full w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-accent group-focus-visible:bg-accent" />
    </div>
  );
}

/** Slides in from the right while one thing is selected, full height (the top-right buttons move left of it). */
export function DetailPanel() {
  const selection = useUi((s) => s.selection);
  const width = useUi((s) => s.rightWidth);
  const { view } = useWorkspace();
  if (!selection || !view) return null;
  let content: ReactNode = null;
  if (selection.type === 'node') {
    const node = view.nodes.find((n) => n.id === selection.id);
    content = node ? <NodeDetails key={node.id} node={node} /> : null;
  } else if (selection.type === 'area') content = <AreaDetails key={selection.id} areaId={selection.id} />;
  else if (selection.type === 'link') content = <LinkDetails key={selection.id} linkId={selection.id} />;
  else if (selection.type === 'note') content = <NoteDetails key={selection.id} noteId={selection.id} />;
  else if (selection.type === 'shape') content = <ShapeDetails key={selection.id} shapeId={selection.id} />;
  if (!content) return null;
  return (
    <aside
      className="float-panel absolute top-3 right-3 bottom-3 z-30 flex animate-[detail-in_200ms_var(--ease)] flex-col max-[900px]:left-3 max-[900px]:!w-auto"
      style={{ width }}
      aria-label="Details"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">{content}</div>
      <ResizeEdge />
    </aside>
  );
}
