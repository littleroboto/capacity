import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import type { HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { transformedHeatmapMetric } from '@/lib/riskHeatmapColors';
import {
  layeredHeatmapCellMetric,
  organicHeatmapCellLayerIndex,
} from '@/lib/runwayHeatmapOrganicLayers';
import type { ContributionDayCapacityBalance } from '@/lib/runwayTechContributionOverloadHistogram';
import { heatmapCellMetric } from '@/lib/runwayViewMetrics';

/** Heatmap opts + organic keys for restaurant / risk overlays on the programme tech chart. */
export type GanttLensOverlaySourcePack = {
  heatmapOptsTrading: HeatmapColorOpts;
  heatmapOptsRisk: HeatmapColorOpts;
  organicLayerMarketKeyTrading: string;
  organicLayerMarketKeyRisk: string;
};

/** Odd window ≥ 3: centered mean over indices where `hasData[i]` is true. */
export function movingAverageForModeledDays(
  values: readonly number[],
  hasData: readonly boolean[],
  window: number,
): number[] {
  const n = values.length;
  const out = [...values];
  if (window < 3 || window % 2 === 0 || n === 0) return out;
  const half = (window - 1) / 2;
  for (let i = 0; i < n; i += 1) {
    if (!hasData[i]) continue;
    let sum = 0;
    let cnt = 0;
    for (let k = -half; k <= half; k += 1) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      if (!hasData[j]) continue;
      sum += values[j]!;
      cnt += 1;
    }
    if (cnt > 0) out[i] = sum / cnt;
  }
  return out;
}

/**
 * Per-calendar-day 0–1 display series for a lens (same semantics as strip lens sparkline), optionally smoothed.
 */
export function buildGanttLensOverlayU01Series(
  days: readonly ContributionDayCapacityBalance[],
  riskByDate: Map<string, RiskRow>,
  lensMode: 'in_store' | 'market_risk',
  heatmapOpts: HeatmapColorOpts,
  riskTuning: RiskModelTuning,
  organicLayerTick: number | undefined,
  organicLayerMarketKey: string | undefined,
  prefersReducedMotion: boolean | null | undefined,
  sparklineUtilSmoothWindow: number | undefined,
  /**
   * `default`: apply `sparklineUtilSmoothWindow` when valid odd ≥3.
   * `none`: return raw per-day values (caller may smooth, e.g. fixed 7-day on programme triple chart).
   * `number`: apply this odd window regardless of workbench smoothing.
   */
  smoothing: 'default' | 'none' | number = 'default',
): number[] {
  const organicTraceOn =
    organicLayerTick != null &&
    organicLayerMarketKey != null &&
    organicLayerMarketKey.length > 0 &&
    !prefersReducedMotion;

  const raw = days.map((d) => {
    if (!d.hasData) return { u: 0, hasData: false as const };
    const row = riskByDate.get(d.ymd);
    if (!row) return { u: 0, hasData: false as const };
    const mFull = heatmapCellMetric(row, lensMode, riskTuning);
    let uFull = transformedHeatmapMetric(lensMode, mFull, heatmapOpts);
    if (organicTraceOn) {
      const layerIdx = organicHeatmapCellLayerIndex({
        tick: organicLayerTick!,
        marketKey: organicLayerMarketKey!,
        dateYmd: d.ymd,
      });
      const mLayer = layeredHeatmapCellMetric(row, lensMode, riskTuning, layerIdx);
      const scale = Math.abs(mFull) > 1e-9 ? Math.min(1, Math.max(0, mLayer / mFull)) : 0;
      uFull *= scale;
    }
    return { u: uFull, hasData: true as const };
  });

  const uRaw = raw.map((x) => x.u);
  const has = raw.map((x) => x.hasData);
  if (smoothing === 'none') return uRaw;
  const w = typeof smoothing === 'number' ? smoothing : sparklineUtilSmoothWindow;
  if (w == null || w < 3 || w % 2 === 0) return uRaw;
  return movingAverageForModeledDays(uRaw, has, w);
}
