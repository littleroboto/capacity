import yaml from 'js-yaml';
import { parseRiskHeatmapCurve } from '@/lib/riskHeatmapTransfer';
import type {
  BauEntry,
  CampaignConfig,
  DeploymentRiskBlackout,
  DeploymentRiskEvent,
  MarketConfig,
  OperatingWindow,
  PhaseLoad,
  ReleaseConfig,
  SchoolHolidayStress,
  SeasonalTradingConfig,
  StressCorrelations,
  TechRhythmConfig,
  TechProgrammeConfig,
  TradingPressureKnobs,
} from './types';
import { expandTechWeeklyPattern } from './techWeeklyPattern';
import { PAYDAY_MONTH_MULTIPLIER_MAX } from './paydayMonthShape';
import type { EnvelopeKind } from './weighting';
import type { TradingMonthKey } from '@/lib/tradingMonthlyDsl';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Lowercase tokens → JS weekday (Sun = 0). */
const DAY_TOKEN_TO_WEEKDAY: Record<string, number> = {
  su: 0,
  sun: 0,
  sunday: 0,
  mo: 1,
  mon: 1,
  monday: 1,
  tu: 2,
  tue: 2,
  tues: 2,
  tuesday: 2,
  we: 3,
  wed: 3,
  weds: 3,
  wednesday: 3,
  th: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fr: 5,
  fri: 5,
  friday: 5,
  sa: 6,
  sat: 6,
  saturday: 6,
};

const IMPACT_TO_LOAD: Record<string, number> = { low: 0.25, medium: 0.5, high: 0.8, very_high: 1 };

function pickPhaseLoad(raw: unknown): PhaseLoad {
  if (raw == null || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const n = (k: keyof PhaseLoad): number | undefined => {
    const v = o[k];
    if (v == null || v === '') return undefined;
    const x = Number(v);
    return Number.isFinite(x) ? x : undefined;
  };
  const out: PhaseLoad = {};
  const labs = n('labs');
  const teams = n('teams');
  const backend = n('backend');
  const ops = n('ops');
  const commercial = n('commercial');
  if (labs != null) out.labs = labs;
  if (teams != null) out.teams = teams;
  if (backend != null) out.backend = backend;
  if (ops != null) out.ops = ops;
  if (commercial != null) out.commercial = commercial;
  return out;
}

/**
 * js-yaml deserializes unquoted `YYYY-MM-DD` as JavaScript `Date`. `String(date)` is not ISO and breaks
 * `parseDate()` / lexicographic window checks in the pipeline.
 */
function coerceYamlDateString(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

function weekDayFromToken(tok: string): number | undefined {
  const s = String(tok).trim();
  if (WEEKDAYS.includes(s)) return WEEKDAYS.indexOf(s);
  const k = s.toLowerCase();
  return DAY_TOKEN_TO_WEEKDAY[k];
}

/** `campaigns` as list or map keyed by campaign id. */
function normalizeCampaignsInput(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const out: unknown[] = [];
    for (const [defaultName, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v == null) continue;
      if (typeof v !== 'object' || Array.isArray(v)) continue;
      const row = { ...(v as Record<string, unknown>) };
      if (row.name == null || String(row.name).trim() === '') row.name = defaultName;
      out.push(row);
    }
    return out;
  }
  return [];
}

function parseDaysInUse(raw: unknown): number[] | undefined {
  if (raw == null) return undefined;
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? String(raw)
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const days: number[] = [];
  for (const item of list) {
    const w = weekDayFromToken(String(item));
    if (w !== undefined && !days.includes(w)) days.push(w);
  }
  return days.length ? days : undefined;
}

function mapCampaignSupportToPhaseLoad(raw: unknown): PhaseLoad {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const num = (x: unknown): number | undefined => {
    if (x == null || x === '') return undefined;
    const n = Number(x);
    return Number.isFinite(n) ? n : undefined;
  };
  const out: PhaseLoad = {};
  const labs = num(o.labs_required ?? o.labsRequired ?? o.labs);
  const teams = num(o.tech_staff ?? o.techStaff ?? o.staff ?? o.teams);
  const backend = num(o.backend);
  const ops = num(o.ops ?? o.supply);
  const commercial = num(o.commercial ?? o.marketing);
  if (labs != null) out.labs = labs;
  if (teams != null) out.teams = teams;
  if (backend != null) out.backend = backend;
  if (ops != null) out.ops = ops;
  if (commercial != null) out.commercial = commercial;
  return out;
}

/** Tech programmes: labs / teams / backend only (YAML ops/commercial ignored). */
function stripNonTechPhaseLoad(pl: PhaseLoad): PhaseLoad {
  const out: PhaseLoad = {};
  if (pl.labs != null) out.labs = pl.labs;
  if (pl.teams != null) out.teams = pl.teams;
  if (pl.backend != null) out.backend = pl.backend;
  return out;
}

/**
 * Expand `trading.weekly_pattern` the same way as `tech.weekly_pattern`: per-day **0–1** numbers after parse,
 * or named levels (`low` / `medium` / `high` / `very_high`). Supports `default`, `weekdays`, `weekend`, and `Mon`…`Sun`.
 */
function expandTradingWeeklyPattern(trading: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!trading || typeof trading !== 'object') return trading ?? {};
  const wp = trading.weekly_pattern;
  if (!wp || typeof wp !== 'object') return trading;
  const expanded = expandTechWeeklyPattern(wp as Record<string, unknown>);
  if (!expanded) return trading;
  return { ...trading, weekly_pattern: expanded };
}

export type ParsedYaml = {
  /** Market id (`market:` or legacy `country:` in YAML). */
  country: string;
  /** Display title; pipeline defaults to market id when omitted. */
  title?: string;
  description?: string;
  resources: {
    labs: Record<string, unknown>;
    teams: Record<string, unknown>;
    staff?: Record<string, unknown>;
    testing_capacity?: unknown;
  };
  bau: Record<string, unknown>;
  campaigns: unknown[];
  /** Infra / platform work (same timing shape as campaigns; no trading uplift). */
  tech_programmes: unknown[];
  holidays: Record<string, unknown>;
  /** New schema: `public_holidays` block (dates, auto, multipliers). */
  public_holidays?: Record<string, unknown>;
  /** New schema: `school_holidays` block. */
  school_holidays?: Record<string, unknown>;
  trading: Record<string, unknown>;
  tech: Record<string, unknown>;
  stress_correlations: Record<string, unknown>;
  operating_windows: unknown[];
  releases: unknown[];
  /** Legacy / fallback heatmap γ. */
  risk_heatmap_gamma?: number;
  risk_heatmap_gamma_tech?: number;
  risk_heatmap_gamma_business?: number;
  /** Transfer curve id for combined heatmap (optional; default power). */
  risk_heatmap_curve?: string;
  deployment_risk_events?: unknown[];
  deployment_risk_blackouts?: unknown[];
  deployment_risk_month_curve?: Record<string, unknown>;
  deployment_risk_context_month_curve?: Record<string, unknown>;
  deployment_risk_week_weight?: number;
  deployment_resourcing_strain_weight?: number;
};

