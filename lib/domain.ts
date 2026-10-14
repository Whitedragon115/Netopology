import {
  Box,
  CircleCheck,
  CircleDashed,
  CircleX,
  Cloud,
  Database,
  Gamepad2,
  Globe,
  type LucideIcon,
  Monitor,
  Router,
  Server,
  Shield,
  Shuffle,
  TriangleAlert,
  Waypoints,
  ListTree,
} from 'lucide-react';
import type { AreaColor, HealthStatus, LinkKind, NodeCategory } from './api/types';

/** Shared product vocabulary (CONVENTIONS.md §1 glossary, §5.4 visual language). */

export type Shape = 'rounded' | 'square' | 'cloud' | 'hexagon';
export type Border = 'solid' | 'double' | 'dashed';

/** Category is shown by SHAPE + BORDER only; every node is the same gray. */
export const CATEGORY: Record<NodeCategory, { label: string; shape: Shape; border: Border }> = {
  network: { label: 'Network', shape: 'hexagon', border: 'solid' },
  compute: { label: 'Compute', shape: 'square', border: 'double' },
  service: { label: 'Service', shape: 'rounded', border: 'solid' },
  storage: { label: 'Storage', shape: 'rounded', border: 'double' },
  external: { label: 'External', shape: 'cloud', border: 'solid' },
  generic: { label: 'Generic', shape: 'rounded', border: 'dashed' },
};
export const CATEGORIES = Object.keys(CATEGORY) as NodeCategory[];

/** Built-in node types. Plugins (phase C3) will register more as `<plugin-id>/<type>`. */
export const NODE_TYPES: Record<string, { label: string; icon: LucideIcon; category: NodeCategory }> = {
  'builtin.internet': { label: 'Internet', icon: Globe, category: 'external' },
  'builtin.cloud_service': { label: 'Cloud service', icon: Cloud, category: 'external' },
  'builtin.router': { label: 'Router', icon: Router, category: 'network' },
  'builtin.vpn_gateway': { label: 'VPN gateway', icon: Shield, category: 'network' },
  'builtin.reverse_proxy': { label: 'Reverse proxy', icon: Shuffle, category: 'service' },
  'builtin.dns': { label: 'DNS server', icon: ListTree, category: 'service' },
  'builtin.game_panel': { label: 'Game panel', icon: Gamepad2, category: 'service' },
  'builtin.docker_host': { label: 'Docker host', icon: Server, category: 'compute' },
  'builtin.vm': { label: 'Virtual machine', icon: Monitor, category: 'compute' },
  'builtin.nas': { label: 'NAS', icon: Database, category: 'storage' },
  'builtin.generic': { label: 'Node', icon: Box, category: 'generic' },
};
/** Default type offered when adding a node of a category from the toolbar. */
export const DEFAULT_TYPE_FOR: Record<NodeCategory, string> = {
  network: 'builtin.router',
  compute: 'builtin.vm',
  service: 'builtin.reverse_proxy',
  storage: 'builtin.nas',
  external: 'builtin.cloud_service',
  generic: 'builtin.generic',
};
export function nodeType(type: string) {
  return NODE_TYPES[type] ?? { label: type.split('/').pop() ?? type, icon: Waypoints, category: 'generic' as const };
}

export const LINK_KIND: Record<LinkKind, { label: string; directed: boolean }> = {
  physical: { label: 'Physical cable', directed: false },
  vpn_tunnel: { label: 'VPN tunnel', directed: false },
  proxy_route: { label: 'Proxy route', directed: true },
  dns_dependency: { label: 'DNS dependency', directed: true },
  storage_mount: { label: 'Storage mount', directed: false },
  logical: { label: 'Logical', directed: false },
};
export const LINK_KINDS = Object.keys(LINK_KIND) as LinkKind[];
/** The link tool's default kind: the first kind this canvas actually draws. */
export const defaultLinkKind = (hidden: readonly LinkKind[] = []): LinkKind => LINK_KINDS.find((k) => !hidden.includes(k)) ?? 'logical';

export const STATUS: Record<HealthStatus, { label: string; icon: LucideIcon }> = {
  healthy: { label: 'Healthy', icon: CircleCheck },
  degraded: { label: 'Degraded', icon: TriangleAlert },
  down: { label: 'Down', icon: CircleX },
  unknown: { label: 'Unknown', icon: CircleDashed },
};
/** Worst-wins order for rolling health up into areas. */
export const SEVERITY: HealthStatus[] = ['healthy', 'unknown', 'degraded', 'down'];
export function worst(statuses: HealthStatus[]): HealthStatus {
  return statuses.reduce<HealthStatus>((w, s) => (SEVERITY.indexOf(s) > SEVERITY.indexOf(w) ? s : w), 'healthy');
}

export const AREA_COLORS: AreaColor[] = ['yellow', 'teal', 'violet', 'rose', 'blue', 'green', 'gray'];
