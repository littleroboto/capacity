/**
 * Operational capacity calendar engine: timeline, BAU/campaign expansion,
 * holidays, and per-day metrics (including normalised planning blend 0–1).
 */
import { buildCalendar } from './calendar';
import { runPipelineFromDsl, type PipelineResult } from './pipeline';
import { DEFAULT_RISK_TUNING, type RiskModelTuning } from './riskModelTuning';
import type { RiskRow } from './riskModel';

export { parseYamlToConfigs } from './pipeline';
export type { PipelineResult } from './pipeline';
export type { RiskRow } from './riskModel';

/** Rolling window: current quarter start through MODEL_MONTHS (≥ 1 year). */
export function getTimelineMeta(markets: string[]): {
  startDate: string;
  endDate: string;
  dayCount: number;
  markets: string[];
} {
  const cal = buildCalendar(undefined, markets.length ? markets : ['DE']);
  const byMarket = new Map<string, string[]>();
  for (const r of cal) {
    if (!byMarket.has(r.market)) byMarket.set(r.market, []);
    byMarket.get(r.market)!.push(r.date);
  }
  const firstMarket = markets[0] ?? 'DE';
  const dates = byMarket.get(firstMarket) ?? [];
  return {
    startDate: dates[0] ?? '',
    endDate: dates[dates.length - 1] ?? '',
    dayCount: dates.length,
    markets: markets.length ? markets : [firstMarket],
  };
}

export function runCapacityModel(yamlDsl: string, tuning: RiskModelTuning = DEFAULT_RISK_TUNING): PipelineResult {
  return runPipelineFromDsl(yamlDsl, tuning);
}

export function describeMetrics(row: RiskRow): {
  tech_pressure: number;
  tech_readiness_pressure: number;
  tech_sustain_pressure: number;
  store_pressure: number;
  campaign_presence: number;
  planning_blend_01: number;
} {
  return {
    tech_pressure: row.tech_pressure,
    tech_readiness_pressure: row.tech_readiness_pressure,
    tech_sustain_pressure: row.tech_sustain_pressure,
    store_pressure: row.store_pressure,
    campaign_presence: row.campaign_presence,
    planning_blend_01: row.planning_blend_01,
  };
}

export { MODEL_MONTHS, MODEL_QUARTERS, HORIZON_MONTHS } from '@/lib/constants';
