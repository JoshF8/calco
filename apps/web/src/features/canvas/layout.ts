// Auto-layout for imported graphs. Terraform carries no canvas coordinates, so
// an imported model reaches modelToCanvas with every node at the origin; this
// assigns real positions with ELK, which is built for compound (nested) graphs
// — exactly calco's VPC › subnet › resource nesting — and routes edges across
// the hierarchy.
//
// ELK is loaded with a dynamic import so its ~1MB engine is code-split and only
// fetched the first time someone imports, never weighing down the initial load.
// It runs on the main thread (one layout per import, behind the import
// spinner); moving it to a worker later is a drop-in swap, not a rewrite.
import type { ElkNode, ElkExtendedEdge } from 'elkjs';
import type { Edge } from '@xyflow/react';
import type { ResourceNode } from './store';
import { isContainer } from './containment';

// Default size fed to ELK for a leaf node before React Flow has measured the
// real DOM. Close to the rendered emblem so containers are sized about right;
// React Flow re-measures after paint.
const LEAF = { width: 184, height: 76 };

const GRAPH_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN', // lay out across container boundaries
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.spacing.nodeNode': '40',
  'elk.padding': '[top=48,left=20,bottom=20,right=20]', // room for the container header
};

/** layout assigns positions (and container sizes) to imported nodes with ELK,
 * returning a new node array. Positions of nested nodes are parent-relative,
 * which is exactly React Flow's model, so they map across directly. Edges only
 * inform routing; they are returned unchanged by the caller. */
export async function layout(nodes: ResourceNode[], edges: Edge[]): Promise<ResourceNode[]> {
  if (nodes.length === 0) return nodes;

  const childrenOf = new Map<string | undefined, ResourceNode[]>();
  for (const n of nodes) {
    const siblings = childrenOf.get(n.parentId);
    if (siblings) siblings.push(n);
    else childrenOf.set(n.parentId, [n]);
  }

  const isBox = (n: ResourceNode) => isContainer(n.data.type) || (childrenOf.get(n.id)?.length ?? 0) > 0;

  const toElk = (n: ResourceNode): ElkNode => {
    const kids = childrenOf.get(n.id) ?? [];
    if (isBox(n)) {
      return { id: n.id, children: kids.map(toElk), layoutOptions: { 'elk.padding': GRAPH_OPTIONS['elk.padding'] } };
    }
    return { id: n.id, width: LEAF.width, height: LEAF.height };
  };

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: GRAPH_OPTIONS,
    children: (childrenOf.get(undefined) ?? []).map(toElk),
    edges: edges.map((e): ElkExtendedEdge => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
  const result = await new ELK().layout(graph);

  const placed = new Map<string, { x: number; y: number; width?: number; height?: number }>();
  const walk = (en: ElkNode) => {
    placed.set(en.id, { x: en.x ?? 0, y: en.y ?? 0, width: en.width, height: en.height });
    for (const c of en.children ?? []) walk(c);
  };
  for (const r of result.children ?? []) walk(r);

  return nodes.map((n) => {
    const p = placed.get(n.id);
    if (!p) return n;
    const box = isBox(n);
    return {
      ...n,
      position: { x: p.x, y: p.y },
      ...(box && p.width && p.height ? { width: p.width, height: p.height } : {}),
    };
  });
}
