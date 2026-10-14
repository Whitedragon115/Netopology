'use client';

import { Check, EyeOff, MapPinPlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Chip, StatusChip } from '@/components/status';
import { Button, IconButton } from '@/components/ui/button';
import type { InvNode, NodeCategory } from '@/lib/api/types';
import { useEditor } from '../canvas/editor';
import { placeNode } from '../canvas/place';
import { CATEGORIES, CATEGORY, nodeType } from '@/lib/domain';
import { cn } from '@/lib/cn';
import { useAreas, useNodes } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { RAIL_WIDTH, useUi, type Section } from '../workspace/store';
import { ActivitySection } from './ActivitySection';
import { ComingSoon, MonitorSection } from './MonitorSection';
import { MembersSection } from './MembersSection';
import { DeleteNodeDialog, EditNodeDialog } from './NodeDialogs';
import { SectionHeader } from './parts';

/**
 * Pages (Inventory, Members, Monitor, Activity…) open from the side panel. Layout: [side panel] [page],
 * both floating. Layers: side panel > page > map. Only the map is blurred, so the side panel stays
 * sharp and usable (DRA-68). Clicking the blurred map or Esc closes the page.
 *
 * Settings are not pages: they are one floating window in the middle (features/settings/SettingsWindow).
 */
const LABEL: Record<Exclude<Section, null>, string> = {
  inventory: 'Inventory',
  members: 'Members',
  monitor: 'Monitor',
  activity: 'Activity',
  workflows: 'Workflows',
  plugins: 'Plugins',
};

export function SectionOverlay() {
  const { section, openSection, leftWidth, leftCollapsed } = useUi();
  if (!section) return null;
  const left = (leftCollapsed ? RAIL_WIDTH : leftWidth) + 24;
  return (
    <div className="absolute inset-0 z-35" role="dialog" aria-modal="false" aria-label={LABEL[section]}>
      <button type="button" aria-label="Close" tabIndex={-1} onClick={() => openSection(null)} className="absolute inset-0 animate-[fade-in_160ms_var(--ease)] cursor-default bg-[color-mix(in_oklch,var(--bg)_45%,transparent)] backdrop-blur-[6px]" />
      <section className="float-panel absolute top-3 right-3 bottom-3 flex animate-[detail-in_200ms_var(--ease)] flex-col overflow-hidden shadow-xl max-[700px]:!left-3" style={{ left }}>
        {section === 'inventory' && <Inventory />}
        {section === 'members' && <MembersSection />}
        {section === 'monitor' && <MonitorSection />}
        {section === 'activity' && <ActivitySection />}
        {(section === 'workflows' || section === 'plugins') && <ComingSoon section={section} />}
      </section>
    </div>
  );
}

