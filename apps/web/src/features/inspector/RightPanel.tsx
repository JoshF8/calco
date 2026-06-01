import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasStore } from '@/features/canvas/store';
import { ExportPanel } from '@/features/export-flow/ExportPanel';
import { Inspector } from './Inspector';

type Tab = 'inspector' | 'terraform';
const TABS: Tab[] = ['inspector', 'terraform'];

// The right column hosts the Inspector (edit the selected resource) and the
// Terraform export, switched by tabs. Selecting a node jumps to the Inspector,
// matching the expectation set by most node editors.
export function RightPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('inspector');
  const selectedCount = useCanvasStore((s) => s.nodes).filter((n) => n.selected).length;

  // Adjust the tab when selection appears, without an effect: React's
  // documented "store info from previous render" pattern (set-state during
  // render, re-runs immediately, no cascading-effect warning).
  const [prevSelected, setPrevSelected] = useState(selectedCount);
  if (selectedCount !== prevSelected) {
    setPrevSelected(selectedCount);
    if (selectedCount > 0) setTab('inspector');
  }

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setTab(TABS[(i + 1) % TABS.length]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setTab(TABS[(i - 1 + TABS.length) % TABS.length]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setTab(TABS[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      setTab(TABS[TABS.length - 1]);
    }
  };

  const label: Record<Tab, string> = {
    inspector: t('inspector.tabInspector'),
    terraform: t('inspector.tabTerraform'),
  };

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l bg-card/40">
      <div role="tablist" aria-label={t('inspector.tabsLabel')} onKeyDown={onTabKeyDown} className="flex shrink-0 border-b">
        {TABS.map((value) => (
          <button
            key={value}
            id={`tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            className={
              'flex-1 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ' +
              (tab === value
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {label[value]}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === 'inspector' ? <Inspector /> : <ExportPanel />}
      </div>
    </aside>
  );
}
