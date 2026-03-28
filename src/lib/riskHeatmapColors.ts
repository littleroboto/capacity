import type { ViewModeId } from '@/lib/constants';
import {
  applyRiskHeatmapTransfer,
  type RiskHeatmapCurveId,
} from '@/lib/riskHeatmapTransfer';

/**
 * **9 discrete bands** (low → high): classic **temperature / weather-radar** order — calm ice → blues →
 * cyan → green → yellow → orange → red — as flat swatches tuned for modern UI (readable on grid cells).
 * Runway cells pick one colour per band after clamp 0–1 and γ ({@link heatmapColorDiscrete}).
 * {@link heatmapColorContinuous} lerps these anchors for smooth ramps.
 */
export const RISK_HEATMAP_COLORS = [
  '#f0f9ff',
  '#bae6fd',
  '#0ea5e9',
  '#06b6d4',
  '#34d399',
  '#facc15',
  '#fb923c',
  '#ef4444',
  '#ff1f1f',
] as const;

/** One label per {@link RISK_HEATMAP_COLORS} entry, index 0 = coldest / lowest KPI (temperature-scale wording). */
export const HEATMAP_TEMPERATURE_BAND_LABELS = [
  'Calm · lowest',
  'Cool',
  'Cold',
  'Chill',
  'Mild',
  'Warm',
  'Hot',
  'Very hot',
  'Extreme · highest',
] as const;

export const HEATMAP_TEMPERATURE_STEP_COUNT = RISK_HEATMAP_COLORS.length;

const EMPTY_CELL_FILL = '#94a3b8';

/** In-month calendar cells with no runway row (outside model window or missing day); adjacent-month grid slots are not drawn. */
export const HEATMAP_RUNWAY_PAD_FILL = '#cbd5e1';

/** Legacy mapping: same discrete temperature bands as the runway. */
export function riskScoreToHeatmapColor(riskScore: number | undefined): string {
  if (riskScore == null || Number.isNaN(riskScore)) return EMPTY_CELL_FILL;
  const r = Math.min(1, Math.max(0, riskScore));
  return heatmapColorDiscrete(r, RISK_HEATMAP_COLORS);
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

/** Equal-width solid bins — runway uses this for the temperature-style scale. */
export function heatmapColorDiscrete(
  metric01: number,
  palette: readonly string[] = RISK_HEATMAP_COLORS
): string {
  const r = Math.min(1, Math.max(0, metric01));
  const n = palette.length;
  if (n === 0) return EMPTY_CELL_FILL;
  if (n === 1) return palette[0]!;
  const idx = Math.min(n - 1, Math.floor(r * n));
  return palette[idx]!;
}

/** Smooth RGB lerp between consecutive anchors (classic heatmap). */
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

/** `spectrum` = temperature-style multi-band ramp; `mono` = one hue, alpha scales with transformed score. */
export type HeatmapRenderStyle = 'spectrum' | 'mono';

export type HeatmapColorOpts = {
  /** Transfer curve id (`power` = score^γ); applied after normalising the lens metric. */
  riskHeatmapCurve?: RiskHeatmapCurveId;
  /** γ for power/sigmoid/log; stored as `risk_heatmap_gamma`. */
  riskHeatmapGamma?: number;
  /** Default spectrum bands; mono uses {@link monoColor} with alpha from transformed 0–1. */
  renderStyle?: HeatmapRenderStyle;
  /** `#rrggbb` for mono mode (invalid values fall back to sky). */
  monoColor?: string;
};

/** Preset hues for the mono heatmap (Controls panel) — vivid mids for readable cells + punchy swatches. */
export const HEATMAP_MONO_COLOR_PRESETS: readonly { label: string; hex: string }[] = [
  { label: 'Sky', hex: '#0ea5e9' },
  { label: 'Cyan', hex: '#06b6d4' },
  { label: 'Amber', hex: '#fbbf24' },
  { label: 'Rose', hex: '#fb7185' },
  { label: 'Violet', hex: '#a78bfa' },
  { label: 'Emerald', hex: '#34d399' },
  { label: 'Slate', hex: '#94a3b8' },
] as const;

export const DEFAULT_HEATMAP_MONO_COLOR = HEATMAP_MONO_COLOR_PRESETS[0]!.hex;

export function normalizeHeatmapMonoHex(raw: string): string {
  let h = raw.trim();
  if (!h.startsWith('#')) h = `#${h}`;
  return parseRgbFromHex6(h) ? h : DEFAULT_HEATMAP_MONO_COLOR;
}

const MONO_ALPHA_MIN = 0.12;

function parseRgbFromHex6(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** CSS `rgba(...)` from `#rrggbb` and 0–1 alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseRgbFromHex6(hex);
  const a = Math.min(1, Math.max(0, alpha));
  if (!rgb) return `rgba(14, 165, 233, ${a})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

/** Transformed 0–1 after curve + γ; `null` if metric missing. */
export function heatmapTransformedMetric01(metric: number | undefined, opts?: HeatmapColorOpts): number | null {
  if (metric == null || Number.isNaN(metric)) return null;
  let v = Math.min(1, Math.max(0, metric));
  const curve = opts?.riskHeatmapCurve ?? 'power';
  const gamma = opts?.riskHeatmapGamma ?? 1;
  v = applyRiskHeatmapTransfer(v, curve, gamma);
  return Math.min(1, Math.max(0, v));
}

/**
 * Maps a view’s heatmap metric (already 0–1, Technology or Business) through optional γ into discrete
 * temperature-band colours — **same absolute scale for every view** (no per-runway min–max stretch).
 */
export function heatmapColorForViewMode(
  _mode: ViewModeId,
  metric: number | undefined,
  opts?: HeatmapColorOpts
): string {
  const t = heatmapTransformedMetric01(metric, opts);
  if (t == null) return EMPTY_CELL_FILL;

  if (opts?.renderStyle === 'mono') {
    const hex = normalizeHeatmapMonoHex(opts.monoColor ?? '');
    const alpha = MONO_ALPHA_MIN + t * (1 - MONO_ALPHA_MIN);
    return hexToRgba(hex, alpha);
  }

  return heatmapColorDiscrete(t);
}

/**
 * Same normalisation and transfer as {@link heatmapColorForViewMode}, but returns the continuous 0–1 value
 * (for extrusion height, sparklines, etc.) instead of a discrete band colour.
 */
export function transformedHeatmapMetric(
  _mode: ViewModeId,
  metric: number | undefined,
  opts?: HeatmapColorOpts
): number {
  return heatmapTransformedMetric01(metric, opts) ?? 0;
}

