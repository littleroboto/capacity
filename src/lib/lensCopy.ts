import { runwayHeatmapTitleForViewMode, VIEW_MODES, type ViewModeId } from '@/lib/constants';

/**
 * Single place for runway lens UI strings derived from {@link VIEW_MODES}.
 * When renaming lenses, update `constants.ts` only; blend captions follow automatically.
 *
 * Regression check (run from repo root): `rg -n 'technology lens|Technology lens|tech_pressure|deployment_risk|store_pressure' src --glob '*.tsx' --glob '*.ts' | rg -v constants.ts | rg -v lensCopy.ts | rg -v riskModel`
 */

export function lensNavLabel(id: ViewModeId): string {
  return VIEW_MODES.find((v) => v.id === id)?.label ?? VIEW_MODES[0].label;
}

export function lensHeatmapHeading(id: ViewModeId): string {
  return runwayHeatmapTitleForViewMode(id);
}

/** Tooltip / blend row: ties the breakdown row to the active heatmap lens. */
export function lensHeatmapBlendCaption(id: ViewModeId): string {
  return `${runwayHeatmapTitleForViewMode(id)} (this heatmap)`;
}

export function lensLongDescription(id: ViewModeId): string {
  return VIEW_MODES.find((v) => v.id === id)?.title ?? VIEW_MODES[0].title;
}
