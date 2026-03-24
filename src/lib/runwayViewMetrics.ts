import type { RiskRow } from '@/engine/riskModel';
import { isGregorianChristmasDay } from '@/engine/weighting';

/**
 * Same blend as `tech_pressure` in the risk model, but **not** capped at 1 so overloaded days
 * (load above effective cap) show a spread on the heatmap instead of a flat red wall.
 */
export function techHeatmapMetric(row: RiskRow): number {
  const labsCap = row.labs_effective_cap ?? 0;
  const teamsCap = row.teams_effective_cap ?? 0;
  const backCap = row.backend_effective_cap ?? 0;
  const labU = labsCap > 0 ? (row.lab_load ?? 0) / labsCap : 0;
  const teamU = teamsCap > 0 ? (row.team_load ?? 0) / teamsCap : 0;
  const backU = backCap > 0 ? (row.backend_load ?? 0) / backCap : 0;
  return Math.min(2.5, Math.max(labU, teamU, backU * 0.5));
}

/**
 * Single 0–1 value for the **Business** heatmap: trading rhythm, campaign impact, and a modest lift on
 * public/school holidays so those days are not visually “quiet” when trading pattern alone is low.
 * Tooltip lists store line, campaigns, and holiday flags explicitly.
 */
export function inStoreHeatmapMetric(row: RiskRow): number {
  const holidayLift = row.holiday_flag && !isGregorianChristmasDay(row.date) ? 0.22 : 0;
  return Math.min(1, Math.max(row.store_pressure, row.campaign_risk, holidayLift));
}
