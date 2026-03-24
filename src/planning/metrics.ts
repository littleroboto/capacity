import { RISK_BANDS } from '@/lib/constants';
import type { RiskRow } from '@/engine/riskModel';
import type { SimulationSummary } from '@/domain/types';

/** Derive planning-oriented summary stats from the runway risk surface. */
export function simulationSummaryFromRiskRows(rows: RiskRow[]): SimulationSummary {
  if (rows.length === 0) {
    return {
      peakRisk: 0,
      peakRiskDate: '',
      highBandDayCount: 0,
      overloadArea: 0,
      nominalBreachDayCount: 0,
      criticalFunctionBreaches: [],
    };
  }

  let peakRisk = 0;
  let peakRiskDate = rows[0]!.date;
  let highBandDayCount = 0;
  let overloadArea = 0;
  let anyNominalBreachDays = 0;
  let labBreachDays = 0;
  let teamBreachDays = 0;
  let backendBreachDays = 0;

  for (const r of rows) {
    const rs = r.risk_score ?? 0;
    overloadArea += rs;
    if (rs > peakRisk) {
      peakRisk = rs;
      peakRiskDate = r.date;
    }
    if (rs >= (RISK_BANDS.high.min ?? 0.66)) highBandDayCount += 1;

    const labCap = r.labs_effective_cap ?? 0;
    const teamCap = r.teams_effective_cap ?? 0;
    const backCap = r.backend_effective_cap ?? 0;
    const labOver = labCap > 0 && (r.lab_load ?? 0) > labCap;
    const teamOver = teamCap > 0 && (r.team_load ?? 0) > teamCap;
    const backOver = backCap > 0 && (r.backend_load ?? 0) > backCap;
    if (labOver) labBreachDays += 1;
    if (teamOver) teamBreachDays += 1;
    if (backOver) backendBreachDays += 1;
    if (labOver || teamOver || backOver) anyNominalBreachDays += 1;
  }

  return {
    peakRisk: Math.round(peakRisk * 100) / 100,
    peakRiskDate,
    highBandDayCount,
    overloadArea: Math.round(overloadArea * 100) / 100,
    nominalBreachDayCount: anyNominalBreachDays,
    criticalFunctionBreaches: [
      { functionId: 'lab_engineering', dayCount: labBreachDays },
      { functionId: 'delivery_teams', dayCount: teamBreachDays },
      { functionId: 'platform_backend', dayCount: backendBreachDays },
    ],
  };
}
