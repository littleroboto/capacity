import type { RiskHeatmapCurveId } from '@/lib/riskHeatmapTransfer';
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
 * Levels use the same strings as `trading.weekly_pattern`; scaled into lab/team readiness load.
 */
export type TechRhythmConfig = {
  weekly_pattern?: Record<string, string>;
  labs_scale?: number;
  teams_scale?: number;
  backend_scale?: number;
};

export type MarketConfig = {
  market: string;
  title?: string;
  description?: string;
  capacity: { labs: number; teams: number; backend: number };
  bau?: BauEntry | BauEntry[];
  campaigns: CampaignConfig[];
  releases: ReleaseConfig[];
  trading?: Record<string, unknown>;
  /** Parsed from `trading.seasonal` for store_pressure only. */
  seasonalTrading?: SeasonalTradingConfig;
  holidays?: Record<string, unknown>;
  /** Smooth lab/team holiday capacity toward stub dates across N adjacent days (`holidays.capacity_taper_days`). */
  holidayCapacityTaperDays?: number;
  stressCorrelations?: StressCorrelations;
  operatingWindows?: OperatingWindow[];
  techRhythm?: TechRhythmConfig;
  /** Heatmap only: colour index uses risk_score ** gamma (1 = linear). */
  riskHeatmapGamma?: number;
  /** Heatmap transfer curve for combined view (`risk_heatmap_curve` in YAML). */
  riskHeatmapCurve?: RiskHeatmapCurveId;
};

export type BauEntry = {
  name: string;
  weekday: number;
  supportStart: number;
  supportEnd: number;
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
  load: PhaseLoad;
  impact?: string;
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

export type ReleaseConfig = {
  deployDate?: string;
  systems: string[];
  phases: { name: string; offsetDays: number }[];
  load: Record<string, number>;
};
