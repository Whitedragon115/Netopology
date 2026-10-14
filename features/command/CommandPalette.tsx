'use client';

import { Command } from 'cmdk';
import { Layers, List, Moon, Search, Sun, Users } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect } from 'react';
import { Kbd } from '@/components/status';
import { nodeType } from '@/lib/domain';
import { useCanvases, useNodes } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { useUi } from '../workspace/store';

/** Ctrl/Cmd+K: jump to a node or canvas, or run an action. Replaces a visible search box. */
export function CommandPalette() {
  const { workspace, goToCanvas, revealNode } = useWorkspace();
  const { paletteOpen, setPalette, openSection } = useUi();
  const nodes = useNodes(workspace.id);
  const canvases = useCanvases(workspace.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!useUi.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPalette]);

  const run = (fn: () => void) => {
    setPalette(false);
    fn();
  };
  const toggleTheme = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('netopology.theme', next);
    } catch {
      /* not remembered */
    }
  };
  const item = 'flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] data-[selected=true]:bg-accent-subtle';
  const group = '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase';

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={setPalette}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[300] bg-overlay" />
        <Dialog.Content className="fixed top-[14vh] left-1/2 z-[301] w-[min(560px,calc(100%-32px))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command loop>
            <div className="relative border-b border-border">
              <Search className="absolute top-4.5 left-4 size-4 text-faint" />
              <Command.Input autoFocus placeholder="Search nodes, canvases, actions…" className="h-13 w-full bg-transparent pr-4 pl-11 text-base outline-none" />
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-3.5 py-3 text-[13px] text-faint">Nothing found.</Command.Empty>
              <Command.Group heading="Nodes" className={group}>
                {nodes.data?.map((n) => {
                  const t = nodeType(n.type);
                  const Icon = t.icon;
                  return (
                    <Command.Item key={n.id} value={`${n.name} ${n.slug}`} onSelect={() => run(() => void revealNode(n.id))} className={item}>
                      <span className="grid size-6.5 place-items-center rounded-sm bg-node-icon-bg text-node-icon"><Icon className="size-3.5" /></span>
                      {n.name}
                      <span className="ml-auto text-xs text-faint">{t.label}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
              <Command.Group heading="Canvases" className={group}>
                {canvases.data?.map((c) => (
                  <Command.Item key={c.id} value={`canvas ${c.name}`} onSelect={() => run(() => goToCanvas(c.id))} className={item}>
                    <span className="grid size-6.5 place-items-center rounded-sm bg-node-icon-bg text-node-icon"><Layers className="size-3.5" /></span>
                    {c.name}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Actions" className={group}>
                <Command.Item value="open inventory" onSelect={() => run(() => openSection('inventory'))} className={item}><List className="size-4 text-muted" />Open inventory</Command.Item>
                <Command.Item value="open members" onSelect={() => run(() => openSection('members'))} className={item}><Users className="size-4 text-muted" />Open members</Command.Item>
                <Command.Item value="switch theme dark light" onSelect={() => run(toggleTheme)} className={item}><Moon className="size-4 text-muted" />Switch light / dark theme<Sun className="ml-auto size-3.5 text-faint" /></Command.Item>
              </Command.Group>
            </Command.List>
            <div className="flex gap-3 border-t border-border px-3 py-2 text-2xs text-faint">
              <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> move</span>
              <span><Kbd>Enter</Kbd> open</span>
              <span><Kbd>Esc</Kbd> close</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
