/**
 * Planning workbench domain model (national QSR office / market).
 * YAML `MarketConfig` maps into these shapes for UI, export, and future non-YAML inputs.
 */

import type { PressureSurfaceId } from './pressureSurfaces';

/** Ordinal / banded proxies — no fake precision. */
export type OrdinalBand = 'xs' | 's' | 'm' | 'l' | 'xl';

export type MarketProfile = {
  marketId: string;
  label?: string;
  /** Rough scale signals (optional). */
  restaurantCountBand?: OrdinalBand;
  annualSalesBand?: OrdinalBand;
  transactionVolumeBand?: OrdinalBand;
  geographySpread?: OrdinalBand;
  franchiseMix?: OrdinalBand;
  supportedSystemsCount?: OrdinalBand;
  languages?: OrdinalBand;
  fiscalComplexity?: OrdinalBand;
  promoComplexity?: OrdinalBand;
  vendorReliance?: OrdinalBand;
  pmoMaturity?: OrdinalBand;
  localCustomisation?: OrdinalBand;
  notes?: string;
};

/** First-class planning entity; legacy YAML maps labs/teams/backend/ops/commercial onto these roles. */
export type OrgFunction = {
  id: string;
  label: string;
  /** Which numeric bucket in the simulation this function consumes (YAML phase loads). */
  bucket: 'labs' | 'teams' | 'backend' | 'ops' | 'commercial';
  description?: string;
};

/**
 * Proxy-based capacity: nominal units from market heuristics × efficiency/complexity modifiers.
 * `baseUnits` often mirrors YAML `resources.labs.capacity` + summed team sizes.
 */
export type CapacityRecipe = {
  functionId: string;
  /** Nominal capacity units before modifiers. */
  baseUnits: number;
  /** Multiplier from market complexity (≤1 tightens effective capacity). */
  complexityMult?: number;
  /** Multiplier from ways of working / tooling (≥1 improves effective capacity). */
  efficiencyMult?: number;
};

export type PressureEventKind =
  | 'bau_rhythm'
  | 'campaign'
  | 'programme'
  | 'pilot'
  | 'readiness'
  | 'launch'
  | 'stabilisation'
  | 'operational_window'
  | 'incident'
  | 'governance'
  | 'other';

/** One scheduled pressure contribution after parsing (campaign, release phase, BAU spike, etc.). */
export type PressureEvent = {
  id: string;
  kind: PressureEventKind;
  name: string;
  /** ISO date range (day granularity). Omitted for recurring BAU rhythms described only by weekday in YAML. */
  startDate?: string;
  endDate?: string;
  /** 0–1 intensity for explainability (derived from YAML loads / impact). */
  intensityHint?: number;
  affectedFunctionIds?: string[];
  source?:
    | 'yaml_campaign'
    | 'yaml_tech_programme'
    | 'yaml_bau'
    | 'yaml_release'
    | 'yaml_operating_window'
    | 'dsl'
    | 'manual';
};

export type SimulationConfig = {
  /** Internal calendar uses daily buckets; UI defaults to weekly rollups. */
  timeGrainDays: 1 | 7;
  /** Fraction of **intrinsic** overload (scheduled load above nominal cap, excluding carry-in) that rolls forward. Engine default ≈0.12. */
  carryOverRate: number;
  /** Backlog carried to the next day after decay (1 = none; engine default ≈0.92). */
  carryDecayPerDay: number;
};

export type Scenario = {
  id: string;
  name: string;
  version: string;
  profile: MarketProfile;
  functions: OrgFunction[];
  recipes: CapacityRecipe[];
  events: PressureEvent[];
  simulation: SimulationConfig;
  /** Raw DSL snapshot for round-trip (optional). */
  dslText?: string;
};

export type PressureSurfaceBreakdown = Record<PressureSurfaceId, number>;

/** One day × market after simulation (subset exposed to UI). */
export type SimulationDay = {
  date: string;
  marketId: string;
  riskScore: number;
  riskBand: string;
  headroom: number;
  surfaces: PressureSurfaceBreakdown;
  /** Human-readable top drivers for tooltips. */
  driverHints?: string[];
};

export type SimulationSummary = {
  peakRisk: number;
  peakRiskDate: string;
  highBandDayCount: number;
  overloadArea: number;
  /** Days where any tech bucket would exceed nominal cap before capping (raw strain). */
  nominalBreachDayCount: number;
  criticalFunctionBreaches: { functionId: string; dayCount: number }[];
};

export type SimulationResult = {
  days: SimulationDay[];
  summary: SimulationSummary;
  scenario: Scenario;
};
