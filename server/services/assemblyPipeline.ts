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
import {
  datesCoveredByYamlRanges,
  normalizeStoredYamlHolidayRanges,
} from '../../src/lib/holidayBlockDatesAndRanges';
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
  FragmentMeta,
  PhaseLoad,
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
    const bc = fragments.bauConfig as unknown as Record<string, unknown>;
    const bau: Record<string, unknown> = {};
    const daysInUse = bc.days_in_use ?? bc.daysInUse;
    if (daysInUse && Array.isArray(daysInUse)) {
      bau.days_in_use = daysInUse;
    }
    const wc = bc.weekly_cycle ?? bc.weeklyCycle;
    if (wc && typeof wc === 'object' && !Array.isArray(wc)) {
      const w = wc as Record<string, unknown>;
      bau.weekly_cycle = {
        labs_required: w.labs_required ?? w.labsRequired,
        staff_required: w.staff_required ?? w.staffRequired,
        support_days: w.support_days ?? w.supportDays ?? 0,
      };
    }
    const mitRaw = bc.market_it_weekly_load ?? bc.marketItWeeklyLoad;
    if (mitRaw && typeof mitRaw === 'object' && !Array.isArray(mitRaw)) {
      const mit = mitRaw as Record<string, unknown>;
      const wi = mit.weekday_intensity ?? mit.weekdayIntensity;
      if (wi && typeof wi === 'object' && !Array.isArray(wi)) {
        bau.market_it_weekly_load = { weekday_intensity: wi };
      }
    }
    yaml.bau = bau;
  }

  if (fragments.nationalLeaveBands.length > 0) {
    yaml.national_leave_bands = fragments.nationalLeaveBands.map((rawBand) => {
      const b = rawBand as unknown as Record<string, unknown>;
      const label = b.label;
      const from = b.from_date ?? b.fromDate;
      const to = b.to_date ?? b.toDate;
      const capRaw = b.capacity_multiplier ?? b.capacityMultiplier;
      const band: Record<string, unknown> = { label, from, to };
      if (capRaw != null && capRaw !== '') band.capacity_multiplier = Number(capRaw);
      const weeks = b.weeks;
      if (weeks && Array.isArray(weeks) && weeks.length > 0) band.weeks = weeks;
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
    const extra = cal.extra_settings ?? cal.extraSettings;
    const e = extra && typeof extra === 'object' && !Array.isArray(extra) ? (extra as Record<string, unknown>) : {};
    const rangeList = e.yaml_public_ranges;
    const normalizedRanges = normalizeStoredYamlHolidayRanges(rangeList);
    if (normalizedRanges.length > 0) {
      pub.ranges = normalizedRanges;
    }
    const storedExplicit = e.yaml_public_dates;
    const allEntryDates = holidayCalendarEntryDates(cal);
    let explicitDates: string[];
    if (Array.isArray(storedExplicit) && storedExplicit.length > 0) {
      explicitDates = storedExplicit
        .map((d) => String(d).trim())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      explicitDates = [...new Set(explicitDates)].sort();
    } else if (normalizedRanges.length > 0) {
      const inRange = datesCoveredByYamlRanges(Array.isArray(rangeList) ? rangeList : []);
      explicitDates = allEntryDates.filter((d) => !inRange.has(d));
    } else {
      explicitDates = allEntryDates;
    }
    if (explicitDates.length > 0) {
      pub.dates = explicitDates;
    }
    yaml.public_holidays = pub;
  }

  if (fragments.schoolHolidayCalendar) {
    const cal = fragments.schoolHolidayCalendar as unknown as Record<string, unknown>;
    const school: Record<string, unknown> = {
      auto: calBool(cal, 'autoImport', 'auto_import'),
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
    const extra = cal.extra_settings ?? cal.extraSettings;
    const rangeList =
      extra && typeof extra === 'object' && !Array.isArray(extra)
        ? (extra as Record<string, unknown>).yaml_school_ranges
        : undefined;
    const normalizedSchoolRanges = normalizeStoredYamlHolidayRanges(rangeList);
    if (normalizedSchoolRanges.length > 0) {
      school.ranges = normalizedSchoolRanges;
    } else {
      school.dates = holidayCalendarEntryDates(cal);
    }
    yaml.school_holidays = school;
  }

  const mc = fragments.marketConfig as unknown as Record<string, unknown> | undefined;
  const hsRaw = mc?.holiday_settings ?? mc?.holidaySettings;
  if (hsRaw && typeof hsRaw === 'object' && !Array.isArray(hsRaw)) {
    const hs = hsRaw as Record<string, unknown>;
    const holidays: Record<string, unknown> = {};
    const ctd = hs.capacity_taper_days ?? hs.capacityTaperDays;
    const lcs = hs.lab_capacity_scale ?? hs.labCapacityScale;
    if (ctd != null) holidays.capacity_taper_days = Number(ctd);
    if (lcs != null) holidays.lab_capacity_scale = Number(lcs);
    if (Object.keys(holidays).length > 0) yaml.holidays = holidays;
  }

  if (fragments.tradingConfig) {
    // PostgREST returns snake_case; domain types use camelCase — accept both.
    const tc = fragments.tradingConfig as unknown as Record<string, unknown>;
    const trading: Record<string, unknown> = {};
    const weekly = tc.weekly_pattern ?? tc.weeklyPattern;
    const monthly = tc.monthly_pattern ?? tc.monthlyPattern;
    if (weekly && typeof weekly === 'object' && !Array.isArray(weekly)) {
      trading.weekly_pattern = weekly;
    }
    if (monthly && typeof monthly === 'object' && !Array.isArray(monthly)) {
      trading.monthly_pattern = monthly;
    }
    if (tc.seasonal && typeof tc.seasonal === 'object' && !Array.isArray(tc.seasonal)) {
      trading.seasonal = tc.seasonal;
    }
    const prep = tc.campaign_store_boost_prep ?? tc.campaignStoreBoostPrep;
    const live = tc.campaign_store_boost_live ?? tc.campaignStoreBoostLive;
    const effect = tc.campaign_effect_scale ?? tc.campaignEffectScale;
    const payday = tc.payday_month_peak_multiplier ?? tc.paydayMonthPeakMultiplier;
    if (prep != null) trading.campaign_store_boost_prep = prep;
    if (live != null) trading.campaign_store_boost_live = live;
    if (effect != null) trading.campaign_effect_scale = effect;
    if (payday != null) trading.payday_month_peak_multiplier = payday;
    yaml.trading = trading;
  }

  if (fragments.deploymentRiskConfig) {
    // PostgREST: snake_case + YAML-shaped `id` on events/blackouts; domain types used camelCase aliases.
    const drc = fragments.deploymentRiskConfig as unknown as Record<string, unknown>;
    const weekW = drc.deployment_risk_week_weight ?? drc.deploymentRiskWeekWeight;
    if (weekW != null) yaml.deployment_risk_week_weight = Number(weekW);

    const monthCurve = drc.deployment_risk_month_curve ?? drc.deploymentRiskMonthCurve;
    if (monthCurve && typeof monthCurve === 'object' && !Array.isArray(monthCurve)) {
      yaml.deployment_risk_month_curve = monthCurve as Record<string, number>;
    }
    const contextCurve = drc.deployment_risk_context_month_curve ?? drc.deploymentRiskContextMonthCurve;
    if (contextCurve && typeof contextCurve === 'object' && !Array.isArray(contextCurve)) {
      yaml.deployment_risk_context_month_curve = contextCurve as Record<string, number>;
    }
    const strainW = drc.deployment_resourcing_strain_weight ?? drc.deploymentResourcingStrainWeight;
    if (strainW != null) yaml.deployment_resourcing_strain_weight = Number(strainW);

    const evs = drc.events;
    const eventsArr = Array.isArray(evs) ? evs : [];
    if (eventsArr.length > 0) {
      yaml.deployment_risk_events = eventsArr.map((raw) => {
        const e = raw as Record<string, unknown>;
        const id = e.id ?? e.eventId;
        const row: Record<string, unknown> = {
          id,
          start: e.start,
          end: e.end,
          severity: e.severity,
        };
        if (e.kind != null && e.kind !== '') row.kind = e.kind;
        return row;
      });
    }

    const bl = drc.blackouts;
    const blackoutArr = Array.isArray(bl) ? bl : [];
    if (blackoutArr.length > 0) {
      yaml.deployment_risk_blackouts = blackoutArr.map((raw) => {
        const b = raw as Record<string, unknown>;
        const id = b.id ?? b.blackoutId;
        const row: Record<string, unknown> = {
          id,
          start: b.start,
          end: b.end,
          severity: b.severity,
        };
        const pr = b.public_reason ?? b.publicReason;
        const on = b.operational_note ?? b.operationalNote;
        if (pr != null && pr !== '') row.public_reason = pr;
        if (on != null && on !== '') row.operational_note = on;
        return row;
      });
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
function marketRowHierarchy(market: unknown): {
  operatingModelId: OperatingModelId;
  segmentId: string;
} {
  const m = market as Record<string, unknown>;
  const om =
    (m.operating_model_id as string | undefined) ?? (m.operatingModelId as string | undefined);
  const seg = (m.segment_id as string | undefined) ?? (m.segmentId as string | undefined);
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

  const hier = marketRowHierarchy(fragments.market);

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

function normalizePhaseLoad(load: PhaseLoad): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (load.labsRequired != null) out.labs_required = load.labsRequired;
  if (load.techStaff != null) out.tech_staff = load.techStaff;
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

  const fragmentSources: Array<{ type: FragmentType; fragment: FragmentMeta | undefined | null }> = [
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
