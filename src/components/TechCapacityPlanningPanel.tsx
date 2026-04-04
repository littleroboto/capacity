import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import type { DecimalClamp } from '@/components/PatternUnitField';
import { PatternUnitField } from '@/components/PatternUnitField';
import { WeightingLineMiniChart } from '@/components/WeightingLineMiniChart';
import {
  CAPACITY_SHAPE_MAX,
  CAPACITY_SHAPE_MIN,
  CAPACITY_SHAPE_MONTH_KEYS,
  clampHolidayStaffingUi,
  fullCapacityShapeMonthlyFromPartial,
  fullStaffCapacityMonthlyFromPartial,
  roundCapacityShapeUnit,
  type CapacityShapeMonthKey,
} from '@/lib/capacityShapeMonthlyDsl';
import { gammaFocusMarket, isRunwayMultiMarketStrip } from '@/lib/markets';
import { useAtcStore } from '@/store/useAtcStore';

const TUNING_RANGE = 'h-3 w-full min-w-0 cursor-pointer accent-primary';

function roundHeadcountInt(n: number): number {
  return Math.round(Math.max(0, n));
}

function intBoundsForBaseline(baseline: number): { min: number; max: number } {
  const min = Math.max(0, Math.round(baseline * CAPACITY_SHAPE_MIN));
  const max = Math.max(min, Math.round(baseline * CAPACITY_SHAPE_MAX));
  return { min, max };
}

function makeIntClamp(bounds: { min: number; max: number }): DecimalClamp {
  return (raw) => {
    const n = parseFloat(String(raw).trim());
    if (!Number.isFinite(n)) return null;
    return Math.round(Math.min(bounds.max, Math.max(bounds.min, n)));
  };
}

function makeIntRounder(bounds: { min: number; max: number }): (n: number) => number {
  return (n) => Math.round(Math.min(bounds.max, Math.max(bounds.min, n)));
}

function yDomainForAbsSeries(values: readonly number[], baseline: number): [number, number] {
  const minV = Math.min(...values, baseline);
  const maxV = Math.max(...values, baseline);
  const span = Math.max(1e-6, maxV - minV, baseline * 0.15);
  const pad = span * 0.2;
  const lo = Math.max(0.25, minV - pad);
  const hi = maxV + pad;
  return lo < hi ? [lo, hi] : [lo, lo + 1];
}

/**
 * Technology lens: simplified supply & holidays — absolute lab/staff through the year (from YAML baselines),
 * holiday staffing sliders. Runway availability stays YAML-only (`tech.available_capacity_pattern`). No duplicate week-shape UI here.
 */
