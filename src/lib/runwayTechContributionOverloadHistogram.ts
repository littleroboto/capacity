import { parseDate } from '@/engine/calendar';
import type { RiskRow } from '@/engine/riskModel';
import {
  CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W,
  type ContributionStripLayoutMeta,
} from '@/lib/calendarQuarterLayout';
import { formatDateYmd } from '@/lib/weekRunway';

const MS_DAY = 86_400_000;

export type ContributionWeekCapacityBalance = {
  weekIndex: number;
  /**
   * Aggregate lab+team load vs effective caps for modeled days in the week:
   * `(sumDemand − sumCapacity) / max(sumCapacity, ε)`.
   * Positive = weekly deficit (over capacity), negative = surplus (under capacity).
   */
  signedLoadVsCap: number;
  /** Week aggregate `sumDemand / max(sumCapacity, ε)` (same units as daily {@link ContributionDayCapacityBalance.capacityUtilizationRatio}). */
  capacityUtilizationRatio: number;
  /** Count of ISO days in the week that had a row in `riskByDate`. */
  daysWithData: number;
};

export type ContributionDayCapacityBalance = {
  /** 0 … `numWeeks * 7 - 1` along the strip grid (Sun-first week columns). */
  dayIndex: number;
  ymd: string;
  /** `(D−C)/C` — surplus negative, deficit positive (overload ribbon vs 100% cap). */
  signedLoadVsCap: number;
  /**
   * Lab+team load as a share of effective lab+team caps: `D / max(C, ε)` (not capped; may exceed 1 when overloaded).
   * Drives the strip sparkline rhythm (BAU cadence); named activities bite by lowering `D` in counterfactual rows.
   */
  capacityUtilizationRatio: number;
  hasData: boolean;
};

/**
 * One entry per contribution-strip week column (same calendar weeks as {@link buildContributionStripRunwayLayout}).
 */
export function computeContributionStripWeekCapacityBalance(
  meta: ContributionStripLayoutMeta,
  riskByDate: Map<string, RiskRow>,
): ContributionWeekCapacityBalance[] {
  const { gridStartYmd, numWeeks } = meta;
  const grid0 = parseDate(gridStartYmd);
  grid0.setHours(0, 0, 0, 0);
  const out: ContributionWeekCapacityBalance[] = [];
  for (let w = 0; w < numWeeks; w++) {
    let sumD = 0;
    let sumC = 0;
    let daysWithData = 0;
    for (let dow = 0; dow < 7; dow++) {
      const dt = new Date(grid0.getTime() + (w * 7 + dow) * MS_DAY);
      const ymd = formatDateYmd(dt);
      const row = riskByDate.get(ymd);
      if (!row) continue;
      sumD += (row.lab_load ?? 0) + (row.team_load ?? 0);
      sumC += (row.labs_effective_cap ?? 0) + (row.teams_effective_cap ?? 0);
      daysWithData += 1;
    }
    let signedLoadVsCap = 0;
    let capUtil = 0;
    if (daysWithData === 0) {
      signedLoadVsCap = 0;
    } else if (sumC < 1e-9) {
      signedLoadVsCap = sumD > 1e-9 ? 1 : 0;
      capUtil = sumD > 1e-9 ? 2 : 0;
    } else {
      signedLoadVsCap = (sumD - sumC) / sumC;
      capUtil = sumD / sumC;
    }
    out.push({ weekIndex: w, signedLoadVsCap, daysWithData, capacityUtilizationRatio: capUtil });
  }
  return out;
}

function signedLoadVsCapForRiskRow(row: RiskRow): number {
  const sumD = (row.lab_load ?? 0) + (row.team_load ?? 0);
  const sumC = (row.labs_effective_cap ?? 0) + (row.teams_effective_cap ?? 0);
  if (sumC < 1e-9) return sumD > 1e-9 ? 1 : 0;
  return (sumD - sumC) / sumC;
}

function capacityUtilizationRatioForRiskRow(row: RiskRow): number {
  const sumD = (row.lab_load ?? 0) + (row.team_load ?? 0);
  const sumC = (row.labs_effective_cap ?? 0) + (row.teams_effective_cap ?? 0);
  if (sumC < 1e-9) return sumD > 1e-9 ? 2 : 0;
  return sumD / sumC;
}

/**
 * One entry per calendar day on the contribution strip (`numWeeks * 7`), for dense sparklines.
 */
export function computeContributionStripDailyCapacityBalance(
  meta: ContributionStripLayoutMeta,
  riskByDate: Map<string, RiskRow>,
): ContributionDayCapacityBalance[] {
  const { gridStartYmd, numWeeks } = meta;
  const grid0 = parseDate(gridStartYmd);
  grid0.setHours(0, 0, 0, 0);
  const total = numWeeks * 7;
  const out: ContributionDayCapacityBalance[] = [];
  for (let d = 0; d < total; d++) {
    const dt = new Date(grid0.getTime() + d * MS_DAY);
    const ymd = formatDateYmd(dt);
    const row = riskByDate.get(ymd);
    if (!row) {
      out.push({ dayIndex: d, ymd, signedLoadVsCap: 0, capacityUtilizationRatio: 0, hasData: false });
      continue;
    }
    out.push({
      dayIndex: d,
      ymd,
      signedLoadVsCap: signedLoadVsCapForRiskRow(row),
      capacityUtilizationRatio: capacityUtilizationRatioForRiskRow(row),
      hasData: true,
    });
  }
  return out;
}

/** Week column index for an ISO day on the contribution strip grid, or null if outside the padded grid. */
export function contributionWeekIndexForYmd(
  meta: ContributionStripLayoutMeta,
  ymd: string,
): number | null {
  const grid0 = parseDate(meta.gridStartYmd);
  grid0.setHours(0, 0, 0, 0);
  const t1 = parseDate(ymd);
  t1.setHours(0, 0, 0, 0);
  const days = Math.round((t1.getTime() - grid0.getTime()) / MS_DAY);
  if (days < 0 || days >= meta.numWeeks * 7) return null;
  const wi = Math.floor(days / 7);
  return wi >= 0 && wi < meta.numWeeks ? wi : null;
}

/** Day offset on the strip grid for an ISO day, or null if outside padded range. */
export function contributionDayIndexForYmd(
  meta: ContributionStripLayoutMeta,
  ymd: string,
): number | null {
  const grid0 = parseDate(meta.gridStartYmd);
  grid0.setHours(0, 0, 0, 0);
  const t1 = parseDate(ymd);
  t1.setHours(0, 0, 0, 0);
  const days = Math.round((t1.getTime() - grid0.getTime()) / MS_DAY);
  const max = meta.numWeeks * 7;
  if (days < 0 || days >= max) return null;
  return days;
}

/** Horizontal centre of the week column for a strip day index (matches contribution-strip cells + chronology ticks). */
export function contributionStripDayColumnCenterX(cellPx: number, gap: number, dayIndex: number): number {
  const stride = cellPx + gap;
  const w = Math.floor(dayIndex / 7);
  return CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W + w * stride + cellPx / 2;
}

/**
 * Distinct x per calendar day for strip-aligned sparklines (heatmap stacks Sun–Sat in one week column).
 */
export function contributionStripDaySparklineX(cellPx: number, gap: number, dayIndex: number): number {
  const stride = cellPx + gap;
  const w = Math.floor(dayIndex / 7);
  const dow = dayIndex % 7;
  const colLeft = CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W + w * stride;
  return colLeft + ((dow + 0.5) / 7) * cellPx;
}
