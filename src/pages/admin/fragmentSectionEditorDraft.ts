/**
 * Draft models + patch builders for admin full-section editors (maps to assembled YAML).
 */
import {
  BAU_INTENSITY_DAY_KEYS,
  BAU_WEEKDAY_CODES,
  parseJsonArray,
  parseJsonObject,
  parseOptionalFloat,
  parseOptionalInt,
  parseRequiredInt,
  readRowArray,
  readRowBool,
  readRowNum,
  readRowObject,
  readRowString,
  stringifyJson,
} from '@/pages/admin/fragmentSectionEditorUtils';

export const FRAGMENT_FULL_EDITOR_TABLES = new Set<string>([
  'bau_configs',
  'resource_configs',
  'trading_configs',
  'campaign_configs',
  'tech_programme_configs',
  'national_leave_band_configs',
  'deployment_risk_configs',
  'operating_window_configs',
]);

export type SectionDraft =
  | {
      kind: 'bau_configs';
      days: string[];
      weeklyLabs: string;
      weeklyStaff: string;
      weeklySupport: string;
      intensity: Record<string, string>;
    }
  | {
      kind: 'resource_configs';
      labs: string;
      staff: string;
      testing: string;
      basis: string;
      staffMonthlyJson: string;
      labsMonthlyJson: string;
      techPatternJson: string;
    }
  | {
      kind: 'trading_configs';
      boostPrep: string;
      boostLive: string;
      effectScale: string;
      paydayPeak: string;
      weeklyJson: string;
      monthlyJson: string;
      seasonalJson: string;
      paydayKnotsJson: string;
    }
  | {
      kind: 'campaign_configs';
      name: string;
      startDate: string;
      durationDays: string;
      testingPrep: string;
      impact: string;
      promoWeight: string;
      liveTechScale: string;
      campaignSupportJson: string;
      liveCampaignSupportJson: string;
      replacesBau: boolean;
      presenceOnly: boolean;
      staggerLoads: boolean;
      staggerSettingsJson: string;
    }
  | {
      kind: 'tech_programme_configs';
      name: string;
      startDate: string;
      durationDays: string;
      testingPrep: string;
      liveTechScale: string;
      programmeSupportJson: string;
      liveProgrammeSupportJson: string;
      replacesBau: boolean;
    }
  | {
      kind: 'national_leave_band_configs';
      label: string;
      fromDate: string;
      toDate: string;
      multiplier: string;
      weeksJson: string;
    }
  | {
      kind: 'deployment_risk_configs';
      weekWeight: string;
      strainWeight: string;
      monthCurveJson: string;
      contextMonthCurveJson: string;
      eventsJson: string;
      blackoutsJson: string;
    }
  | {
      kind: 'operating_window_configs';
      name: string;
      startDate: string;
      endDate: string;
      multipliersJson: string;
      rampIn: string;
      rampOut: string;
      envelope: string;
    };

export function buildDraft(table: string, row: Record<string, unknown>): SectionDraft | null {
  switch (table) {
    case 'bau_configs':
      return buildBauDraft(row);
    case 'resource_configs':
      return buildResourceDraft(row);
    case 'trading_configs':
      return buildTradingDraft(row);
    case 'campaign_configs':
      return buildCampaignDraft(row);
    case 'tech_programme_configs':
      return buildTechDraft(row);
    case 'national_leave_band_configs':
      return buildLeaveDraft(row);
    case 'deployment_risk_configs':
      return buildRiskDraft(row);
    case 'operating_window_configs':
      return buildWindowDraft(row);
    default:
      return null;
  }
}

function buildBauDraft(row: Record<string, unknown>): SectionDraft {
  const rawDays = readRowArray<string>(row, 'days_in_use');
  const days = (rawDays ?? []).filter((d) => BAU_WEEKDAY_CODES.includes(d as (typeof BAU_WEEKDAY_CODES)[number]));
  const wc = readRowObject(row, 'weekly_cycle');
  const mit = readRowObject(row, 'market_it_weekly_load');
  const wi = mit ? readRowObject(mit, 'weekday_intensity') : null;
  const intensity: Record<string, string> = {};
  for (const k of BAU_INTENSITY_DAY_KEYS) {
    const v = wi?.[k];
    intensity[k] = v == null || v === '' ? '' : String(v);
  }
  return {
    kind: 'bau_configs',
    days,
    weeklyLabs: wc ? String(wc.labs_required ?? wc.labsRequired ?? '') : '',
    weeklyStaff: wc ? String(wc.staff_required ?? wc.staffRequired ?? '') : '',
    weeklySupport: wc ? String(wc.support_days ?? wc.supportDays ?? '') : '',
    intensity,
  };
}

