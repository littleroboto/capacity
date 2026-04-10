import type { MarketConfig } from '@/engine/types';
import type { RiskRow } from '@/engine/riskModel';
import { clampHeatmapPressureOffset, type PerLensHeatmapTuning } from '@/lib/heatmapTuningPerLens';
import type { HeatmapColorOpts, HeatmapRenderStyle, HeatmapSpectrumMode } from '@/lib/riskHeatmapColors';
import { transformedHeatmapMetric } from '@/lib/riskHeatmapColors';
import { deploymentRiskHeatmapMetric, inStoreHeatmapMetric } from '@/lib/runwayViewMetrics';

/** Centre of the 50–75% display band on the transformed 0–1 scale. */
const DEFAULT_TARGET_MEDIAN = 0.625;

const MIN_SAMPLES = 8;

type AutoCalibrateHeatmapViewMode = 'in_store' | 'market_risk';

export function lensHeatmapShapeOptsForAutoCalibrate(params: {
  lensTuning: PerLensHeatmapTuning;
  heatmapRenderStyle: HeatmapRenderStyle;
  heatmapMonoColor: string;
  heatmapSpectrumContinuous: boolean;
}): HeatmapColorOpts {
  const heatmapSpectrumMode: HeatmapSpectrumMode = params.heatmapSpectrumContinuous
    ? 'continuous'
    : 'discrete';
  const t = params.lensTuning;
  return {
    riskHeatmapCurve: t.curve,
    riskHeatmapGamma: t.gamma,
    riskHeatmapTailPower: t.tailPower,
    businessHeatmapPressureOffset: 0,
    renderStyle: params.heatmapRenderStyle,
    monoColor: params.heatmapMonoColor,
    heatmapSpectrumMode,
  };
}

/** @deprecated Prefer {@link lensHeatmapShapeOptsForAutoCalibrate} with `lensTuning: inStoreTuning`. */
export function inStoreHeatmapShapeOptsForAutoCalibrate(params: {
  inStoreTuning: PerLensHeatmapTuning;
  heatmapRenderStyle: HeatmapRenderStyle;
  heatmapMonoColor: string;
  heatmapSpectrumContinuous: boolean;
}): HeatmapColorOpts {
  return lensHeatmapShapeOptsForAutoCalibrate({
    lensTuning: params.inStoreTuning,
    heatmapRenderStyle: params.heatmapRenderStyle,
    heatmapMonoColor: params.heatmapMonoColor,
    heatmapSpectrumContinuous: params.heatmapSpectrumContinuous,
  });
}

function medianSorted(sorted: number[]): number {
  if (!sorted.length) return 0;
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i]! : (sorted[i - 1]! + sorted[i]!) / 2;
}

function medianTransformedDisplay(
  viewMode: AutoCalibrateHeatmapViewMode,
  rawMetrics: number[],
  shapeOpts: HeatmapColorOpts,
  totalOffsetClamped: number
): number {
  const opts: HeatmapColorOpts = {
    ...shapeOpts,
    businessHeatmapPressureOffset: totalOffsetClamped,
  };
  const vals = rawMetrics.map((r) => transformedHeatmapMetric(viewMode, r, opts));
  vals.sort((a, b) => a - b);
  return medianSorted(vals);
}

/**
 * Extra pressure offset (global + YAML Δ + auto, reclamped) so the **median** transformed display value
 * sits near {@link DEFAULT_TARGET_MEDIAN} (mid 50–75% band) for Restaurant Activity or Deployment Risk.
 */
