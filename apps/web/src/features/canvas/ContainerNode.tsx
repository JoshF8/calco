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

  // A container is never a connection *target* — it carries no handles, so
  // during a connection drag we dim it, sending the eye to the dots that can
  // receive the line. Nesting is a different gesture: while a resource *node* is
  // being dragged and hovers a container it belongs inside, Canvas marks that
  // container the live drop-target (geometry). Light it up and name the gesture
  // so nesting is discoverable *before* the drop, not only learned after it.
  const connecting = useCanvasStore((s) => s.connectSource !== null);
  const isDropTarget = useCanvasStore((s) => s.dropTargetId === id);

  return (
    <div
      className={cn(
        'relative h-full w-full rounded-lg border-2 bg-card/25 transition-[opacity,border-color,background-color]',
        isDropTarget
          ? 'border-solid border-foreground/60 bg-card/50'
          : connecting
            ? 'border-dashed border-border opacity-40'
            : selected
              ? 'border-ring'
              : 'border-dashed border-border',
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

      {/* Two body hints, mutually exclusive. While a droppable node hovers this
          container, the drop-to-nest teaching takes over — the answer to "what
          happens if I let go here?". Otherwise, an empty box gives no clue it
          holds things, so a faint line teaches the nest gesture. Both are
          pointer-events-none so they never block the drop they describe. */}
      {isDropTarget ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-11 flex items-center justify-center px-4 text-center">
          <span className="rounded-md bg-card/90 px-2 py-1 text-[11px] font-medium leading-relaxed text-foreground shadow-sm ring-1 ring-inset ring-border">
            {t('canvas.container.dropToNest')}
          </span>
        </div>
      ) : (
        children.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-11 flex items-center justify-center px-4 text-center">
            <span className="text-[11px] text-muted-foreground/70">{t('canvas.container.nestHint')}</span>
          </div>
        )
      )}
    </div>
  );
}