function buildResourceDraft(row: Record<string, unknown>): SectionDraft {
  const lc = readRowNum(row, 'labs_capacity', 'labsCapacity');
  const sc = readRowNum(row, 'staff_capacity', 'staffCapacity');
  const tc = readRowNum(row, 'testing_capacity', 'testingCapacity');
  const basis = readRowString(row, 'staff_monthly_pattern_basis', 'staffMonthlyPatternBasis');
  const smp = row.staff_monthly_pattern ?? row.staffMonthlyPattern;
  const lmp = row.labs_monthly_pattern ?? row.labsMonthlyPattern;
  const tap = row.tech_available_capacity_pattern ?? row.techAvailableCapacityPattern;
  return {
    kind: 'resource_configs',
    labs: lc == null ? '' : String(lc),
    staff: sc == null ? '' : String(sc),
    testing: tc == null ? '' : String(tc),
    basis: basis || '',
    staffMonthlyJson: stringifyJson(smp, '{\n  \n}'),
    labsMonthlyJson: stringifyJson(lmp, '{\n  \n}'),
    techPatternJson: stringifyJson(tap, '{\n  \n}'),
  };
}

function buildTradingDraft(row: Record<string, unknown>): SectionDraft {
  return {
    kind: 'trading_configs',
    boostPrep: String(readRowNum(row, 'campaign_store_boost_prep', 'campaignStoreBoostPrep') ?? ''),
    boostLive: String(readRowNum(row, 'campaign_store_boost_live', 'campaignStoreBoostLive') ?? ''),
    effectScale: String(readRowNum(row, 'campaign_effect_scale', 'campaignEffectScale') ?? ''),
    paydayPeak: String(readRowNum(row, 'payday_month_peak_multiplier', 'paydayMonthPeakMultiplier') ?? ''),
    weeklyJson: stringifyJson(row.weekly_pattern ?? row.weeklyPattern, '{\n  \n}'),
    monthlyJson: stringifyJson(row.monthly_pattern ?? row.monthlyPattern, '{\n  \n}'),
    seasonalJson: stringifyJson(row.seasonal, '{\n  \n}'),
    paydayKnotsJson: stringifyJson(row.payday_month_knot_multipliers ?? row.paydayMonthKnotMultipliers, '[\n  \n]'),
  };
}

function buildCampaignDraft(row: Record<string, unknown>): SectionDraft {
  return {
    kind: 'campaign_configs',
    name: readRowString(row, 'name'),
    startDate: readRowString(row, 'start_date', 'startDate'),
    durationDays: String(readRowNum(row, 'duration_days', 'durationDays') ?? ''),
    testingPrep: String(readRowNum(row, 'testing_prep_duration', 'testingPrepDuration') ?? ''),
    impact: readRowString(row, 'impact'),
    promoWeight: String(readRowNum(row, 'promo_weight', 'promoWeight') ?? ''),
    liveTechScale: String(readRowNum(row, 'live_tech_load_scale', 'liveTechLoadScale') ?? ''),
    campaignSupportJson: stringifyJson(row.campaign_support ?? row.campaignSupport, '{\n  \n}'),
    liveCampaignSupportJson: stringifyJson(row.live_campaign_support ?? row.liveCampaignSupport, '{\n  \n}'),
    replacesBau: readRowBool(row, 'replaces_bau_tech', 'replacesBauTech'),
    presenceOnly: readRowBool(row, 'presence_only', 'presenceOnly'),
    staggerLoads: readRowBool(row, 'stagger_functional_loads', 'staggerFunctionalLoads'),
    staggerSettingsJson: stringifyJson(row.stagger_settings ?? row.staggerSettings, '{\n  \n}'),
  };
}

function buildTechDraft(row: Record<string, unknown>): SectionDraft {
  return {
    kind: 'tech_programme_configs',
    name: readRowString(row, 'name'),
    startDate: readRowString(row, 'start_date', 'startDate'),
    durationDays: String(readRowNum(row, 'duration_days', 'durationDays') ?? ''),
    testingPrep: String(readRowNum(row, 'testing_prep_duration', 'testingPrepDuration') ?? ''),
    liveTechScale: String(readRowNum(row, 'live_tech_load_scale', 'liveTechLoadScale') ?? ''),
    programmeSupportJson: stringifyJson(row.programme_support ?? row.programmeSupport, '{\n  \n}'),
    liveProgrammeSupportJson: stringifyJson(row.live_programme_support ?? row.liveProgrammeSupport, '{\n  \n}'),
    replacesBau: readRowBool(row, 'replaces_bau_tech', 'replacesBauTech'),
  };
}

