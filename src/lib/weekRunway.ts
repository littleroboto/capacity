import { parseDate } from '@/engine/calendar';

export const RUNWAY_DAY_COLUMNS = 7;

/** Gap between adjacent heat cells horizontally and vertically (px). */
export const RUNWAY_CELL_GAP_PX = 3;

export function runwayDayStripWidth(cellPx: number, gapPx: number, dayCols: number): number {
  return dayCols * cellPx + Math.max(0, dayCols - 1) * gapPx;
}

/**
 * Map a horizontal or vertical span (px, relative to strip origin) to inclusive cell indices.
 * Cells are laid out as [cell][gap][cell]…; returns null if the span hits no cell.
 */
export function runwaySpanToCellIndexRange(
  lo: number,
  hi: number,
  cellPx: number,
  gapPx: number,
  count: number
): [number, number] | null {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  let i0 = count;
  let i1 = -1;
  for (let i = 0; i < count; i++) {
    const s = i * (cellPx + gapPx);
    const e = s + cellPx;
    if (s < b && e > a) {
      i0 = Math.min(i0, i);
      i1 = Math.max(i1, i);
    }
  }
  return i1 >= i0 ? [i0, i1] : null;
}

export function formatDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday 00:00 local of the ISO week containing `d`. */
export function startOfMondayWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const daysSinceMon = (dow + 6) % 7;
  x.setDate(x.getDate() - daysSinceMon);
  return x;
}

export type WeekStrip = {
  /** YYYY-MM-DD of Monday */
  weekKey: string;
  /** Mon..Sun; null = outside model range for that weekday */
  cells: (string | null)[];
};

/**
 * Build one list row per calendar week overlapping [first..last] dates.
 * Each row has exactly 7 cells (Mon–Sun).
 */
export function buildWeekStrips(sortedDatesYmd: string[]): WeekStrip[] {
  if (!sortedDatesYmd.length) return [];
  const first = parseDate(sortedDatesYmd[0]!);
  const last = parseDate(sortedDatesYmd[sortedDatesYmd.length - 1]!);
  const inRange = (d: Date) => {
    const t = d.getTime();
    return t >= first.getTime() && t <= last.getTime();
  };

  let mon = startOfMondayWeek(first);
  const lastMon = startOfMondayWeek(last);
  const strips: WeekStrip[] = [];

  const cur = new Date(mon);
  while (cur.getTime() <= lastMon.getTime()) {
    const cells: (string | null)[] = [];
    for (let i = 0; i < RUNWAY_DAY_COLUMNS; i++) {
      const dt = new Date(cur);
      dt.setDate(dt.getDate() + i);
      if (!inRange(dt)) {
        cells.push(null);
      } else {
        cells.push(formatDateYmd(dt));
      }
    }
    strips.push({ weekKey: formatDateYmd(cur), cells });
    cur.setDate(cur.getDate() + 7);
  }
  return strips;
}

/** Short weekday labels (header row; full names in `title`). */
export const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** e.g. "6 Jan" or "6 Jan '25" when not current year */
export function formatWeekStartHuman(weekKeyYmd: string): string {
  const d = parseDate(weekKeyYmd);
  const y = d.getFullYear();
  const nowY = new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(y !== nowY ? { year: '2-digit' as const } : {}),
  });
}
