'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as RSelect } from 'radix-ui';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Shown before the label, in the list and in the button. */
  icon?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

/**
 * Dropdown in the app's style (DRA-70), replacing the browser's native select. Radix Select underneath:
 * arrow keys, Enter, Esc and typing a letter work, and it is announced as a listbox.
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  disabled,
  title,
  className,
  size = 'md',
  ...aria
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: SelectOption<T>[];
  disabled?: boolean;
  title?: string;
  className?: string;
  size?: 'sm' | 'md';
  'aria-label': string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <RSelect.Root value={value} onValueChange={(v) => onValueChange(v as T)} disabled={disabled}>
      <RSelect.Trigger
        aria-label={aria['aria-label']}
        title={title}
        className={cn(
          'inline-flex max-w-full items-center gap-2 rounded-sm border border-border-strong bg-surface pr-1.5 pl-2.5 text-left text-[13px] text-text shadow-xs outline-none',
          'hover:bg-surface-raised focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 data-[state=open]:border-accent',
          size === 'md' ? 'h-8' : 'h-7',
          className,
        )}
      >
        {current?.icon}
        <span className="min-w-0 flex-1 truncate">
          <RSelect.Value>{current?.label}</RSelect.Value>
        </span>
        <RSelect.Icon>
          <ChevronDown className="size-3.5 text-faint" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={4} className="float-panel z-[400] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden p-1">
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex h-8 cursor-default items-center gap-2 rounded-sm pr-2 pl-7 text-[13px] outline-none select-none data-[disabled]:text-faint data-[highlighted]:bg-surface-raised"
              >
                <RSelect.ItemIndicator className="absolute left-2 grid place-items-center">
                  <Check className="size-3.5 text-accent" />
                </RSelect.ItemIndicator>
                {o.icon}
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                {o.hint && <span className="ml-auto pl-3 text-2xs text-faint">{o.hint}</span>}
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

/** On/off switch. It is a real checkbox underneath, so labels and forms work as usual. */
export const Switch = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function Switch({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="checkbox"
      role="switch"
      className={cn(
        'relative h-4.5 w-8 shrink-0 cursor-pointer appearance-none rounded-full bg-border-strong transition-colors outline-none',
        'before:absolute before:top-0.5 before:left-0.5 before:size-3.5 before:rounded-full before:bg-surface before:shadow-xs before:transition-transform',
        'checked:bg-accent checked:before:translate-x-3.5 focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
