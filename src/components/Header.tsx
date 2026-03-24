import { STORAGE_KEYS } from '@/lib/constants';
import { APP_VERSION, GIT_COMMIT_SHORT } from '@/lib/buildMeta';
import { cn } from '@/lib/utils';
import { useCallback, useState } from 'react';
import { useAtcStore } from '@/store/useAtcStore';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, GitBranch, Moon, Sparkles, Sun } from 'lucide-react';
import { useReducedMotion } from 'motion/react';

export function Header() {
  const theme = useAtcStore((s) => s.theme);
  const setTheme = useAtcStore((s) => s.setTheme);
  const discoModePref = useAtcStore((s) => s.discoMode);
  const setDiscoMode = useAtcStore((s) => s.setDiscoMode);
  const reduceMotion = useReducedMotion();

  const [compact, setCompact] = useState(readHeaderCompact);

  const toggleCompact = useCallback(() => {
    setCompact((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEYS.header_compact, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const isDark = theme === 'dark';

  return (
    <header className="border-b border-border bg-card shadow-sm">
      <div
        className={cn(
          'px-4 md:px-5',
          compact ? 'py-1.5 md:py-1.5' : 'py-3 md:py-3.5'
        )}
      >
        {compact ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-1.5">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h1 className="text-sm font-bold leading-tight tracking-tight text-foreground sm:text-[0.9375rem]">
                Deployment Pressure Surface
              </h1>
              <span
                className="text-[10px] tabular-nums leading-none text-muted-foreground"
                title={`Version ${APP_VERSION} · commit ${GIT_COMMIT_SHORT}`}
              >
                <span className="font-medium text-foreground/70">v{APP_VERSION}</span>
                <span className="text-muted-foreground/80"> · </span>
                <span className="font-mono text-foreground/65">{GIT_COMMIT_SHORT}</span>
              </span>
            </div>

            <div
              id="header-main-controls"
              className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end"
            >
              <div className="flex items-center gap-1">
                {isDark ? (
                  <Moon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Sun className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDark}
                  aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                  onClick={() => setTheme(isDark ? 'light' : 'dark')}
                  className={cn(
                    'relative h-5 w-9 shrink-0 rounded-full border border-border bg-muted/80 p-px transition-colors',
                    'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:ring-offset-1 focus-visible:ring-offset-card'
                  )}
                >
                  <span
                    className={cn(
                      'block h-4 w-4 rounded-full bg-card shadow-sm ring-1 ring-border/80 transition-transform duration-200 ease-out',
                      isDark ? 'translate-x-4' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>

              {isDark ? (
                <div
                  className="flex items-center gap-1 border-l border-border/60 pl-2 text-muted-foreground"
                  title="Twinkle every runway cell. Off while reduced motion is preferred."
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={discoModePref}
                    aria-label={discoModePref ? 'Turn off disco twinkle' : 'Turn on disco twinkle'}
                    onClick={() => setDiscoMode(!discoModePref)}
                    className={cn(
                      'relative h-5 w-9 shrink-0 rounded-full border border-border bg-muted/80 p-px transition-colors',
                      'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:ring-offset-1 focus-visible:ring-offset-card'
                    )}
                  >
                    <span
                      className={cn(
                        'block h-4 w-4 rounded-full bg-card shadow-sm ring-1 ring-border/80 transition-transform duration-200 ease-out',
                        discoModePref ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-1 h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                onClick={toggleCompact}
                aria-expanded={false}
                aria-controls="header-main-controls"
                aria-label="Expand header details"
                title="Show full header"
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-3.5">
              <div className="min-w-0 flex-1 pt-0.5 sm:pt-0">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h1 className="text-foreground">
                      <span className="text-lg font-bold tracking-tight md:text-xl">
                        Deployment Pressure Surface
                      </span>
                    </h1>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                    onClick={toggleCompact}
                    aria-expanded
                    aria-controls="header-main-controls"
                    aria-label="Collapse header to compact bar"
                    title="Compact header"
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                <p
                  className="mt-1 inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums leading-snug text-muted-foreground md:text-[11px]"
                  title={`Version ${APP_VERSION} · commit ${GIT_COMMIT_SHORT}`}
                >
                  <GitBranch className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                  <span className="font-medium text-foreground/70">v{APP_VERSION}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-[10px] text-foreground/60 md:text-[11px]">{GIT_COMMIT_SHORT}</span>
                </p>
                <p className="mt-1 max-w-md text-[11px] leading-snug text-muted-foreground md:text-xs">
                  Runway focus and heatmap lens live in the <strong className="font-medium text-foreground">Controls</strong>{' '}
                  panel on the right. Use the header for theme and version only.
                </p>
              </div>
            </div>

            <div
              id="header-main-controls"
              className="flex flex-wrap items-end gap-x-5 gap-y-3 lg:shrink-0"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Theme</span>
                <div className="flex h-9 flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2">
                    {isDark ? (
                      <Moon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <Sun className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isDark}
                      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                      onClick={() => setTheme(isDark ? 'light' : 'dark')}
                      className={cn(
                        'relative h-7 w-12 shrink-0 rounded-full border border-border bg-muted/80 p-0.5 transition-colors',
                        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card'
                      )}
                    >
                      <span
                        className={cn(
                          'block h-6 w-6 rounded-full bg-card shadow-sm ring-1 ring-border/80 transition-transform duration-200 ease-out',
                          isDark ? 'translate-x-5' : 'translate-x-0'
                        )}
                      />
                    </button>
                  </div>
                  {isDark ? (
                    <div
                      className="flex items-center gap-2 border-l border-border/60 pl-3 text-muted-foreground"
                      title="Twinkle every runway cell. Off while reduced motion is preferred."
                    >
                      <Sparkles className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                      <button
                        type="button"
                        role="switch"
                        aria-checked={discoModePref}
                        aria-label={discoModePref ? 'Turn off disco twinkle' : 'Turn on disco twinkle'}
                        onClick={() => setDiscoMode(!discoModePref)}
                        className={cn(
                          'relative h-7 w-12 shrink-0 rounded-full border border-border bg-muted/80 p-0.5 transition-colors',
                          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card'
                        )}
                      >
                        <span
                          className={cn(
                            'block h-6 w-6 rounded-full bg-card shadow-sm ring-1 ring-border/80 transition-transform duration-200 ease-out',
                            discoModePref ? 'translate-x-5' : 'translate-x-0'
                          )}
                        />
                      </button>
                    </div>
                  ) : null}
                </div>
                {isDark && reduceMotion && discoModePref ? (
                  <p className="max-w-[14rem] text-[10px] font-normal leading-tight text-muted-foreground">
                    Disco twinkle is off while reduced motion is on.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function readHeaderCompact(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.header_compact) === '1';
  } catch {
    return false;
  }
}
