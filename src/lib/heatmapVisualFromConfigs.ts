import type { MarketConfig } from '@/engine/types';
import type { RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';
import { gammaFocusMarket } from '@/lib/markets';

function clampGamma(g: number): number {
  return Math.min(3, Math.max(0.35, g));
}

/**
 * Heatmap γ / curve from parsed YAML. Technology and Business lenses share one effective γ in the UI; if YAML
 * had split values, we merge (legacy `risk_heatmap_gamma`, else average of tech/business when both set).
 */
export function syncRiskHeatmapVisualFromConfigs(
  configs: MarketConfig[],
  country: string,
  runwayOrder: readonly string[]
): {
  riskHeatmapGamma: number;
  riskHeatmapGammaTech: number;
  riskHeatmapGammaBusiness: number;
  riskHeatmapCurve: RiskHeatmapCurveId;
} {
  const focus = gammaFocusMarket(country, configs, runwayOrder);
  const c = configs.find((x) => x.market === focus);
  const riskHeatmapCurve = c?.riskHeatmapCurve ?? 'power';

  const legacy = c?.riskHeatmapGamma;
  let g = 1;
  if (legacy != null && Number.isFinite(legacy) && legacy > 0) {
    g = clampGamma(legacy);
  } else {
    const gt = c?.riskHeatmapGammaTech;
    const gb = c?.riskHeatmapGammaBusiness;
    const tv = gt != null && Number.isFinite(gt) && gt > 0 ? clampGamma(gt) : null;
    const bv = gb != null && Number.isFinite(gb) && gb > 0 ? clampGamma(gb) : null;
    if (tv != null && bv != null) {
      g = Math.round(((tv + bv) / 2) * 100) / 100;
    } else {
      g = tv ?? bv ?? 1;
    }
  }

  return {
    riskHeatmapGamma: g,
    riskHeatmapGammaTech: g,
    riskHeatmapGammaBusiness: g,
    riskHeatmapCurve,
  };
}
