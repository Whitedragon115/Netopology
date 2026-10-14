import type { HealthStatus } from '@/lib/api/types';
import { STATUS } from '@/lib/domain';
import { cn } from '@/lib/cn';

const TEXT: Record<HealthStatus, string> = {
  healthy: 'text-healthy',
  degraded: 'text-degraded',
  down: 'text-down',
  unknown: 'text-unknown',
};
const CHIP: Record<HealthStatus, string> = {
  healthy: 'text-healthy bg-healthy-subtle',
  degraded: 'text-degraded bg-degraded-subtle',
  down: 'text-down bg-down-subtle',
  unknown: 'text-unknown bg-unknown-subtle',
};
export const DOT: Record<HealthStatus, string> = {
  healthy: 'bg-healthy',
  degraded: 'bg-degraded',
  down: 'bg-down',
  unknown: 'bg-unknown',
};

/** Health is always color + icon (CONVENTIONS.md §5.1). */
export function StatusIcon({ status, className }: { status: HealthStatus; className?: string }) {
  const Icon = STATUS[status].icon;
  return <Icon aria-label={STATUS[status].label} className={cn('size-3.5 shrink-0', TEXT[status], className)} strokeWidth={2} />;
}

export function StatusChip({ status, label, className }: { status: HealthStatus; label?: string; className?: string }) {
  const Icon = STATUS[status].icon;
  return (
    <span className={cn('inline-flex h-5.5 items-center gap-1.5 rounded-full pr-2 pl-1.5 text-xs font-medium', CHIP[status], className)}>
      <Icon className="size-3.5" strokeWidth={2} aria-hidden />
      {label ?? STATUS[status].label}
    </span>
  );
}

export function Chip({ className, dashed, children }: { className?: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5.5 items-center gap-1 rounded-full border px-2 text-xs whitespace-nowrap text-muted',
        dashed ? 'border-dashed border-border-strong text-faint' : 'border-border bg-surface-raised',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn('rounded-[4px] border border-border-strong bg-surface px-1.5 font-mono text-[11px] text-faint', className)}>{children}</kbd>;
}
