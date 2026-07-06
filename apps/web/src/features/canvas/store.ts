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
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import type { components } from '@/lib/types.gen';
import { shortType } from './catalog';
import { containerSize, isContainer, nestRule } from './containment';
import { connectionReasonKey, connectionRule, type ConnectionReason } from './connection';
import type { ResourceNodeData } from './ResourceNode';

export type ApiModel = components['schemas']['Model'];
export type ApiAttrValue = components['schemas']['AttrValue'];
// A node is either a free/leaf resource ('resource') or a container box
// ('container', e.g. VPC/subnet); both carry ResourceNodeData.
export type ResourceNode = Node<ResourceNodeData>;

/** A refused connection, surfaced transiently for the ConnectionHint. `at` is a
 * changing nonce so repeating the same refusal re-shows (and re-times) it. */
export type Rejection = ConnectionReason & { at: number };

/** The reference data a ruled connection carries on its edge. */
interface RefEdgeData extends Record<string, unknown> {
  attribute: string;
  cardinality: 'scalar' | 'list';
  refAttr: 'id' | 'arn' | 'name';
}

/** The node a connection drag is currently starting from, or null. Held so
 * every node can light up as a valid target (or dim as an invalid one) while
 * the drag is in flight — a purely visual affordance, never a gate. */
export interface ConnectSource {
  id: string;
  type: string;
}

interface CanvasState {
  nodes: ResourceNode[];
  edges: Edge[];
  /** The most recent refused connection, or null. */
  lastRejection: Rejection | null;
  /** The node a connection drag started from, while it is in flight. */
  connectSource: ConnectSource | null;
  /** The container a node drag is currently hovering as its nest target, while
   * the drag is in flight — so that container can light up and name the gesture
   * before the drop. Null when no drag would nest anywhere. */
  dropTargetId: string | null;
}

interface CanvasActions {
  /** addResource places a new resource of the given type with a unique
   * Terraform name and a non-overlapping position. */
  addResource: (type: string) => void;
  /** addResourceAt places a new resource at an explicit position (canvas drop),
   * optionally nested in a container (parentId) with the position taken as
   * container-relative — so a palette drop inside a VPC/subnet nests at once. */
  addResourceAt: (type: string, position: { x: number; y: number }, parentId?: string) => void;
  /** onNodesChange applies React Flow node change events (position, dimensions,
   * selection, removal) to the store. */
  onNodesChange: (changes: NodeChange<ResourceNode>[]) => void;
  /** onEdgesChange applies React Flow edge change events to the store. */
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  /** onConnect links two nodes when the user drags between their handles. The
   * pair is looked up in the typed connection rules (connection.ts): with no
   * rule the drag is refused and explained (lastRejection); with a rule the
   * edge is oriented by the rule (dependent -> dependency), never by drag
   * order, and stamped with the real argument/cardinality/refAttr. The edge is
   * the stored source of truth; the Terraform reference it implies is derived
   * in toApiModel, so it can never drift from the drawn connection. */
  onConnect: (connection: Connection) => void;
  /** reconnectEdge moves an existing connection's endpoint to a new node,
   * re-validating against the same typed rules as onConnect: a ruled pair is
   * re-oriented and re-stamped (keeping the edge id); an unruled or duplicate
   * pair is refused (lastRejection) and the edge is left untouched. */
  reconnectEdge: (oldEdge: Edge, connection: Connection) => void;
  /** clearRejection dismisses the transient connection-refusal hint. */
  clearRejection: () => void;
  /** showConnectionHint surfaces a plain i18n-key hint through the same
   * ConnectionHint channel a refusal uses — for feedback the drag itself can't
   * carry (e.g. released on empty pane, so onConnect never fired). */
  showConnectionHint: (key: string) => void;
  /** startConnect records the node a connection drag began from (by id), so
   * valid targets can be highlighted while the drag is in flight. Visual only. */
  startConnect: (nodeId: string | null) => void;
  /** endConnect clears the in-flight connection source. */
  endConnect: () => void;
  /** setDropTarget marks (or clears) the container a dragged node is currently
   * hovering as its nest target. Visual only — the actual nest happens on drop
   * (onNodeDragStop). A no-op when the value is unchanged, so the frequent
   * drag-move calls don't churn re-renders. */
  setDropTarget: (id: string | null) => void;
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
  /** loadExample seeds the canonical VPC + 2 subnets + 2 instances + SG graph
   * (the corrected version of the fidelity-feedback example), for the empty
   * state and as a living regression fixture. */
  loadExample: () => void;
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

// Fixed stacking order: containers sit behind leaf resources, and among
// containers a VPC sits behind a subnet — so a container is always a backdrop
// for what it holds and never covers or steals clicks from its children. Ranks
// are fixed by type (not live geometry or selection); the canvas also runs with
// elevateNodesOnSelect disabled so selecting a container can't lift it forward.
const containerZ: Record<string, number> = { aws_vpc: 0, aws_subnet: 1 };
function nodeZ(type: string): number {
  return isContainer(type) ? (containerZ[type] ?? 1) : 10;
}

// React Flow requires a parent node to appear before its children in the array.
// Sort by nesting depth (stable, so same-depth order is preserved), then stamp
// the fixed z so leaves always render above the containers holding them.
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
  return [...nodes]
    .sort((a, b) => depth(a) - depth(b))
    .map((n) => {
      const z = nodeZ(n.data.type);
      return n.zIndex === z ? n : { ...n, zIndex: z };
    });
}

