import { MODEL_MONTHS } from '@/lib/constants';

export type CalendarRow = { date: string; market: string };

function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

export function buildCalendar(startFrom: Date | undefined, markets: string[]): CalendarRow[] {
  const start = startFrom ? new Date(startFrom) : getQuarterStart(new Date());
  const end = addMonths(start, MODEL_MONTHS);
  return buildCalendarExclusiveEnd(start, end, markets);
}

function buildCalendarExclusiveEnd(start: Date, endExclusive: Date, markets: string[]): CalendarRow[] {
  const rows: CalendarRow[] = [];
  for (const market of markets) {
    const d = new Date(start);
    while (d < endExclusive) {
      rows.push({
        date: formatDate(d),
        market,
      });
      d.setDate(d.getDate() + 1);
    }
  }
  return rows;
}

/** Every calendar day from `startYmd` through `endYmd` inclusive, for each market (planning / reporting windows). */
export function buildCalendarInclusiveIsoRange(startYmd: string, endYmd: string, markets: string[]): CalendarRow[] {
  const rows: CalendarRow[] = [];
  const start = parseDate(startYmd);
  const end = parseDate(endYmd);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  for (const market of markets) {
    const d = new Date(start);
    while (d.getTime() <= end.getTime()) {
      rows.push({
        date: formatDate(d),
        market,
      });
      d.setDate(d.getDate() + 1);
    }
  }
  return rows;
}

function getQuarterStart(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
}
