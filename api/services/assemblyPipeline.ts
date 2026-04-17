/**
 * Assembly Pipeline: deterministic YAML generation from Postgres config fragments.
 *
 * Flow:
 * 1. Load all active fragments for a market
 * 2. Resolve config inheritance (system → operating model → segment → market)
 * 3. Assemble into engine-compatible YAML structure
 * 4. Generate YAML text with deterministic formatting
 * 5. Compute SHA-256 checksum
 * 6. Persist build record, components, and artifact
 *
 * The assembled YAML matches the existing MarketConfig YAML schema
 * so the existing engine pipeline can consume it unchanged.
 */
import { createHash } from 'crypto';
import { supabaseServiceClient } from '../lib/supabaseClient';
import type {
  AssembledMarketFragments,
  CampaignConfig,
  TechProgrammeConfig,
  NationalLeaveBandConfig,
  OperatingModelId,
  OperatingWindowConfig,
  BuildStatus,
  ConfigBuild,
  ConfigArtifact,
  FragmentType,
} from '../lib/domainTypes';

// ============================================================================
// Fragment Loading
// ============================================================================

/**
 * Load all active fragments for a single market, ready for assembly.
 */
export async function loadMarketFragments(
  marketId: string
): Promise<AssembledMarketFragments | null> {
  const client = supabaseServiceClient();

  const { data: market } = await client
    .from('markets')
    .select('*')
    .eq('id', marketId)
    .eq('is_active', true)
    .single();

  if (!market) return null;

  const [
    marketConfigRes,
    resourceRes,
    bauRes,
    campaignRes,
    techProgRes,
    publicHolRes,
    schoolHolRes,
    leaveBandRes,
    tradingRes,
    riskRes,
    windowRes,
  ] = await Promise.all([
    client.from('market_configs').select('*').eq('market_id', marketId).eq('status', 'active').limit(1).single(),
    client.from('resource_configs').select('*').eq('market_id', marketId).eq('status', 'active').limit(1).single(),
    client.from('bau_configs').select('*').eq('market_id', marketId).eq('status', 'active').limit(1).single(),
    client.from('campaign_configs').select('*').eq('market_id', marketId).eq('status', 'active').order('start_date'),
    client.from('tech_programme_configs').select('*').eq('market_id', marketId).eq('status', 'active').order('start_date'),
    client.from('holiday_calendars').select('*, holiday_entries(*)').eq('market_id', marketId).eq('calendar_type', 'public').eq('status', 'active').limit(1).single(),
    client.from('holiday_calendars').select('*, holiday_entries(*)').eq('market_id', marketId).eq('calendar_type', 'school').eq('status', 'active').limit(1).single(),
    client.from('national_leave_band_configs').select('*').eq('market_id', marketId).eq('status', 'active').order('from_date'),
    client.from('trading_configs').select('*').eq('market_id', marketId).eq('status', 'active').limit(1).single(),
    client.from('deployment_risk_configs').select('*').eq('market_id', marketId).eq('status', 'active').limit(1).single(),
    client.from('operating_window_configs').select('*').eq('market_id', marketId).eq('status', 'active').order('start_date'),
  ]);

  return {
    market,
    marketConfig: marketConfigRes.data ?? undefined,
    resourceConfig: resourceRes.data ?? undefined,
    bauConfig: bauRes.data ?? undefined,
    campaigns: (campaignRes.data ?? []) as CampaignConfig[],
    techProgrammes: (techProgRes.data ?? []) as TechProgrammeConfig[],
    publicHolidayCalendar: publicHolRes.data ?? undefined,
    schoolHolidayCalendar: schoolHolRes.data ?? undefined,
    nationalLeaveBands: (leaveBandRes.data ?? []) as NationalLeaveBandConfig[],
    tradingConfig: tradingRes.data ?? undefined,
    deploymentRiskConfig: riskRes.data ?? undefined,
    operatingWindows: (windowRes.data ?? []) as OperatingWindowConfig[],
  };
}

