import { parseDate } from '@/engine/calendar';
import type { RiskRow } from '@/engine/riskModel';
import { formatDateYmd } from '@/lib/weekRunway';

export type RunwayQuarter = 1 | 2 | 3 | 4;

/** Inclusive ISO date bounds for a calendar quarter. */
function quarterBounds(year: number, quarter: RunwayQuarter): { start: string; end: string } {
  switch (quarter) {
    case 1:
      return { start: `${year}-01-01`, end: `${year}-03-31` };
    case 2:
      return { start: `${year}-04-01`, end: `${year}-06-30` };
    case 3:
      return { start: `${year}-07-01`, end: `${year}-09-30` };
    default:
      return { start: `${year}-10-01`, end: `${year}-12-31` };
  }
}

/** Inclusive ISO bounds for the runway year/quarter picker (full calendar span). */
export function runwayPickerInclusiveBounds(
  year: number,
  quarter: RunwayQuarter | null
): { start: string; end: string } {
  if (quarter == null) {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  return quarterBounds(year, quarter);
}

/**
 * ISO end date (`YYYY-MM-DD`) of the calendar quarter immediately after the quarter containing `endYmd`.
 * E.g. `2026-12-31` → `2027-03-31`; `2026-06-30` → `2026-09-30`.
 */
export function endYmdAfterFollowingQuarter(endYmd: string): string {
  const d = parseDate(endYmd);
  const y = d.getFullYear();
  const m = d.getMonth();
  const q0 = Math.floor(m / 3);
  let ny = y;
  let nq0 = q0 + 1;
  if (nq0 > 3) {
    nq0 = 0;
    ny += 1;
  }
  const quarter = (nq0 + 1) as RunwayQuarter;
  return quarterBounds(ny, quarter).end;
}

/** Layout span: picker bounds, optionally extended through the following calendar quarter. */
export function runwayPickerLayoutBounds(
  year: number,
  quarter: RunwayQuarter | null,
  includeFollowingQuarter: boolean
): { start: string; end: string } {
  const base = runwayPickerInclusiveBounds(year, quarter);
  if (!includeFollowingQuarter) return base;
  return { start: base.start, end: endYmdAfterFollowingQuarter(base.end) };
}

/**
 * Sorted `YYYY-MM` keys for each calendar month that intersects `[start, end]` (inclusive ISO dates).
 * Matches the set of month columns implied by {@link enumerateIsoDatesInclusive}.
 */
export function monthKeysOverlappingIsoRangeInclusive(start: string, end: string): string[] {
  if (start > end) return [];
  const out: string[] = [];
  let y = parseInt(start.slice(0, 4), 10);
  let m = parseInt(start.slice(5, 7), 10);
  const endY = parseInt(end.slice(0, 4), 10);
  const endM = parseInt(end.slice(5, 7), 10);
  if (![y, m, endY, endM].every((n) => Number.isFinite(n))) return [];
  for (;;) {
    const key = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (y === endY && m === endM) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Every calendar day from `start` through `end` (inclusive ISO `YYYY-MM-DD`). */
export function enumerateIsoDatesInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = parseDate(start);
  const endD = parseDate(end);
  cur.setHours(0, 0, 0, 0);
  endD.setHours(0, 0, 0, 0);
  while (cur.getTime() <= endD.getTime()) {
    out.push(formatDateYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Filter runway rows by calendar year and optional quarter.
 * `year === null` → no filter (returns `rows`).
 * `quarter === null` with year set → entire calendar year.
 */
export function filterRiskSurfaceByYearQuarter(
  rows: RiskRow[],
  year: number | null,
  quarter: RunwayQuarter | null
): RiskRow[] {
  if (year == null) return rows;
  const { start, end } = runwayPickerInclusiveBounds(year, quarter);
  return rows.filter((r) => r.date >= start && r.date <= end);
}

/** Distinct calendar years present in ISO date strings, ascending. */
export function yearsFromRiskSurface(rows: RiskRow[]): number[] {
  const ys = new Set<number>();
  for (const r of rows) {
    const y = Number(r.date.slice(0, 4));
    if (Number.isFinite(y)) ys.add(y);
  }
  return [...ys].sort((a, b) => a - b);
}