const EMPTY: ParsedYaml = {
  country: '',
  resources: { labs: {}, teams: {}, testing_capacity: undefined },
  bau: {},
  campaigns: [],
  tech_programmes: [],
  holidays: {},
  trading: {},
  tech: {},
  stress_correlations: {},
  operating_windows: [],
  releases: [],
  risk_heatmap_gamma: undefined,
  risk_heatmap_gamma_tech: undefined,
  risk_heatmap_gamma_business: undefined,
  risk_heatmap_curve: undefined,
  deployment_risk_events: undefined,
  deployment_risk_blackouts: undefined,
  deployment_risk_month_curve: undefined,
  deployment_risk_context_month_curve: undefined,
  deployment_risk_week_weight: undefined,
  deployment_resourcing_strain_weight: undefined,
};

function normalizeYamlObject(raw: unknown): ParsedYaml {
  if (raw == null || typeof raw !== 'object') {
    return { ...EMPTY };
  }
  const o = raw as Record<string, unknown>;
  const titleRaw = o.title;
  const title =
    titleRaw != null && String(titleRaw).trim() ? String(titleRaw).trim() : undefined;
  const descRaw = o.description;
  const description =
    descRaw != null && String(descRaw).trim() ? String(descRaw).trim() : undefined;
  const rawGamma = o.risk_heatmap_gamma;
  const g = rawGamma == null || rawGamma === '' ? NaN : Number(rawGamma);
  const gt = o.risk_heatmap_gamma_tech ?? o.riskHeatmapGammaTech;
  const gb = o.risk_heatmap_gamma_business ?? o.riskHeatmapGammaBusiness;
  const gTech = gt == null || gt === '' ? NaN : Number(gt);
  const gBus = gb == null || gb === '' ? NaN : Number(gb);
  const baseHolidays = { ...((o.holidays as Record<string, unknown>) ?? {}) };
  const pubBlock = (o.public_holidays as Record<string, unknown>) ?? (o.publicHolidays as Record<string, unknown>);
  const schBlock = (o.school_holidays as Record<string, unknown>) ?? (o.schoolHolidays as Record<string, unknown>);
  if (pubBlock && typeof pubBlock === 'object' && pubBlock.auto !== undefined) {
    baseHolidays.auto_public = pubBlock.auto;
  }
  if (schBlock && typeof schBlock === 'object' && schBlock.auto !== undefined) {
    baseHolidays.auto_school = schBlock.auto;
  }

  return {
    country: String(o.market ?? o.country ?? ''),
    title,
    description,
    resources: {
      labs: (o.resources as { labs?: Record<string, unknown> })?.labs ?? {},
      teams: (o.resources as { teams?: Record<string, unknown> })?.teams ?? {},
      staff: (o.resources as { staff?: Record<string, unknown> })?.staff,
      testing_capacity:
        (o.resources as { testing_capacity?: unknown })?.testing_capacity ??
        (o.resources as { testingCapacity?: unknown })?.testingCapacity,
    },
    bau: (o.bau as Record<string, unknown>) ?? {},
    campaigns: normalizeCampaignsInput(o.campaigns),
    tech_programmes: normalizeCampaignsInput(o.tech_programmes ?? o.techProgrammes),
    holidays: baseHolidays,
    public_holidays: pubBlock && typeof pubBlock === 'object' ? pubBlock : undefined,
    school_holidays: schBlock && typeof schBlock === 'object' ? schBlock : undefined,
    trading: (o.trading as Record<string, unknown>) ?? {},
    tech: (o.tech as Record<string, unknown>) ?? {},
    stress_correlations: (o.stress_correlations as Record<string, unknown>) ?? {},
    operating_windows: Array.isArray(o.operating_windows) ? o.operating_windows : [],
    releases: Array.isArray(o.releases) ? o.releases : [],
    risk_heatmap_gamma: Number.isFinite(g) ? g : undefined,
    risk_heatmap_gamma_tech: Number.isFinite(gTech) ? gTech : undefined,
    risk_heatmap_gamma_business: Number.isFinite(gBus) ? gBus : undefined,
    risk_heatmap_curve:
      o.risk_heatmap_curve == null || o.risk_heatmap_curve === ''
        ? undefined
        : String(o.risk_heatmap_curve).trim(),
    deployment_risk_events: Array.isArray(o.deployment_risk_events)
      ? o.deployment_risk_events
      : Array.isArray(o.deploymentRiskEvents)
        ? o.deploymentRiskEvents
        : undefined,
    deployment_risk_blackouts: Array.isArray(o.deployment_risk_blackouts)
      ? o.deployment_risk_blackouts
      : Array.isArray(o.deploymentRiskBlackouts)
        ? o.deploymentRiskBlackouts
        : undefined,
    deployment_risk_month_curve:
      o.deployment_risk_month_curve != null && typeof o.deployment_risk_month_curve === 'object'
        ? (o.deployment_risk_month_curve as Record<string, unknown>)
        : o.deploymentRiskMonthCurve != null && typeof o.deploymentRiskMonthCurve === 'object'
          ? (o.deploymentRiskMonthCurve as Record<string, unknown>)
          : undefined,
    deployment_risk_context_month_curve:
      o.deployment_risk_context_month_curve != null &&
      typeof o.deployment_risk_context_month_curve === 'object'
        ? (o.deployment_risk_context_month_curve as Record<string, unknown>)
        : o.deploymentRiskContextMonthCurve != null &&
            typeof o.deploymentRiskContextMonthCurve === 'object'
          ? (o.deploymentRiskContextMonthCurve as Record<string, unknown>)
          : undefined,
    deployment_risk_week_weight: (() => {
      const drw = o.deployment_risk_week_weight ?? o.deploymentRiskWeekWeight;
      const n = Number(drw);
      return drw != null && drw !== '' && Number.isFinite(n) ? n : undefined;
    })(),
    deployment_resourcing_strain_weight: (() => {
      const w = o.deployment_resourcing_strain_weight ?? o.deploymentResourcingStrainWeight;
      const n = Number(w);
      return w != null && w !== '' && Number.isFinite(n) ? n : undefined;
    })(),
  };
}

