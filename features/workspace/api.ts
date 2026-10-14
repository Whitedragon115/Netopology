'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, unwrap } from '@/lib/api/client';
import type {
  AreaUpdate,
  Canvas,
  CanvasOperation,
  CanvasSettings,
  CanvasUpdate,
  CanvasView,
  HealthStatus,
  MemberAdd,
  MemberUpdate,
  NodeCreate,
  NodeUpdate,
  NoteCreate,
  NoteUpdate,
  Workspace,
  WorkspaceCreate,
  WorkspaceUpdate,
} from '@/lib/api/types';
import { useSync, withPending } from '../canvas/sync';

/** Query keys in one place so invalidation stays consistent. */
export const keys = {
  workspaces: ['workspaces'] as const,
  canvases: (ws: string) => ['ws', ws, 'canvases'] as const,
  view: (ws: string, canvasId: string) => ['ws', ws, 'view', canvasId] as const,
  areaCanvas: (ws: string, areaId: string) => ['ws', ws, 'area-canvas', areaId] as const,
  nodes: (ws: string) => ['ws', ws, 'nodes'] as const,
  nodeNotes: (ws: string, nodeId: string) => ['ws', ws, 'notes', nodeId] as const,
  nodeUsage: (ws: string, nodeId: string) => ['ws', ws, 'usage', nodeId] as const,
  members: (ws: string) => ['ws', ws, 'members'] as const,
  ws: (ws: string) => ['ws', ws] as const,
};

export function useWorkspaces() {
  return useQuery({ queryKey: keys.workspaces, queryFn: async () => unwrap(await api.GET('/workspaces')).items });
}
export function useWorkspaceBySlug(slug: string) {
  const q = useWorkspaces();
  return { ...q, data: q.data?.find((w) => w.slug === slug) };
}
// the signed-in account: useSession() in features/auth/api.ts

export function useCanvases(wsId: string | undefined) {
  return useQuery({
    queryKey: keys.canvases(wsId ?? ''),
    enabled: !!wsId,
    queryFn: async () => unwrap(await api.GET('/workspaces/{wsId}/canvases', { params: { path: { wsId: wsId! } } })).items,
  });
}

export function useCreateCanvas(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      unwrap(await api.POST('/workspaces/{wsId}/canvases', { params: { path: { wsId } }, body: { name } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.canvases(wsId) }),
  });
}

/** Fetch one canvas view (also used to warm the cache when hovering a canvas in the side panel). */
export const viewQuery = (wsId: string, canvasId: string) => ({
  queryKey: keys.view(wsId, canvasId),
  queryFn: async () => unwrap(await api.GET('/workspaces/{wsId}/canvases/{canvasId}/view', { params: { path: { wsId, canvasId } } })),
});

/**
 * The canvas as you see it: the server's copy plus edits still saving (features/canvas/sync.ts).
 * While the next canvas loads, the previous one keeps showing (no blank flash when switching).
 */
export function useCanvasView(wsId: string | undefined, canvasId: string | undefined) {
  const pending = useSync((s) => s.pending);
  const select = useCallback((v: CanvasView) => (pending.length ? withPending(v, pending) : v), [pending]);
  return useQuery({
    ...viewQuery(wsId ?? '', canvasId ?? ''),
    enabled: !!wsId && !!canvasId,
    select,
    // keep showing the previous canvas of the same workspace until this one has loaded
    placeholderData: (prev: CanvasView | undefined, prevQuery: { queryKey: readonly unknown[] } | undefined) => (prevQuery?.queryKey[1] === wsId ? prev : undefined),
  });
}

/** Resolve an area's inner canvas (created on first open). */
export async function fetchAreaCanvas(wsId: string, areaId: string) {
  return unwrap(await api.GET('/workspaces/{wsId}/areas/{areaId}/canvas', { params: { path: { wsId, areaId } } }));
}

export function useNodes(wsId: string | undefined) {
  return useQuery({
    queryKey: keys.nodes(wsId ?? ''),
    enabled: !!wsId,
    queryFn: async () => unwrap(await api.GET('/workspaces/{wsId}/nodes', { params: { path: { wsId: wsId! }, query: { limit: 200 } } })).items,
  });
}

export function useAreas(wsId: string | undefined) {
  return useQuery({
    queryKey: ['ws', wsId ?? '', 'areas'],
    enabled: !!wsId,
    queryFn: async () => unwrap(await api.GET('/workspaces/{wsId}/areas', { params: { path: { wsId: wsId! }, query: { limit: 200 } } })).items,
  });
}

