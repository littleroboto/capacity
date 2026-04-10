import type { ViewModeId } from '@/lib/constants';
import {
  applyRiskHeatmapTailPower,
  applyRiskHeatmapTransfer,
  type RiskHeatmapCurveId,
} from '@/lib/riskHeatmapTransfer';

/**
 * **10 discrete bands** (low → high): **deep blue → blue-cyan → cyan → green → yellow-green → yellow → soft orange →
 * bright orange → red → deep burgundy red** (weather-style; peak is darker red, not more orange).
 *
 * Cells map **transformed** 0–1 (curve + γ + optional tail power) into equal-width bins via {@link heatmapColorDiscrete}; with a
 * steep power curve (small γ), mid raw scores can land high on that scale — see legend note in UI.
 * {@link heatmapColorContinuous} lerps these anchors for smooth ramps.
 */
export const RISK_HEATMAP_COLORS = [
  '#2b6cb0',
  '#2c9bcb',
  '#34c6c3',
  '#6edb8f',
  '#b8e986',
  '#f6e05e',
  '#f6ad55',
  '#f97316',
  '#dc2626',
  '#7f1d1d',
] as const;

/** Tooltip / aria text per {@link RISK_HEATMAP_COLORS} band (0 = lowest on heatmap scale). */
export const HEATMAP_TEMPERATURE_BAND_LABELS = [
  'Lowest · deep blue',
  'Very low · blue to cyan',
  'Low · cyan',
  'Below mid · green',
  'Mid · yellow-green',
  'Above mid · yellow',
  'High · soft orange',
  'High+ · orange',
  'Very high · red',
  'Peak · deep red',
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

/** How spectrum maps transformed 0–1 to colour (ignored when {@link HeatmapColorOpts.renderStyle} is `mono`). */
export type HeatmapSpectrumMode = 'discrete' | 'continuous';

export type HeatmapColorOpts = {
  /** Transfer curve id (`power` = score^γ); applied after normalising the lens metric. */
  riskHeatmapCurve?: RiskHeatmapCurveId;
  /** γ for power/sigmoid/log; persisted in app storage (not market YAML). */
  riskHeatmapGamma?: number;
  /**
   * Second power ≥1 after the transfer curve: `clamp01(transfer(t)^p)`. &gt;1 spreads similar high-risk
   * days across more bands (Settings only; not synced to YAML).
   */
  riskHeatmapTailPower?: number;
  /**
   * Global linear shift added to each lens’s heatmap input (0–1, after any headroom→stress flip) before clamp and
   * transfer — same value for single- and multi-market views (not YAML).
   */
  businessHeatmapPressureOffset?: number;
  /** Default spectrum bands; mono uses {@link monoColor} with alpha from transformed 0–1. */
  renderStyle?: HeatmapRenderStyle;
  /**
   * Spectrum fill: equal-width bands ({@link heatmapColorDiscrete}) vs smooth RGB lerp ({@link heatmapColorContinuous}).
   * Default `discrete`.
   */
  heatmapSpectrumMode?: HeatmapSpectrumMode;
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
  const curve = opts?.riskHeatmapCurve ?? 'sigmoid';
  const gamma = opts?.riskHeatmapGamma ?? 1;
  v = applyRiskHeatmapTransfer(v, curve, gamma);
  v = applyRiskHeatmapTailPower(v, opts?.riskHeatmapTailPower ?? 1);
  return Math.min(1, Math.max(0, v));
}

/**
 * Maps a view’s heatmap metric through optional γ into discrete temperature-band colours.
 * **Technology** (`combined`, `code`) passes **headroom** 0–1; colour uses **stress** = 1 − headroom so
 * tighter capacity reads hotter. **Global pressure offset** (see opts) shifts that 0–1 input (all lenses) before transfer.
 */
export function heatmapColorForViewMode(
  mode: ViewModeId,
  metric: number | undefined,
  opts?: HeatmapColorOpts
): string {
  let colorMetric = metric;
  if ((mode === 'combined' || mode === 'code') && metric != null && !Number.isNaN(metric)) {
    colorMetric = Math.min(1, Math.max(0, 1 - metric));
  }
  if (colorMetric != null && !Number.isNaN(colorMetric)) {
    const d = opts?.businessHeatmapPressureOffset ?? 0;
    colorMetric = Math.min(1, Math.max(0, colorMetric + d));
  }
  const t = heatmapTransformedMetric01(colorMetric, opts);
  if (t == null) return EMPTY_CELL_FILL;

  if (opts?.renderStyle === 'mono') {
    const hex = normalizeHeatmapMonoHex(opts.monoColor ?? '');
    const alpha = MONO_ALPHA_MIN + t * (1 - MONO_ALPHA_MIN);
    return hexToRgba(hex, alpha);
  }

  const spectrumMode = opts?.heatmapSpectrumMode ?? 'discrete';
  return spectrumMode === 'continuous' ? heatmapColorContinuous(t) : heatmapColorDiscrete(t);
}

/**
 * Face **base** colour at transformed heat `t` ∈ [0, 1] — same space as {@link transformedHeatmapMetric} /
 * extrusion height (after lens stress flip and transfer curve). Used for iso intro animation between grey and final.
 */
export function heatmapAppearanceAtTransformedT(opts: HeatmapColorOpts | undefined, t: number): string {
  const u = Math.min(1, Math.max(0, t));
  if (opts?.renderStyle === 'mono') {
    const hex = normalizeHeatmapMonoHex(opts.monoColor ?? '');
    return hexToRgba(hex, MONO_ALPHA_MIN + u * (1 - MONO_ALPHA_MIN));
  }
  const spectrumMode = opts?.heatmapSpectrumMode ?? 'discrete';
  return spectrumMode === 'continuous' ? heatmapColorContinuous(u) : heatmapColorDiscrete(u);
}

/**
 * Legend swatch for discrete band `bandFromLow` (0 = lowest, n−1 = highest). Matches runway cell colours:
 * **spectrum** — {@link heatmapColorDiscrete} at the bin centre (same as a cell whose transformed metric falls in that bin).
 * **mono** — alpha from that same transformed-space bin centre (curve/γ are **not** applied again; they only apply to raw cell metrics via {@link heatmapColorForViewMode}).
 */
export function heatmapLegendSwatchAtBand(bandFromLow: number, opts?: HeatmapColorOpts): string {
  const n = HEATMAP_TEMPERATURE_STEP_COUNT;
  const b = Math.min(n - 1, Math.max(0, bandFromLow));
  const tBinCentre = (b + 0.5) / n;
  if (opts?.renderStyle === 'mono') {
    const hex = normalizeHeatmapMonoHex(opts.monoColor ?? '');
    return hexToRgba(hex, MONO_ALPHA_MIN + tBinCentre * (1 - MONO_ALPHA_MIN));
  }
  const spectrumMode = opts?.heatmapSpectrumMode ?? 'discrete';
  return spectrumMode === 'continuous'
    ? heatmapColorContinuous(tBinCentre)
    : heatmapColorDiscrete(tBinCentre);
}

/**
 * CSS `linear-gradient` for the vertical heatmap legend when spectrum is **continuous** (high at top).
 * Mono mode uses smooth alpha along transformed 0–1.
 */
export function heatmapSpectrumLegendGradientCss(opts?: HeatmapColorOpts): string {
  const steps = 40;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const t = 1 - u;
    const color =
      opts?.renderStyle === 'mono'
        ? hexToRgba(
            normalizeHeatmapMonoHex(opts.monoColor ?? ''),
            MONO_ALPHA_MIN + t * (1 - MONO_ALPHA_MIN)
          )
        : heatmapColorContinuous(t);
    parts.push(`${color} ${(u * 100).toFixed(2)}%`);
  }
  return `linear-gradient(to bottom, ${parts.join(', ')})`;
}

/**
 * Same normalisation and transfer as {@link heatmapColorForViewMode}, but returns the continuous 0–1 value
 * (for extrusion height, sparklines, etc.) instead of a discrete band colour.
 */
export function transformedHeatmapMetric(
  mode: ViewModeId,
  metric: number | undefined,
  opts?: HeatmapColorOpts
): number {
  let colorMetric = metric;
  if ((mode === 'combined' || mode === 'code') && metric != null && !Number.isNaN(metric)) {
    colorMetric = Math.min(1, Math.max(0, 1 - metric));
  }
  if (colorMetric != null && !Number.isNaN(colorMetric)) {
    const d = opts?.businessHeatmapPressureOffset ?? 0;
    colorMetric = Math.min(1, Math.max(0, colorMetric + d));
  }
  return heatmapTransformedMetric01(colorMetric, opts) ?? 0;
}

