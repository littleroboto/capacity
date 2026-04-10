import type { ViewModeId } from '@/lib/constants';
import type { MarketConfig } from '@/engine/types';
import type { HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { clampHeatmapPressureOffset } from '@/lib/heatmapTuningPerLens';

/**
 * Restaurant Activity / Deployment Risk: global pressure offset + optional YAML Δ per market + optional auto
 * calibration (then reclamped). Other lenses unchanged.
 */
export function heatmapColorOptsWithMarketYaml(
  viewMode: ViewModeId,
  base: HeatmapColorOpts,
  config: MarketConfig | undefined,
  autoRestaurantPressureOffset = 0,
  autoMarketRiskPressureOffset = 0
): HeatmapColorOpts {
  const g = base.businessHeatmapPressureOffset ?? 0;

  if (viewMode === 'in_store') {
    const yamlRaw = config?.riskHeatmapBusinessPressureOffset;
    const yaml = yamlRaw != null && Number.isFinite(yamlRaw) ? yamlRaw : 0;
    const auto = Number.isFinite(autoRestaurantPressureOffset) ? autoRestaurantPressureOffset : 0;
    return {
      ...base,
      businessHeatmapPressureOffset: clampHeatmapPressureOffset(g + yaml + auto),
    };
  }

  if (viewMode === 'market_risk') {
    const yamlRaw = config?.riskHeatmapMarketRiskPressureOffset;
    const yaml = yamlRaw != null && Number.isFinite(yamlRaw) ? yamlRaw : 0;
    const auto = Number.isFinite(autoMarketRiskPressureOffset) ? autoMarketRiskPressureOffset : 0;
    return {
      ...base,
      businessHeatmapPressureOffset: clampHeatmapPressureOffset(g + yaml + auto),
    };
  }

  return base;
}
