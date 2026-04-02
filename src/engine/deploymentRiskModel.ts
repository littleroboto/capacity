import { parseDate } from '@/engine/calendar';
import type { RiskRow } from '@/engine/riskModel';
import {
  DEFAULT_MARKET_RISK_SCALES,
  STORE_PRESSURE_MAX,
  type MarketRiskComponentScales,
} from '@/engine/riskModelTuning';
import { parseTechRhythmScalar } from '@/engine/techWeeklyPattern';
import type { MarketConfig } from '@/engine/types';
import { TRADING_MONTH_KEYS, type TradingMonthKey } from '@/lib/tradingMonthlyDsl';

/** Aligns with `pipeline.ts` / `parseDate().getDay()` (Sun = 0). */
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Applied when YAML omits {@link MarketConfig.deployment_risk_week_weight}. */
export const DEFAULT_DEPLOYMENT_WEEK_LOAD_WEIGHT = 0.2;

/** Tech-pressure add-on when YAML omits {@link MarketConfig.deployment_resourcing_strain_weight}. */
export const DEFAULT_DEPLOYMENT_RESOURCING_STRAIN_WEIGHT = 0.05;

/** Peak week segment × campaign_risk (Saturdays in big campaigns, etc.). */
const PEAK_DAY_CAMPAIGN_INTERACTION_WEIGHT = 0.12;

/** Peak week segment × store load (incidents hurt more when trading is already hot). */
const PEAK_DAY_STORE_INTERACTION_WEIGHT = 0.07;

/** Max contribution (before {@link MarketRiskComponentScales.yearEndWeekRamp}) from the year-end ladder at 31 Dec. */
export const YEAR_END_RAMP_BASE_WEIGHT = 0.52;

const MS_PER_DAY = 86400000;

/**
 * **12 weekly steps** from “12 weeks before” calendar **31 Dec** to year-end: each week closer adds one step.
 * Returns 0 when more than 84 days remain in the year; 1/12 … 1 as you approach 31 Dec (local calendar dates).
 */
export function yearEndWeekBlockRamp01(dateStr: string): number {
  const d = parseDate(dateStr);
  const y = d.getFullYear();
  const end = new Date(y, 11, 31);
  const days = Math.round((end.getTime() - d.getTime()) / MS_PER_DAY);
  if (days < 0) return 1;
  if (days > 83) return 0;
  return (12 - Math.floor(days / 7)) / 12;
}

function deploymentWeekLoadWeight(config: MarketConfig | undefined): number {
  const w = config?.deployment_risk_week_weight;
  if (w != null && Number.isFinite(w)) {
    return Math.min(1, Math.max(0, w));
  }
  return DEFAULT_DEPLOYMENT_WEEK_LOAD_WEIGHT;
}

function deploymentResourcingStrainWeight(config: MarketConfig | undefined): number {
  const w = config?.deployment_resourcing_strain_weight;
  if (w != null && Number.isFinite(w)) {
    return Math.min(1, Math.max(0, w));
  }
  return DEFAULT_DEPLOYMENT_RESOURCING_STRAIN_WEIGHT;
}

function tradingMonthKeyFromYmd(dateStr: string): TradingMonthKey {
  const m = parseInt(dateStr.slice(5, 7), 10);
  return TRADING_MONTH_KEYS[Math.min(12, Math.max(1, m)) - 1]!;
}

/**
 * When YAML omits a month, calendar **Q4** ramps up (Oct → Nov → Dec), not a single December step.
 */
function defaultDeploymentMonthLift(calendarMonth1to12: number): number {
  if (calendarMonth1to12 === 10) return 0.07;
  if (calendarMonth1to12 === 11) return 0.12;
  if (calendarMonth1to12 === 12) return 0.18;
  return 0;
}

/**
 * 0–1 stress for this calendar day from **within-week shape** of trading and/or tech load:
 * quietest day in the YAML week → 0, busiest → 1 (e.g. Sat hot vs Wed cooler when YAML says so).
 * Uses the higher of {@link MarketConfig.trading} `weekly_pattern` and {@link MarketConfig.techRhythm} `weekly_pattern`.
 */
