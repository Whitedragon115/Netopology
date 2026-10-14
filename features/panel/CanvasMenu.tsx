'use client';

import { MoreHorizontal, Pencil, Shield, ShieldOff, Trash2 } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, ModalClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import type { Canvas } from '@/lib/api/types';
import { useCanvases, useDeleteCanvas, useUpdateCanvas } from '../workspace/api';
import { useWorkspace } from '../workspace/context';

function canvasError(e: unknown) {
  if (!(e instanceof ApiError)) return 'Could not reach the server.';
  if (e.code === 'protected') return 'This canvas is protected. Only the workspace owner can delete it or remove protection.';
  if (e.status === 412) return 'Someone else changed this canvas first. Reload and try again.';
  if (e.status === 409) return e.message || 'Another canvas already has that name.';
  return e.message;
}

/** The "…" menu on a canvas row (owner/admin): rename, protect, delete. */
export function CanvasMenu({ canvas }: { canvas: Canvas }) {
  const { workspace, canvasId, goToCanvas, toast } = useWorkspace();
  const update = useUpdateCanvas(workspace.id);
  const del = useDeleteCanvas(workspace.id);
  const others = (useCanvases(workspace.id).data ?? []).filter((c) => c.id !== canvas.id);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [name, setName] = useState(canvas.name);
  const owner = workspace.membership.role === 'owner';

  const rename = () =>
    update.mutate(
      { canvas, body: { name: name.trim() } },
      { onSuccess: () => { setDialog(null); toast('Canvas renamed.'); }, onError: (e) => toast(canvasError(e)) },
    );
  const protect = (on: boolean) =>
    update.mutate(
      { canvas, body: { isProtected: on } },
      { onSuccess: () => toast(on ? `${canvas.name} is protected: only the owner can delete it.` : 'Protection removed.'), onError: (e) => toast(canvasError(e)) },
    );

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Options for ${canvas.name}`}
            className="grid size-6 place-items-center rounded-sm text-faint opacity-0 outline-none group-hover:opacity-100 hover:bg-surface hover:text-text focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" side="right" sideOffset={6} className="float-panel z-[60] w-52 p-1.5">
            <Item onSelect={() => { setName(canvas.name); setDialog('rename'); }} icon={<Pencil className="size-4" />}>Rename</Item>
            {canvas.isProtected ? (
              <Item disabled={!owner} onSelect={() => protect(false)} icon={<ShieldOff className="size-4" />} hint={owner ? undefined : 'owner only'}>Remove protection</Item>
            ) : (
              <Item onSelect={() => protect(true)} icon={<Shield className="size-4" />}>Protect</Item>
            )}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <Item danger disabled={canvas.isProtected && !owner} onSelect={() => setDialog('delete')} icon={<Trash2 className="size-4" />}>Delete canvas</Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Modal
        open={dialog === 'rename'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Rename canvas"
        footer={
          <>
            <ModalClose asChild><Button>Cancel</Button></ModalClose>
            <Button variant="primary" disabled={!name.trim() || name.trim() === canvas.name || update.isPending} onClick={rename}>Rename</Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) rename(); }}>
          <Input autoFocus value={name} maxLength={100} onChange={(e) => setName(e.target.value)} aria-label="Canvas name" />
        </form>
      </Modal>

      <Modal
        open={dialog === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete “${canvas.name}”?`}
        description="The canvas and its drawings (placements, notes on it, shapes) are deleted. Nodes, links and areas stay in the inventory and on other canvases."
        footer={
          <>
            <ModalClose asChild><Button>Cancel</Button></ModalClose>
            <Button
              variant="danger"
              disabled={del.isPending}
              onClick={() =>
                del.mutate(canvas, {
                  onSuccess: () => {
                    setDialog(null);
                    toast(`Deleted canvas ${canvas.name}.`);
                    if (canvas.id === canvasId && others[0]) goToCanvas(others[0].id);
                  },
                  onError: (e) => toast(canvasError(e)),
                })
              }
            >
              Delete canvas
            </Button>
          </>
        }
      />
    </>
  );
}

function Item({ children, icon, onSelect, disabled, danger, hint }: { children: ReactNode; icon: ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean; hint?: string }) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={`flex cursor-default items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] outline-none select-none data-[disabled]:text-faint data-[highlighted]:bg-surface-raised ${danger ? 'text-down' : ''}`}
    >
      <span className={danger ? '' : 'text-muted'}>{icon}</span>
      {children}
      {hint && <span className="ml-auto text-2xs text-faint">{hint}</span>}
    </DropdownMenu.Item>
  );
}
