import type { AggregatedDay } from '@/engine/phaseEngine';
import { addSliceToSurface, recomputeAggregatedTotals } from '@/engine/phaseEngine';
import { emptySurfaceSlice } from '@/domain/pressureSurfaces';
import type { MarketConfig } from '@/engine/types';

export type CarryoverOptions = {
  /** Fraction of **intrinsic** overload (demand above cap excluding carry-in) that enters backlog. */
  overloadToCarryRate: number;
  decayPerDay: number;
  /** Clamp backlog so it cannot exceed `mult × nominal cap` per bucket (stops runaway under sustained campaigns). */
  maxCarryMultVsCap: number;
};

const DEFAULT_CARRY: CarryoverOptions = {
  /** 0 = do not roll intrinsic overload into future days; same-day load stays visible as >100% util. */
  overloadToCarryRate: 0,
  decayPerDay: 0.92,
  maxCarryMultVsCap: 1.25,
};

function carriedLab(row: AggregatedDay): number {
  const c = row.surfaceTotals.carryover;
  return c.lab_readiness + c.lab_sustain;
}

function carriedTeam(row: AggregatedDay): number {
  const c = row.surfaceTotals.carryover;
  return c.team_readiness + c.team_sustain;
}

function carriedBackend(row: AggregatedDay): number {
  const c = row.surfaceTotals.carryover;
  return c.backend_readiness + c.backend_sustain;
}

/**
 * Deterministic backlog spill: **intrinsic** overload vs nominal YAML capacity rolls forward on the
 * `carryover` surface. Overload from carry-in itself does not feed new carry (avoids positive feedback).
 * Runs before operating-window multipliers.
 */
export function applyLoadCarryover(
  rows: AggregatedDay[],
  configs: MarketConfig[],
  opts: CarryoverOptions = DEFAULT_CARRY
): void {
  const nominal: Record<string, { labs: number; teams: number; backend: number }> = {};
  for (const c of configs) {
    nominal[c.market] = {
      labs: c.capacity.labs ?? 5,
      teams: c.capacity.teams ?? 4,
      backend: c.capacity.backend ?? 1000,
    };
  }

  const byMarket = new Map<string, AggregatedDay[]>();
  for (const r of rows) {
    if (!byMarket.has(r.market)) byMarket.set(r.market, []);
    byMarket.get(r.market)!.push(r);
  }

  for (const [, list] of byMarket) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    let carryLab = 0;
    let carryTeam = 0;
    let carryBack = 0;

    for (const row of list) {
      const cap = nominal[row.market] ?? { labs: 5, teams: 4, backend: 1000 };
      carryLab *= opts.decayPerDay;
      carryTeam *= opts.decayPerDay;
      carryBack *= opts.decayPerDay;

      if (carryLab !== 0 || carryTeam !== 0 || carryBack !== 0) {
        const slice = emptySurfaceSlice();
        slice.lab_readiness = carryLab;
        slice.team_readiness = carryTeam;
        slice.backend_readiness = carryBack;
        addSliceToSurface(row, 'carryover', slice);
        recomputeAggregatedTotals(row);
      }

      // Only intrinsic demand (scheduled surfaces) can create *new* backlog; ignore overload purely from carry-in.
      const intrinsicLab = row.lab_load - carriedLab(row);
      const intrinsicTeam = row.team_load - carriedTeam(row);
      const intrinsicBack = row.backend_load - carriedBackend(row);
      const rawExLab = Math.max(0, intrinsicLab - cap.labs);
      const rawExTeam = Math.max(0, intrinsicTeam - cap.teams);
      const rawExBack = Math.max(0, intrinsicBack - cap.backend);
      carryLab += rawExLab * opts.overloadToCarryRate;
      carryTeam += rawExTeam * opts.overloadToCarryRate;
      carryBack += rawExBack * opts.overloadToCarryRate;

      const m = opts.maxCarryMultVsCap;
      if (m > 0 && Number.isFinite(m)) {
        carryLab = Math.min(carryLab, cap.labs * m);
        carryTeam = Math.min(carryTeam, cap.teams * m);
        carryBack = Math.min(carryBack, cap.backend * m);
      }
    }
  }
}
