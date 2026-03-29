import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fullTechWeeklyPatternFromPartial,
  roundTechUnit,
  TECH_WEEKLY_DAY_KEYS,
  type TechWeeklyDayKey,
} from '@/lib/techRhythmDsl';
import {
  fullTradingMonthlyPatternFromPartial,
  roundMonthlyUnit,
  TRADING_MONTH_KEYS,
  type TradingMonthKey,
} from '@/lib/tradingMonthlyDsl';
import { gammaFocusMarket, isRunwayAllMarkets } from '@/lib/markets';
import { cn } from '@/lib/utils';
import { useAtcStore } from '@/store/useAtcStore';
import type { TechWeeklyPatternPatch } from '@/lib/dslTechRhythmPatch';
import type { TradingMonthlyPatternPatch } from '@/lib/dslTradingMonthlyPatch';
import { WeightingLineMiniChart } from '@/components/WeightingLineMiniChart';
import {
  PAYDAY_KNOT_SAMPLE_DATES,
  storePaydayMonthMultiplierFromKnots,
} from '@/engine/paydayMonthShape';

function snapPaydayKnotMultiplier(n: number): number {
  return Math.min(2, Math.max(1, Math.round(n * 1000) / 1000));
}

const EARLY_MONTH_SAMPLE_LABELS = ['W1', 'W2', 'W3', 'W4'] as const;

function roundEarlyMonthExcess(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
}

