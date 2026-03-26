import { useEffect, useMemo, useState } from 'react';
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
import { useAtcStore } from '@/store/useAtcStore';
import type { TechWeeklyPatternPatch } from '@/lib/dslTechRhythmPatch';
import type { TradingMonthlyPatternPatch } from '@/lib/dslTradingMonthlyPatch';
import { WeightingLineMiniChart } from '@/components/WeightingLineMiniChart';

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
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (n: number) => void;
  roundUnit: (x: number) => number;
}) {
  const [text, setText] = useState(() => formatUnitText(value, roundUnit));

  useEffect(() => {
    setText(formatUnitText(value, roundUnit));
  }, [value, roundUnit]);

  const commit = () => {
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
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className="h-8 w-full min-w-0 rounded border border-border/70 bg-background px-1.5 font-mono text-[11px] tabular-nums text-foreground shadow-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
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

  const patchTechDay = (day: TechWeeklyDayKey, n: number) => {
    const next: TechWeeklyPatternPatch = { ...techPattern, [day]: roundTechUnit(n) };
    setTechWeeklyPattern(next);
  };

  const patchMonth = (month: TradingMonthKey, n: number) => {
    const next: TradingMonthlyPatternPatch = { ...monthlyPattern, [month]: roundMonthlyUnit(n) };
    setTradingMonthlyPattern(next);
  };

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
        />
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
        />
      </div>
    </div>
  );
}
