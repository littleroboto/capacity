/**
 * Product defaults and clamps for runway heatmap cell geometry (HTML + SVG).
 * Persisted per browser via {@link useAtcStore} (localStorage); each profile keeps its own values.
 */

export const RUNWAY_HEATMAP_CELL_PX_MIN = 6;
export const RUNWAY_HEATMAP_CELL_PX_MAX = 28;
export const RUNWAY_HEATMAP_CELL_PX_STEP = 2;

export const RUNWAY_HEATMAP_CELL_GAP_MIN = 0;
export const RUNWAY_HEATMAP_CELL_GAP_MAX = 8;

export const RUNWAY_HEATMAP_CELL_RADIUS_MAX = 12;

/** New-user / “Reset to defaults” in the heatmap style popover. */
export const RUNWAY_HEATMAP_LAYOUT_DEFAULTS = {
  cellPx: 10,
  gapPx: 1,
  radiusPx: 0,
} as const;

export function snapRunwayHeatmapCellPx(n: number): number {
  if (!Number.isFinite(n)) return RUNWAY_HEATMAP_LAYOUT_DEFAULTS.cellPx;
  const s = Math.round(n / RUNWAY_HEATMAP_CELL_PX_STEP) * RUNWAY_HEATMAP_CELL_PX_STEP;
  return Math.min(RUNWAY_HEATMAP_CELL_PX_MAX, Math.max(RUNWAY_HEATMAP_CELL_PX_MIN, s));
}

export function clampRunwayHeatmapGapPx(n: number): number {
  if (!Number.isFinite(n)) return RUNWAY_HEATMAP_LAYOUT_DEFAULTS.gapPx;
  return Math.min(RUNWAY_HEATMAP_CELL_GAP_MAX, Math.max(RUNWAY_HEATMAP_CELL_GAP_MIN, Math.round(n)));
}

export function clampRunwayHeatmapRadiusPx(n: number): number {
  if (!Number.isFinite(n)) return RUNWAY_HEATMAP_LAYOUT_DEFAULTS.radiusPx;
  return Math.min(RUNWAY_HEATMAP_CELL_RADIUS_MAX, Math.max(0, Math.round(n)));
}

/** Snapped default cell size (for HTML fast-path + “at default size?” checks). */
export const RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX = snapRunwayHeatmapCellPx(
  RUNWAY_HEATMAP_LAYOUT_DEFAULTS.cellPx
);

/** Tech capacity sparkline: odd moving-average window (days with data); 0 = raw trace. */
export const RUNWAY_TECH_SPARKLINE_UTIL_SMOOTH_DEFAULT = 0;

const RUNWAY_TECH_SPARKLINE_UTIL_SMOOTH_ALLOWED = new Set([0, 3, 5, 7, 9]);

/**
 * Coerce persisted / imported values to a supported tech-sparkline smooth window.
 * Unknown positive numbers snap to the nearest allowed odd window in {3,5,7,9}.
 */
export function clampRunwayTechSparklineUtilSmoothWindow(n: unknown): number {
  if (n === null || n === undefined) return RUNWAY_TECH_SPARKLINE_UTIL_SMOOTH_DEFAULT;
  const x = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : RUNWAY_TECH_SPARKLINE_UTIL_SMOOTH_DEFAULT;
  if (RUNWAY_TECH_SPARKLINE_UTIL_SMOOTH_ALLOWED.has(x)) return x;
  if (x <= 0) return 0;
  const odds = [3, 5, 7, 9] as const;
  return odds.reduce((best, cur) => (Math.abs(cur - x) <= Math.abs(best - x) ? cur : best), 5);
}

/**
 * Value passed to {@link RunwayTechCapacityDemandSparkline}: `undefined` disables smoothing.
 * When the user preference is off but {@link opts.landingMinimalChrome} is true, keep a light default (5) for the hero preview.
 */
export function resolvedSparklineUtilSmoothWindow(
  pref: number,
  opts?: { landingMinimalChrome?: boolean },
): number | undefined {
  const w = clampRunwayTechSparklineUtilSmoothWindow(pref);
  if (w > 0) return w;
  return opts?.landingMinimalChrome ? 5 : undefined;
}
