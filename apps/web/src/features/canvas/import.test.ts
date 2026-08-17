import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { useCanvasStore, type ApiAttrValue, type ApiModel, type ResourceNode } from './store';
import { EXAMPLES } from './examples';
import { modelToCanvas } from './import';

const lit = (value: string): ApiAttrValue => ({ kind: 'literal', litType: 'string', value });
const ref = (target: string, attribute = 'id'): ApiAttrValue => ({ kind: 'ref', target, attribute });

describe('modelToCanvas', () => {
  it('reconstructs nesting, connection edges, and literals', () => {
    const model: ApiModel = {
      resources: [
        { id: 'v', type: 'aws_vpc', name: 'main', attributes: { cidr_block: lit('10.0.0.0/16') } },
        { id: 's', type: 'aws_subnet', name: 'a', attributes: { vpc_id: ref('v') } },
        { id: 'g', type: 'aws_security_group', name: 'web', attributes: { vpc_id: ref('v') } },
        {
          id: 'i',
          type: 'aws_instance',
          name: 'web',
          attributes: {
            instance_type: lit('t3.micro'),
            subnet_id: ref('s'),
            vpc_security_group_ids: { kind: 'list', items: [ref('g')] },
          },
        },
      ],
    };

    const { nodes, edges } = modelToCanvas(model);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

    // Containment references become nesting, not attributes.
    expect(byId.s.parentId).toBe('v');
    expect(byId.g.parentId).toBe('v');
    expect(byId.i.parentId).toBe('s');
    expect(byId.s.data.attributes.vpc_id).toBeUndefined();
    expect(byId.i.data.attributes.subnet_id).toBeUndefined();

    // Literals stay as editable attributes.
    expect(byId.i.data.attributes.instance_type?.value).toBe('t3.micro');
    expect(byId.v.data.attributes.cidr_block?.value).toBe('10.0.0.0/16');

    // The remaining reference becomes a connection edge.
    const e = edges.find((x) => x.source === 'i' && x.target === 'g');
    expect(e, 'instance -> security group edge').toBeDefined();
    expect((e!.data as { attribute: string }).attribute).toBe('vpc_security_group_ids');
    expect((e!.data as { cardinality: string }).cardinality).toBe('list');

    // Containers are sized (VPC/subnet); leaves are not.
    expect(byId.v.type).toBe('container');
    expect(byId.v.width).toBeGreaterThan(0);
    expect(byId.i.type).toBe('resource');
  });

  it('keeps a non-resource / dangling reference from becoming an edge', () => {
    // A ref whose target is not among the imported resources is dropped (the
    // parser already filters var/data/module, this is belt-and-braces).
    const model: ApiModel = {
      resources: [{ id: 'a', type: 'aws_instance', name: 'x', attributes: { foo: ref('missing') } }],
    };
    const { nodes, edges } = modelToCanvas(model);
    expect(edges).toHaveLength(0);
    expect(nodes[0].data.attributes.foo).toBeUndefined(); // not kept as a literal either
  });

  it('renders local modules as boxes with their resources nested inside', () => {
    const model: ApiModel = {
      resources: [
        { id: 'v', type: 'aws_vpc', name: 'main', attributes: {} },
        { id: 's', type: 'aws_subnet', name: 'a', attributes: { vpc_id: ref('v') } },
        { id: 'root', type: 'aws_s3_bucket', name: 'logs', attributes: {} },
      ],
      modules: [
        {
          id: 'mod-1',
          name: 'vpc',
          source: './modules/vpc',
          local: true,
          arguments: { name: lit('prod') },
          resources: ['v', 's'],
        },
      ],
    };

    const { nodes, edges } = modelToCanvas(model);
    const mod = nodes.find((n) => n.id === 'mod-1')!;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

    // Module node: read-only box carrying the invocation name and source.
    expect(mod.type).toBe('module');
    expect(mod.selectable).toBe(false);
    expect(mod.data).toMatchObject({ kind: 'module', type: 'module', name: 'vpc', source: './modules/vpc' });
    expect(mod.data.attributes.name?.value).toBe('prod');

    // Its resources are parented to the box; containment still nests within a
    // module, so the subnet sits in the VPC that sits in the module.
    expect(byId.v.parentId).toBe('mod-1');
    expect(byId.s.parentId).toBe('v');
    // Resources outside any module stay free.
    expect(byId.root.parentId).toBeUndefined();

    // Module grouping is not a reference: it creates no edges.
    expect(edges).toHaveLength(0);
  });
});

// The canvas round-trip, mirror of the server's Import(Generate(M)) test: every
// example, projected to the API model and reconstructed, must reproduce the same
// topology — node addresses, nesting, and edges — up to node identity and
// position. This ties toApiModel and modelToCanvas together.

function addressBook(nodes: ResourceNode[]): Map<string, string> {
  return new Map(nodes.map((n) => [n.id, `${n.data.type}.${n.data.name}`]));
}

function canonVal(v: ApiAttrValue): string {
  if (v.kind === 'literal') return `lit:${v.litType}:${v.value}`;
  if (v.kind === 'ref') return `ref:${v.target}.${v.attribute}`;
  if (v.kind === 'list') return `list[${(v.items ?? []).map(canonVal).join(',')}]`;
  return '?';
}

function canonNodes(nodes: ResourceNode[]): Record<string, { parent: string | null; attrs: Record<string, string> }> {
  const addr = addressBook(nodes);
  const out: Record<string, { parent: string | null; attrs: Record<string, string> }> = {};
  for (const n of nodes) {
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(n.data.attributes)) attrs[k] = canonVal(v);
    out[`${n.data.type}.${n.data.name}`] = { parent: n.parentId ? addr.get(n.parentId) ?? n.parentId : null, attrs };
  }
  return out;
}

function canonEdges(nodes: ResourceNode[], edges: Edge[]): string[] {
  const addr = addressBook(nodes);
  return edges
    .map((e) => {
      const d = e.data as { attribute?: string; cardinality?: string; refAttr?: string } | undefined;
      return `${addr.get(e.source) ?? e.source} -> ${addr.get(e.target) ?? e.target} : ${d?.attribute}/${d?.cardinality}/${d?.refAttr}`;
    })
    .sort();
}

describe('canvas round-trip', () => {
  it('every example survives toApiModel -> modelToCanvas unchanged in topology', () => {
    for (const ex of EXAMPLES) {
      useCanvasStore.getState().loadExample(ex.id);
      const origNodes = useCanvasStore.getState().nodes;
      const origEdges = useCanvasStore.getState().edges;

      const recon = modelToCanvas(useCanvasStore.getState().toApiModel());

      // Keying on ex.id makes a failure name the offending example in the diff.
      expect({ id: ex.id, nodes: canonNodes(recon.nodes) }).toEqual({ id: ex.id, nodes: canonNodes(origNodes) });
      expect({ id: ex.id, edges: canonEdges(recon.nodes, recon.edges) }).toEqual({
        id: ex.id,
        edges: canonEdges(origNodes, origEdges),
      });
    }
  });
});
