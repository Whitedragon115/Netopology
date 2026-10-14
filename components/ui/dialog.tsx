'use client';

import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A centered dialog in the app's style. Pass `trigger` to render its opener, or control it with
 * `open` / `onOpenChange`. `footer` sits under the content, right-aligned.
 */
export function Modal({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        {/* above the settings window (z-90), so dialogs opened from it are in front */}
        <D.Overlay className="fixed inset-0 z-[120] bg-overlay" />
        <D.Content
          className={cn(
            'float-panel fixed top-1/2 left-1/2 z-[121] max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5',
            wide ? 'w-[min(560px,calc(100vw-32px))]' : 'w-[min(420px,calc(100vw-32px))]',
          )}
        >
          <D.Title className="text-base font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const ModalClose = D.Close;
