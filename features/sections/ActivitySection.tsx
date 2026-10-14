'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Bot, Link2, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/controls';
import { api, unwrap } from '@/lib/api/client';
import type { AuditEntry, AuditPage } from '@/lib/api/types';
import { fullDate, relative } from '@/lib/time';
import { useAreas, useCanvases, useMembers, useNodes } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { SectionHeader } from './parts';

/*
 * Activity (WP-13): the workspace audit log, newest first. Owners and admins only (audit.list).
 * Entries name their target by id only, so names come from what the app already has loaded;
 * something deleted since shows as "(deleted)".
 */

const KINDS = [
  { value: 'all', label: 'Everything' },
  { value: 'node.', label: 'Nodes' },
  { value: 'link.', label: 'Links' },
  { value: 'area.', label: 'Areas' },
  { value: 'note.', label: 'Notes' },
  { value: 'canvas.', label: 'Canvases and drawing' },
  { value: 'member.', label: 'Members' },
  { value: 'share', label: 'Share links and guests' },
  { value: 'workspace.', label: 'Workspace settings' },
] as const;
const PERIODS = [
  { value: 'any', label: 'Any time' },
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
] as const;

const NOUN: Record<string, string> = {
  node: 'node',
  link: 'link',
  area: 'area',
  note: 'note',
  canvas: 'canvas',
  member: 'member',
  workspace: 'workspace',
  share_link: 'share link',
  share: 'shared canvas',
};
const VERB: Record<string, string> = {
  create: 'created',
  update: 'changed',
  delete: 'deleted',
  edit: 'edited the drawing on',
  lock: 'locked',
  unlock: 'unlocked',
  health_set: 'set the health of',
  add: 'added',
  remove: 'removed',
  grants_set: 'changed the canvas access of',
  revoke: 'revoked',
  unlock_share: 'opened',
};

/** "node.update" → "changed node". Unknown keys are shown as they are. */
function describe(action: string) {
  const [noun = '', verb = ''] = action.split('.');
  if (action === 'share.unlock') return 'opened a share link';
  if (!VERB[verb] || !NOUN[noun]) return action;
  return `${VERB[verb]} ${NOUN[noun]}`;
}

