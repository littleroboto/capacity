import type { MarketConfig } from '@/engine/types';
import type { RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';
import { gammaFocusMarket } from '@/lib/markets';

function clampGamma(g: number): number {
  return Math.min(3, Math.max(0.35, g));
}

/**
 * Heatmap γ / curve from parsed YAML. `riskHeatmapGamma` stays a merged value for legacy sliders and the Code view;
 * Technology vs Restaurant / Market risk lenses read `riskHeatmapGammaTech` and `riskHeatmapGammaBusiness` separately.
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
  let riskHeatmapGammaTech = 1;
  let riskHeatmapGammaBusiness = 1;
  if (legacy != null && Number.isFinite(legacy) && legacy > 0) {
    g = clampGamma(legacy);
    riskHeatmapGammaTech = g;
    riskHeatmapGammaBusiness = g;
  } else {
    const gt = c?.riskHeatmapGammaTech;
    const gb = c?.riskHeatmapGammaBusiness;
    const tv = gt != null && Number.isFinite(gt) && gt > 0 ? clampGamma(gt) : null;
    const bv = gb != null && Number.isFinite(gb) && gb > 0 ? clampGamma(gb) : null;
    riskHeatmapGammaTech = tv ?? bv ?? 1;
    riskHeatmapGammaBusiness = bv ?? tv ?? 1;
    if (tv != null && bv != null) {
      g = Math.round(((tv + bv) / 2) * 100) / 100;
    } else {
      g = tv ?? bv ?? 1;
    }
  }

  return {
    riskHeatmapGamma: g,
    riskHeatmapGammaTech,
    riskHeatmapGammaBusiness,
    riskHeatmapCurve,
  };
}
