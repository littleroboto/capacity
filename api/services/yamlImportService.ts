/**
 * YAML Import Service: decomposes existing market YAML files into Postgres fragments.
 *
 * Used for:
 * 1. Initial migration of existing YAML files into the fragment schema
 * 2. Expert-mode paste: parse YAML input into canonical fragment objects
 * 3. Bulk import of market configurations
 *
 * Both guided mode and expert mode flow through the same validation
 * and revision pipeline — this service is the common entry point for
 * creating fragments from YAML-shaped input.
 */
import { supabaseServiceClient } from '../lib/supabaseClient';
import type { OperatingModelId } from '../lib/domainTypes';

export interface YamlImportResult {
  marketId: string;
  fragmentsCreated: number;
  warnings: string[];
  errors: string[];
}

/**
 * Parse a YAML object (already loaded via js-yaml) and decompose it
 * into individual config fragments stored in Postgres.
 *
 * This is the canonical path for both:
 * - Initial migration from static YAML files
 * - Expert-mode paste from the admin UI
 */
export async function importMarketYamlObject(
  yamlObj: Record<string, unknown>,
  operatingModelId: OperatingModelId,
  segmentId: string,
  actorId: string,
  actorEmail?: string
): Promise<YamlImportResult> {
  const client = supabaseServiceClient();
  const marketId = String(yamlObj.market || yamlObj.country || '');

  if (!marketId) {
    return { marketId: '', fragmentsCreated: 0, warnings: [], errors: ['Missing market/country field'] };
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  let fragmentsCreated = 0;

  const meta = {
    operating_model_id: operatingModelId,
    segment_id: segmentId,
    market_id: marketId,
    status: 'active',
    version_number: 1,
    created_by: actorId,
    updated_by: actorId,
  };

  // Market config
  try {
    await client.from('market_configs').insert({
      ...meta,
      title: yamlObj.title || marketId,
      description: yamlObj.description || null,
      holiday_settings: extractHolidaySettings(yamlObj),
      stress_correlations: yamlObj.stress_correlations || {},
      extra_settings: {},
    });
    fragmentsCreated++;
  } catch (e) {
    errors.push(`market_configs: ${errorMsg(e)}`);
  }

  // Resources
  if (yamlObj.resources) {
    try {
      const res = yamlObj.resources as Record<string, unknown>;
      const labs = res.labs as Record<string, unknown> | undefined;
      const staff = res.staff as Record<string, unknown> | undefined;
      await client.from('resource_configs').insert({
        ...meta,
        labs_capacity: labs?.capacity ?? null,
        staff_capacity: staff?.capacity ?? null,
        testing_capacity: res.testing_capacity ?? null,
        staff_monthly_pattern_basis: staff?.monthly_pattern_basis ?? null,
        staff_monthly_pattern: staff?.monthly_pattern ?? null,
        labs_monthly_pattern: null,
        tech_available_capacity_pattern: null,
        extra_settings: {},
      });
      fragmentsCreated++;
    } catch (e) {
      errors.push(`resource_configs: ${errorMsg(e)}`);
    }
  }

  // BAU
  if (yamlObj.bau) {
    try {
      const bau = yamlObj.bau as Record<string, unknown>;
      await client.from('bau_configs').insert({
        ...meta,
        days_in_use: bau.days_in_use ?? null,
        weekly_cycle: bau.weekly_cycle ?? null,
        market_it_weekly_load: bau.market_it_weekly_load ?? null,
        extra_settings: {},
      });
      fragmentsCreated++;
    } catch (e) {
      errors.push(`bau_configs: ${errorMsg(e)}`);
    }
  }

  // Campaigns
  if (Array.isArray(yamlObj.campaigns)) {
    for (const c of yamlObj.campaigns as Record<string, unknown>[]) {
      try {
        await client.from('campaign_configs').insert({
          ...meta,
          version_number: 1,
          name: c.name,
          start_date: c.start_date || c.start,
          duration_days: c.duration || c.durationDays,
          testing_prep_duration: c.testing_prep_duration ?? c.prep_before_live_days ?? null,
          impact: c.impact ?? null,
          promo_weight: c.promo_weight ?? c.business_uplift ?? 1.0,
          live_tech_load_scale: c.live_tech_load_scale ?? null,
          campaign_support: c.campaign_support ?? c.load ?? null,
          live_campaign_support: c.live_campaign_support ?? c.live_support_load ?? null,
          replaces_bau_tech: c.replaces_bau_tech ?? false,
          presence_only: c.presence_only ?? false,
          stagger_functional_loads: c.stagger_functional_loads ?? false,
          stagger_settings: null,
          extra_settings: {},
        });
        fragmentsCreated++;
      } catch (e) {
        errors.push(`campaign_configs (${c.name}): ${errorMsg(e)}`);
      }
    }
  }

  // Tech programmes
  if (Array.isArray(yamlObj.tech_programmes)) {
    for (const p of yamlObj.tech_programmes as Record<string, unknown>[]) {
      try {
        await client.from('tech_programme_configs').insert({
          ...meta,
          version_number: 1,
          name: p.name,
          start_date: p.start_date || p.start,
          duration_days: p.duration || p.durationDays,
          testing_prep_duration: p.testing_prep_duration ?? null,
          programme_support: p.programme_support ?? p.load ?? null,
          live_programme_support: p.live_programme_support ?? p.live_support_load ?? null,
          live_tech_load_scale: p.live_tech_load_scale ?? null,
          replaces_bau_tech: p.replaces_bau_tech ?? false,
          extra_settings: {},
        });
        fragmentsCreated++;
      } catch (e) {
        errors.push(`tech_programme_configs (${p.name}): ${errorMsg(e)}`);
      }
    }
  }

  // National leave bands
  if (Array.isArray(yamlObj.national_leave_bands)) {
    for (const b of yamlObj.national_leave_bands as Record<string, unknown>[]) {
      try {
        await client.from('national_leave_band_configs').insert({
          ...meta,
          version_number: 1,
          label: b.label ?? null,
          from_date: b.from,
          to_date: b.to,
          capacity_multiplier: b.capacity_multiplier ?? null,
          weeks: b.weeks ?? null,
          extra_settings: {},
        });
        fragmentsCreated++;
      } catch (e) {
        errors.push(`national_leave_band_configs: ${errorMsg(e)}`);
      }
    }
  }

  // Public holidays
  if (yamlObj.public_holidays) {
    try {
      const ph = yamlObj.public_holidays as Record<string, unknown>;
      const { data: cal } = await client.from('holiday_calendars').insert({
        ...meta,
        calendar_type: 'public',
        auto_import: ph.auto ?? false,
        staffing_multiplier: ph.staffing_multiplier ?? 1.0,
        trading_multiplier: ph.trading_multiplier ?? 1.0,
        load_effects: null,
        extra_settings: {},
      }).select().single();

      if (cal && Array.isArray(ph.dates)) {
        const entries = (ph.dates as string[]).map((d) => ({
          calendar_id: (cal as Record<string, unknown>).id,
          holiday_date: d,
        }));
        if (entries.length > 0) {
          await client.from('holiday_entries').insert(entries);
        }
      }
      fragmentsCreated++;
    } catch (e) {
      errors.push(`holiday_calendars (public): ${errorMsg(e)}`);
    }
  }

  // School holidays
  if (yamlObj.school_holidays) {
    try {
      const sh = yamlObj.school_holidays as Record<string, unknown>;
      const { data: cal } = await client.from('holiday_calendars').insert({
        ...meta,
        calendar_type: 'school',
        auto_import: sh.auto ?? false,
        staffing_multiplier: sh.staffing_multiplier ?? 1.0,
        trading_multiplier: sh.trading_multiplier ?? 1.0,
        load_effects: sh.load_effects ?? null,
        extra_settings: {},
      }).select().single();

      if (cal && Array.isArray(sh.dates)) {
        const entries = (sh.dates as string[]).map((d) => ({
          calendar_id: (cal as Record<string, unknown>).id,
          holiday_date: d,
        }));
        if (entries.length > 0) {
          await client.from('holiday_entries').insert(entries);
        }
      }
      fragmentsCreated++;
    } catch (e) {
      errors.push(`holiday_calendars (school): ${errorMsg(e)}`);
    }
  }

  // Trading
  if (yamlObj.trading) {
    try {
      const t = yamlObj.trading as Record<string, unknown>;
      await client.from('trading_configs').insert({
        ...meta,
        weekly_pattern: t.weekly_pattern ?? null,
        monthly_pattern: t.monthly_pattern ?? null,
        seasonal: t.seasonal ?? null,
        campaign_store_boost_prep: t.campaign_store_boost_prep ?? 0,
        campaign_store_boost_live: t.campaign_store_boost_live ?? 0.28,
        campaign_effect_scale: t.campaign_effect_scale ?? 1.0,
        payday_month_peak_multiplier: t.payday_month_peak_multiplier ?? 1.12,
        payday_month_knot_multipliers: t.payday_month_knot_multipliers ?? null,
        extra_settings: {},
      });
      fragmentsCreated++;
    } catch (e) {
      errors.push(`trading_configs: ${errorMsg(e)}`);
    }
  }

  // Deployment risk
  if (yamlObj.deployment_risk_events || yamlObj.deployment_risk_blackouts || yamlObj.deployment_risk_week_weight != null) {
    try {
      await client.from('deployment_risk_configs').insert({
        ...meta,
        deployment_risk_week_weight: yamlObj.deployment_risk_week_weight ?? null,
        deployment_risk_month_curve: yamlObj.deployment_risk_month_curve ?? null,
        deployment_risk_context_month_curve: yamlObj.deployment_risk_context_month_curve ?? null,
        deployment_resourcing_strain_weight: yamlObj.deployment_resourcing_strain_weight ?? null,
        events: yamlObj.deployment_risk_events ?? [],
        blackouts: yamlObj.deployment_risk_blackouts ?? [],
        extra_settings: {},
      });
      fragmentsCreated++;
    } catch (e) {
      errors.push(`deployment_risk_configs: ${errorMsg(e)}`);
    }
  }

  // Operating windows
  if (Array.isArray(yamlObj.operating_windows)) {
    for (const w of yamlObj.operating_windows as Record<string, unknown>[]) {
      try {
        await client.from('operating_window_configs').insert({
          ...meta,
          version_number: 1,
          name: w.name,
          start_date: w.start,
          end_date: w.end,
          multipliers: {
            store_pressure_mult: w.store_pressure_mult,
            lab_load_mult: w.lab_load_mult,
            team_load_mult: w.team_load_mult,
            backend_load_mult: w.backend_load_mult,
            ops_activity_mult: w.ops_activity_mult,
            commercial_activity_mult: w.commercial_activity_mult,
            lab_team_capacity_mult: w.lab_team_capacity_mult,
          },
          ramp_in_days: w.ramp_in_days ?? null,
          ramp_out_days: w.ramp_out_days ?? null,
          envelope: w.envelope ?? null,
          extra_settings: {},
        });
        fragmentsCreated++;
      } catch (e) {
        errors.push(`operating_window_configs: ${errorMsg(e)}`);
      }
    }
  }

  // Log the import
  await client.from('audit_events').insert({
    event_type: 'import_completed',
    actor_id: actorId,
    actor_email: actorEmail,
    operating_model_id: operatingModelId,
    segment_id: segmentId,
    market_id: marketId,
    target_type: 'yaml_import',
    details: {
      fragments_created: fragmentsCreated,
      warnings: warnings.length,
      errors: errors.length,
    },
  });

  return { marketId, fragmentsCreated, warnings, errors };
}

// ============================================================================
// Helpers
// ============================================================================

function extractHolidaySettings(yamlObj: Record<string, unknown>): Record<string, unknown> {
  const holidays = yamlObj.holidays as Record<string, unknown> | undefined;
  if (!holidays) return {};
  return {
    capacity_taper_days: holidays.capacity_taper_days ?? 0,
    lab_capacity_scale: holidays.lab_capacity_scale ?? 1.0,
  };
}

function errorMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
