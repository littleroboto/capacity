import type { ViewModeId } from '@/lib/constants';
import {
  applyRiskHeatmapTransfer,
  type RiskHeatmapCurveId,
} from '@/lib/riskHeatmapTransfer';

/**
 * Anchor stops for the heatmap ramp (green → amber → red). Cells use {@link heatmapColorContinuous}
 * so Technology and Business lenses share the same granular scale; patterns differ by metric per day.
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

/** Legacy 10-bucket mapping; runway uses {@link heatmapColorContinuous} for both view modes. */
export function riskScoreToHeatmapColor(riskScore: number | undefined): string {
  if (riskScore == null || Number.isNaN(riskScore)) return EMPTY_CELL_FILL;
  const r = Math.min(1, Math.max(0, riskScore));
  const index = Math.floor(r * 9);
  return RISK_HEATMAP_COLORS[index] ?? RISK_HEATMAP_COLORS[RISK_HEATMAP_COLORS.length - 1]!;
}

function parseRgbHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseRgbHex(a);
  const [br, bg, bb] = parseRgbHex(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Smooth ramp along {@link RISK_HEATMAP_COLORS} — used for both runway lenses after transfer. */
export function heatmapColorContinuous(
  metric01: number,
  palette: readonly string[] = RISK_HEATMAP_COLORS
): string {
  const r = Math.min(1, Math.max(0, metric01));
  if (palette.length < 2) return palette[0] ?? EMPTY_CELL_FILL;
  const x = r * (palette.length - 1);
  const i = Math.floor(x);
  const t = x - i;
  const j = Math.min(i + 1, palette.length - 1);
  return lerpHex(palette[i]!, palette[j]!, t);
}

/** Min–max of a metric over the visible runway; stretches tech/store colours when absolute values sit in a narrow band. */
export type RunwayNormRange = { min: number; max: number };

export type HeatmapColorOpts = {
  /** Transfer curve id (`power` = score^γ); applied after normalising the lens metric. */
  riskHeatmapCurve?: RiskHeatmapCurveId;
  /** γ for power/sigmoid/log; stored as `risk_heatmap_gamma`. */
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
  if (norm && norm.max > norm.min && mode === 'in_store') {
    v = (metric - norm.min) / (norm.max - norm.min);
    v = Math.min(1, Math.max(0, v));
  } else {
    v = Math.min(1, Math.max(0, v));
  }

  const curve = opts?.riskHeatmapCurve ?? 'power';
  const gamma = opts?.riskHeatmapGamma ?? 1;
  v = applyRiskHeatmapTransfer(v, curve, gamma);

  const cut = opts?.stressCutoff;
  if (cut != null && cut > 1e-6 && cut < 1 - 1e-6) {
    if (v < cut) return STRESS_BELOW_CUTOFF_FILL;
    const span = 1 - cut;
    v = span > 1e-9 ? (v - cut) / span : 1;
    v = Math.min(1, Math.max(0, v));
  }

  return heatmapColorContinuous(v);
}
