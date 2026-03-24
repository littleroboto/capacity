import { parseDate } from '@/engine/calendar';
import { getStubPublicHolidayName } from '@/engine/holidayCalc';
import type { RiskRow } from '@/engine/riskModel';
import { normalizedRiskWeights, type RiskModelTuning } from '@/engine/riskModelTuning';
import type { BauEntry, MarketConfig } from '@/engine/types';
import type { ViewModeId } from '@/lib/constants';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const TRADING_LEVELS: Record<string, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  very_high: 1,
};

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
        if (c.presenceOnly) tag = 'calendar marker';
        else if (inPrep) tag = `prep (${prepDays}d lead)`;
        else tag = 'live / sustain';
        out.push(`${c.name.replace(/_/g, ' ')} (${tag})`);
      }
      continue;
    }
    if (!c.durationDays) continue;
    const end = new Date(start);
    end.setDate(end.getDate() + c.durationDays);
    if (t >= start && t < end) {
      let tag: string;
      if (c.presenceOnly) tag = 'calendar marker';
      else if (c.readinessDurationDays != null) tag = `readiness ${c.readinessDurationDays}d + live support`;
      else tag = 'campaign load';
      out.push(`${c.name.replace(/_/g, ' ')} (${tag})`);
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
    if (w.team_load_mult != null && w.team_load_mult !== 1) bits.push(`team load ×${w.team_load_mult}`);
    if (w.backend_load_mult != null && w.backend_load_mult !== 1) bits.push(`backend ×${w.backend_load_mult}`);
    if (w.store_pressure_mult != null && w.store_pressure_mult !== 1) bits.push(`store ×${w.store_pressure_mult}`);
    if (w.lab_team_capacity_mult != null && w.lab_team_capacity_mult !== 1) {
      bits.push(`lab/team cap ×${w.lab_team_capacity_mult}`);
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
  const weekly = config?.trading?.weekly_pattern as Record<string, string> | undefined;
  if (!weekly) return null;
  const d = parseDate(dateStr);
  const dayName = DAY_NAMES[d.getDay()];
  const level = weekly[dayName];
  if (level == null) return null;
  const v = TRADING_LEVELS[String(level).toLowerCase()] ?? 0.5;
  const pretty = String(level).replace(/_/g, ' ');
  return `${dayName} store pattern: ${pretty} → base pressure ${v.toFixed(2)}`;
}

const SURFACE_LABEL: Record<string, string> = {
  bau: 'BAU & rhythm',
  change: 'Change / readiness',
  campaign: 'Campaign / live',
  coordination: 'Coordination layer',
  carryover: 'Carry-over / backlog',
};

/** Tech-pressure contribution by surface (same cap logic as combined tech; not additive to headline). */
export function pressureSurfaceLines(row: RiskRow): string[] {
  const ps = row.pressure_surfaces;
  if (!ps) return [];
  const entries = Object.entries(ps) as [string, number][];
  const sorted = entries.filter(([, v]) => v >= 0.02).sort((a, b) => b[1] - a[1]);
  return sorted.map(([k, v]) => {
    const label = SURFACE_LABEL[k] ?? k;
    return `${label}: ${(v * 100).toFixed(0)}% of tech caps (max of lab/team/backend blend)`;
  });
}

export function techPressureExplanation(row: RiskRow): string {
  const lab = row.lab_utilisation ?? 0;
  const team = row.team_utilisation ?? 0;
  const backHalf = (row.backend_pressure ?? 0) * 0.5;
  const m = Math.max(lab, team, backHalf);
  if (m < 0.02) {
    return 'Quiet tech day — little scheduled BAU / release load vs capacity.';
  }
  const eps = 0.001;
  if (Math.abs(m - lab) < eps || (lab >= team && lab >= backHalf)) {
    return `Led by lab utilisation (${(lab * 100).toFixed(0)}% of lab capacity).`;
  }
  if (Math.abs(m - team) < eps || team >= backHalf) {
    return `Led by field / team utilisation (${(team * 100).toFixed(0)}% of team capacity).`;
  }
  return `Backend demand (${(row.backend_pressure * 100).toFixed(0)}% cap) dominates after halving in the blend.`;
}

/** Explains readiness vs live/support sub-scores (same cap as combined tech; not additive to headline tech pressure). */
export function techReadinessSustainExplanation(row: RiskRow): string | null {
  const r = row.tech_readiness_pressure ?? 0;
  const s = row.tech_sustain_pressure ?? 0;
  if (r < 0.02 && s < 0.02) return null;
  const parts: string[] = [];
  if (r >= 0.02) {
    parts.push(`readiness / change work ${(r * 100).toFixed(0)}% (of lab/team/backend caps)`);
  }
  if (s >= 0.02) {
    parts.push(`live / support segment ${(s * 100).toFixed(0)}%`);
  }
  return `Tech split: ${parts.join(' · ')}. Combined tech pressure uses total scheduled load vs the same caps.`;
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
      label: 'Store trading',
      factor: row.store_pressure,
      weight: w.store,
      contribution: w.store * row.store_pressure,
    },
    {
      key: 'campaign',
      label: 'Campaign impact',
      factor: row.campaign_risk,
      weight: w.campaign,
      contribution: w.campaign * row.campaign_risk,
    },
  ];
  if (w.holiday > 0) {
    terms.push({
      key: 'holiday',
      label: 'Holiday (pressure dial)',
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
  operatingWindows: string[];
  bauToday: string[];
  storeTradingLine: string | null;
  techExplanation: string;
  techReadinessSustainLine: string | null;
  riskTerms: RiskBlendTerm[];
  riskBand: string;
  fillMetricLabel: string;
  fillMetricValue: number;
  /** When `public_holiday_flag`, stub catalog name(s) for tooltips. */
  publicHolidayName: string | null;
  pressureSurfaceLines: string[];
  headroomLine: string | null;
};

export function buildRunwayTooltipPayload(input: {
  dateStr: string;
  weekdayShort: string;
  market: string;
  viewMode: ViewModeId;
  row: RiskRow;
  config: MarketConfig | undefined;
  tuning: RiskModelTuning;
  fillMetricLabel: string;
  fillMetricValue: number;
}): RunwayTooltipPayload {
  const { dateStr, weekdayShort, market, viewMode, row, config, tuning, fillMetricLabel, fillMetricValue } =
    input;
  return {
    dateStr,
    weekdayShort,
    market,
    viewMode,
    row,
    activeCampaigns: activeCampaignNames(config, dateStr),
    operatingWindows: activeOperatingWindowSummaries(config, dateStr),
    bauToday: bauActivityLabels(config, dateStr),
    storeTradingLine: storeTradingLine(config, dateStr),
    techExplanation: techPressureExplanation(row),
    techReadinessSustainLine: techReadinessSustainExplanation(row),
    riskTerms: buildRiskBlendTerms(row, tuning),
    riskBand: row.risk_band,
    fillMetricLabel,
    fillMetricValue,
    publicHolidayName: row.public_holiday_flag ? getStubPublicHolidayName(market, dateStr) : null,
    pressureSurfaceLines: pressureSurfaceLines(row),
    headroomLine:
      row.headroom != null
        ? `Headroom (1 − combined pressure): ${(row.headroom * 100).toFixed(0)}%`
        : null,
  };
}