export function parseYamlDSL(dslText: string): ParsedYaml {
  if (!dslText || !String(dslText).trim()) {
    return { ...EMPTY };
  }
  let raw: unknown;
  try {
    raw = yaml.load(dslText) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`YAML parse error: ${msg}`);
  }
  return normalizeYamlObject(raw);
}

function clampHeatmapGamma(n: number): number {
  return Math.min(3, Math.max(0.35, n));
}

function mapTradingPressureKnobs(
  trading: Record<string, unknown> | undefined
): TradingPressureKnobs | undefined {
  if (!trading || typeof trading !== 'object') return undefined;
  const pick = (snake: string, camel: string): number | undefined => {
    const raw = (trading as Record<string, unknown>)[snake] ?? (trading as Record<string, unknown>)[camel];
    const n = Number(raw);
    if (raw == null || raw === '' || !Number.isFinite(n) || n < 0) return undefined;
    return n;
  };
  const prep = pick('campaign_store_boost_prep', 'campaignStoreBoostPrep');
  const live = pick('campaign_store_boost_live', 'campaignStoreBoostLive');
  const payday = pick('payday_month_peak_multiplier', 'paydayMonthPeakMultiplier');
  const effect = pick('campaign_effect_scale', 'campaignEffectScale');
  const rawKnots =
    (trading as Record<string, unknown>).payday_month_knot_multipliers ??
    (trading as Record<string, unknown>).paydayMonthKnotMultipliers;
  let paydayKnots: [number, number, number, number] | undefined;
  if (Array.isArray(rawKnots) && rawKnots.length === 4) {
    const nums = rawKnots.map((x) => Number(x));
    if (nums.every((n) => Number.isFinite(n))) {
      paydayKnots = nums.map((n) =>
        Math.min(PAYDAY_MONTH_MULTIPLIER_MAX, Math.max(1, n))
      ) as [number, number, number, number];
    }
  }
  if (prep == null && live == null && payday == null && effect == null && paydayKnots == null) return undefined;
  const out: TradingPressureKnobs = {};
  if (effect != null) out.campaign_effect_scale = Math.min(2.5, Math.max(0, effect));
  if (prep != null) out.campaign_store_boost_prep = Math.min(0.9, prep);
  if (live != null) out.campaign_store_boost_live = Math.min(1.5, live);
  if (payday != null)
    out.payday_month_peak_multiplier = Math.min(PAYDAY_MONTH_MULTIPLIER_MAX, Math.max(1, payday));
  if (paydayKnots != null) out.payday_month_knot_multipliers = paydayKnots;
  return Object.keys(out).length ? out : undefined;
}

function mapReleases(raw: unknown[] | undefined): ReleaseConfig[] {
  if (!raw?.length) return [];
  const out: ReleaseConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const deployDateRaw = row.deploy_date ?? row.deployDate;
    const deployDateStr =
      deployDateRaw != null && String(deployDateRaw).trim()
        ? coerceYamlDateString(deployDateRaw)
        : '';
    const systemsRaw = row.systems;
    const systems = Array.isArray(systemsRaw)
      ? systemsRaw.map((s) => String(s).trim()).filter((s) => s.length > 0)
      : [];
    const phasesRaw = row.phases;
    const phases: { name: string; offsetDays: number }[] = [];
    if (Array.isArray(phasesRaw)) {
      for (const p of phasesRaw) {
        if (!p || typeof p !== 'object') continue;
        const pr = p as Record<string, unknown>;
        const name = String(pr.name ?? 'phase');
        const off = Number(pr.offset_days ?? pr.offsetDays);
        phases.push({ name, offsetDays: Number.isFinite(off) ? Math.floor(off) : 0 });
      }
    }
    const loadObj = row.load;
    const load: Record<string, number> = {};
    if (loadObj && typeof loadObj === 'object') {
      for (const [k, v] of Object.entries(loadObj as Record<string, unknown>)) {
        const n = Number(v);
        if (Number.isFinite(n)) load[k] = n;
      }
    }
    if (!systems.length || !phases.length) continue;
    out.push({
      ...(deployDateStr ? { deployDate: deployDateStr } : {}),
      systems,
      phases,
      load,
    });
  }
  return out;
}

function normalizeDateList(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const item of raw) {
    const s = coerceYamlDateString(item);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) out.push(s);
  }
  return out.length ? out : undefined;
}

/** Readable BAU: `days_in_use` + `weekly_cycle.labs_required` / `staff_required`. */
function mapBauModern(bauSection: Record<string, unknown> | undefined): BauEntry | BauEntry[] | undefined {
  if (!bauSection || typeof bauSection !== 'object') return undefined;
  const days = parseDaysInUse(bauSection.days_in_use ?? bauSection.daysInUse);
  const cycle = bauSection.weekly_cycle ?? bauSection.weeklyCycle;
  if (!days?.length || !cycle || typeof cycle !== 'object') return undefined;
  const c = cycle as Record<string, unknown>;
  const labs = Number(c.labs_required ?? c.labsRequired ?? c.labs) || 0;
  const staff = Number(c.staff_required ?? c.staffRequired ?? c.tech_staff ?? c.teams) || 0;
  const supportDays = Number(c.support_days ?? c.supportDays) || 0;
  const load: PhaseLoad = { labs, teams: staff };
  const entries: BauEntry[] = [];
  for (const w of days) {
    const end = supportDays > 0 ? Math.min(6, w + supportDays - 1) : w;
    const entry: BauEntry = {
      name: `bau_${WEEKDAYS[w] ?? 'day'}`,
      weekday: w,
      load,
    };
    if (supportDays > 0) {
      entry.supportStart = w;
      entry.supportEnd = end;
    }
    entries.push(entry);
  }
  if (entries.length === 0) return undefined;
  return entries.length === 1 ? entries[0]! : entries;
}

function mergeStressCorrelations(
  a: StressCorrelations | undefined,
  b: StressCorrelations | undefined
): StressCorrelations | undefined {
  if (!a) return b;
  if (!b) return a;
  const sa = a.school_holidays ?? {};
  const sb = b.school_holidays ?? {};
  const merged: SchoolHolidayStress = { ...sa, ...sb };
  return { school_holidays: merged };
}

