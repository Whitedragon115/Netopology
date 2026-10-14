'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useCallback, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';
// MSW's worker only exists in the browser, so it must never be part of the server bundle
const MockStarter = dynamic(() => import('@/mocks/MockStarter'), { ssr: false });

/** Renders the app once the in-browser mock API is running (only when NEXT_PUBLIC_API_MOCKING=enabled). */
function MockGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKING);
  const onReady = useCallback(() => setReady(true), []);
  if (ready) return children;
  return <MockStarter onReady={onReady} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    // A 401 anywhere means the session ended (expired, signed out elsewhere, account disabled):
    // mark the user signed out, and RequireAuth sends them to the sign-in page.
    const onError = (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) qc.setQueryData(['me'], null);
    };
    const qc: QueryClient = new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: {
          staleTime: 15_000,
          retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
        },
      },
    });
    return qc;
  });
  return (
    <MockGate>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MockGate>
  );
}
