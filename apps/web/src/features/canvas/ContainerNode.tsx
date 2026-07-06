import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ResourceIcon } from './icons';
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

  // A container is never a connection target (its relationships are containment,
  // set by dropping resources inside). While a connection drag is in flight,
  // dim it so the eye goes to the resource dots that can actually receive it.
  const connecting = useCanvasStore((s) => s.connectSource !== null);

  return (
    <div
      className={cn(
        'relative h-full w-full rounded-lg border-2 bg-card/25 transition-opacity',
        connecting ? 'border-dashed border-border opacity-40' : selected ? 'border-ring' : 'border-dashed border-border',
      )}
    >
      <NodeResizer isVisible={selected} minWidth={minWidth} minHeight={minHeight} />
      <div className="pointer-events-none flex items-center gap-2.5 px-2.5 pt-2">
        <span className="relative h-9 w-9 shrink-0">
          <span
            aria-hidden="true"
            className="absolute bottom-0 right-0 h-8 w-8 rounded-md bg-muted ring-1 ring-inset ring-border"
          />
          <span className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-md bg-secondary text-foreground ring-1 ring-inset ring-border/70">
            <ResourceIcon type={d.type} className="h-[18px] w-[18px]" />
          </span>
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[10px] font-medium leading-none text-muted-foreground">
            {t(`palette.resource.${d.type}`)}
          </span>
          <span className="truncate text-xs font-medium leading-tight text-foreground">{d.name}</span>
          <span className="truncate font-mono text-[10px] leading-none text-muted-foreground">
            {d.type}.{d.name}
          </span>
        </div>
      </div>

      {/* An empty box gives no clue it holds things. A faint line in the body
          teaches the nest gesture (drop a resource inside) — the only way to
          reach the containment relationship, since containers carry no handles.
          pointer-events-none so it never blocks the drop it describes. */}
      {children.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-11 flex items-center justify-center px-4 text-center">
          <span className="text-[11px] text-muted-foreground/70">{t('canvas.container.nestHint')}</span>
        </div>
      )}
    </div>
  );
}
