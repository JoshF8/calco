import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type OnBeforeDelete,
  type OnConnectEnd,
  type OnConnectStart,
  type OnNodeDrag,
  type OnReconnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/shared/components/ui/button';
import { useCanvasStore, type ResourceNode } from './store';
import { ResourceNode as ResourceNodeView } from './ResourceNode';
import { ContainerNode } from './ContainerNode';
import { RefEdge } from './RefEdge';
import { ConnectionHint } from './ConnectionHint';
import { canNest, nestRule } from './containment';
import { RESOURCE_DND_MIME } from './dnd';

const nodeTypes: NodeTypes = { resource: ResourceNodeView, container: ContainerNode };
const edgeTypes: EdgeTypes = { ref: RefEdge };

const MINIMAP = {
  light: { bg: '#F8F4E9', node: '#6F665D', stroke: '#D9D0BC', mask: 'rgba(58, 53, 48, 0.10)' },
  dark: { bg: '#2A211C', node: '#9E9285', stroke: '#3D332C', mask: 'rgba(232, 221, 200, 0.12)' },
} as const;

function area(n: Node): number {
  const w = n.measured?.width ?? n.width ?? 0;
  const h = n.measured?.height ?? n.height ?? 0;
  return w * h;
}

function Flow({ dark }: { dark: boolean }) {
  const { t } = useTranslation();
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const startConnect = useCanvasStore((s) => s.startConnect);
  const endConnect = useCanvasStore((s) => s.endConnect);
  const showConnectionHint = useCanvasStore((s) => s.showConnectionHint);
  const nestNode = useCanvasStore((s) => s.nestNode);
  const unnestNode = useCanvasStore((s) => s.unnestNode);
  const setDropTarget = useCanvasStore((s) => s.setDropTarget);
  const addResourceAt = useCanvasStore((s) => s.addResourceAt);
  const reconnectEdge = useCanvasStore((s) => s.reconnectEdge);
  const loadExample = useCanvasStore((s) => s.loadExample);
  const { getIntersectingNodes, getInternalNode, screenToFlowPosition } = useReactFlow<ResourceNode>();

  // The container a dragged node would nest into, by geometry: the smallest
  // (innermost) intersecting node of the type this node's nest rule allows, or
  // null. Shared by the live drag (to preview the drop-target) and the drop
  // itself (to commit the nesting), so highlight and outcome can never diverge.
  const nestTargetFor = useCallback(
    (node: Node<ResourceNode['data']>): Node | null => {
      const rule = nestRule(node.data.type);
      if (!rule) return null;
      const hits = getIntersectingNodes(node).filter(
        (n) => n.id !== node.id && n.data?.type === rule.parentType,
      );
      return hits.sort((a, b) => area(a) - area(b))[0] ?? null;
    },
    [getIntersectingNodes],
  );

  // While a node is dragged, light up the container it would nest into (a
  // different one than its current parent) so nesting is discoverable before
  // the drop. Cleared when the drag wouldn't nest anywhere.
  const onNodeDrag = useCallback<OnNodeDrag<ResourceNode>>(
    (_, node) => {
      const target = nestTargetFor(node);
      const current = node.parentId ?? null;
      setDropTarget(target && target.id !== current ? target.id : null);
    },
    [nestTargetFor, setDropTarget],
  );

  // On drop, project containment from geometry: if the node landed inside a
  // valid container, nest it (and create the reference); if it left its
  // container, free it (and drop the reference). Clear the drag preview either
  // way.
  const onNodeDragStop = useCallback<OnNodeDrag<ResourceNode>>(
    (_, node) => {
      setDropTarget(null);
      const rule = nestRule(node.data.type);
      const current = node.parentId ?? null;
      const target = nestTargetFor(node);

      if (target && target.id !== current) {
        const childAbs = getInternalNode(node.id)?.internals.positionAbsolute;
        const parentAbs = getInternalNode(target.id)?.internals.positionAbsolute;
        if (childAbs && parentAbs) {
          nestNode(node.id, target.id, {
            x: Math.max(childAbs.x - parentAbs.x, 8),
            y: Math.max(childAbs.y - parentAbs.y, 30),
          });
        }
      } else if (!target && current && rule) {
        const abs = getInternalNode(node.id)?.internals.positionAbsolute;
        if (abs) unnestNode(node.id, abs);
      }
    },
    [nestTargetFor, getInternalNode, nestNode, unnestNode, setDropTarget],
  );

  // While a connection drag is in flight, remember which node it started from so
  // every other node can light up as a valid target or dim as an invalid one
  // (ResourceNode/ContainerNode read connectSource). Purely visual: it never
  // gates the drop, so an invalid drop still reaches onConnect and gets its
  // teaching refusal.
  const onConnectStart = useCallback<OnConnectStart>(
    (_, { nodeId }) => startConnect(nodeId),
    [startConnect],
  );

  // A drag released on empty pane never fires onConnect, so it would otherwise
  // vanish without a word. Detect the miss (no valid handle under the pointer)
  // and point at the gesture. A drop *on* a handle leaves isValid truthy and is
  // handled by onConnect (edge created, or refusal explained) — don't override.
  const onConnectEnd = useCallback<OnConnectEnd>(
    (_, connectionState) => {
      if (!connectionState.isValid) showConnectionHint('connection.hint.dropOnDot');
      endConnect();
    },
    [showConnectionHint, endConnect],
  );

  // Deleting a container would otherwise cascade-delete every nested child.
  // Instead, detach the direct children of any deleted container (they survive
  // as free nodes at their current absolute position) and delete only the
  // nodes the user actually selected.
  const onBeforeDelete = useCallback<OnBeforeDelete<ResourceNode>>(
    async ({ nodes: toDelete, edges: toDeleteEdges }) => {
      const explicit = new Set(toDelete.filter((n) => n.selected).map((n) => n.id));
      for (const n of toDelete) {
        if (!explicit.has(n.id) && n.parentId && explicit.has(n.parentId)) {
          const abs = getInternalNode(n.id)?.internals.positionAbsolute;
          if (abs) unnestNode(n.id, abs);
        }
      }
      // Delete an edge only if the user selected it or it touches a node that is
      // actually being deleted — not one merely connected to a detached child
      // that survives (React Flow proposes those because the child was in the
      // delete set before we spared it).
      const edges = toDeleteEdges.filter(
        (e) => e.selected || explicit.has(e.source) || explicit.has(e.target),
      );
      return { nodes: toDelete.filter((n) => explicit.has(n.id)), edges };
    },
    [getInternalNode, unnestNode],
  );

  // Dragging a resource from the palette and dropping it on the canvas. The drop
  // point (in flow coords) decides placement: dropped inside a container it can
  // nest into, it's added as that container's child at a container-relative
  // position (nested at once); otherwise it lands free where it fell.
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(RESOURCE_DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const type = e.dataTransfer.getData(RESOURCE_DND_MIME);
      if (!type) return;
      e.preventDefault();
      const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      // Innermost (smallest) container whose bounds contain the drop point and
      // that this type can nest into — mirrors the drop-to-nest geometry used
      // for node drags, but from a point (the new node isn't measured yet).
      let host: { id: string; x: number; y: number } | null = null;
      let hostArea = Infinity;
      for (const n of nodes) {
        if (n.type !== 'container' || !canNest(type, n.data.type)) continue;
        const abs = getInternalNode(n.id)?.internals.positionAbsolute;
        if (!abs) continue;
        const w = n.measured?.width ?? n.width ?? 0;
        const h = n.measured?.height ?? n.height ?? 0;
        if (point.x < abs.x || point.x > abs.x + w || point.y < abs.y || point.y > abs.y + h) continue;
        const a = w * h;
        if (a < hostArea) {
          host = { id: n.id, x: abs.x, y: abs.y };
          hostArea = a;
        }
      }

      // Offset so the cursor lands near the node's middle, not its corner.
      if (host) {
        addResourceAt(
          type,
          { x: Math.max(point.x - host.x - 90, 8), y: Math.max(point.y - host.y - 24, 30) },
          host.id,
        );
      } else {
        addResourceAt(type, { x: point.x - 90, y: point.y - 24 });
      }
    },
    [screenToFlowPosition, nodes, getInternalNode, addResourceAt],
  );

  // Edge reconnection: drag a connection's endpoint to a new node and it
  // re-validates (reconnectEdge). The ref tracks whether a valid drop landed —
  // released on empty pane (no onReconnect), the edge is removed, so dragging an
  // endpoint off is also the "delete this connection" gesture.
  const reconnectLanded = useRef(true);
  const onReconnectStart = useCallback(() => {
    reconnectLanded.current = false;
  }, []);
  const onReconnect = useCallback<OnReconnect>(
    (oldEdge, newConnection) => {
      reconnectLanded.current = true;
      reconnectEdge(oldEdge, newConnection);
    },
    [reconnectEdge],
  );
  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: Edge) => {
      if (!reconnectLanded.current) onEdgesChange([{ type: 'remove', id: edge.id }]);
      reconnectLanded.current = true;
    },
    [onEdgesChange],
  );

  const colorMode = dark ? 'dark' : 'light';
  const mm = MINIMAP[colorMode];

  return (
    <div className="relative h-full w-full">
      <ReactFlow<ResourceNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onBeforeDelete={onBeforeDelete}
        onDrop={onDrop}
        onDragOver={onDragOver}
        // Either handle can start a drag; the store orients the edge by rule
        // (connection.ts), never by which dot was grabbed, so loose is safe and
        // fixes the top (target) dot looking draggable but doing nothing.
        connectionMode={ConnectionMode.Loose}
        // Snap to a handle from well away (default is 20px) so a release near a
        // node connects instead of missing — the biggest "fiddly" fix. Still
        // never gates: a drop beyond any handle falls to onConnectEnd's hint.
        connectionRadius={48}
        // A slightly heavier in-flight line reads more clearly than the 1px
        // default while you aim the drag.
        connectionLineStyle={{ strokeWidth: 2 }}
        colorMode={colorMode}
        fitView
        // Start a touch zoomed out: a few small nodes would otherwise fill the
        // viewport at 100%. Capping the fit at 0.8 (and starting an empty canvas
        // there via defaultViewport) leaves room to place and nest without an
        // immediate pan.
        fitViewOptions={{ padding: 0.35, maxZoom: 0.8 }}
        defaultViewport={{ x: 24, y: 24, zoom: 0.8 }}
        deleteKeyCode={['Backspace', 'Delete']}
        elevateNodesOnSelect={false}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable bgColor={mm.bg} nodeColor={mm.node} nodeStrokeColor={mm.stroke} maskColor={mm.mask} />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">{t('canvas.empty.title')}</p>
            <p className="text-xs text-muted-foreground">{t('canvas.empty.hint')}</p>
          </div>
          <Button variant="outline" size="sm" className="pointer-events-auto" onClick={() => loadExample()}>
            {t('canvas.empty.loadExample')}
          </Button>
        </div>
      )}

      {/* The empty overlay is gone after the first node, so relationships have no
          entry point. Once there are two nodes but nothing linking them, a quiet
          coach line names the gesture — until the first edge proves it landed. */}
      {nodes.length >= 2 && edges.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md border bg-card/85 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
          {t('canvas.coach.connect')}
        </div>
      )}

      <ConnectionHint />
    </div>
  );
}

export function Canvas({ dark }: { dark: boolean }) {
  return (
    <ReactFlowProvider>
      <Flow dark={dark} />
    </ReactFlowProvider>
  );
}
