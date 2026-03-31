import { tradingMonthKeyFromIsoDate } from '@/lib/calendarMonthKey';
import type { AggregatedDay } from './phaseEngine';
import type { MarketConfig } from './types';

export type CapacityRow = AggregatedDay & {
  lab_utilisation: number;
  team_utilisation: number;
  backend_pressure: number;
  /** Load ÷ cap without a 1.0 ceiling (can exceed 1 when over capacity). */
  lab_load_ratio: number;
  team_load_ratio: number;
  backend_load_ratio: number;
  /** Effective denominators for the day (after holiday / school cap multipliers). */
  labs_effective_cap: number;
  teams_effective_cap: number;
  backend_effective_cap: number;
};

export function computeCapacity(
  dailyRows: AggregatedDay[],
  configs: MarketConfig[],
  /**
   * 0 = no holiday capacity pinch, 1 = full `holidayCapacityScale` effect.
   * Use a step function or tapered proximity from `holidayProximityStrength`.
   */
  holidayCapacityStress: (market: string, date: string) => number = () => 0,
  /** Default lab/team capacity multiplier when stress = 1 (per-market YAML may override). */
  defaultHolidayCapacityScale: number = 0.5,
  /** Extra multiplier on lab/team caps (e.g. school-holiday staffing pinch from YAML). */
  schoolLabTeamCapMult: (market: string, date: string) => number = () => 1,
  /**
   * Target lab+team cap scale when holiday stress = 1 (clamped 0.12–1). Tapered days still blend
   * toward this. Defaults to per-market `holidayLabCapacityScale` or `defaultHolidayCapacityScale`.
   */
  holidayCapScaleAtFullStress?: (market: string, date: string) => number
): CapacityRow[] {
  const capByMarket: Record<
    string,
    {
      labs: number;
      testingCapacity?: number;
      teams: number;
      backend: number;
      holidayLabCapacityScale?: number;
      monthlyLabs?: Record<string, number>;
      monthlyStaff?: Record<string, number>;
      staffMonthlyAbsolute?: boolean;
      techAvailable?: Record<string, number>;
    }
  > = {};
  for (const c of configs) {
    capByMarket[c.market] = {
      labs: c.capacity.labs ?? 5,
      testingCapacity: c.testingCapacity,
      teams: c.capacity.teams ?? 4,
      backend: c.capacity.backend ?? 1000,
      holidayLabCapacityScale: c.holidayLabCapacityScale,
      monthlyLabs: c.monthlyLabsCapacityPattern,
      monthlyStaff: c.monthlyStaffCapacityPattern,
      staffMonthlyAbsolute: c.staffMonthlyPatternBasis === 'absolute',
      techAvailable: c.techAvailableCapacityPattern,
    };
  }

  return dailyRows.map((r) => {
    const cap = capByMarket[r.market] || {
      labs: 5,
      teams: 4,
      backend: 1000,
    };
    const stress = Math.min(1, Math.max(0, holidayCapacityStress(r.market, r.date)));
    const perMarketHol = cap.holidayLabCapacityScale;
    const baseHol =
      perMarketHol != null && Number.isFinite(perMarketHol)
        ? Math.min(1, Math.max(0.12, perMarketHol))
        : defaultHolidayCapacityScale;
    const fromCallback = holidayCapScaleAtFullStress?.(r.market, r.date);
    const scaleOnHoliday = Math.min(
      1,
      Math.max(
        0.12,
        fromCallback != null && Number.isFinite(fromCallback)
          ? Math.min(1, Math.max(0.12, fromCallback))
          : Math.min(1, Math.max(0.25, baseHol))
      )
    );
    const scale = 1 + (scaleOnHoliday - 1) * stress;
    const schoolM = Math.min(1.05, Math.max(0.65, schoolLabTeamCapMult(r.market, r.date)));
    const monthK = tradingMonthKeyFromIsoDate(r.date);
    const labMonth = cap.monthlyLabs?.[monthK];
    const staffMonth = cap.monthlyStaff?.[monthK];
    const availMonth = cap.techAvailable?.[monthK];
    const labShape = labMonth != null && Number.isFinite(labMonth) ? labMonth : 1;
    const teamsBase = cap.teams || 4;
    const staffShape =
      staffMonth != null && Number.isFinite(staffMonth)
        ? staffMonth
        : cap.staffMonthlyAbsolute
          ? teamsBase
          : 1;
    const availShape = availMonth != null && Number.isFinite(availMonth) ? availMonth : 1;
    const labDenom = cap.testingCapacity ?? cap.labs ?? 5;
    const labsCap = (labDenom || 5) * labShape * scale * schoolM * availShape;
    const teamsCap = cap.staffMonthlyAbsolute
      ? staffShape * scale * schoolM * availShape
      : teamsBase * staffShape * scale * schoolM * availShape;
    const backendCap = cap.backend || 1000;

    const lab_load_ratio = labsCap > 0 ? Math.max(0, (r.lab_load || 0) / labsCap) : 0;
    const team_load_ratio = teamsCap > 0 ? Math.max(0, (r.team_load || 0) / teamsCap) : 0;
    const backend_load_ratio = backendCap > 0 ? Math.max(0, (r.backend_load || 0) / backendCap) : 0;
    const lab_utilisation = Math.min(1, lab_load_ratio);
    const team_utilisation = Math.min(1, team_load_ratio);
    const backend_pressure = Math.min(1, backend_load_ratio);

    return {
      ...r,
      lab_utilisation,
      team_utilisation,
      backend_pressure,
      lab_load_ratio,
      team_load_ratio,
      backend_load_ratio,
      labs_effective_cap: labsCap,
      teams_effective_cap: teamsCap,
      backend_effective_cap: backendCap,
    };
  });
}
