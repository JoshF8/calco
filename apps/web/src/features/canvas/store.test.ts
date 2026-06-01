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
