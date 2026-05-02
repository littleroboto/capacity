import type { PressureSurfaceId } from '@/domain/pressureSurfaces';
import type { RiskRow } from '@/engine/riskModel';
import { STORE_PRESSURE_MAX, type RiskModelTuning } from '@/engine/riskModelTuning';
import type { ViewModeId } from '@/lib/constants';
import {
  deploymentRiskHeatmapMetric,
  heatmapCellMetric,
  inStoreHeatmapMetric,
  technologyHeatmapMetricForSurfaces,
} from '@/lib/runwayViewMetrics';

/** Global tick interval when “animate heatmap cells on load” is enabled (workbench + landing). */
export const ORGANIC_HEATMAP_TICK_MS = 88;

/** Stop advancing after this many ticks (cells finish layering via {@link organicHeatmapCellLayerIndex}). */
export const ORGANIC_HEATMAP_MAX_TICK = 28;

/**
 * Cumulative tech pressure surfaces, ordered roughly as BAU → calendar/ops friction → change → campaigns → carryover.
 * Matches user-facing “layers” without re-running the pipeline.
 */
const TECH_ORGANIC_SURFACE_LAYERS: readonly (readonly PressureSurfaceId[])[] = [
  ['bau'],
  ['bau', 'coordination'],
  ['bau', 'coordination', 'change'],
  ['bau', 'coordination', 'change', 'campaign'],
  ['bau', 'coordination', 'change', 'campaign', 'carryover'],
];

/** Blend toward full in-store metric (trading lane stacks in YAML; not decomposed per layer). */
const IN_STORE_LAYER_PROGRESS = [0, 0.22, 0.48, 0.74, 1] as const;

/** Blend toward full deployment risk (single scalar in the model). */
const MARKET_RISK_LAYER_PROGRESS = [0, 0.22, 0.48, 0.74, 1] as const;

function fnv1a32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Which of five colour-build stages this cell is on, from a shared tick and stable per-cell hash
 * (no left-to-right sweep).
 */
export function organicHeatmapCellLayerIndex(args: {
  tick: number;
  marketKey: string;
  dateYmd: string;
  /** e.g. lens id so triple-lens strips for the same day do not move in lockstep. */
  salt?: string;
}): number {
  const { tick, marketKey, dateYmd, salt = '' } = args;
  const u01 = fnv1a32(`${marketKey}\u0000${dateYmd}\u0000${salt}`) / 2 ** 32;
  const p = tick * 0.22 + u01 * 0.92;
  return Math.min(4, Math.max(0, Math.floor(p)));
}

/**
 * Heatmap driver value for SVG organic reveal: builds toward {@link heatmapCellMetric} semantics per lens.
 */
export function layeredHeatmapCellMetric(
  row: RiskRow,
  mode: ViewModeId,
  tuning: RiskModelTuning,
  layerIndex: number,
): number {
  const L = Math.min(4, Math.max(0, Math.floor(layerIndex)));
  switch (mode) {
    case 'combined': {
      if (L === 4) return heatmapCellMetric(row, mode, tuning);
      const surfaces = TECH_ORGANIC_SURFACE_LAYERS[L]!;
      const u = technologyHeatmapMetricForSurfaces(row, surfaces);
      return Math.min(1, Math.max(0, u));
    }
    case 'in_store': {
      const final = inStoreHeatmapMetric(row, tuning);
      if (L === 4) return final;
      const baseRaw = Math.min(STORE_PRESSURE_MAX, Math.max(0, row.store_trading_base ?? 0));
      const base = Math.min(1, Math.max(0, baseRaw / STORE_PRESSURE_MAX));
      const t = IN_STORE_LAYER_PROGRESS[L]!;
      return Math.min(1, Math.max(0, base + (final - base) * t));
    }
    case 'market_risk': {
      const final = deploymentRiskHeatmapMetric(row);
      if (L === 4) return final;
      const t = MARKET_RISK_LAYER_PROGRESS[L]!;
      return Math.min(1, Math.max(0, final * t));
    }
    case 'code':
    default:
      return heatmapCellMetric(row, mode, tuning);
  }
}