function ref(targetId: string, refAttr: string = 'id'): ApiAttrValue {
  return { kind: 'ref', target: targetId, attribute: refAttr };
}

/** A reference derived from a single source of truth (a connection edge or the
 * node's containment), used both to project toApiModel and to show the
 * Inspector's Referencias section — one projection, so they can never disagree. */
export interface DerivedRef {
  /** The real Terraform argument this reference is written to. */
  attribute: string;
  /** The projected value: a scalar ref, or a list of refs. */
  value: ApiAttrValue;
  /** Where the reference comes from (drives provenance + how it is removed). */
  origin: 'connection' | 'nesting';
  /** The referenced target node ids, in order. */
  targetIds: string[];
  /** For connection refs, the edge id backing each target (parallel to
   * targetIds), so a single reference can be removed by deleting its edge. */
  edgeIds?: string[];
}

/** deriveRefs computes every reference a node projects, from the edges it is the
 * dependent of and from its containment. List-cardinality connections collapse
 * to one list argument (e.g. two SGs -> vpc_security_group_ids = [a.id, b.id]). */
export function deriveRefs(node: ResourceNode, edges: Edge[]): DerivedRef[] {
  const out: DerivedRef[] = [];

  // Containment: the node's scoping ref (vpc_id / subnet_id), when nested and
  // the nest rule carries an attribute (RDS/LB nest for grouping only).
  if (node.parentId) {
    const rule = nestRule(node.data.type);
    if (rule?.attribute) {
      out.push({
        attribute: rule.attribute,
        value: ref(node.parentId),
        origin: 'nesting',
        targetIds: [node.parentId],
      });
    }
  }

  // Connections: this node is the dependent (edge.source). Group by argument so
  // list-cardinality edges collapse into one tuple value.
  const byAttr = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.source !== node.id) continue;
    const d = e.data as Partial<RefEdgeData> | undefined;
    if (typeof d?.attribute !== 'string' || !d.attribute) continue;
    const group = byAttr.get(d.attribute);
    if (group) group.push(e);
    else byAttr.set(d.attribute, [e]);
  }
  for (const [attribute, group] of byAttr) {
    const d = group[0].data as RefEdgeData;
    const refAttr = d.refAttr ?? 'id';
    const targetIds = group.map((e) => e.target);
    const edgeIds = group.map((e) => e.id);
    const value: ApiAttrValue =
      d.cardinality === 'list'
        ? { kind: 'list', items: targetIds.map((t) => ref(t, refAttr)) }
        : ref(targetIds[0], refAttr);
    out.push({ attribute, value, origin: 'connection', targetIds, edgeIds });
  }

  return out;
}

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
  nodes: [],
  edges: [],
  lastRejection: null,
  connectSource: null,
  dropTargetId: null,

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

  addResourceAt: (type, position, parentId) =>
    set((s) => {
      const container = isContainer(type);
      const node: ResourceNode = {
        id: crypto.randomUUID(),
        type: container ? 'container' : 'resource',
        position,
        selected: true,
        ...(parentId ? { parentId } : {}),
        ...(container ? { width: containerSize[type].width, height: containerSize[type].height } : {}),
        data: { type, name: uniqueName(s.nodes, type), attributes: {} },
      };
      const others = s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
      // parentsFirst keeps a parent before its children and re-stamps the fixed z.
      return { nodes: parentsFirst([...others, node]) };
    }),

  onNodesChange: (changes) => set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  onConnect: ({ source, target }) =>
    set((s) => {
      if (!source || !target) return {};
      // A resource dragged onto its own other handle (possible in loose mode):
      // say so, rather than doing nothing.
      if (source === target) return { lastRejection: { key: 'connection.invalid.self', at: Date.now() } };
      const src = s.nodes.find((n) => n.id === source);
      const tgt = s.nodes.find((n) => n.id === target);
      if (!src || !tgt) return {};

      // The typed rule fixes everything: whether the pair is a valid reference,
      // which resource is the dependent, the real argument, its cardinality and
      // the referenced attribute — none of it decided by which handle was
      // dragged. Unruled pairs are refused with a reason, never invented.
      const rule = connectionRule(src.data.type, tgt.data.type);
      if (!rule) {
        return { lastRejection: { ...connectionReasonKey(src.data.type, tgt.data.type), at: Date.now() } };
      }
      // Orient by the rule: dependent holds the argument, dependency is referenced.
      const dependent = src.data.type === rule.from ? source : target;
      const dependency = dependent === source ? target : source;
      // One edge per ordered dependent -> dependency pair. A repeated list edge
      // (a second SG) is a *different* pair and is allowed; a true duplicate is
      // a gentle no-op, said out loud rather than swallowed silently.
      if (s.edges.some((e) => e.source === dependent && e.target === dependency)) {
        return { lastRejection: { key: 'connection.invalid.duplicate', at: Date.now() } };
      }
      const data: RefEdgeData = {
        attribute: rule.attribute,
        cardinality: rule.cardinality,
        refAttr: rule.refAttr,
      };
      const edge: Edge = {
        id: crypto.randomUUID(),
        source: dependent,
        target: dependency,
        type: 'ref',
        data,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--xy-edge-stroke)' },
      };
      return { edges: [...s.edges, edge], lastRejection: null };
    }),

  reconnectEdge: (oldEdge, { source, target }) =>
    set((s) => {
      if (!source || !target) return {};
      if (source === target) return { lastRejection: { key: 'connection.invalid.self', at: Date.now() } };
      const src = s.nodes.find((n) => n.id === source);
      const tgt = s.nodes.find((n) => n.id === target);
      if (!src || !tgt) return {};
      // Same typed-rule gate as onConnect — a reconnection is a new connection
      // for the moved endpoint, so it must re-validate and re-orient, never
      // inherit the old edge's argument for a pair the rule wouldn't allow.
      const rule = connectionRule(src.data.type, tgt.data.type);
      if (!rule) {
        return { lastRejection: { ...connectionReasonKey(src.data.type, tgt.data.type), at: Date.now() } };
      }
      const dependent = src.data.type === rule.from ? source : target;
      const dependency = dependent === source ? target : source;
      // Dedup as in onConnect, but ignore the edge being reconnected.
      if (s.edges.some((e) => e.id !== oldEdge.id && e.source === dependent && e.target === dependency)) {
        return { lastRejection: { key: 'connection.invalid.duplicate', at: Date.now() } };
      }
      const data: RefEdgeData = { attribute: rule.attribute, cardinality: rule.cardinality, refAttr: rule.refAttr };
      return {
        edges: s.edges.map((e) => (e.id === oldEdge.id ? { ...e, source: dependent, target: dependency, data } : e)),
        lastRejection: null,
      };
    }),

  clearRejection: () => set({ lastRejection: null }),

  showConnectionHint: (key) => set({ lastRejection: { key, at: Date.now() } }),

  startConnect: (nodeId) =>
    set((s) => {
      const node = nodeId ? s.nodes.find((n) => n.id === nodeId) : undefined;
      return { connectSource: node ? { id: node.id, type: node.data.type } : null };
    }),

  endConnect: () => set({ connectSource: null }),

  setDropTarget: (id) => set((s) => (s.dropTargetId === id ? {} : { dropTargetId: id })),

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

  clear: () => set({ nodes: [], edges: [], lastRejection: null }),

  loadExample: () =>
    set(() => {
      const mk = (
        type: string,
        name: string,
        position: { x: number; y: number },
        size?: { width: number; height: number },
        parentId?: string,
      ): ResourceNode => ({
        id: crypto.randomUUID(),
        type: isContainer(type) ? 'container' : 'resource',
        position,
        ...(size ?? {}),
        ...(parentId ? { parentId } : {}),
        data: { type, name, attributes: {} },
      });

      const vpc = mk('aws_vpc', 'vpc_1', { x: 80, y: 60 }, { width: 560, height: 340 });
      const sub1 = mk('aws_subnet', 'subnet_1', { x: 16, y: 52 }, { width: 250, height: 190 }, vpc.id);
      const sub2 = mk('aws_subnet', 'subnet_2', { x: 288, y: 52 }, { width: 250, height: 190 }, vpc.id);
      const sg = mk('aws_security_group', 'security_group_1', { x: 20, y: 262 }, undefined, vpc.id);
      const i1 = mk('aws_instance', 'instance_1', { x: 18, y: 64 }, undefined, sub1.id);
      const i2 = mk('aws_instance', 'instance_2', { x: 18, y: 64 }, undefined, sub2.id);

      // Both instances reference the SG via the real list argument.
      const rule = connectionRule('aws_instance', 'aws_security_group')!;
      const link = (instanceId: string): Edge => ({
        id: crypto.randomUUID(),
        source: instanceId,
        target: sg.id,
        type: 'ref',
        data: { attribute: rule.attribute, cardinality: rule.cardinality, refAttr: rule.refAttr } as RefEdgeData,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--xy-edge-stroke)' },
      });

      return {
        nodes: parentsFirst([vpc, sub1, sub2, sg, i1, i2]),
        edges: [link(i1.id), link(i2.id)],
        lastRejection: null,
      };
    }),

  toApiModel: () => {
    const s = get();
    return {
      resources: s.nodes.map((n) => {
        // Derive references from the single sources of truth — connections
        // (edges) and containment (parentId) — via the same deriveRefs used by
        // the Inspector, so a ref can never be edited away or drift from what
        // the canvas shows, and the two panels can never disagree.
        const attributes = { ...n.data.attributes };
        for (const dr of deriveRefs(n, s.edges)) attributes[dr.attribute] = dr.value;
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
