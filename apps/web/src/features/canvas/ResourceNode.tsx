import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { components } from '@/lib/types.gen';
import { cn } from '@/lib/utils';

export interface ResourceNodeData extends Record<string, unknown> {
  type: string;
  name: string;
  attributes: Record<string, components['schemas']['AttrValue']>;
}

// A canvas node representing one resource. The label is resolved from i18n by
// type at render time, so it follows the active language. Connection handles
// are present for the (future) reference-drawing flow.
export function ResourceNode({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as ResourceNodeData;
  const label = t(`palette.resource.${d.type}`);
  return (
    <div
      className={cn(
        'min-w-[168px] rounded-md border bg-card px-3 py-2 shadow-sm transition-shadow',
        selected ? 'ring-2 ring-ring' : 'hover:shadow-md',
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-muted-foreground" />
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-medium text-foreground">
        {d.type}.{d.name}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-muted-foreground" />
    </div>
  );
}
