import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from './store';
import { containerSize } from './containment';

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
    expect(vpc.width).toBe(containerSize.aws_vpc.width);
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

  it('stacks containers behind leaves with a fixed z-order (vpc < subnet < resource)', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_vpc');
    addResource('aws_subnet');
    addResource('aws_instance');
    const z = Object.fromEntries(
      useCanvasStore.getState().nodes.map((n) => [n.data.type, n.zIndex]),
    );
    // Fixed order: vpc (0) behind subnet (1) behind leaf resources (10).
    expect(z.aws_vpc).toBe(0);
    expect(z.aws_subnet).toBe(1);
    expect(z.aws_instance).toBe(10);
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

  it('onConnect encodes the real AWS argument via the typed rule', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_instance');
    addResource('aws_security_group');
    const inst = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_instance')!;
    const sg = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_security_group')!;

    useCanvasStore.getState().onConnect({ source: inst.id, target: sg.id, sourceHandle: null, targetHandle: null });

    const edges = useCanvasStore.getState().edges;
    expect(edges).toHaveLength(1);
    // The instance is the dependent; the argument is the real, list-cardinality one.
    expect(edges[0]).toMatchObject({
      source: inst.id,
      target: sg.id,
      type: 'ref',
      data: { attribute: 'vpc_security_group_ids', cardinality: 'list', refAttr: 'id' },
    });

    // The edge is the single source of truth; the ref is derived as a list on
    // the dependent, matching what terraform validate expects.
    const instR = useCanvasStore.getState().toApiModel().resources!.find((r) => r.id === inst.id)!;
    expect(instR.attributes!.vpc_security_group_ids).toEqual({
      kind: 'list',
      items: [{ kind: 'ref', target: sg.id, attribute: 'id' }],
    });
    // No invented scalar security_group_id, on either resource.
    expect(instR.attributes!.security_group_id).toBeUndefined();

    // Removing the edge removes the derived ref — no drift.
    useCanvasStore.getState().onEdgesChange([{ type: 'remove', id: edges[0].id }]);
    const after = useCanvasStore.getState().toApiModel().resources!.find((r) => r.id === inst.id)!;
    expect(after.attributes!.vpc_security_group_ids).toBeUndefined();
  });

  it('onConnect orients by the rule regardless of drag direction', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_instance');
    addResource('aws_security_group');
    const inst = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_instance')!;
    const sg = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_security_group')!;

    // Dragged sg -> instance, but the rule makes the instance the dependent.
    useCanvasStore.getState().onConnect({ source: sg.id, target: inst.id, sourceHandle: null, targetHandle: null });

    const edge = useCanvasStore.getState().edges[0];
    expect(edge).toMatchObject({ source: inst.id, target: sg.id, data: { attribute: 'vpc_security_group_ids' } });
  });

  it('collapses two security groups into one list argument', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_instance');
    addResource('aws_security_group');
    addResource('aws_security_group');
    const inst = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_instance')!;
    const [sg1, sg2] = useCanvasStore.getState().nodes.filter((n) => n.data.type === 'aws_security_group');
    const connect = (source: string, target: string) =>
      useCanvasStore.getState().onConnect({ source, target, sourceHandle: null, targetHandle: null });

    connect(inst.id, sg1.id);
    connect(inst.id, sg2.id);

    expect(useCanvasStore.getState().edges).toHaveLength(2);
    const instR = useCanvasStore.getState().toApiModel().resources!.find((r) => r.id === inst.id)!;
    expect(instR.attributes!.vpc_security_group_ids).toEqual({
      kind: 'list',
      items: [
        { kind: 'ref', target: sg1.id, attribute: 'id' },
        { kind: 'ref', target: sg2.id, attribute: 'id' },
      ],
    });
  });

  it('encodes a scalar ref with the referenced attribute (lambda role -> arn)', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_lambda_function');
    addResource('aws_iam_role');
    const fn = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_lambda_function')!;
    const role = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_iam_role')!;

    useCanvasStore.getState().onConnect({ source: fn.id, target: role.id, sourceHandle: null, targetHandle: null });

    const fnR = useCanvasStore.getState().toApiModel().resources!.find((r) => r.id === fn.id)!;
    expect(fnR.attributes!.role).toEqual({ kind: 'ref', target: role.id, attribute: 'arn' });
  });

  it('refuses unruled pairs and records a reason instead of an edge', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_instance');
    addResource('aws_instance');
    const [i1, i2] = useCanvasStore.getState().nodes;

    useCanvasStore.getState().onConnect({ source: i1.id, target: i2.id, sourceHandle: null, targetHandle: null });

    expect(useCanvasStore.getState().edges).toHaveLength(0);
    expect(useCanvasStore.getState().lastRejection?.key).toBe('connection.invalid.sameType');
  });

  it('refuses a containment pair and points to the nest gesture', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_subnet');
    addResource('aws_vpc');
    const subnet = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_subnet')!;
    const vpc = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_vpc')!;

    useCanvasStore.getState().onConnect({ source: subnet.id, target: vpc.id, sourceHandle: null, targetHandle: null });

    expect(useCanvasStore.getState().edges).toHaveLength(0);
    expect(useCanvasStore.getState().lastRejection?.key).toBe('connection.invalid.useContainment');
  });

  it('nesting RDS is visual-only: no invented subnet_id argument', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_subnet');
    addResource('aws_db_instance');
    const subnet = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_subnet')!;
    const rds = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_db_instance')!;

    useCanvasStore.getState().nestNode(rds.id, subnet.id, { x: 10, y: 30 });

    const rdsR = useCanvasStore.getState().toApiModel().resources!.find((r) => r.id === rds.id)!;
    expect(rdsR.attributes!.subnet_id).toBeUndefined();
    expect(rdsR.attributes).toEqual({});
  });

  it('onConnect ignores self-links and duplicate pairs', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_instance');
    addResource('aws_security_group');
    const inst = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_instance')!;
    const sg = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_security_group')!;
    const connect = (source: string, target: string) =>
      useCanvasStore.getState().onConnect({ source, target, sourceHandle: null, targetHandle: null });

    connect(inst.id, inst.id); // self-link
    expect(useCanvasStore.getState().edges).toHaveLength(0);

    connect(inst.id, sg.id);
    connect(inst.id, sg.id); // duplicate pair
    expect(useCanvasStore.getState().edges).toHaveLength(1);
  });

  it('explains a duplicate connection instead of silently swallowing it', () => {
    const { addResource } = useCanvasStore.getState();
    addResource('aws_instance');
    addResource('aws_security_group');
    const inst = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_instance')!;
    const sg = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_security_group')!;
    const connect = (source: string, target: string) =>
      useCanvasStore.getState().onConnect({ source, target, sourceHandle: null, targetHandle: null });

    connect(inst.id, sg.id);
    connect(inst.id, sg.id); // duplicate
    expect(useCanvasStore.getState().lastRejection?.key).toBe('connection.invalid.duplicate');
  });

  it('explains a self connection instead of doing nothing', () => {
    useCanvasStore.getState().addResource('aws_instance');
    const inst = useCanvasStore.getState().nodes[0];

    useCanvasStore.getState().onConnect({ source: inst.id, target: inst.id, sourceHandle: null, targetHandle: null });

    expect(useCanvasStore.getState().edges).toHaveLength(0);
    expect(useCanvasStore.getState().lastRejection?.key).toBe('connection.invalid.self');
  });

  it('showConnectionHint surfaces an arbitrary key through the rejection channel', () => {
    useCanvasStore.getState().showConnectionHint('connection.hint.dropOnDot');
    expect(useCanvasStore.getState().lastRejection?.key).toBe('connection.hint.dropOnDot');
  });

  it('addResourceAt places a node at a position, optionally nested', () => {
    const { addResource, addResourceAt } = useCanvasStore.getState();
    addResource('aws_vpc');
    const vpc = useCanvasStore.getState().nodes[0];

    addResourceAt('aws_subnet', { x: 20, y: 30 }, vpc.id);
    const subnet = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_subnet')!;
    expect(subnet.position).toEqual({ x: 20, y: 30 });
    expect(subnet.parentId).toBe(vpc.id);
    expect(subnet.type).toBe('container');
    expect(subnet.data.name).toBe('subnet_1');
    // The drop selects the new node and deselects the rest.
    const selected = useCanvasStore.getState().nodes.filter((n) => n.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe(subnet.id);

    // Dropped free (no parent): lands at the given point, top-level.
    addResourceAt('aws_s3_bucket', { x: 400, y: 400 });
    const bucket = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_s3_bucket')!;
    expect(bucket.parentId).toBeUndefined();
    expect(bucket.position).toEqual({ x: 400, y: 400 });
  });

  it('reconnectEdge moves a connection to a new valid target, re-stamping and keeping id', () => {
    const { addResource, onConnect, reconnectEdge } = useCanvasStore.getState();
    addResource('aws_instance');
    addResource('aws_security_group');
    addResource('aws_security_group');
    const inst = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_instance')!;
    const [sg1, sg2] = useCanvasStore.getState().nodes.filter((n) => n.data.type === 'aws_security_group');

    onConnect({ source: inst.id, target: sg1.id, sourceHandle: null, targetHandle: null });
    const edge = useCanvasStore.getState().edges[0];

    reconnectEdge(edge, { source: inst.id, target: sg2.id, sourceHandle: null, targetHandle: null });
    const after = useCanvasStore.getState().edges;
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(edge.id);
    expect(after[0]).toMatchObject({
      source: inst.id,
      target: sg2.id,
      data: { attribute: 'vpc_security_group_ids', cardinality: 'list', refAttr: 'id' },
    });
    // The derived ref follows the reconnected edge — no drift.
    const instR = useCanvasStore.getState().toApiModel().resources!.find((r) => r.id === inst.id)!;
    expect(instR.attributes!.vpc_security_group_ids).toEqual({
      kind: 'list',
      items: [{ kind: 'ref', target: sg2.id, attribute: 'id' }],
    });
  });

  it('reconnectEdge refuses an unruled target and leaves the edge untouched', () => {
    const { addResource, onConnect, reconnectEdge } = useCanvasStore.getState();
    addResource('aws_instance');
    addResource('aws_security_group');
    addResource('aws_s3_bucket');
    const inst = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_instance')!;
    const sg = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_security_group')!;
    const bucket = useCanvasStore.getState().nodes.find((n) => n.data.type === 'aws_s3_bucket')!;

    onConnect({ source: inst.id, target: sg.id, sourceHandle: null, targetHandle: null });
    const edge = useCanvasStore.getState().edges[0];

    reconnectEdge(edge, { source: inst.id, target: bucket.id, sourceHandle: null, targetHandle: null });
    const after = useCanvasStore.getState().edges;
    expect(after).toHaveLength(1);
    expect(after[0].target).toBe(sg.id); // unchanged
    expect(useCanvasStore.getState().lastRejection?.key).toBe('connection.invalid.s3');
  });

  it('startConnect records the source node type; endConnect clears it', () => {
    useCanvasStore.getState().addResource('aws_instance');
    const inst = useCanvasStore.getState().nodes[0];

    useCanvasStore.getState().startConnect(inst.id);
    expect(useCanvasStore.getState().connectSource).toEqual({ id: inst.id, type: 'aws_instance' });

    useCanvasStore.getState().endConnect();
    expect(useCanvasStore.getState().connectSource).toBeNull();

    // A drag with no origin node (null) records nothing.
    useCanvasStore.getState().startConnect(null);
    expect(useCanvasStore.getState().connectSource).toBeNull();
  });

  it('loadExample seeds the canonical graph with list SG references', () => {
    useCanvasStore.getState().loadExample();
    const model = useCanvasStore.getState().toApiModel();
    const instances = model.resources!.filter((r) => r.type === 'aws_instance');
    expect(instances).toHaveLength(2);
    for (const inst of instances) {
      const sgs = inst.attributes!.vpc_security_group_ids;
      expect(sgs?.kind).toBe('list');
      expect(sgs?.items).toHaveLength(1);
    }
    // The SG is scoped to the VPC by nesting (real vpc_id), not by a connection.
    const sg = model.resources!.find((r) => r.type === 'aws_security_group')!;
    expect(sg.attributes!.vpc_id?.kind).toBe('ref');
  });
});
