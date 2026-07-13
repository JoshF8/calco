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
// real DOM — matched to the rendered emblem (min-w 196 / max-w 264, ~65px tall)
// so ELK sizes containers accurately for their children.
const LEAF = { width: 216, height: 68 };

// Size given to an EMPTY container (a subnet an imported resource references but
// nests nothing into). Without a size ELK collapses it — or it keeps the large
// greenfield default and overflows its parent — so we pin a compact one, and
// the parent then reserves room for it.
const EMPTY_BOX = { width: 264, height: 150 };

// Container inner padding, with extra room at the top for the box's own header
// (icon + label + address, ~44px).
const CONTAINER_PADDING = '[top=44,left=18,bottom=18,right=18]';

// Root layout: layered, top-to-bottom (edges attach to the source's bottom
// handle and the target's top handle, so a reference reads as a clean downward
// line). Each compound node is laid out on its own (SEPARATE children, the
// default) and then placed here as one sized node — this lets a container pack
// its body with a different algorithm than the root uses.
const GRAPH_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.spacing.nodeNodeBetweenLayers': '84',
  'elk.spacing.nodeNode': '48',
  'elk.spacing.edgeNode': '28',
  'elk.padding': CONTAINER_PADDING,
};

// A container's OWN body. Its children (subnets in a VPC, resources in a
// subnet) are mostly unconnected, so layered would stretch them into one long
// row; rectpacking instead packs them into a compact block near a target
// aspect ratio. A compound node uses its own options, not the root's.
const CONTAINER_LAYOUT: Record<string, string> = {
  'elk.algorithm': 'rectpacking',
  'elk.aspectRatio': '1.6',
  'elk.padding': CONTAINER_PADDING,
  'elk.spacing.nodeNode': '28',
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
      // A container with children: ELK sizes it to fit them plus the header
      // padding. An empty container: pin a compact explicit size so it neither
      // collapses nor overflows its parent.
      if (kids.length === 0) {
        return { id: n.id, width: EMPTY_BOX.width, height: EMPTY_BOX.height };
      }
      return { id: n.id, children: kids.map(toElk), layoutOptions: CONTAINER_LAYOUT };
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