export function ActivitySection() {
  const { workspace } = useWorkspace();
  const manage = workspace.membership.role === 'owner' || workspace.membership.role === 'admin';
  const members = useMembers(workspace.id);
  const nodes = useNodes(workspace.id);
  const areas = useAreas(workspace.id);
  const canvases = useCanvases(workspace.id);
  const links = useQuery({
    queryKey: ['ws', workspace.id, 'links'],
    enabled: manage,
    queryFn: async () => unwrap(await api.GET('/workspaces/{wsId}/links', { params: { path: { wsId: workspace.id }, query: { limit: 200 } } })).items,
  });
  const [actor, setActor] = useState('all');
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('all');
  const [period, setPeriodValue] = useState<(typeof PERIODS)[number]['value']>('any');
  // "since" is fixed when the period is picked, so the query key stays stable between renders
  const [since, setSince] = useState<string | undefined>(undefined);
  const setPeriod = (p: (typeof PERIODS)[number]['value']) => {
    setPeriodValue(p);
    setSince(p === 'any' ? undefined : new Date(Date.now() - Number(p) * 86_400_000).toISOString());
  };

  const log = useInfiniteQuery({
    queryKey: ['ws', workspace.id, 'audit', actor, kind, since],
    enabled: manage,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: AuditPage) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET('/workspaces/{wsId}/audit-log', {
          params: {
            path: { wsId: workspace.id },
            query: {
              limit: 50,
              ...(pageParam ? { cursor: pageParam } : {}),
              ...(actor !== 'all' ? { actorId: actor } : {}),
              ...(kind !== 'all' ? { action: kind } : {}),
              ...(since ? { since } : {}),
            },
          },
        }),
      ),
  });

  const names = useMemo(() => {
    const m = new Map<string, string>();
    nodes.data?.forEach((n) => m.set(n.id, n.name));
    areas.data?.forEach((a) => m.set(a.id, a.name));
    canvases.data?.forEach((c) => m.set(c.id, c.name));
    members.data?.forEach((x) => m.set(x.user.id, x.user.displayName || x.user.username));
    m.set(workspace.id, workspace.name);
    // a link is named after its two ends
    links.data?.forEach((l) => m.set(l.id, `${m.get(l.sourceNodeId) ?? '?'} ↔ ${m.get(l.targetNodeId) ?? '?'}`));
    return m;
  }, [nodes.data, areas.data, canvases.data, members.data, links.data, workspace]);

  const entries = log.data?.pages.flatMap((p) => p.items) ?? [];

  if (!manage)
    return (
      <>
        <SectionHeader title="Activity" />
        <p className="px-5 text-[13px] text-muted">The activity log is visible to workspace owners and admins.</p>
      </>
    );

  return (
    <>
      <SectionHeader title="Activity" />
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <Select
          aria-label="Who"
          value={actor}
          onValueChange={setActor}
          options={[{ value: 'all', label: 'Everyone' }, ...(members.data ?? []).map((m) => ({ value: m.user.id, label: m.user.displayName || m.user.username }))]}
        />
        <Select aria-label="What" value={kind} onValueChange={setKind} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        <Select aria-label="When" value={period} onValueChange={setPeriod} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {log.isLoading ? (
          <p className="text-[13px] text-faint">Loading…</p>
        ) : log.isError ? (
          <p className="text-[13px] text-down">{log.error.message}</p>
        ) : entries.length ? (
          <div className="overflow-hidden rounded-md border border-border">
            {entries.map((e) => <Row key={e.id} entry={e} names={names} />)}
          </div>
        ) : (
          <p className="text-[13px] text-faint">Nothing happened {period === 'any' ? 'yet' : 'in this period'}{kind !== 'all' || actor !== 'all' ? ' that matches' : ''}.</p>
        )}
        {log.hasNextPage && (
          <div className="mt-3 flex justify-center">
            <Button onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
              {log.isFetchingNextPage ? 'Loading…' : 'Show older'}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function Row({ entry: e, names }: { entry: AuditEntry; names: Map<string, string> }) {
  const who =
    e.actor.type === 'user'
      ? e.actor.displayName || (e.actor.id && names.get(e.actor.id)) || 'Someone'
      : e.actor.type === 'share_link'
        ? 'A guest'
        : e.actor.type === 'workflow'
          ? 'A workflow'
          : 'Netopology';
  const Icon = e.actor.type === 'user' ? UserRound : e.actor.type === 'share_link' ? Link2 : Bot;
  const target = e.target ? (names.get(e.target.id) ?? (e.target.type === 'share_link' ? '' : '(deleted)')) : '';
  const counts = e.metadata.operationCounts && typeof e.metadata.operationCounts === 'object' ? (e.metadata.operationCounts as Record<string, number>) : null;
  const fields = Array.isArray(e.metadata.fields) ? (e.metadata.fields as string[]) : null;
  const detail = counts
    ? Object.entries(counts).map(([k, n]) => `${n} ${k.replace('.', ' ')}`).join(', ')
    : fields?.length
      ? `Changed ${fields.join(', ')}`
      : '';
  return (
    <div className="flex items-start gap-3 border-b border-border px-3.5 py-2.5 text-[13px] last:border-0">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-raised text-muted">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <span className="font-medium">{who}</span> <span className="text-muted">{describe(e.action)}</span>
          {target && <span className="font-medium"> {target}</span>}
        </div>
        {detail && <div className="truncate text-xs text-faint">{detail}</div>}
      </div>
      <span className="shrink-0 text-xs text-faint" title={`${fullDate(e.createdAt)}${e.ip ? ` · ${e.ip}` : ''}`}>
        {relative(e.createdAt)}
      </span>
    </div>
  );
}
