import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasStore } from '@/features/canvas/store';
import { ExportPanel } from '@/features/export-flow/ExportPanel';
import { Inspector } from './Inspector';

type Tab = 'inspector' | 'terraform';

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

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l bg-card/40">
      <div role="tablist" className="flex shrink-0 border-b">
        <TabButton active={tab === 'inspector'} onClick={() => setTab('inspector')}>
          {t('inspector.tabInspector')}
        </TabButton>
        <TabButton active={tab === 'terraform'} onClick={() => setTab('terraform')}>
          {t('inspector.tabTerraform')}
        </TabButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'inspector' ? <Inspector /> : <ExportPanel />}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'flex-1 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ' +
        (active
          ? 'border-accent text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground')
      }
    >
      {children}
    </button>
  );
}
