import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { catalog, groupOrder } from './catalog';
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
                  onClick={() => addResource(entry.type)}
                  className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/10"
                  title={entry.type}
                >
                  <span className="truncate">{t(`palette.resource.${entry.type}`)}</span>
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
