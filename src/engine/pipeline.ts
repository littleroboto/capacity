/**
 * Planning pipeline: YAML configs → daily loads (with pressure surfaces) → carry-over →
 * operating windows / school stress → effective capacity → weighted pressure + explainable surfaces.
 */
import { PRESSURE_SURFACE_IDS } from '@/domain/pressureSurfaces';
import { emptySurfaceTotals } from '@/domain/pressureSurfaces';
import { applyLoadCarryover } from '@/planning/carryover';
import { campaignLoadBearingPrepLiveForDate } from './campaignPrepLive';
import { buildCalendar, parseDate } from './calendar';
import { computeCapacity } from './capacityModel';
import { createHolidayCheck } from './holidayLoader';
import { getAutoHolidayDates } from './holidayCalc';
import {
  aggregateByDay,
  expandPhases,
  recomputeAggregatedTotals,
  type AggregatedDay,
} from './phaseEngine';
import { computeDeploymentRisk01 } from './deploymentRiskModel';
import { withOperationalNoise } from './dataNoise';
import { computeRisk, type RiskRow } from './riskModel';
import {
  isPaydayKnotTuple,
  storePaydayMonthMultiplier,
  storePaydayMonthMultiplierFromKnots,
} from '@/engine/paydayMonthShape';
import { parseTechRhythmScalar } from '@/engine/techWeeklyPattern';
import { DEFAULT_RISK_TUNING, STORE_PRESSURE_MAX, type RiskModelTuning } from './riskModelTuning';
import type { CampaignConfig, MarketConfig } from './types';
import { TRADING_MONTH_KEYS } from '@/lib/tradingMonthlyDsl';
import { parseAllYamlDocuments } from './yamlDslParser';
import {
  blendTowardMultiplier,
  holidayProximityStrength,
  inclusiveWindowSpan,
  applyAustraliaPostChristmasSummerLift,
  applyDecemberRestaurantSeasoning,
  seasonalTradingFactor,
  segmentEnvelopeWeight,
  type EnvelopeKind,
} from './weighting';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CAMPAIGN_IMPACT: Record<string, number> = { low: 0.25, medium: 0.5, high: 0.8, very_high: 1 };

export function parseYamlToConfigs(dslText: string): MarketConfig[] {
  return parseAllYamlDocuments(dslText);
}

export type PipelineResult = {
  riskSurface: RiskRow[];
  configs: MarketConfig[];
  parseError?: string;
};

