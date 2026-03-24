import { useMemo } from 'react';
import { useAtcStore } from '@/store/useAtcStore';
import { simulationSummaryFromRiskRows } from '@/planning/metrics';
import { scenarioFromMarketConfig } from '@/planning/scenarioFromMarketConfig';
import { buildPlanningExportBundle } from '@/planning/exportBundle';
import { isRunwayAllMarkets, RUNWAY_ALL_MARKETS_VALUE } from '@/lib/markets';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function StatTile({
  label,
  value,
  valueClassName,
  className,
  variant,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  className?: string;
  variant: 'default' | 'sidebar';
}) {
  const valueSize =
    variant === 'sidebar'
      ? 'text-3xl sm:text-4xl leading-[1.05]'
      : 'text-4xl sm:text-5xl lg:text-6xl leading-[1.02]';
  return (
    <div
      className={cn(
        'rounded-xl border border-border/70 bg-gradient-to-b from-card to-muted/15 px-4 py-3.5 shadow-sm ring-1 ring-black/[0.04] dark:border-border dark:from-card dark:to-muted/10 dark:ring-white/[0.06]',
        variant === 'sidebar' && 'px-3.5 py-3',
        className
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-2 font-extrabold tabular-nums tracking-tight text-foreground antialiased',
          valueSize,
          valueClassName
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FooterKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex shrink-0 items-baseline gap-1.5 rounded-md border border-border/60 bg-muted/25 px-2 py-1 dark:bg-muted/15">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-extrabold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function PlanningWorkbench({
  className,
  variant = 'default',
}: {
  className?: string;
  /** `footer`: compact bar under heatmap. `sidebar`: narrow column (legacy). */
  variant?: 'default' | 'sidebar' | 'footer';
}) {
  const country = useAtcStore((s) => s.country);
  const dslText = useAtcStore((s) => s.dslText);
  const riskSurface = useAtcStore((s) => s.riskSurface);
  const configs = useAtcStore((s) => s.configs);
  const parseError = useAtcStore((s) => s.parseError);

  const { scenario, summary, disabledReason } = useMemo(() => {
    if (parseError) {
      return { scenario: null, summary: null, disabledReason: null } as const;
    }
    if (isRunwayAllMarkets(country)) {
      return {
        scenario: null,
        summary: simulationSummaryFromRiskRows(riskSurface),
        disabledReason: null as string | null,
      } as const;
    }
    const config = configs.find((c) => c.market === country);
    if (!config) {
      return { scenario: null, summary: null, disabledReason: 'No market config loaded.' } as const;
    }
    const rows = riskSurface.filter((r) => r.market === country);
    return {
      scenario: scenarioFromMarketConfig(config, dslText),
      summary: simulationSummaryFromRiskRows(rows),
      disabledReason: null as string | null,
    } as const;
  }, [country, configs, riskSurface, dslText, parseError]);

  if (parseError) return null;

  const exportPlanningJson = () => {
    if (!scenario || !summary) return;
    const config = configs.find((c) => c.market === scenario.profile.marketId);
    if (!config) return;
    const blob = new Blob(
      [JSON.stringify(buildPlanningExportBundle({ config, summary, dslText }), null, 2)],
      { type: 'application/json' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `planning-${scenario.profile.marketId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cardClass =
    'rounded-xl border border-border bg-card/80 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]';

  if (disabledReason && !summary) {
    return (
      <div
        className={cn(
          variant === 'footer'
            ? 'rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-xs text-muted-foreground'
            : cn(cardClass, 'p-4'),
          className
        )}
      >
        {variant !== 'footer' ? (
          <>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Planning workbench</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{disabledReason}</p>
          </>
        ) : (
          <span className="font-medium text-foreground/90">Workbench</span>
        )}
        {variant === 'footer' ? <span className="ml-2">{disabledReason}</span> : null}
      </div>
    );
  }

  if (!summary) return null;

  const breachBits = summary.criticalFunctionBreaches.filter((c) => c.dayCount > 0);

  const footerShell = 'rounded-lg border border-border/70 bg-card/90 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]';

  if (variant === 'footer') {
    return (
      <section className={cn(footerShell, 'px-3 py-2.5 sm:px-4', className)}>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2">
          <div className="min-w-0 flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-x-3 sm:gap-y-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workbench</span>
              <span className="text-sm font-bold tracking-tight text-foreground">Planning summary</span>
              <span className="hidden text-[11px] text-muted-foreground lg:inline">
                · Deterministic · daily buckets · tooltips
              </span>
            </div>
            {country === RUNWAY_ALL_MARKETS_VALUE ? (
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-semibold text-foreground/90">All markets</span>
                {' — '}
                aggregate stats; pick one market to export.
              </p>
            ) : scenario ? (
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{scenario.name}</span>
                {' · '}
                <span className="tabular-nums font-semibold text-foreground">{scenario.events.length}</span> events
                {' · '}
                <span className="tabular-nums font-semibold text-foreground">{scenario.functions.length}</span> functions
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FooterKpi label="High-band days" value={String(summary.highBandDayCount)} />
            <FooterKpi label="Σ risk (area)" value={summary.overloadArea.toFixed(0)} />
            <FooterKpi label="Cap strain days" value={String(summary.nominalBreachDayCount)} />
            {scenario ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 shrink-0 text-xs font-medium"
                onClick={exportPlanningJson}
              >
                Export JSON
              </Button>
            ) : null}
          </div>
        </div>
        {breachBits.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-border/50 pt-2 text-[11px]">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">Breaches</span>
            <span className="text-muted-foreground">·</span>
            {breachBits.map((c) => (
              <span key={c.functionId} className="tabular-nums text-foreground">
                <span className="text-muted-foreground">{c.functionId.replace(/_/g, ' ')}</span>{' '}
                <span className="font-bold">{c.dayCount}d</span>
              </span>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className={cn(cardClass, 'overflow-hidden', className)}>
      <div className="border-b border-border/70 bg-muted/20 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex flex-col items-stretch gap-3 sm:gap-3.5">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workbench</p>
            <h2 className="text-base font-bold tracking-tight text-foreground sm:text-lg">Planning summary</h2>
            <p className="max-w-xl text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
              Deterministic run · daily buckets · pressure surfaces in cell tooltips
            </p>
          </div>
          {scenario ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 w-full shrink-0 text-xs font-medium sm:w-auto sm:self-start"
              onClick={exportPlanningJson}
            >
              Export JSON
            </Button>
          ) : null}
        </div>
      </div>

      <div className="px-3 py-3 sm:px-4 sm:py-4">
        {country === RUNWAY_ALL_MARKETS_VALUE ? (
          <p className="mb-4 rounded-md border border-dashed border-border/80 bg-muted/25 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground/90">All markets</span> — aggregate stats across the
            bundle. Choose one market in the header to see its profile, event list, and export.
          </p>
        ) : scenario ? (
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            <span className="font-bold text-foreground">{scenario.name}</span>
            <span className="mx-1.5 text-border">·</span>
            <span className="font-bold tabular-nums text-foreground">{scenario.events.length}</span> events
            <span className="mx-1.5 text-border">·</span>
            <span className="font-bold tabular-nums text-foreground">{scenario.functions.length}</span> functions
          </p>
        ) : null}

        <div
          className={cn(
            'grid',
            variant === 'sidebar' ? 'grid-cols-1 gap-2.5' : 'grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5'
          )}
        >
          <StatTile variant={variant} label="High-band days" value={String(summary.highBandDayCount)} />
          <StatTile variant={variant} label="Σ risk (area)" value={summary.overloadArea.toFixed(0)} />
          <StatTile variant={variant} label="Cap strain days" value={String(summary.nominalBreachDayCount)} />
        </div>

        {breachBits.length > 0 ? (
          <div className="mt-5 border-t border-border/60 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Breaches by bucket
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground">
              {breachBits.map((c) => (
                <li key={c.functionId} className="tabular-nums">
                  <span className="text-muted-foreground">{c.functionId.replace(/_/g, ' ')}</span>{' '}
                  <span className="text-2xl font-extrabold tabular-nums">{c.dayCount}d</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