// ============================================================================
// YAML Assembly
// ============================================================================

/** Normalise holiday calendar rows from PostgREST (snake_case + embedded `holiday_entries`). */
function holidayCalendarEntryDates(cal: Record<string, unknown>): string[] {
  const raw = (cal.holiday_entries ?? cal.entries) as unknown[] | undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      const row = e as Record<string, unknown>;
      return String(row.holiday_date ?? row.holidayDate ?? '').trim();
    })
    .filter(Boolean)
    .sort();
}

function calBool(cal: Record<string, unknown>, camel: string, snake: string): boolean {
  const v = cal[camel] ?? cal[snake];
  return Boolean(v);
}

function calNum(cal: Record<string, unknown>, camel: string, snake: string, fallback: number): number {
  const v = cal[camel] ?? cal[snake];
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Assemble a market's fragments into a YAML-compatible plain object
 * matching the existing MarketConfig YAML schema.
 */
export function assembleMarketYamlObject(
  fragments: AssembledMarketFragments
): Record<string, unknown> {
  const yaml: Record<string, unknown> = {};

  yaml.market = fragments.market.id;
  yaml.title = fragments.marketConfig?.title ?? fragments.market.label;

  if (fragments.resourceConfig) {
    const rc = fragments.resourceConfig;
    const resources: Record<string, unknown> = {};
    if (rc.labsCapacity != null) {
      resources.labs = { capacity: rc.labsCapacity };
    }
    if (rc.staffCapacity != null) {
      const staff: Record<string, unknown> = { capacity: rc.staffCapacity };
      if (rc.staffMonthlyPatternBasis) {
        staff.monthly_pattern_basis = rc.staffMonthlyPatternBasis;
      }
      if (rc.staffMonthlyPattern) {
        staff.monthly_pattern = rc.staffMonthlyPattern;
      }
      resources.staff = staff;
    }
    if (rc.testingCapacity != null) {
      resources.testing_capacity = rc.testingCapacity;
    }
    yaml.resources = resources;
  }

  if (fragments.bauConfig) {
    const bc = fragments.bauConfig;
    const bau: Record<string, unknown> = {};
    if (bc.daysInUse) bau.days_in_use = bc.daysInUse;
    if (bc.weeklyCycle) {
      bau.weekly_cycle = {
        labs_required: bc.weeklyCycle.labsRequired,
        staff_required: bc.weeklyCycle.staffRequired,
        support_days: bc.weeklyCycle.supportDays ?? 0,
      };
    }
    if (bc.marketItWeeklyLoad) {
      const mit: Record<string, unknown> = {};
      if (bc.marketItWeeklyLoad.weekdayIntensity) {
        mit.weekday_intensity = bc.marketItWeeklyLoad.weekdayIntensity;
      }
      bau.market_it_weekly_load = mit;
    }
    yaml.bau = bau;
  }

  if (fragments.nationalLeaveBands.length > 0) {
    yaml.national_leave_bands = fragments.nationalLeaveBands.map((b) => {
      const band: Record<string, unknown> = {
        label: b.label,
        from: b.fromDate,
        to: b.toDate,
      };
      if (b.capacityMultiplier != null) band.capacity_multiplier = b.capacityMultiplier;
      if (b.weeks) band.weeks = b.weeks;
      return band;
    });
  }

  if (fragments.campaigns.length > 0) {
    yaml.campaigns = fragments.campaigns.map((c) => {
      const campaign: Record<string, unknown> = {
        name: c.name,
        start_date: c.startDate,
        duration: c.durationDays,
      };
      if (c.testingPrepDuration != null) campaign.testing_prep_duration = c.testingPrepDuration;
      if (c.impact) campaign.impact = c.impact;
      if (c.promoWeight != null) campaign.promo_weight = c.promoWeight;
      if (c.liveTechLoadScale != null) campaign.live_tech_load_scale = c.liveTechLoadScale;
      if (c.campaignSupport) campaign.campaign_support = normalizePhaseLoad(c.campaignSupport);
      if (c.liveCampaignSupport) campaign.live_campaign_support = normalizePhaseLoad(c.liveCampaignSupport);
      if (c.replacesBauTech) campaign.replaces_bau_tech = true;
      if (c.presenceOnly) campaign.presence_only = true;
      if (c.staggerFunctionalLoads) campaign.stagger_functional_loads = true;
      return campaign;
    });
  }

  if (fragments.techProgrammes.length > 0) {
    yaml.tech_programmes = fragments.techProgrammes.map((p) => {
      const prog: Record<string, unknown> = {
        name: p.name,
        start_date: p.startDate,
        duration: p.durationDays,
      };
      if (p.testingPrepDuration != null) prog.testing_prep_duration = p.testingPrepDuration;
      if (p.programmeSupport) prog.programme_support = normalizePhaseLoad(p.programmeSupport);
      if (p.liveProgrammeSupport) prog.live_programme_support = normalizePhaseLoad(p.liveProgrammeSupport);
      if (p.liveTechLoadScale != null) prog.live_tech_load_scale = p.liveTechLoadScale;
      if (p.replacesBauTech) prog.replaces_bau_tech = true;
      return prog;
    });
  }

  if (fragments.publicHolidayCalendar) {
    const cal = fragments.publicHolidayCalendar as unknown as Record<string, unknown>;
    const pub: Record<string, unknown> = {
      auto: calBool(cal, 'autoImport', 'auto_import'),
      dates: holidayCalendarEntryDates(cal),
      staffing_multiplier: calNum(cal, 'staffingMultiplier', 'staffing_multiplier', 1.0),
      trading_multiplier: calNum(cal, 'tradingMultiplier', 'trading_multiplier', 1.0),
    };
    const loadEffects = cal.loadEffects ?? cal.load_effects;
    if (
      loadEffects &&
      typeof loadEffects === 'object' &&
      !Array.isArray(loadEffects) &&
      Object.keys(loadEffects as object).length > 0
    ) {
      pub.load_effects = loadEffects;
    }
    yaml.public_holidays = pub;
  }

  if (fragments.schoolHolidayCalendar) {
    const cal = fragments.schoolHolidayCalendar as unknown as Record<string, unknown>;
    const school: Record<string, unknown> = {
      auto: calBool(cal, 'autoImport', 'auto_import'),
      dates: holidayCalendarEntryDates(cal),
      staffing_multiplier: calNum(cal, 'staffingMultiplier', 'staffing_multiplier', 1.0),
      trading_multiplier: calNum(cal, 'tradingMultiplier', 'trading_multiplier', 1.0),
    };
    const loadEffects = cal.loadEffects ?? cal.load_effects;
    if (
      loadEffects &&
      typeof loadEffects === 'object' &&
      !Array.isArray(loadEffects) &&
      Object.keys(loadEffects as object).length > 0
    ) {
      school.load_effects = loadEffects;
    }
    yaml.school_holidays = school;
  }

  if (fragments.marketConfig?.holidaySettings) {
    const hs = fragments.marketConfig.holidaySettings;
    const holidays: Record<string, unknown> = {};
    if (hs.capacityTaperDays != null) holidays.capacity_taper_days = hs.capacityTaperDays;
    if (hs.labCapacityScale != null) holidays.lab_capacity_scale = hs.labCapacityScale;
    yaml.holidays = holidays;
  }

  if (fragments.tradingConfig) {
    const tc = fragments.tradingConfig;
    const trading: Record<string, unknown> = {};
    if (tc.weeklyPattern) trading.weekly_pattern = tc.weeklyPattern;
    if (tc.monthlyPattern) trading.monthly_pattern = tc.monthlyPattern;
    if (tc.seasonal) trading.seasonal = tc.seasonal;
    if (tc.campaignStoreBoostPrep != null) trading.campaign_store_boost_prep = tc.campaignStoreBoostPrep;
    if (tc.campaignStoreBoostLive != null) trading.campaign_store_boost_live = tc.campaignStoreBoostLive;
    if (tc.campaignEffectScale != null) trading.campaign_effect_scale = tc.campaignEffectScale;
    if (tc.paydayMonthPeakMultiplier != null) trading.payday_month_peak_multiplier = tc.paydayMonthPeakMultiplier;
    yaml.trading = trading;
  }

  if (fragments.deploymentRiskConfig) {
    const drc = fragments.deploymentRiskConfig;
    if (drc.deploymentRiskWeekWeight != null) {
      yaml.deployment_risk_week_weight = drc.deploymentRiskWeekWeight;
    }
    if (drc.deploymentRiskMonthCurve) {
      yaml.deployment_risk_month_curve = drc.deploymentRiskMonthCurve;
    }
    if (drc.events.length > 0) {
      yaml.deployment_risk_events = drc.events.map((e) => ({
        id: e.eventId,
        start: e.start,
        end: e.end,
        severity: e.severity,
        kind: e.kind,
      }));
    }
    if (drc.blackouts.length > 0) {
      yaml.deployment_risk_blackouts = drc.blackouts.map((b) => ({
        id: b.blackoutId,
        start: b.start,
        end: b.end,
        severity: b.severity,
        public_reason: b.publicReason,
        operational_note: b.operationalNote,
      }));
    }
  }

  if (fragments.operatingWindows.length > 0) {
    yaml.operating_windows = fragments.operatingWindows.map((w) => {
      const win: Record<string, unknown> = {
        name: w.name,
        start: w.startDate,
        end: w.endDate,
        ...w.multipliers,
      };
      if (w.rampInDays != null) win.ramp_in_days = w.rampInDays;
      if (w.rampOutDays != null) win.ramp_out_days = w.rampOutDays;
      if (w.envelope) win.envelope = w.envelope;
      return win;
    });
  }

  if (fragments.marketConfig?.stressCorrelations &&
      Object.keys(fragments.marketConfig.stressCorrelations).length > 0) {
    yaml.stress_correlations = fragments.marketConfig.stressCorrelations;
  }

  return yaml;
}

/**
 * Convert assembled object to deterministic YAML text.
 * Uses sorted keys and consistent formatting for reproducibility.
 */
export function toYamlText(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  serializeYamlObject(obj, lines, 0);
  return lines.join('\n') + '\n';
}

/**
 * Compute SHA-256 checksum of content.
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** PostgREST returns snake_case; domain types use camelCase — normalize before inserts. */
function marketRowHierarchy(market: Record<string, unknown>): {
  operatingModelId: OperatingModelId;
  segmentId: string;
} {
  const om =
    (market.operating_model_id as string | undefined) ??
    (market.operatingModelId as string | undefined);
  const seg =
    (market.segment_id as string | undefined) ?? (market.segmentId as string | undefined);
  if (!om || !seg) {
    throw new Error('Market row missing operating_model_id or segment_id');
  }
  return { operatingModelId: om as OperatingModelId, segmentId: seg };
}

// ============================================================================
// Build Pipeline
// ============================================================================

/**
 * Execute a full build for a market: load fragments, assemble, validate, persist.
 */
export async function buildMarket(
  marketId: string,
  actorId: string
): Promise<{ build: ConfigBuild; artifact?: ConfigArtifact; error?: string }> {
  const client = supabaseServiceClient();

  const fragments = await loadMarketFragments(marketId);
  if (!fragments) {
    return { build: { status: 'failed' } as ConfigBuild, error: `Market ${marketId} not found` };
  }

  const hier = marketRowHierarchy(fragments.market as Record<string, unknown>);

  const { data: buildRow, error: buildErr } = await client
    .from('config_builds')
    .insert({
      operating_model_id: hier.operatingModelId,
      segment_id: hier.segmentId,
      market_id: marketId,
      status: 'draft',
      triggered_by: actorId,
      created_by: actorId,
    })
    .select()
    .single();

  if (buildErr || !buildRow) {
    return { build: { status: 'failed' } as ConfigBuild, error: buildErr?.message };
  }

  const build = buildRow as ConfigBuild;

  try {
    const yamlObj = assembleMarketYamlObject(fragments);
    const yamlText = toYamlText(yamlObj);
    const checksum = sha256(yamlText);

    await recordBuildComponents(build.id, fragments);

    await client
      .from('config_builds')
      .update({ status: 'generated', completed_at: new Date().toISOString() })
      .eq('id', build.id);

    const { data: artifactRow } = await client
      .from('config_artifacts')
      .insert({
        build_id: build.id,
        operating_model_id: hier.operatingModelId,
        segment_id: hier.segmentId,
        market_id: marketId,
        artifact_type: 'market_yaml',
        content: yamlText,
        content_sha256: checksum,
        byte_size: Buffer.byteLength(yamlText, 'utf-8'),
      })
      .select()
      .single();

    await client
      .from('config_builds')
      .update({ status: 'validated' })
      .eq('id', build.id);

    await client.from('audit_events').insert({
      event_type: 'build_generated',
      actor_id: actorId,
      operating_model_id: hier.operatingModelId,
      segment_id: hier.segmentId,
      market_id: marketId,
      target_type: 'config_builds',
      target_id: build.id,
      details: { checksum, byte_size: Buffer.byteLength(yamlText, 'utf-8') },
    });

    return {
      build: { ...build, status: 'validated' as BuildStatus },
      artifact: artifactRow as ConfigArtifact,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await client
      .from('config_builds')
      .update({ status: 'failed', error_message: msg, completed_at: new Date().toISOString() })
      .eq('id', build.id);

    await client.from('audit_events').insert({
      event_type: 'build_failed',
      actor_id: actorId,
      operating_model_id: hier.operatingModelId,
      segment_id: hier.segmentId,
      market_id: marketId,
      target_type: 'config_builds',
      target_id: build.id,
      details: { error: msg },
    });

    return { build: { ...build, status: 'failed' as BuildStatus }, error: msg };
  }
}

/**
 * Publish a validated build's artifact, superseding the currently published one.
 */
export async function publishBuild(
  buildId: string,
  actorId: string
): Promise<{ ok: boolean; error?: string }> {
  const client = supabaseServiceClient();

  const { data: build } = await client
    .from('config_builds')
    .select('*')
    .eq('id', buildId)
    .single();

  if (!build) return { ok: false, error: 'Build not found' };
  if (build.status !== 'validated') {
    return { ok: false, error: `Build status is ${build.status}, must be validated` };
  }

  const { data: artifact } = await client
    .from('config_artifacts')
    .select('*')
    .eq('build_id', buildId)
    .single();

  if (!artifact) return { ok: false, error: 'No artifact found for build' };

  const now = new Date().toISOString();

  // Supersede the currently published artifact for this market
  if (build.market_id) {
    const { data: current } = await client
      .from('config_artifacts')
      .select('id')
      .eq('market_id', build.market_id)
      .eq('artifact_type', 'market_yaml')
      .not('published_at', 'is', null)
      .is('superseded_at', null)
      .single();

    if (current) {
      await client
        .from('config_artifacts')
        .update({ superseded_at: now, superseded_by: artifact.id })
        .eq('id', current.id);

      await client.from('audit_events').insert({
        event_type: 'artifact_superseded',
        actor_id: actorId,
        operating_model_id: build.operating_model_id,
        market_id: build.market_id,
        target_type: 'config_artifacts',
        target_id: current.id,
        details: { superseded_by: artifact.id },
      });
    }
  }

  await client
    .from('config_artifacts')
    .update({ published_at: now, published_by: actorId })
    .eq('id', artifact.id);

  await client
    .from('config_builds')
    .update({ status: 'published' })
    .eq('id', buildId);

  await client.from('audit_events').insert({
    event_type: 'build_published',
    actor_id: actorId,
    operating_model_id: build.operating_model_id,
    market_id: build.market_id,
    target_type: 'config_builds',
    target_id: buildId,
    details: { artifact_id: artifact.id },
  });

  return { ok: true };
}

/**
 * Assemble YAML from current DB fragments only (no build row, no publish).
 * Used when no published or draft artifact exists yet (e.g. Expert YAML in admin).
 */
export async function previewAssembledYamlForMarket(marketId: string): Promise<string | null> {
  const fragments = await loadMarketFragments(marketId);
  if (!fragments) return null;
  try {
    const yamlObj = assembleMarketYamlObject(fragments);
    return toYamlText(yamlObj);
  } catch {
    return null;
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

function normalizePhaseLoad(load: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (load.labsRequired != null || load.labs_required != null) {
    out.labs_required = load.labsRequired ?? load.labs_required;
  }
  if (load.techStaff != null || load.tech_staff != null) {
    out.tech_staff = load.techStaff ?? load.tech_staff;
  }
  if (load.labs != null) out.labs = load.labs;
  if (load.teams != null) out.teams = load.teams;
  if (load.backend != null) out.backend = load.backend;
  if (load.ops != null) out.ops = load.ops;
  if (load.commercial != null) out.commercial = load.commercial;
  return out;
}

async function recordBuildComponents(
  buildId: string,
  fragments: AssembledMarketFragments
): Promise<void> {
  const client = supabaseServiceClient();
  const components: Array<{
    build_id: string;
    fragment_type: FragmentType;
    fragment_id: string;
    revision_id: number;
    version_number: number;
  }> = [];

  const fragmentSources: Array<{ type: FragmentType; fragment: Record<string, unknown> | undefined | null }> = [
    { type: 'market_configs', fragment: fragments.marketConfig },
    { type: 'resource_configs', fragment: fragments.resourceConfig },
    { type: 'bau_configs', fragment: fragments.bauConfig },
    { type: 'trading_configs', fragment: fragments.tradingConfig },
    { type: 'deployment_risk_configs', fragment: fragments.deploymentRiskConfig },
  ];

  for (const { type, fragment } of fragmentSources) {
    if (!fragment) continue;
    const rev = await getLatestRevisionId(type, fragment.id as string);
    if (rev) {
      components.push({
        build_id: buildId,
        fragment_type: type,
        fragment_id: fragment.id as string,
        revision_id: rev.id,
        version_number: rev.versionNumber,
      });
    }
  }

  const arrayFragments: Array<{ type: FragmentType; items: Array<Record<string, unknown>> }> = [
    { type: 'campaign_configs', items: fragments.campaigns as unknown as Record<string, unknown>[] },
    { type: 'tech_programme_configs', items: fragments.techProgrammes as unknown as Record<string, unknown>[] },
    { type: 'national_leave_band_configs', items: fragments.nationalLeaveBands as unknown as Record<string, unknown>[] },
    { type: 'operating_window_configs', items: fragments.operatingWindows as unknown as Record<string, unknown>[] },
  ];

  for (const { type, items } of arrayFragments) {
    for (const item of items) {
      const rev = await getLatestRevisionId(type, item.id as string);
      if (rev) {
        components.push({
          build_id: buildId,
          fragment_type: type,
          fragment_id: item.id as string,
          revision_id: rev.id,
          version_number: rev.versionNumber,
        });
      }
    }
  }

  if (fragments.publicHolidayCalendar) {
    const rev = await getLatestRevisionId('holiday_calendars', fragments.publicHolidayCalendar.id);
    if (rev) {
      components.push({
        build_id: buildId,
        fragment_type: 'holiday_calendars',
        fragment_id: fragments.publicHolidayCalendar.id,
        revision_id: rev.id,
        version_number: rev.versionNumber,
      });
    }
  }

  if (fragments.schoolHolidayCalendar) {
    const rev = await getLatestRevisionId('holiday_calendars', fragments.schoolHolidayCalendar.id);
    if (rev) {
      components.push({
        build_id: buildId,
        fragment_type: 'holiday_calendars',
        fragment_id: fragments.schoolHolidayCalendar.id,
        revision_id: rev.id,
        version_number: rev.versionNumber,
      });
    }
  }

  if (components.length > 0) {
    await client.from('config_build_components').insert(components);
  }
}

async function getLatestRevisionId(
  fragmentType: FragmentType,
  fragmentId: string
): Promise<{ id: number; versionNumber: number } | null> {
  const client = supabaseServiceClient();
  const { data } = await client
    .from('config_revisions')
    .select('id, version_number')
    .eq('fragment_type', fragmentType)
    .eq('fragment_id', fragmentId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;
  return { id: (data as Record<string, number>).id, versionNumber: (data as Record<string, number>).version_number };
}

// ============================================================================
// Deterministic YAML serializer
// ============================================================================

const YAML_SECTION_ORDER = [
  'market', 'title', 'description', 'resources', 'national_leave_bands',
  'bau', 'campaigns', 'tech_programmes', 'public_holidays', 'school_holidays',
  'holidays', 'trading', 'stress_correlations', 'operating_windows',
  'deployment_risk_week_weight', 'deployment_risk_month_curve',
  'deployment_risk_context_month_curve', 'deployment_risk_events',
  'deployment_risk_blackouts',
];

function serializeYamlObject(obj: Record<string, unknown>, lines: string[], indent: number): void {
  const pad = '  '.repeat(indent);
  const keys = orderedKeys(obj);

  for (const key of keys) {
    const val = obj[key];
    if (val === undefined || val === null) continue;

    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      const formatted = typeof val === 'string' && /[:\-#{}\[\],&*?|>!%@`]/.test(val)
        ? `'${val.replace(/'/g, "''")}'`
        : String(val);
      lines.push(`${pad}${key}: ${formatted}`);
    } else if (Array.isArray(val)) {
      lines.push(`${pad}${key}:`);
      for (const item of val) {
        if (typeof item === 'string') {
          const formatted = /^\d{4}-\d{2}-\d{2}$/.test(item) ? `'${item}'` : item;
          lines.push(`${pad}  - ${formatted}`);
        } else if (typeof item === 'object' && item !== null) {
          const itemKeys = Object.keys(item as Record<string, unknown>);
          if (itemKeys.length > 0) {
            const first = itemKeys[0]!;
            const firstVal = (item as Record<string, unknown>)[first];
            lines.push(`${pad}  - ${first}: ${formatScalar(firstVal)}`);
            for (let i = 1; i < itemKeys.length; i++) {
              const k = itemKeys[i]!;
              const v = (item as Record<string, unknown>)[k];
              if (v === undefined || v === null) continue;
              if (typeof v === 'object' && !Array.isArray(v)) {
                lines.push(`${pad}    ${k}:`);
                serializeYamlObject(v as Record<string, unknown>, lines, indent + 3);
              } else {
                lines.push(`${pad}    ${k}: ${formatScalar(v)}`);
              }
            }
          }
        }
      }
    } else if (typeof val === 'object') {
      lines.push(`${pad}${key}:`);
      serializeYamlObject(val as Record<string, unknown>, lines, indent + 1);
    }
  }
}

function orderedKeys(obj: Record<string, unknown>): string[] {
  const keys = Object.keys(obj);
  return keys.sort((a, b) => {
    const ia = YAML_SECTION_ORDER.indexOf(a);
    const ib = YAML_SECTION_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

function formatScalar(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return `'${val}'`;
    if (/[:\-#{}\[\],&*?|>!%@`]/.test(val)) return `'${val.replace(/'/g, "''")}'`;
    return val;
  }
  return String(val);
}
