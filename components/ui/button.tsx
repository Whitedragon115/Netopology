'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Tooltip } from 'radix-ui';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Button classes, for links that must look like buttons (`<a className={buttonVariants()}>`). */
export const buttonVariants = (v?: VariantProps<typeof button>) => button(v);

const button = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-sm text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'border border-border-strong bg-surface text-text shadow-xs hover:bg-surface-raised',
        primary: 'border border-accent bg-accent text-on-accent shadow-xs hover:border-accent-hover hover:bg-accent-hover',
        ghost: 'text-muted hover:bg-surface-raised hover:text-text',
        danger: 'border border-border-strong bg-surface text-down shadow-xs hover:border-down hover:bg-down-subtle',
      },
      size: { sm: 'h-7 px-2.5 text-xs', md: 'h-8 px-3', lg: 'h-9.5 w-full px-3' },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...props} />;
});

/** Square icon button with a tooltip (the label is also the accessible name). */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; pressed?: boolean; size?: 'sm' | 'md'; tooltipSide?: 'top' | 'bottom' | 'left' | 'right'; noTip?: boolean; /** ms before the tooltip shows */ tipDelay?: number; children: ReactNode }
>(function IconButton({ label, pressed, size = 'md', tooltipSide = 'bottom', noTip, tipDelay, className, type = 'button', ...props }, ref) {
  const button = (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          'relative inline-grid place-items-center rounded-sm text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent',
          'aria-pressed:bg-accent-subtle aria-pressed:text-accent',
          size === 'md' ? 'size-8' : 'size-6.5',
          className,
        )}
        {...props}
      />
  );
  return noTip ? button : <Tip label={label} side={tooltipSide} delay={tipDelay}>{button}</Tip>;
});

export function Tip({ label, side = 'bottom', delay = 350, children }: { label: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; delay?: number; children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={delay}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={side} sideOffset={6} className="z-[500] rounded-sm bg-text px-2 py-1 text-xs text-surface shadow-lg">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
