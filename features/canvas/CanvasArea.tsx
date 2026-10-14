'use client';

import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { AreaColor, InvNode, NodeCategory } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { CATEGORY, DEFAULT_TYPE_FOR, LINK_KIND, nodeType } from '@/lib/domain';
import { useNodes } from '../workspace/api';
import { useWorkspace } from '../workspace/context';
import { fitPadding, useUi } from '../workspace/store';
import { CanvasActionsContext, type CanvasActions } from './actions';
import { BottomBar } from './BottomBar';
import { hasClip } from './clipboard';
import { copyItems } from './clipboard';
import { pasteHere, removeFlowIds, selectAll, selectFlowIds } from './commands';
import { CanvasContextMenu, type MenuHandlers, type MenuTarget } from './ContextMenu';
import { DrawOverlay, type DrawResult } from './DrawOverlay';
import { restorePlacement, useEditor } from './editor';
import { buildFlow, type FlowNode } from './flow';
import { useHistory } from './history';
import { EdgeMarkers, edgeTypes } from './LinkEdge';
import type { LocalOp } from './local';
import { overrideEdit } from './linkOverride';
import { nodeTypes } from './nodes';
import { NODE_DRAG_TYPE, placeNode } from './place';
import { ToolHint } from './ToolHint';
import { runUndo, useCanvasKeys } from './useCanvasKeys';

type Rect = { x: number; y: number; w: number; h: number };
const SHAPE_PREFIX = 'shape:';