export function weekdayDeploymentShape01(dateStr: string, config: MarketConfig | undefined): number {
  const tradingWp = (config?.trading as { weekly_pattern?: Record<string, unknown> } | undefined)
    ?.weekly_pattern;
  const techWp = config?.techRhythm?.weekly_pattern as Record<string, unknown> | undefined;

  const normForWeek = (weekly: Record<string, unknown> | undefined): number | null => {
    const byDay: Record<string, number> = {};
    if (weekly && typeof weekly === 'object') {
      for (const day of WEEKDAY_NAMES) {
        const raw = weekly[day];
        if (raw == null) continue;
        const p = parseTechRhythmScalar(raw);
        byDay[day] = p != null ? Math.min(1, Math.max(0, p)) : 0.5;
      }
    }
    const vals = Object.values(byDay);
    if (vals.length < 3) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min;
    if (span < 1e-6) return null;
    const d = parseDate(dateStr);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const v = byDay[dayName];
    if (v == null) return null;
    return Math.min(1, Math.max(0, (v - min) / span));
  };

  const t = normForWeek(tradingWp);
  const u = normForWeek(techWp);
  if (t == null && u == null) return 0;
  return Math.max(t ?? 0, u ?? 0);
}

/**
 * Graded 0–1 deployment / calendar fragility for the Market risk heatmap.
 * Sum of bounded factors (not a hard ban); store load raises consequence, not trading “busyness” alone.
 * Blackouts add a separate YAML layer; peak-week × campaign and peak-week × store compound on top of linear terms.
 * {@link MarketConfig.deployment_risk_context_month_curve} adds a second per-month term on top of the primary curve.
 * {@link MarketRiskComponentScales} scales each group independently (Market risk lens only).
 */
export function computeDeploymentRisk01(
  row: RiskRow,
  config: MarketConfig | undefined,
  dateStr: string,
  scales: MarketRiskComponentScales = DEFAULT_MARKET_RISK_SCALES
): number {
  const pub = row.public_holiday_flag ? 0.22 : 0;
  const sch = row.school_holiday_flag ? 0.15 : 0;
  const storeNorm = Math.min(1, Math.max(0, row.store_pressure ?? 0) / STORE_PRESSURE_MAX);
  const storeConsequence = 0.35 * storeNorm;
  const calMonth = Number(dateStr.slice(5, 7));
  const monthKey = tradingMonthKeyFromYmd(dateStr);
  const yamlLift = config?.deployment_risk_month_curve?.[monthKey];
  const seasonal =
    yamlLift != null && Number.isFinite(yamlLift)
      ? Math.min(1, Math.max(0, yamlLift))
      : defaultDeploymentMonthLift(calMonth);
  const ctxLift = config?.deployment_risk_context_month_curve?.[monthKey];
  const contextMonth =
    ctxLift != null && Number.isFinite(ctxLift) ? Math.min(1, Math.max(0, ctxLift)) : 0;
  const camp01 = Math.min(1, Math.max(0, row.campaign_risk ?? 0));
  const camp = camp01 * 0.08;
  let eventMax = 0;
  for (const ev of config?.deployment_risk_events ?? []) {
    if (dateStr >= ev.start && dateStr <= ev.end) {
      eventMax = Math.max(eventMax, Math.min(1, Math.max(0, ev.severity)));
    }
  }
  let blackoutMax = 0;
  for (const b of config?.deployment_risk_blackouts ?? []) {
    if (dateStr >= b.start && dateStr <= b.end) {
      blackoutMax = Math.max(blackoutMax, Math.min(1, Math.max(0, b.severity)));
    }
  }
  const weekdayShape = weekdayDeploymentShape01(dateStr, config);
  const weekdayLoad = deploymentWeekLoadWeight(config) * weekdayShape;
  const peakCampaign = PEAK_DAY_CAMPAIGN_INTERACTION_WEIGHT * weekdayShape * camp01;
  const peakStoreDay = PEAK_DAY_STORE_INTERACTION_WEIGHT * weekdayShape * storeNorm;
  const techP = Math.min(1, Math.max(0, row.tech_pressure ?? 0));
  const resourcingStrain = deploymentResourcingStrainWeight(config) * techP;
  const yearEndShape = yearEndWeekBlockRamp01(dateStr);
  const yearEndRamp = YEAR_END_RAMP_BASE_WEIGHT * yearEndShape;
  const raw =
    (pub + sch) * scales.holidays +
    storeConsequence * scales.storeConsequence +
    seasonal * scales.primaryMonthCurve +
    contextMonth * scales.contextMonthCurve +
    yearEndRamp * scales.yearEndWeekRamp +
    camp * scales.campaignLinear +
    eventMax * scales.events +
    blackoutMax * scales.blackouts +
    weekdayLoad * scales.withinWeekLoad +
    peakCampaign * scales.campaignPeakInteraction +
    peakStoreDay * scales.storePeakInteraction +
    resourcingStrain * scales.resourcingStrain;
  return Math.min(1, Math.max(0, Math.round(raw * 1000) / 1000));
}
