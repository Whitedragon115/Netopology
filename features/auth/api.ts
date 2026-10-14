'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, unwrap } from '@/lib/api/client';
import type { LoginRequest, SetupRequest } from '@/lib/api/types';

export const authKeys = {
  setup: ['setup'] as const,
  providers: ['auth', 'providers'] as const,
  me: ['me'] as const,
};

export function useSetupStatus() {
  return useQuery({ queryKey: authKeys.setup, queryFn: async () => unwrap(await api.GET('/setup')), staleTime: 60_000 });
}

export function useAuthProviders() {
  return useQuery({ queryKey: authKeys.providers, queryFn: async () => unwrap(await api.GET('/auth/providers')), staleTime: 300_000 });
}

/**
 * The signed-in account, or null when signed out. A 401 is an answer here, not an error,
 * so pages can decide to show the sign-in screen.
 */
export function useSession() {
  return useQuery({
    queryKey: authKeys.me,
    retry: false,
    queryFn: async () => {
      try {
        return unwrap(await api.GET('/me'));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
}

/** Starting a fresh session: forget everything cached for the previous one. */
function useResetForSession() {
  const qc = useQueryClient();
  return (me: unknown) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    qc.setQueryData(authKeys.me, me);
    qc.setQueryData(authKeys.setup, { needsSetup: false });
  };
}

export function useLogin() {
  const reset = useResetForSession();
  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      const res = await api.POST('/auth/login', { body });
      const retryAfter = Number(res.response.headers.get('Retry-After')) || undefined;
      try {
        return unwrap(res);
      } catch (e) {
        if (e instanceof ApiError) Object.assign(e, { retryAfter });
        throw e;
      }
    },
    onSuccess: reset,
  });
}

export function useCompleteSetup() {
  const reset = useResetForSession();
  return useMutation({
    mutationFn: async (body: SetupRequest) => unwrap(await api.POST('/setup', { body })),
    onSuccess: reset,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.POST('/auth/logout');
      // already signed out is fine
      if (!res.response.ok && res.response.status !== 401) unwrap(res);
    },
    onSettled: () => {
      qc.clear();
      qc.setQueryData(authKeys.me, null);
    },
  });
}

/** Human text for the sign-in errors the API (and the OAuth callback's ?error=) can return. */
export function signInErrorText(code: string | undefined | null, retryAfter?: number): string {
  switch (code?.replace(/^auth\./, '')) {
    case 'invalid_credentials':
      return 'Wrong username or password.';
    case 'rate_limited':
      return `Too many attempts. Try again in ${retryAfter ?? 60} seconds.`;
    case 'identity_not_linked':
      return 'That account is not linked to a Netopology user. Sign in with your password and link it from your profile, or ask a server admin.';
    case 'identity_in_use':
      return 'That account is already linked to another Netopology user.';
    case 'access_denied':
      return 'Sign-in was cancelled.';
    case undefined:
    case '':
      return '';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

/** Only same-origin paths are allowed as a post-sign-in destination. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') && !next.startsWith('/setup') ? next : '/';
}