function Inner() {
  const { workspace, canvasId, view, enterArea, goToCanvas, toast } = useWorkspace();
  const { selection, select, multi, tool, setTool } = useUi();
  const rf = useReactFlow<FlowNode>();
  const editor = useEditor();
  const resetHistory = useHistory((s) => s.reset);
  const canUndo = useHistory((s) => s.past.length > 0);
  const canRedo = useHistory((s) => s.future.length > 0);
  const inventory = useNodes(workspace.id);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);

  useEffect(() => resetHistory(canvasId), [canvasId, resetHistory]);
  // a new tool starts fresh: forget a half-picked link, stop editing text when panning
  const [toolSeen, setToolSeen] = useState(tool);
  if (toolSeen !== tool) {
    setToolSeen(tool);
    setLinkSource(null);
    if (tool.kind === 'pan') setEditingId(null);
  }

  const built = useMemo(() => (view ? buildFlow(view, selection, linkSource, multi) : { nodes: [], edges: [] }), [view, selection, linkSource, multi]);
  // local copy so dragging is smooth; the view (server copy + unsaved edits) replaces it whenever it changes
  const [nodes, setNodes] = useState<FlowNode[]>(built.nodes);
  const [source, setSource] = useState(built.nodes);
  if (source !== built.nodes) {
    setSource(built.nodes);
    setNodes(built.nodes);
  }
  const edges = useMemo(
    () => built.edges.map((e) => ({ ...e, selected: selection?.type === 'link' && selection.id === e.id })),
    [built.edges, selection],
  );

  // fit once per canvas, after nodes are measured; the drawing fades in then (no jump when switching canvases)
  const [fittedFor, setFittedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!view || fittedFor === canvasId) return;
    const t = setTimeout(() => {
      rf.fitView({ padding: fitPadding(), maxZoom: 1, duration: 0 });
      setFittedFor(canvasId);
    }, 30);
    return () => clearTimeout(t);
  }, [view, canvasId, fittedFor, rf]);

  // a locked canvas is read-only for everyone until unlocked (permissions.md rule 8)
  const canEdit = !!view?.viewer.canEdit && !view.canvas.lock;
  const panning = tool.kind === 'pan';
  const placementById = useMemo(() => new Map(view?.placements.map((p) => [p.id, p]) ?? []), [view]);
  const shapeById = useMemo(() => new Map(view?.shapes.map((s) => [s.id, s]) ?? []), [view]);

  // absolute position / size of a flow node (children are positioned relative to their area box)
  const absolute = useCallback((n: Node) => rf.getInternalNode(n.id)?.internals.positionAbsolute ?? n.position, [rf]);
  const sizeOf = useCallback(
    (n: Node) => {
      const m = rf.getInternalNode(n.id)?.measured;
      return { w: m?.width ?? Number(n.style?.width ?? 0), h: m?.height ?? Number(n.style?.height ?? 0) };
    },
    [rf],
  );
  /** The innermost expanded area box containing a point (absolute flow coordinates). */
  const boxAt = useCallback(
    (x: number, y: number, except?: string) =>
      nodes
        .filter((n) => n.type === 'areaBox' && n.id !== except && !n.hidden)
        .map((n) => ({ n, a: absolute(n), s: sizeOf(n) }))
        .filter(({ a, s }) => x > a.x && x < a.x + s.w && y > a.y && y < a.y + s.h)
        .at(-1),
    [nodes, absolute, sizeOf],
  );

  const toggleCollapse = useCallback(
    (placementId: string, collapsed: boolean) =>
      editor.ops(collapsed ? 'Collapse area' : 'Expand area', [{ op: 'update', placementId, collapsed }], [{ op: 'update', placementId, collapsed: !collapsed }]),
    [editor],
  );

  const actions: CanvasActions | null = useMemo(
    () =>
      view
        ? {
            viewer: { ...view.viewer, canEdit },
            editingId,
            setEditingId,
            toggleCollapse,
            setWaypoints: (linkId, points) => {
              const { ops, inverse } = overrideEdit(view, linkId, { waypoints: points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) });
              editor.ops(points.length ? 'Reroute link' : 'Straighten link', ops, inverse);
            },
            enterArea: (areaId) => void enterArea(areaId),
            leaveArea: () => {
              const host = view.breadcrumb.at(-2);
              if (host) goToCanvas(host.canvasId);
            },
            resize: (id, r) => {
              const rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
              if (id.startsWith(SHAPE_PREFIX)) {
                const s = shapeById.get(id.slice(SHAPE_PREFIX.length));
                if (!s) return;
                const text = s.kind === 'text';
                editor.ops(
                  'Resize shape',
                  [{ op: 'shape.update', shapeId: s.id, ...rect, ...(text ? { height: null } : {}) }],
                  [{ op: 'shape.update', shapeId: s.id, x: s.x, y: s.y, width: s.width ?? null, height: s.height ?? null }],
                );
                return;
              }
              const p = placementById.get(id);
              if (!p) return;
              const note = p.item.type === 'note';
              editor.ops('Resize', [{ op: 'update', placementId: p.id, ...rect, ...(note ? { height: null } : {}) }], [restorePlacement(p)]);
            },
            commitText: (target, text) => {
              if (target.type === 'note') {
                const note = view.notes.find((n) => n.id === target.id);
                if (note && note.body !== text) editor.updateNote(note.id, { body: text }, { body: note.body });
                return;
              }
              const s = shapeById.get(target.id);
              if (s && s.data.text !== text) editor.ops('Edit text', [{ op: 'shape.update', shapeId: s.id, data: { ...s.data, text } }], [{ op: 'shape.update', shapeId: s.id, data: s.data }]);
            },
          }
        : null,
    [view, canEdit, editor, enterArea, goToCanvas, editingId, placementById, shapeById, toggleCollapse],
  );

  // ───────── link tool: click the first node, then the second ─────────
  const pickForLink = (nodeId: string) => {
    if (tool.kind !== 'link' || !view) return;
    if (!linkSource || linkSource === nodeId) {
      setLinkSource(linkSource === nodeId ? null : nodeId);
      return;
    }
    const kind = tool.linkKind;
    const name = (id: string) => view.nodes.find((n) => n.id === id)?.name ?? 'node';
    const from = linkSource;
    setLinkSource(null);
    setTool({ kind: 'select' });
    const id = editor.createLink({ sourceNodeId: from, targetNodeId: nodeId, kind, directed: LINK_KIND[kind].directed });
    const hidden = view.canvas.settings.hiddenLinkKinds?.includes(kind);
    if (!hidden) select({ type: 'link', id });
    toast(
      hidden
        ? `Linked ${name(from)} and ${name(nodeId)}. ${LINK_KIND[kind].label} links are hidden on this canvas (see the legend).`
        : `Linked ${name(from)} → ${name(nodeId)}. It shows on every canvas where both are placed.`,
    );
  };

  const onNodeClick: NodeMouseHandler<FlowNode> = (e, n) => {
    if (panning) return;
    if (tool.kind === 'link') {
      if (n.type === 'inv') pickForLink(n.data.node.id);
      else toast('Links connect two nodes. Click a node card.');
      return;
    }
    // Shift / Ctrl click adds to (or takes out of) a multi-selection
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && view) {
      const s = useUi.getState();
      const already = s.multi.length ? s.multi : s.selection ? nodes.filter((x) => x.selected).map((x) => x.id) : [];
      const next = already.includes(n.id) ? already.filter((x) => x !== n.id) : [...already, n.id];
      selectFlowIds(view, next);
      return;
    }
    if (n.type === 'inv') select({ type: 'node', id: n.data.node.id });
    else if (n.type === 'areaBox' || n.type === 'areaCard') select({ type: 'area', id: n.data.area.id });
    else if (n.type === 'note') select({ type: 'note', id: n.data.note.id });
    else if (n.type === 'shape') select({ type: 'shape', id: n.data.shape.id });
    else if (n.type === 'ghost') select({ type: 'node', id: n.data.node.id });
  };
  const onNodeDoubleClick: NodeMouseHandler<FlowNode> = (_, n) => {
    if (panning) return;
    if (n.type === 'areaCard' && view?.viewer.role !== 'guest') void enterArea(n.data.area.id);
    else if (canEdit && (n.type === 'note' || (n.type === 'shape' && n.data.shape.kind === 'text'))) setEditingId(n.id);
  };

  /** After a drag: save the new positions; dropping one node into another area box moves it to that area. */
  const onNodeDragStop: OnNodeDrag<FlowNode> = (_, dragged, all) => {
    if (!canEdit) return;
    const moved = (all.length ? all : [dragged]).filter((n) => n.type !== 'ghost');
    if (moved.length > 1) {
      const ops: LocalOp[] = [];
      const back: LocalOp[] = [];
      for (const n of moved) {
        const x = Math.round(n.position.x);
        const y = Math.round(n.position.y);
        if (n.type === 'shape') {
          const s = n.data.shape;
          if (s.x === x && s.y === y) continue;
          ops.push({ op: 'shape.update', shapeId: s.id, x, y });
          back.push({ op: 'shape.update', shapeId: s.id, x: s.x, y: s.y });
        } else {
          const p = placementById.get(n.id);
          if (!p || (p.x === x && p.y === y)) continue;
          ops.push({ op: 'update', placementId: p.id, x, y });
          back.push(restorePlacement(p));
        }
      }
      if (ops.length) editor.ops(`Move ${ops.length} items`, ops, back);
      return;
    }
    const x = Math.round(dragged.position.x);
    const y = Math.round(dragged.position.y);
    if (dragged.type === 'ghost') return;
    if (dragged.type === 'shape') {
      const s = dragged.data.shape;
      if (s.x !== x || s.y !== y) editor.ops('Move shape', [{ op: 'shape.update', shapeId: s.id, x, y }], [{ op: 'shape.update', shapeId: s.id, x: s.x, y: s.y }]);
      return;
    }
    const p = placementById.get(dragged.id);
    if (!p) return;
    if (dragged.type !== 'inv') {
      if (p.x !== x || p.y !== y) editor.ops('Move', [{ op: 'update', placementId: p.id, x, y }], [restorePlacement(p)]);
      return;
    }
    const abs = absolute(dragged);
    const size = sizeOf(dragged);
    const box = boxAt(abs.x + size.w / 2, abs.y + size.h / 2, dragged.id);
    const parent = box?.n.id ?? null;
    if (parent !== (dragged.parentId ?? null)) {
      const base = box ? box.a : { x: 0, y: 0 };
      const areaName = box?.n.type === 'areaBox' ? box.n.data.area.name : null;
      editor.ops(
        areaName ? `Move into ${areaName}` : 'Move out of area',
        [{ op: 'update', placementId: p.id, parentPlacementId: parent, x: Math.round(abs.x - base.x), y: Math.round(abs.y - base.y) }],
        [restorePlacement(p)],
      );
      toast(
        areaName
          ? `${dragged.data.node.name} moved into ${areaName}. Its area changed in the inventory, so it moves on every canvas.`
          : `${dragged.data.node.name} moved out of its area, on every canvas.`,
      );
    } else if (p.x !== x || p.y !== y) {
      editor.ops('Move', [{ op: 'update', placementId: p.id, x, y }], [restorePlacement(p)]);
    }
  };

  // ───────── creating things (all instant: the editor saves in the background) ─────────
  const addNode = (category: NodeCategory, x: number, y: number) => {
    const type = DEFAULT_TYPE_FOR[category];
    const box = boxAt(x, y);
    const areaId = box?.n.type === 'areaBox' ? box.n.data.area.id : undefined;
    const placeOn = box
      ? { canvasId, parentPlacementId: box.n.id, x: Math.round(x - box.a.x - 100), y: Math.round(y - box.a.y - 35) }
      : { canvasId, x: Math.round(x - 100), y: Math.round(y - 35) };
    const { nodeId } = editor.createNode({ name: `New ${nodeType(type).label.toLowerCase()}`, category, type, ...(areaId ? { areaId } : {}), placeOn });
    select({ type: 'node', id: nodeId });
    toast(`Added a ${CATEGORY[category].label.toLowerCase()} node. Rename it in the details panel.`);
  };

  /** Draw an area: nodes drawn inside the rectangle join it (on every canvas). */
  const addArea = (r: Rect, color: AreaColor) => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const outer = boxAt(cx, cy);
    const parentPlacementId = outer?.n.id ?? null;
    const origin = outer ? outer.a : { x: 0, y: 0 };
    const outerAreaId = outer?.n.type === 'areaBox' ? outer.n.data.area.id : null;
    // nodes at the same level whose center is inside the drawn rectangle
    const inside = nodes
      .filter((n): n is Extract<FlowNode, { type: 'inv' }> => n.type === 'inv' && !n.hidden && (n.parentId ?? null) === parentPlacementId)
      .map((n) => {
        const a = absolute(n);
        const s = sizeOf(n);
        return { id: n.id, node: n.data.node, a, c: { x: a.x + s.w / 2, y: a.y + s.h / 2 } };
      })
      .filter(({ c }) => c.x > r.x && c.x < r.x + r.w && c.y > r.y && c.y < r.y + r.h);
    // Only adopt nodes that are free at this level. A node already in another area (whose box may not
    // be drawn here) keeps it: moving it would silently change its area on every canvas.
    const members = inside.filter((m) => (m.node.areaId ?? null) === outerAreaId);
    const skipped = inside.filter((m) => (m.node.areaId ?? null) !== outerAreaId);
    const before = members.map((m) => placementById.get(m.id)).filter((p): p is NonNullable<typeof p> => !!p);
    const count = view?.areas.length ?? 0;
    const { areaId } = editor.createArea(
      {
        name: `Area ${count + 1}`,
        color,
        ...(outer?.n.type === 'areaBox' ? { parentId: outer.n.data.area.id } : {}),
        placeOn: {
          canvasId,
          ...(parentPlacementId ? { parentPlacementId } : {}),
          x: Math.round(r.x - origin.x),
          y: Math.round(r.y - origin.y),
          width: Math.round(r.w),
          height: Math.round(r.h),
        },
      },
      members.map((m) => ({ placementId: m.id, x: Math.round(m.a.x - r.x), y: Math.round(m.a.y - r.y) })),
      before,
    );
    select({ type: 'area', id: areaId });
    const kept = skipped.length ? ` ${skipped.map((m) => m.node.name).join(', ')} stayed in ${skipped.length > 1 ? 'their own areas' : 'its own area'}.` : '';
    toast((members.length ? `New area with ${members.length} node${members.length > 1 ? 's' : ''}.` : 'New area. Drag nodes into it.') + kept + ' Rename it in the details panel.');
  };

  const addNote = (x: number, y: number, color: Extract<typeof tool, { kind: 'note' }>['color'] = 'yellow') => {
    const { noteId, placementId } = editor.createNote({ target: { type: 'canvas', id: canvasId }, body: '', color, placeOn: { canvasId, x: Math.round(x - 110), y: Math.round(y - 30), width: 220 } });
    select({ type: 'note', id: noteId });
    if (placementId) setEditingId(placementId);
  };
  const addText = (x: number, y: number) => {
    const id = editor.createShape({ op: 'shape.create', kind: 'text', x: Math.round(x), y: Math.round(y - 12), width: 220, data: { text: '' }, style: { color: 'gray', size: 'md' } });
    select({ type: 'shape', id });
    setEditingId(SHAPE_PREFIX + id);
  };

  const onDraw = (d: DrawResult) => {
    setTool({ kind: 'select' });
    if (!canEdit) return;
    const { start, rect, points, click } = d;
    if (tool.kind === 'node') return addNode(tool.category, start.x, start.y);
    if (tool.kind === 'area') return addArea(click ? { x: start.x - 240, y: start.y - 160, w: 480, h: 320 } : rect, tool.color);
    if (tool.kind === 'note') return addNote(start.x, start.y, tool.color);
    if (tool.kind !== 'shape') return;
    const kind = tool.shape;
    const style = { color: 'gray' } as Record<string, unknown>;
    if (kind === 'text') return addText(start.x, start.y);
    if (kind === 'rectangle' || kind === 'ellipse') {
      const r = click ? { x: start.x - 80, y: start.y - 50, w: 160, h: 100 } : rect;
      const id = editor.createShape({ op: 'shape.create', kind, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h), style });
      select({ type: 'shape', id });
      return;
    }
    // arrow / freehand: store points relative to the bounding box
    if (click || points.length < 2) {
      toast(kind === 'arrow' ? 'Drag to draw an arrow.' : 'Drag to draw.');
      return;
    }
    const pts = kind === 'arrow' ? [points[0]!, points.at(-1)!] : points;
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    const id = editor.createShape({
      op: 'shape.create',
      kind,
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.max(1, Math.round(maxX - minX)),
      height: Math.max(1, Math.round(maxY - minY)),
      style,
      data: { points: pts.map((p) => ({ x: Math.round(p.x - minX), y: Math.round(p.y - minY) })) },
    });
    select({ type: 'shape', id });
  };

  const onPaneClick = () => {
    if (tool.kind === 'link') {
      if (linkSource) setLinkSource(null);
      else setTool({ kind: 'select' });
      return;
    }
    setEditingId(null);
    select(null);
  };

  // ───────── placing inventory nodes (dragged from the toolbar's inventory) ─────────
  const placeExisting = (n: InvNode, at?: { x: number; y: number }) => {
    if (!view || !canEdit) return;
    const id = placeNode(editor, view, n, at);
    if (!id) return toast(`${n.name} is already on this canvas. A canvas shows each node once.`);
    select({ type: 'node', id: n.id });
    toast(`${n.name} placed. Its links to nodes on this canvas appear by themselves.`);
  };
  const onDrop = (e: React.DragEvent) => {
    const nodeId = e.dataTransfer.getData(NODE_DRAG_TYPE);
    if (!nodeId) return;
    e.preventDefault();
    const n = inventory.data?.find((x) => x.id === nodeId);
    if (n) placeExisting(n, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  // ───────── right-click menu ─────────
  const at = (e: ReactMouseEvent | MouseEvent) => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
  const onNodeContextMenu: NodeMouseHandler<FlowNode> = (e, n) => {
    if (panning) return setMenuTarget(null);
    const p = at(e);
    const s = useUi.getState();
    if (s.multi.length > 1 && s.multi.includes(n.id)) return setMenuTarget({ kind: 'items', flowIds: s.multi, at: p });
    if (n.type === 'inv') {
      select({ type: 'node', id: n.data.node.id });
      setMenuTarget({ kind: 'node', flowId: n.id, nodeId: n.data.node.id, at: p });
    } else if (n.type === 'areaBox' || n.type === 'areaCard') {
      select({ type: 'area', id: n.data.area.id });
      setMenuTarget({ kind: 'area', flowId: n.id, areaId: n.data.area.id, collapsed: n.type === 'areaCard', at: p });
    } else if (n.type === 'note') {
      select({ type: 'note', id: n.data.note.id });
      setMenuTarget({ kind: 'note', flowId: n.id, noteId: n.data.note.id, at: p });
    } else if (n.type === 'shape') {
      select({ type: 'shape', id: n.data.shape.id });
      setMenuTarget({ kind: 'shape', flowId: n.id, shapeId: n.data.shape.id, text: n.data.shape.kind === 'text', at: p });
    } else if (n.type === 'ghost') setMenuTarget({ kind: 'ghost', nodeId: n.data.node.id, at: p });
  };
  const menu: MenuHandlers = {
    canEdit,
    canPaste: canEdit && hasClip(),
    canUndo,
    canRedo,
    details: (t) => {
      if (t.kind === 'node' || t.kind === 'ghost') select({ type: 'node', id: t.nodeId });
      else if (t.kind === 'area') select({ type: 'area', id: t.areaId });
      else if (t.kind === 'note') select({ type: 'note', id: t.noteId });
      else if (t.kind === 'shape') select({ type: 'shape', id: t.shapeId });
      else if (t.kind === 'link') select({ type: 'link', id: t.linkId });
    },
    copy: (ids) => {
      if (!view) return;
      const n = copyItems(view, ids);
      toast(n ? `Copied ${n} item${n > 1 ? 's' : ''}.` : 'Nothing to copy: area boxes and links are not copied.');
    },
    paste: (p) => view && pasteHere(editor, view, p),
    remove: (ids) => view && removeFlowIds(editor, view, ids),
    addNode: (c, p) => addNode(c, p.x, p.y),
    addNote: (p) => addNote(p.x, p.y),
    addText: (p) => addText(p.x, p.y),
    editText: (id) => setEditingId(id),
    enterArea: (id) => void enterArea(id),
    toggleCollapse,
    hideLink: (linkId) => {
      select(null);
      editor.ops('Hide link', [{ op: 'link.override', linkId, hidden: true }], [{ op: 'link.override', linkId, hidden: false }]);
      toast('Link hidden on this canvas only.');
    },
    selectAll: () => view && selectAll(view),
    fit: () => void rf.fitView({ padding: fitPadding(), maxZoom: 1, duration: 200 }),
    undo: () => runUndo('undo', toast),
    redo: () => runUndo('redo', toast),
  };

  useCanvasKeys({ editor, editing: !!editingId });

  if (!actions) return <div className="grid h-full place-items-center text-faint">Loading canvas…</div>;
  const drawing = canEdit && (tool.kind === 'node' || tool.kind === 'area' || tool.kind === 'note' || tool.kind === 'shape');
  return (
    <CanvasActionsContext.Provider value={actions}>
      <EdgeMarkers />
      <CanvasContextMenu target={menuTarget} h={menu}>
        <div
          className="absolute inset-0"
          onDragOver={(e) => {
            if (canEdit && e.dataTransfer.types.includes(NODE_DRAG_TYPE)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={onDrop}
          onContextMenu={(e) => {
            if (panning || drawing) e.preventDefault(); // no menu while panning or drawing
          }}
        >
          <ReactFlow<FlowNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={(changes) => setNodes((ns) => applyLocal(ns, changes))}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDragStop={onNodeDragStop}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={(e, edge) => {
              if (panning) return setMenuTarget(null);
              select({ type: 'link', id: edge.id });
              setMenuTarget({ kind: 'link', linkId: edge.id, at: at(e) });
            }}
            onPaneContextMenu={(e) => setMenuTarget(panning ? null : { kind: 'pane', at: at(e) })}
            onSelectionContextMenu={(e, ns) => setMenuTarget({ kind: 'items', flowIds: ns.map((n) => n.id), at: at(e) })}
            onSelectionEnd={() => view && selectFlowIds(view, rf.getNodes().filter((n) => n.selected).map((n) => n.id))}
            onEdgeClick={(_, e) => !panning && tool.kind !== 'link' && select({ type: 'link', id: e.id })}
            onPaneClick={onPaneClick}
            nodesDraggable={canEdit && tool.kind === 'select' && !editingId}
            nodesConnectable={false}
            elementsSelectable={!panning}
            selectNodesOnDrag={false}
            selectionOnDrag={tool.kind === 'select'}
            selectionMode={SelectionMode.Partial}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            panActivationKeyCode={null}
            // Select: left-drag on empty canvas draws a selection box, middle-drag (or hold Space) pans.
            // Pan (H / Space): any drag moves the view and nothing can be picked or changed.
            panOnDrag={panning ? true : [1]}
            zoomOnDoubleClick={false}
            minZoom={0.25}
            maxZoom={2}
            className={cn(`tool-${tool.kind}`, fittedFor === canvasId ? 'is-fitted' : 'is-fitting')}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--grid-dot)" />
          </ReactFlow>
        </div>
      </CanvasContextMenu>
      {drawing && <DrawOverlay tool={tool} onDraw={onDraw} />}
      {view && !view.placements.length && !view.shapes.length && tool.kind === 'select' && (
        <div className="pointer-events-none absolute inset-0 z-[4] grid place-items-center">
          <div className="max-w-sm rounded-lg border border-dashed border-border-strong bg-surface/80 px-6 py-5 text-center text-[13px] text-muted">
            <div className="mb-1 font-semibold text-text">This canvas is empty</div>
            {canEdit
              ? 'Add a node from the toolbar (N), drag one in from the toolbar inventory, or right-click for more. Links between placed nodes appear by themselves.'
              : 'Nothing has been drawn here yet.'}
          </div>
        </div>
      )}
      <ToolHint tool={tool} linkSource={linkSource ? (view?.nodes.find((n) => n.id === linkSource)?.name ?? null) : null} />
      <BottomBar canvasId={canvasId} onPlace={placeExisting} />
    </CanvasActionsContext.Provider>
  );
}

// position/dimension/selection changes are applied locally; the store decides what counts as selected
function applyLocal(nodes: FlowNode[], changes: NodeChange<FlowNode>[]) {
  return applyNodeChanges(
    changes.filter((c) => c.type !== 'remove'),
    nodes,
  );
}

export function CanvasArea() {
  return (
    <div className="absolute inset-0">
      <ReactFlowProvider>
        <Inner />
      </ReactFlowProvider>
    </div>
  );
}
