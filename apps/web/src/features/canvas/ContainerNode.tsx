import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ResourceNodeData } from './ResourceNode';

// A container node (VPC, subnet): a resizable box that holds child resources.
// Its child nodes are separate React Flow nodes positioned within its bounds;
// this component just draws the frame and label. The body is translucent so
// nested children read clearly on top.
export function ContainerNode({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as ResourceNodeData;
  return (
    <div
      className={cn(
        'h-full w-full rounded-lg border-2 bg-card/25',
        selected ? 'border-ring' : 'border-dashed border-border',
      )}
    >
      <NodeResizer isVisible={selected} minWidth={180} minHeight={120} />
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