function buildLeaveDraft(row: Record<string, unknown>): SectionDraft {
  return {
    kind: 'national_leave_band_configs',
    label: readRowString(row, 'label'),
    fromDate: readRowString(row, 'from_date', 'fromDate'),
    toDate: readRowString(row, 'to_date', 'toDate'),
    multiplier: String(readRowNum(row, 'capacity_multiplier', 'capacityMultiplier') ?? ''),
    weeksJson: stringifyJson(row.weeks, '[\n  \n]'),
  };
}

function buildRiskDraft(row: Record<string, unknown>): SectionDraft {
  return {
    kind: 'deployment_risk_configs',
    weekWeight: String(readRowNum(row, 'deployment_risk_week_weight', 'deploymentRiskWeekWeight') ?? ''),
    strainWeight: String(readRowNum(row, 'deployment_resourcing_strain_weight', 'deploymentResourcingStrainWeight') ?? ''),
    monthCurveJson: stringifyJson(row.deployment_risk_month_curve ?? row.deploymentRiskMonthCurve, '{\n  \n}'),
    contextMonthCurveJson: stringifyJson(
      row.deployment_risk_context_month_curve ?? row.deploymentRiskContextMonthCurve,
      '{\n  \n}'
    ),
    eventsJson: stringifyJson(row.events, '[\n  \n]'),
    blackoutsJson: stringifyJson(row.blackouts, '[\n  \n]'),
  };
}

function buildWindowDraft(row: Record<string, unknown>): SectionDraft {
  return {
    kind: 'operating_window_configs',
    name: readRowString(row, 'name'),
    startDate: readRowString(row, 'start_date', 'startDate'),
    endDate: readRowString(row, 'end_date', 'endDate'),
    multipliersJson: stringifyJson(row.multipliers, '{\n  \n}'),
    rampIn: String(readRowNum(row, 'ramp_in_days', 'rampInDays') ?? ''),
    rampOut: String(readRowNum(row, 'ramp_out_days', 'rampOutDays') ?? ''),
    envelope: readRowString(row, 'envelope'),
  };
}

export type PatchResult = { ok: true; patch: Record<string, unknown> } | { ok: false; error: string };

export function patchFromDraft(d: SectionDraft): PatchResult {
  switch (d.kind) {
    case 'bau_configs':
      return patchBau(d);
    case 'resource_configs':
      return patchResource(d);
    case 'trading_configs':
      return patchTrading(d);
    case 'campaign_configs':
      return patchCampaign(d);
    case 'tech_programme_configs':
      return patchTech(d);
    case 'national_leave_band_configs':
      return patchLeave(d);
    case 'deployment_risk_configs':
      return patchRisk(d);
    case 'operating_window_configs':
      return patchWindow(d);
    default:
      return { ok: false, error: 'Unknown section' };
  }
}

function patchBau(d: SectionDraft & { kind: 'bau_configs' }): PatchResult {
  const labsR = parseOptionalInt(d.weeklyLabs, 'Weekly labs_required');
  if (!labsR.ok) return labsR;
  const staffR = parseOptionalInt(d.weeklyStaff, 'Weekly staff_required');
  if (!staffR.ok) return staffR;
  const supp = parseOptionalInt(d.weeklySupport, 'Weekly support_days');
  if (!supp.ok) return supp;

  const weekly_cycle: Record<string, number> = {};
  if (labsR.value != null) weekly_cycle.labs_required = labsR.value;
  if (staffR.value != null) weekly_cycle.staff_required = staffR.value;
  if (supp.value != null) weekly_cycle.support_days = supp.value;

  const weekday_intensity: Record<string, number> = {};
  for (const k of BAU_INTENSITY_DAY_KEYS) {
    const t = d.intensity[k]?.trim() ?? '';
    if (!t) continue;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n)) return { ok: false, error: `Intensity ${k} must be a number` };
    weekday_intensity[k] = n;
  }

  const market_it_weekly_load =
    Object.keys(weekday_intensity).length > 0 ? { weekday_intensity } : null;

  return {
    ok: true,
    patch: {
      days_in_use: d.days.length > 0 ? d.days : null,
      weekly_cycle: Object.keys(weekly_cycle).length > 0 ? weekly_cycle : null,
      market_it_weekly_load,
    },
  };
}

