/**
 * Seed all 17 market YAML files into Postgres config fragment tables.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-fragments.ts
 *
 * Reads .env.local automatically via dotenv-style loading in tsx.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Load .env.local manually
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const segmentsJson: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(root, 'public/data/segments.json'), 'utf-8')
);

const marketToSegment: Record<string, string> = {};
for (const [segId, mkts] of Object.entries(segmentsJson)) {
  for (const mkt of mkts) {
    marketToSegment[mkt] = segId;
  }
}

const marketsDir = path.join(root, 'public/data/markets');
const yamlFiles = fs.readdirSync(marketsDir).filter(f => f.endsWith('.yaml'));

console.log(`Found ${yamlFiles.length} YAML files to import\n`);

let totalFragments = 0;
let totalErrors = 0;

for (const file of yamlFiles) {
  const marketId = path.basename(file, '.yaml');
  const segmentId = marketToSegment[marketId];
  if (!segmentId) {
    console.error(`  ✗ ${marketId}: no segment mapping found`);
    totalErrors++;
    continue;
  }

  const content = fs.readFileSync(path.join(marketsDir, file), 'utf-8');
  const yamlObj = yaml.load(content) as Record<string, unknown>;

  const meta = {
    operating_model_id: 'operated_markets',
    segment_id: segmentId,
    market_id: marketId,
    status: 'active',
    version_number: 1,
    created_by: 'system_seed',
    updated_by: 'system_seed',
  };

  let frags = 0;
  const errors: string[] = [];

  // Market config
  const { error: mcErr } = await client.from('market_configs').insert({
    ...meta,
    title: yamlObj.title || marketId,
    description: yamlObj.description || null,
    holiday_settings: extractHolidaySettings(yamlObj),
    stress_correlations: yamlObj.stress_correlations || {},
    extra_settings: {},
  });
  if (mcErr) errors.push(`market_configs: ${mcErr.message}`);
  else frags++;

  // Resources
  if (yamlObj.resources) {
    const res = yamlObj.resources as Record<string, unknown>;
    const labs = res.labs as Record<string, unknown> | undefined;
    const staff = res.staff as Record<string, unknown> | undefined;
    const { error } = await client.from('resource_configs').insert({
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
    if (error) errors.push(`resource_configs: ${error.message}`);
    else frags++;
  }

  // BAU
  if (yamlObj.bau) {
    const bau = yamlObj.bau as Record<string, unknown>;
    const { error } = await client.from('bau_configs').insert({
      ...meta,
      days_in_use: bau.days_in_use ?? null,
      weekly_cycle: bau.weekly_cycle ?? null,
      market_it_weekly_load: bau.market_it_weekly_load ?? null,
      extra_settings: {},
    });
    if (error) errors.push(`bau_configs: ${error.message}`);
    else frags++;
  }

  // Campaigns
  if (Array.isArray(yamlObj.campaigns)) {
    for (const c of yamlObj.campaigns as Record<string, unknown>[]) {
      const { error } = await client.from('campaign_configs').insert({
        ...meta,
        name: c.name,
        start_date: c.start_date || c.start,
        duration_days: c.duration || c.durationDays,
        testing_prep_duration: c.testing_prep_duration ?? null,
        impact: c.impact ?? null,
        promo_weight: c.promo_weight ?? 1.0,
        live_tech_load_scale: c.live_tech_load_scale ?? null,
        campaign_support: c.campaign_support ?? null,
        live_campaign_support: c.live_campaign_support ?? null,
        replaces_bau_tech: c.replaces_bau_tech ?? false,
        presence_only: c.presence_only ?? false,
        stagger_functional_loads: c.stagger_functional_loads ?? false,
        stagger_settings: null,
        extra_settings: {},
      });
      if (error) errors.push(`campaign (${c.name}): ${error.message}`);
      else frags++;
    }
  }

  // Tech programmes
  if (Array.isArray(yamlObj.tech_programmes)) {
    for (const p of yamlObj.tech_programmes as Record<string, unknown>[]) {
      const { error } = await client.from('tech_programme_configs').insert({
        ...meta,
        name: p.name,
        start_date: p.start_date || p.start,
        duration_days: p.duration || p.durationDays,
        testing_prep_duration: p.testing_prep_duration ?? null,
        programme_support: p.programme_support ?? null,
        live_programme_support: p.live_programme_support ?? null,
        live_tech_load_scale: p.live_tech_load_scale ?? null,
        replaces_bau_tech: p.replaces_bau_tech ?? false,
        extra_settings: {},
      });
      if (error) errors.push(`tech_programme (${p.name}): ${error.message}`);
      else frags++;
    }
  }

  // National leave bands
  if (Array.isArray(yamlObj.national_leave_bands)) {
    for (const b of yamlObj.national_leave_bands as Record<string, unknown>[]) {
      const { error } = await client.from('national_leave_band_configs').insert({
        ...meta,
        label: b.label ?? null,
        from_date: b.from,
        to_date: b.to,
        capacity_multiplier: b.capacity_multiplier ?? null,
        weeks: b.weeks ?? null,
        extra_settings: {},
      });
      if (error) errors.push(`leave_band (${b.label}): ${error.message}`);
      else frags++;
    }
  }

  // Public holidays
  if (yamlObj.public_holidays) {
    const ph = yamlObj.public_holidays as Record<string, unknown>;
    const { data: cal, error: calErr } = await client.from('holiday_calendars').insert({
      ...meta,
      calendar_type: 'public',
      auto_import: ph.auto ?? false,
      staffing_multiplier: ph.staffing_multiplier ?? 1.0,
      trading_multiplier: ph.trading_multiplier ?? 1.0,
      load_effects: null,
      extra_settings: {},
    }).select().single();

    if (calErr) {
      errors.push(`holiday_calendars (public): ${calErr.message}`);
    } else if (cal && Array.isArray(ph.dates)) {
      const entries = (ph.dates as string[]).map(d => ({
        calendar_id: (cal as Record<string, unknown>).id,
        holiday_date: String(d),
      }));
      if (entries.length > 0) {
        const { error: entErr } = await client.from('holiday_entries').insert(entries);
        if (entErr) errors.push(`holiday_entries (public): ${entErr.message}`);
      }
      frags++;
    }
  }

  // School holidays
  if (yamlObj.school_holidays) {
    const sh = yamlObj.school_holidays as Record<string, unknown>;
    const { data: cal, error: calErr } = await client.from('holiday_calendars').insert({
      ...meta,
      calendar_type: 'school',
      auto_import: sh.auto ?? false,
      staffing_multiplier: sh.staffing_multiplier ?? 1.0,
      trading_multiplier: sh.trading_multiplier ?? 1.0,
      load_effects: sh.load_effects ?? null,
      extra_settings: {},
    }).select().single();

    if (calErr) {
      errors.push(`holiday_calendars (school): ${calErr.message}`);
    } else if (cal && Array.isArray(sh.dates)) {
      const entries = (sh.dates as string[]).map(d => ({
        calendar_id: (cal as Record<string, unknown>).id,
        holiday_date: String(d),
      }));
      if (entries.length > 0) {
        const { error: entErr } = await client.from('holiday_entries').insert(entries);
        if (entErr) errors.push(`holiday_entries (school): ${entErr.message}`);
      }
      frags++;
    }
  }

  // Trading
  if (yamlObj.trading) {
    const t = yamlObj.trading as Record<string, unknown>;
    const { error } = await client.from('trading_configs').insert({
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
    if (error) errors.push(`trading_configs: ${error.message}`);
    else frags++;
  }

  // Deployment risk
  if (yamlObj.deployment_risk_events || yamlObj.deployment_risk_blackouts || yamlObj.deployment_risk_week_weight != null) {
    const { error } = await client.from('deployment_risk_configs').insert({
      ...meta,
      deployment_risk_week_weight: yamlObj.deployment_risk_week_weight ?? null,
      deployment_risk_month_curve: yamlObj.deployment_risk_month_curve ?? null,
      deployment_risk_context_month_curve: yamlObj.deployment_risk_context_month_curve ?? null,
      deployment_resourcing_strain_weight: yamlObj.deployment_resourcing_strain_weight ?? null,
      events: yamlObj.deployment_risk_events ?? [],
      blackouts: yamlObj.deployment_risk_blackouts ?? [],
      extra_settings: {},
    });
    if (error) errors.push(`deployment_risk: ${error.message}`);
    else frags++;
  }

  // Operating windows
  if (Array.isArray(yamlObj.operating_windows)) {
    for (const w of yamlObj.operating_windows as Record<string, unknown>[]) {
      const { error } = await client.from('operating_window_configs').insert({
        ...meta,
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
      if (error) errors.push(`operating_window (${w.name}): ${error.message}`);
      else frags++;
    }
  }

  totalFragments += frags;
  totalErrors += errors.length;

  if (errors.length > 0) {
    console.log(`  ✗ ${marketId}: ${frags} fragments, ${errors.length} errors`);
    for (const e of errors) console.log(`    - ${e}`);
  } else {
    console.log(`  ✓ ${marketId}: ${frags} fragments`);
  }
}

console.log(`\nDone: ${totalFragments} fragments created, ${totalErrors} errors`);

function extractHolidaySettings(yamlObj: Record<string, unknown>): Record<string, unknown> {
  const holidays = yamlObj.holidays as Record<string, unknown> | undefined;
  if (!holidays) return {};
  return {
    capacity_taper_days: holidays.capacity_taper_days ?? 0,
    lab_capacity_scale: holidays.lab_capacity_scale ?? 1.0,
  };
}
