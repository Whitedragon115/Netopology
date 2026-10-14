'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api/client';
import type { AccountCreate, AccountUpdate, InstanceSettings } from '@/lib/api/types';
import { authKeys } from '../auth/api';

/** Your own account (/me) and, for the server owner/admins, account administration (/users, /instance). */
export const accountKeys = {
  identities: ['me', 'identities'] as const,
  users: (q: string) => ['users', q] as const,
  settings: ['instance', 'settings'] as const,
};

// ───────── me ─────────
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { displayName?: string; email?: string | null }) => unwrap(await api.PATCH('/me', { body })),
    onSuccess: (me) => qc.setQueryData(authKeys.me, me),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      const res = await api.POST('/me/password', { body });
      if (!res.response.ok) unwrap(res);
    },
  });
}

export function useIdentities() {
  return useQuery({ queryKey: accountKeys.identities, queryFn: async () => unwrap(await api.GET('/me/identities')) });
}

export function useUnlinkIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (identityId: string) => {
      const res = await api.DELETE('/me/identities/{identityId}', { params: { path: { identityId } } });
      if (!res.response.ok) unwrap(res);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.identities });
      void qc.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

/** Linking is a browser redirect through the provider (contract: linkMyIdentity → 302). */
export const linkIdentityUrl = (provider: 'google' | 'discord') => `/api/v1/me/identities/${provider}/link`;

// ───────── server administration (server owner / admins) ─────────
export function useUsers(q: string) {
  return useQuery({
    queryKey: accountKeys.users(q),
    queryFn: async () => unwrap(await api.GET('/users', { params: { query: { limit: 200, ...(q ? { q } : {}) } } })),
  });
}

function useUsersMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['users'] }) });
}

export const useCreateUser = () => useUsersMutation(async (body: AccountCreate) => unwrap(await api.POST('/users', { body })));

export const useUpdateUser = () =>
  useUsersMutation(async ({ userId, body }: { userId: string; body: AccountUpdate }) =>
    unwrap(await api.PATCH('/users/{userId}', { params: { path: { userId } }, body })),
  );

export const useResetPassword = () =>
  useUsersMutation(async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
    const res = await api.POST('/users/{userId}/password', { params: { path: { userId } }, body: { newPassword } });
    if (!res.response.ok) unwrap(res);
  });

export function useInstanceSettings() {
  return useQuery({ queryKey: accountKeys.settings, queryFn: async () => unwrap(await api.GET('/instance/settings')) });
}

export function useUpdateInstanceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InstanceSettings) => unwrap(await api.PATCH('/instance/settings', { body })),
    onSuccess: (s) => qc.setQueryData(accountKeys.settings, s),
  });
}