function clampInput01(raw: string): number | null {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

function formatUnitText(n: number, roundUnit: (x: number) => number): string {
  const r = roundUnit(n);
  const s = r.toFixed(3).replace(/\.?0+$/, '');
  return s === '' ? '0' : s;
}

function UnitField({
  id,
  label,
  value,
  onCommit,
  roundUnit,
  readOnly = false,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (n: number) => void;
  roundUnit: (x: number) => number;
  /** When true, value is display-only (syncs from props). */
  readOnly?: boolean;
}) {
  const [text, setText] = useState(() => formatUnitText(value, roundUnit));

  useEffect(() => {
    setText(formatUnitText(value, roundUnit));
  }, [value, roundUnit]);

  const commit = () => {
    if (readOnly) return;
    const trimmed = text.trim();
    if (trimmed === '' || trimmed === '.' || trimmed === '-') {
      setText(formatUnitText(value, roundUnit));
      return;
    }
    const v = clampInput01(trimmed);
    if (v == null) {
      setText(formatUnitText(value, roundUnit));
      return;
    }
    const r = roundUnit(v);
    onCommit(r);
    setText(formatUnitText(r, roundUnit));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <label htmlFor={id} className="text-[9px] font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={cn(
          'h-8 w-full min-w-0 rounded border border-border/70 bg-muted/40 px-1.5 font-mono text-[11px] tabular-nums text-foreground shadow-inner dark:bg-muted/55',
          readOnly && 'cursor-default bg-muted/25 text-muted-foreground'
        )}
        value={text}
        onChange={readOnly ? undefined : (e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

export function TechWeeklyRhythmPanel() {
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const setTechWeeklyPattern = useAtcStore((s) => s.setTechWeeklyPattern);
  const setTradingMonthlyPattern = useAtcStore((s) => s.setTradingMonthlyPattern);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const setRiskTuning = useAtcStore((s) => s.setRiskTuning);

  const focusMarket = useMemo(
    () => gammaFocusMarket(country, configs, runwayMarketOrder),
    [country, configs, runwayMarketOrder]
  );

  const techPattern = useMemo(() => {
    const c = configs.find((x) => x.market === focusMarket);
    return fullTechWeeklyPatternFromPartial(c?.techRhythm?.weekly_pattern);
  }, [configs, focusMarket]);

  const monthlyPattern = useMemo(() => {
    const c = configs.find((x) => x.market === focusMarket);
    return fullTradingMonthlyPatternFromPartial(c?.monthlyTradingPattern);
  }, [configs, focusMarket]);

  const weeklySeries = useMemo(
    () => TECH_WEEKLY_DAY_KEYS.map((d) => roundTechUnit(techPattern[d])),
    [techPattern]
  );

  const monthlySeries = useMemo(
    () => TRADING_MONTH_KEYS.map((m) => roundMonthlyUnit(monthlyPattern[m])),
    [monthlyPattern]
  );

  const paydayKnotsUi = riskTuning.storePaydayMonthKnotMultipliers;
  const earlyMonthSparkline01 = useMemo(
    () =>
      PAYDAY_KNOT_SAMPLE_DATES.map((d) => {
        const m = storePaydayMonthMultiplierFromKnots(d, paydayKnotsUi);
        return Math.min(1, Math.max(0, m - 1));
      }),
    [paydayKnotsUi]
  );

  /** Tight Y domain so small boosts (e.g. 0.15) use most of the chart height. */
  const earlyMonthYDomain = useMemo((): [number, number] => {
    const maxV = Math.max(...earlyMonthSparkline01, 0);
    if (maxV < 1e-6) return [0, 0.14];
    const top = Math.min(1, maxV * 1.32 + 0.03);
    return [0, Math.max(top, 0.07)];
  }, [earlyMonthSparkline01]);

  const patchTechDay = (day: TechWeeklyDayKey, n: number) => {
    const next: TechWeeklyPatternPatch = { ...techPattern, [day]: roundTechUnit(n) };
    setTechWeeklyPattern(next);
  };

  const patchMonth = (month: TradingMonthKey, n: number) => {
    const next: TradingMonthlyPatternPatch = { ...monthlyPattern, [month]: roundMonthlyUnit(n) };
    setTradingMonthlyPattern(next);
  };

  const patchEarlyMonthKnot = useCallback(
    (sampleIndex: 0 | 1 | 2 | 3, n: number) => {
      const knots = useAtcStore.getState().riskTuning.storePaydayMonthKnotMultipliers;
      const m = snapPaydayKnotMultiplier(1 + roundEarlyMonthExcess(n));
      const next = [...knots] as [number, number, number, number];
      next[sampleIndex] = m;
      setRiskTuning({ storePaydayMonthKnotMultipliers: next });
    },
    [setRiskTuning]
  );

  return (
    <div className="flex min-w-0 flex-col gap-2 border-t border-border/60 pt-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
          Daily Business Weightings
        </span>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Seven values <strong className="font-medium text-foreground/80">0–1</strong> for Mon–Sun. Writes{' '}
          <span className="font-mono text-foreground/80">tech.weekly_pattern</span>; named levels in YAML still load.
        </p>
        {isRunwayAllMarkets(country) ? (
          <p className="text-[10px] leading-snug text-muted-foreground">
            LIOM: editing <span className="font-mono text-foreground/80">{focusMarket}</span> (first market in runway
            order), same as Technology heatmap γ.
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-border/60 bg-muted/25 px-2 py-2 shadow-inner">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Daily Business Weightings, 0 to 1 per weekday">
          {TECH_WEEKLY_DAY_KEYS.map((day) => (
            <UnitField
              key={day}
              id={`tech-rhythm-${day}`}
              label={day}
              value={roundTechUnit(techPattern[day])}
              roundUnit={roundTechUnit}
              onCommit={(n) => patchTechDay(day, n)}
            />
          ))}
        </div>
        <WeightingLineMiniChart
          values={weeklySeries}
          ariaLabel={`Tech weekly rhythm 0 to 1 by weekday for ${focusMarket}`}
          onPointChange={(i, v) => patchTechDay(TECH_WEEKLY_DAY_KEYS[i]!, roundTechUnit(v))}
          pointLabels={TECH_WEEKLY_DAY_KEYS}
        />
        <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
          Drag a point vertically to match the numeric fields (same 0–1 rounding).
        </p>
      </div>

      <div className="flex flex-col gap-0.5 pt-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Monthly Business Weightings
        </span>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Twelve values <strong className="font-medium text-foreground/80">0–1</strong> (Jan–Dec). Each multiplies
          that month’s in-store pressure from <span className="font-mono text-foreground/80">trading.weekly_pattern</span>{' '}
          before <span className="font-mono text-foreground/80">trading.seasonal</span>. Default{' '}
          <span className="font-mono text-foreground/80">1</span> = no change vs weekly level.
        </p>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/25 px-2 py-2 shadow-inner">
        <div
          className="grid grid-cols-4 gap-2 sm:grid-cols-6"
          role="group"
          aria-label="Monthly business weightings, 0 to 1 per calendar month"
        >
          {TRADING_MONTH_KEYS.map((month) => (
            <UnitField
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
          Extra <strong className="font-medium text-foreground/80">store-trading</strong> lift in{' '}
          <strong className="font-medium text-foreground/80">week 1</strong>, fading to{' '}
          <span className="font-mono text-foreground/80">1×</span> by{' '}
          <strong className="font-medium text-foreground/80">week 3</strong> (day 21). Uses tuning + optional YAML{' '}
          <span className="font-mono text-foreground/80">trading.payday_month_peak_multiplier</span> or{' '}
          <span className="font-mono text-foreground/80">payday_month_knot_multipliers</span>.{' '}
          <strong className="font-medium text-foreground/80">Restaurant Activity</strong> heatmap; store is capped at{' '}
          <span className="font-mono text-foreground/80">1</span> after YAML rhythm.
        </p>
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
            <UnitField
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
    </div>
  );
}
