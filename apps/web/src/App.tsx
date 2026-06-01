import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Moon, Sun } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Canvas } from '@/features/canvas/Canvas';
import { Palette } from '@/features/canvas/Palette';
import { ExportPanel } from '@/features/export-flow/ExportPanel';

function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() =>
    document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return [isDark, setIsDark] as const;
}

function SymbolMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 130 130" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect x="0" y="0" width="100" height="100" rx="20" fill="currentColor" fillOpacity="0.6" />
      <rect x="30" y="30" width="100" height="100" rx="20" fill="currentColor" fillOpacity="0.6" />
      <path
        d="M100 80C100 91.0457 91.0457 100 80 100H30V50C30 38.9543 38.9543 30 50 30H100V80Z"
        fill="var(--accent)"
      />
    </svg>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [isDark, setIsDark] = useTheme();

  const toggleLang = () => {
    const next = i18n.language.startsWith('es') ? 'en' : 'es';
    void i18n.changeLanguage(next);
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <SymbolMark className="h-7 w-7 text-foreground" />
          <span className="text-lg font-medium tracking-tight">{t('app.name')}</span>
          <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">{t('app.tagline')}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleLang} aria-label={t('language.switch')} title={t('language.switch')}>
            <Languages className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setIsDark(!isDark)} aria-label={t('theme.toggle')} title={t('theme.toggle')}>
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Palette />
        <main className="relative min-w-0 flex-1">
          <Canvas dark={isDark} />
        </main>
        <ExportPanel />
      </div>
    </div>
  );
}
