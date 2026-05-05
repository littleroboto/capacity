/**
 * Verify assembly round-trip: load fragments from Postgres, assemble into YAML object,
 * compare against the original YAML file for each market.
 *
 * Usage: npx tsx scripts/verify-assembly.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yamlLib from 'js-yaml';
import { createClient } from '@supabase/supabase-js';
import {
  datesCoveredByYamlRanges,
  expandHolidayBlockDates,
  normalizeStoredYamlHolidayRanges,
} from '../src/lib/holidayBlockDatesAndRanges';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Load .env.local
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const marketsDir = path.join(root, 'public/data/markets');
const yamlFiles = fs.readdirSync(marketsDir).filter(f => f.endsWith('.yaml'));

let pass = 0;
let fail = 0;

for (const file of yamlFiles) {
  const marketId = path.basename(file, '.yaml');

  // Load original YAML
  const originalContent = fs.readFileSync(path.join(marketsDir, file), 'utf-8');
  const original = yamlLib.load(originalContent) as Record<string, unknown>;
  normalizeHolidayBlocksForVerify(original);

  // Load fragments from Postgres
  const assembled = await loadAndAssemble(marketId);
  if (!assembled) {
    console.log(`  ✗ ${marketId}: could not load fragments`);
    fail++;
    continue;
  }

  // Normalize ordering for comparison
  normalizeArrayOrdering(original);
  normalizeArrayOrdering(assembled);

  // Compare
  const diffs = deepCompare(original, assembled, '');
  if (diffs.length === 0) {
    console.log(`  ✓ ${marketId}: exact match`);
    pass++;
  } else {
    const significant = diffs.filter(d => !isExpectedDiff(d));
    if (significant.length === 0) {
      console.log(`  ✓ ${marketId}: match (${diffs.length} expected differences)`);
      pass++;
    } else {
      console.log(`  △ ${marketId}: ${significant.length} unexpected differences`);
      for (const d of significant.slice(0, 5)) {
        console.log(`    ${d}`);
      }
      if (significant.length > 5) console.log(`    ... and ${significant.length - 5} more`);
      fail++;
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed out of ${yamlFiles.length} markets`);
process.exit(fail > 0 ? 1 : 0);

/** Merge `dates` + expanded `ranges`, drop `ranges` so compare matches assembly (`dates` only). */
function normalizeHolidayBlocksForVerify(obj: Record<string, unknown>): void {
  for (const key of ['public_holidays', 'school_holidays'] as const) {
    const b = obj[key];
    if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
    const block = { ...(b as Record<string, unknown>) };
    const exp = expandHolidayBlockDates(block);
    if (exp.dates && exp.dates.length > 0) {
      block.dates = exp.dates;
    }
    delete block.ranges;
    obj[key] = block;
  }
}

// ============================================================================
// Assembly (inline — avoids bundling the full service)
// ============================================================================

