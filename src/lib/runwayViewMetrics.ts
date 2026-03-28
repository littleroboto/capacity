import type { RiskRow } from '@/engine/riskModel';
import {
  DEFAULT_RISK_TUNING,
  normalizedRiskWeights,
  STORE_PRESSURE_MAX,
  type RiskModelTuning,
} from '@/engine/riskModelTuning';
import type { ViewModeId } from '@/lib/constants';
import { isGregorianChristmasDay } from '@/engine/weighting';

/** Technology lens: lab/team/backend utilisation only (0–1). */
export function technologyHeatmapMetric(row: RiskRow): number {
  return Math.min(1, Math.max(0, row.tech_pressure ?? 0));
}

/**
 * Runway cell value per view: **Technology** = {@link technologyHeatmapMetric}; **Business** = {@link inStoreHeatmapMetric}.
 */
export function heatmapCellMetric(
  row: RiskRow,
  mode: ViewModeId,
  tuning: RiskModelTuning = DEFAULT_RISK_TUNING
): number {
  switch (mode) {
    case 'combined':
      return technologyHeatmapMetric(row);
    case 'in_store':
      return inStoreHeatmapMetric(row, tuning);
    default:
      return technologyHeatmapMetric(row);
  }
}

/**
 * **Business** heatmap: amplified store-trading pressure (live campaigns boost base rhythm in the pipeline),
 * a marketing-weight term during **prep only** (stores stay near BAU), holidays, and no separate campaign
 * weight during **live** (avoid double-counting with store amplification).
 */
export function inStoreHeatmapMetric(
  row: RiskRow,
  tuning: RiskModelTuning = DEFAULT_RISK_TUNING
): number {
  const store = Math.min(STORE_PRESSURE_MAX, Math.max(0, row.store_pressure ?? 0));
  const inPrepOnly = Boolean(row.campaign_in_prep) && !row.campaign_in_live;
  const camp = inPrepOnly ? Math.min(1, Math.max(0, row.campaign_risk ?? 0)) : 0;
  const holidayTerm = row.holiday_flag && !isGregorianChristmasDay(row.date) ? 1 : 0;
  const w = normalizedRiskWeights(tuning);
  let wStore = w.store;
  let wCamp = w.campaign;
  const wHol = w.holiday;
  if (row.campaign_in_live) {
    wCamp = 0;
  }
  const denom = wStore + wCamp + wHol;
  if (denom < 1e-9) {
    const holidayLift = holidayTerm ? 0.22 : 0;
    return Math.min(1, Math.max(store, camp, holidayLift));
  }
  const blend =
    (wStore / denom) * store + (wCamp / denom) * camp + (wHol / denom) * holidayTerm;
  return Math.min(1, Math.max(0, blend));
}