function stressFromSchoolHolidayBlock(block: Record<string, unknown>): StressCorrelations | undefined {
  const school_holidays: SchoolHolidayStress = {};
  const le = (block.load_effects ?? block.loadEffects) as Record<string, unknown> | undefined;
  if (le && typeof le === 'object') {
    const keys: (keyof SchoolHolidayStress)[] = [
      'store_pressure_mult',
      'lab_load_mult',
      'team_load_mult',
      'backend_load_mult',
      'ops_activity_mult',
      'commercial_activity_mult',
      'lab_team_capacity_mult',
    ];
    for (const k of keys) {
      const n = Number(le[k]);
      if (Number.isFinite(n)) school_holidays[k] = n;
    }
  }
  const tm = Number(block.trading_multiplier ?? block.tradingMultiplier);
  if (Number.isFinite(tm) && tm > 0) school_holidays.store_pressure_mult = tm;
  return Object.keys(school_holidays).length ? { school_holidays } : undefined;
}

function mapTechProgrammeFromYamlRow(row: Record<string, unknown>): TechProgrammeConfig {
  const progSupport =
    row.programme_support ?? row.programmeSupport ?? row.campaign_support ?? row.campaignSupport;
  const cs = mapCampaignSupportToPhaseLoad(progSupport);
  const yamlLoad = pickPhaseLoad(row.load);
  const mergedPrep: PhaseLoad = Object.keys(cs).length > 0 ? { ...yamlLoad, ...cs } : yamlLoad;
  const prepStrip = stripNonTechPhaseLoad(mergedPrep);

  const prepRaw =
    row.testing_prep_duration ??
    row.testingPrepDuration ??
    row.prep_before_live_days ??
    row.prepBeforeLiveDays;
  const pbd = Number(prepRaw);
  const prepBeforeLiveDays =
    prepRaw != null && prepRaw !== '' && Number.isFinite(pbd) && pbd > 0 ? Math.floor(pbd) : undefined;
  const readinessDurRaw = row.readiness_duration ?? row.readinessDurationDays;
  const rd = Number(readinessDurRaw);
  const readinessDurationDays =
    prepBeforeLiveDays != null
      ? undefined
      : readinessDurRaw != null && readinessDurRaw !== '' && Number.isFinite(rd) && rd > 0
        ? Math.floor(rd)
        : undefined;

  const liveProg =
    row.live_programme_support ??
    row.liveProgrammeSupport ??
    row.live_campaign_support ??
    row.liveCampaignSupport ??
    row.live_support ??
    row.liveSupport;
  const liveCs = mapCampaignSupportToPhaseLoad(liveProg);
  const liveExplicit = pickPhaseLoad(row.live_support_load ?? row.liveSupportLoad);
  const liveMerged: PhaseLoad =
    Object.keys(liveCs).length > 0 ? { ...liveExplicit, ...liveCs } : liveExplicit;
  const liveStrip = stripNonTechPhaseLoad(liveMerged);
  const hasLiveKeys = Object.keys(liveStrip).length > 0;
  const lssRaw = row.live_support_scale ?? row.liveSupportScale;
  const lssNum = Number(lssRaw);
  const liveSupportScale =
    lssRaw != null && lssRaw !== '' && Number.isFinite(lssNum) && lssNum > 0 && lssNum <= 1
      ? lssNum
      : undefined;
  const ltRaw = row.live_tech_load_scale ?? row.liveTechLoadScale;
  const ltNum = Number(ltRaw);
  const liveTechLoadScale =
    ltRaw != null && ltRaw !== '' && Number.isFinite(ltNum) && ltNum >= 0 ? Math.min(2.5, ltNum) : undefined;

  return {
    name: String(row.name ?? 'tech_programme'),
    start: coerceYamlDateString(row.start_date ?? row.startDate ?? row.start),
    durationDays: Number(row.duration) || 0,
    prepBeforeLiveDays,
    readinessDurationDays,
    live_support_load: hasLiveKeys ? liveStrip : undefined,
    liveSupportScale,
    liveTechLoadScale,
    load: prepStrip,
    replacesBauTech:
      row.replaces_bau_tech === true ||
      row.replacesBauTech === true ||
      row.replace_bau_tech === true,
  };
}