async function loadAndAssemble(marketId: string): Promise<Record<string, unknown> | null> {
  const { data: market } = await client.from('markets').select('*').eq('id', marketId).single();
  if (!market) return null;

  const [mc, rc, bc, cc, tp, phc, shc, lb, tc, drc, ow] = await Promise.all([
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

  const yaml: Record<string, unknown> = {};
  yaml.market = marketId;
  yaml.title = mc.data?.title ?? market.label;

  if (rc.data) {
    const r: Record<string, unknown> = {};
    if (rc.data.labs_capacity != null) r.labs = { capacity: rc.data.labs_capacity };
    if (rc.data.staff_capacity != null) {
      const s: Record<string, unknown> = { capacity: rc.data.staff_capacity };
      if (rc.data.staff_monthly_pattern_basis) s.monthly_pattern_basis = rc.data.staff_monthly_pattern_basis;
      if (rc.data.staff_monthly_pattern) s.monthly_pattern = rc.data.staff_monthly_pattern;
      r.staff = s;
    }
    if (rc.data.testing_capacity != null) r.testing_capacity = rc.data.testing_capacity;
    yaml.resources = r;
  }

  if (lb.data && lb.data.length > 0) {
    yaml.national_leave_bands = lb.data.map((b: Record<string, unknown>) => {
      const band: Record<string, unknown> = {
        label: b.label,
        from: b.from_date,
        to: b.to_date,
      };
      if (b.capacity_multiplier != null) band.capacity_multiplier = Number(b.capacity_multiplier);
      if (b.weeks) band.weeks = b.weeks;
      return band;
    });
  }

  if (bc.data) {
    const bau: Record<string, unknown> = {};
    if (bc.data.days_in_use) bau.days_in_use = bc.data.days_in_use;
    if (bc.data.weekly_cycle) bau.weekly_cycle = bc.data.weekly_cycle;
    if (bc.data.market_it_weekly_load) bau.market_it_weekly_load = bc.data.market_it_weekly_load;
    yaml.bau = bau;
  }

  if (cc.data && cc.data.length > 0) {
    yaml.campaigns = cc.data.map((c: Record<string, unknown>) => {
      const campaign: Record<string, unknown> = {
        name: c.name,
        start_date: c.start_date,
        duration: c.duration_days,
      };
      if (c.testing_prep_duration != null) campaign.testing_prep_duration = c.testing_prep_duration;
      if (c.impact) campaign.impact = c.impact;
      if (c.promo_weight != null) campaign.promo_weight = Number(c.promo_weight);
      if (c.live_tech_load_scale != null) campaign.live_tech_load_scale = Number(c.live_tech_load_scale);
      if (c.campaign_support) campaign.campaign_support = c.campaign_support;
      if (c.live_campaign_support) campaign.live_campaign_support = c.live_campaign_support;
      if (c.replaces_bau_tech) campaign.replaces_bau_tech = true;
      if (c.presence_only) campaign.presence_only = true;
      if (c.stagger_functional_loads) campaign.stagger_functional_loads = true;
      return campaign;
    });
  }

  if (tp.data && tp.data.length > 0) {
    yaml.tech_programmes = tp.data.map((p: Record<string, unknown>) => {
      const prog: Record<string, unknown> = {
        name: p.name,
        start_date: p.start_date,
        duration: p.duration_days,
      };
      if (p.testing_prep_duration != null) prog.testing_prep_duration = p.testing_prep_duration;
      if (p.programme_support) prog.programme_support = p.programme_support;
      if (p.live_programme_support) prog.live_programme_support = p.live_programme_support;
      if (p.live_tech_load_scale != null) prog.live_tech_load_scale = Number(p.live_tech_load_scale);
      if (p.replaces_bau_tech) prog.replaces_bau_tech = true;
      return prog;
    });
  }

  if (phc.data) {
    const entries = Array.isArray(phc.data.holiday_entries) ? phc.data.holiday_entries : [];
    const allEntryDates = entries.map((e: Record<string, unknown>) => String(e.holiday_date)).sort();
    const pub: Record<string, unknown> = {
      auto: phc.data.auto_import,
      staffing_multiplier: Number(phc.data.staffing_multiplier) || 1.0,
      trading_multiplier: Number(phc.data.trading_multiplier) || 1.0,
    };
    const extra = phc.data.extra_settings as Record<string, unknown> | undefined;
    const rangeList = extra?.yaml_public_ranges;
    const normalizedRanges = normalizeStoredYamlHolidayRanges(rangeList);
    if (normalizedRanges.length > 0) {
      pub.ranges = normalizedRanges;
    }
    const storedExplicit = extra?.yaml_public_dates;
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

  if (shc.data) {
    const entries = Array.isArray(shc.data.holiday_entries) ? shc.data.holiday_entries : [];
    const school: Record<string, unknown> = {
      auto: shc.data.auto_import,
      staffing_multiplier: Number(shc.data.staffing_multiplier) || 1.0,
      trading_multiplier: Number(shc.data.trading_multiplier) || 1.0,
    };
    if (shc.data.load_effects) school.load_effects = shc.data.load_effects;
    const extra = shc.data.extra_settings as Record<string, unknown> | undefined;
    const rangeList = extra?.yaml_school_ranges;
    if (Array.isArray(rangeList) && rangeList.length > 0) {
      school.ranges = rangeList;
    } else {
      school.dates = entries.map((e: Record<string, unknown>) => String(e.holiday_date)).sort();
    }
    yaml.school_holidays = school;
  }

  if (mc.data?.holiday_settings && Object.keys(mc.data.holiday_settings).length > 0) {
    const hs = mc.data.holiday_settings as Record<string, unknown>;
    if (hs.capacity_taper_days || hs.lab_capacity_scale) {
      yaml.holidays = hs;
    }
  }

  if (tc.data) {
    const trading: Record<string, unknown> = {};
    if (tc.data.weekly_pattern) trading.weekly_pattern = tc.data.weekly_pattern;
    if (tc.data.monthly_pattern) trading.monthly_pattern = tc.data.monthly_pattern;
    if (tc.data.seasonal) trading.seasonal = tc.data.seasonal;
    if (tc.data.campaign_store_boost_prep != null) trading.campaign_store_boost_prep = Number(tc.data.campaign_store_boost_prep);
    if (tc.data.campaign_store_boost_live != null) trading.campaign_store_boost_live = Number(tc.data.campaign_store_boost_live);
    if (tc.data.campaign_effect_scale != null) trading.campaign_effect_scale = Number(tc.data.campaign_effect_scale);
    if (tc.data.payday_month_peak_multiplier != null) trading.payday_month_peak_multiplier = Number(tc.data.payday_month_peak_multiplier);
    if (tc.data.payday_month_knot_multipliers) trading.payday_month_knot_multipliers = tc.data.payday_month_knot_multipliers;
    yaml.trading = trading;
  }

  if (mc.data?.stress_correlations && Object.keys(mc.data.stress_correlations).length > 0) {
    yaml.stress_correlations = mc.data.stress_correlations;
  }

  if (ow.data && ow.data.length > 0) {
    yaml.operating_windows = ow.data.map((w: Record<string, unknown>) => {
      const win: Record<string, unknown> = {
        name: w.name,
        start: w.start_date,
        end: w.end_date,
        ...(w.multipliers as Record<string, unknown>),
      };
      if (w.ramp_in_days != null) win.ramp_in_days = w.ramp_in_days;
      if (w.ramp_out_days != null) win.ramp_out_days = w.ramp_out_days;
      if (w.envelope) win.envelope = w.envelope;
      return win;
    });
  }

  if (drc.data) {
    if (drc.data.deployment_risk_week_weight != null)
      yaml.deployment_risk_week_weight = Number(drc.data.deployment_risk_week_weight);
    if (drc.data.deployment_risk_month_curve)
      yaml.deployment_risk_month_curve = drc.data.deployment_risk_month_curve;
    if (drc.data.deployment_risk_context_month_curve)
      yaml.deployment_risk_context_month_curve = drc.data.deployment_risk_context_month_curve;
    if (drc.data.deployment_resourcing_strain_weight != null)
      yaml.deployment_resourcing_strain_weight = Number(drc.data.deployment_resourcing_strain_weight);
    const events = drc.data.events as Record<string, unknown>[];
    if (events && events.length > 0) yaml.deployment_risk_events = events;
    const blackouts = drc.data.blackouts as Record<string, unknown>[];
    if (blackouts && blackouts.length > 0) yaml.deployment_risk_blackouts = blackouts;
  }

  return yaml;
}

// ============================================================================
// Array ordering normalization
// ============================================================================

function normalizeArrayOrdering(obj: Record<string, unknown>): void {
  if (Array.isArray(obj.campaigns)) {
    (obj.campaigns as Record<string, unknown>[]).sort((a, b) => {
      const da = String(a.start_date || a.start || '');
      const db = String(b.start_date || b.start || '');
      if (da !== db) return da.localeCompare(db);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }
  if (Array.isArray(obj.tech_programmes)) {
    (obj.tech_programmes as Record<string, unknown>[]).sort((a, b) => {
      const da = String(a.start_date || a.start || '');
      const db = String(b.start_date || b.start || '');
      if (da !== db) return da.localeCompare(db);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }
  if (Array.isArray(obj.national_leave_bands)) {
    (obj.national_leave_bands as Record<string, unknown>[]).sort((a, b) => {
      const da = String(a.from || '');
      const db = String(b.from || '');
      return da.localeCompare(db);
    });
  }
  if (Array.isArray(obj.deployment_risk_events)) {
    (obj.deployment_risk_events as Record<string, unknown>[]).sort((a, b) =>
      String(a.start || '').localeCompare(String(b.start || ''))
    );
  }
  if (Array.isArray(obj.deployment_risk_blackouts)) {
    (obj.deployment_risk_blackouts as Record<string, unknown>[]).sort((a, b) =>
      String(a.start || '').localeCompare(String(b.start || ''))
    );
  }
}

// ============================================================================
// Deep compare
// ============================================================================

function deepCompare(a: unknown, b: unknown, path: string): string[] {
  if (a === b) return [];
  if (a == null && b == null) return [];

  const typeA = typeof a;
  const typeB = typeof b;

  // Numeric comparison with tolerance
  if (typeA === 'number' && typeB === 'number') {
    if (Math.abs((a as number) - (b as number)) < 0.001) return [];
    return [`${path}: ${a} ≠ ${b}`];
  }

  // String↔number (YAML parses "1.0" as number, Postgres may return string)
  if ((typeA === 'number' && typeB === 'string') || (typeA === 'string' && typeB === 'number')) {
    if (Math.abs(Number(a) - Number(b)) < 0.001) return [];
    return [`${path}: ${a} (${typeA}) ≠ ${b} (${typeB})`];
  }

  // Date string normalization (YYYY-MM-DD)
  if (typeA === 'string' && typeB === 'string') {
    const sa = (a as string).trim();
    const sb = (b as string).trim();
    if (sa === sb) return [];
    // Date format difference (2026-04-13 vs 2026-04-13T00:00:00)
    if (sa.slice(0, 10) === sb.slice(0, 10) && (sa.length === 10 || sb.length === 10)) return [];
    return [`${path}: "${sa}" ≠ "${sb}"`];
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const diffs: string[] = [];
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= a.length) { diffs.push(`${path}[${i}]: missing in original`); continue; }
      if (i >= b.length) { diffs.push(`${path}[${i}]: missing in assembled`); continue; }
      diffs.push(...deepCompare(a[i], b[i], `${path}[${i}]`));
    }
    return diffs;
  }

  if (typeA === 'object' && typeB === 'object' && a !== null && b !== null) {
    const diffs: string[] = [];
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of allKeys) {
      const av = aObj[key];
      const bv = bObj[key];
      if (av === undefined && bv !== undefined) {
        diffs.push(`${path}.${key}: only in assembled`);
      } else if (av !== undefined && bv === undefined) {
        diffs.push(`${path}.${key}: only in original`);
      } else {
        diffs.push(...deepCompare(av, bv, `${path}.${key}`));
      }
    }
    return diffs;
  }

  if (typeA !== typeB) {
    return [`${path}: type ${typeA} ≠ ${typeB}`];
  }

  return [`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
}

function isExpectedDiff(diff: string): boolean {
  // Default values that the import adds
  if (diff.includes('only in assembled') && (
    diff.includes('campaign_store_boost_prep') ||
    diff.includes('campaign_store_boost_live') ||
    diff.includes('campaign_effect_scale') ||
    diff.includes('payday_month_peak_multiplier') ||
    diff.includes('staffing_multiplier') ||
    diff.includes('trading_multiplier')
  )) return true;

  // Holiday settings with all-zero defaults
  if (diff.includes('holidays') && diff.includes('only in')) return true;

  // Boolean false vs undefined
  if (diff.includes('only in original') && (
    diff.includes('replaces_bau_tech') ||
    diff.includes('presence_only') ||
    diff.includes('stagger_functional_loads')
  )) return true;

  return false;
}
