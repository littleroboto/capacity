import type { RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';
import type { TradingMonthKey } from '@/lib/tradingMonthlyDsl';
import type { EnvelopeKind } from './weighting';

/** Optional multipliers when `school_holiday_flag` is true (loads ↑, effective lab/team cap ↓). */
export type SchoolHolidayStress = {
  store_pressure_mult?: number;
  lab_load_mult?: number;
  team_load_mult?: number;
  backend_load_mult?: number;
  ops_activity_mult?: number;
  commercial_activity_mult?: number;
  /** &lt; 1 tightens lab + team capacity (e.g. parents OOO, leave clustering). */
  lab_team_capacity_mult?: number;
};

export type StressCorrelations = {
  school_holidays?: SchoolHolidayStress;
};

/** YAML `deployment_risk_events`: corporate or governance windows that add deployment fragility. */
export type DeploymentRiskEvent = {
  id: string;
  start: string;
  end: string;
  /** 0–1 severity while the day falls in `[start, end]` (inclusive). */
  severity: number;
  /** Optional tag for tooltips only. */
  kind?: string;
};

/**
 * YAML `deployment_risk_blackouts`: change freezes / “resourcing” windows (often overlapping peak trading).
 * Same date rules as events; tooltips prefer {@link public_reason} when set.
 */
export type DeploymentRiskBlackout = {
  id: string;
  start: string;
  end: string;
  severity: number;
  /** Stated reason (e.g. change freeze / low resourcing). */
  public_reason?: string;
  /** Operational context for planners (e.g. Q4 lock-in); not shown as the primary label. */
  operational_note?: string;
};

/** Inclusive `start`/`end` dates (`YYYY-MM-DD`); multipliers stack if windows overlap. */
export type OperatingWindow = {
  name: string;
  start: string;
  end: string;
  store_pressure_mult?: number;
  lab_load_mult?: number;
  team_load_mult?: number;
  backend_load_mult?: number;
  ops_activity_mult?: number;
  commercial_activity_mult?: number;
  /** Tightens lab + team caps (e.g. HQ leave / Oktoberfest resourcing). Stacks with school-holiday cap mult. */
  lab_team_capacity_mult?: number;
  /** Days from window start to ease multipliers in (0 = step on). */
  ramp_in_days?: number;
  /** Days before window end to ease multipliers out. */
  ramp_out_days?: number;
  /** Default `smoothstep` when ramps are set; `step` ignores ramps. */
  envelope?: EnvelopeKind;
};

/** Annual gentle wave on marketing / store trading rhythm (`trading.seasonal` in YAML). */
export type SeasonalTradingConfig = {
  peak_month: number;
  amplitude: number;
};

/**
 * Tech-side weekly shape (menu pipeline, weekend catch-up, Fri-before-Sat prep).
 * `weekly_pattern` values are **0–1** (after YAML parse); legacy named levels are normalised in the parser.
 * Scaled into lab/team readiness load with `labs_scale` / `teams_scale` / `backend_scale`.
 *
 * `support_*` adds **Market IT–only** baseline readiness load (e.g. hypercare / BAU support rhythm).
 * Weekly shape × monthly multiplier (omitted months = 1), same numeric rules as `trading.monthly_pattern`.
 */
export type TechRhythmConfig = {
  weekly_pattern?: Record<string, number>;
  labs_scale?: number;
  teams_scale?: number;
  backend_scale?: number;
  /** Expanded `tech.support_weekly_pattern` (0–1 per weekday). */
  support_weekly_pattern?: Record<string, number>;
  /**
   * Optional `tech.support_monthly_pattern` (Jan–Dec, 0–1). Multiplies that day’s support weekly level;
   * omitted months behave as 1 in the UI patcher.
   */
  support_monthly_pattern?: Record<string, number>;
  /** Scales support teams load; default 1. */
  support_teams_scale?: number;
};

/** Optional trading UX knobs (parsed from `trading.*` in YAML). */
export type TradingPressureKnobs = {
  /**
   * Per-market temperament: how hard campaigns hit **Business lens / risk blend** channels.
   * Scales `campaign_risk` and multiplies `campaign_store_boost_*` (Restaurant uplift during prep/live).
   * Default 1; 0 turns off campaign-driven pressure (phase loads unchanged). Multiplied in the pipeline by the UI scenario slider.
   */
  campaign_effect_scale?: number;
  /** Extra fraction on base store pressure during campaign prep (non-presence campaigns); default 0. */
  campaign_store_boost_prep?: number;
  /** Extra fraction on base store pressure during campaign live (non-presence); default 0.28. */
  campaign_store_boost_live?: number;
  /** Overrides global tuning for early-month store boost (peak week 1, fade to 1× by day 21; 1–1.2, +20% max). */
  payday_month_peak_multiplier?: number;
  /**
   * Optional four knot multipliers (1–1.2) on DOM 4, 11, 18, 25 — piecewise linear early-month curve; see
   * `storePaydayMonthMultiplierFromKnots`. When set, overrides {@link payday_month_peak_multiplier} for that market.
   */
  payday_month_knot_multipliers?: readonly [number, number, number, number];
};

export type MarketConfig = {
  market: string;
  title?: string;
  description?: string;
  capacity: { labs: number; teams: number; backend: number };
  /**
   * Optional Jan–Dec multipliers on baseline `resources.labs.capacity` / testing denominator (default 1 each month).
   */
  monthlyLabsCapacityPattern?: Record<string, number>;
  /**
   * Optional Jan–Dec shape for tech staff. Default is multipliers on {@link MarketConfig.capacity}.`teams` (each month 1 = baseline).
   * When {@link staffMonthlyPatternBasis} is `absolute`, each value is headcount FTE for that month.
   */
  monthlyStaffCapacityPattern?: Record<string, number>;
  /** When `absolute`, `monthlyStaffCapacityPattern` values are FTE counts, not multipliers on `capacity.teams`. */
  staffMonthlyPatternBasis?: 'absolute';
  /** Optional Jan–Dec 0.05–1 share applied to lab+team effective caps after monthly shape + holiday pinch. */
  techAvailableCapacityPattern?: Record<string, number>;
  /** Nominal parallel test / integration capacity for utilisation denominator (defaults to lab count). */
  testingCapacity?: number;
  /** When holiday stress = 1, lab+team caps scale toward this factor (default from engine tuning, typically 0.5). */
  holidayLabCapacityScale?: number;
  /** Effective lab+team cap scale on **public** holiday days at full stress (clamped ~0.12–1). */
  publicHolidayStaffingMultiplier?: number;
  /** Effective lab+team cap scale on **school** holiday days at full stress (clamped ~0.12–1). */
  schoolHolidayStaffingMultiplier?: number;
  /** Multiplies base store-trading level on public holidays (≥1 typical). Default 1. */
  publicHolidayTradingMultiplier?: number;
  tradingPressure?: TradingPressureKnobs;
  bau?: BauEntry | BauEntry[];
  campaigns: CampaignConfig[];
  /** Tech-only scheduled work; same timing keys as campaigns; never affects campaign_risk or store boosts. */
  techProgrammes: TechProgrammeConfig[];
  releases: ReleaseConfig[];
  /** Parsed `trading` blob; `weekly_pattern` is expanded to per-day **0–1** (same rules as `techRhythm.weekly_pattern`). */
  trading?: Record<string, unknown>;
  /**
   * Optional `trading.monthly_pattern` (Jan–Dec, 0–1). Multiplies weekly store level for that calendar month;
   * omitted months behave as 1 in the UI patcher; absent block → no effect in the engine.
   */
  monthlyTradingPattern?: Record<string, number>;
  /**
   * Optional `tech.support_monthly_pattern` (Jan–Dec, 0–1). Multiplies support weekly teams load for that month;
   * omitted months behave as 1 in the UI patcher.
   */
  monthlySupportPattern?: Record<string, number>;
  /** Parsed from `trading.seasonal` for store_pressure only. */
  seasonalTrading?: SeasonalTradingConfig;
  holidays?: Record<string, unknown>;
  /** Extra public holiday ISO dates merged with stubs (`public_holidays.dates` in YAML). */
  publicHolidayExtraDates?: string[];
  /** Extra school holiday ISO dates merged with stubs (`school_holidays.dates` in YAML). */
  schoolHolidayExtraDates?: string[];
  /** Smooth lab/team holiday capacity toward stub dates across N adjacent days (`holidays.capacity_taper_days`). */
  holidayCapacityTaperDays?: number;
  stressCorrelations?: StressCorrelations;
  operatingWindows?: OperatingWindow[];
  techRhythm?: TechRhythmConfig;
  /** Legacy single γ; used when tech/business-specific gammas omitted. */
  riskHeatmapGamma?: number;
  /** Technology lens heatmap γ (YAML `risk_heatmap_gamma_tech`). */
  riskHeatmapGammaTech?: number;
  /** Business lens heatmap γ (YAML `risk_heatmap_gamma_business`). */
  riskHeatmapGammaBusiness?: number;
  /** Heatmap transfer curve for combined view (`risk_heatmap_curve` in YAML). */
  riskHeatmapCurve?: RiskHeatmapCurveId;
  /** Optional deployment-risk calendar events (`deployment_risk_events` in YAML). */
  deployment_risk_events?: DeploymentRiskEvent[];
  /** Optional change-freeze / blackout windows (`deployment_risk_blackouts` in YAML). */
  deployment_risk_blackouts?: DeploymentRiskBlackout[];
  /**
   * Optional Jan–Dec 0–1 lift added to deployment risk for that calendar month (`deployment_risk_month_curve`).
   * When a month is omitted, October–December fall back to engine Q4 ramp defaults; other months default to 0.
   */
  deployment_risk_month_curve?: Partial<Record<TradingMonthKey, number>>;
  /**
   * Optional second Jan–Dec **0–1** layer (`deployment_risk_context_month_curve`), **summed** with the primary
   * deployment month lift for Market risk—local context without rewriting the main curve.
   */
  deployment_risk_context_month_curve?: Partial<Record<TradingMonthKey, number>>;
  /**
   * Optional **0–1** multiplier on within-week load shape (trading + tech `weekly_pattern`) in Market risk.
   * Omit for engine default **0.2**; raise in aggressive trading markets.
   */
  deployment_risk_week_weight?: number;
  /**
   * Scales the add-on from tech utilisation pressure (0–1 on each risk row) in deployment risk.
   * Omit for engine default **0.05**.
   */
  deployment_resourcing_strain_weight?: number;
};

export type BauEntry = {
  name: string;
  weekday: number;
  /** Inclusive range for the lighter `support` slice (0.5× load); omit when `support_days` is 0. */
  supportStart?: number;
  supportEnd?: number;
  load: { labs?: number; teams?: number; backend?: number; ops?: number; commercial?: number };
};

/** Partial loads for a campaign phase (labs/teams/backend/ops/commercial). */
export type PhaseLoad = {
  labs?: number;
  teams?: number;
  backend?: number;
  ops?: number;
  commercial?: number;
};

export type CampaignConfig = {
  name: string;
  start: string;
  durationDays: number;
  /**
   * Multiplier on this campaign’s **business / store** signal (`campaign_risk`, prep/live store boosts).
   * e.g. flagship programme **1**, light promo **0.5**. Default **1** when omitted.
   */
  businessUplift?: number;
  /**
   * **Lead model:** prep runs on `[start - prepBeforeLiveDays, start)` using `load` (readiness).
   * Live runs on `[start, start + durationDays)` using `live_support_load`, or `load` scaled by `liveSupportScale`.
   */
  prepBeforeLiveDays?: number;
  /** Readiness / change window: first N days of the campaign interval use `load`; remaining days use `live_support_load`. Ignored when `prepBeforeLiveDays` is set. */
  readinessDurationDays?: number;
  /** Scheduled load after readiness (e.g. on-call, hypercare). Omitted keys default to 0 for the live segment. */
  live_support_load?: PhaseLoad;
  /** When `prepBeforeLiveDays` is set and `live_support_load` is empty, live segment uses `load * liveSupportScale`. Default 0.45. */
  liveSupportScale?: number;
  /**
   * Multiplier on **labs / teams / backend** only during the campaign **live** segment (not ops/commercial).
   * Omitted → engine default (~0.55) so in-flight retail is lighter on engineering than prep; set `1` to use YAML loads as written.
   */
  liveTechLoadScale?: number;
  load: PhaseLoad;
  impact?: string;
  /**
   * When **true**, on **prep** and **live** days where this campaign contributes **labs / teams / backend** (after the
   * same resolution as phase expansion — staggered prep slices, scaled live sustain load), recurring
   * **`tech.weekly_pattern`** is omitted and **BAU** loads have those three buckets zeroed (ops/commercial unchanged)
   * so campaign delivery **replaces** the weekly tech/BAU pipe instead of stacking. Default **false** (additive).
   */
  replacesBauTech?: boolean;
  /** If true, drives campaign_presence / campaign_risk dates only; does not add phase loads (avoid duplicating operating_windows). */
  presenceOnly?: boolean;
  /**
   * When set with `prepBeforeLiveDays`, splits prep so tech, marketing (commercial), and supply (ops)
   * follow different windows instead of one flat `load` across all of prep:
   * - Tech (labs/teams/backend): last `tech_prep_days_before_live` (default 42) calendar days of prep that end `tech_finish_before_live_days` (default 14) before go-live.
   * - Commercial: `[go_live - marketing_prep_days, go_live)` (assets into stores before live).
   * - Ops: `[go_live - supply_prep_days, go_live)` in prep, then live segment uses `live_support_load.ops` as today.
   */
  staggerFunctionalLoads?: boolean;
  /** Default 42 (6 weeks). Capped by `prepBeforeLiveDays`. */
  techPrepDaysBeforeLive?: number;
  /** Default 14 — no tech campaign load in the last N days before go-live (delivery buffer). */
  techFinishBeforeLiveDays?: number;
  /** Default 30 — commercial prep load in the last N days before go-live. */
  marketingPrepDaysBeforeLive?: number;
  /** Default 21 — ops prep starts N days before go-live; live ops still from `live_support_load`. */
  supplyPrepDaysBeforeLive?: number;
};

/** Shared prep/live window fields for {@link campaignLoadBearingPrepLiveForDate}. */
export type ProgrammeWindowFields = Pick<
  CampaignConfig,
  'start' | 'durationDays' | 'prepBeforeLiveDays' | 'readinessDurationDays' | 'presenceOnly'
>;

/**
 * Platform / infra work (patching, POS refresh, hardware) that uses the same **prep + live** timing as a campaign
 * but **only** consumes labs / teams / backend — no marketing, ops, or trading-pressure uplift.
 */
export type TechProgrammeConfig = ProgrammeWindowFields & {
  name: string;
  load: PhaseLoad;
  live_support_load?: PhaseLoad;
  liveSupportScale?: number;
  /**
   * Live-segment scale for labs/teams/backend only; default **1** (full YAML intensity) unlike campaigns (~0.55).
   */
  liveTechLoadScale?: number;
  replacesBauTech?: boolean;
};

export type ReleaseConfig = {
  deployDate?: string;
  systems: string[];
  phases: { name: string; offsetDays: number }[];
  load: Record<string, number>;
};
