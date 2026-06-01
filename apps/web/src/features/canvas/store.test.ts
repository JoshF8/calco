import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from './store';

describe('canvas store', () => {
  beforeEach(() => useCanvasStore.getState().clear());

  it('assigns unique Terraform names per type', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_vpc');
    addResource('aws_vpc');
    addResource('aws_subnet');
    const names = useCanvasStore.getState().nodes.map((n) => n.data.name);
    expect(names).toEqual(['vpc_1', 'vpc_2', 'subnet_1']);
  });

  it('selects only the newly added node', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_vpc');
    addResource('aws_subnet');
    const selected = useCanvasStore.getState().nodes.filter((n) => n.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].data.name).toBe('subnet_1');
  });

  it('applies position changes from React Flow', () => {
    useCanvasStore.getState().addResource('aws_vpc');
    const id = useCanvasStore.getState().nodes[0].id;
    useCanvasStore.getState().onNodesChange([
      { id, type: 'position', position: { x: 123, y: 456 }, dragging: false },
    ]);
    expect(useCanvasStore.getState().nodes[0].position).toEqual({ x: 123, y: 456 });
  });

  it('applies removal changes from React Flow', () => {
    useCanvasStore.getState().addResource('aws_vpc');
    const id = useCanvasStore.getState().nodes[0].id;
    useCanvasStore.getState().onNodesChange([{ id, type: 'remove' }]);
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });

  it('sets, edits, and removes attributes', () => {
    useCanvasStore.getState().addResource('aws_vpc');
    const id = useCanvasStore.getState().nodes[0].id;

    useCanvasStore.getState().setAttribute(id, 'cidr_block', {
      kind: 'literal',
      litType: 'string',
      value: '10.0.0.0/16',
    });
    expect(useCanvasStore.getState().nodes[0].data.attributes.cidr_block).toEqual({
      kind: 'literal',
      litType: 'string',
      value: '10.0.0.0/16',
    });

    useCanvasStore.getState().removeAttribute(id, 'cidr_block');
    expect(useCanvasStore.getState().nodes[0].data.attributes.cidr_block).toBeUndefined();
  });

  it('renames a node', () => {
    useCanvasStore.getState().addResource('aws_vpc');
    const id = useCanvasStore.getState().nodes[0].id;
    useCanvasStore.getState().setNodeName(id, 'primary');
    expect(useCanvasStore.getState().nodes[0].data.name).toBe('primary');
  });

  it('attributes set via the store reach toApiModel', () => {
    useCanvasStore.getState().addResource('aws_vpc');
    const id = useCanvasStore.getState().nodes[0].id;
    useCanvasStore.getState().setAttribute(id, 'enabled', { kind: 'literal', litType: 'bool', value: 'true' });
    const model = useCanvasStore.getState().toApiModel();
    expect(model.resources![0].attributes).toEqual({
      enabled: { kind: 'literal', litType: 'bool', value: 'true' },
    });
  });

  it('creates container nodes with a type and size, leaves as resource nodes', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_vpc');
    addResource('aws_s3_bucket');
    const [vpc, bucket] = useCanvasStore.getState().nodes;
    expect(vpc.type).toBe('container');
    expect(vpc.width).toBe(400);
    expect(bucket.type).toBe('resource');
    expect(bucket.width).toBeUndefined();
  });

  it('nestNode sets parent and position without storing a ref, parent-first', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_vpc');
    addResource('aws_subnet');
    const vpc = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_vpc')!;
    const subnet = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_subnet')!;

    useCanvasStore.getState().nestNode(subnet.id, vpc.id, { x: 10, y: 30 });

    const nodes = useCanvasStore.getState().nodes;
    const s = nodes.find((n) => n.id === subnet.id)!;
    expect(s.parentId).toBe(vpc.id);
    expect(s.position).toEqual({ x: 10, y: 30 });
    // The containment ref is derived in toApiModel, not stored on the node.
    expect(s.data.attributes.vpc_id).toBeUndefined();
    // Parent must come before child.
    expect(nodes.findIndex((n) => n.id === vpc.id)).toBeLessThan(nodes.findIndex((n) => n.id === subnet.id));
  });

  it('unnestNode clears parent and position', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_vpc');
    addResource('aws_subnet');
    const vpc = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_vpc')!;
    const subnet = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_subnet')!;
    useCanvasStore.getState().nestNode(subnet.id, vpc.id, { x: 10, y: 30 });

    useCanvasStore.getState().unnestNode(subnet.id, { x: 500, y: 500 });

    const s = useCanvasStore.getState().nodes.find((n) => n.id === subnet.id)!;
    expect(s.parentId).toBeUndefined();
    expect(s.position).toEqual({ x: 500, y: 500 });
  });

  it('derives and removes the containment ref via toApiModel from parentId', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_vpc');
    addResource('aws_subnet');
    const vpc = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_vpc')!;
    const subnet = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_subnet')!;

    useCanvasStore.getState().nestNode(subnet.id, vpc.id, { x: 10, y: 30 });
    const sub = useCanvasStore.getState().toApiModel().resources!.find((r) => r.type === 'aws_subnet')!;
    expect(sub.attributes!.vpc_id).toEqual({ kind: 'ref', target: vpc.id, attribute: 'id' });

    useCanvasStore.getState().unnestNode(subnet.id, { x: 0, y: 0 });
    const after = useCanvasStore.getState().toApiModel().resources!.find((r) => r.type === 'aws_subnet')!;
    expect(after.attributes!.vpc_id).toBeUndefined();
  });

  it('toApiModel projects nodes into the wire shape', () => {
    useCanvasStore.getState().addResource('aws_vpc');
    const model = useCanvasStore.getState().toApiModel();
    expect(model.resources).toHaveLength(1);
    expect(model.resources![0].type).toBe('aws_vpc');
    expect(model.resources![0].name).toBe('vpc_1');
    expect(model.resources![0].attributes).toEqual({});
    expect(model.variables).toEqual([]);
    expect(model.outputs).toEqual([]);
  });
});
