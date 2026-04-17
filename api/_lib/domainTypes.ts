/**
 * Canonical domain types for the Postgres-driven config system.
 *
 * These types represent the structured objects stored in Postgres fragments,
 * NOT the legacy YAML-parsed engine types (which remain in src/engine/types.ts).
 *
 * The assembly pipeline maps these domain types INTO the engine's MarketConfig
 * for simulation. The engine types remain the contract for the runtime pipeline.
 */

// ============================================================================
// Organisational Hierarchy
// ============================================================================

export type OperatingModelId = 'operated_markets' | 'licensed_markets';

export interface OperatingModel {
  id: OperatingModelId;
  label: string;
  description?: string;
}

export interface Segment {
  id: string;
  operatingModelId: OperatingModelId;
  label: string;
  description?: string;
  displayOrder: number;
}

export interface Market {
  id: string;
  segmentId: string;
  operatingModelId: OperatingModelId;
  label: string;
  countryCode?: string;
  displayOrder: number;
  isActive: boolean;
}

// ============================================================================
// Scope & Access
// ============================================================================

export type UserRole = 'admin' | 'segment_editor' | 'market_editor' | 'viewer';

export interface UserAccessScope {
  id: string;
  clerkUserId: string;
  email?: string;
  role: UserRole;
  operatingModelId?: OperatingModelId;
  segmentId?: string;
  marketId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

/** Resolved scope for a user session — the effective permissions after merging all scope records. */
export interface ResolvedUserScope {
  userId: string;
  email?: string;
  isAdmin: boolean;
  /** All operating models the user can access. Empty = none (unless admin). */
  operatingModelIds: OperatingModelId[];
  /** All segments the user can access. */
  segmentIds: string[];
  /** All specific markets the user can access (explicit grants). */
  marketIds: string[];
  canEdit: boolean;
}

// ============================================================================
// Fragment Status & Versioning
// ============================================================================

export type FragmentStatus = 'draft' | 'active' | 'archived' | 'superseded';

export interface FragmentMeta {
  id: string;
  operatingModelId: OperatingModelId;
  segmentId: string;
  marketId: string;
  versionNumber: number;
  status: FragmentStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// ============================================================================
// Config Fragment Types
// ============================================================================

export interface ResourceConfig extends FragmentMeta {
  labsCapacity?: number;
  staffCapacity?: number;
  testingCapacity?: number;
  staffMonthlyPatternBasis?: 'absolute' | 'multiplier';
  staffMonthlyPattern?: Record<string, number>;
  labsMonthlyPattern?: Record<string, number>;
  techAvailableCapacityPattern?: Record<string, number>;
  extraSettings?: Record<string, unknown>;
}

export interface BauConfig extends FragmentMeta {
  daysInUse?: string[];
  weeklyCycle?: {
    labsRequired?: number;
    staffRequired?: number;
    supportDays?: number;
  };
  marketItWeeklyLoad?: {
    weekdayIntensity?: Record<string, number>;
    labsMultiplier?: number;
    teamsMultiplier?: number;
    backendMultiplier?: number;
    extraSupportWeekdays?: Record<string, number>;
    extraSupportMonths?: Record<string, number>;
    extraSupportTeamsScale?: number;
  };
  extraSettings?: Record<string, unknown>;
}

export interface CampaignConfig extends FragmentMeta {
  name: string;
  startDate: string;
  durationDays: number;
  testingPrepDuration?: number;
  impact?: 'low' | 'medium' | 'high' | 'very_high';
  promoWeight?: number;
  liveTechLoadScale?: number;
  campaignSupport?: PhaseLoad;
  liveCampaignSupport?: PhaseLoad;
  replacesBauTech?: boolean;
  presenceOnly?: boolean;
  staggerFunctionalLoads?: boolean;
  staggerSettings?: StaggerSettings;
  extraSettings?: Record<string, unknown>;
}

export interface PhaseLoad {
  labsRequired?: number;
  techStaff?: number;
  labs?: number;
  teams?: number;
  backend?: number;
  ops?: number;
  commercial?: number;
}

export interface StaggerSettings {
  techPrepDaysBeforeLive?: number;
  techFinishBeforeLiveDays?: number;
  marketingPrepDaysBeforeLive?: number;
  supplyPrepDaysBeforeLive?: number;
}

export interface TechProgrammeConfig extends FragmentMeta {
  name: string;
  startDate: string;
  durationDays: number;
  testingPrepDuration?: number;
  programmeSupport?: PhaseLoad;
  liveProgrammeSupport?: PhaseLoad;
  liveTechLoadScale?: number;
  replacesBauTech?: boolean;
  extraSettings?: Record<string, unknown>;
}

export type HolidayCalendarType = 'public' | 'school';

export interface HolidayCalendar extends FragmentMeta {
  calendarType: HolidayCalendarType;
  autoImport: boolean;
  staffingMultiplier?: number;
  tradingMultiplier?: number;
  loadEffects?: Record<string, number>;
  entries: HolidayEntry[];
  extraSettings?: Record<string, unknown>;
}

export interface HolidayEntry {
  id: string;
  calendarId: string;
  holidayDate: string;
  label?: string;
}

export interface NationalLeaveBandConfig extends FragmentMeta {
  label?: string;
  fromDate: string;
  toDate: string;
  capacityMultiplier?: number;
  weeks?: Array<{
    weekStart: string;
    capacityMultiplier: number;
  }>;
  extraSettings?: Record<string, unknown>;
}

export interface TradingConfig extends FragmentMeta {
  weeklyPattern?: Record<string, number>;
  monthlyPattern?: Record<string, number>;
  seasonal?: {
    peakMonth: number;
    amplitude: number;
  };
  campaignStoreBoostPrep?: number;
  campaignStoreBoostLive?: number;
  campaignEffectScale?: number;
  paydayMonthPeakMultiplier?: number;
  paydayMonthKnotMultipliers?: [number, number, number, number];
  extraSettings?: Record<string, unknown>;
}

export interface DeploymentRiskConfig extends FragmentMeta {
  deploymentRiskWeekWeight?: number;
  deploymentRiskMonthCurve?: Record<string, number>;
  deploymentRiskContextMonthCurve?: Record<string, number>;
  deploymentResourcingStrainWeight?: number;
  events: DeploymentRiskEvent[];
  blackouts: DeploymentRiskBlackout[];
  extraSettings?: Record<string, unknown>;
}

export interface DeploymentRiskEvent {
  eventId: string;
  start: string;
  end: string;
  severity: number;
  kind?: string;
}

export interface DeploymentRiskBlackout {
  blackoutId: string;
  start: string;
  end: string;
  severity: number;
  publicReason?: string;
  operationalNote?: string;
}

export interface OperatingWindowConfig extends FragmentMeta {
  name: string;
  startDate: string;
  endDate: string;
  multipliers: {
    storePressureMult?: number;
    labLoadMult?: number;
    teamLoadMult?: number;
    backendLoadMult?: number;
    opsActivityMult?: number;
    commercialActivityMult?: number;
    labTeamCapacityMult?: number;
  };
  rampInDays?: number;
  rampOutDays?: number;
  envelope?: 'smoothstep' | 'linear' | 'step';
  extraSettings?: Record<string, unknown>;
}

export interface MarketConfig extends FragmentMeta {
  title?: string;
  description?: string;
  holidaySettings?: {
    capacityTaperDays?: number;
    labCapacityScale?: number;
  };
  stressCorrelations?: Record<string, unknown>;
  riskHeatmapSettings?: Record<string, unknown>;
  extraSettings?: Record<string, unknown>;
}

export interface ScenarioConfig {
  id: string;
  operatingModelId: OperatingModelId;
  segmentId?: string;
  marketId?: string;
  versionNumber: number;
  status: FragmentStatus;
  name: string;
  description?: string;
  baseBuildId?: string;
  overrides: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// ============================================================================
// Build / Artifact Types
// ============================================================================

export type BuildStatus = 'draft' | 'generated' | 'validated' | 'published' | 'failed' | 'superseded';

export interface ConfigBuild {
  id: string;
  operatingModelId: OperatingModelId;
  segmentId?: string;
  marketId?: string;
  buildNumber: number;
  status: BuildStatus;
  triggeredBy?: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  createdAt: string;
  createdBy?: string;
}

export type FragmentType =
  | 'resource_configs'
  | 'bau_configs'
  | 'campaign_configs'
  | 'tech_programme_configs'
  | 'holiday_calendars'
  | 'national_leave_band_configs'
  | 'trading_configs'
  | 'deployment_risk_configs'
  | 'operating_window_configs'
  | 'market_configs'
  | 'scenario_configs';

export interface ConfigBuildComponent {
  id: number;
  buildId: string;
  fragmentType: FragmentType;
  fragmentId: string;
  revisionId: number;
  versionNumber: number;
}

export type ArtifactType = 'market_yaml' | 'segment_bundle' | 'full_bundle';

export interface ConfigArtifact {
  id: string;
  buildId: string;
  operatingModelId: OperatingModelId;
  segmentId?: string;
  marketId?: string;
  artifactType: ArtifactType;
  content: string;
  contentSha256: string;
  byteSize?: number;
  publishedAt?: string;
  publishedBy?: string;
  supersededAt?: string;
  supersededBy?: string;
  createdAt: string;
}

// ============================================================================
// Governance Types
// ============================================================================

export type AuditEventType =
  | 'fragment_created'
  | 'fragment_updated'
  | 'fragment_archived'
  | 'build_generated'
  | 'build_validated'
  | 'build_published'
  | 'build_failed'
  | 'artifact_published'
  | 'artifact_superseded'
  | 'import_started'
  | 'import_completed'
  | 'import_failed'
  | 'validation_failure'
  | 'user_scope_changed'
  | 'admin_config_changed'
  | 'rollback_triggered';

export interface AuditEvent {
  id: number;
  eventType: AuditEventType;
  actorId?: string;
  actorEmail?: string;
  operatingModelId?: string;
  segmentId?: string;
  marketId?: string;
  targetType?: string;
  targetId?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ImportJob {
  id: string;
  operatingModelId?: string;
  segmentId?: string;
  marketId?: string;
  importType: string;
  status: ImportStatus;
  sourceFormat?: string;
  sourceContent?: string;
  resultSummary?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  createdBy?: string;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationScope = 'fragment' | 'cross_fragment' | 'artifact';

export interface ValidationResult {
  id: number;
  scope: ValidationScope;
  targetType: string;
  targetId: string;
  buildId?: string;
  severity: ValidationSeverity;
  ruleCode: string;
  message: string;
  fieldPath?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

// ============================================================================
// Assembled Market Config (bridge to engine types)
// ============================================================================

/** All fragments for a single market, ready for assembly into engine-compatible YAML. */
export interface AssembledMarketFragments {
  market: Market;
  marketConfig?: MarketConfig;
  resourceConfig?: ResourceConfig;
  bauConfig?: BauConfig;
  campaigns: CampaignConfig[];
  techProgrammes: TechProgrammeConfig[];
  publicHolidayCalendar?: HolidayCalendar;
  schoolHolidayCalendar?: HolidayCalendar;
  nationalLeaveBands: NationalLeaveBandConfig[];
  tradingConfig?: TradingConfig;
  deploymentRiskConfig?: DeploymentRiskConfig;
  operatingWindows: OperatingWindowConfig[];
}
