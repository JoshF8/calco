import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { components } from '@/lib/types.gen';
import { cn } from '@/lib/utils';
import { connectionRule } from './connection';
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
// the full Terraform address in mono beneath. Oxblood is spent only where a
// connection registers: a handle terminating a real reference edge. Containment
// is shown by the node sitting inside its box, not by an oxblood handle, so
// nest and connect never look like the same act. Idle handles stay neutral.
export function ResourceNode({ id, data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as ResourceNodeData;
  const label = t(`palette.resource.${d.type}`);

  const edges = useCanvasStore((s) => s.edges);
  const targetRegistered = edges.some((e) => e.target === id);
  const sourceRegistered = edges.some((e) => e.source === id);

  // While a connection drag is in flight from another node, light up as a valid
  // target (a ruled reference exists) or dim as an invalid one — a visual "what
  // can connect" cue only; the drop is never gated (invalid drops still reach
  // onConnect and get their teaching refusal).
  const connectSource = useCanvasStore((s) => s.connectSource);
  const connecting = connectSource !== null && connectSource.id !== id;
  const validTarget = connecting && Boolean(connectionRule(connectSource.type, d.type));

  // A generous transparent hit area carries a small visible dot, so the target
  // is easy to grab without the dot looking clickably huge.
  const handleHit =
    '!h-4 !w-4 !min-h-0 !min-w-0 !border-0 !bg-transparent !cursor-crosshair flex items-center justify-center';
  const dotBase = 'h-2.5 w-2.5 rounded-full border-2 border-card transition-colors';
  const dotIdle = 'bg-muted-foreground/60 group-hover:bg-muted-foreground';
  const dotRegistered = 'bg-accent';

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-sm',
        'min-w-[196px] max-w-[264px] transition-[box-shadow,border-color,opacity]',
        connecting
          ? validTarget
            ? 'border-transparent ring-2 ring-foreground/60 shadow-md'
            : 'border-border opacity-40'
          : selected
            ? 'border-transparent ring-2 ring-ring shadow-md'
            : 'border-border hover:border-muted-foreground/30 hover:shadow-md',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        title={t('canvas.handle.connect')}
        className={handleHit}
      >
        <span aria-hidden="true" className={cn(dotBase, targetRegistered ? dotRegistered : dotIdle)} />
      </Handle>

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

      {/* Two languages, human-first. Eyebrow (service label), name (hero), and
          the Terraform address (mono) are differentiated by treatment so they
          read as a stack rather than three competing lines. */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="truncate text-sm font-medium leading-tight text-foreground">{d.name}</span>
        <span className="truncate font-mono text-[11px] leading-none text-muted-foreground/80">
          {d.type}.{d.name}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        title={t('canvas.handle.connect')}
        className={handleHit}
      >
        <span aria-hidden="true" className={cn(dotBase, sourceRegistered ? dotRegistered : dotIdle)} />
      </Handle>
    </div>
  );
}
