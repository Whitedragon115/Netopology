'use client';

import { Cpu, Network, Puzzle, Radar, Timer, Workflow, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { DOT, StatusChip } from '@/components/status';
import type { HealthStatus } from '@/lib/api/types';
import { nodeType, SEVERITY, STATUS } from '@/lib/domain';
import { cn } from '@/lib/cn';
import { useNodes } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { useUi, type MonitorTab } from '../workspace/store';
import { SectionHeader } from './parts';

/**
 * Monitor page (DRA-66). Its sub-pages are listed under Monitor in the side panel. Overview works today
 * (health of every node, worst first); the others are where measurements will live once plugins
 * collect them (phase C3).
 */
export const MONITOR_PAGES: { id: Exclude<MonitorTab, 'overview'>; label: string; icon: LucideIcon; text: string }[] = [
  { id: 'uptime', label: 'Uptime', icon: Timer, text: 'Up/down history and response times for every node with a health check.' },
  { id: 'resources', label: 'Resources', icon: Cpu, text: 'CPU, memory and disk of servers, VMs and containers.' },
  { id: 'snmp', label: 'SNMP', icon: Radar, text: 'Switches, routers and access points polled over SNMP: interfaces, errors, temperatures.' },
  { id: 'traffic', label: 'Traffic', icon: Network, text: 'Throughput per link and per interface, drawn on the canvas links too.' },
];

export function MonitorSection() {
  const tab = useUi((s) => s.monitorTab);
  const page = MONITOR_PAGES.find((t) => t.id === tab);
  return (
    <>
      <SectionHeader title={page ? `Monitor · ${page.label}` : 'Monitor'} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {page ? <Placeholder icon={page.icon} title={page.label} text={page.text} phase="Collected by plugins, phase C3" /> : <Overview />}
      </div>
    </>
  );
}

function Overview() {
  const { workspace, revealNode } = useWorkspace();
  const openSection = useUi((s) => s.openSection);
  const nodes = useNodes(workspace.id);
  const counts: Record<HealthStatus, number> = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
  nodes.data?.forEach((n) => counts[n.health.status]++);
  const attention = (nodes.data ?? []).filter((n) => n.health.status !== 'healthy').sort((a, b) => SEVERITY.indexOf(b.health.status) - SEVERITY.indexOf(a.health.status));
  return (
    <div className="grid max-w-4xl gap-6">
      <div className="grid grid-cols-4 gap-3 max-[700px]:grid-cols-2">
        {(['down', 'degraded', 'unknown', 'healthy'] as const).map((s) => (
          <div key={s} className="grid gap-1 rounded-md border border-border bg-surface p-4">
            <span className={cn('text-2xl leading-none font-semibold', s === 'down' && counts.down && 'text-down', s === 'degraded' && counts.degraded && 'text-degraded')}>{counts[s]}</span>
            <span className="flex items-center gap-1.5 text-xs text-faint">
              <span className={cn('size-2 rounded-full', DOT[s])} />
              {STATUS[s].label}
            </span>
          </div>
        ))}
      </div>
      <section>
        <h2 className="mb-2 text-sm font-semibold">Needs attention</h2>
        {attention.length ? (
          <div className="overflow-hidden rounded-md border border-border">
            {attention.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => { openSection(null); void revealNode(n.id); }}
                className="flex w-full items-center gap-3 border-b border-border px-3.5 py-2.5 text-left text-[13px] last:border-0 hover:bg-surface-raised"
              >
                <StatusChip status={n.health.status} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{n.name}</span>
                  <span className="block truncate text-xs text-faint">{n.health.message || nodeType(n.type).label}</span>
                </span>
                <span className="ml-auto text-xs text-faint">Show on canvas</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-faint">Everything that reports health is healthy.</p>
        )}
      </section>
      <p className="text-xs text-faint">Health is set by hand today (details panel → Health). Plugins will check it automatically in phase C3.</p>
    </div>
  );
}

function Placeholder({ icon: Icon, title, text, phase, children }: { icon: LucideIcon; title: string; text: string; phase: string; children?: ReactNode }) {
  return (
    <div className="grid max-w-lg place-items-start gap-3 rounded-lg border border-dashed border-border-strong p-6">
      <span className="grid size-10 place-items-center rounded-md bg-accent-subtle text-accent"><Icon className="size-5" /></span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-[13px] text-muted">{text}</p>
      {children}
      <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-faint">{phase}</span>
    </div>
  );
}

const SOON = {
  workflows: { title: 'Workflows', icon: Workflow, phase: 'Phase C4', text: 'Multi-step automations across your services, for example "add a domain" in Cloudflare, DNS and Nginx Proxy Manager at once, with a readable log of every run.' },
  plugins: { title: 'Plugins', icon: Puzzle, phase: 'Phase C3', text: 'Connect Netopology to your services: plugins check health, add actions to nodes, and feed the Monitor pages.' },
} as const;

/** Pages for features that come in later phases: what they will do, so the side panel already has its final shape. */
export function ComingSoon({ section }: { section: keyof typeof SOON }) {
  const s = SOON[section];
  return (
    <>
      <SectionHeader title={s.title} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <Placeholder icon={s.icon} title="Coming later" text={s.text} phase={s.phase} />
      </div>
    </>
  );
}
