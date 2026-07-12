import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { FileUp, Loader2, X } from 'lucide-react';
import type { components } from '@/lib/types.gen';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/shared/components/ui/button';
import { useCanvasStore } from '@/features/canvas/store';
import { modelToCanvas } from '@/features/canvas/import';
import { layout } from '@/features/canvas/layout';

type Diagnostic = components['schemas']['Diagnostic'];

// The import dialog: paste Terraform or add .tf files, send them to the static
// importer, reconstruct the canvas from the returned model, lay it out, and
// load it. Diagnostics (what the parser couldn't represent) are shown honestly.
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const loadImported = useCanvasStore((s) => s.loadImported);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ count: number; diagnostics: Diagnostic[] } | null>(null);

  const pickedNames = Object.keys(files);
  const hasInput = pickedNames.length > 0 || text.trim().length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const body = { files: { ...files, ...(text.trim() ? { 'pasted.tf': text } : {}) } };
      const { data, error } = await apiClient.POST('/api/v1/import', { body });
      if (error) throw new Error(error.detail ?? t('import.errorPrefix'));
      const { nodes, edges } = modelToCanvas(data.model);
      const placed = await layout(nodes, edges);
      return { nodes: placed, edges, diagnostics: data.diagnostics ?? [], count: data.model.resources?.length ?? 0 };
    },
    onSuccess: (r) => {
      loadImported(r.nodes, r.edges);
      setResult({ count: r.count, diagnostics: r.diagnostics });
    },
  });

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (!picked) return;
    const next: Record<string, string> = {};
    for (const f of Array.from(picked)) next[f.name] = await f.text();
    setFiles((prev) => ({ ...prev, ...next }));
    e.target.value = ''; // allow re-picking the same file
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="import-title" className="text-sm font-medium">{t('import.title')}</h2>
          <button onClick={onClose} aria-label={t('import.cancel')} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          <p className="text-xs text-muted-foreground">{t('import.hint')}</p>

          {!result && (
            <>
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('import.paste')}
                spellCheck={false}
                className="h-48 w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-secondary">
                  <FileUp className="h-3.5 w-3.5" />
                  {t('import.addFiles')}
                  <input type="file" accept=".tf" multiple onChange={onPick} className="sr-only" />
                </label>
                {pickedNames.map((name) => (
                  <span key={name} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 font-mono text-[11px]">
                    {name}
                    <button
                      onClick={() => setFiles((prev) => { const n = { ...prev }; delete n[name]; return n; })}
                      aria-label={`${t('import.cancel')}: ${name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}

          {mutation.isError && (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {mutation.error.message}
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <p className="text-sm">
                {t('import.summary', { resources: result.count, skipped: result.diagnostics.length })}
              </p>
              {result.diagnostics.length > 0 && (
                <div className="rounded-md border">
                  <div className="border-b px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t('import.notShown')}
                  </div>
                  <ul className="max-h-48 divide-y overflow-y-auto">
                    {result.diagnostics.map((d, i) => (
                      <li key={i} className="px-3 py-1.5 text-xs">
                        <span className="font-mono text-muted-foreground">
                          {[d.address, d.attribute].filter(Boolean).join('.') || d.file}
                        </span>
                        <span className="ml-2">{d.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          {result ? (
            <Button variant="accent" size="sm" onClick={onClose}>{t('import.done')}</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>{t('import.cancel')}</Button>
              <Button variant="accent" size="sm" onClick={() => mutation.mutate()} disabled={!hasInput || mutation.isPending}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {t('import.action')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