export function runPipeline(
  configs: MarketConfig[],
  holidaysByMarket: Record<string, string[]> = {},
  tuning: RiskModelTuning = DEFAULT_RISK_TUNING
): PipelineResult {
  const mergedPublic: Record<string, string[]> = { ...holidaysByMarket };
  const mergedSchool: Record<string, string[]> = {};
  for (const c of configs) {
    const market = c.market;
    const opts = (c.holidays || {}) as { auto_public?: boolean; auto_school?: boolean };
    if (opts.auto_public) {
      const pub = getAutoHolidayDates(market, { auto_public: true, auto_school: false });
      if (pub.length) {
        mergedPublic[market] = [...(mergedPublic[market] || []), ...pub];
      }
    }
    if (opts.auto_school) {
      const sch = getAutoHolidayDates(market, { auto_public: false, auto_school: true });
      if (sch.length) {
        mergedSchool[market] = [...(mergedSchool[market] || []), ...sch];
      }
    }
    const extraPub = c.publicHolidayExtraDates ?? [];
    if (extraPub.length) {
      mergedPublic[market] = [...(mergedPublic[market] || []), ...extraPub];
    }
    const extraSch = c.schoolHolidayExtraDates ?? [];
    if (extraSch.length) {
      mergedSchool[market] = [...(mergedSchool[market] || []), ...extraSch];
    }
  }
  const allMarkets = new Set<string>([
    ...Object.keys(mergedPublic),
    ...Object.keys(mergedSchool),
    ...configs.map((c) => c.market),
  ]);
  for (const m of allMarkets) {
    if (mergedPublic[m]) mergedPublic[m] = [...new Set(mergedPublic[m])];
    if (mergedSchool[m]) mergedSchool[m] = [...new Set(mergedSchool[m])];
  }

  const holidayDateSets: Record<string, Set<string>> = {};
  for (const m of allMarkets) {
    const s = new Set<string>();
    for (const d of mergedPublic[m] ?? []) s.add(d);
    for (const d of mergedSchool[m] ?? []) s.add(d);
    holidayDateSets[m] = s;
  }

  const markets = configs.map((c) => c.market);
  const calendar = buildCalendar(undefined, markets);
  const isPublicHoliday = createHolidayCheck(mergedPublic);
  const isSchoolHoliday = createHolidayCheck(mergedSchool);
  const isAnyHoliday = (market: string, date: string) =>
    isPublicHoliday(market, date) || isSchoolHoliday(market, date);

  const dailyByMarket = new Map<string, ReturnType<typeof aggregateByDay>>();
  for (const config of configs) {
    const expanded = expandPhases(calendar, config);
    const agg = aggregateByDay(expanded);
    dailyByMarket.set(config.market, agg);
  }

  const configByMarket = Object.fromEntries(configs.map((c) => [c.market, c]));

  const holidayCapacityStress = (market: string, date: string): number => {
    const taper = configByMarket[market]?.holidayCapacityTaperDays;
    const set = holidayDateSets[market] ?? new Set<string>();
    if (taper != null && taper > 0) {
      return holidayProximityStrength(date, set, taper, 'smoothstep');
    }
    return isAnyHoliday(market, date) ? 1 : 0;
  };

  type Meta = {
    /** Base store-trading rhythm (weekly × monthly × seasonal × regional), including early-month store boost shape. */
    store_trading_base: number;
    /** Trading pressure after campaign live/prep multipliers (before operating windows / school store mult). */
    store_pressure: number;
    campaign_active: boolean;
    campaign_risk: number;
    campaign_presence: number;
    /** Load-bearing campaign in prep (excludes `presence_only`). */
    campaign_in_prep: boolean;
    /** Load-bearing campaign in live segment (excludes `presence_only`). */
    campaign_in_live: boolean;
    holiday_flag: boolean;
    public_holiday_flag: boolean;
    school_holiday_flag: boolean;
  };
  const aggregated: AggregatedDay[] = [];
  const metaByIndex: Meta[] = [];
  for (const { date, market } of calendar) {
    const agg = dailyByMarket.get(market) || [];
    const dayRow = agg.find((r) => r.date === date && r.market === market);
    const config = configByMarket[market];
    const rawStore = getStorePressureForDate(date, config);
    // Early-month store boost (below) applies only to store-trading meta — lab/team/backend loads above come
    // from phase expansion unchanged.
    // Per-market YAML knots override legacy YAML peak; else global tuning knots.
    const yamlKnots = config?.tradingPressure?.payday_month_knot_multipliers;
    const yamlPeak = config?.tradingPressure?.payday_month_peak_multiplier;
    const tuningKnots = tuning.storePaydayMonthKnotMultipliers;
    const paydayMult = isPaydayKnotTuple(yamlKnots)
      ? storePaydayMonthMultiplierFromKnots(date, yamlKnots)
      : yamlPeak != null && Number.isFinite(yamlPeak)
        ? storePaydayMonthMultiplier(date, yamlPeak)
        : storePaydayMonthMultiplierFromKnots(date, tuningKnots);
    // Rhythm is already 0–1 from weekly/monthly/seasonal; apply early-month boost *after* that cap so
    // week-1 lift is visible (paydayMult capped at +20% on store rhythm; see paydayMonthShape).
    let store_trading_base = Math.min(
      paydayMult,
      Math.max(0, rawStore * paydayMult)
    );
    const public_holiday_flag = isPublicHoliday(market, date);
    const pubTrad = config?.publicHolidayTradingMultiplier;
    if (public_holiday_flag && pubTrad != null && Number.isFinite(pubTrad) && pubTrad > 0) {
      store_trading_base = Math.min(
        paydayMult,
        Math.max(0, store_trading_base * pubTrad)
      );
    }
    const {
      campaign_active,
      campaign_risk,
      campaign_in_prep_loaded,
      campaign_in_live_loaded,
    } = getCampaignStateForDate(date, config);
    const yamlCampaignScale = config?.tradingPressure?.campaign_effect_scale ?? 1;
    const campaignEffectScale = Math.min(
      2.5,
      Math.max(0, yamlCampaignScale * (tuning.campaignEffectUiMultiplier ?? 1))
    );
    const scaledCampaignRisk = Math.min(1, Math.max(0, campaign_risk * campaignEffectScale));
    const boostPrep = (config?.tradingPressure?.campaign_store_boost_prep ?? 0) * campaignEffectScale;
    const boostLive = (config?.tradingPressure?.campaign_store_boost_live ?? 0.28) * campaignEffectScale;
    const store_pressure = Math.min(
      STORE_PRESSURE_MAX,
      Math.max(
        0,
        store_trading_base *
          (1 +
            boostPrep * (campaign_in_prep_loaded ? 1 : 0) +
            boostLive * (campaign_in_live_loaded ? 1 : 0))
      )
    );
    const school_holiday_flag = isSchoolHoliday(market, date);
    const holiday_flag = public_holiday_flag || school_holiday_flag;
    aggregated.push({
      date,
      market,
      lab_load: dayRow?.lab_load ?? 0,
      team_load: dayRow?.team_load ?? 0,
      backend_load: dayRow?.backend_load ?? 0,
      ops_activity: dayRow?.ops_activity ?? 0,
      commercial_activity: dayRow?.commercial_activity ?? 0,
      lab_load_readiness: dayRow?.lab_load_readiness ?? 0,
      lab_load_sustain: dayRow?.lab_load_sustain ?? 0,
      team_load_readiness: dayRow?.team_load_readiness ?? 0,
      team_load_sustain: dayRow?.team_load_sustain ?? 0,
      backend_load_readiness: dayRow?.backend_load_readiness ?? 0,
      backend_load_sustain: dayRow?.backend_load_sustain ?? 0,
      surfaceTotals: dayRow?.surfaceTotals ?? emptySurfaceTotals(),
    });
    metaByIndex.push({
      store_trading_base,
      store_pressure,
      campaign_active,
      campaign_risk: scaledCampaignRisk,
      campaign_presence: campaign_active ? 1 : 0,
      campaign_in_prep: campaign_in_prep_loaded,
      campaign_in_live: campaign_in_live_loaded,
      holiday_flag,
      public_holiday_flag,
      school_holiday_flag,
    });
  }

  applyLoadCarryover(aggregated, configs);
  applyOperatingWindows(aggregated, metaByIndex, configByMarket);
  applySchoolStressCorrelations(aggregated, metaByIndex, configByMarket);

  /** School-holiday YAML cap mult × each active `operating_windows.lab_team_capacity_mult` (e.g. Oktoberfest). */
  const labTeamCapMultForDay = (market: string, date: string): number => {
    let m = 1;
    if (isSchoolHoliday(market, date)) {
      const sm = configByMarket[market]?.stressCorrelations?.school_holidays?.lab_team_capacity_mult;
      if (sm != null && Number.isFinite(sm)) m *= sm;
    }
    for (const w of configByMarket[market]?.operatingWindows ?? []) {
      if (!dateInInclusiveWindow(date, w.start, w.end)) continue;
      if (w.lab_team_capacity_mult != null && Number.isFinite(w.lab_team_capacity_mult)) {
        const ew = windowEffectWeight({ ...w, date });
        m *= blendTowardMultiplier(w.lab_team_capacity_mult, ew);
      }
    }
    return m;
  };

  const holidayCapScaleAtFullStress = (market: string, date: string): number => {
    const c = configByMarket[market];
    const baseHol =
      c?.holidayLabCapacityScale != null && Number.isFinite(c.holidayLabCapacityScale)
        ? Math.min(1, Math.max(0.12, c.holidayLabCapacityScale))
        : tuning.holidayCapacityScale;
    const pubDay = isPublicHoliday(market, date);
    const schDay = isSchoolHoliday(market, date);
    const pm = c?.publicHolidayStaffingMultiplier;
    const sm = c?.schoolHolidayStaffingMultiplier;
    const p = pm != null && Number.isFinite(pm) ? Math.min(1, Math.max(0.12, pm)) : baseHol;
    const s = sm != null && Number.isFinite(sm) ? Math.min(1, Math.max(0.12, sm)) : baseHol;
    if (pubDay && schDay) return Math.min(p, s);
    if (pubDay) return p;
    if (schDay) return s;
    return baseHol;
  };

  const withCapacity = computeCapacity(
    aggregated,
    configs,
    holidayCapacityStress,
    tuning.holidayCapacityScale,
    labTeamCapMultForDay,
    holidayCapScaleAtFullStress
  );
  const withStoreCampaign = withCapacity.map((r, i) => ({
    ...r,
    ...metaByIndex[i]!,
  }));
  const noisy = withOperationalNoise(computeRisk(withStoreCampaign, tuning));
  const riskSurface = noisy.map((r) => ({
    ...r,
    deployment_risk_01: computeDeploymentRisk01(
      r,
      configByMarket[r.market],
      r.date,
      tuning.marketRiskScales
    ),
  }));

  return { riskSurface, configs };
}

