'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Text input styled with the tokens. Pass `invalid` to show the error state. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full rounded-sm border border-border-strong bg-surface px-3 text-[13px] text-text shadow-xs transition-colors outline-none',
        'placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-ring',
        'aria-invalid:border-down aria-invalid:focus:ring-down-subtle disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});

/** Label + control + hint/error, wired up for screen readers. */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error || hint ? `${id}-desc` : undefined;
  return (
    <div className="grid gap-1.5">
      {label && (
        <label htmlFor={id} className="flex items-baseline justify-between text-xs font-medium text-text">
          {label}
          {optional && <span className="font-normal text-faint">optional</span>}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, invalid: !!error })}
      {(error || hint) && (
        <p id={describedBy} className={cn('text-xs', error ? 'text-down' : 'text-faint')}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