function patchResource(d: SectionDraft & { kind: 'resource_configs' }): PatchResult {
  const labs = parseOptionalInt(d.labs, 'Labs capacity');
  if (!labs.ok) return labs;
  const staff = parseOptionalInt(d.staff, 'Staff capacity');
  if (!staff.ok) return staff;
  const testing = parseOptionalInt(d.testing, 'Testing capacity');
  if (!testing.ok) return testing;

  const staffM = parseJsonObject(d.staffMonthlyJson, 'Staff monthly_pattern');
  if (!staffM.ok) return staffM;
  const labsM = parseJsonObject(d.labsMonthlyJson, 'Labs monthly_pattern');
  if (!labsM.ok) return labsM;
  const techP = parseJsonObject(d.techPatternJson, 'Tech available pattern');
  if (!techP.ok) return techP;

  const basis = d.basis.trim();
  return {
    ok: true,
    patch: {
      labs_capacity: labs.value,
      staff_capacity: staff.value,
      testing_capacity: testing.value,
      staff_monthly_pattern_basis: basis === 'absolute' || basis === 'multiplier' ? basis : null,
      staff_monthly_pattern: Object.keys(staffM.value).length > 0 ? staffM.value : null,
      labs_monthly_pattern: Object.keys(labsM.value).length > 0 ? labsM.value : null,
      tech_available_capacity_pattern: Object.keys(techP.value).length > 0 ? techP.value : null,
    },
  };
}

function patchTrading(d: SectionDraft & { kind: 'trading_configs' }): PatchResult {
  const bp = parseOptionalFloat(d.boostPrep, 'campaign_store_boost_prep');
  if (!bp.ok) return bp;
  const bl = parseOptionalFloat(d.boostLive, 'campaign_store_boost_live');
  if (!bl.ok) return bl;
  const es = parseOptionalFloat(d.effectScale, 'campaign_effect_scale');
  if (!es.ok) return es;
  const pp = parseOptionalFloat(d.paydayPeak, 'payday_month_peak_multiplier');
  if (!pp.ok) return pp;

  const w = parseJsonObject(d.weeklyJson, 'weekly_pattern');
  if (!w.ok) return w;
  const m = parseJsonObject(d.monthlyJson, 'monthly_pattern');
  if (!m.ok) return m;
  const s = parseJsonObject(d.seasonalJson, 'seasonal');
  if (!s.ok) return s;
  const knots = parseJsonArray(d.paydayKnotsJson, 'payday_month_knot_multipliers');
  if (!knots.ok) return knots;

  return {
    ok: true,
    patch: {
      campaign_store_boost_prep: bp.value,
      campaign_store_boost_live: bl.value,
      campaign_effect_scale: es.value,
      payday_month_peak_multiplier: pp.value,
      weekly_pattern: Object.keys(w.value).length > 0 ? w.value : null,
      monthly_pattern: Object.keys(m.value).length > 0 ? m.value : null,
      seasonal: Object.keys(s.value).length > 0 ? s.value : null,
      payday_month_knot_multipliers: knots.value.length > 0 ? knots.value : null,
    },
  };
}

