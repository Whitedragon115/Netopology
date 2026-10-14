'use client';

import { create } from 'zustand';
import type { AreaColor, LinkKind, NodeCategory, NoteColor } from '@/lib/api/types';

/** Local UI state only. Server data lives in TanStack Query (CONVENTIONS.md §4.2 rule 6). */
export type Selection = { type: 'node' | 'area' | 'link' | 'note' | 'shape'; id: string } | null;
/** Pages that open beside the side panel, over the blurred map. Workflows and plugins are placeholders for later phases. */
/** The Monitor page's sub-pages, listed under Monitor in the side panel. */
export type MonitorTab = 'overview' | 'uptime' | 'resources' | 'snmp' | 'traffic';
export type Section = 'inventory' | 'members' | 'monitor' | 'activity' | 'workflows' | 'plugins' | null;
/** Pages of the settings window (one window, a sidebar of categories). accounts/server: server staff only. */
export type SettingsPage = 'workspace' | 'profile' | 'security' | 'accounts' | 'server' | 'preferences';
export type Tool =
  | { kind: 'select' }
  | { kind: 'pan' }
  | { kind: 'node'; category: NodeCategory }
  | { kind: 'area'; color: AreaColor }
  | { kind: 'link'; linkKind: LinkKind }
  | { kind: 'note'; color: NoteColor }
  | { kind: 'shape'; shape: DrawShape };

/** Free-drawing tools (canvas_shapes). `line` exists in the contract but the toolbar offers arrow. */
export type DrawShape = 'text' | 'rectangle' | 'ellipse' | 'arrow' | 'freehand';

const PANEL_KEY = 'netopology.leftPanelWidth';
export const PANEL_MIN = 220;
export const PANEL_MAX = 440;
const NOTIFY_KEY = 'netopology.actionNotifications';
const RIGHT_KEY = 'netopology.rightPanelWidth';
export const RIGHT_MIN = 320;
export const RIGHT_MAX = 620;
/** Width of the collapsed side panel (icons only). */
export const RAIL_WIDTH = 52;
function saved(key: string, min: number, max: number, fallback: number) {
  try {
    const v = Number(localStorage.getItem(key));
    return v >= min && v <= max ? v : fallback;
  } catch {
    return fallback;
  }
}
function savedFlag(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}
function remember(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* storage blocked: width just isn't remembered */
  }
}

interface UiState {
  selection: Selection;
  /** Several things picked at once (box select, Ctrl+A, paste): React Flow node ids. Empty unless 2+. */
  multi: string[];
  section: Section;
  monitorTab: MonitorTab;
  /** The settings window's page, or null when it's closed. */
  settings: SettingsPage | null;
  tool: Tool;
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  /** Show the little message after an action (saved, deleted, ...). On by default. */
  notifications: boolean;
  fold: { canvases: boolean };
  legendOpen: boolean;
  paletteOpen: boolean;
  select: (s: Selection) => void;
  setMulti: (ids: string[]) => void;
  openSection: (s: Section) => void;
  openMonitor: (tab: MonitorTab) => void;
  openSettings: (page: SettingsPage | null) => void;
  setTool: (t: Tool) => void;
  setLeftWidth: (w: number) => void;
  setRightWidth: (w: number) => void;
  toggleLeft: () => void;
  setNotifications: (on: boolean) => void;
  toggleFold: (k: 'canvases') => void;
  setLegend: (open: boolean) => void;
  setPalette: (open: boolean) => void;
  hydrate: () => void;
}

/** Fit-to-screen padding that leaves room for the floating panels (left panel, detail panel, toolbar). */
export function fitPadding() {
  const s = useUi.getState();
  const px = (n: number) => `${Math.round(n)}px` as const;
  return {
    top: px(72),
    bottom: px(84),
    left: px((s.leftCollapsed ? RAIL_WIDTH : s.leftWidth) + 40),
    right: px(s.selection ? s.rightWidth + 40 : 32),
  };
}

export const useUi = create<UiState>((set) => ({
  selection: null,
  multi: [],
  section: null,
  monitorTab: 'overview',
  settings: null,
  tool: { kind: 'select' },
  leftWidth: 260,
  rightWidth: 360,
  leftCollapsed: false,
  notifications: true,
  fold: { canvases: true },
  legendOpen: false,
  paletteOpen: false,
  select: (selection) => set({ selection, multi: [] }),
  setMulti: (ids) => set({ multi: ids.length > 1 ? ids : [], selection: null }),
  // opening a section clears the selection; closing one keeps it (e.g. jumping to a node from Inventory)
  openSection: (section) => set(section ? { section, selection: null, multi: [] } : { section }),
  openSettings: (settings) => set({ settings }),
  openMonitor: (monitorTab) => set({ section: 'monitor', monitorTab, selection: null, multi: [] }),
  setTool: (tool) => set({ tool }),
  setLeftWidth: (w) => {
    const leftWidth = Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, w)));
    remember(PANEL_KEY, leftWidth);
    set({ leftWidth });
  },
  setRightWidth: (w) => {
    const rightWidth = Math.round(Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, w)));
    remember(RIGHT_KEY, rightWidth);
    set({ rightWidth });
  },
  setNotifications: (notifications) => {
    try {
      localStorage.setItem(NOTIFY_KEY, notifications ? '1' : '0');
    } catch {
      /* storage blocked: the choice just isn't remembered */
    }
    set({ notifications });
  },
  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleFold: (k) => set((s) => ({ fold: { ...s.fold, [k]: !s.fold[k] } })),
  setLegend: (legendOpen) => set({ legendOpen }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  hydrate: () => set({ notifications: savedFlag(NOTIFY_KEY, true), leftWidth: saved(PANEL_KEY, PANEL_MIN, PANEL_MAX, 260), rightWidth: saved(RIGHT_KEY, RIGHT_MIN, RIGHT_MAX, 360) }),
}));
