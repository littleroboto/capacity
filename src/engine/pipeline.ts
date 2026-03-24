/**
 * Planning pipeline: YAML configs → daily loads (with pressure surfaces) → carry-over →
 * operating windows / school stress → effective capacity → weighted pressure + explainable surfaces.
 */
import { PRESSURE_SURFACE_IDS } from '@/domain/pressureSurfaces';
import { emptySurfaceTotals } from '@/domain/pressureSurfaces';
import { applyLoadCarryover } from '@/planning/carryover';
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
import { withOperationalNoise } from './dataNoise';
import { computeRisk, type RiskRow } from './riskModel';
import { storePaydayMonthMultiplier } from '@/engine/paydayMonthShape';
import { DEFAULT_RISK_TUNING, type RiskModelTuning } from './riskModelTuning';
import type { MarketConfig } from './types';
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
const TRADING_LEVELS: Record<string, number> = { low: 0.25, medium: 0.5, high: 0.75, very_high: 1 };
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
    store_pressure: number;
    campaign_active: boolean;
    campaign_risk: number;
    campaign_presence: number;
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
    const store_pressure = Math.min(
      1,
      Math.max(0, rawStore * storePaydayMonthMultiplier(date, tuning.storePaydayMonthPeakMultiplier))
    );
    const { campaign_active, campaign_risk } = getCampaignRiskForDate(date, config);
    const public_holiday_flag = isPublicHoliday(market, date);
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
      store_pressure,
      campaign_active,
      campaign_risk,
      campaign_presence: campaign_active ? 1 : 0,
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

  const withCapacity = computeCapacity(
    aggregated,
    configs,
    holidayCapacityStress,
    tuning.holidayCapacityScale,
    labTeamCapMultForDay
  );
  const withStoreCampaign = withCapacity.map((r, i) => ({
    ...r,
    ...metaByIndex[i]!,
  }));
  const riskSurface = withOperationalNoise(computeRisk(withStoreCampaign, tuning));

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
      meta.store_pressure = Math.min(1, meta.store_pressure * s.store_pressure_mult);
    }
  }
}

function getStorePressureForDate(dateStr: string, config: MarketConfig | undefined): number {
  if (!config?.trading || typeof config.trading !== 'object') return 0;
  const weekly = (config.trading as { weekly_pattern?: Record<string, string> }).weekly_pattern;
  if (!weekly) return 0;
  const d = parseDate(dateStr);
  const dayName = DAY_NAMES[d.getDay()];
  const level = weekly[dayName];
  if (level == null) return 0;
  let p = TRADING_LEVELS[String(level).toLowerCase()] ?? 0.5;
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

function getCampaignRiskForDate(dateStr: string, config: MarketConfig | undefined): {
  campaign_active: boolean;
  campaign_risk: number;
} {
  let campaign_active = false;
  let campaign_risk = 0;
  const campaigns = config?.campaigns ?? [];
  const t = parseDate(dateStr);
  for (const c of campaigns) {
    if (!c.start) continue;
    const start = parseDate(c.start);
    const prepDays = c.prepBeforeLiveDays;
    if (prepDays != null && prepDays > 0) {
      const prepStart = new Date(start);
      prepStart.setDate(prepStart.getDate() - prepDays);
      const liveEnd = new Date(start);
      liveEnd.setDate(liveEnd.getDate() + c.durationDays);
      const inPrep = t >= prepStart && t < start;
      const inLive = c.durationDays > 0 && t >= start && t < liveEnd;
      if (inPrep || inLive) {
        campaign_active = true;
        const fromImpact =
          c.impact && Object.prototype.hasOwnProperty.call(CAMPAIGN_IMPACT, c.impact)
            ? CAMPAIGN_IMPACT[c.impact as keyof typeof CAMPAIGN_IMPACT]
            : undefined;
        const fromLoad =
          c.load?.commercial != null && Number.isFinite(c.load.commercial) ? c.load.commercial : undefined;
        const impact = fromImpact ?? fromLoad ?? 0.5;
        campaign_risk = Math.max(campaign_risk, impact);
      }
      continue;
    }
    if (!c.durationDays) continue;
    const end = new Date(start);
    end.setDate(end.getDate() + c.durationDays);
    if (t >= start && t < end) {
      campaign_active = true;
      const fromImpact =
        c.impact && Object.prototype.hasOwnProperty.call(CAMPAIGN_IMPACT, c.impact)
          ? CAMPAIGN_IMPACT[c.impact as keyof typeof CAMPAIGN_IMPACT]
          : undefined;
      const fromLoad =
        c.load?.commercial != null && Number.isFinite(c.load.commercial) ? c.load.commercial : undefined;
      const impact = fromImpact ?? fromLoad ?? 0.5;
      campaign_risk = Math.max(campaign_risk, impact);
    }
  }
  return { campaign_active, campaign_risk };
}
