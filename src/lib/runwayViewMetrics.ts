import type { RiskRow } from '@/engine/riskModel';
import { DEFAULT_RISK_TUNING, normalizedRiskWeights, type RiskModelTuning } from '@/engine/riskModelTuning';
import { isGregorianChristmasDay } from '@/engine/weighting';

/**
 * Single 0–1 value for the **Business** heatmap: blends store pressure, campaign pressure, and holiday
 * emphasis using the same Restaurant / Marketing / Resources **weights** as the combined pressure model
 * (renormalised over those three so Tech does not dilute the business lens). Shows campaign windows and
 * trading rhythm relative to each other instead of a hard max().
 */
export function inStoreHeatmapMetric(
  row: RiskRow,
  tuning: RiskModelTuning = DEFAULT_RISK_TUNING
): number {
  const store = Math.min(1, Math.max(0, row.store_pressure ?? 0));
  const camp = Math.min(1, Math.max(0, row.campaign_risk ?? 0));
  const holidayTerm = row.holiday_flag && !isGregorianChristmasDay(row.date) ? 1 : 0;
  const w = normalizedRiskWeights(tuning);
  const denom = w.store + w.campaign + w.holiday;
  if (denom < 1e-9) {
    const holidayLift = holidayTerm ? 0.22 : 0;
    return Math.min(1, Math.max(store, camp, holidayLift));
  }
  const blend =
    (w.store / denom) * store + (w.campaign / denom) * camp + (w.holiday / denom) * holidayTerm;
  return Math.min(1, Math.max(0, blend));
}