export function TechCapacityPlanningPanel() {
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const setResourcesLabsMonthlyPattern = useAtcStore((s) => s.setResourcesLabsMonthlyPattern);
  const setResourcesStaffMonthlyPattern = useAtcStore((s) => s.setResourcesStaffMonthlyPattern);
  const setHolidayStaffingMultiplier = useAtcStore((s) => s.setHolidayStaffingMultiplier);

  const focusMarket = useMemo(
    () => gammaFocusMarket(country, configs, runwayMarketOrder),
    [country, configs, runwayMarketOrder]
  );

  const c = useMemo(() => configs.find((x) => x.market === focusMarket), [configs, focusMarket]);

  const labBase = c?.testingCapacity ?? c?.capacity.labs ?? 5;
  const teamBase = c?.capacity.teams ?? 4;

  const labIntBounds = useMemo(() => intBoundsForBaseline(labBase), [labBase]);
  const staffIsAbs = c?.staffMonthlyPatternBasis === 'absolute';
  const staffIntBounds = useMemo(() => {
    if (staffIsAbs) {
      const max = Math.max(20, Math.ceil(teamBase * CAPACITY_SHAPE_MAX));
      return { min: 0, max };
    }
    return intBoundsForBaseline(teamBase);
  }, [staffIsAbs, teamBase]);
  const clampLabInt = useMemo(() => makeIntClamp(labIntBounds), [labIntBounds]);
  const clampStaffInt = useMemo(() => makeIntClamp(staffIntBounds), [staffIntBounds]);
  const roundLabInt = useMemo(() => makeIntRounder(labIntBounds), [labIntBounds]);
  const roundStaffInt = useMemo(() => makeIntRounder(staffIntBounds), [staffIntBounds]);

  const labsMonthly = useMemo(
    () => fullCapacityShapeMonthlyFromPartial(c?.monthlyLabsCapacityPattern),
    [c?.monthlyLabsCapacityPattern]
  );
  const staffMonthly = useMemo(() => {
    if (staffIsAbs) {
      return fullStaffCapacityMonthlyFromPartial(
        c?.monthlyStaffCapacityPattern as Record<string, unknown> | undefined,
        teamBase
      );
    }
    return fullCapacityShapeMonthlyFromPartial(c?.monthlyStaffCapacityPattern);
  }, [staffIsAbs, c?.monthlyStaffCapacityPattern, teamBase]);

  const labsAbsSeries = useMemo(
    () => CAPACITY_SHAPE_MONTH_KEYS.map((m) => roundHeadcountInt(labBase * labsMonthly[m]!)),
    [labBase, labsMonthly]
  );
  const staffAbsSeries = useMemo(
    () =>
      CAPACITY_SHAPE_MONTH_KEYS.map((m) =>
        roundHeadcountInt(staffIsAbs ? staffMonthly[m]! : teamBase * staffMonthly[m]!)
      ),
    [staffIsAbs, teamBase, staffMonthly]
  );

  const labsYDomain = useMemo(() => yDomainForAbsSeries(labsAbsSeries, labBase), [labsAbsSeries, labBase]);
  const staffYDomain = useMemo(() => yDomainForAbsSeries(staffAbsSeries, teamBase), [staffAbsSeries, teamBase]);

  const publicHol = clampHolidayStaffingUi(c?.publicHolidayStaffingMultiplier ?? 1);
  const schoolHol = clampHolidayStaffingUi(c?.schoolHolidayStaffingMultiplier ?? 1);

  const patchLabsMult = (month: CapacityShapeMonthKey, mult: number) => {
    const next = { ...labsMonthly, [month]: roundCapacityShapeUnit(mult) };
    setResourcesLabsMonthlyPattern(next);
  };

  const patchStaffMult = (month: CapacityShapeMonthKey, mult: number) => {
    const next = { ...staffMonthly, [month]: roundCapacityShapeUnit(mult) };
    setResourcesStaffMonthlyPattern(next);
  };

  const patchLabsFromAbsolute = (i: number, abs: number) => {
    const month = CAPACITY_SHAPE_MONTH_KEYS[i]!;
    const absI = roundLabInt(abs);
    const mult = labBase > 1e-6 ? absI / labBase : 1;
    patchLabsMult(month, mult);
  };

  const patchStaffFromAbsolute = (i: number, abs: number) => {
    const month = CAPACITY_SHAPE_MONTH_KEYS[i]!;
    if (staffIsAbs) {
      const absI = Math.min(50, Math.max(0, Math.round(abs)));
      const next = { ...staffMonthly, [month]: absI };
      setResourcesStaffMonthlyPattern(next);
      return;
    }
    const absI = roundStaffInt(abs);
    const mult = teamBase > 1e-6 ? absI / teamBase : 1;
    patchStaffMult(month, mult);
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <h3 className="text-xs font-semibold text-foreground">Supply & holidays</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Lab slots and tech staff by month start from YAML resources. Use the chart or type whole numbers for each
          month. Combined / BAU / Project filters above are unchanged.
        </p>
        {isRunwayMultiMarketStrip(country) ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Comparing all markets: editing <span className="font-medium text-foreground/85">{focusMarket}</span>.
          </p>
        ) : null}
      </div>

      <section className="rounded-md border border-border/60 bg-muted/25 px-3 py-3 shadow-inner">
        <h4 className="text-xs font-medium text-foreground">Lab & test slots (per month)</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Baseline from YAML: <span className="font-medium tabular-nums text-foreground/90">{labBase}</span> (testing
          capacity if set, otherwise lab count).
        </p>
        <WeightingLineMiniChart
          values={labsAbsSeries}
          ariaLabel={`Lab and test slots by month for ${focusMarket}`}
          yDomain={labsYDomain}
          height={72}
          onPointChange={(i, v) => patchLabsFromAbsolute(i, v)}
          pointLabels={CAPACITY_SHAPE_MONTH_KEYS}
        />
        <div
          className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6"
          role="group"
          aria-label="Lab and test slots per month, whole numbers"
        >
          {CAPACITY_SHAPE_MONTH_KEYS.map((month, i) => (
            <PatternUnitField
              key={`lab-int-${month}`}
              id={`tech-cap-labs-int-${month}`}
              label={month}
              value={labsAbsSeries[i]!}
              roundUnit={roundLabInt}
              clampDecimal={clampLabInt}
              onCommit={(n) => patchLabsFromAbsolute(i, n)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-md border border-border/60 bg-muted/25 px-3 py-3 shadow-inner">
        <h4 className="text-xs font-medium text-foreground">Tech staff (per month)</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {staffIsAbs ? (
            <>
              YAML uses <span className="font-medium text-foreground/90">absolute</span> headcount per month (
              <span className="font-mono text-foreground/85">monthly_pattern_basis: absolute</span>
              ). Reference capacity:{' '}
              <span className="font-medium tabular-nums text-foreground/90">{teamBase}</span> people.
            </>
          ) : (
            <>
              Baseline from YAML:{' '}
              <span className="font-medium tabular-nums text-foreground/90">{teamBase}</span> people (staff
              capacity).
            </>
          )}
        </p>
        <WeightingLineMiniChart
          values={staffAbsSeries}
          ariaLabel={`Tech staff headcount by month for ${focusMarket}`}
          yDomain={staffYDomain}
          height={72}
          onPointChange={(i, v) => patchStaffFromAbsolute(i, v)}
          pointLabels={CAPACITY_SHAPE_MONTH_KEYS}
        />
        <div
          className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6"
          role="group"
          aria-label="Tech staff per month, whole people"
        >
          {CAPACITY_SHAPE_MONTH_KEYS.map((month, i) => (
            <PatternUnitField
              key={`staff-int-${month}`}
              id={`tech-cap-staff-int-${month}`}
              label={month}
              value={staffAbsSeries[i]!}
              roundUnit={roundStaffInt}
              clampDecimal={clampStaffInt}
              onCommit={(n) => patchStaffFromAbsolute(i, n)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-md border border-border/60 bg-muted/25 px-3 py-3 shadow-inner">
        <h4 className="text-xs font-medium text-foreground">Holiday staffing</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Lab and Market IT ceilings on public or school holiday days (taper still applies from YAML).
        </p>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-foreground">Public holidays — staffing</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={12}
                max={100}
                step={1}
                value={Math.round(publicHol * 100)}
                onChange={(e) => setHolidayStaffingMultiplier('public', Number(e.target.value) / 100)}
                className={TUNING_RANGE}
                aria-label="Public holiday staffing percent"
              />
              <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                {Math.round(publicHol * 100)}%
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-foreground">School holidays — staffing</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={12}
                max={100}
                step={1}
                value={Math.round(schoolHol * 100)}
                onChange={(e) => setHolidayStaffingMultiplier('school', Number(e.target.value) / 100)}
                className={TUNING_RANGE}
                aria-label="School holiday staffing percent"
              />
              <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                {Math.round(schoolHol * 100)}%
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
