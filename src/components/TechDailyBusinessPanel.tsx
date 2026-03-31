import { useMemo } from 'react';
import {
  fullTechWeeklyPatternFromPartial,
  roundTechUnit,
  TECH_WEEKLY_DAY_KEYS,
  type TechWeeklyDayKey,
} from '@/lib/techRhythmDsl';
import { gammaFocusMarket, isRunwayAllMarkets } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';
import type { TechWeeklyPatternPatch } from '@/lib/dslTechRhythmPatch';
import { WeightingLineMiniChart } from '@/components/WeightingLineMiniChart';
import { PatternUnitField } from '@/components/PatternUnitField';

/** Support week shape UI: `tech.weekly_pattern` (labs + Market IT + backend BAU rhythm Mon–Sun). */
export function TechDailyBusinessPanel() {
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const setTechWeeklyPattern = useAtcStore((s) => s.setTechWeeklyPattern);

  const focusMarket = useMemo(
    () => gammaFocusMarket(country, configs, runwayMarketOrder),
    [country, configs, runwayMarketOrder]
  );

  const techPattern = useMemo(() => {
    const cfg = configs.find((x) => x.market === focusMarket);
    return fullTechWeeklyPatternFromPartial(cfg?.techRhythm?.weekly_pattern);
  }, [configs, focusMarket]);

  const weeklySeries = useMemo(
    () => TECH_WEEKLY_DAY_KEYS.map((d) => roundTechUnit(techPattern[d])),
    [techPattern]
  );

  const patchTechDay = (day: TechWeeklyDayKey, n: number) => {
    const next: TechWeeklyPatternPatch = { ...techPattern, [day]: roundTechUnit(n) };
    setTechWeeklyPattern(next);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold text-foreground">Support Week Shape</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          How hard BAU engineering runs Mon–Sun (0 = off, 1 = full). Store trading has its own curve under Restaurant
          Activity.
        </p>
        {isRunwayAllMarkets(country) ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Editing <span className="font-medium text-foreground/85">{focusMarket}</span>.
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-border/60 bg-muted/25 px-3 py-3 shadow-inner">
        <WeightingLineMiniChart
          values={weeklySeries}
          ariaLabel={`Support week shape 0 to 1 by weekday for ${focusMarket}`}
          onPointChange={(i, v) => patchTechDay(TECH_WEEKLY_DAY_KEYS[i]!, roundTechUnit(v))}
          pointLabels={TECH_WEEKLY_DAY_KEYS}
        />
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label="Support week intensity per weekday, 0 to 1"
        >
          {TECH_WEEKLY_DAY_KEYS.map((day) => (
            <PatternUnitField
              key={day}
              id={`tech-rhythm-${day}`}
              label={day}
              value={roundTechUnit(techPattern[day])}
              roundUnit={roundTechUnit}
              onCommit={(n) => patchTechDay(day, n)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
