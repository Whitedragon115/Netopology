'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, unwrap } from '@/lib/api/client';
import { bindId, failId, isPending, rebinding, tempId, toClientIds } from '@/lib/api/ids';
import type {
  Area,
  AreaCreate,
  AreaUpdate,
  CanvasOperation,
  CanvasView,
  HealthStatus,
  InvNode,
  Link,
  LinkCreate,
  LinkKind,
  LinkUpdate,
  NodeCreate,
  NodeUpdate,
  Note,
  NoteCreate,
  NoteUpdate,
  Placement,
  Shape,
} from '@/lib/api/types';
import { keys } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { useHistory, type HistoryEntry } from './history';
import { addItem, applyOpsLocal, localArea, localLink, localNode, localNote, localPlacement, patchItem, removeItem, type LocalOp } from './local';
import { enqueue, useSync, withPending } from './sync';

type ShapeCreateOp = Extract<CanvasOperation, { op: 'shape.create' }>;
type PlaceOp = Extract<CanvasOperation, { op: 'place' }>;
type ItemType = 'node' | 'area' | 'note' | 'link';

/** An "update" operation that puts a placement back exactly as it is now. */
export function restorePlacement(p: Placement): CanvasOperation {
  return {
    op: 'update',
    placementId: p.id,
    parentPlacementId: p.parentPlacementId,
    x: p.x,
    y: p.y,
    width: p.width ?? null,
    height: p.height ?? null,
    collapsed: p.collapsed ?? false,
    style: p.style,
  };
}

/** The `place` operation that draws a removed placement again (same client id, new server id). */
export function replacePlacement(p: Placement): LocalOp {
  return {
    op: 'place',
    localId: p.id,
    item: p.item,
    x: p.x,
    y: p.y,
    ...(p.parentPlacementId ? { parentPlacementId: p.parentPlacementId } : {}),
    ...(p.width ? { width: p.width } : {}),
    ...(p.height ? { height: p.height } : {}),
    collapsed: p.collapsed ?? false,
    style: p.style,
  };
}

const strip = ({ localId: _l, ...op }: LocalOp) => op as CanvasOperation;

/** Ids being (re)created by a save: mark them so requests mentioning them wait; fail them if the save fails. */
async function creating<T>(ids: (string | undefined)[], fn: () => Promise<T>): Promise<T> {
  for (const id of ids) if (id && !isPending(id)) rebinding(id);
  try {
    return await fn();
  } catch (e) {
    for (const id of ids) if (id) failId(id, e);
    throw e;
  }
}

/**
 * Every canvas edit goes through here: it shows at once, saves in the background
 * (features/canvas/sync.ts) and is recorded for undo/redo. Nothing here waits for the server, and
 * methods that create something return its id straight away. Save errors are toasted by the queue.
 */