export function useNodeNotes(wsId: string, nodeId: string | undefined) {
  return useQuery({
    queryKey: keys.nodeNotes(wsId, nodeId ?? ''),
    enabled: !!nodeId,
    queryFn: async () => unwrap(await api.GET('/workspaces/{wsId}/notes', { params: { path: { wsId }, query: { nodeId: nodeId! } } })).items,
  });
}

export function useNodeUsage(wsId: string, nodeId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.nodeUsage(wsId, nodeId ?? ''),
    enabled: !!nodeId && enabled,
    queryFn: async () => unwrap(await api.GET('/workspaces/{wsId}/nodes/{nodeId}/usage', { params: { path: { wsId, nodeId: nodeId! } } })),
  });
}

export function useMembers(wsId: string | undefined) {
  return useQuery({
    queryKey: keys.members(wsId ?? ''),
    enabled: !!wsId,
    queryFn: async () => unwrap(await api.GET('/workspaces/{wsId}/members', { params: { path: { wsId: wsId! } } })).items,
  });
}

// ───────── mutations: anything that changes the inventory refreshes every view of the workspace ─────────
function useInvalidateWorkspace(wsId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.ws(wsId) });
}

export function useApplyOperations(wsId: string, canvasId: string) {
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async (operations: CanvasOperation[]) =>
      unwrap(await api.POST('/workspaces/{wsId}/canvases/{canvasId}/operations', { params: { path: { wsId, canvasId } }, body: { operations } })),
    onSettled: invalidate,
  });
}

export function useUpdateCanvasSettings(wsId: string, canvasId: string) {
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async (settings: CanvasSettings) =>
      unwrap(await api.PATCH('/workspaces/{wsId}/canvases/{canvasId}', { params: { path: { wsId, canvasId } }, body: { settings } })),
    onSettled: invalidate,
  });
}

export function useUpdateNode(wsId: string) {
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async ({ nodeId, body }: { nodeId: string; body: NodeUpdate }) =>
      unwrap(await api.PATCH('/workspaces/{wsId}/nodes/{nodeId}', { params: { path: { wsId, nodeId } }, body })),
    onSettled: invalidate,
  });
}

export function useSetHealth(wsId: string) {
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async ({ nodeId, status }: { nodeId: string; status: HealthStatus }) =>
      unwrap(await api.PUT('/workspaces/{wsId}/nodes/{nodeId}/health', { params: { path: { wsId, nodeId } }, body: { status } })),
    onSettled: invalidate,
  });
}

export function useCreateNode(wsId: string) {
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async (body: NodeCreate) => unwrap(await api.POST('/workspaces/{wsId}/nodes', { params: { path: { wsId } }, body })),
    onSettled: invalidate,
  });
}

export function useDeleteNode(wsId: string) {
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async (nodeId: string) => {
      const res = await api.DELETE('/workspaces/{wsId}/nodes/{nodeId}', { params: { path: { wsId, nodeId } } });
      if (!res.response.ok) unwrap(res);
    },
    onSettled: invalidate,
  });
}

export function useDeleteArea(wsId: string) {
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async (areaId: string) => {
      const res = await api.DELETE('/workspaces/{wsId}/areas/{areaId}', { params: { path: { wsId, areaId } } });
      if (!res.response.ok) unwrap(res);
    },
    onSettled: invalidate,
  });
}

export function useUpdateArea(wsId: string) {
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async ({ areaId, body }: { areaId: string; body: AreaUpdate }) =>
      unwrap(await api.PATCH('/workspaces/{wsId}/areas/{areaId}', { params: { path: { wsId, areaId } }, body })),
    onSettled: invalidate,
  });
}

// ───────── workspaces ─────────
/** ETag for If-Match: the resource's version, quoted (contract: components.headers.ETag). */
export const etag = (version: number) => `"${version}"`;

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: WorkspaceCreate) => unwrap(await api.POST('/workspaces', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ws, body }: { ws: Workspace; body: WorkspaceUpdate }) =>
      unwrap(await api.PATCH('/workspaces/{wsId}', { params: { path: { wsId: ws.id }, header: { 'If-Match': etag(ws.version) } }, body })),
    // use the server's copy right away, so a second change sends the new version (no false 412)
    onSuccess: (ws) => qc.setQueryData<Workspace[]>(keys.workspaces, (all) => all?.map((w) => (w.id === ws.id ? ws : w))),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ws: Workspace) => {
      const res = await api.DELETE('/workspaces/{wsId}', { params: { path: { wsId: ws.id }, header: { 'If-Match': etag(ws.version) } } });
      if (!res.response.ok) unwrap(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

// ───────── members ─────────
function useMemberMutation<V>(wsId: string, fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.ws(wsId) });
      void qc.invalidateQueries({ queryKey: keys.workspaces }); // your own role may have changed
    },
  });
}

