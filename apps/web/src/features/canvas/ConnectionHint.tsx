import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useCanvasStore } from './store';

// A transient, dismissible note explaining why a connection was refused. It
// teaches AWS's real relationship model by naming the reason and pointing at
// the right gesture — never a browser alert, never blame. Auto-dismisses, but
// also carries a manual dismiss and aria-live so screen-reader / motor users
// are never forced to race a timer.
export function ConnectionHint() {
  const { t } = useTranslation();
  const rejection = useCanvasStore((s) => s.lastRejection);
  const clearRejection = useCanvasStore((s) => s.clearRejection);

  useEffect(() => {
    if (!rejection) return;
    const id = setTimeout(clearRejection, 6000);
    return () => clearTimeout(id);
  }, [rejection, clearRejection]);

  if (!rejection) return null;

  // Rule params are raw aws_* types; resolve them to human palette labels.
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(rejection.params ?? {})) {
    params[k] = t(`palette.resource.${v}`, { defaultValue: v });
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto absolute bottom-6 left-1/2 z-10 flex max-w-md -translate-x-1/2 items-start gap-3 rounded-md border bg-card px-3 py-2 text-xs leading-relaxed text-foreground shadow-md"
    >
      <span>{t(rejection.key, params)}</span>
      <button
        type="button"
        onClick={clearRejection}
        aria-label={t('connection.hint.dismiss')}
        title={t('connection.hint.dismiss')}
        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
