'use client';

import { useEffect } from 'react';
import { worker } from './browser';
import { bootMockSession } from './db';

// start once per page, even when React runs effects twice (Strict Mode)
let started: Promise<unknown> | null = null;

/** Browser-only (loaded with next/dynamic ssr:false): starts the mock API, then reports ready. */
export default function MockStarter({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    if (!started) bootMockSession();
    started ??= worker.start({ onUnhandledFrame: 'bypass', quiet: true });
    started.then(onReady);
  }, [onReady]);
  return null;
}
