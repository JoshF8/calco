import { Boxes } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ResourceNodeData } from './ResourceNode';

// A module box: the read-only boundary the importer draws around the resources
// of a local module source directory. Unlike a VPC/subnet container it is not
// a droppable or resizable canvas object — the grouping is fixed by the import
// and ELK sizes the box to fit its contents. The header shows the invocation
// (module.<name>) and the source directory it resolved from.
export function ModuleNode({ data }: { data: ResourceNodeData }) {
  const { t } = useTranslation();
  const source = typeof data.source === 'string' ? data.source : '';

  return (
    <div
      className={cn(
        'relative h-full w-full rounded-lg border-2 border-border/80 bg-muted/30',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
      )}
    >
      <div className="pointer-events-none flex items-center gap-2.5 px-2.5 pt-2">
        <span className="relative h-9 w-9 shrink-0">
          <span
            aria-hidden="true"
            className="absolute bottom-0 right-0 h-8 w-8 rounded-md bg-muted ring-1 ring-inset ring-border"
          />
          <span className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-md bg-secondary text-foreground ring-1 ring-inset ring-border/70">
            <Boxes className="h-[18px] w-[18px]" />
          </span>
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[10px] font-medium leading-none text-muted-foreground">
            {t('canvas.module.label')}
          </span>
          <span className="truncate text-xs font-medium leading-tight text-foreground">{data.name}</span>
          <span className="truncate font-mono text-[10px] leading-none text-muted-foreground">
            module.{data.name}
          </span>
        </div>
      </div>
      {source && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 border-t border-border/60 px-2.5 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{t('canvas.module.source')}</span>
          <span className="truncate font-mono text-[10px] text-muted-foreground">{source}</span>
        </div>
      )}
    </div>
  );
}