export function yamlToPipelineConfig(parsed: ParsedYaml): MarketConfig {
  const market = parsed.country || 'DE';
  const staffRaw = (parsed.resources?.staff as { capacity?: unknown } | undefined)?.capacity;
  const staffNum = Number(staffRaw);
  const fromStaff =
    staffRaw != null && staffRaw !== '' && Number.isFinite(staffNum) && staffNum > 0 ? staffNum : undefined;
  const capacity = {
    labs: Number((parsed.resources?.labs as { capacity?: number })?.capacity) || 5,
    teams: fromStaff ?? sumTeamSizes(parsed.resources?.teams as Record<string, { size?: number }> | undefined),
    backend: 1000,
  };
  const tcRaw = parsed.resources?.testing_capacity;
  const tcNum = Number(tcRaw);
  const testingCapacity =
    tcRaw != null && tcRaw !== '' && Number.isFinite(tcNum) && tcNum > 0 ? Math.min(50, tcNum) : undefined;
  const bau = combineBau(parsed.bau);
  const campaigns: CampaignConfig[] = (parsed.campaigns || []).map((c) => {
    const row = c as Record<string, unknown>;
    const impactKey = String(row.impact ?? '').toLowerCase();
    const fromImpact = IMPACT_TO_LOAD[impactKey];
    const cs = mapCampaignSupportToPhaseLoad(row.campaign_support ?? row.campaignSupport);
    const yamlLoad = pickPhaseLoad(row.load);
    const mergedPrep: PhaseLoad =
      Object.keys(cs).length > 0 ? { ...yamlLoad, ...cs } : yamlLoad;
    const commercial =
      mergedPrep.commercial ?? yamlLoad.commercial ?? (fromImpact !== undefined ? fromImpact : 0.5);
    const prepRaw =
      row.testing_prep_duration ??
      row.testingPrepDuration ??
      row.prep_before_live_days ??
      row.prepBeforeLiveDays;
    const pbd = Number(prepRaw);
    const prepBeforeLiveDays =
      prepRaw != null && prepRaw !== '' && Number.isFinite(pbd) && pbd > 0 ? Math.floor(pbd) : undefined;
    const readinessDurRaw = row.readiness_duration ?? row.readinessDurationDays;
    const rd = Number(readinessDurRaw);
    const readinessDurationDays =
      prepBeforeLiveDays != null
        ? undefined
        : readinessDurRaw != null && readinessDurRaw !== '' && Number.isFinite(rd) && rd > 0
          ? Math.floor(rd)
          : undefined;
    const liveCs = mapCampaignSupportToPhaseLoad(
      row.live_campaign_support ?? row.liveCampaignSupport ?? row.live_support ?? row.liveSupport
    );
    const liveExplicit = pickPhaseLoad(row.live_support_load ?? row.liveSupportLoad);
    const liveMerged: PhaseLoad =
      Object.keys(liveCs).length > 0 ? { ...liveExplicit, ...liveCs } : liveExplicit;
    const live_support_load = liveMerged;
    const hasLiveKeys = Object.keys(live_support_load).length > 0;
    const lssRaw = row.live_support_scale ?? row.liveSupportScale;
    const lssNum = Number(lssRaw);
    const liveSupportScale =
      lssRaw != null && lssRaw !== '' && Number.isFinite(lssNum) && lssNum > 0 && lssNum <= 1
        ? lssNum
        : undefined;
    const ltRaw = row.live_tech_load_scale ?? row.liveTechLoadScale;
    const ltNum = Number(ltRaw);
    const liveTechLoadScale =
      ltRaw != null && ltRaw !== '' && Number.isFinite(ltNum) && ltNum >= 0
        ? Math.min(2.5, ltNum)
        : undefined;
    const stagger =
      row.stagger_functional_loads === true ||
      row.staggerFunctionalLoads === true ||
      row.stagger_functional_load === true;
    const pickU = (k: string, camel: string, def?: number): number | undefined => {
      const raw = row[k] ?? row[camel];
      const n = Number(raw);
      if (raw == null || raw === '' || !Number.isFinite(n) || n < 0) return def;
      return Math.floor(n);
    };
    const buRaw = row.business_uplift ?? row.businessUplift;
    const buNum = Number(buRaw);
    const businessUplift =
      buRaw != null && buRaw !== '' && Number.isFinite(buNum) && buNum >= 0
        ? Math.min(2.5, buNum)
        : undefined;
    return {
      name: String(row.name ?? 'campaign'),
      start: coerceYamlDateString(row.start_date ?? row.startDate ?? row.start),
      durationDays: Number(row.duration) || 0,
      businessUplift,
      prepBeforeLiveDays,
      readinessDurationDays,
      live_support_load: hasLiveKeys ? live_support_load : undefined,
      liveSupportScale,
      liveTechLoadScale,
      load: { ...mergedPrep, commercial },
      impact: row.impact != null ? String(row.impact) : undefined,
      presenceOnly: row.presence_only === true || row.presenceOnly === true,
      replacesBauTech:
        row.replaces_bau_tech === true ||
        row.replacesBauTech === true ||
        row.replace_bau_tech === true,
      staggerFunctionalLoads: stagger,
      techPrepDaysBeforeLive: pickU('tech_prep_days_before_live', 'techPrepDaysBeforeLive'),
      techFinishBeforeLiveDays: pickU('tech_finish_before_live_days', 'techFinishBeforeLiveDays'),
      marketingPrepDaysBeforeLive: pickU('marketing_prep_days_before_live', 'marketingPrepDaysBeforeLive'),
      supplyPrepDaysBeforeLive: pickU('supply_prep_days_before_live', 'supplyPrepDaysBeforeLive'),
    };
  });
  const techProgrammes: TechProgrammeConfig[] = (parsed.tech_programmes || []).map((c) =>
    mapTechProgrammeFromYamlRow(c as Record<string, unknown>)
  );
  let riskHeatmapGamma: number | undefined;
  const pg = parsed.risk_heatmap_gamma;
  if (pg != null && Number.isFinite(pg) && pg > 0) {
    riskHeatmapGamma = clampHeatmapGamma(pg);
  }
  let riskHeatmapGammaTech: number | undefined;
  const pgt = parsed.risk_heatmap_gamma_tech;
  if (pgt != null && Number.isFinite(pgt) && pgt > 0) {
    riskHeatmapGammaTech = clampHeatmapGamma(pgt);
  }
  let riskHeatmapGammaBusiness: number | undefined;
  const pgb = parsed.risk_heatmap_gamma_business;
  if (pgb != null && Number.isFinite(pgb) && pgb > 0) {
    riskHeatmapGammaBusiness = clampHeatmapGamma(pgb);
  }
  if (riskHeatmapGammaTech == null && riskHeatmapGamma != null) {
    riskHeatmapGammaTech = riskHeatmapGamma;
  }
  if (riskHeatmapGammaBusiness == null && riskHeatmapGamma != null) {
    riskHeatmapGammaBusiness = riskHeatmapGamma;
  }
  const riskHeatmapCurve = parseRiskHeatmapCurve(parsed.risk_heatmap_curve);
  const deployment_risk_month_curve = mapDeploymentRiskMonthCurve(parsed.deployment_risk_month_curve);
  const deployment_risk_context_month_curve = mapDeploymentRiskMonthCurve(
    parsed.deployment_risk_context_month_curve
  );
  const deployment_risk_events = mapDeploymentRiskEvents(parsed.deployment_risk_events);
  const deployment_risk_blackouts = mapDeploymentRiskBlackouts(parsed.deployment_risk_blackouts);
  let deployment_risk_week_weight: number | undefined;
  const drw = parsed.deployment_risk_week_weight;
  if (drw != null && Number.isFinite(drw)) {
    deployment_risk_week_weight = Math.min(1, Math.max(0, drw));
  }
  let deployment_resourcing_strain_weight: number | undefined;
  const dsw = parsed.deployment_resourcing_strain_weight;
  if (dsw != null && Number.isFinite(dsw)) {
    deployment_resourcing_strain_weight = Math.min(1, Math.max(0, dsw));
  }
  const hol = parsed.holidays || {};
  const capTaperRaw = hol.capacity_taper_days ?? hol.capacityTaperDays;
  const capTaper = Number(capTaperRaw);
  const holidayCapacityTaperDays =
    capTaperRaw != null && capTaperRaw !== '' && Number.isFinite(capTaper) && capTaper > 0
      ? Math.min(14, Math.floor(capTaper))
      : undefined;
  const holScaleRaw = hol.lab_capacity_scale ?? hol.labCapacityScale;
  const holScaleN = Number(holScaleRaw);
  const holidayLabCapacityScale =
    holScaleRaw != null && holScaleRaw !== '' && Number.isFinite(holScaleN) && holScaleN > 0
      ? Math.min(1, Math.max(0.12, holScaleN))
      : undefined;
  const tradingPressure = mapTradingPressureKnobs(parsed.trading as Record<string, unknown> | undefined);

  const pubBlock = parsed.public_holidays;
  let publicHolidayStaffingMultiplier: number | undefined;
  let publicHolidayTradingMultiplier: number | undefined;
  let publicHolidayExtraDates: string[] | undefined;
  if (pubBlock && typeof pubBlock === 'object') {
    const smRaw = pubBlock.staffing_multiplier ?? pubBlock.staffingMultiplier;
    if (smRaw != null && smRaw !== '') {
      const ps = Number(smRaw);
      if (Number.isFinite(ps)) publicHolidayStaffingMultiplier = Math.min(1, Math.max(0, ps));
    }
    const pt = Number(pubBlock.trading_multiplier ?? pubBlock.tradingMultiplier);
    if (Number.isFinite(pt) && pt > 0) publicHolidayTradingMultiplier = pt;
    publicHolidayExtraDates = normalizeDateList(pubBlock.dates);
  }

  const schBlock = parsed.school_holidays;
  let schoolHolidayStaffingMultiplier: number | undefined;
  let schoolHolidayExtraDates: string[] | undefined;
  if (schBlock && typeof schBlock === 'object') {
    const smRaw = schBlock.staffing_multiplier ?? schBlock.staffingMultiplier;
    if (smRaw != null && smRaw !== '') {
      const ss = Number(smRaw);
      if (Number.isFinite(ss)) schoolHolidayStaffingMultiplier = Math.min(1, Math.max(0, ss));
    }
    schoolHolidayExtraDates = normalizeDateList(schBlock.dates);
  }

  const stressCorrelations = mergeStressCorrelations(
    mapStressCorrelations(parsed.stress_correlations),
    schBlock && typeof schBlock === 'object' ? stressFromSchoolHolidayBlock(schBlock as Record<string, unknown>) : undefined
  );

  const resourcesRoot = parsed.resources as Record<string, unknown> | undefined;

  return {
    market,
    title: parsed.title ?? market,
    description: parsed.description,
    capacity,
    monthlyLabsCapacityPattern: mapResourceCapacityMonthlyShape(resourcesRoot, 'labs'),
    ...mapStaffResourceMonthly(resourcesRoot),
    techAvailableCapacityPattern: mapTechAvailableCapacityPattern(parsed.tech as Record<string, unknown>),
    testingCapacity,
    holidayLabCapacityScale,
    publicHolidayStaffingMultiplier,
    publicHolidayTradingMultiplier,
    publicHolidayExtraDates,
    schoolHolidayStaffingMultiplier,
    schoolHolidayExtraDates,
    tradingPressure,
    bau,
    campaigns,
    techProgrammes,
    releases: mapReleases(parsed.releases),
    trading: expandTradingWeeklyPattern(parsed.trading as Record<string, unknown> | undefined),
    monthlyTradingPattern: mapMonthlyTradingPattern(parsed.trading as Record<string, unknown> | undefined),
    seasonalTrading: mapSeasonalTrading(parsed.trading),
    holidays: parsed.holidays,
    holidayCapacityTaperDays,
    stressCorrelations,
    operatingWindows: mapOperatingWindows(parsed.operating_windows),
    techRhythm: mapTechRhythm(parsed.tech),
    monthlySupportPattern: mapSupportMonthlyPattern(parsed.tech as Record<string, unknown> | undefined),
    riskHeatmapGamma,
    riskHeatmapGammaTech,
    riskHeatmapGammaBusiness,
    riskHeatmapCurve,
    deployment_risk_month_curve,
    deployment_risk_context_month_curve,
    deployment_risk_week_weight,
    deployment_risk_events,
    deployment_risk_blackouts,
    deployment_resourcing_strain_weight,
  };
}

