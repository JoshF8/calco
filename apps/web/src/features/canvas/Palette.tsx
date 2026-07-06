import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { RESOURCE_DND_MIME } from './dnd';
import { catalog, groupOrder } from './catalog';
import { ResourceIcon } from './icons';
import { useCanvasStore } from './store';

export function Palette() {
  const { t } = useTranslation();
  const addResource = useCanvasStore((s) => s.addResource);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-card/40">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-medium">{t('palette.title')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('palette.hint')}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {groupOrder.map((group) => {
          const entries = catalog.filter((e) => e.group === group);
          if (entries.length === 0) return null;
          return (
            <div key={group} className="mb-3">
              <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {t(`palette.group.${group}`)}
              </div>
              {entries.map((entry) => (
                <button
                  key={entry.type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(RESOURCE_DND_MIME, entry.type);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => addResource(entry.type)}
                  className="group flex w-full cursor-grab items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary active:cursor-grabbing"
                  title={entry.type}
                >
                  <span className="relative h-7 w-7 shrink-0">
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 right-0 h-6 w-6 rounded-md bg-muted ring-1 ring-inset ring-border"
                    />
                    <span className="absolute left-0 top-0 grid h-6 w-6 place-items-center rounded-md bg-card text-foreground ring-1 ring-inset ring-border/70">
                      <ResourceIcon type={entry.type} className="h-4 w-4" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t(`palette.resource.${entry.type}`)}</span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