export function runPipelineFromDsl(dslText: string, tuning: RiskModelTuning = DEFAULT_RISK_TUNING): PipelineResult {
  try {
    const configs = parseYamlToConfigs(dslText);
    if (configs.length === 0) {
      return { riskSurface: [], configs: [], parseError: 'No valid config' };
    }
    return runPipeline(configs, {}, tuning);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { riskSurface: [], configs: [], parseError: msg };
  }
}

function dateInInclusiveWindow(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function windowEffectWeight(w: {
  start: string;
  end: string;
  ramp_in_days?: number;
  ramp_out_days?: number;
  envelope?: EnvelopeKind;
  date: string;
}): number {
  const span = inclusiveWindowSpan(w.start, w.end, w.date);
  if (!span) return 1;
  const ri = w.ramp_in_days ?? 0;
  const ro = w.ramp_out_days ?? 0;
  const hasRamp = ri > 0 || ro > 0;
  if (!hasRamp) return 1;
  const kind = w.envelope ?? 'smoothstep';
  return segmentEnvelopeWeight(span.dayIndex, span.totalDays, ri, ro, kind);
}

/** Date-bounded multipliers from YAML `operating_windows` (e.g. campaign lead + live). Applied before school correlations. */
function applyOperatingWindows(
  aggregated: AggregatedDay[],
  metaByIndex: { store_pressure: number }[],
  configByMarket: Record<string, MarketConfig>
): void {
  for (let i = 0; i < aggregated.length; i++) {
    const row = aggregated[i]!;
    const meta = metaByIndex[i]!;
    const windows = configByMarket[row.market]?.operatingWindows;
    if (!windows?.length) continue;
    for (const w of windows) {
      if (!dateInInclusiveWindow(row.date, w.start, w.end)) continue;
      const ew = windowEffectWeight({ ...w, date: row.date });
      if (w.lab_load_mult != null) {
        const m = blendTowardMultiplier(w.lab_load_mult, ew);
        scaleSurfaceLabs(row, m);
      }
      if (w.team_load_mult != null) {
        const m = blendTowardMultiplier(w.team_load_mult, ew);
        scaleSurfaceTeams(row, m);
      }
      if (w.backend_load_mult != null) {
        const m = blendTowardMultiplier(w.backend_load_mult, ew);
        scaleSurfaceBackend(row, m);
      }
      if (w.ops_activity_mult != null) {
        const m = blendTowardMultiplier(w.ops_activity_mult, ew);
        scaleSurfaceOps(row, m);
      }
      if (w.commercial_activity_mult != null) {
        const m = blendTowardMultiplier(w.commercial_activity_mult, ew);
        scaleSurfaceCommercial(row, m);
      }
      if (w.store_pressure_mult != null) {
        meta.store_pressure *= blendTowardMultiplier(w.store_pressure_mult, ew);
      }
    }
  }
}

/** Bump loads / store trading on school holidays when YAML defines `stress_correlations.school_holidays`. */
function applySchoolStressCorrelations(
  aggregated: AggregatedDay[],
  metaByIndex: {
    store_pressure: number;
    school_holiday_flag: boolean;
  }[],
  configByMarket: Record<string, MarketConfig>
): void {
  for (let i = 0; i < aggregated.length; i++) {
    const row = aggregated[i]!;
    const meta = metaByIndex[i]!;
    if (!meta.school_holiday_flag) continue;
    const s = configByMarket[row.market]?.stressCorrelations?.school_holidays;
    if (!s) continue;
    if (s.lab_load_mult != null) {
      scaleSurfaceLabs(row, s.lab_load_mult);
    }
    if (s.team_load_mult != null) {
      scaleSurfaceTeams(row, s.team_load_mult);
    }
    if (s.backend_load_mult != null) {
      scaleSurfaceBackend(row, s.backend_load_mult);
    }
    if (s.ops_activity_mult != null) scaleSurfaceOps(row, s.ops_activity_mult);
    if (s.commercial_activity_mult != null) scaleSurfaceCommercial(row, s.commercial_activity_mult);
    if (s.store_pressure_mult != null) {
      meta.store_pressure = Math.min(
        STORE_PRESSURE_MAX,
        Math.max(0, meta.store_pressure * s.store_pressure_mult)
      );
    }
  }
}

function getStorePressureForDate(dateStr: string, config: MarketConfig | undefined): number {
  if (!config?.trading || typeof config.trading !== 'object') return 0;
  const weekly = (config.trading as { weekly_pattern?: Record<string, unknown> }).weekly_pattern;
  if (!weekly) return 0;
  const d = parseDate(dateStr);
  const dayName = DAY_NAMES[d.getDay()];
  const level = weekly[dayName];
  if (level == null) return 0;
  const parsed = parseTechRhythmScalar(level);
  let p = parsed ?? 0.5;
  const monthKey = TRADING_MONTH_KEYS[d.getMonth()];
  if (monthKey) {
    const mm = config.monthlyTradingPattern?.[monthKey];
    if (mm != null && Number.isFinite(mm)) {
      p *= Math.min(1, Math.max(0, mm));
    }
  }
  const seas = config.seasonalTrading;
  if (seas && seas.amplitude > 0) {
    p *= seasonalTradingFactor(dateStr, seas.peak_month, seas.amplitude);
  }
  p = applyDecemberRestaurantSeasoning(dateStr, p);
  if (config?.market === 'AU') {
    p = applyAustraliaPostChristmasSummerLift(dateStr, p);
  }
  return Math.min(1, Math.max(0, p));
}

function scaleSurfaceLabs(row: AggregatedDay, m: number): void {
  for (const id of PRESSURE_SURFACE_IDS) {
    const sl = row.surfaceTotals[id];
    sl.lab_readiness *= m;
    sl.lab_sustain *= m;
  }
  recomputeAggregatedTotals(row);
}

function scaleSurfaceTeams(row: AggregatedDay, m: number): void {
  for (const id of PRESSURE_SURFACE_IDS) {
    const sl = row.surfaceTotals[id];
    sl.team_readiness *= m;
    sl.team_sustain *= m;
  }
  recomputeAggregatedTotals(row);
}

function scaleSurfaceBackend(row: AggregatedDay, m: number): void {
  for (const id of PRESSURE_SURFACE_IDS) {
    const sl = row.surfaceTotals[id];
    sl.backend_readiness *= m;
    sl.backend_sustain *= m;
  }
  recomputeAggregatedTotals(row);
}

function scaleSurfaceOps(row: AggregatedDay, m: number): void {
  for (const id of PRESSURE_SURFACE_IDS) {
    row.surfaceTotals[id].ops *= m;
  }
  recomputeAggregatedTotals(row);
}

function scaleSurfaceCommercial(row: AggregatedDay, m: number): void {
  for (const id of PRESSURE_SURFACE_IDS) {
    row.surfaceTotals[id].commercial *= m;
  }
  recomputeAggregatedTotals(row);
}

function campaignImpactValue(c: CampaignConfig): number {
  const fromImpact =
    c.impact && Object.prototype.hasOwnProperty.call(CAMPAIGN_IMPACT, c.impact)
      ? CAMPAIGN_IMPACT[c.impact as keyof typeof CAMPAIGN_IMPACT]
      : undefined;
  const fromLoad =
    c.load?.commercial != null && Number.isFinite(c.load.commercial) ? c.load.commercial : undefined;
  const base = fromImpact ?? fromLoad ?? 0.5;
  const uplift = c.businessUplift;
  const u = uplift != null && Number.isFinite(uplift) ? uplift : 1;
  return Math.min(1, Math.max(0, base * u));
}

/**
 * Calendar + marketing intensity for any campaign row (including `presence_only`).
 * Load-bearing prep/live flags exclude `presence_only` so store boost does not double-count operating_windows.
 */
function getCampaignStateForDate(dateStr: string, config: MarketConfig | undefined): {
  campaign_active: boolean;
  campaign_risk: number;
  campaign_in_prep_loaded: boolean;
  campaign_in_live_loaded: boolean;
} {
  let campaign_active = false;
  let campaign_risk = 0;
  let campaign_in_prep_loaded = false;
  let campaign_in_live_loaded = false;
  const campaigns = config?.campaigns ?? [];
  for (const c of campaigns) {
    const seg = campaignLoadBearingPrepLiveForDate(c, dateStr);
    if (!seg.inCampaignWindow) continue;
    campaign_active = true;
    campaign_risk = Math.max(campaign_risk, campaignImpactValue(c));
    if (seg.inPrepLoaded) campaign_in_prep_loaded = true;
    if (seg.inLiveLoaded) campaign_in_live_loaded = true;
  }
  return { campaign_active, campaign_risk, campaign_in_prep_loaded, campaign_in_live_loaded };
}
