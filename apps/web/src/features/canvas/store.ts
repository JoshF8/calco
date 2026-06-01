// The canvas store is the frontend's single source of truth for the model
// being edited. It holds nodes and edges in React Flow's own shape and applies
// React Flow's change events through applyNodeChanges/applyEdgeChanges — this
// is what commits measured node dimensions back into the store, which the
// minimap and edge routing depend on. The API wire model is derived on demand
// via toApiModel, so the store never drifts from the generate contract.
import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import type { components } from '@/lib/types.gen';
import { shortType } from './catalog';
import { containerSize, isContainer, nestRule } from './containment';
import type { ResourceNodeData } from './ResourceNode';

export type ApiModel = components['schemas']['Model'];
export type ApiAttrValue = components['schemas']['AttrValue'];
// A node is either a free/leaf resource ('resource') or a container box
// ('container', e.g. VPC/subnet); both carry ResourceNodeData.
export type ResourceNode = Node<ResourceNodeData>;

interface CanvasState {
  nodes: ResourceNode[];
  edges: Edge[];
}

interface CanvasActions {
  /** addResource places a new resource of the given type with a unique
   * Terraform name and a non-overlapping position. */
  addResource: (type: string) => void;
  /** onNodesChange applies React Flow node change events (position, dimensions,
   * selection, removal) to the store. */
  onNodesChange: (changes: NodeChange<ResourceNode>[]) => void;
  /** onEdgesChange applies React Flow edge change events to the store. */
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  /** setNodeName renames a resource (its Terraform name slug). */
  setNodeName: (id: string, name: string) => void;
  /** setAttribute sets or replaces an attribute on a resource. */
  setAttribute: (id: string, key: string, value: ApiAttrValue) => void;
  /** removeAttribute deletes an attribute from a resource. */
  removeAttribute: (id: string, key: string) => void;
  /** nestNode places a node inside a container: sets its parent and its
   * container-relative position. The containment reference is NOT stored — it
   * is derived from parentId at projection time (toApiModel), so the visual
   * and the model can never diverge. */
  nestNode: (id: string, parentId: string, position: { x: number; y: number }) => void;
  /** unnestNode frees a node from its container: clears its parent and restores
   * its absolute position. */
  unnestNode: (id: string, position: { x: number; y: number }) => void;
  /** clear empties the canvas. */
  clear: () => void;
  /** toApiModel projects the canvas into the generate endpoint's wire shape. */
  toApiModel: () => ApiModel;
}

function uniqueName(nodes: ResourceNode[], type: string): string {
  // Ensure the base is a valid Terraform identifier start (letter/underscore);
  // a type whose slug begins with a digit (e.g. a hypothetical aws_3tier) would
  // otherwise produce a name the server rejects.
  let base = shortType(type);
  if (!/^[A-Za-z_]/.test(base)) base = `r_${base}`;
  const taken = new Set(nodes.filter((n) => n.data.type === type).map((n) => n.data.name));
  let n = 1;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// React Flow requires a parent node to appear before its children in the array.
// Sort by nesting depth (stable, so same-depth order is preserved).
function parentsFirst(nodes: ResourceNode[]): ResourceNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = (n: ResourceNode): number => {
    let d = 0;
    let cur: ResourceNode | undefined = n;
    while (cur?.parentId && d < 16) {
      d++;
      cur = byId.get(cur.parentId);
    }
    return d;
  };
  return [...nodes].sort((a, b) => depth(a) - depth(b));
}

function ref(targetId: string): ApiAttrValue {
  return { kind: 'ref', target: targetId, attribute: 'id' };
}

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
  nodes: [],
  edges: [],

  addResource: (type) =>
    set((s) => {
      const container = isContainer(type);
      // Spawn below the lowest top-level node so a new node never lands inside
      // an existing container's frame (containers are wider/taller than a grid
      // cell would account for).
      const topLevel = s.nodes.filter((n) => !n.parentId);
      const bottom = topLevel.reduce((m, n) => Math.max(m, n.position.y + (n.height ?? 84)), 40);
      const node: ResourceNode = {
        id: crypto.randomUUID(),
        type: container ? 'container' : 'resource',
        position: { x: 80, y: bottom + 40 },
        selected: true,
        ...(container ? { width: containerSize[type].width, height: containerSize[type].height } : {}),
        data: { type, name: uniqueName(s.nodes, type), attributes: {} },
      };
      // Deselect the others so the new node is the sole selection.
      const others = s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
      // New top-level node goes last; ordering by depth keeps it valid.
      return { nodes: parentsFirst([...others, node]) };
    }),

  onNodesChange: (changes) => set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  setNodeName: (id, name) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n)),
    })),

  setAttribute: (id, key, value) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, attributes: { ...n.data.attributes, [key]: value } } } : n,
      ),
    })),

  removeAttribute: (id, key) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n;
        const attributes = { ...n.data.attributes };
        delete attributes[key];
        return { ...n, data: { ...n.data, attributes } };
      }),
    })),

  nestNode: (id, parentId, position) =>
    set((s) => {
      const nodes = s.nodes.map((n) => (n.id === id ? { ...n, parentId, position } : n));
      return { nodes: parentsFirst(nodes) };
    }),

  unnestNode: (id, position) =>
    set((s) => {
      const nodes = s.nodes.map((n) => (n.id === id ? { ...n, parentId: undefined, position } : n));
      return { nodes: parentsFirst(nodes) };
    }),

  clear: () => set({ nodes: [], edges: [] }),

  toApiModel: () => {
    const s = get();
    return {
      resources: s.nodes.map((n) => {
        // Derive the containment reference from parentId — the single source of
        // truth — so it can never be edited away or drift from the visual.
        const attributes = { ...n.data.attributes };
        const rule = n.parentId ? nestRule(n.data.type) : undefined;
        if (rule && n.parentId) attributes[rule.attribute] = ref(n.parentId);
        return {
          id: n.id,
          type: n.data.type,
          name: n.data.name,
          attributes,
          position: { x: n.position.x, y: n.position.y },
        };
      }),
      // Canonical edge direction (matches the server's domain model and
      // TopologicalSort): from = the dependent resource (the one holding the
      // reference), to = the dependency. When a connect handler is added it
      // must map handles to this direction, regardless of which side the
      // user dragged from.
      edges: s.edges.map((e) => ({
        from: e.source,
        to: e.target,
        attribute: typeof e.data?.attribute === 'string' ? e.data.attribute : '',
      })),
      variables: [],
      outputs: [],
    };
  },
}));