function patchCampaign(d: SectionDraft & { kind: 'campaign_configs' }): PatchResult {
  if (!d.name.trim()) return { ok: false, error: 'Name is required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate.trim())) return { ok: false, error: 'Start date must be YYYY-MM-DD' };
  const dur = parseRequiredInt(d.durationDays, 'Duration (days)');
  if (!dur.ok) return dur;
  const prep = parseOptionalInt(d.testingPrep, 'Testing prep duration');
  if (!prep.ok) return prep;
  const pw = parseOptionalFloat(d.promoWeight, 'Promo weight');
  if (!pw.ok) return pw;
  const lt = parseOptionalFloat(d.liveTechScale, 'Live tech load scale');
  if (!lt.ok) return lt;

  const cs = parseJsonObject(d.campaignSupportJson, 'campaign_support');
  if (!cs.ok) return cs;
  const ls = parseJsonObject(d.liveCampaignSupportJson, 'live_campaign_support');
  if (!ls.ok) return ls;
  const st = parseJsonObject(d.staggerSettingsJson, 'stagger_settings');
  if (!st.ok) return st;

  const impact = d.impact.trim();
  return {
    ok: true,
    patch: {
      name: d.name.trim(),
      start_date: d.startDate.trim(),
      duration_days: dur.value,
      testing_prep_duration: prep.value,
      impact: impact === '' ? null : impact,
      promo_weight: pw.value,
      live_tech_load_scale: lt.value,
      campaign_support: Object.keys(cs.value).length > 0 ? cs.value : null,
      live_campaign_support: Object.keys(ls.value).length > 0 ? ls.value : null,
      replaces_bau_tech: d.replacesBau,
      presence_only: d.presenceOnly,
      stagger_functional_loads: d.staggerLoads,
      stagger_settings: Object.keys(st.value).length > 0 ? st.value : null,
    },
  };
}

function patchTech(d: SectionDraft & { kind: 'tech_programme_configs' }): PatchResult {
  if (!d.name.trim()) return { ok: false, error: 'Name is required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate.trim())) return { ok: false, error: 'Start date must be YYYY-MM-DD' };
  const dur = parseRequiredInt(d.durationDays, 'Duration (days)');
  if (!dur.ok) return dur;
  const prep = parseOptionalInt(d.testingPrep, 'Testing prep duration');
  if (!prep.ok) return prep;
  const lt = parseOptionalFloat(d.liveTechScale, 'Live tech load scale');
  if (!lt.ok) return lt;

  const ps = parseJsonObject(d.programmeSupportJson, 'programme_support');
  if (!ps.ok) return ps;
  const ls = parseJsonObject(d.liveProgrammeSupportJson, 'live_programme_support');
  if (!ls.ok) return ls;

  return {
    ok: true,
    patch: {
      name: d.name.trim(),
      start_date: d.startDate.trim(),
      duration_days: dur.value,
      testing_prep_duration: prep.value,
      live_tech_load_scale: lt.value,
      programme_support: Object.keys(ps.value).length > 0 ? ps.value : null,
      live_programme_support: Object.keys(ls.value).length > 0 ? ls.value : null,
      replaces_bau_tech: d.replacesBau,
    },
  };
}

function patchLeave(d: SectionDraft & { kind: 'national_leave_band_configs' }): PatchResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fromDate.trim())) return { ok: false, error: 'From date must be YYYY-MM-DD' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.toDate.trim())) return { ok: false, error: 'To date must be YYYY-MM-DD' };
  const mult = parseOptionalFloat(d.multiplier, 'capacity_multiplier');
  if (!mult.ok) return mult;
  const weeks = parseJsonArray(d.weeksJson, 'weeks');
  if (!weeks.ok) return weeks;

  return {
    ok: true,
    patch: {
      label: d.label.trim() || null,
      from_date: d.fromDate.trim(),
      to_date: d.toDate.trim(),
      capacity_multiplier: mult.value,
      weeks: weeks.value.length > 0 ? weeks.value : null,
    },
  };
}

function patchRisk(d: SectionDraft & { kind: 'deployment_risk_configs' }): PatchResult {
  const ww = parseOptionalFloat(d.weekWeight, 'deployment_risk_week_weight');
  if (!ww.ok) return ww;
  const sw = parseOptionalFloat(d.strainWeight, 'deployment_resourcing_strain_weight');
  if (!sw.ok) return sw;

  const mc = parseJsonObject(d.monthCurveJson, 'deployment_risk_month_curve');
  if (!mc.ok) return mc;
  const cc = parseJsonObject(d.contextMonthCurveJson, 'deployment_risk_context_month_curve');
  if (!cc.ok) return cc;
  const ev = parseJsonArray(d.eventsJson, 'events');
  if (!ev.ok) return ev;
  const bl = parseJsonArray(d.blackoutsJson, 'blackouts');
  if (!bl.ok) return bl;

  return {
    ok: true,
    patch: {
      deployment_risk_week_weight: ww.value,
      deployment_resourcing_strain_weight: sw.value,
      deployment_risk_month_curve: Object.keys(mc.value).length > 0 ? mc.value : null,
      deployment_risk_context_month_curve: Object.keys(cc.value).length > 0 ? cc.value : null,
      events: ev.value,
      blackouts: bl.value,
    },
  };
}

function patchWindow(d: SectionDraft & { kind: 'operating_window_configs' }): PatchResult {
  if (!d.name.trim()) return { ok: false, error: 'Name is required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate.trim())) return { ok: false, error: 'Start must be YYYY-MM-DD' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.endDate.trim())) return { ok: false, error: 'End must be YYYY-MM-DD' };

  const mult = parseJsonObject(d.multipliersJson, 'multipliers');
  if (!mult.ok) return mult;
  const ri = parseOptionalInt(d.rampIn, 'ramp_in_days');
  if (!ri.ok) return ri;
  const ro = parseOptionalInt(d.rampOut, 'ramp_out_days');
  if (!ro.ok) return ro;

  const env = d.envelope.trim();
  const envelope =
    env === 'smoothstep' || env === 'linear' || env === 'step' ? env : null;

  return {
    ok: true,
    patch: {
      name: d.name.trim(),
      start_date: d.startDate.trim(),
      end_date: d.endDate.trim(),
      multipliers: mult.value,
      ramp_in_days: ri.value,
      ramp_out_days: ro.value,
      envelope,
    },
  };
}
