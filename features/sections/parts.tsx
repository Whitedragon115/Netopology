'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useUi } from '../workspace/store';

/** Title row of a section (Inventory, Members, Settings, ...). */
export function SectionHeader({ title, badge, actions }: { title: string; badge?: ReactNode; actions?: ReactNode }) {
  const openSection = useUi((s) => s.openSection);
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
      <h1 className="text-lg font-semibold">{title}</h1>
      {badge}
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <IconButton label="Close (Esc)" onClick={() => openSection(null)}>
          <X className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

/** A titled card inside a section, for settings-style pages. */
export function Panel({ title, description, children, danger }: { title: string; description?: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <section className={cn('rounded-md border bg-surface p-4', danger ? 'border-down/40' : 'border-border')}>
      <h2 className={cn('text-sm font-semibold', danger && 'text-down')}>{title}</h2>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** One label/value row in a Panel. */
export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-center gap-x-4 gap-y-1 border-t border-border py-3 first:border-0 first:pt-0 last:pb-0 sm:grid-cols-[180px_1fr]">
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="text-xs text-faint">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Small round avatar with initials. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('grid size-7.5 shrink-0 place-items-center rounded-full border border-border bg-surface text-2xs font-semibold', className)}>
      {(name || '··').slice(0, 2).toUpperCase()}
    </span>
  );
}
