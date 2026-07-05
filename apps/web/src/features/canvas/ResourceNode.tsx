import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { components } from '@/lib/types.gen';
import { cn } from '@/lib/utils';
import { ResourceIcon } from './icons';
import { useCanvasStore } from './store';

export interface ResourceNodeData extends Record<string, unknown> {
  type: string;
  name: string;
  attributes: Record<string, components['schemas']['AttrValue']>;
}

// A canvas node for one resource, drawn as calco's emblem: two offset paper
// sheets (the logo) with the icon on the front tile. The resource is shown in
// two languages — a human service label (eyebrow) over the name (hero), with
// the full Terraform address in mono beneath. Oxblood is spent only where two
// resources register: a handle terminating a real edge, or the top handle of a
// nested child (containment reference). Idle handles stay neutral.
export function ResourceNode({ id, data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as ResourceNodeData;
  const label = t(`palette.resource.${d.type}`);

  const edges = useCanvasStore((s) => s.edges);
  const nested = useCanvasStore((s) => Boolean(s.nodes.find((n) => n.id === id)?.parentId));
  const targetRegistered = nested || edges.some((e) => e.target === id);
  const sourceRegistered = edges.some((e) => e.source === id);

  const handleBase = '!h-2.5 !w-2.5 !rounded-full !border-2 !border-card transition-colors';
  const idle = '!bg-border group-hover:!bg-muted-foreground';
  const registered = '!bg-accent';

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-sm',
        'min-w-[196px] max-w-[264px] transition-[box-shadow,border-color]',
        selected
          ? 'border-transparent ring-2 ring-ring shadow-md'
          : 'border-border hover:border-muted-foreground/30 hover:shadow-md',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={cn(handleBase, targetRegistered ? registered : idle)}
      />

      {/* Emblem: front paper tile (glyph) + offset back sheet = the calco logo,
          one object, paper only — oxblood never touches it. */}
      <span className="relative h-10 w-10 shrink-0">
        <span
          aria-hidden="true"
          className="absolute bottom-0 right-0 h-9 w-9 rounded-md bg-muted ring-1 ring-inset ring-border"
        />
        <span className="absolute left-0 top-0 grid h-9 w-9 place-items-center rounded-md bg-secondary text-foreground ring-1 ring-inset ring-border/70">
          <ResourceIcon type={d.type} className="h-5 w-5" />
        </span>
      </span>

      {/* Two languages, human-first. */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[11px] font-medium leading-none text-muted-foreground">
          {label}
        </span>
        <span className="truncate text-sm font-medium leading-tight text-foreground">{d.name}</span>
        <span className="truncate font-mono text-[11px] leading-none text-muted-foreground">
          {d.type}.{d.name}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(handleBase, sourceRegistered ? registered : idle)}
      />
    </div>
  );
}
