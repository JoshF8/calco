import { useCallback } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasStore, type ResourceNode } from './store';
import { ResourceNode as ResourceNodeView } from './ResourceNode';
import { ContainerNode } from './ContainerNode';
import { nestRule } from './containment';

const nodeTypes: NodeTypes = { resource: ResourceNodeView, container: ContainerNode };

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
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const nestNode = useCanvasStore((s) => s.nestNode);
  const unnestNode = useCanvasStore((s) => s.unnestNode);
  const { getIntersectingNodes, getInternalNode } = useReactFlow();

  // On drop, project containment from geometry: if the node landed inside a
  // valid container, nest it (and create the reference); if it left its
  // container, free it (and drop the reference).
  const onNodeDragStop = useCallback(
    (_: unknown, node: ResourceNode) => {
      const rule = nestRule(node.data.type);
      const current = node.parentId ?? null;

      let target: Node | null = null;
      if (rule) {
        const hits = getIntersectingNodes(node).filter(
          (n) => n.id !== node.id && (n.data as ResourceNode['data'])?.type === rule.parentType,
        );
        // Innermost (smallest) wins if several containers overlap.
        target = hits.sort((a, b) => area(a) - area(b))[0] ?? null;
      }

      if (target && target.id !== current) {
        const childAbs = getInternalNode(node.id)?.internals.positionAbsolute;
        const parentAbs = getInternalNode(target.id)?.internals.positionAbsolute;
        if (childAbs && parentAbs) {
          nestNode(
            node.id,
            target.id,
            { x: Math.max(childAbs.x - parentAbs.x, 8), y: Math.max(childAbs.y - parentAbs.y, 30) },
            rule!.attribute,
          );
        }
      } else if (!target && current && rule) {
        const abs = getInternalNode(node.id)?.internals.positionAbsolute;
        if (abs) unnestNode(node.id, abs, rule.attribute);
      }
    },
    [getIntersectingNodes, getInternalNode, nestNode, unnestNode],
  );

  const colorMode = dark ? 'dark' : 'light';
  const mm = MINIMAP[colorMode];

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      colorMode={colorMode}
      fitView
      fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
      deleteKeyCode={['Backspace', 'Delete']}
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable bgColor={mm.bg} nodeColor={mm.node} nodeStrokeColor={mm.stroke} maskColor={mm.mask} />
    </ReactFlow>
  );
}

export function Canvas({ dark }: { dark: boolean }) {
  return (
    <ReactFlowProvider>
      <Flow dark={dark} />
    </ReactFlowProvider>
  );
}