function mapDeploymentRiskMonthCurve(
  raw: Record<string, unknown> | undefined
): Partial<Record<TradingMonthKey, number>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {} as Partial<Record<TradingMonthKey, number>>;
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim();
    if (!TRADING_MONTH_KEY_SET.has(key)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[key as TradingMonthKey] = Math.min(1, Math.max(0, n));
  }
  return Object.keys(out).length ? out : undefined;
}

function mapDeploymentRiskEvents(raw: unknown[] | undefined): DeploymentRiskEvent[] | undefined {
  if (!raw?.length) return undefined;
  const out: DeploymentRiskEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const start = coerceYamlDateString(row.start);
    const end = coerceYamlDateString(row.end ?? row.start);
    if (!start || !end) continue;
    const sev = Number(row.severity ?? 0.5);
    out.push({
      id: String(row.id ?? 'event'),
      start,
      end,
      severity: Math.min(1, Math.max(0, Number.isFinite(sev) ? sev : 0.5)),
      kind: row.kind != null ? String(row.kind) : undefined,
    });
  }
  return out.length ? out : undefined;
}

function mapDeploymentRiskBlackouts(raw: unknown[] | undefined): DeploymentRiskBlackout[] | undefined {
  if (!raw?.length) return undefined;
  const out: DeploymentRiskBlackout[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const start = coerceYamlDateString(row.start);
    const end = coerceYamlDateString(row.end ?? row.start);
    if (!start || !end) continue;
    const sev = Number(row.severity ?? 0.4);
    const pr = row.public_reason ?? row.publicReason;
    const on = row.operational_note ?? row.operationalNote;
    out.push({
      id: String(row.id ?? 'blackout'),
      start,
      end,
      severity: Math.min(1, Math.max(0, Number.isFinite(sev) ? sev : 0.4)),
      public_reason: pr != null && String(pr).trim() ? String(pr).trim() : undefined,
      operational_note: on != null && String(on).trim() ? String(on).trim() : undefined,
    });
  }
  return out.length ? out : undefined;
}

function parseEnvelope(v: unknown): EnvelopeKind | undefined {
  const s = String(v ?? '').toLowerCase();
  if (s === 'step' || s === 'linear' || s === 'smoothstep') return s;
  return undefined;
}

