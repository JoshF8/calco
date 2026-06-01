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
import type { ResourceNodeData } from './ResourceNode';

export type ApiModel = components['schemas']['Model'];
export type ApiAttrValue = components['schemas']['AttrValue'];
export type ResourceNode = Node<ResourceNodeData, 'resource'>;

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

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
  nodes: [],
  edges: [],

  addResource: (type) =>
    set((s) => {
      const count = s.nodes.length;
      const node: ResourceNode = {
        id: crypto.randomUUID(),
        type: 'resource',
        position: { x: 80 + (count % 4) * 230, y: 80 + Math.floor(count / 4) * 150 },
        selected: true,
        data: { type, name: uniqueName(s.nodes, type), attributes: {} },
      };
      // Deselect the others so the new node is the sole selection.
      const others = s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
      return { nodes: [...others, node] };
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

  clear: () => set({ nodes: [], edges: [] }),

  toApiModel: () => {
    const s = get();
    return {
      resources: s.nodes.map((n) => ({
        id: n.id,
        type: n.data.type,
        name: n.data.name,
        attributes: n.data.attributes,
        position: { x: n.position.x, y: n.position.y },
      })),
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
