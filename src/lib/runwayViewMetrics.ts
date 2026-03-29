import type { RiskRow } from '@/engine/riskModel';
import { DEFAULT_RISK_TUNING, STORE_PRESSURE_MAX, type RiskModelTuning } from '@/engine/riskModelTuning';
import type { ViewModeId } from '@/lib/constants';

/** Technology lens: uncapped demand vs caps (can exceed 1); heatmap colour still clamps for the ramp. */
export function technologyHeatmapMetric(row: RiskRow): number {
  const u = row.tech_demand_ratio ?? row.tech_pressure ?? 0;
  return Math.max(0, u);
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
 * **Business** heatmap: modeled **restaurant / store trading** intensity only — the `store_pressure` lane
 * (weekly × monthly × seasonal rhythm, public-holiday trading multiplier, live campaign **store** boost and
 * prep **store** boost from YAML if any, then operating-window store multipliers). Does **not** blend in
 * marketing `campaign_risk` or a separate holiday dial; those stay in combined risk.
 */
export function inStoreHeatmapMetric(
  row: RiskRow,
  _tuning: RiskModelTuning = DEFAULT_RISK_TUNING
): number {
  const store = Math.min(STORE_PRESSURE_MAX, Math.max(0, row.store_pressure ?? 0));
  return Math.min(1, Math.max(0, store / STORE_PRESSURE_MAX));
}
