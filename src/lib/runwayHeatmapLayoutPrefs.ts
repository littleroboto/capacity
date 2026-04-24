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
