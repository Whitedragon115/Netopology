'use client';

import { useCallback, useState } from 'react';

/** Minimal toasts: short, polite, bottom-centre above the toolbar. */
export function useToasts() {
  const [items, setItems] = useState<{ id: number; message: string }[]>([]);
  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3800);
  }, []);
  const view = (
    <div aria-live="polite" className="pointer-events-none fixed bottom-18 left-1/2 z-[350] grid -translate-x-1/2 justify-items-center gap-1.5">
      {items.map((t) => (
        <div key={t.id} className="max-w-130 animate-[detail-in_200ms_var(--ease)] rounded-sm bg-text px-3.5 py-2.5 text-[13px] text-surface shadow-xl">
          {t.message}
        </div>
      ))}
    </div>
  );
  return { push, view };
}