export function computeAutoHeatmapPressureOffset(params: {
  viewMode: AutoCalibrateHeatmapViewMode;
  rawMetrics: number[];
  shapeOpts: HeatmapColorOpts;
  globalPressureOffset: number;
  yamlPressureDelta: number;
  targetMedian?: number;
}): number {
  const target = params.targetMedian ?? DEFAULT_TARGET_MEDIAN;
  const { viewMode, rawMetrics, shapeOpts, globalPressureOffset, yamlPressureDelta } = params;
  if (rawMetrics.length < MIN_SAMPLES) return 0;

  const mAt = (T: number) => {
    const o = clampHeatmapPressureOffset(T);
    return medianTransformedDisplay(viewMode, rawMetrics, shapeOpts, o);
  };

  const mLo = mAt(-0.5);
  const mHi = mAt(0.5);
  if (mLo >= target) {
    return -0.5 - globalPressureOffset - yamlPressureDelta;
  }
  if (mHi <= target) {
    return 0.5 - globalPressureOffset - yamlPressureDelta;
  }

  let lo = -0.5;
  let hi = 0.5;
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2;
    if (mAt(mid) < target) lo = mid;
    else hi = mid;
  }
  const T = hi;
  return T - globalPressureOffset - yamlPressureDelta;
}

/** @deprecated Prefer {@link computeAutoHeatmapPressureOffset} with `viewMode: 'in_store'`. */
export function computeRestaurantAutoPressureOffset(params: {
  rawMetrics: number[];
  shapeOpts: HeatmapColorOpts;
  globalPressureOffset: number;
  yamlPressureDelta: number;
  targetMedian?: number;
}): number {
  return computeAutoHeatmapPressureOffset({ ...params, viewMode: 'in_store' });
}

export function autoRestaurantPressureOffsetMapForSurface(params: {
  riskSurface: RiskRow[];
  configs: MarketConfig[];
  inStoreShapeOpts: HeatmapColorOpts;
  globalInStorePressureOffset: number;
}): Map<string, number> {
  const map = new Map<string, number>();
  const { riskSurface, configs, inStoreShapeOpts, globalInStorePressureOffset } = params;
  if (!riskSurface.length) return map;

  const byMarket = new Map<string, number[]>();
  for (const row of riskSurface) {
    const r = inStoreHeatmapMetric(row);
    const arr = byMarket.get(row.market) ?? [];
    arr.push(r);
    byMarket.set(row.market, arr);
  }

  for (const [market, raws] of byMarket) {
    const cfg = configs.find((c) => c.market === market);
    const yaml = cfg?.riskHeatmapBusinessPressureOffset;
    const y = yaml != null && Number.isFinite(yaml) ? yaml : 0;
    const auto = computeAutoHeatmapPressureOffset({
      viewMode: 'in_store',
      rawMetrics: raws,
      shapeOpts: inStoreShapeOpts,
      globalPressureOffset: globalInStorePressureOffset,
      yamlPressureDelta: y,
    });
    map.set(market, auto);
  }
  return map;
}

export function autoMarketRiskPressureOffsetMapForSurface(params: {
  riskSurface: RiskRow[];
  configs: MarketConfig[];
  marketRiskShapeOpts: HeatmapColorOpts;
  globalMarketRiskPressureOffset: number;
}): Map<string, number> {
  const map = new Map<string, number>();
  const { riskSurface, configs, marketRiskShapeOpts, globalMarketRiskPressureOffset } = params;
  if (!riskSurface.length) return map;

  const byMarket = new Map<string, number[]>();
  for (const row of riskSurface) {
    const r = deploymentRiskHeatmapMetric(row);
    const arr = byMarket.get(row.market) ?? [];
    arr.push(r);
    byMarket.set(row.market, arr);
  }

  for (const [market, raws] of byMarket) {
    const cfg = configs.find((c) => c.market === market);
    const yaml = cfg?.riskHeatmapMarketRiskPressureOffset;
    const y = yaml != null && Number.isFinite(yaml) ? yaml : 0;
    const auto = computeAutoHeatmapPressureOffset({
      viewMode: 'market_risk',
      rawMetrics: raws,
      shapeOpts: marketRiskShapeOpts,
      globalPressureOffset: globalMarketRiskPressureOffset,
      yamlPressureDelta: y,
    });
    map.set(market, auto);
  }
  return map;
}
