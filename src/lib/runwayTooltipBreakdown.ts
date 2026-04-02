import { weekdayDeploymentShape01 } from '@/engine/deploymentRiskModel';
import { parseDate } from '@/engine/calendar';
import { getStubPublicHolidayName } from '@/engine/holidayCalc';
import type { RiskRow } from '@/engine/riskModel';
import { normalizedRiskWeights, type RiskModelTuning } from '@/engine/riskModelTuning';
import type { BauEntry, MarketConfig } from '@/engine/types';
import type { ViewModeId } from '@/lib/constants';
import {
  inStoreHeatmapMetric,
  technologyHeadroomHeatmapMetric,
  type TechWorkloadScope,
} from '@/lib/runwayViewMetrics';
import { STORE_PRESSURE_MAX } from '@/engine/riskModelTuning';
import { parseTechRhythmScalar } from '@/engine/techWeeklyPattern';
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

/** Tech-pressure contribution by surface (same cap logic as combined tech; not additive to headline). */
export function pressureSurfaceLines(row: RiskRow): string[] {
  const ps = row.pressure_surfaces;
  if (!ps) return [];
  const entries = Object.entries(ps) as [string, number][];
  const sorted = entries.filter(([, v]) => v >= 0.02).sort((a, b) => b[1] - a[1]);
  return sorted.map(([k, v]) => {
    const label = SURFACE_LABEL[k] ?? k;
    return `${label}: about ${(v * 100).toFixed(0)}% of the busier of lab vs Market IT (headline excludes backend)`;
  });
}

export function techPressureExplanation(row: RiskRow): string {
  const lab = row.lab_load_ratio ?? row.lab_utilisation ?? 0;
  const team = row.team_load_ratio ?? row.team_utilisation ?? 0;
  const backR = row.backend_load_ratio ?? row.backend_pressure ?? 0;
  const m = Math.max(lab, team);
  if (m < 0.02) {
    if (backR >= 0.02) {
      return `Lab and Market IT are light; backend is about ${(backR * 100).toFixed(0)}% of its capacity (backend is not part of this heatmap headline).`;
    }
    return 'Light day for tech — scheduled work is well below capacity.';
  }
  const eps = 0.001;
  if (Math.abs(m - lab) < eps || lab >= team) {
    return `Led by lab load (${(lab * 100).toFixed(0)}% of lab capacity${lab > 1.001 ? ' — above full capacity' : ''}).`;
  }
  return `Led by Market IT load (${(team * 100).toFixed(0)}% of Market IT capacity${team > 1.001 ? ' — above full capacity' : ''}).`;
}

/** Explains readiness vs live/support sub-scores (same cap as combined tech; not additive to headline tech pressure). */
export function techReadinessSustainExplanation(row: RiskRow): string | null {
  const r = row.tech_readiness_pressure ?? 0;
  const s = row.tech_sustain_pressure ?? 0;
  if (r < 0.02 && s < 0.02) return null;
  const parts: string[] = [];
  if (r >= 0.02) {
    parts.push(`readiness / change work ${(r * 100).toFixed(0)}% (of lab / Market IT caps; headline excludes backend)`);
  }
  if (s >= 0.02) {
    parts.push(`live / support segment ${(s * 100).toFixed(0)}%`);
  }
  return `Breakdown: ${parts.join(' · ')}. The main tech number is still total scheduled work compared with those same caps.`;
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

/** Tooltip “blend” rows match the active runway lens (Technology = tech utilisation only). */
export function buildLensRiskBlendTerms(
  viewMode: ViewModeId,
  row: RiskRow,
  tuning: RiskModelTuning,
  techWorkloadScope: TechWorkloadScope = 'all'
): RiskBlendTerm[] {
  if (viewMode === 'combined') {
    const headroom = technologyHeadroomHeatmapMetric(row, techWorkloadScope);
    return [
      {
        key: 'tech_headroom',
        label: 'Tech capacity headroom (this heatmap)',
        factor: headroom,
        weight: 1,
        contribution: headroom,
      },
    ];
  }
  if (viewMode === 'market_risk') {
    const d = Math.min(1, Math.max(0, row.deployment_risk_01 ?? 0));
    return [
      {
        key: 'deployment',
        label: 'Deployment / calendar risk (this heatmap)',
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
      label: 'Restaurant trading (this heatmap)',
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
  /** Short card title (e.g. Tech capacity demand / Trading pressure). */
  fillMetricHeadline: string;
  fillMetricLabel: string;
  fillMetricValue: number;
  /** Heatmap cell fill (hex) for KPI pill background. */
  cellFillHex: string;
  /** When `public_holiday_flag`, stub catalog name(s) for tooltips. */
  publicHolidayName: string | null;
  pressureSurfaceLines: string[];
  headroomLine: string | null;
  /** Campaigns / holidays / resourcing groupings for the summary panel. */
  driverSummaryBlocks: RunwayDriverBlock[];
  /** Market risk lens: human-readable factor summary. */
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
  fillMetricValue: number;
  cellFillHex: string;
  /** Technology lens workload slice (combined load, BAU, or project surfaces). */
  techWorkloadScope?: TechWorkloadScope;
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
    fillMetricValue,
    cellFillHex,
    techWorkloadScope = 'all',
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
    riskTerms: buildLensRiskBlendTerms(viewMode, row, tuning, techWorkloadScope),
    riskBand: row.risk_band,
    fillMetricHeadline,
    fillMetricLabel,
    fillMetricValue,
    cellFillHex,
    publicHolidayName: row.public_holiday_flag ? getStubPublicHolidayName(market, dateStr) : null,
    pressureSurfaceLines: pressureLines,
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
