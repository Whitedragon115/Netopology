'use client';

import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  EyeOff,
  LogIn,
  Maximize,
  Maximize2,
  Minimize2,
  PanelRight,
  Pencil,
  Redo2,
  SquareDashedMousePointer,
  StickyNote,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { ContextMenu as Menu } from 'radix-ui';
import type { ReactNode } from 'react';
import type { NodeCategory } from '@/lib/api/types';
import { CATEGORIES, CATEGORY } from '@/lib/domain';
import { cn } from '@/lib/cn';
import { Kbd } from '@/components/status';
import { ShapeSample } from './samples';

/** What was right-clicked. `at` is the canvas point under the pointer (absolute flow coordinates). */
export type MenuTarget =
  | { kind: 'pane'; at: { x: number; y: number } }
  | { kind: 'items'; flowIds: string[]; at: { x: number; y: number } }
  | { kind: 'node'; flowId: string; nodeId: string; at: { x: number; y: number } }
  | { kind: 'area'; flowId: string; areaId: string; collapsed: boolean; at: { x: number; y: number } }
  | { kind: 'note'; flowId: string; noteId: string; at: { x: number; y: number } }
  | { kind: 'shape'; flowId: string; shapeId: string; text: boolean; at: { x: number; y: number } }
  | { kind: 'link'; linkId: string; at: { x: number; y: number } }
  | { kind: 'ghost'; nodeId: string; at: { x: number; y: number } };

export interface MenuHandlers {
  canEdit: boolean;
  canPaste: boolean;
  canUndo: boolean;
  canRedo: boolean;
  details: (t: MenuTarget) => void;
  copy: (flowIds: string[]) => void;
  paste: (at: { x: number; y: number }) => void;
  remove: (flowIds: string[]) => void;
  addNode: (category: NodeCategory, at: { x: number; y: number }) => void;
  addNote: (at: { x: number; y: number }) => void;
  addText: (at: { x: number; y: number }) => void;
  editText: (flowId: string) => void;
  enterArea: (areaId: string) => void;
  toggleCollapse: (flowId: string, collapsed: boolean) => void;
  hideLink: (linkId: string) => void;
  selectAll: () => void;
  fit: () => void;
  undo: () => void;
  redo: () => void;
}

const content = 'float-panel z-[60] min-w-52 p-1.5 animate-[detail-in_120ms_var(--ease)]';
const itemCls =
  'flex h-8 cursor-default items-center gap-2.5 rounded-sm px-2 text-[13px] outline-none select-none data-[disabled]:text-faint data-[highlighted]:bg-surface-raised [&>svg]:size-4 [&>svg]:text-muted data-[disabled]:[&>svg]:text-faint';

function Item({ icon, children, onSelect, disabled, danger, keys }: { icon: ReactNode; children: ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean; keys?: string }) {
  return (
    <Menu.Item disabled={disabled} onSelect={onSelect} className={cn(itemCls, danger && 'text-down [&>svg]:text-down')}>
      {icon}
      {children}
      {keys && <Kbd className="ml-auto">{keys}</Kbd>}
    </Menu.Item>
  );
}
const Sep = () => <Menu.Separator className="my-1 h-px bg-border" />;

/**
 * Right-click menu for the canvas (DRA-69). The canvas tells it what was clicked through `target`
 * (set in React Flow's context-menu handlers, which run before the menu opens).
 */
