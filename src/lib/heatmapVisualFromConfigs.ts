import type { MarketConfig } from '@/engine/types';
import type { RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';
import { gammaFocusMarket } from '@/lib/markets';

/** Heatmap γ / curve from parsed YAML for the focus market (matches runway store behaviour). */
export function syncRiskHeatmapVisualFromConfigs(
  configs: MarketConfig[],
  country: string,
  runwayOrder: readonly string[]
): { riskHeatmapGamma: number; riskHeatmapCurve: RiskHeatmapCurveId } {
  const focus = gammaFocusMarket(country, configs, runwayOrder);
  const c = configs.find((x) => x.market === focus);
  const g = c?.riskHeatmapGamma;
  let riskHeatmapGamma = 1;
  if (g != null && Number.isFinite(g) && g > 0) {
    riskHeatmapGamma = Math.min(3, Math.max(0.35, g));
  }
  const riskHeatmapCurve = c?.riskHeatmapCurve ?? 'power';
  return { riskHeatmapGamma, riskHeatmapCurve };
}
