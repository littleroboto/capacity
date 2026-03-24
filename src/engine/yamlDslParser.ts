import yaml from 'js-yaml';
import { parseRiskHeatmapCurve } from '@/lib/riskHeatmapTransfer';
import type {
  BauEntry,
  CampaignConfig,
  MarketConfig,
  OperatingWindow,
  PhaseLoad,
  SchoolHolidayStress,
  SeasonalTradingConfig,
  StressCorrelations,
  TechRhythmConfig,
} from './types';
import { expandTechWeeklyPattern } from './techWeeklyPattern';
import type { EnvelopeKind } from './weighting';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

const WEEKLY_PATTERN_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKLY_PATTERN_DAY_SET = new Set<string>(WEEKLY_PATTERN_DAYS);
/** Meta keys for compact `weekly_pattern` (not day names). */
const WEEKLY_PATTERN_META = new Set(['default', '_default', 'weekdays', 'weekend']);

/**
 * Expand compact `trading.weekly_pattern` (string levels only). For `tech.weekly_pattern`, use
 * {@link expandTechWeeklyPattern} (numeric [0,1] and named levels).
 * - `default` or `_default`: baseline for all seven days
 * - `weekdays`: Mon–Fri (after default)
 * - `weekend`: Sat–Sun (after default)
 * - explicit `Mon` … `Sun`: final overrides (same as legacy full maps)
 */
function expandWeeklyPattern(raw: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const asLevel = (v: unknown): string | undefined => {
    if (v == null || v === '') return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
  };

  const out: Record<string, string> = {};

  const dft = asLevel(raw.default ?? raw._default);
  if (dft) {
    for (const day of WEEKLY_PATTERN_DAYS) out[day] = dft;
  }

  const wkd = asLevel(raw.weekdays);
  if (wkd) {
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const) {
      out[day] = wkd;
    }
  }

  const wend = asLevel(raw.weekend);
  if (wend) {
    out.Sat = wend;
    out.Sun = wend;
  }

  for (const [k, v] of Object.entries(raw)) {
    if (WEEKLY_PATTERN_META.has(k)) continue;
    if (!WEEKLY_PATTERN_DAY_SET.has(k)) continue;
    const s = asLevel(v);
    if (s) out[k] = s;
  }

  return Object.keys(out).length ? out : undefined;
}

function expandTradingWeeklyPattern(trading: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!trading || typeof trading !== 'object') return trading ?? {};
  const wp = trading.weekly_pattern;
  if (!wp || typeof wp !== 'object') return trading;
  const expanded = expandWeeklyPattern(wp as Record<string, unknown>);
  if (!expanded) return trading;
  return { ...trading, weekly_pattern: expanded };
}

export type ParsedYaml = {
  country: string;
  resources: { labs: Record<string, unknown>; teams: Record<string, unknown> };
  bau: Record<string, unknown>;
  campaigns: unknown[];
  holidays: Record<string, unknown>;
  trading: Record<string, unknown>;
  tech: Record<string, unknown>;
  stress_correlations: Record<string, unknown>;
  operating_windows: unknown[];
  /** Combined-risk heatmap: index uses score ** gamma (optional). */
  risk_heatmap_gamma?: number;
  /** Transfer curve id for combined heatmap (optional; default power). */
  risk_heatmap_curve?: string;
};

const EMPTY: ParsedYaml = {
  country: '',
  resources: { labs: {}, teams: {} },
  bau: {},
  campaigns: [],
  holidays: {},
  trading: {},
  tech: {},
  stress_correlations: {},
  operating_windows: [],
  risk_heatmap_gamma: undefined,
  risk_heatmap_curve: undefined,
};

