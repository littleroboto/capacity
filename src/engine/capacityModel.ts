import type { AggregatedDay } from './phaseEngine';
import type { MarketConfig } from './types';

export type CapacityRow = AggregatedDay & {
  lab_utilisation: number;
  team_utilisation: number;
  backend_pressure: number;
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
    { labs: number; testingCapacity?: number; teams: number; backend: number; holidayLabCapacityScale?: number }
  > = {};
  for (const c of configs) {
    capByMarket[c.market] = {
      labs: c.capacity.labs ?? 5,
      testingCapacity: c.testingCapacity,
      teams: c.capacity.teams ?? 6,
      backend: c.capacity.backend ?? 1000,
      holidayLabCapacityScale: c.holidayLabCapacityScale,
    };
  }

  return dailyRows.map((r) => {
    const cap = capByMarket[r.market] || {
      labs: 5,
      teams: 6,
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
    const labDenom = cap.testingCapacity ?? cap.labs ?? 5;
    const labsCap = (labDenom || 5) * scale * schoolM;
    const teamsCap = (cap.teams || 6) * scale * schoolM;
    const backendCap = cap.backend || 1000;

    const lab_utilisation = labsCap > 0 ? Math.min(1, (r.lab_load || 0) / labsCap) : 0;
    const team_utilisation = teamsCap > 0 ? Math.min(1, (r.team_load || 0) / teamsCap) : 0;
    const backend_pressure = backendCap > 0 ? Math.min(1, (r.backend_load || 0) / backendCap) : 0;

    return {
      ...r,
      lab_utilisation,
      team_utilisation,
      backend_pressure,
      labs_effective_cap: labsCap,
      teams_effective_cap: teamsCap,
      backend_effective_cap: backendCap,
    };
  });
}
