import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Languages, Moon, Sun } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { apiClient } from '@/lib/api-client';

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

function useHello(name: string) {
  return useQuery({
    queryKey: ['hello', name],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/v1/hello', {
        params: { query: { name } },
      });
      if (error) throw new Error(error.detail ?? 'request failed');
      return data;
    },
  });
}

function SymbolMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 130 130"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        rx="20"
        fill="currentColor"
        fillOpacity="0.6"
      />
      <rect
        x="30"
        y="30"
        width="100"
        height="100"
        rx="20"
        fill="currentColor"
        fillOpacity="0.6"
      />
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
  const hello = useHello('calco');

  const toggleLang = () => {
    const next = i18n.language.startsWith('es') ? 'en' : 'es';
    void i18n.changeLanguage(next);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <SymbolMark className="h-8 w-8 text-foreground" />
            <span className="text-xl font-medium tracking-tight">
              {t('app.name')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLang}
              aria-label={t('language.switch')}
              title={t('language.switch')}
            >
              <Languages className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDark(!isDark)}
              aria-label={t('theme.toggle')}
              title={t('theme.toggle')}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-6 px-6 py-24 text-center">
          <SymbolMark className="h-24 w-24 text-foreground" />
          <h1 className="text-5xl font-medium tracking-tight">
            {t('hello.greeting')}
          </h1>
          <p className="max-w-prose text-xl text-muted-foreground">
            {t('app.tagline')}
          </p>
          <p className="text-sm text-muted-foreground">{t('hello.subtitle')}</p>

          <div className="mt-8 flex min-h-[2.5rem] items-center gap-2 rounded-md border px-4 py-2 text-sm">
            <span className="text-muted-foreground">
              {t('server.label')}:
            </span>
            {hello.isLoading && (
              <span className="text-muted-foreground italic">
                {t('server.loading')}
              </span>
            )}
            {hello.isError && (
              <span className="text-destructive">
                {t('server.error')}: {hello.error.message}
              </span>
            )}
            {hello.data && (
              <span className="font-medium text-accent">
                {hello.data.message}
              </span>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-4 text-xs text-muted-foreground">
          {t('footer.copyright', { year: new Date().getFullYear() })}
        </div>
      </footer>
    </div>
  );
}
