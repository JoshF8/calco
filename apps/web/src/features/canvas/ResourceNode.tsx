import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { components } from '@/lib/types.gen';
import { cn } from '@/lib/utils';

export interface ResourceNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  name: string;
  attributes: Record<string, components['schemas']['AttrValue']>;
}

// A canvas node representing one resource. Connection handles are present for
// the (future) reference-drawing flow; the greenfield MVP only places nodes.
export function ResourceNode({ data, selected }: NodeProps) {
  const d = data as ResourceNodeData;
  return (
    <div
      className={cn(
        'min-w-[168px] rounded-md border bg-card px-3 py-2 shadow-sm transition-shadow',
        selected ? 'ring-2 ring-ring' : 'hover:shadow-md',
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-muted-foreground" />
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{d.label}</div>
      <div className="font-mono text-sm font-medium text-foreground">
        {d.type}.{d.name}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-muted-foreground" />
    </div>
  );
}