function mapOperatingWindows(raw: unknown[]): OperatingWindow[] | undefined {
  if (!raw.length) return undefined;
  const out: OperatingWindow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const start = coerceYamlDateString(row.start);
    const end = coerceYamlDateString(row.end);
    if (!start || !end) continue;
    const w: OperatingWindow = {
      name: String(row.name ?? 'window'),
      start,
      end,
    };
    const pick = (k: keyof OperatingWindow) => {
      if (row[k] == null) return;
      const n = Number(row[k]);
      if (Number.isFinite(n)) w[k] = n as never;
    };
    pick('store_pressure_mult');
    pick('lab_load_mult');
    pick('team_load_mult');
    pick('backend_load_mult');
    pick('ops_activity_mult');
    pick('commercial_activity_mult');
    pick('lab_team_capacity_mult');
    const ri = row.ramp_in_days ?? row.rampInDays;
    const ro = row.ramp_out_days ?? row.rampOutDays;
    const rin = Number(ri);
    const rout = Number(ro);
    if (ri != null && ri !== '' && Number.isFinite(rin) && rin >= 0) w.ramp_in_days = Math.floor(rin);
    if (ro != null && ro !== '' && Number.isFinite(rout) && rout >= 0) w.ramp_out_days = Math.floor(rout);
    const env = parseEnvelope(row.envelope ?? row.weight_curve ?? row.weightCurve);
    if (env) w.envelope = env;
    out.push(w);
  }
  return out.length ? out : undefined;
}

const TRADING_MONTH_KEY_SET = new Set([
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]);

function mapMonthlyTradingPattern(
  trading: Record<string, unknown> | undefined
): Record<string, number> | undefined {
  if (!trading || typeof trading !== 'object') return undefined;
  const raw = (trading.monthly_pattern ?? trading.monthlyPattern) as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim();
    if (!TRADING_MONTH_KEY_SET.has(key)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[key] = Math.min(1, Math.max(0, n));
  }
  return Object.keys(out).length ? out : undefined;
}

function mapSupportMonthlyPattern(
  tech: Record<string, unknown> | undefined
): Record<string, number> | undefined {
  if (!tech || typeof tech !== 'object') return undefined;
  const raw = (tech.support_monthly_pattern ?? tech.supportMonthlyPattern) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim();
    if (!TRADING_MONTH_KEY_SET.has(key)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[key] = Math.min(1, Math.max(0, n));
  }
  return Object.keys(out).length ? out : undefined;
}

function mapResourceCapacityMonthlyShape(
  resources: Record<string, unknown> | undefined,
  blockKey: 'labs'
): Record<string, number> | undefined {
  if (!resources || typeof resources !== 'object') return undefined;
  const block = resources[blockKey] as Record<string, unknown> | undefined;
  if (!block || typeof block !== 'object') return undefined;
  const raw = (block.monthly_pattern ?? block.monthlyPattern ?? block.by_month ?? block.byMonth) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim();
    if (!TRADING_MONTH_KEY_SET.has(key)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[key] = Math.min(5, Math.max(0.1, n));
  }
  return Object.keys(out).length ? out : undefined;
}

function staffMonthlyPatternBasisFromBlock(block: Record<string, unknown> | undefined): 'absolute' | undefined {
  if (!block || typeof block !== 'object') return undefined;
  const v = block.monthly_pattern_basis ?? block.monthlyPatternBasis;
  if (v === 'absolute' || v === true) return 'absolute';
  return undefined;
}

function mapStaffResourceMonthly(resources: Record<string, unknown> | undefined): {
  monthlyStaffCapacityPattern?: Record<string, number>;
  staffMonthlyPatternBasis?: 'absolute';
} {
  if (!resources || typeof resources !== 'object') return {};
  const block = resources.staff as Record<string, unknown> | undefined;
  if (!block || typeof block !== 'object') return {};
  const basis = staffMonthlyPatternBasisFromBlock(block);
  const raw = (block.monthly_pattern ?? block.monthlyPattern ?? block.by_month ?? block.byMonth) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== 'object') return basis ? { staffMonthlyPatternBasis: basis } : {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim();
    if (!TRADING_MONTH_KEY_SET.has(key)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (basis === 'absolute') {
      out[key] = Math.min(50, Math.max(0, Math.round(n)));
    } else {
      out[key] = Math.min(5, Math.max(0.1, n));
    }
  }
  const pattern = Object.keys(out).length ? out : undefined;
  if (!pattern && !basis) return {};
  return {
    ...(pattern ? { monthlyStaffCapacityPattern: pattern } : {}),
    ...(basis ? { staffMonthlyPatternBasis: basis } : {}),
  };
}

function mapTechAvailableCapacityPattern(
  tech: Record<string, unknown> | undefined
): Record<string, number> | undefined {
  if (!tech || typeof tech !== 'object') return undefined;
  const raw = (tech.available_capacity_pattern ?? tech.availableCapacityPattern) as
    | Record<string, unknown>
    | undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim();
    if (!TRADING_MONTH_KEY_SET.has(key)) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[key] = Math.min(1, Math.max(0.05, n));
  }
  return Object.keys(out).length ? out : undefined;
}

function mapSeasonalTrading(trading: Record<string, unknown> | undefined): SeasonalTradingConfig | undefined {
  if (!trading || typeof trading !== 'object') return undefined;
  const s = trading.seasonal as Record<string, unknown> | undefined;
  if (!s || typeof s !== 'object') return undefined;
  const peakRaw = s.peak_month ?? s.peakMonth;
  const ampRaw = s.amplitude;
  const peak = Number(peakRaw);
  const amp = Number(ampRaw);
  if (!Number.isFinite(peak) || !Number.isFinite(amp) || amp <= 0) return undefined;
  return {
    peak_month: Math.min(12, Math.max(1, Math.round(peak))),
    amplitude: Math.min(0.6, Math.max(0, amp)),
  };
}

