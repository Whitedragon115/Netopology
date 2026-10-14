'use client';

import type { ReactNode } from 'react';

/** The brand mark: a tiny topology (three nodes, two links) in the accent color. */
export function Logo({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden>
      <rect width="36" height="36" rx="9" className="fill-accent" />
      <path d="M11 24 L18 12 L25 24" fill="none" strokeWidth="2.2" strokeLinecap="round" className="stroke-on-accent opacity-70" />
      <circle cx="18" cy="12" r="3.6" className="fill-on-accent" />
      <circle cx="11" cy="24" r="3.6" className="fill-on-accent" />
      <circle cx="25" cy="24" r="3.6" className="fill-on-accent" />
    </svg>
  );
}

/** Full-screen page for signed-out screens: dotted canvas background, one centered card. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="auth-backdrop grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight text-text">Netopology</span>
        </div>
        <section className="float-panel p-7 max-[480px]:p-5">
          <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </section>
        {footer && <div className="mt-5 text-center text-xs text-faint">{footer}</div>}
      </div>
    </main>
  );
}

/** Inline error box for form-level errors (field errors go under the field). */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-sm border border-down/30 bg-down-subtle px-3 py-2 text-[13px] text-down">
      {children}
    </div>
  );
}
