import { useCallback, useMemo } from 'react';
import {
  fullDeploymentRiskContextMonthFromPartial,
  fullTradingMonthlyPatternFromPartial,
  roundMonthlyUnit,
  TRADING_MONTH_KEYS,
  type TradingMonthKey,
} from '@/lib/tradingMonthlyDsl';
import {
  fullTechWeeklyPatternFromPartial,
  roundTechUnit,
  TECH_WEEKLY_DAY_KEYS,
  type TechWeeklyDayKey,
} from '@/lib/techRhythmDsl';
import { gammaFocusMarket, isRunwayMultiMarketStrip } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';
import type { TradingMonthlyPatternPatch } from '@/lib/dslTradingMonthlyPatch';
import type { TradingWeeklyPatternPatch } from '@/lib/dslTradingWeeklyPatch';
import { WeightingLineMiniChart } from '@/components/WeightingLineMiniChart';
import { PatternUnitField } from '@/components/PatternUnitField';
import { HeatmapBusinessPressureOffsetControls } from '@/components/HeatmapBusinessPressureOffsetControls';
import { HeatmapTransferControls } from '@/components/HeatmapTransferControls';
import { MarketRiskMacroControls } from '@/components/MarketRiskMacroControls';
import { MarketRiskScalesControls } from '@/components/MarketRiskScalesControls';
import {
  effectivePaydayKnotTuple,
  isPaydayKnotTuple,
  PAYDAY_KNOT_SAMPLE_DATES,
  PAYDAY_MONTH_MULTIPLIER_MAX,
  storePaydayMonthMultiplierFromKnots,
} from '@/engine/paydayMonthShape';
import { ChevronRight } from 'lucide-react';

/* ────────────────────────────────────────────── helpers ── */

function snapPaydayKnotMultiplier(n: number): number {
  return Math.min(PAYDAY_MONTH_MULTIPLIER_MAX, Math.max(1, Math.round(n * 1000) / 1000));
}

const EARLY_MONTH_LABELS = ['W1', 'W2', 'W3', 'W4'] as const;

function roundEarlyMonthExcess(n: number): number {
  const cap = PAYDAY_MONTH_MULTIPLIER_MAX - 1;
  return Math.round(Math.min(cap, Math.max(0, n)) * 1000) / 1000;
}

const YAML_TAG = 'font-mono text-[10px] text-foreground/75';

/* ────────────────────────────── shared store selectors ── */

function useFocusMarket() {
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);
  const order = useAtcStore((s) => s.runwayMarketOrder);
  return useMemo(() => gammaFocusMarket(country, configs, order), [country, configs, order]);
}

/* ──────────────────── MULTI-MARKET: offset-only view ── */

