import type { PressureSurfaceId } from '@/domain/pressureSurfaces';
import { emptySurfaceSlice, emptySurfaceTotals, mergeSurfaceSlices } from '@/domain/pressureSurfaces';
import type { RiskRow } from '@/engine/riskModel';
import { DEFAULT_RISK_TUNING, STORE_PRESSURE_MAX, type RiskModelTuning } from '@/engine/riskModelTuning';
import type { ViewModeId } from '@/lib/constants';
import {
  heatmapColorForViewMode,
  HEATMAP_RUNWAY_PAD_FILL,
  type HeatmapColorOpts,
} from '@/lib/riskHeatmapColors';

/**
 * Technology heatmap slice:
 * - `all` — max of lab / Market IT demand (default; backend loads still in YAML but excluded from headline)
 * - `bau` — BAU planning surface only (same max formula)
 * - `project` — change / campaign / coordination / carryover surfaces only (no separate “Market IT only” slice)
 */
export type TechWorkloadScope = 'all' | 'bau' | 'project';

const TECH_BAU_SURFACES: readonly PressureSurfaceId[] = ['bau'];

const TECH_PROJECT_SURFACES: readonly PressureSurfaceId[] = [
  'change',
  'campaign',
  'coordination',
  'carryover',
];

function techDemandRatioFromMergedLoads(
  row: RiskRow,
  merged: { lab_readiness: number; lab_sustain: number; team_readiness: number; team_sustain: number; backend_readiness: number; backend_sustain: number }
): number {
  const labsCap = row.labs_effective_cap ?? 0;
  const teamsCap = row.teams_effective_cap ?? 0;
  const labL = merged.lab_readiness + merged.lab_sustain;
  const teamL = merged.team_readiness + merged.team_sustain;
  const labR = labsCap > 0 ? labL / labsCap : 0;
  const teamR = teamsCap > 0 ? teamL / teamsCap : 0;
  return Math.max(0, labR, teamR);
}

/** Uncapped tech demand ratio from the union of the given pressure surfaces (same formula as {@link RiskRow.tech_demand_ratio}). */
export function technologyHeatmapMetricForSurfaces(
  row: RiskRow,
  surfaces: readonly PressureSurfaceId[]
): number {
  const totals = row.surfaceTotals ?? emptySurfaceTotals();
  const slices = surfaces.map((id) => totals[id] ?? emptySurfaceSlice());
  const merged = mergeSurfaceSlices(...slices);
  return techDemandRatioFromMergedLoads(row, merged);
}

/** Heading above the runway for the Technology lens + workload scope. */
export function technologyRunwayTitleForWorkloadScope(scope: TechWorkloadScope): string {
  switch (scope) {
    case 'bau':
      return 'BAU headroom';
    case 'project':
      return 'Project-work headroom';
    default:
      return 'Combined tech headroom';
  }
}

/** Day-details headline for the cell fill % in Technology lens. */
export function technologyFillMetricHeadline(scope: TechWorkloadScope): string {
  switch (scope) {
    case 'bau':
      return 'BAU headroom';
    case 'project':
      return 'Project-work headroom';
    default:
      return 'Combined tech headroom';
  }
}

/** Day-details explainer under the headline for Technology lens. */
export function technologyFillMetricLabel(scope: TechWorkloadScope): string {
  switch (scope) {
    case 'bau':
      return 'Share of lab and Market IT capacity still available for BAU-only scheduled work (0–1; headline excludes backend).';
    case 'project':
      return 'Share of lab and Market IT capacity still available when only project surfaces count (campaigns, change, coordination, carryover).';
    default:
      return 'Share of lab and Market IT capacity still available versus all scheduled work on those lanes (0–1; headline excludes backend). Switch to Restaurant Activity for store trading intensity.';
  }
}

/** Technology lens: uncapped demand vs caps (can exceed 1). */
export function technologyHeatmapMetric(row: RiskRow, scope: TechWorkloadScope = 'all'): number {
  if (scope === 'all') {
    const u = row.tech_demand_ratio ?? row.tech_pressure ?? 0;
    return Math.max(0, u);
  }
  if (scope === 'bau') {
    return technologyHeatmapMetricForSurfaces(row, TECH_BAU_SURFACES);
  }
  return technologyHeatmapMetricForSurfaces(row, TECH_PROJECT_SURFACES);
}

