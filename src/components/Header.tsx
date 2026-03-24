import { VIEW_MODES, type ViewModeId } from '@/lib/constants';
import { APP_VERSION, GIT_COMMIT_SHORT } from '@/lib/buildMeta';
import { FALLBACK_RUNWAY_MARKET_IDS, RUNWAY_ALL_MARKETS_VALUE } from '@/lib/markets';
import { cn } from '@/lib/utils';
import { useAtcStore } from '@/store/useAtcStore';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { GitBranch, Moon, Sparkles, Sun } from 'lucide-react';

type HeaderProps = {
  marketIds: string[];
};

export function Header({ marketIds }: HeaderProps) {
  const country = useAtcStore((s) => s.country);
  const viewMode = useAtcStore((s) => s.viewMode);
  const theme = useAtcStore((s) => s.theme);
  const setCountry = useAtcStore((s) => s.setCountry);
  const setViewMode = useAtcStore((s) => s.setViewMode);
  const setTheme = useAtcStore((s) => s.setTheme);
  const discoModePref = useAtcStore((s) => s.discoMode);
  const setDiscoMode = useAtcStore((s) => s.setDiscoMode);
  const reduceMotion = useReducedMotion();

  const ids = marketIds.length ? marketIds : [...FALLBACK_RUNWAY_MARKET_IDS];
  const isDark = theme === 'dark';

  return (
    <header className="border-b border-border bg-card shadow-sm">
      <div className="px-4 py-3 md:px-5 md:py-3.5">
        {/* Brand + primary actions */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-3.5">
            <div className="min-w-0 pt-0.5 sm:pt-0">
              <h1 className="text-foreground">
                <span className="text-lg font-bold tracking-tight md:text-xl">Deployment Pressure Surface</span>
              </h1>
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
                Compare deployment pressure across markets on a shared runway and switch heatmap lenses.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-x-5 gap-y-3 lg:shrink-0">
            <div className="flex flex-col gap-1">
              <Label htmlFor="country" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Country
              </Label>
              <Select value={country} onValueChange={(v) => setCountry(v)}>
                <SelectTrigger id="country" className="h-9 w-[min(100vw-2rem,11.5rem)] sm:w-[11.5rem]">
                  <SelectValue placeholder="Market" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RUNWAY_ALL_MARKETS_VALUE}>All markets</SelectItem>
                  {ids.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 lg:ml-1">
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

        {/* View mode: full width, visually grouped */}
        <div className="mt-4 border-t border-border/80 pt-3.5">
          <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">View mode</Label>
          <RadioGroup
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewModeId)}
            className="mt-2 flex flex-wrap gap-x-1 gap-y-1 rounded-lg border border-border/80 bg-muted/20 p-2 md:gap-x-0 md:gap-y-1"
          >
            <LayoutGroup id="view-mode">
              {VIEW_MODES.map((m) => {
                const selected = viewMode === m.id;
                const pillSpring = reduceMotion
                  ? { duration: 0.01 }
                  : { type: 'spring' as const, stiffness: 420, damping: 34 };
                return (
                  <motion.label
                    key={m.id}
                    title={m.title}
                    className={cn(
                      'relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      'hover:bg-background/80 md:px-2.5',
                      reduceMotion && selected && 'bg-background shadow-sm ring-1 ring-border/90'
                    )}
                    whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                  >
                    {selected && !reduceMotion ? (
                      <motion.div
                        layoutId="view-mode-active-bg"
                        className="pointer-events-none absolute inset-0 z-0 rounded-md bg-background shadow-sm ring-1 ring-border/90"
                        transition={pillSpring}
                        aria-hidden
                      />
                    ) : null}
                    <span className="relative z-10 flex items-center gap-2">
                      <RadioGroupItem value={m.id} id={`vm-${m.id}`} className="border-muted-foreground/40" />
                      <span className="whitespace-nowrap leading-none">{m.label}</span>
                    </span>
                  </motion.label>
                );
              })}
            </LayoutGroup>
          </RadioGroup>
        </div>
      </div>
    </header>
  );
}