function MultiMarketOffsetOnly() {
  const viewMode = useAtcStore((s) => s.viewMode);
  const lens = viewMode === 'market_risk' ? 'market_risk' : 'in_store';

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Compare strip — per-market YAML editors are disabled. Use the pressure offset
        to shift the heatmap globally, then switch to a single market to edit its trading curves.
      </p>
      <HeatmapBusinessPressureOffsetControls idPrefix="patterns-multi" lens={lens} />
      <HeatmapTransferControls idPrefix="patterns-multi" lens={lens} className="border-t border-border/40 pt-3" />
      {viewMode === 'market_risk' ? (
        <>
          <div className="space-y-2 border-t border-border/50 pt-3">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Deployment-risk mix — all columns
            </span>
            <MarketRiskMacroControls />
            <details className="group pt-1">
              <summary className="cursor-pointer select-none list-none text-xs font-semibold text-foreground outline-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1">
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                    aria-hidden
                  />
                  Expert — per-component scales
                </span>
              </summary>
              <MarketRiskScalesControls className="mt-3" compact />
            </details>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ───────────────── SINGLE-MARKET: full YAML editors ── */

function SingleMarketEditors() {
  const configs = useAtcStore((s) => s.configs);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const viewMode = useAtcStore((s) => s.viewMode);
  const setTradingWeeklyPattern = useAtcStore((s) => s.setTradingWeeklyPattern);
  const setTradingMonthlyPattern = useAtcStore((s) => s.setTradingMonthlyPattern);
  const setTradingPaydayKnotMultipliers = useAtcStore((s) => s.setTradingPaydayKnotMultipliers);
  const setDeploymentRiskContextMonthCurve = useAtcStore((s) => s.setDeploymentRiskContextMonthCurve);

  const focusMarket = useFocusMarket();
  const focusConfig = useMemo(() => configs.find((x) => x.market === focusMarket), [configs, focusMarket]);

  // ── weekly pattern ── YAML: trading.weekly_pattern
  const weeklyPattern = useMemo(() => {
    const wp = focusConfig?.trading?.weekly_pattern as Record<string, unknown> | undefined;
    return fullTechWeeklyPatternFromPartial(wp);
  }, [focusConfig]);

  const weeklySeries = useMemo(
    () => TECH_WEEKLY_DAY_KEYS.map((d) => roundTechUnit(weeklyPattern[d])),
    [weeklyPattern],
  );

  const patchWeekDay = (day: TechWeeklyDayKey, n: number) => {
    const next: TradingWeeklyPatternPatch = { ...weeklyPattern, [day]: roundTechUnit(n) };
    setTradingWeeklyPattern(next);
  };

  // ── monthly pattern ── YAML: trading.monthly_pattern
  const monthlyPattern = useMemo(
    () => fullTradingMonthlyPatternFromPartial(focusConfig?.monthlyTradingPattern),
    [focusConfig],
  );

  const monthlySeries = useMemo(
    () => TRADING_MONTH_KEYS.map((m) => roundMonthlyUnit(monthlyPattern[m])),
    [monthlyPattern],
  );

  const patchMonth = (month: TradingMonthKey, n: number) => {
    const next: TradingMonthlyPatternPatch = { ...monthlyPattern, [month]: roundMonthlyUnit(n) };
    setTradingMonthlyPattern(next);
  };

  // ── payday boost ── YAML: trading.payday_month_peak_multiplier | payday_month_knot_multipliers
  const paydayKnots = useMemo(
    () => effectivePaydayKnotTuple(focusConfig?.tradingPressure, riskTuning.storePaydayMonthKnotMultipliers),
    [focusConfig?.tradingPressure, riskTuning.storePaydayMonthKnotMultipliers],
  );

  const paydaySource = useMemo((): 'knots' | 'peak' | 'default' => {
    const tp = focusConfig?.tradingPressure;
    if (tp?.payday_month_knot_multipliers && isPaydayKnotTuple(tp.payday_month_knot_multipliers)) return 'knots';
    if (tp?.payday_month_peak_multiplier != null && Number.isFinite(tp.payday_month_peak_multiplier)) return 'peak';
    return 'default';
  }, [focusConfig?.tradingPressure]);

  const earlyMonthSparkline = useMemo(
    () =>
      PAYDAY_KNOT_SAMPLE_DATES.map((d) => {
        const m = storePaydayMonthMultiplierFromKnots(d, paydayKnots);
        return Math.min(PAYDAY_MONTH_MULTIPLIER_MAX - 1, Math.max(0, m - 1));
      }),
    [paydayKnots],
  );

  const earlyMonthYDomain = useMemo((): [number, number] => {
    const maxV = Math.max(...earlyMonthSparkline, 0);
    if (maxV < 1e-6) return [0, Math.min(0.24, PAYDAY_MONTH_MULTIPLIER_MAX - 1 + 0.04)];
    const top = Math.min(1, maxV * 1.32 + 0.03);
    return [0, Math.max(top, 0.07)];
  }, [earlyMonthSparkline]);

  const patchEarlyMonthKnot = useCallback(
    (idx: 0 | 1 | 2 | 3, n: number) => {
      const st = useAtcStore.getState();
      const market = gammaFocusMarket(st.country, st.configs, st.runwayMarketOrder);
      const c = st.configs.find((x) => x.market === market);
      const base = effectivePaydayKnotTuple(c?.tradingPressure, st.riskTuning.storePaydayMonthKnotMultipliers);
      const m = snapPaydayKnotMultiplier(1 + roundEarlyMonthExcess(n));
      const next = [...base] as [number, number, number, number];
      next[idx] = m;
      setTradingPaydayKnotMultipliers(next);
    },
    [setTradingPaydayKnotMultipliers],
  );

  // ── deployment context month ── YAML: deployment_risk_context_month_curve
  const deployContextPattern = useMemo(
    () => fullDeploymentRiskContextMonthFromPartial(focusConfig?.deployment_risk_context_month_curve),
    [focusConfig],
  );

  const deployContextSeries = useMemo(
    () => TRADING_MONTH_KEYS.map((m) => roundMonthlyUnit(deployContextPattern[m])),
    [deployContextPattern],
  );

  const patchDeployCtx = (month: TradingMonthKey, n: number) => {
    setDeploymentRiskContextMonthCurve({ ...deployContextPattern, [month]: roundMonthlyUnit(n) });
  };

  const lens = viewMode === 'market_risk' ? 'market_risk' : 'in_store';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* ─── 1. Weekly store pattern ─── */}
      <section>
        <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Store week (Mon–Sun)
        </h4>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          <span className={YAML_TAG}>trading.weekly_pattern</span> — per-day busyness multiplier (0–1).
        </p>
        <div className="mt-2 rounded-md border border-border/60 bg-muted/25 px-2 py-2 shadow-inner">
          <WeightingLineMiniChart
            values={weeklySeries}
            ariaLabel={`Weekly trading pattern for ${focusMarket}`}
            onPointChange={(i, v) => patchWeekDay(TECH_WEEKLY_DAY_KEYS[i]!, roundTechUnit(v))}
            pointLabels={TECH_WEEKLY_DAY_KEYS}
          />
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Weekly pattern 0–1 per day">
            {TECH_WEEKLY_DAY_KEYS.map((day) => (
              <PatternUnitField
                key={day}
                id={`trading-weekly-${day}`}
                label={day}
                value={roundTechUnit(weeklyPattern[day])}
                roundUnit={roundTechUnit}
                onCommit={(n) => patchWeekDay(day, n)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── 2. Monthly pattern ─── */}
      <section>
        <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Monthly weightings (Jan–Dec)
        </h4>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          <span className={YAML_TAG}>trading.monthly_pattern</span> — twelve 0–1 weights layered on top of
          weekly and seasonal.
        </p>
        <div className="mt-2 rounded-md border border-border/60 bg-muted/25 px-2 py-2 shadow-inner">
          <div
            className="grid grid-cols-4 gap-2 sm:grid-cols-6"
            role="group"
            aria-label="Monthly weightings 0–1 per month"
          >
            {TRADING_MONTH_KEYS.map((month) => (
              <PatternUnitField
                key={month}
                id={`trading-monthly-${month}`}
                label={month}
                value={roundMonthlyUnit(monthlyPattern[month])}
                roundUnit={roundMonthlyUnit}
                onCommit={(n) => patchMonth(month, n)}
              />
            ))}
          </div>
          <WeightingLineMiniChart
            values={monthlySeries}
            ariaLabel={`Monthly trading multipliers for ${focusMarket}`}
            height={62}
            onPointChange={(i, v) => patchMonth(TRADING_MONTH_KEYS[i]!, roundMonthlyUnit(v))}
            pointLabels={TRADING_MONTH_KEYS}
          />
        </div>
      </section>

      {/* ─── 3. Early-month / payday boost ─── */}
      <section>
        <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Early-month boost
        </h4>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          <span className={YAML_TAG}>trading.payday_month_peak_multiplier</span> — week-1 lift that
          decays to 1× by day 21. Editing converts to 4-knot shape.
        </p>
        {paydaySource === 'default' ? (
          <p className="mt-1 text-[10px] font-medium text-amber-700/90 dark:text-amber-400/90">
            No payday value in YAML for {focusMarket} — using scenario default.
          </p>
        ) : paydaySource === 'peak' ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            From YAML peak value ({focusConfig?.tradingPressure?.payday_month_peak_multiplier?.toFixed(2)}).
          </p>
        ) : null}
        <div className="mt-2 rounded-md border border-border/60 bg-muted/25 px-2 py-2 shadow-inner">
          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            role="group"
            aria-label="Early-month boost excess above 1× at W1–W4"
          >
            {([0, 1, 2, 3] as const).map((i) => (
              <PatternUnitField
                key={i}
                id={`early-month-sample-${i}`}
                label={EARLY_MONTH_LABELS[i]}
                value={roundEarlyMonthExcess(earlyMonthSparkline[i] ?? 0)}
                roundUnit={roundEarlyMonthExcess}
                onCommit={(n) => patchEarlyMonthKnot(i, n)}
              />
            ))}
          </div>
          <WeightingLineMiniChart
            values={earlyMonthSparkline}
            ariaLabel={`Early-month boost shape for ${focusMarket}`}
            height={76}
            yDomain={earlyMonthYDomain}
            strokeWidth={2.75}
            pointLabels={[...EARLY_MONTH_LABELS]}
            onPointChange={(i, v) => patchEarlyMonthKnot(i as 0 | 1 | 2 | 3, v)}
          />
          <p className="mt-1 text-[9px] text-muted-foreground">
            Knots:{' '}
            <span className="font-mono text-foreground/80">
              {paydayKnots.map((x) => x.toFixed(2)).join(' · ')}
            </span>
          </p>
        </div>
      </section>

      {/* ─── 4. Deployment context month (market_risk only) ─── */}
      {viewMode === 'market_risk' ? (
        <section className="border-t border-border/50 pt-3">
          <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Deployment context (month)
          </h4>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            <span className={YAML_TAG}>deployment_risk_context_month_curve</span> — 0–1 additive
            overlay on deployment-risk month shape. Default 0 = no effect.
          </p>
          <div className="mt-2 rounded-md border border-border/60 bg-muted/25 px-2 py-2 shadow-inner">
            <div
              className="grid grid-cols-4 gap-2 sm:grid-cols-6"
              role="group"
              aria-label="Deployment context month curve 0–1"
            >
              {TRADING_MONTH_KEYS.map((month) => (
                <PatternUnitField
                  key={`deploy-ctx-${month}`}
                  id={`deployment-context-monthly-${month}`}
                  label={month}
                  value={roundMonthlyUnit(deployContextPattern[month])}
                  roundUnit={roundMonthlyUnit}
                  onCommit={(n) => patchDeployCtx(month, n)}
                />
              ))}
            </div>
            <WeightingLineMiniChart
              values={deployContextSeries}
              ariaLabel={`Deployment context month curve for ${focusMarket}`}
              height={62}
              onPointChange={(i, v) => patchDeployCtx(TRADING_MONTH_KEYS[i]!, roundMonthlyUnit(v))}
              pointLabels={TRADING_MONTH_KEYS}
            />
          </div>
        </section>
      ) : null}

      {/* ─── 5. Heatmap offset + transfer ─── */}
      <section className="border-t border-border/50 pt-3">
        <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Heatmap — pressure offset &amp; transfer
        </h4>
        <HeatmapBusinessPressureOffsetControls idPrefix="patterns" lens={lens} />
        <HeatmapTransferControls idPrefix="patterns" lens={lens} className="border-t border-border/40 pt-3" />
      </section>

      {/* ─── 6. Deployment-risk mix + expert (market_risk only) ─── */}
      {viewMode === 'market_risk' ? (
        <section className="border-t border-border/50 pt-3">
          <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Deployment-risk mix — all columns
          </h4>
          <p className="mt-0.5 mb-2 text-[10px] text-muted-foreground">
            Global weights inside the deployment-risk sum. Not per-market YAML.
          </p>
          <MarketRiskMacroControls />
          <details className="group pt-1">
            <summary className="cursor-pointer select-none list-none text-xs font-semibold text-foreground outline-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1">
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                  aria-hidden
                />
                Expert — per-component scales
              </span>
            </summary>
            <MarketRiskScalesControls className="mt-3" compact />
          </details>
        </section>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────── public export ── */

export function RestaurantTradingPatternsPanel() {
  const country = useAtcStore((s) => s.country);
  const isMulti = isRunwayMultiMarketStrip(country);

  if (isMulti) return <MultiMarketOffsetOnly />;
  return <SingleMarketEditors />;
}