/** Technology heatmap cell: **headroom** 0–1 (1 = empty lanes, 0 = at/above cap on the tighter lane). */
export function technologyHeadroomHeatmapMetric(row: RiskRow, scope: TechWorkloadScope = 'all'): number {
  const u = technologyHeatmapMetric(row, scope);
  const capped = Math.min(1, Math.max(0, u));
  return Math.min(1, Math.max(0, 1 - capped));
}

/** **Deployment Risk** heatmap: `deployment_risk_01` clamped to [0, 1]. */
export function deploymentRiskHeatmapMetric(row: RiskRow): number {
  return Math.min(1, Math.max(0, row.deployment_risk_01 ?? 0));
}

/**
 * Runway cell value per view: **Technology** = {@link technologyHeadroomHeatmapMetric}; **Business** = {@link inStoreHeatmapMetric}.
 */
export function heatmapCellMetric(
  row: RiskRow,
  mode: ViewModeId,
  tuning: RiskModelTuning = DEFAULT_RISK_TUNING,
  techWorkloadScope: TechWorkloadScope = 'all'
): number {
  switch (mode) {
    case 'combined':
      return technologyHeadroomHeatmapMetric(row, techWorkloadScope);
    case 'in_store':
      return inStoreHeatmapMetric(row, tuning);
    case 'market_risk':
      return deploymentRiskHeatmapMetric(row);
    default:
      return technologyHeadroomHeatmapMetric(row, techWorkloadScope);
  }
}

/** Technology Teams lens + **Project work** scope with no project-surface demand. */
export function techProjectWorkUsesDimmedCellStyle(
  viewMode: ViewModeId,
  techWorkloadScope: TechWorkloadScope,
  row: RiskRow
): boolean {
  if (viewMode !== 'combined' || techWorkloadScope !== 'project') return false;
  const u = technologyHeatmapMetricForSurfaces(row, TECH_PROJECT_SURFACES);
  return !Number.isNaN(u) && u <= 0;
}

const PROJECT_WORK_ZERO_DIM_OPACITY = 0.5;

/**
 * Runway cell colour + inner dim multiplier. For Project work at **0**, uses pad-style fill and reduced opacity
 * so zeros read inactive — not the same as the lowest heatmap band after curve/γ.
 */
export function runwayHeatmapCellFillAndDim(
  viewMode: ViewModeId,
  techWorkloadScope: TechWorkloadScope,
  metric: number | undefined,
  opts?: HeatmapColorOpts,
  row?: RiskRow
): { fill: string; dimOpacity: number } {
  const fill = heatmapColorForViewMode(viewMode, metric, opts);
  if (row && techProjectWorkUsesDimmedCellStyle(viewMode, techWorkloadScope, row)) {
    return { fill: HEATMAP_RUNWAY_PAD_FILL, dimOpacity: PROJECT_WORK_ZERO_DIM_OPACITY };
  }
  return { fill, dimOpacity: 1 };
}

/**
 * **Business** heatmap: modeled **restaurant / store trading** intensity only — the `store_pressure` lane
 * (weekly × monthly × seasonal rhythm, **early-month multiplier** on that rhythm, public-holiday trading
 * multiplier, live campaign **store** boost and prep **store** boost from YAML if any, then operating-window
 * store multipliers). Does **not** affect lab / Market IT / backend loads. Does **not** blend in marketing
 * `campaign_risk` as a separate heatmap lane; it still feeds the planning blend and Deployment Risk.
 */
export function inStoreHeatmapMetric(
  row: RiskRow,
  _tuning: RiskModelTuning = DEFAULT_RISK_TUNING
): number {
  const store = Math.min(STORE_PRESSURE_MAX, Math.max(0, row.store_pressure ?? 0));
  return Math.min(1, Math.max(0, store / STORE_PRESSURE_MAX));
}
