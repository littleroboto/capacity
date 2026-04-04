import { STORAGE_KEYS } from '@/lib/constants';
import { APP_VERSION, GIT_COMMIT_SHORT } from '@/lib/buildMeta';
import { HeaderClerkUser } from '@/components/HeaderClerkUser';
import { cn } from '@/lib/utils';
import { useCallback, useState } from 'react';
import { useAtcStore } from '@/store/useAtcStore';
import { Button } from '@/components/ui/button';
import { Atom, Bot, ChevronDown, ChevronUp, GitBranch, Moon, Sparkles, Sun } from 'lucide-react';
import { useReducedMotion } from 'motion/react';

export function Header() {
  const theme = useAtcStore((s) => s.theme);
  const setTheme = useAtcStore((s) => s.setTheme);
  const discoModePref = useAtcStore((s) => s.discoMode);
  const setDiscoMode = useAtcStore((s) => s.setDiscoMode);
  const viewMode = useAtcStore((s) => s.viewMode);
  const dslLlmAssistantEnabled = useAtcStore((s) => s.dslLlmAssistantEnabled);
  const setDslLlmAssistantEnabled = useAtcStore((s) => s.setDslLlmAssistantEnabled);
  const reduceMotion = useReducedMotion();
  const isDark = theme === 'dark';
  /** Toybox: disco (dark theme) and LLM assist (code view). Runway SVG toggle lives on the Runway card toolbar (3D runway is off for now). */
  const showToybox = isDark || viewMode === 'code';

  const swDisco = toyboxSwitchClasses(discoModePref);
  const swLlm = toyboxSwitchClasses(dslLlmAssistantEnabled);
  const swLlmSm = toyboxSwitchClasses(dslLlmAssistantEnabled, 'sm');

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
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <h1 className="text-sm font-bold leading-tight tracking-tight text-foreground sm:text-[0.9375rem]">
                Experiment: Market Capacity Surface
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
              id="header-compact-controls"
              className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end"
            >
              <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
                <div className="flex shrink-0 items-center gap-1.5">
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
                {viewMode === 'code' ? (
                  <div
                    className="flex shrink-0 items-center gap-1.5 border-l border-border/60 pl-2"
                    title="LLM YAML assistant under Code view (Toybox, or add ?llm to URL)"
                  >
                    <Bot
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-90',
                        dslLlmAssistantEnabled && 'text-primary'
                      )}
                      aria-hidden
                    />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={dslLlmAssistantEnabled}
                      data-state={dslLlmAssistantEnabled ? 'on' : 'off'}
                      aria-label={
                        dslLlmAssistantEnabled
                          ? 'Turn off LLM YAML assistant'
                          : 'Turn on LLM YAML assistant'
                      }
                      onClick={() => setDslLlmAssistantEnabled(!dslLlmAssistantEnabled)}
                      className={swLlmSm.track}
                    >
                      <span className={swLlmSm.thumb} />
                    </button>
                  </div>
                ) : null}
              </div>

              <HeaderClerkUser compact />

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-1 h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                onClick={toggleCompact}
                aria-expanded={false}
                aria-controls="header-expanded-panel"
                aria-label="Expand header details"
                title="Show full header (theme + optional toybox)"
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
                        Experiment: Market Capacity Surface
                      </span>
                    </h1>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <HeaderClerkUser className="border-0 pl-0" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                      onClick={toggleCompact}
                      aria-expanded
                      aria-controls="header-expanded-panel"
                      aria-label="Collapse header to compact bar"
                      title="Compact header"
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
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
              </div>
            </div>

            <div
              id="header-expanded-panel"
              className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start lg:shrink-0 lg:flex-nowrap"
            >
              <div id="header-main-controls" className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Theme</span>
                <div className="flex h-9 items-center gap-2">
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
              </div>

              {showToybox ? (
                <div
                  className="rounded-lg border border-border/80 bg-muted/25 px-3 py-2.5 sm:min-w-[min(100%,18rem)]"
                  aria-labelledby="header-toybox-heading"
                >
                  <div
                    id="header-toybox-heading"
                    className="mb-2 flex items-center gap-2 text-muted-foreground"
                  >
                    <Atom className="h-4 w-4 shrink-0 text-foreground/80" aria-hidden />
                    <span className="text-[11px] font-semibold tracking-wide text-foreground/85">Toybox</span>
                  </div>
                  <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
                    {isDark ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Disco twinkle
                        </span>
                        <div
                          className="flex h-9 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground"
                          title="Twinkle every runway cell. Off while reduced motion is preferred."
                        >
                          <Sparkles
                            className={cn(
                              'h-4 w-4 shrink-0 opacity-90',
                              discoModePref && 'text-primary'
                            )}
                            aria-hidden
                          />
                          <button
                            type="button"
                            role="switch"
                            aria-checked={discoModePref}
                            data-state={discoModePref ? 'on' : 'off'}
                            aria-label={discoModePref ? 'Turn off disco twinkle' : 'Turn on disco twinkle'}
                            onClick={() => setDiscoMode(!discoModePref)}
                            className={swDisco.track}
                          >
                            <span className={swDisco.thumb} />
                          </button>
                        </div>
                        {reduceMotion && discoModePref ? (
                          <p className="max-w-[14rem] text-[10px] font-normal leading-tight text-muted-foreground">
                            Disco twinkle is off while reduced motion is on.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {viewMode === 'code' ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          LLM assist
                        </span>
                        <div
                          className="flex h-9 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground"
                          title="OpenAI-powered assistant dock below the Code editor. You can also add ?llm to the URL."
                        >
                          <Bot
                            className={cn(
                              'h-4 w-4 shrink-0 opacity-90',
                              dslLlmAssistantEnabled && 'text-primary'
                            )}
                            aria-hidden
                          />
                          <button
                            type="button"
                            role="switch"
                            aria-checked={dslLlmAssistantEnabled}
                            data-state={dslLlmAssistantEnabled ? 'on' : 'off'}
                            aria-label={
                              dslLlmAssistantEnabled
                                ? 'Turn off LLM YAML assistant'
                                : 'Turn on LLM YAML assistant'
                            }
                            onClick={() => setDslLlmAssistantEnabled(!dslLlmAssistantEnabled)}
                            className={swLlm.track}
                          >
                            <span className={swLlm.thumb} />
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
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

function toyboxSwitchClasses(on: boolean, size: 'md' | 'sm' = 'md') {
  const isSm = size === 'sm';
  return {
    track: cn(
      'relative shrink-0 rounded-full border transition-colors',
      isSm ? 'h-5 w-9 p-px' : 'h-7 w-12 p-0.5',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
      on
        ? 'border-primary/50 bg-primary/20 hover:bg-primary/[0.26]'
        : 'border-border bg-muted/80 hover:bg-muted'
    ),
    thumb: cn(
      'block rounded-full shadow-sm transition-transform duration-200 ease-out',
      isSm ? 'h-4 w-4' : 'h-6 w-6',
      on
        ? isSm
          ? 'translate-x-4 bg-primary ring-1 ring-primary/35'
          : 'translate-x-5 bg-primary ring-1 ring-primary/35'
        : 'translate-x-0 bg-card ring-1 ring-border/80'
    ),
  } as const;
}
