import { Background, Controls, MiniMap, ReactFlow, type NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasStore } from './store';
import { ResourceNode } from './ResourceNode';

const nodeTypes: NodeTypes = { resource: ResourceNode };

// The MiniMap applies its colors as SVG fill attributes, where CSS var() does
// not resolve, and reading getComputedStyle during render is stale relative to
// the class-toggling theme effect. So we use concrete brand values keyed on the
// same isDark the canvas theme uses — they mirror the tokens in
// src/styles/globals.css (paper/ink/registration). Keep them in sync.
const MINIMAP = {
  light: { bg: '#F8F4E9', node: '#6F665D', stroke: '#D9D0BC', mask: 'rgba(58, 53, 48, 0.10)' },
  dark: { bg: '#2A211C', node: '#9E9285', stroke: '#3D332C', mask: 'rgba(232, 221, 200, 0.12)' },
} as const;

// `dark` is passed from App's theme state (the source of truth) rather than
// read from the DOM class — the class is set in an effect after render, so
// reading it here would be one render stale on toggle.
export function Canvas({ dark }: { dark: boolean }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);

  const colorMode = dark ? 'dark' : 'light';
  const mm = MINIMAP[colorMode];

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
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