function Inventory() {
  const { workspace, revealNode, toast, view } = useWorkspace();
  const nodes = useNodes(workspace.id);
  const areas = useAreas(workspace.id);
  const openSection = useUi((s) => s.openSection);
  const setTool = useUi((s) => s.setTool);
  const select = useUi((s) => s.select);
  const editor = useEditor();
  const placedHere = new Set(view?.placements.filter((p) => p.item.type === 'node').map((p) => p.item.id) ?? []);

  /** Place an existing node on the open canvas (inside its area's box when that box is drawn here). */
  const placeHere = (n: InvNode) => {
    if (!view) return;
    if (!placeNode(editor, view, n)) return;
    openSection(null);
    select({ type: 'node', id: n.id });
    toast(`${n.name} placed on ${view.canvas.name}. Drag it where you want it; its links appear by themselves.`);
  };
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<NodeCategory | null>(null);
  // editors, admins and owners can change the inventory; the server still checks each node
  const canWrite = workspace.membership.role !== 'viewer';
  const [dialog, setDialog] = useState<{ kind: 'edit' | 'delete'; node: InvNode } | null>(null);
  const items = (nodes.data ?? []).filter((n) => (!cat || n.category === cat) && (!q || n.name.toLowerCase().includes(q.toLowerCase()) || n.slug.includes(q.toLowerCase())));
  const areaOf = (id: string | null) => areas.data?.find((a) => a.id === id);
  return (
    <>
      <SectionHeader
        title="Inventory"
        badge={<Chip>{nodes.data?.length ?? 0} nodes · {areas.data?.length ?? 0} areas</Chip>}
        actions={view?.viewer.canEdit && <Button variant="primary" onClick={() => { openSection(null); setTool({ kind: 'node', category: 'generic' }); }}><Plus className="size-3.5" />New node</Button>}
      />
      <div className="overflow-auto px-5 pb-5">
        <p className="mb-3.5 text-[13px] text-muted">Everything in this workspace, drawn or not. A node is one record, shown on any number of canvases.</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or slug…" aria-label="Search inventory" className="h-8 w-64 rounded-sm border border-border-strong bg-surface pr-3 pl-8.5 text-[13px] shadow-xs focus:border-accent focus:outline-none" />
          </label>
          {[null, ...CATEGORIES].map((c) => (
            <button key={c ?? 'all'} type="button" onClick={() => setCat(c)} className={cn('h-6 rounded-full border px-2.5 text-xs', cat === c ? 'border-transparent bg-accent-subtle text-accent' : 'border-border bg-surface-raised text-muted hover:text-text')}>
              {c ? CATEGORY[c].label : 'All'}
            </button>
          ))}
        </div>
        <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-md border border-border text-[13px]">
          <thead>
            <tr className="bg-surface-raised text-left text-xs text-faint">
              {['Name', 'Slug', 'Category', 'Area', 'IP address', 'Health', view ? `On ${view.canvas.name}` : '', ...(canWrite ? [''] : [])].map((h, i) => <th key={i} className="border-b border-border px-3 py-2 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((n) => {
              const t = nodeType(n.type);
              const Icon = t.icon;
              const ip = n.properties.find((f) => f.key === 'ip');
              const area = areaOf(n.areaId);
              return (
                <tr key={n.id} onClick={() => { openSection(null); void revealNode(n.id); }} className="cursor-pointer hover:bg-surface-raised [&>td]:border-b [&>td]:border-border last:[&>td]:border-0">
                  <td className="px-3 py-2"><span className="flex items-center gap-2.5"><span className="grid size-7 place-items-center rounded-sm bg-node-icon-bg text-node-icon"><Icon className="size-4" /></span><span><span className="block font-medium">{n.name}</span><span className="block text-2xs text-faint">{t.label}</span></span></span></td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{n.slug}</td>
                  <td className="px-3 py-2">{CATEGORY[n.category].label}</td>
                  <td className="px-3 py-2">{area ? <span className={cn('inline-flex items-center gap-1.5', `area-${area.color}`)}><span className="size-2 rounded-full bg-[var(--area)]" />{area.name}</span> : <span className="text-faint">-</span>}</td>
                  <td className="px-3 py-2">{!ip ? <span className="text-faint">-</span> : ip.redacted ? <Chip dashed><EyeOff className="size-3" />Hidden</Chip> : <span className="font-mono text-xs">{ip.value}</span>}</td>
                  <td className="px-3 py-2"><StatusChip status={n.health.status} /></td>
                  <td className="px-3 py-2">
                    {placedHere.has(n.id) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-faint"><Check className="size-3.5" />Placed</span>
                    ) : view?.viewer.canEdit ? (
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); placeHere(n); }}><MapPinPlus className="size-3.5" />Place here</Button>
                    ) : (
                      <span className="text-faint">-</span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <span className="flex justify-end gap-0.5">
                        <IconButton label={`Edit ${n.name}`} size="sm" onClick={() => setDialog({ kind: 'edit', node: n })}>
                          <Pencil className="size-3.5" />
                        </IconButton>
                        <IconButton label={`Delete ${n.name}`} size="sm" onClick={() => setDialog({ kind: 'delete', node: n })}>
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
            {!items.length && <tr><td colSpan={8} className="px-3 py-4 text-faint">No nodes match.</td></tr>}
          </tbody>
        </table>
        {dialog?.kind === 'edit' && <EditNodeDialog node={dialog.node} open onOpenChange={(o) => !o && setDialog(null)} />}
        {dialog?.kind === 'delete' && <DeleteNodeDialog node={dialog.node} open onOpenChange={(o) => !o && setDialog(null)} />}
      </div>
    </>
  );
}
