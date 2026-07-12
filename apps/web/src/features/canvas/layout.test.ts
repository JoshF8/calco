import { describe, expect, it } from 'vitest';
import { useCanvasStore, type ResourceNode } from './store';
import { layout } from './layout';

const posKey = (ns: ResourceNode[]): string[] =>
  ns.map((n) => `${n.id}:${n.position.x},${n.position.y}`).sort();

describe('layout', () => {
  it('positions every node, sizes containers, and is deterministic', async () => {
    // The web example nests two subnets (each with an instance) and a security
    // group inside a VPC — a real compound graph for ELK.
    useCanvasStore.getState().loadExample('web');
    const nodes = useCanvasStore.getState().nodes;
    const edges = useCanvasStore.getState().edges;

    const placed = await layout(nodes, edges);
    expect(placed).toHaveLength(nodes.length);

    for (const n of placed) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }

    // Containers (VPC/subnet) come back sized to fit their children.
    for (const n of placed.filter((x) => x.type === 'container')) {
      expect(n.width ?? 0).toBeGreaterThan(0);
      expect(n.height ?? 0).toBeGreaterThan(0);
    }

    // Same input → same layout.
    const again = await layout(nodes, edges);
    expect(posKey(placed)).toEqual(posKey(again));
  });

  it('returns an empty graph unchanged', async () => {
    expect(await layout([], [])).toEqual([]);
  });
});