export function useEditor() {
  const { workspace, canvasId } = useWorkspace();
  const qc = useQueryClient();
  const wsId = workspace.id;

  return useMemo(() => {
    const viewKey = (cid: string) => keys.view(wsId, cid);
    /** The canvas as you see it now (server copy + edits not saved yet). Fresh even when called later from undo. */
    const current = (cid = canvasId): CanvasView | undefined => {
      const v = qc.getQueryData<CanvasView>(viewKey(cid));
      return v && withPending(v, useSync.getState().pending);
    };
    const store = (cid: string, v: CanvasView) => {
      void qc.cancelQueries({ queryKey: viewKey(cid) }); // a refetch started earlier must not overwrite this newer copy
      qc.setQueryData(viewKey(cid), toClientIds(v));
    };
    const fetchView = async (cid: string) => unwrap(await api.GET('/workspaces/{wsId}/canvases/{canvasId}/view', { params: { path: { wsId, canvasId: cid } } }));
    /** Learn the server ids of placements created with an item (`placeOn`), then store the fresh view. */
    const syncView = async (cid: string, placed: { item: Placement['item']; placementId?: string }[]) => {
      const v = await fetchView(cid);
      for (const { item, placementId } of placed) {
        if (!placementId) continue;
        const p = v.placements.find((x) => x.item.type === item.type && x.item.id === item.id);
        if (p) bindId(placementId, p.id);
        else failId(placementId, new Error('The server did not place it'));
      }
      store(cid, v);
    };

    const push = (e: HistoryEntry) => useHistory.getState().push(e);
    const forget = (e: HistoryEntry) => useHistory.getState().forget(e);

    /** Save canvas operations; the server's result binds the ids of anything created. */
    const runOps = (cid: string, ops: LocalOp[]) => (confirm: () => void) =>
      creating(ops.map((o) => o.localId), async () => {
        const res = unwrap(
          await api.POST('/workspaces/{wsId}/canvases/{canvasId}/operations', { params: { path: { wsId, canvasId: cid } }, body: { operations: ops.map(strip) } }),
        );
        ops.forEach((o, i) => {
          if (!o.localId) return;
          const id = res.results.find((r) => r.index === i)?.id ?? res.results[i]?.id;
          if (id) bindId(o.localId, id);
          else failId(o.localId, new Error('The server did not create it'));
        });
        store(cid, res.view ?? (await fetchView(cid)));
        confirm();
      });

    const sendOps = (label: string, ops: LocalOp[], cid = canvasId, entry?: HistoryEntry) =>
      enqueue({ label, canvasId: cid, apply: (v) => applyOpsLocal(v, ops), run: runOps(cid, ops), onFail: () => entry && forget(entry) });

    /** One recorded edit: do it now; undo/redo send `inverse` / `ops` again. */
    const recorded = (label: string, ops: LocalOp[], inverse: LocalOp[]) => {
      const cid = canvasId;
      const entry: HistoryEntry = { label, undo: () => sendOps(label, inverse, cid, entry), redo: () => sendOps(label, ops, cid, entry) };
      sendOps(label, ops, cid, entry);
      push(entry);
    };

    // ───────── inventory items (REST) ─────────
    const saveDelete = (type: ItemType, id: string, label: string, cid: string, entry?: HistoryEntry) =>
      enqueue({
        label,
        canvasId: cid,
        apply: (v) => removeItem(v, type, id),
        run: async (confirm) => {
          const res =
            type === 'node'
              ? await api.DELETE('/workspaces/{wsId}/nodes/{nodeId}', { params: { path: { wsId, nodeId: id } } })
              : type === 'area'
                ? await api.DELETE('/workspaces/{wsId}/areas/{areaId}', { params: { path: { wsId, areaId: id } } })
                : type === 'note'
                  ? await api.DELETE('/workspaces/{wsId}/notes/{noteId}', { params: { path: { wsId, noteId: id } } })
                  : await api.DELETE('/workspaces/{wsId}/links/{linkId}', { params: { path: { wsId, linkId: id } } });
          if (!res.response.ok) unwrap(res);
          const cur = qc.getQueryData<CanvasView>(viewKey(cid));
          if (cur) store(cid, removeItem(cur, type, id));
          confirm();
        },
        onFail: () => entry && forget(entry),
      });

    const saveCreate = <B>(
      type: Exclude<ItemType, 'link'> | 'link',
      label: string,
      cid: string,
      ids: { item: string; placement?: string },
      body: B,
      local: (v: CanvasView) => CanvasView,
      post: (b: B) => Promise<{ id: string }>,
      after?: () => Promise<void>,
      entry?: HistoryEntry,
    ) =>
      enqueue({
        label,
        canvasId: cid,
        apply: local,
        run: (confirm) =>
          creating([ids.item, ids.placement], async () => {
            const created = await post(body);
            bindId(ids.item, created.id);
            if (after) await after();
            await syncView(cid, type === 'link' ? [] : [{ item: { type, id: ids.item }, placementId: ids.placement }]);
            confirm();
          }),
        onFail: () => entry && forget(entry),
      });

    const post = {
      node: async (b: NodeCreate) => unwrap(await api.POST('/workspaces/{wsId}/nodes', { params: { path: { wsId } }, body: b })),
      area: async (b: AreaCreate) => unwrap(await api.POST('/workspaces/{wsId}/areas', { params: { path: { wsId } }, body: b })),
      note: async (b: NoteCreate) => unwrap(await api.POST('/workspaces/{wsId}/notes', { params: { path: { wsId } }, body: b })),
      link: async (b: LinkCreate) => unwrap(await api.POST('/workspaces/{wsId}/links', { params: { path: { wsId } }, body: b })),
    };

    const placementOf = (v: CanvasView | undefined, type: Placement['item']['type'], id: string) => v?.placements.find((p) => p.item.type === type && p.item.id === id);
    const placeOnFrom = (p: Placement | undefined, cid: string) =>
      p ? { canvasId: cid, x: p.x, y: p.y, ...(p.parentPlacementId ? { parentPlacementId: p.parentPlacementId } : {}), ...(p.width ? { width: p.width } : {}), ...(p.height ? { height: p.height } : {}) } : undefined;
    const fields = (n: InvNode) => n.properties.filter((f) => !f.redacted).map(({ redacted: _r, ...f }) => f);

    // node: create → undo deletes → redo creates it again from how it looked when undone
    const nodeBody = (n: InvNode, p: Placement | undefined, cid: string): NodeCreate => ({
      name: n.name,
      category: n.category,
      type: n.type,
      description: n.description,
      properties: fields(n),
      ...(n.areaId ? { areaId: n.areaId } : {}),
      ...(placeOnFrom(p, cid) ? { placeOn: placeOnFrom(p, cid) } : {}),
    });
    const createNodeAs = (label: string, cid: string, nodeId: string, placementId: string | undefined, body: NodeCreate, entry?: HistoryEntry) =>
      saveCreate('node', label, cid, { item: nodeId, placement: placementId }, body,
        (v) => addItem(v, { node: localNode(nodeId, body), ...(placementId && body.placeOn ? { placement: localPlacement(placementId, { type: 'node', id: nodeId }, body.placeOn) } : {}) }),
        post.node, undefined, entry);

    const noteBody = (n: Note, p: Placement | undefined, cid: string): NoteCreate => ({
      target: n.target,
      kind: n.kind,
      title: n.title,
      body: n.body,
      isSensitive: n.isSensitive,
      color: n.color,
      ...(placeOnFrom(p, cid) ? { placeOn: placeOnFrom(p, cid) } : {}),
    });
    const createNoteAs = (label: string, cid: string, noteId: string, placementId: string | undefined, body: NoteCreate, entry?: HistoryEntry) =>
      saveCreate('note', label, cid, { item: noteId, placement: placementId }, body,
        (v) => addItem(v, { note: localNote(noteId, body), ...(placementId && body.placeOn ? { placement: localPlacement(placementId, { type: 'note', id: noteId }, body.placeOn) } : {}) }),
        post.note, undefined, entry);

    const linkBody = (l: Link): LinkCreate => ({
      sourceNodeId: l.sourceNodeId,
      targetNodeId: l.targetNodeId,
      kind: l.kind,
      directed: l.directed,
      label: l.label,
      ...(l.sourcePort ? { sourcePort: l.sourcePort } : {}),
      ...(l.targetPort ? { targetPort: l.targetPort } : {}),
      properties: l.properties.filter((f) => !f.redacted),
    });
    const createLinkAs = (label: string, cid: string, linkId: string, body: LinkCreate, entry?: HistoryEntry) =>
      saveCreate('link', label, cid, { item: linkId }, body, (v) => addItem(v, { link: localLink(linkId, body) }), post.link, undefined, entry);

    const update = <B extends object>(type: ItemType, id: string, label: string, next: B, prev: B, run: (b: B) => Promise<unknown>, localPatch?: (b: B) => Record<string, unknown>) => {
      const cid = canvasId;
      const send = (b: B, entry?: HistoryEntry) =>
        enqueue({
          label,
          canvasId: cid,
          apply: (v) => patchItem(v, type, id, localPatch ? localPatch(b) : (b as Record<string, unknown>)),
          run: async (confirm) => {
            await run(b);
            const cur = qc.getQueryData<CanvasView>(viewKey(cid));
            if (cur) store(cid, patchItem(cur, type, id, localPatch ? localPatch(b) : (b as Record<string, unknown>)));
            confirm();
          },
          onFail: () => entry && forget(entry),
        });
      const entry: HistoryEntry = { label, undo: () => send(prev, entry), redo: () => send(next, entry) };
      send(next, entry);
      push(entry);
    };

    return {
      canvasId,
      /** The canvas as shown now, including edits that are still saving. */
      current,

      /** Apply canvas operations now; undo applies `inverse`. */
      ops(label: string, ops: LocalOp[], inverse: LocalOp[]) {
        recorded(label, ops, inverse);
      },

      /** Remove a node / area box / note from this canvas only (the inventory item stays). */
      removePlacement(p: Placement, label: string) {
        recorded(label, [{ op: 'remove', placementId: p.id }], [replacePlacement(p)]);
      },

      /** Show an existing inventory item on this canvas; returns the new placement's id. Pass the item if this canvas doesn't know it yet. */
      placeItem(label: string, place: PlaceOp, item?: { node?: InvNode; area?: Area; note?: Note }) {
        const id = tempId();
        const op: LocalOp = { ...place, localId: id };
        const cid = canvasId;
        const doPlace = (entry?: HistoryEntry) =>
          enqueue({ label, canvasId: cid, apply: (v) => applyOpsLocal(item ? addItem(v, item) : v, [op]), run: runOps(cid, [op]), onFail: () => entry && forget(entry) });
        const entry: HistoryEntry = { label, undo: () => sendOps(label, [{ op: 'remove', placementId: id }], cid, entry), redo: () => doPlace(entry) };
        doPlace(entry);
        push(entry);
        return id;
      },

      /** Returns the new shape's id. */
      createShape(op: ShapeCreateOp) {
        const id = tempId();
        recorded(`Add ${op.kind}`, [{ ...op, localId: id }], [{ op: 'shape.delete', shapeId: id }]);
        return id;
      },

      deleteShape(s: Shape) {
        const again: LocalOp = {
          op: 'shape.create',
          localId: s.id,
          kind: s.kind,
          x: s.x,
          y: s.y,
          ...(s.width ? { width: s.width } : {}),
          ...(s.height ? { height: s.height } : {}),
          rotation: s.rotation,
          zIndex: s.zIndex,
          style: s.style,
          data: s.data,
        };
        recorded(`Delete ${s.kind}`, [{ op: 'shape.delete', shapeId: s.id }], [again]);
      },

      /** Create an inventory node drawn on this canvas. Returns its id (and its placement's) at once. */
      createNode(body: NodeCreate, label = 'Add node') {
        const cid = canvasId;
        const nodeId = tempId();
        const placementId = body.placeOn ? tempId() : undefined;
        const entry: HistoryEntry = {
          label,
          undo: () => {
            const v = current(cid);
            const n = v?.nodes.find((x) => x.id === nodeId);
            const p = placementOf(v, 'node', nodeId);
            if (n) snapshot = nodeBody(n, p, cid);
            saveDelete('node', nodeId, label, cid, entry);
          },
          redo: () => createNodeAs(label, cid, nodeId, placementId, snapshot, entry),
        };
        let snapshot = body;
        createNodeAs(label, cid, nodeId, placementId, body, entry);
        push(entry);
        return { nodeId, placementId };
      },

      /**
       * Create an area drawn on this canvas. `adopt`: nodes at the same level that move into the new box
       * (x/y relative to it); `before` is where they were, for undo.
       */
      createArea(body: AreaCreate, adopt: { placementId: string; x: number; y: number }[] = [], before: Placement[] = []) {
        const cid = canvasId;
        const areaId = tempId();
        const placementId = body.placeOn ? tempId() : undefined;
        const moves: LocalOp[] = placementId ? adopt.map((m) => ({ op: 'update', placementId: m.placementId, parentPlacementId: placementId, x: m.x, y: m.y })) : [];
        const local = (b: AreaCreate) => (v: CanvasView) =>
          applyOpsLocal(addItem(v, { area: localArea(areaId, b), ...(placementId && b.placeOn ? { placement: localPlacement(placementId, { type: 'area', id: areaId }, b.placeOn) } : {}) }), moves);
        const create = (b: AreaCreate, entry?: HistoryEntry) =>
          saveCreate('area', 'Add area', cid, { item: areaId, placement: placementId }, b, local(b), post.area, moves.length
            ? async () => {
                // the box's server id is needed before the nodes can move into it
                await syncView(cid, [{ item: { type: 'area', id: areaId }, placementId }]);
                unwrap(await api.POST('/workspaces/{wsId}/canvases/{canvasId}/operations', { params: { path: { wsId, canvasId: cid } }, body: { operations: moves.map(strip) } }));
              }
            : undefined, entry);
        let snapshot = body;
        const entry: HistoryEntry = {
          label: 'Add area',
          undo: () => {
            const v = current(cid);
            const a = v?.areas.find((x) => x.id === areaId);
            const p = placementOf(v, 'area', areaId);
            if (a) snapshot = { ...body, name: a.name, color: a.color, ...(placeOnFrom(p, cid) ? { placeOn: placeOnFrom(p, cid) } : {}) };
            // put the grouped nodes back where they were (which restores their area), then delete the area
            if (before.length) sendOps('Add area', before.map(restorePlacement), cid);
            saveDelete('area', areaId, 'Add area', cid, entry);
          },
          redo: () => create(snapshot, entry),
        };
        create(body, entry);
        push(entry);
        return { areaId, placementId };
      },

      createNote(body: NoteCreate) {
        const cid = canvasId;
        const noteId = tempId();
        const placementId = body.placeOn ? tempId() : undefined;
        let snapshot = body;
        const entry: HistoryEntry = {
          label: 'Add note',
          undo: () => {
            const v = current(cid);
            const n = v?.notes.find((x) => x.id === noteId);
            if (n) snapshot = noteBody(n, placementOf(v, 'note', noteId), cid);
            saveDelete('note', noteId, 'Add note', cid, entry);
          },
          redo: () => createNoteAs('Add note', cid, noteId, placementId, snapshot, entry),
        };
        createNoteAs('Add note', cid, noteId, placementId, body, entry);
        push(entry);
        return { noteId, placementId };
      },

      createLink(body: LinkCreate) {
        const cid = canvasId;
        const linkId = tempId();
        let snapshot = body;
        const entry: HistoryEntry = {
          label: 'Add link',
          undo: () => {
            const l = current(cid)?.links.find((x) => x.id === linkId);
            if (l) snapshot = linkBody(l);
            saveDelete('link', linkId, 'Add link', cid, entry);
          },
          redo: () => createLinkAs('Add link', cid, linkId, snapshot, entry),
        };
        createLinkAs('Add link', cid, linkId, body, entry);
        push(entry);
        return linkId;
      },

      updateNode(nodeId: string, next: NodeUpdate, prev: NodeUpdate, label = 'Edit node') {
        update('node', nodeId, label, next, prev, async (b) => unwrap(await api.PATCH('/workspaces/{wsId}/nodes/{nodeId}', { params: { path: { wsId, nodeId } }, body: b })));
      },
      updateArea(areaId: string, next: AreaUpdate, prev: AreaUpdate, label = 'Edit area') {
        update('area', areaId, label, next, prev, async (b) => unwrap(await api.PATCH('/workspaces/{wsId}/areas/{areaId}', { params: { path: { wsId, areaId } }, body: b })));
      },
      updateNote(noteId: string, next: NoteUpdate, prev: NoteUpdate, label = 'Edit note') {
        update('note', noteId, label, next, prev, async (b) => unwrap(await api.PATCH('/workspaces/{wsId}/notes/{noteId}', { params: { path: { wsId, noteId } }, body: b })));
      },
      updateLink(linkId: string, next: LinkUpdate, prev: LinkUpdate, label = 'Edit link') {
        update('link', linkId, label, next, prev, async (b) => unwrap(await api.PATCH('/workspaces/{wsId}/links/{linkId}', { params: { path: { wsId, linkId } }, body: b })));
      },
      setHealth(nodeId: string, status: HealthStatus, prev: HealthStatus) {
        update(
          'node',
          nodeId,
          'Set health',
          { status },
          { status: prev },
          async (b) => unwrap(await api.PUT('/workspaces/{wsId}/nodes/{nodeId}/health', { params: { path: { wsId, nodeId } }, body: b })),
          (b) => ({ health: { status: b.status, source: 'manual' } }),
        );
      },

      /** Delete a sticky note (it belongs to this canvas); undo puts it back where it was. */
      deleteNote(noteId: string) {
        const cid = canvasId;
        const v = current(cid);
        const note = v?.notes.find((n) => n.id === noteId);
        if (!note) return;
        const p = placementOf(v, 'note', noteId);
        const body = noteBody(note, p, cid);
        const entry: HistoryEntry = { label: 'Delete note', undo: () => createNoteAs('Delete note', cid, noteId, p?.id, body, entry), redo: () => saveDelete('note', noteId, 'Delete note', cid, entry) };
        saveDelete('note', noteId, 'Delete note', cid, entry);
        push(entry);
      },

      /** Delete a link from the inventory (every canvas); undo creates it again. */
      deleteLink(linkId: string) {
        const cid = canvasId;
        const l = current(cid)?.links.find((x) => x.id === linkId);
        if (!l) return;
        const body = linkBody(l);
        const entry: HistoryEntry = { label: 'Delete link', undo: () => createLinkAs('Delete link', cid, linkId, body, entry), redo: () => saveDelete('link', linkId, 'Delete link', cid, entry) };
        saveDelete('link', linkId, 'Delete link', cid, entry);
        push(entry);
      },

      /**
       * Show or hide kinds of links on this canvas (canvas settings). Instant: hidden kinds vanish at
       * once; links shown again appear when the save returns (the browser doesn't have them yet).
       */
      setHiddenLinkKinds(next: LinkKind[], label: string) {
        const cid = canvasId;
        const send = (kinds: LinkKind[], entry?: HistoryEntry) =>
          enqueue({
            label,
            canvasId: cid,
            apply: (v) => ({ ...v, canvas: { ...v.canvas, settings: { ...v.canvas.settings, hiddenLinkKinds: kinds } }, links: v.links.filter((l) => !kinds.includes(l.kind)) }),
            run: async (confirm) => {
              const settings = { ...(qc.getQueryData<CanvasView>(viewKey(cid))?.canvas.settings ?? {}), hiddenLinkKinds: kinds };
              unwrap(await api.PATCH('/workspaces/{wsId}/canvases/{canvasId}', { params: { path: { wsId, canvasId: cid } }, body: { settings } }));
              store(cid, await fetchView(cid));
              confirm();
            },
            onFail: () => entry && forget(entry),
          });
        const prev = current(cid)?.canvas.settings.hiddenLinkKinds ?? [];
        const entry: HistoryEntry = { label, undo: () => send(prev, entry), redo: () => send(next, entry) };
        send(next, entry);
        push(entry);
      },

      /** Delete from the inventory and every canvas, after a confirmation dialog. No undo: the server can't bring it back. */
      deleteEverywhere(type: 'node' | 'area', id: string, label: string) {
        saveDelete(type, id, label, canvasId);
      },
    };
  }, [qc, wsId, canvasId]);
}

export type Editor = ReturnType<typeof useEditor>;