function normalizeYamlObject(raw: unknown): ParsedYaml {
  if (raw == null || typeof raw !== 'object') {
    return { ...EMPTY };
  }
  const o = raw as Record<string, unknown>;
  const rawGamma = o.risk_heatmap_gamma;
  const g = rawGamma == null || rawGamma === '' ? NaN : Number(rawGamma);
  return {
    country: String(o.country ?? ''),
    resources: {
      labs: (o.resources as { labs?: Record<string, unknown> })?.labs ?? {},
      teams: (o.resources as { teams?: Record<string, unknown> })?.teams ?? {},
    },
    bau: (o.bau as Record<string, unknown>) ?? {},
    campaigns: Array.isArray(o.campaigns) ? o.campaigns : [],
    holidays: (o.holidays as Record<string, unknown>) ?? {},
    trading: (o.trading as Record<string, unknown>) ?? {},
    tech: (o.tech as Record<string, unknown>) ?? {},
    stress_correlations: (o.stress_correlations as Record<string, unknown>) ?? {},
    operating_windows: Array.isArray(o.operating_windows) ? o.operating_windows : [],
    risk_heatmap_gamma: Number.isFinite(g) ? g : undefined,
    risk_heatmap_curve:
      o.risk_heatmap_curve == null || o.risk_heatmap_curve === ''
        ? undefined
        : String(o.risk_heatmap_curve).trim(),
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

export function yamlToPipelineConfig(parsed: ParsedYaml): MarketConfig {
  const market = parsed.country || 'DE';
  const capacity = {
    labs: Number((parsed.resources?.labs as { capacity?: number })?.capacity) || 5,
    teams: sumTeamSizes(parsed.resources?.teams as Record<string, { size?: number }> | undefined),
    backend: 1000,
  };
  const bau = mapBau(parsed.bau);
  const campaigns: CampaignConfig[] = (parsed.campaigns || []).map((c) => {
    const row = c as Record<string, unknown>;
    const impactKey = String(row.impact ?? '').toLowerCase();
    const fromImpact = IMPACT_TO_LOAD[impactKey];
    const yamlLoad = pickPhaseLoad(row.load);
    const commercial = yamlLoad.commercial ?? (fromImpact !== undefined ? fromImpact : 0.5);
    const prepRaw = row.prep_before_live_days ?? row.prepBeforeLiveDays;
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
    const live_support_load = pickPhaseLoad(row.live_support_load ?? row.liveSupportLoad);
    const hasLiveKeys = Object.keys(live_support_load).length > 0;
    const lssRaw = row.live_support_scale ?? row.liveSupportScale;
    const lssNum = Number(lssRaw);
    const liveSupportScale =
      lssRaw != null && lssRaw !== '' && Number.isFinite(lssNum) && lssNum > 0 && lssNum <= 1
        ? lssNum
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
    return {
      name: String(row.name ?? 'campaign'),
      start: coerceYamlDateString(row.start),
      durationDays: Number(row.duration) || 0,
      prepBeforeLiveDays,
      readinessDurationDays,
      live_support_load: hasLiveKeys ? live_support_load : undefined,
      liveSupportScale,
      load: { ...yamlLoad, commercial },
      impact: row.impact != null ? String(row.impact) : undefined,
      presenceOnly: row.presence_only === true || row.presenceOnly === true,
      staggerFunctionalLoads: stagger,
      techPrepDaysBeforeLive: pickU('tech_prep_days_before_live', 'techPrepDaysBeforeLive'),
      techFinishBeforeLiveDays: pickU('tech_finish_before_live_days', 'techFinishBeforeLiveDays'),
      marketingPrepDaysBeforeLive: pickU('marketing_prep_days_before_live', 'marketingPrepDaysBeforeLive'),
      supplyPrepDaysBeforeLive: pickU('supply_prep_days_before_live', 'supplyPrepDaysBeforeLive'),
    };
  });
  let riskHeatmapGamma: number | undefined;
  const pg = parsed.risk_heatmap_gamma;
  if (pg != null && Number.isFinite(pg) && pg > 0) {
    riskHeatmapGamma = Math.min(3, Math.max(0.35, pg));
  }
  const riskHeatmapCurve = parseRiskHeatmapCurve(parsed.risk_heatmap_curve);
  const hol = parsed.holidays || {};
  const capTaperRaw = hol.capacity_taper_days ?? hol.capacityTaperDays;
  const capTaper = Number(capTaperRaw);
  const holidayCapacityTaperDays =
    capTaperRaw != null && capTaperRaw !== '' && Number.isFinite(capTaper) && capTaper > 0
      ? Math.min(14, Math.floor(capTaper))
      : undefined;
  return {
    market,
    title: market,
    capacity,
    bau,
    campaigns,
    releases: [],
    trading: expandTradingWeeklyPattern(parsed.trading as Record<string, unknown> | undefined),
    monthlyTradingPattern: mapMonthlyTradingPattern(parsed.trading as Record<string, unknown> | undefined),
    seasonalTrading: mapSeasonalTrading(parsed.trading),
    holidays: parsed.holidays,
    holidayCapacityTaperDays,
    stressCorrelations: mapStressCorrelations(parsed.stress_correlations),
    operatingWindows: mapOperatingWindows(parsed.operating_windows),
    techRhythm: mapTechRhythm(parsed.tech),
    riskHeatmapGamma,
    riskHeatmapCurve,
  };
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
  if (!expanded || Object.keys(expanded).length === 0) return undefined;
  const weekly_pattern = expanded;
  const ls = Number(tech.labs_scale ?? tech.labsScale);
  const ts = Number(tech.teams_scale ?? tech.teamsScale);
  const bs = Number(tech.backend_scale ?? tech.backendScale);
  return {
    weekly_pattern,
    labs_scale: Number.isFinite(ls) && ls >= 0 ? ls : 2,
    teams_scale: Number.isFinite(ts) && ts >= 0 ? ts : 1,
    backend_scale: Number.isFinite(bs) && bs >= 0 ? bs : 0,
  };
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
  if (!teams || typeof teams !== 'object') return 6;
  let n = 0;
  for (const t of Object.values(teams)) {
    n += Number(t?.size) || 0;
  }
  return n || 6;
}

/** Brief `weekly_promo` + legacy `weekly_promo_cycle` */
function mapWeeklyPromo(wp: Record<string, unknown>, name: string): BauEntry | null {
  if (!wp || typeof wp !== 'object') return null;
  const dayStr = String(wp.day ?? 'Tue');
  const weekday = WEEKDAYS.indexOf(dayStr);
  const w = weekday >= 0 ? weekday : 2;
  const supportDays = Number(wp.support_days) || 0;
  return {
    name,
    weekday: w,
    supportStart: w,
    supportEnd: Math.min(6, w + (supportDays || 1) - 1),
    load: { labs: Number(wp.labs) || 0, teams: 0 },
  };
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
      supportStart: w,
      supportEnd: w,
      load: { labs: Number(it.labs) || 0, teams: 0 },
    });
  }

  if (entries.length === 0) return undefined;
  if (entries.length === 1) return entries[0];
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
    if (parsed.country || (parsed.resources?.labs as { capacity?: number })?.capacity != null || parsed.campaigns.length) {
      configs.push(yamlToPipelineConfig(parsed));
    }
  }
  if (configs.length > 0) return configs;
  return [yamlToPipelineConfig(parseYamlDSL(dslText))];
}
