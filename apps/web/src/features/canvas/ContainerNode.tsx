import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useCanvasStore } from './store';
import type { ResourceNodeData } from './ResourceNode';

// A container node (VPC, subnet): a resizable box that holds child resources.
// Its child nodes are separate React Flow nodes positioned within its bounds;
// this component just draws the frame and label. The body is translucent so
// nested children read clearly on top.
export function ContainerNode({ id, data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as ResourceNodeData;

  // Don't allow resizing smaller than the children: derive a minimum from
  // their bounding box (relative position + size) so a child can't be clipped
  // out of its container (React Flow renders children as transformed siblings
  // the parent div cannot clip).
  const nodes = useCanvasStore((s) => s.nodes);
  const children = nodes.filter((n) => n.parentId === id);
  const minWidth = children.reduce(
    (m, c) => Math.max(m, c.position.x + (c.measured?.width ?? c.width ?? 160) + 16),
    180,
  );
  const minHeight = children.reduce(
    (m, c) => Math.max(m, c.position.y + (c.measured?.height ?? c.height ?? 80) + 16),
    120,
  );

  return (
    <div
      className={cn(
        'h-full w-full rounded-lg border-2 bg-card/25',
        selected ? 'border-ring' : 'border-dashed border-border',
      )}
    >
      <NodeResizer isVisible={selected} minWidth={minWidth} minHeight={minHeight} />
      <div className="pointer-events-none px-2.5 pt-1.5">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t(`palette.resource.${d.type}`)}
        </div>
        <div className="font-mono text-xs font-medium text-foreground">
          {d.type}.{d.name}
        </div>
      </div>
    </div>
  );
}