export const useAddMember = (wsId: string) =>
  useMemberMutation(wsId, async (body: MemberAdd) => unwrap(await api.POST('/workspaces/{wsId}/members', { params: { path: { wsId } }, body })));

export const useUpdateMember = (wsId: string) =>
  useMemberMutation(wsId, async ({ userId, body }: { userId: string; body: MemberUpdate }) =>
    unwrap(await api.PATCH('/workspaces/{wsId}/members/{userId}', { params: { path: { wsId, userId } }, body })),
  );

export const useSetCanvasGrants = (wsId: string) =>
  useMemberMutation(wsId, async ({ userId, canvasIds }: { userId: string; canvasIds: string[] }) =>
    unwrap(await api.PUT('/workspaces/{wsId}/members/{userId}/canvas-grants', { params: { path: { wsId, userId } }, body: { canvasIds } })),
  );

export const useRemoveMember = (wsId: string) =>
  useMemberMutation(wsId, async (userId: string) => {
    const res = await api.DELETE('/workspaces/{wsId}/members/{userId}', { params: { path: { wsId, userId } } });
    if (!res.response.ok) unwrap(res);
  });

/** Find an account by exact username (owner/admin of some workspace only). */
export async function lookupUser(username: string) {
  return unwrap(await api.GET('/users/lookup', { params: { query: { username } } }));
}

// ───────── canvases ─────────
export function useUpdateCanvas(wsId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async ({ canvas, body }: { canvas: Canvas; body: CanvasUpdate }) =>
      unwrap(await api.PATCH('/workspaces/{wsId}/canvases/{canvasId}', { params: { path: { wsId, canvasId: canvas.id }, header: { 'If-Match': etag(canvas.version) } }, body })),
    onSuccess: (c) => qc.setQueryData<Canvas[]>(keys.canvases(wsId), (all) => all?.map((x) => (x.id === c.id ? c : x))),
    onSettled: invalidate,
  });
}

export function useDeleteCanvas(wsId: string) {
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async (canvas: Canvas) => {
      const res = await api.DELETE('/workspaces/{wsId}/canvases/{canvasId}', { params: { path: { wsId, canvasId: canvas.id }, header: { 'If-Match': etag(canvas.version) } } });
      if (!res.response.ok) unwrap(res);
    },
    onSettled: invalidate,
  });
}

export function useCanvasLock(wsId: string, canvasId: string) {
  const invalidate = useInvalidateWorkspace(wsId);
  return useMutation({
    mutationFn: async (lock: boolean) =>
      lock
        ? unwrap(await api.POST('/workspaces/{wsId}/canvases/{canvasId}/lock', { params: { path: { wsId, canvasId } } }))
        : unwrap(await api.DELETE('/workspaces/{wsId}/canvases/{canvasId}/lock', { params: { path: { wsId, canvasId } } })),
    onSettled: invalidate,
  });
}

// ───────── notes about a node (its Notes tab) ─────────
function useNodeNoteMutation<V>(wsId: string, nodeId: string, fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.nodeNotes(wsId, nodeId) });
      void qc.invalidateQueries({ queryKey: keys.nodeUsage(wsId, nodeId) });
    },
  });
}

export const useCreateNodeNote = (wsId: string, nodeId: string) =>
  useNodeNoteMutation(wsId, nodeId, async (body: Omit<NoteCreate, 'target'>) =>
    unwrap(await api.POST('/workspaces/{wsId}/notes', { params: { path: { wsId } }, body: { ...body, target: { type: 'node', id: nodeId } } })),
  );

export const useUpdateNodeNote = (wsId: string, nodeId: string) =>
  useNodeNoteMutation(wsId, nodeId, async ({ noteId, body }: { noteId: string; body: NoteUpdate }) =>
    unwrap(await api.PATCH('/workspaces/{wsId}/notes/{noteId}', { params: { path: { wsId, noteId } }, body })),
  );

export const useDeleteNodeNote = (wsId: string, nodeId: string) =>
  useNodeNoteMutation(wsId, nodeId, async (noteId: string) => {
    const res = await api.DELETE('/workspaces/{wsId}/notes/{noteId}', { params: { path: { wsId, noteId } } });
    if (!res.response.ok) unwrap(res);
  });