function mapTechRhythm(tech: Record<string, unknown> | undefined): TechRhythmConfig | undefined {
  if (!tech || typeof tech !== 'object') return undefined;
  const wpRaw = (tech.weekly_pattern ?? tech.weeklyPattern) as Record<string, unknown> | undefined;
  const expanded = expandTechWeeklyPattern(wpRaw);
  const swRaw = (tech.support_weekly_pattern ?? tech.supportWeeklyPattern) as
    | Record<string, unknown>
    | undefined;
  const supportWeekly = expandTechWeeklyPattern(swRaw);
  const supportMonthly = mapSupportMonthlyPattern(tech);
  const sts = Number(tech.support_teams_scale ?? tech.supportTeamsScale);

  if (
    (!expanded || Object.keys(expanded).length === 0) &&
    (!supportWeekly || Object.keys(supportWeekly).length === 0)
  ) {
    return undefined;
  }

  const ls = Number(tech.labs_scale ?? tech.labsScale);
  const ts = Number(tech.teams_scale ?? tech.teamsScale);
  const bs = Number(tech.backend_scale ?? tech.backendScale);

  const out: TechRhythmConfig = {};

  if (expanded && Object.keys(expanded).length > 0) {
    out.weekly_pattern = expanded;
    out.labs_scale = Number.isFinite(ls) && ls >= 0 ? ls : 2;
    out.teams_scale = Number.isFinite(ts) && ts >= 0 ? ts : 1;
    out.backend_scale = Number.isFinite(bs) && bs >= 0 ? bs : 0;
  }

  if (supportWeekly && Object.keys(supportWeekly).length > 0) {
    out.support_weekly_pattern = supportWeekly;
  }
  if (supportMonthly && Object.keys(supportMonthly).length > 0) {
    out.support_monthly_pattern = supportMonthly;
  }
  if (Number.isFinite(sts) && sts >= 0) {
    out.support_teams_scale = sts;
  }

  return out;
}

function mapStressCorrelations(raw: Record<string, unknown>): StressCorrelations | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const sh = raw.school_holidays;
  if (!sh || typeof sh !== 'object') return undefined;
  const o = sh as Record<string, unknown>;
  const school_holidays: SchoolHolidayStress = {};
  const pick = (k: keyof SchoolHolidayStress) => {
    if (o[k] == null) return;
    const n = Number(o[k]);
    if (Number.isFinite(n)) school_holidays[k] = n;
  };
  pick('store_pressure_mult');
  pick('lab_load_mult');
  pick('team_load_mult');
  pick('backend_load_mult');
  pick('ops_activity_mult');
  pick('commercial_activity_mult');
  pick('lab_team_capacity_mult');
  if (Object.keys(school_holidays).length === 0) return undefined;
  return { school_holidays };
}

function sumTeamSizes(teams: Record<string, { size?: number }> | undefined): number {
  if (!teams || typeof teams !== 'object') return 4;
  let n = 0;
  for (const t of Object.values(teams)) {
    n += Number(t?.size) || 0;
  }
  return n || 4;
}

/** Brief `weekly_promo` + legacy `weekly_promo_cycle` */
function mapWeeklyPromo(wp: Record<string, unknown>, name: string): BauEntry | null {
  if (!wp || typeof wp !== 'object') return null;
  const dayStr = String(wp.day ?? 'Tue');
  const weekday = WEEKDAYS.indexOf(dayStr);
  const w = weekday >= 0 ? weekday : 2;
  const supportDays = Number(wp.support_days) || 0;
  const span = Math.min(6, w + (supportDays || 1) - 1);
  const entry: BauEntry = {
    name,
    weekday: w,
    load: { labs: Number(wp.labs) || 0, teams: 0 },
  };
  if (supportDays > 0) {
    entry.supportStart = w;
    entry.supportEnd = span;
  }
  return entry;
}

function mapBau(bauSection: Record<string, unknown> | undefined): BauEntry | BauEntry[] | undefined {
  if (!bauSection || typeof bauSection !== 'object') return undefined;
  const entries: BauEntry[] = [];

  const wpCycle = bauSection.weekly_promo_cycle as Record<string, unknown> | undefined;
  const fromCycle = mapWeeklyPromo(wpCycle ?? {}, 'weekly_promo_cycle');
  if (fromCycle) entries.push(fromCycle);

  const wpBrief = bauSection.weekly_promo as Record<string, unknown> | undefined;
  const fromBrief = mapWeeklyPromo(wpBrief ?? {}, 'weekly_promo');
  if (fromBrief) entries.push(fromBrief);

  const it = bauSection.integration_tests as Record<string, unknown> | undefined;
  if (it) {
    const dayStr = String(it.day ?? 'Thu');
    const weekday = WEEKDAYS.indexOf(dayStr);
    const w = weekday >= 0 ? weekday : 4;
    entries.push({
      name: 'integration_tests',
      weekday: w,
      load: { labs: Number(it.labs) || 0, teams: 0 },
    });
  }

  if (entries.length === 0) return undefined;
  if (entries.length === 1) return entries[0];
  return entries;
}

/** Modern `days_in_use` BAU plus optional legacy weekly promo / integration_tests. */
function combineBau(bauSection: Record<string, unknown> | undefined): BauEntry | BauEntry[] | undefined {
  if (!bauSection || typeof bauSection !== 'object') return mapBau(bauSection);
  const entries: BauEntry[] = [];
  const modern = mapBauModern(bauSection);
  if (modern) {
    const arr = Array.isArray(modern) ? modern : [modern];
    entries.push(...arr);
  }
  const hasModernWeekly = parseDaysInUse(bauSection.days_in_use ?? bauSection.daysInUse) != null;
  if (!hasModernWeekly) {
    const legacy = mapBau(bauSection);
    if (legacy) {
      const arr = Array.isArray(legacy) ? legacy : [legacy];
      entries.push(...arr);
    }
  } else {
    const it = bauSection.integration_tests as Record<string, unknown> | undefined;
    if (it) {
      const dayStr = String(it.day ?? 'Thu');
      const weekday = WEEKDAYS.indexOf(dayStr);
      const w = weekday >= 0 ? weekday : 4;
      entries.push({
        name: 'integration_tests',
        weekday: w,
        load: { labs: Number(it.labs) || 0, teams: 0 },
      });
    }
  }
  if (entries.length === 0) return undefined;
  if (entries.length === 1) return entries[0]!;
  return entries;
}

/**
 * Parse one or more YAML documents (multi-country runway).
 */
export function parseAllYamlDocuments(dslText: string): MarketConfig[] {
  if (!dslText?.trim()) return [];
  let docs: unknown[];
  try {
    docs = yaml.loadAll(dslText) as unknown[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`YAML parse error: ${msg}`);
  }
  const configs: MarketConfig[] = [];
  for (const doc of docs) {
    if (doc == null) continue;
    const parsed = normalizeYamlObject(doc);
    if (
      parsed.country ||
      (parsed.resources?.labs as { capacity?: number })?.capacity != null ||
      parsed.campaigns.length ||
      parsed.tech_programmes.length
    ) {
      configs.push(yamlToPipelineConfig(parsed));
    }
  }
  if (configs.length > 0) return configs;
  return [yamlToPipelineConfig(parseYamlDSL(dslText))];
}
