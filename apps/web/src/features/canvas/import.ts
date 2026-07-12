// Reconstructing a canvas from an imported model — the inverse of the store's
// toApiModel/deriveRefs. The importer endpoint returns a graph model whose
// resource attributes still carry their references (vpc_id, vpc_security_group_ids,
// role, …); this turns that flat, reference-carrying model back into the
// canvas's own shape: containers and leaves, nesting reconstructed from
// containment references, connection edges reconstructed from the rest, and
// literals left as editable attributes.
//
// It mirrors deriveRefs exactly, run backwards:
//   - a ref on the node's nest-rule attribute pointing at the right parent type
//     -> nesting (parentId), not an edge and not a stored attribute;
//   - any other ref (scalar) or all-ref list -> connection edge(s), carrying the
//     real argument / cardinality / referenced attribute so the edge behaves
//     like a hand-drawn one (and re-derives identically on export);
//   - anything else (a literal, or a list mixing literals and refs) -> kept in
//     the node's attributes, where the Inspector edits it.
//
// Positions are NOT set here (every node lands at the origin); auto-layout
// assigns them before the graph reaches the store. Known limitation: a
// visual-only nesting (RDS/LB inside a subnet, which emits no subnet_id) leaves
// no trace in the Terraform, so those import as free nodes — the information
// simply isn't there to recover.
import { MarkerType, type Edge } from '@xyflow/react';
import type { ApiAttrValue, ApiModel, ResourceNode } from './store';
import { containerSize, isContainer, nestRule } from './containment';

export interface Reconstructed {
  nodes: ResourceNode[];
  edges: Edge[];
}

interface RefItem {
  target: string;
  refAttr: string;
}

// refItems returns the reference targets of a value — one for a scalar ref, many
// for an all-ref list — or null when the value is a literal or a list that
// mixes literals and references (kept verbatim as an attribute instead).
function refItems(v: ApiAttrValue): { cardinality: 'scalar' | 'list'; items: RefItem[] } | null {
  if (v.kind === 'ref' && v.target) {
    return { cardinality: 'scalar', items: [{ target: v.target, refAttr: v.attribute ?? 'id' }] };
  }
  if (v.kind === 'list' && v.items && v.items.length > 0) {
    const items: RefItem[] = [];
    for (const it of v.items) {
      if (it.kind !== 'ref' || !it.target) return null; // not a pure list of refs
      items.push({ target: it.target, refAttr: it.attribute ?? 'id' });
    }
    return { cardinality: 'list', items };
  }
  return null;
}

function refEdge(source: string, target: string, attribute: string, cardinality: 'scalar' | 'list', refAttr: string): Edge {
  return {
    id: crypto.randomUUID(),
    source,
    target,
    type: 'ref',
    data: { attribute, cardinality, refAttr },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--xy-edge-stroke)' },
  };
}

/** modelToCanvas turns an imported API model into canvas nodes and edges. It is
 * the inverse of toApiModel: nesting and connections are read back out of the
 * model's reference attributes, and only literals remain as node attributes. */
export function modelToCanvas(model: ApiModel): Reconstructed {
  const resources = model.resources ?? [];
  const typeById = new Map(resources.map((r) => [r.id, r.type] as const));

  const nodes: ResourceNode[] = [];
  const edges: Edge[] = [];
  const parentOf = new Map<string, string>();

  for (const r of resources) {
    const rule = nestRule(r.type);
    const attributes: Record<string, ApiAttrValue> = {};

    for (const [name, value] of Object.entries(r.attributes ?? {})) {
      // Containment: the nest-rule attribute referencing the right parent type.
      if (
        rule?.attribute === name &&
        value.kind === 'ref' &&
        value.target &&
        typeById.get(value.target) === rule.parentType
      ) {
        parentOf.set(r.id, value.target);
        continue;
      }
      // A reference (or all-ref list) becomes one connection edge per target.
      const refs = refItems(value);
      if (refs) {
        for (const ref of refs.items) {
          if (!typeById.has(ref.target)) continue; // dangling; the parser filters these
          edges.push(refEdge(r.id, ref.target, name, refs.cardinality, ref.refAttr));
        }
        continue;
      }
      // A literal (or mixed list): an editable attribute.
      attributes[name] = value;
    }

    const container = isContainer(r.type);
    const size = container ? containerSize[r.type] : undefined;
    nodes.push({
      id: r.id,
      type: container ? 'container' : 'resource',
      position: { x: 0, y: 0 }, // auto-layout assigns real coordinates
      ...(size ? { width: size.width, height: size.height } : {}),
      data: { type: r.type, name: r.name, attributes },
    });
  }

  for (const n of nodes) {
    const parent = parentOf.get(n.id);
    if (parent) n.parentId = parent;
  }

  return { nodes, edges };
}