export function CanvasContextMenu({ target, h, children }: { target: MenuTarget | null; h: MenuHandlers; children: ReactNode }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>{children}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={content} onCloseAutoFocus={(e) => e.preventDefault()}>
          {target && <Items t={target} h={h} />}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function Items({ t, h }: { t: MenuTarget; h: MenuHandlers }) {
  const edit = h.canEdit;
  const undoRedo = edit && (
    <>
      <Sep />
      <Item icon={<Undo2 />} disabled={!h.canUndo} onSelect={h.undo} keys="Ctrl Z">Undo</Item>
      <Item icon={<Redo2 />} disabled={!h.canRedo} onSelect={h.redo} keys="Ctrl ⇧ Z">Redo</Item>
    </>
  );

  if (t.kind === 'pane')
    return (
      <>
        {edit && (
          <>
            <Item icon={<ClipboardPaste />} disabled={!h.canPaste} onSelect={() => h.paste(t.at)} keys="Ctrl V">Paste here</Item>
            <Sep />
            <Menu.Sub>
              <Menu.SubTrigger className={cn(itemCls, 'data-[state=open]:bg-surface-raised')}>
                <SquareDashedMousePointer />
                Add node here
                <ChevronRight className="ml-auto" />
              </Menu.SubTrigger>
              <Menu.Portal>
                <Menu.SubContent className={content} sideOffset={6}>
                  {CATEGORIES.map((c) => (
                    <Menu.Item key={c} onSelect={() => h.addNode(c, t.at)} className={itemCls}>
                      <ShapeSample category={c} />
                      {CATEGORY[c].label}
                    </Menu.Item>
                  ))}
                </Menu.SubContent>
              </Menu.Portal>
            </Menu.Sub>
            <Item icon={<StickyNote />} onSelect={() => h.addNote(t.at)}>Add sticky note here</Item>
            <Item icon={<Type />} onSelect={() => h.addText(t.at)}>Add text here</Item>
            <Sep />
          </>
        )}
        <Item icon={<SquareDashedMousePointer />} onSelect={h.selectAll} keys="Ctrl A">Select all</Item>
        <Item icon={<Maximize />} onSelect={h.fit}>Fit to screen</Item>
        {undoRedo}
      </>
    );

  if (t.kind === 'link')
    return (
      <>
        <Item icon={<PanelRight />} onSelect={() => h.details(t)}>Details</Item>
        {edit && (
          <>
            <Sep />
            <Item icon={<EyeOff />} onSelect={() => h.hideLink(t.linkId)} keys="Del">Hide on this canvas</Item>
          </>
        )}
      </>
    );

  if (t.kind === 'ghost') return <Item icon={<PanelRight />} onSelect={() => h.details(t)}>Details</Item>;

  const ids = t.kind === 'items' ? t.flowIds : [t.flowId];
  const several = ids.length > 1;
  return (
    <>
      {!several && <Item icon={<PanelRight />} onSelect={() => h.details(t)}>Details</Item>}
      {t.kind === 'area' && (
        <>
          <Item icon={<LogIn />} onSelect={() => h.enterArea(t.areaId)}>Enter area</Item>
          {edit && (
            <Item icon={t.collapsed ? <Maximize2 /> : <Minimize2 />} onSelect={() => h.toggleCollapse(t.flowId, !t.collapsed)}>
              {t.collapsed ? 'Expand box' : 'Collapse to a block'}
            </Item>
          )}
        </>
      )}
      {edit && (t.kind === 'note' || (t.kind === 'shape' && t.text)) && <Item icon={<Pencil />} onSelect={() => h.editText(t.flowId)}>Edit text</Item>}
      {t.kind !== 'area' && (
        <>
          {!several && <Sep />}
          <Item icon={<Copy />} onSelect={() => h.copy(ids)} keys="Ctrl C">{several ? `Copy ${ids.length} items` : 'Copy'}</Item>
          {edit && <Item icon={<ClipboardPaste />} disabled={!h.canPaste} onSelect={() => h.paste(t.at)} keys="Ctrl V">Paste here</Item>}
        </>
      )}
      {edit && (
        <>
          <Sep />
          <Item icon={<Trash2 />} danger onSelect={() => h.remove(ids)} keys="Del">
            {several ? `Delete ${ids.length} items` : t.kind === 'node' ? 'Remove from canvas' : t.kind === 'area' ? 'Remove box from canvas' : 'Delete'}
          </Item>
        </>
      )}
      {undoRedo}
    </>
  );
}
