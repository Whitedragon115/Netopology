'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { RAIL_WIDTH, useUi } from '@/features/workspace/store';

const LIFETIME = 3800;

/** How a toast feels: success glows green, warning amber, danger red; neutral hints don't glow. */
export type ToastTone = 'success' | 'warning' | 'danger' | 'neutral';

const WARNING = /nothing to copy|not copied|already on this canvas|not drawn|use a |must |needs the real/i;
const SUCCESS = /\b(saved|created|added|placed|deleted|removed|copied|renamed|updated|revoked|unlinked|locked|unlocked|protected|undid|redid|hidden|set by hand)\b/i;
/** Callers can pass a tone; without one it is read from the wording. */
function toneOf(message: string): ToastTone {
  if (WARNING.test(message)) return 'warning';
  return SUCCESS.test(message) ? 'success' : 'neutral';
}
const TONE_VAR: Record<ToastTone, string | undefined> = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', neutral: undefined };

/** One toast: pauses its countdown while hovered; click to read the whole message. */
function ToastItem({ message, tone, style, onDone }: { message: string; tone: ToastTone; style?: CSSProperties; onDone: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (hovered) return;
    const timer = setTimeout(() => done.current(), LIFETIME);
    return () => clearTimeout(timer);
  }, [hovered]);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}
      style={{ ...style, ...(TONE_VAR[tone] ? ({ '--toast-tone': TONE_VAR[tone] } as CSSProperties) : null) }}
      className={`pointer-events-auto origin-top ${TONE_VAR[tone] ? 'toast-glow' : 'animate-[detail-in_200ms_var(--ease)]'} cursor-pointer rounded-sm bg-text px-3 py-2 text-xs text-surface shadow-xl transition-transform duration-200 [[data-theme=dark]_&]:border [[data-theme=dark]_&]:border-border-strong [[data-theme=dark]_&]:bg-surface-raised [[data-theme=dark]_&]:text-text`}
    >
      <span className={open ? 'block break-words whitespace-pre-wrap' : 'line-clamp-2 break-words'}>{message}</span>
    </div>
  );
}

/** Minimal toasts: short, polite, top-left, just to the right of the side panel. Several at once stack up; hover to spread them out. */
export function useToasts() {
  const panelWidth = useUi((s) => (s.leftCollapsed ? RAIL_WIDTH : s.leftWidth));
  const [items, setItems] = useState<{ id: number; message: string; tone: ToastTone }[]>([]);
  const [spread, setSpread] = useState(false);
  const push = useCallback((message: string, tone?: ToastTone) => {
    if (!useUi.getState().notifications) return; // switched off in Settings → Preferences
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, message, tone: tone ?? toneOf(message) }]);
  }, []);
  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const newestFirst = [...items].reverse();
  const view = (
    <div
      aria-live="polite"
      onPointerEnter={() => setSpread(true)}
      onPointerLeave={() => setSpread(false)}
      className={`pointer-events-none fixed top-3 z-[350] grid w-64 justify-items-stretch ${spread ? 'gap-1.5' : ''}`}
      style={{ left: panelWidth + 24, paddingBottom: spread ? 0 : (items.length - 1) * 8 }}
    >
      {newestFirst.map((t, i) => (
        <ToastItem
          key={t.id}
          message={t.message}
          tone={t.tone}
          onDone={() => remove(t.id)}
          style={spread ? undefined : { gridArea: '1 / 1', transform: `translateY(${i * 8}px) scale(${1 - i * 0.04})`, zIndex: 10 - i, opacity: 1 - i * 0.2 }}
        />
      ))}
    </div>
  );
  return { push, view };
}
