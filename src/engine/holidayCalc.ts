/**
 * Stub public + school calendars for runway markets.
 * Covers **multiple calendar years** so any **15-month / five-quarter** window from `buildCalendar`
 * (quarter start → +MODEL_MONTHS) has data — not a legal source of truth.
 *
 * Canonical date lists live in `holidayStubCalendar.ts` (also used to embed `dates:` into market YAML).
 */
import { getStubPublicHolidayName } from '@/engine/holidayPublicCatalog';
import {
  STUB_PUBLIC_HOLIDAY_DATES_BY_MARKET,
  STUB_SCHOOL_HOLIDAY_DATES_BY_MARKET,
} from '@/engine/holidayStubCalendar';

/** Re-export for runway tooltips (stub catalog names). */
export { getStubPublicHolidayName };

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getAutoHolidayDates(
  market: string,
  options: { auto_public?: boolean; auto_school?: boolean } = {},
  range?: { start: Date; end: Date }
): string[] {
  const dates: string[] = [];
  if (options.auto_public) {
    const pub = STUB_PUBLIC_HOLIDAY_DATES_BY_MARKET[market];
    if (pub?.length) dates.push(...pub);
  }
  if (options.auto_school) {
    const school = STUB_SCHOOL_HOLIDAY_DATES_BY_MARKET[market];
    if (school?.length) dates.push(...school);
  }
  const unique = [...new Set(dates)];
  if (range) {
    const startStr = formatDate(range.start);
    const endStr = formatDate(range.end);
    return unique.filter((d) => d >= startStr && d <= endStr);
  }
  return unique;
}
