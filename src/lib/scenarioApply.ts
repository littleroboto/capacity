import { normalizeViewModeId } from '@/lib/constants';
import { normalizeHeatmapMonoHex, type HeatmapRenderStyle } from '@/lib/riskHeatmapColors';
import { looksLikeYamlDsl } from '@/lib/dslGuards';
import {
  DEFAULT_RISK_TUNING,
  riskTuningForPipelineView,
  riskTuningFromPersisted,
} from '@/engine/riskModelTuning';
import { runPipelineFromDsl } from '@/engine/pipeline';
import { syncRiskHeatmapVisualFromConfigs } from '@/lib/heatmapVisualFromConfigs';
import {
  extractMarketDocument,
  splitToDslByMarket,
} from '@/lib/multiDocMarketYaml';
import { FALLBACK_RUNWAY_MARKET_IDS, isRunwayAllMarkets } from '@/lib/markets';
import type { ScenarioState } from '@/lib/storage';
import { setAtcDsl, setStored } from '@/lib/storage';
import { useAtcStore } from '@/store/useAtcStore';

/** Load a saved workspace: full DSL, per-market map, runway order, tuning, view, theme, disco, then pipeline + persist. */
export function applyScenarioToStore(s: ScenarioState): void {
  const full = (s.fullDsl ?? s.dsl ?? '').trim();
  if (!full || !looksLikeYamlDsl(full)) return;

  const split = splitToDslByMarket(full);
  const currentOrder = useAtcStore.getState().runwayMarketOrder;
  const order =
    s.runwayMarketOrder?.length ? [...s.runwayMarketOrder] : [...currentOrder];
  if (!order.length) {
    order.push(...FALLBACK_RUNWAY_MARKET_IDS);
  }
  const dslByMarket = { ...(s.dslByMarket ?? {}), ...split };

  const country = s.picker;
  let dslText = full;
  if (!isRunwayAllMarkets(country)) {
    dslText =
      extractMarketDocument(full, country) ??
      dslByMarket[country] ??
      full;
    if (!looksLikeYamlDsl(dslText)) dslText = full;
  }

  const riskTuning = s.riskTuning ? riskTuningFromPersisted(s.riskTuning) : DEFAULT_RISK_TUNING;

  setStored('picker', country);
  setStored('layer', normalizeViewModeId(s.layer));

  const heatmapRenderStyle: HeatmapRenderStyle | undefined =
    s.heatmapRenderStyle === 'mono' || s.heatmapRenderStyle === 'spectrum' ? s.heatmapRenderStyle : undefined;

  useAtcStore.setState({
    country,
    runwayMarketOrder: order,
    dslByMarket,
    dslText,
    riskTuning,
    viewMode: normalizeViewModeId(s.layer),
    discoMode: s.discoMode ?? false,
    ...(heatmapRenderStyle ? { heatmapRenderStyle } : {}),
    ...(typeof s.heatmapMonoColor === 'string'
      ? { heatmapMonoColor: normalizeHeatmapMonoHex(s.heatmapMonoColor) }
      : {}),
  });

  if (s.theme === 'light' || s.theme === 'dark') {
    useAtcStore.getState().setTheme(s.theme);
  }

  setAtcDsl(full);
  const r = runPipelineFromDsl(full, riskTuningForPipelineView(riskTuning, country));
  useAtcStore.setState({
    riskSurface: r.riskSurface,
    configs: r.configs,
    parseError: r.parseError ?? null,
    ...syncRiskHeatmapVisualFromConfigs(r.configs, country, order),
  });
}
