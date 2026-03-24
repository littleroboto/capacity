import type { ViewModeId } from '@/lib/constants';
import {
  applyRiskHeatmapTransfer,
  type RiskHeatmapCurveId,
} from '@/lib/riskHeatmapTransfer';

/**
 * 10-step diverging heatmap: saturated green (low risk) → amber (mid) → red (high).
 * index = Math.floor(risk_score * 9) with risk_score clamped to [0, 1].
 */
export const RISK_HEATMAP_COLORS = [
  '#14532d', // green-900
  '#166534', // green-800
  '#15803d', // green-700
  '#16a34a', // green-600
  '#4ade80', // green-400 — still clearly “good”
  '#facc15', // amber-400 — pivot
  '#f59e0b', // amber-500
  '#ea580c', // orange-600
  '#dc2626', // red-600
  '#991b1b', // red-800
] as const;

const EMPTY_CELL_FILL = '#94a3b8';

/** In-month calendar cells with no runway row (outside model window or missing day); adjacent-month grid slots are not drawn. */
export const HEATMAP_RUNWAY_PAD_FILL = '#cbd5e1';

/** Cells with data but below the stress cutoff (distinct from empty / out-of-range). */
export const STRESS_BELOW_CUTOFF_FILL = '#d1d9e6';

export function riskScoreToHeatmapColor(riskScore: number | undefined): string {
  if (riskScore == null || Number.isNaN(riskScore)) return EMPTY_CELL_FILL;
  const r = Math.min(1, Math.max(0, riskScore));
  const index = Math.floor(r * 9);
  return RISK_HEATMAP_COLORS[index] ?? RISK_HEATMAP_COLORS[RISK_HEATMAP_COLORS.length - 1]!;
}

/** Min–max of a metric over the visible runway; stretches tech/store colours when absolute values sit in a narrow band. */
export type RunwayNormRange = { min: number; max: number };

export type HeatmapColorOpts = {
  /** Combined risk only: transfer curve id (`power` = legacy score^γ). */
  riskHeatmapCurve?: RiskHeatmapCurveId;
  /** Combined risk only: γ for power/sigmoid/log; stored as `risk_heatmap_gamma`. */
  riskHeatmapGamma?: number;
  /**
   * 0 = off. Otherwise only values **at or above** this level (0–1 scale after norm / γ) use the stress palette;
   * values below render as `STRESS_BELOW_CUTOFF_FILL`. Above the cutoff, the palette spans the remaining band.
   */
  stressCutoff?: number;
};

export function heatmapColorForViewMode(
  mode: ViewModeId,
  metric: number | undefined,
  norm?: RunwayNormRange,
  opts?: HeatmapColorOpts
): string {
  if (metric == null || Number.isNaN(metric)) return EMPTY_CELL_FILL;
  let v = metric;
  if (norm && norm.max > norm.min && (mode === 'technology' || mode === 'in_store')) {
    v = (metric - norm.min) / (norm.max - norm.min);
    v = Math.min(1, Math.max(0, v));
  } else if (mode === 'combined') {
    const curve = opts?.riskHeatmapCurve ?? 'power';
    const gamma = opts?.riskHeatmapGamma ?? 1;
    const c = Math.min(1, Math.max(0, v));
    v = applyRiskHeatmapTransfer(c, curve, gamma);
  }

  const cut = opts?.stressCutoff;
  if (cut != null && cut > 1e-6 && cut < 1 - 1e-6) {
    if (v < cut) return STRESS_BELOW_CUTOFF_FILL;
    const span = 1 - cut;
    v = span > 1e-9 ? (v - cut) / span : 1;
    v = Math.min(1, Math.max(0, v));
  }

  return riskScoreToHeatmapColor(v);
}
