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

function snapPaydayKnotMultiplier(n: number): number {
  return Math.min(
    PAYDAY_MONTH_MULTIPLIER_MAX,
    Math.max(1, Math.round(n * 1000) / 1000)
  );
}

const EARLY_MONTH_SAMPLE_LABELS = ['W1', 'W2', 'W3', 'W4'] as const;

function roundEarlyMonthExcess(n: number): number {
  const cap = PAYDAY_MONTH_MULTIPLIER_MAX - 1;
  return Math.round(Math.min(cap, Math.max(0, n)) * 1000) / 1000;
}

/** Store / trading YAML: `trading.weekly_pattern`, `trading.monthly_pattern`, early-month boost (Restaurant Activity lens). */
export function RestaurantTradingPatternsPanel() {
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const setTradingWeeklyPattern = useAtcStore((s) => s.setTradingWeeklyPattern);
  const setTradingMonthlyPattern = useAtcStore((s) => s.setTradingMonthlyPattern);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const setTradingPaydayKnotMultipliers = useAtcStore((s) => s.setTradingPaydayKnotMultipliers);
  const viewMode = useAtcStore((s) => s.viewMode);
  const setDeploymentRiskContextMonthCurve = useAtcStore((s) => s.setDeploymentRiskContextMonthCurve);

  const focusMarket = useMemo(
    () => gammaFocusMarket(country, configs, runwayMarketOrder),
    [country, configs, runwayMarketOrder]
  );

  const weeklyStorePattern = useMemo(() => {
    const c = configs.find((x) => x.market === focusMarket);
    const wp = c?.trading?.weekly_pattern as Record<string, unknown> | undefined;
    return fullTechWeeklyPatternFromPartial(wp);
  }, [configs, focusMarket]);

  const weeklyStoreSeries = useMemo(
    () => TECH_WEEKLY_DAY_KEYS.map((d) => roundTechUnit(weeklyStorePattern[d])),
    [weeklyStorePattern]
  );

  const monthlyPattern = useMemo(() => {
    const c = configs.find((x) => x.market === focusMarket);
    return fullTradingMonthlyPatternFromPartial(c?.monthlyTradingPattern);
  }, [configs, focusMarket]);

  const monthlySeries = useMemo(
    () => TRADING_MONTH_KEYS.map((m) => roundMonthlyUnit(monthlyPattern[m])),
    [monthlyPattern]
  );

  const focusConfig = useMemo(
    () => configs.find((x) => x.market === focusMarket),
    [configs, focusMarket]
  );

  const paydayKnotsUi = useMemo(
    () =>
      effectivePaydayKnotTuple(focusConfig?.tradingPressure, riskTuning.storePaydayMonthKnotMultipliers),
    [focusConfig?.tradingPressure, riskTuning.storePaydayMonthKnotMultipliers]
  );

  const paydayYamlKind = useMemo(() => {
    const tp = focusConfig?.tradingPressure;
    if (tp?.payday_month_knot_multipliers && isPaydayKnotTuple(tp.payday_month_knot_multipliers)) {
      return 'knots' as const;
    }
    if (tp?.payday_month_peak_multiplier != null && Number.isFinite(tp.payday_month_peak_multiplier)) {
      return 'peak' as const;
    }
    return null;
  }, [focusConfig?.tradingPressure]);

  const earlyMonthSparkline01 = useMemo(
    () =>
      PAYDAY_KNOT_SAMPLE_DATES.map((d) => {
        const m = storePaydayMonthMultiplierFromKnots(d, paydayKnotsUi);
        return Math.min(PAYDAY_MONTH_MULTIPLIER_MAX - 1, Math.max(0, m - 1));
      }),
    [paydayKnotsUi]
  );

  const earlyMonthYDomain = useMemo((): [number, number] => {
    const maxV = Math.max(...earlyMonthSparkline01, 0);
    if (maxV < 1e-6) return [0, Math.min(0.24, PAYDAY_MONTH_MULTIPLIER_MAX - 1 + 0.04)];
    const top = Math.min(1, maxV * 1.32 + 0.03);
    return [0, Math.max(top, 0.07)];
  }, [earlyMonthSparkline01]);

  const patchStoreWeekDay = (day: TechWeeklyDayKey, n: number) => {
    const next: TradingWeeklyPatternPatch = { ...weeklyStorePattern, [day]: roundTechUnit(n) };
    setTradingWeeklyPattern(next);
  };

  const patchMonth = (month: TradingMonthKey, n: number) => {
    const next: TradingMonthlyPatternPatch = { ...monthlyPattern, [month]: roundMonthlyUnit(n) };
    setTradingMonthlyPattern(next);
  };

  const patchEarlyMonthKnot = useCallback(
    (sampleIndex: 0 | 1 | 2 | 3, n: number) => {
      const st = useAtcStore.getState();
      const market = gammaFocusMarket(st.country, st.configs, st.runwayMarketOrder);
      const c = st.configs.find((x) => x.market === market);
      const base = effectivePaydayKnotTuple(c?.tradingPressure, st.riskTuning.storePaydayMonthKnotMultipliers);
      const m = snapPaydayKnotMultiplier(1 + roundEarlyMonthExcess(n));
      const next = [...base] as [number, number, number, number];
      next[sampleIndex] = m;
      setTradingPaydayKnotMultipliers(next);
    },
    [setTradingPaydayKnotMultipliers]
  );

  const deploymentContextMonthPattern = useMemo(() => {
    const c = configs.find((x) => x.market === focusMarket);
    return fullDeploymentRiskContextMonthFromPartial(c?.deployment_risk_context_month_curve);
  }, [configs, focusMarket]);

  const deploymentContextMonthSeries = useMemo(
    () => TRADING_MONTH_KEYS.map((m) => roundMonthlyUnit(deploymentContextMonthPattern[m])),
    [deploymentContextMonthPattern]
  );

  const patchDeploymentContextMonth = (month: TradingMonthKey, n: number) => {
    const next = { ...deploymentContextMonthPattern, [month]: roundMonthlyUnit(n) };
    setDeploymentRiskContextMonthCurve(next);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Store week (Mon–Sun)
        </span>
        <p className="text-[11px] leading-snug text-muted-foreground">
          <strong className="font-medium text-foreground/80">Restaurant / in-store</strong> — per-market default
          busyness: seven <strong className="font-medium text-foreground/80">0–1</strong> values in{' '}
          <span className="font-mono text-foreground/80">trading.weekly_pattern</span>, multiplied by monthly weights
          and seasonal. Not <span className="font-mono text-foreground/80">weekday_intensity</span> (Technology lens).
        </p>
        {isRunwayMultiMarketStrip(country) ? (
          <p className="text-[10px] leading-snug text-muted-foreground">
            LIOM: editing <span className="font-mono text-foreground/80">{focusMarket}</span>.
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-border/60 bg-muted/25 px-2 py-2 shadow-inner">
        <WeightingLineMiniChart
          values={weeklyStoreSeries}
          ariaLabel={`Store trading weekly pattern 0 to 1 by weekday for ${focusMarket}`}
          onPointChange={(i, v) => patchStoreWeekDay(TECH_WEEKLY_DAY_KEYS[i]!, roundTechUnit(v))}
          pointLabels={TECH_WEEKLY_DAY_KEYS}
        />
        <div
          className="mt-2 flex flex-wrap gap-2"
          role="group"
          aria-label="Store trading weekly pattern, 0 to 1 per weekday"
        >
          {TECH_WEEKLY_DAY_KEYS.map((day) => (
            <PatternUnitField
              key={day}
              id={`trading-weekly-${day}`}
              label={day}
              value={roundTechUnit(weeklyStorePattern[day])}
              roundUnit={roundTechUnit}
              onCommit={(n) => patchStoreWeekDay(day, n)}
            />
          ))}
        </div>
        <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
          Drag a point vertically to match the numeric fields (same 0–1 rounding).
        </p>
      </div>

      <div className="flex flex-col gap-0.5 pt-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Monthly Business Weightings
        </span>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Per-market <span className="font-mono text-foreground/80">trading.monthly_pattern</span>: twelve{' '}
          <strong className="font-medium text-foreground/80">0–1</strong> weights (Jan–Dec) on top of the store week,
          then <span className="font-mono text-foreground/80">trading.seasonal</span>. Omitted months behave as{' '}
          <span className="font-mono text-foreground/80">1</span>.
        </p>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/25 px-2 py-2 shadow-inner">
        <div
          className="grid grid-cols-4 gap-2 sm:grid-cols-6"
          role="group"
          aria-label="Monthly business weightings, 0 to 1 per calendar month"
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
          ariaLabel={`Trading monthly store multipliers 0 to 1 by month for ${focusMarket}`}
          height={62}
          onPointChange={(i, v) => patchMonth(TRADING_MONTH_KEYS[i]!, roundMonthlyUnit(v))}
          pointLabels={TRADING_MONTH_KEYS}
        />
        <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
          Drag a point vertically to match the month fields.
        </p>
      </div>

      <div className="flex flex-col gap-0.5 pt-1">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
          Early-month store boost
        </span>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Per-market early-month multiplier on the store rhythm above (week 1 hot, fade to{' '}
          <span className="font-mono text-foreground/80">1×</span> by day 21).{' '}
          <strong className="font-medium text-foreground/80">YAML</strong> can set{' '}
          <span className="font-mono text-foreground/80">payday_month_peak_multiplier</span> or four-knot{' '}
          <span className="font-mono text-foreground/80">payday_month_knot_multipliers</span>; edits here write knots for{' '}
          <span className="font-mono text-foreground/80">{focusMarket}</span> and drop the peak line. If this market has
          neither, the <strong className="font-medium text-foreground/80">global scenario</strong> knot tuple in Settings
          / tuning is used until you change a value.
        </p>
        {paydayYamlKind === null ? (
          <p className="text-[10px] font-medium text-amber-700/90 dark:text-amber-400/90">
            No payday fields in YAML for {focusMarket} — showing scenario default (change a knot to save to this
            market).
          </p>
        ) : paydayYamlKind === 'peak' ? (
          <p className="text-[10px] text-muted-foreground">
            From YAML <span className="font-mono text-foreground/80">payday_month_peak_multiplier</span> — editing
            converts to explicit knots.
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-border/60 bg-muted/25 px-2 py-2 shadow-inner">
        <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
          Sample mid-week days in January (DOM 4 / 11 / 18 / 25). Values are{' '}
          <strong className="font-medium text-foreground/80">excess store multiplier above 1×</strong> (0–1). Each W1–W4
          sets its own knot; the engine interpolates linearly between them and to 1× by month-end after day 25.
        </p>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          role="group"
          aria-label="Early-month boost, excess above 1× at sample weeks W1–W4"
        >
          {([0, 1, 2, 3] as const).map((i) => (
            <PatternUnitField
              key={i}
              id={`early-month-sample-${i}`}
              label={EARLY_MONTH_SAMPLE_LABELS[i]}
              value={roundEarlyMonthExcess(earlyMonthSparkline01[i] ?? 0)}
              roundUnit={roundEarlyMonthExcess}
              onCommit={(n) => patchEarlyMonthKnot(i, n)}
            />
          ))}
        </div>
        <WeightingLineMiniChart
          values={earlyMonthSparkline01}
          ariaLabel={`Early-month boost shape by calendar week for ${focusMarket}: excess multiplier above 1×`}
          height={76}
          yDomain={earlyMonthYDomain}
          strokeWidth={2.75}
          pointLabels={[...EARLY_MONTH_SAMPLE_LABELS]}
          onPointChange={(i, v) => patchEarlyMonthKnot(i as 0 | 1 | 2 | 3, v)}
        />
        <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
          Knot multipliers:{' '}
          <span className="font-mono text-foreground/80">
            {paydayKnotsUi.map((x) => x.toFixed(2)).join(' · ')}
          </span>
          × — type or drag any point.
        </p>
      </div>

      {viewMode === 'market_risk' ? (
        <MarketRiskMacroControls className="border-t border-border/40 pt-2" />
      ) : null}

      {viewMode === 'market_risk' ? (
        <HeatmapTransferControls
          idPrefix="patterns"
          variant="market_risk"
          className="border-t border-border/40 pt-2"
        />
      ) : null}

      {viewMode === 'market_risk' ? (
        <HeatmapBusinessPressureOffsetControls idPrefix="patterns" className="border-t border-border/40 pt-2" />
      ) : null}

      {viewMode === 'market_risk' ? (
        <>
          <details className="group border-t border-border/40 pt-2">
            <summary className="cursor-pointer select-none list-none text-xs font-semibold text-foreground outline-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1">
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                  aria-hidden
                />
                Expert — per-component scales
              </span>
              <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                0–4× on each deployment-risk term. Most users only need Market risk shape above.
              </span>
            </summary>
            <MarketRiskScalesControls className="mt-3" compact />
          </details>

          <div className="flex flex-col gap-0.5 border-t border-border/40 pt-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Deployment context (month)
            </span>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Second <strong className="font-medium text-foreground/80">0–1 Jan–Dec</strong> curve,{' '}
              <strong className="font-medium text-foreground/80">added</strong> on top of{' '}
              <span className="font-mono text-foreground/80">deployment_risk_month_curve</span> for the{' '}
              <strong className="font-medium text-foreground/80">Market risk</strong> heatmap only—e.g. local
              regulatory windows or operational fragility without rewriting the primary deployment month shape. Default{' '}
              <span className="font-mono text-foreground/80">0</span> = no effect; all zeros removes this block from YAML.
            </p>
          </div>

          <div className="rounded-md border border-border/60 bg-muted/25 px-2 py-2 shadow-inner">
            <div
              className="grid grid-cols-4 gap-2 sm:grid-cols-6"
              role="group"
              aria-label="Deployment context month curve, 0 to 1 per calendar month"
            >
              {TRADING_MONTH_KEYS.map((month) => (
                <PatternUnitField
                  key={`deploy-ctx-${month}`}
                  id={`deployment-context-monthly-${month}`}
                  label={month}
                  value={roundMonthlyUnit(deploymentContextMonthPattern[month])}
                  roundUnit={roundMonthlyUnit}
                  onCommit={(n) => patchDeploymentContextMonth(month, n)}
                />
              ))}
            </div>
            <WeightingLineMiniChart
              values={deploymentContextMonthSeries}
              ariaLabel={`Deployment context month curve 0 to 1 by month for ${focusMarket}`}
              height={62}
              onPointChange={(i, v) =>
                patchDeploymentContextMonth(TRADING_MONTH_KEYS[i]!, roundMonthlyUnit(v))
              }
              pointLabels={TRADING_MONTH_KEYS}
            />
            <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
              Drag a point vertically to match the month fields.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
