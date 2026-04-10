import { weekdayDeploymentShape01, yearEndWeekBlockRamp01 } from '@/engine/deploymentRiskModel';
import { parseDate } from '@/engine/calendar';
import { getStubPublicHolidayName } from '@/engine/holidayCalc';
import type { RiskRow } from '@/engine/riskModel';
import { normalizedRiskWeights, type RiskModelTuning } from '@/engine/riskModelTuning';
import type { BauEntry, MarketConfig } from '@/engine/types';
import type { ViewModeId } from '@/lib/constants';
import { inStoreHeatmapMetric, technologyCapacityConsumedHeatmapMetric } from '@/lib/runwayViewMetrics';
import { STORE_PRESSURE_MAX } from '@/engine/riskModelTuning';
import { TRADING_MONTH_KEYS } from '@/lib/tradingMonthlyDsl';
import { parseTechRhythmScalar } from '@/engine/techWeeklyPattern';
import { lensHeatmapBlendCaption } from '@/lib/lensCopy';
import { buildDriverSummaryBlocks, type RunwayDriverBlock } from '@/lib/runwayScoreSummary';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function dateInInclusiveWindow(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function bauList(config: MarketConfig | undefined): BauEntry[] {
  if (!config?.bau) return [];
  return Array.isArray(config.bau) ? config.bau : [config.bau];
}

/** Campaigns whose interval contains `dateStr` (ISO day). */
export function activeCampaignNames(config: MarketConfig | undefined, dateStr: string): string[] {
  if (!config?.campaigns?.length) return [];
  const t = parseDate(dateStr);
  const out: string[] = [];
  for (const c of config.campaigns) {
    if (!c.start) continue;
    const start = parseDate(c.start);
    const prepDays = c.prepBeforeLiveDays;
    if (prepDays != null && prepDays > 0) {
      const prepStart = new Date(start);
      prepStart.setDate(prepStart.getDate() - prepDays);
      const liveEnd = new Date(start);
      liveEnd.setDate(liveEnd.getDate() + c.durationDays);
      const inPrep = t >= prepStart && t < start;
      const inLive = c.durationDays > 0 && t >= start && t < liveEnd;
        if (inPrep || inLive) {
        let tag: string;
        if (c.presenceOnly) tag = 'on calendar only';
        else if (inPrep) tag = `prep, ${prepDays} days before go-live`;
        else tag = 'live';
        out.push(`${c.name.replace(/_/g, ' ')} (${tag})`);
      }
      continue;
    }
    if (!c.durationDays) continue;
    const end = new Date(start);
    end.setDate(end.getDate() + c.durationDays);
    if (t >= start && t < end) {
      let tag: string;
      if (c.presenceOnly) tag = 'on calendar only';
      else if (c.readinessDurationDays != null) tag = `${c.readinessDurationDays}d readiness then live`;
      else tag = 'active';
      out.push(`${c.name.replace(/_/g, ' ')} (${tag})`);
    }
  }
  return out;
}

/** Scheduled tech-only programmes (infra / POS / patching) whose window contains `dateStr`. */
export function activeTechProgrammeNames(config: MarketConfig | undefined, dateStr: string): string[] {
  if (!config?.techProgrammes?.length) return [];
  const t = parseDate(dateStr);
  const out: string[] = [];
  for (const tp of config.techProgrammes) {
    if (!tp.start) continue;
    const start = parseDate(tp.start);
    const prepDays = tp.prepBeforeLiveDays;
    if (prepDays != null && prepDays > 0) {
      const prepStart = new Date(start);
      prepStart.setDate(prepStart.getDate() - prepDays);
      const liveEnd = new Date(start);
      liveEnd.setDate(liveEnd.getDate() + tp.durationDays);
      const inPrep = t >= prepStart && t < start;
      const inLive = tp.durationDays > 0 && t >= start && t < liveEnd;
      if (inPrep || inLive) {
        const tag = inPrep ? `prep, ${prepDays} days before go-live` : 'live';
        out.push(`${tp.name.replace(/_/g, ' ')} (${tag}, tech only — no marketing uplift)`);
      }
      continue;
    }
    if (!tp.durationDays) continue;
    const end = new Date(start);
    end.setDate(end.getDate() + tp.durationDays);
    if (t >= start && t < end) {
      const tag =
        tp.readinessDurationDays != null
          ? `${tp.readinessDurationDays}d readiness then sustain`
          : 'active';
      out.push(`${tp.name.replace(/_/g, ' ')} (${tag}, tech only — no marketing uplift)`);
    }
  }
  return out;
}

export function activeOperatingWindowSummaries(
  config: MarketConfig | undefined,
  dateStr: string
): string[] {
  if (!config?.operatingWindows?.length) return [];
  const out: string[] = [];
  for (const w of config.operatingWindows) {
    if (!dateInInclusiveWindow(dateStr, w.start, w.end)) continue;
    const bits: string[] = [];
    if (w.lab_load_mult != null && w.lab_load_mult !== 1) bits.push(`lab load ×${w.lab_load_mult}`);
    if (w.team_load_mult != null && w.team_load_mult !== 1) bits.push(`Market IT load ×${w.team_load_mult}`);
    if (w.backend_load_mult != null && w.backend_load_mult !== 1) bits.push(`backend ×${w.backend_load_mult}`);
    if (w.store_pressure_mult != null && w.store_pressure_mult !== 1) bits.push(`store ×${w.store_pressure_mult}`);
    if (w.lab_team_capacity_mult != null && w.lab_team_capacity_mult !== 1) {
      bits.push(`lab / Market IT cap ×${w.lab_team_capacity_mult}`);
    }
    out.push(bits.length ? `${w.name.replace(/_/g, ' ')} · ${bits.join(' · ')}` : w.name.replace(/_/g, ' '));
  }
  return out;
}

export function bauActivityLabels(config: MarketConfig | undefined, dateStr: string): string[] {
  const weekday = parseDate(dateStr).getDay();
  const list = bauList(config);
  const labels: string[] = [];
  for (const bau of list) {
    if (weekday === bau.weekday) {
      labels.push(`${bau.name.replace(/_/g, ' ')} (peak day)`);
    }
    if (
      bau.supportStart != null &&
      bau.supportEnd != null &&
      weekday >= bau.supportStart &&
      weekday <= bau.supportEnd &&
      !(weekday === bau.weekday)
    ) {
      labels.push(`${bau.name.replace(/_/g, ' ')} (support window)`);
    }
  }
  return labels;
}

export function storeTradingLine(config: MarketConfig | undefined, dateStr: string): string | null {
  const weekly = config?.trading?.weekly_pattern as Record<string, unknown> | undefined;
  if (!weekly) return null;
  const d = parseDate(dateStr);
  const dayName = DAY_NAMES[d.getDay()];
  const level = weekly[dayName];
  if (level == null) return null;
  const v = parseTechRhythmScalar(level) ?? 0.5;
  const pretty =
    typeof level === 'number' ? level.toFixed(2) : String(level).replace(/_/g, ' ');
  return `${dayName} in the weekly pattern (${pretty}) → about ${(v * 100).toFixed(0)}% base store load before campaigns and holidays`;
}

const SURFACE_LABEL: Record<string, string> = {
  bau: 'Routine (BAU)',
  change: 'Change & readiness',
  campaign: 'Campaign work',
  coordination: 'Coordination',
  carryover: 'Carry-over',
};

/** Shown once under surface bullets in day detail (avoids repeating per line). */
export const PRESSURE_SURFACE_LANE_FOOTNOTE =
  'Lane = tighter of lab / Market IT; headline excludes backend.';

/** Tech-pressure contribution by surface (same cap logic as combined tech; not additive to headline). */
export function pressureSurfaceLines(row: RiskRow): string[] {
  const ps = row.pressure_surfaces;
  if (!ps) return [];
  const entries = Object.entries(ps) as [string, number][];
  const sorted = entries.filter(([, v]) => v >= 0.02).sort((a, b) => b[1] - a[1]);
  return sorted.map(([k, v]) => {
    const label = SURFACE_LABEL[k] ?? k;
    const used = Math.min(1, Math.max(0, v));
    const avail = Math.round((1 - used) * 100);
    const usedPct = Math.round(used * 100);
    return `${label}: ~${avail}% free (~${usedPct}% of lane scheduled)`;
  });
}

export function techPressureExplanation(row: RiskRow): string {
  const lab = row.lab_load_ratio ?? row.lab_utilisation ?? 0;
  const team = row.team_load_ratio ?? row.team_utilisation ?? 0;
  const backR = row.backend_load_ratio ?? row.backend_pressure ?? 0;
  const m = Math.max(lab, team);
  if (m < 0.02) {
    if (backR >= 0.02) {
      return `Lab and Market IT have plenty of slack; backend is about ${(backR * 100).toFixed(0)}% of its capacity (backend is not part of this heatmap headline).`;
    }
    return 'Light day for tech — both lab and Market IT lanes have lots of room left.';
  }

  const labAvailPct = Math.round(Math.max(0, (1 - Math.min(1, lab)) * 100));
  const teamAvailPct = Math.round(Math.max(0, (1 - Math.min(1, team)) * 100));
  const labOver = lab > 1.001;
  const teamOver = team > 1.001;
  const eps = 0.001;

  if (labOver || teamOver) {
    const labBit = labOver
      ? 'lab scheduled above 100% of capacity (no headroom on that lane)'
      : `lab ~${labAvailPct}% capacity still free`;
    const teamBit = teamOver
      ? 'Market IT scheduled above 100% of capacity'
      : `Market IT ~${teamAvailPct}% still free`;
    const bind = lab >= team ? 'lab' : 'Market IT';
    return `The tighter lane is ${bind}. ${labBit}; ${teamBit}.`;
  }

  if (Math.abs(lab - team) < eps) {
    return `Lab and Market IT are similar: ~${labAvailPct}% lab capacity free, ~${teamAvailPct}% Market IT free.`;
  }
  if (lab >= team) {
    return `Binding lane is lab: ~${labAvailPct}% of lab capacity still available; Market IT has more slack (~${teamAvailPct}% free).`;
  }
  return `Binding lane is Market IT: ~${teamAvailPct}% of Market IT capacity still available; lab has more slack (~${labAvailPct}% free).`;
}

/** Explains readiness vs live/support buckets as availability on the tighter lane (not additive to the headline tile). */
export function techReadinessSustainExplanation(row: RiskRow): string | null {
  const labsCap = row.labs_effective_cap ?? 0;
  const teamsCap = row.teams_effective_cap ?? 0;
  const lr = labsCap > 0 ? row.lab_load_readiness / labsCap : 0;
  const tr = teamsCap > 0 ? row.team_load_readiness / teamsCap : 0;
  const ls = labsCap > 0 ? row.lab_load_sustain / labsCap : 0;
  const ts = teamsCap > 0 ? row.team_load_sustain / teamsCap : 0;
  const readinessU = Math.max(lr, tr);
  const sustainU = Math.max(ls, ts);
  if (readinessU < 0.02 && sustainU < 0.02) return null;

  const readinessAvail = Math.round(Math.max(0, (1 - Math.min(1, readinessU)) * 100));
  const sustainAvail = Math.round(Math.max(0, (1 - Math.min(1, sustainU)) * 100));
  const parts: string[] = [];
  if (readinessU >= 0.02) {
    parts.push(`readiness / change ~${readinessAvail}% free`);
  }
  if (sustainU >= 0.02) {
    parts.push(`live / support ~${sustainAvail}% free`);
  }
  return `Breakdown (tighter lab / Market IT lane): ${parts.join(' · ')}. Slices do not sum to the headline; backend is not in the headline tile.`;
}

export type RiskBlendTerm = {
  key: string;
  label: string;
  /** 0–1 factor in the model */
  factor: number;
  weight: number;
  /** weight × factor */
  contribution: number;
};

/** Tooltip “blend” rows match the active runway lens (Technology = capacity consumed on lab / Market IT). */
export function buildLensRiskBlendTerms(
  viewMode: ViewModeId,
  row: RiskRow,
  tuning: RiskModelTuning
): RiskBlendTerm[] {
  if (viewMode === 'combined') {
    const consumed = technologyCapacityConsumedHeatmapMetric(row, 'all');
    return [
      {
        key: 'tech_capacity_consumed',
        label: lensHeatmapBlendCaption('combined'),
        factor: consumed,
        weight: 1,
        contribution: consumed,
      },
    ];
  }
  if (viewMode === 'market_risk') {
    const d = Math.min(1, Math.max(0, row.deployment_risk_01 ?? 0));
    return [
      {
        key: 'deployment',
        label: lensHeatmapBlendCaption('market_risk'),
        factor: d,
        weight: 1,
        contribution: d,
      },
    ];
  }
  const fill01 = inStoreHeatmapMetric(row, tuning);
  return [
    {
      key: 'store',
      label: lensHeatmapBlendCaption('in_store'),
      factor: fill01,
      weight: 1,
      contribution: fill01,
    },
  ];
}

/** Short natural-language factors behind {@link RiskRow.deployment_risk_01}. */
export function deploymentRiskExplanation(
  row: RiskRow,
  config: MarketConfig | undefined,
  dateStr: string
): string {
  const parts: string[] = [];
  if (row.public_holiday_flag) parts.push('public holiday');
  if (row.school_holiday_flag) parts.push('school break');
  const storeNorm = Math.min(1, Math.max(0, row.store_pressure ?? 0) / STORE_PRESSURE_MAX);
  if (storeNorm >= 0.12) {
    parts.push(`busy stores (~${Math.round(storeNorm * 100)}% on the trading curve)`);
  }
  const month = Number(dateStr.slice(5, 7));
  if (month === 10 || month === 11 || month === 12) parts.push('calendar Q4 ramp (deployment month lift)');
  const yEnd = yearEndWeekBlockRamp01(dateStr);
  if (yEnd >= 1 / 12 + 1e-6) {
    parts.push(
      `year-end weekly ramp (${Math.round(yEnd * 12)} / 12 steps to 31 Dec in the model)`
    );
  }
  if (month >= 1 && month <= 12) {
    const mk = TRADING_MONTH_KEYS[month - 1];
    const ctx = mk ? config?.deployment_risk_context_month_curve?.[mk] : undefined;
    if (ctx != null && ctx >= 0.06) {
      parts.push(`extra deployment context month lift (~${Math.round(ctx * 100)}%)`);
    }
  }
  const camp01 = Math.min(1, Math.max(0, row.campaign_risk ?? 0));
  if (camp01 >= 0.08) parts.push('campaign activity');
  for (const ev of config?.deployment_risk_events ?? []) {
    if (dateStr >= ev.start && dateStr <= ev.end) {
      parts.push(`${ev.id.replace(/_/g, ' ')}${ev.kind ? ` (${ev.kind})` : ''}`);
    }
  }
  for (const b of config?.deployment_risk_blackouts ?? []) {
    if (dateStr >= b.start && dateStr <= b.end) {
      if (b.public_reason) {
        parts.push(
          b.operational_note ? `${b.public_reason} — ${b.operational_note}` : b.public_reason
        );
      } else {
        parts.push(`blackout: ${b.id.replace(/_/g, ' ')}`);
      }
    }
  }
  const wdShape = weekdayDeploymentShape01(dateStr, config);
  if (wdShape >= 0.45) {
    parts.push('heavy trading / tech week segment (incidents matter more than mid-week lulls)');
  } else if (wdShape >= 0.2) {
    parts.push('above-average week segment for load rhythm');
  }
  if (wdShape >= 0.32 && camp01 >= 0.08) {
    parts.push('peak week segment × campaign (model compounds these)');
  }
  const techP = Math.min(1, Math.max(0, row.tech_pressure ?? 0));
  if (techP >= 0.38) {
    parts.push('high engineering load (resourcing strain on deployment)');
  }
  if (!parts.length) return 'No strong deployment-risk flags on this day in the model.';
  return `Active factors: ${parts.join(' · ')}.`;
}

/** Full combined-risk blend (planning / diagnostics). */
export function buildRiskBlendTerms(row: RiskRow, tuning: RiskModelTuning): RiskBlendTerm[] {
  const w = normalizedRiskWeights(tuning);
  const holidayN = row.holiday_flag ? 1 : 0;
  const terms: RiskBlendTerm[] = [
    {
      key: 'tech',
      label: 'Tech / delivery',
      factor: row.tech_pressure,
      weight: w.tech,
      contribution: w.tech * row.tech_pressure,
    },
    {
      key: 'store',
      label: 'Stores',
      factor: row.store_pressure,
      weight: w.store,
      contribution: w.store * row.store_pressure,
    },
    {
      key: 'campaign',
      label: 'Campaigns',
      factor: row.campaign_risk,
      weight: w.campaign,
      contribution: w.campaign * row.campaign_risk,
    },
  ];
  if (w.holiday > 0) {
    terms.push({
      key: 'holiday',
      label: 'Holidays',
      factor: holidayN,
      weight: w.holiday,
      contribution: w.holiday * holidayN,
    });
  }
  return terms;
}

export type RunwayTooltipPayload = {
  dateStr: string;
  weekdayShort: string;
  market: string;
  viewMode: ViewModeId;
  row: RiskRow;
  activeCampaigns: string[];
  activeTechProgrammes: string[];
  operatingWindows: string[];
  bauToday: string[];
  storeTradingLine: string | null;
  techExplanation: string;
  techReadinessSustainLine: string | null;
  riskTerms: RiskBlendTerm[];
  riskBand: string;
  /** Short card title (e.g. Combined tech capacity consumed / Trading pressure). */
  fillMetricHeadline: string;
  fillMetricLabel: string;
  /** One scannable sentence for popover; panel may use {@link fillMetricLabel}. */
  fillMetricLeadCompact: string;
  /** Raw lens metric from {@link heatmapCellMetric} (e.g. tech capacity consumed 0–1, store 0–1, deployment risk 0–1). */
  fillMetricValue: number;
  /**
   * Large % tile and fill-score digits: matches runway cell colour path — pressure offset + heatmap transfer on the raw lens metric;
   * Technology Teams raw value is capacity consumed (same as fillMetricValue).
   */
  fillMetricDisplayValue: number;
  /** Heatmap cell fill (hex) for KPI pill background. */
  cellFillHex: string;
  /** When `public_holiday_flag`, stub catalog name(s) for tooltips. */
  publicHolidayName: string | null;
  pressureSurfaceLines: string[];
  /** Single footnote when {@link pressureSurfaceLines} is non-empty. */
  pressureSurfaceFootnote: string | null;
  headroomLine: string | null;
  /** Campaigns / holidays / resourcing groupings for the summary panel. */
  driverSummaryBlocks: RunwayDriverBlock[];
  /** Deployment Risk lens: human-readable factor summary. */
  deploymentRiskLine: string | null;
};

export type { RunwayDriverBlock };

/** Pointer anchor + payload for day-details popover or side summary panel. */
export type RunwayTipState =
  | { x: number; y: number; payload: RunwayTooltipPayload }
  | { x: number; y: number; simple: string };

export function buildRunwayTooltipPayload(input: {
  dateStr: string;
  weekdayShort: string;
  market: string;
  viewMode: ViewModeId;
  row: RiskRow;
  config: MarketConfig | undefined;
  tuning: RiskModelTuning;
  fillMetricHeadline: string;
  fillMetricLabel: string;
  fillMetricLeadCompact: string;
  fillMetricValue: number;
  fillMetricDisplayValue: number;
  cellFillHex: string;
}): RunwayTooltipPayload {
  const {
    dateStr,
    weekdayShort,
    market,
    viewMode,
    row,
    config,
    tuning,
    fillMetricHeadline,
    fillMetricLabel,
    fillMetricLeadCompact,
    fillMetricValue,
    fillMetricDisplayValue,
    cellFillHex,
  } = input;
  const activeCampaigns = activeCampaignNames(config, dateStr);
  const activeTechProgrammes = activeTechProgrammeNames(config, dateStr);
  const operatingWindows = activeOperatingWindowSummaries(config, dateStr);
  const bauToday = bauActivityLabels(config, dateStr);
  const storeTradingLineResolved = storeTradingLine(config, dateStr);
  const techExplanation = techPressureExplanation(row);
  const pressureLines = pressureSurfaceLines(row);
  return {
    dateStr,
    weekdayShort,
    market,
    viewMode,
    row,
    activeCampaigns,
    activeTechProgrammes,
    operatingWindows,
    bauToday,
    storeTradingLine: storeTradingLineResolved,
    techExplanation,
    techReadinessSustainLine: techReadinessSustainExplanation(row),
    riskTerms: buildLensRiskBlendTerms(viewMode, row, tuning),
    riskBand: row.risk_band,
    fillMetricHeadline,
    fillMetricLabel,
    fillMetricLeadCompact,
    fillMetricValue,
    fillMetricDisplayValue,
    cellFillHex,
    publicHolidayName: row.public_holiday_flag ? getStubPublicHolidayName(market, dateStr) : null,
    pressureSurfaceLines: pressureLines,
    pressureSurfaceFootnote: pressureLines.length > 0 ? PRESSURE_SURFACE_LANE_FOOTNOTE : null,
    headroomLine:
      row.headroom != null
        ? `Room left before max pressure: about ${(row.headroom * 100).toFixed(0)}%`
        : null,
    driverSummaryBlocks: buildDriverSummaryBlocks(
      viewMode,
      row,
      activeCampaigns,
      activeTechProgrammes,
      operatingWindows,
      bauToday,
      storeTradingLineResolved,
      techExplanation,
      pressureLines
    ),
    deploymentRiskLine:
      viewMode === 'market_risk' ? deploymentRiskExplanation(row, config, dateStr) : null,
  };
}
