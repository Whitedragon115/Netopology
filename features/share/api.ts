'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api/client';
import type { ShareLinkCreate, ShareLinkUpdate } from '@/lib/api/types';

/** Share links (WP-12): owners and admins create read-only guest links for one canvas. */
const shareKey = (wsId: string, canvasId: string) => ['ws', wsId, 'share-links', canvasId] as const;

export function useShareLinks(wsId: string, canvasId: string, enabled = true) {
  return useQuery({
    queryKey: shareKey(wsId, canvasId),
    enabled,
    queryFn: async () => unwrap(await api.GET('/workspaces/{wsId}/canvases/{canvasId}/share-links', { params: { path: { wsId, canvasId } } })).items,
  });
}

export function useCreateShareLink(wsId: string, canvasId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ShareLinkCreate) => unwrap(await api.POST('/workspaces/{wsId}/canvases/{canvasId}/share-links', { params: { path: { wsId, canvasId } }, body })),
    onSettled: () => qc.invalidateQueries({ queryKey: shareKey(wsId, canvasId) }),
  });
}

export function useUpdateShareLink(wsId: string, canvasId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ShareLinkUpdate }) =>
      unwrap(await api.PATCH('/workspaces/{wsId}/share-links/{shareLinkId}', { params: { path: { wsId, shareLinkId: id } }, body })),
    onSettled: () => qc.invalidateQueries({ queryKey: shareKey(wsId, canvasId) }),
  });
}

export function useRevokeShareLink(wsId: string, canvasId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.DELETE('/workspaces/{wsId}/share-links/{shareLinkId}', { params: { path: { wsId, shareLinkId: id } } });
      if (!res.response.ok) unwrap(res);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: shareKey(wsId, canvasId) }),
  });
}

// ───────── guest side (no account; a cookie for this one link) ─────────

export async function shareInfo(token: string) {
  return unwrap(await api.GET('/share/{token}', { params: { path: { token } } }));
}

export async function unlockShare(token: string, password?: string) {
  const res = await api.POST('/share/{token}/unlock', { params: { path: { token } }, body: password ? { password } : {} });
  if (!res.response.ok) unwrap(res);
}

export function useSharedView(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ['share', token, 'view'],
    enabled,
    retry: false,
    queryFn: async () => unwrap(await api.GET('/share/{token}/view', { params: { path: { token } } })),
  });
}
