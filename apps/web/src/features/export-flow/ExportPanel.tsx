import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Download, FileCode, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/shared/components/ui/button';
import { useCanvasStore } from '../canvas/store';

type Files = Record<string, string>;

export function ExportPanel() {
  const { t } = useTranslation();
  const toApiModel = useCanvasStore((s) => s.toApiModel);
  const resourceCount = useCanvasStore((s) => s.nodes.length);
  const [active, setActive] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (): Promise<Files> => {
      const { data, error } = await apiClient.POST('/api/v1/generate', { body: toApiModel() });
      if (error) throw new Error(error.detail ?? 'generation failed');
      const files = (data?.files ?? {}) as Files;
      setActive((prev) => prev && files[prev] !== undefined ? prev : Object.keys(files)[0] ?? null);
      return files;
    },
  });

  const files = mutation.data;
  const filenames = files ? Object.keys(files).sort() : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {t('export.resourceCount', { count: resourceCount })}
        </p>
        <Button size="sm" onClick={() => mutation.mutate()} disabled={resourceCount === 0 || mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode className="h-4 w-4" />}
          {t('export.button')}
        </Button>
      </div>

      {mutation.isError && (
        <div
          role="alert"
          className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
        >
          <span className="sr-only">{t('export.errorPrefix')}: </span>
          {mutation.error.message}
        </div>
      )}

      {!files && !mutation.isError && (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {resourceCount === 0 ? t('export.emptyCanvas') : t('export.prompt')}
        </div>
      )}

      {files && filenames.length > 0 && (
        <>
          <div
            role="tablist"
            aria-label={t('export.filesLabel')}
            className="flex gap-1 overflow-x-auto border-b px-2 py-1.5"
          >
            {filenames.map((name) => (
              <button
                key={name}
                id={`file-tab-${name}`}
                role="tab"
                aria-selected={active === name}
                aria-controls="file-panel"
                tabIndex={active === name ? 0 : -1}
                onClick={() => setActive(name)}
                className={
                  'rounded px-2 py-1 font-mono text-xs ' +
                  (active === name ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/10')
                }
              >
                {name}
              </button>
            ))}
          </div>
          <pre
            role="tabpanel"
            id="file-panel"
            aria-labelledby={active ? `file-tab-${active}` : undefined}
            className="flex-1 overflow-auto bg-background px-4 py-3 font-mono text-xs leading-relaxed"
          >
            <code>{active ? files[active] : ''}</code>
          </pre>
          <div className="border-t px-4 py-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadFiles(files)}
              className="w-full"
            >
              <Download className="h-4 w-4" />
              {t('export.download')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// downloadFiles concatenates the generated files into a single .tf download.
// (Per-file zipping can come later; one file is enough to copy into a project.)
function downloadFiles(files: Files) {
  const combined = Object.entries(files)
    .map(([name, content]) => `# ${name}\n${content}`)
    .join('\n');
  const blob = new Blob([combined], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'calco.tf';
  a.click();
  URL.revokeObjectURL(url);
}
