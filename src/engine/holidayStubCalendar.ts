/**
 * Single source for stub public + school holiday **date lists** (same data the pipeline used when `auto: true`).
 * `holidayCalc.ts` filters by calendar range; `scripts/sync-market-holiday-dates.ts` embeds lists into market YAML.
 */
import {
  AU_PUBLIC_ENTRIES,
  CA_PUBLIC_ENTRIES,
  DE_PUBLIC_ENTRIES,
  entriesToDates,
  ES_PUBLIC_ENTRIES,
  FR_PUBLIC_ENTRIES,
  IT_PUBLIC_ENTRIES,
  NA_PUBLIC_ENTRIES,
  PL_PUBLIC_ENTRIES,
  UK_PUBLIC_ENTRIES,
} from './holidayPublicCatalog';

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive calendar-day expansion for `YYYY-MM-DD` bounds (local date, matches `calendar.ts`). */
function expandInclusiveRange(isoStart: string, isoEnd: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = isoStart.split('-').map(Number);
  const [ye, me, de] = isoEnd.split('-').map(Number);
  const d = new Date(ys, ms - 1, ds);
  const end = new Date(ye, me - 1, de);
  while (d <= end) {
    out.push(formatDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function mergeRanges(ranges: [string, string][]): string[] {
  const u = new Set<string>();
  for (const [a, b] of ranges) {
    for (const x of expandInclusiveRange(a, b)) u.add(x);
  }
  return [...u].sort();
}

const UK_PUBLIC = entriesToDates(UK_PUBLIC_ENTRIES);
const DE_PUBLIC = entriesToDates(DE_PUBLIC_ENTRIES);
const FR_PUBLIC = entriesToDates(FR_PUBLIC_ENTRIES);
const AU_PUBLIC = entriesToDates(AU_PUBLIC_ENTRIES);
const CA_PUBLIC = entriesToDates(CA_PUBLIC_ENTRIES);
const IT_PUBLIC = entriesToDates(IT_PUBLIC_ENTRIES);
const ES_PUBLIC = entriesToDates(ES_PUBLIC_ENTRIES);
const PL_PUBLIC = entriesToDates(PL_PUBLIC_ENTRIES);
const NA_PUBLIC = entriesToDates(NA_PUBLIC_ENTRIES);

/** Stub bank / public holidays by market (from `holidayPublicCatalog`). */
export const STUB_PUBLIC_HOLIDAY_DATES_BY_MARKET: Readonly<Record<string, readonly string[]>> = {
  UK: UK_PUBLIC,
  DE: DE_PUBLIC,
  FR: FR_PUBLIC,
  AU: AU_PUBLIC,
  CA: CA_PUBLIC,
  IT: IT_PUBLIC,
  ES: ES_PUBLIC,
  PL: PL_PUBLIC,
  NA: NA_PUBLIC,
};

/** NSW Eastern — southern summer break straddles Christmas/Jan; winter (July) is a shorter mid-year break. */
const AU_SCHOOL = mergeRanges([
  ['2026-04-07', '2026-04-17'],
  ['2026-07-06', '2026-07-17'],
  ['2026-09-28', '2026-10-09'],
  ['2026-12-18', '2027-01-27'],
  ['2027-04-06', '2027-04-16'],
  ['2027-07-05', '2027-07-16'],
  ['2027-09-27', '2027-10-08'],
  ['2027-12-17', '2028-01-25'],
  ['2028-04-04', '2028-04-14'],
  ['2028-07-03', '2028-07-14'],
  ['2028-10-02', '2028-10-13'],
  ['2028-12-15', '2029-01-30'],
]);

/** England-style — extended through Easter 2028. */
const UK_SCHOOL = mergeRanges([
  ['2026-02-16', '2026-02-20'],
  ['2026-03-28', '2026-04-12'],
  ['2026-05-30', '2026-06-03'],
  ['2026-07-23', '2026-08-31'],
  ['2026-10-26', '2026-10-30'],
  ['2026-12-21', '2027-01-03'],
  ['2027-02-15', '2027-02-19'],
  ['2027-03-27', '2027-04-11'],
  ['2027-07-21', '2027-09-01'],
  ['2027-10-25', '2027-10-29'],
  ['2027-12-20', '2028-01-02'],
  ['2028-02-14', '2028-02-18'],
  ['2028-03-28', '2028-04-10'],
]);

/** NRW-style — spring breaks aligned with Easter campaigns in `public/data/markets/DE.yaml`. */
const DE_SCHOOL = mergeRanges([
  ['2025-04-14', '2025-04-25'],
  ['2026-02-02', '2026-02-06'],
  ['2026-03-30', '2026-04-10'],
  ['2026-07-15', '2026-08-26'],
  ['2026-10-12', '2026-10-24'],
  ['2026-12-23', '2027-01-06'],
  ['2027-02-01', '2027-02-05'],
  ['2027-04-19', '2027-04-30'],
  ['2027-07-14', '2027-08-25'],
  ['2027-10-11', '2027-10-23'],
  ['2027-12-23', '2028-01-05'],
  ['2028-02-07', '2028-02-11'],
  ['2028-03-27', '2028-04-07'],
  ['2028-07-12', '2028-08-23'],
  ['2028-10-09', '2028-10-21'],
  ['2028-12-23', '2029-01-05'],
]);

/** France Zone B — through winter 2027–28. */
const FR_SCHOOL = mergeRanges([
  ['2025-12-20', '2026-01-04'],
  ['2026-02-07', '2026-02-22'],
  ['2026-04-11', '2026-04-26'],
  ['2026-07-04', '2026-08-31'],
  ['2026-10-17', '2026-11-02'],
  ['2026-12-19', '2027-01-04'],
  ['2027-02-20', '2027-03-08'],
  ['2027-04-16', '2027-05-02'],
  ['2027-07-10', '2027-09-04'],
  ['2027-10-23', '2027-11-07'],
  ['2027-12-18', '2028-01-03'],
  ['2028-02-12', '2028-02-27'],
  ['2028-04-08', '2028-04-23'],
]);

/** Ontario-style — through March break 2028. */
const CA_SCHOOL = mergeRanges([
  ['2025-12-22', '2026-01-05'],
  ['2026-03-16', '2026-03-20'],
  ['2026-07-01', '2026-08-31'],
  ['2026-12-23', '2027-01-08'],
  ['2027-03-15', '2027-03-19'],
  ['2027-07-01', '2027-08-31'],
  ['2027-12-22', '2028-01-06'],
  ['2028-03-13', '2028-03-17'],
]);

/** Narnia (NA) — same stub spine as CA (fictional adjacent kingdom); Archenland Academy calendar. */
const NA_SCHOOL = mergeRanges([
  ['2025-12-22', '2026-01-05'],
  ['2026-03-16', '2026-03-20'],
  ['2026-07-01', '2026-08-31'],
  ['2026-12-23', '2027-01-08'],
  ['2027-03-15', '2027-03-19'],
  ['2027-07-01', '2027-08-31'],
  ['2027-12-22', '2028-01-06'],
  ['2028-03-13', '2028-03-17'],
  ['2028-07-03', '2028-08-31'],
  ['2028-12-18', '2029-01-07'],
]);

/**
 * Lombardy elementary calendar (Feiertagskalender.ch → Regione Lombardia PDF); summer/2026–27 Christmas marked provisional there.
 */
const IT_SCHOOL = mergeRanges([
  ['2025-12-23', '2026-01-06'],
  ['2026-02-16', '2026-02-17'],
  ['2026-04-02', '2026-04-07'],
  ['2026-06-09', '2026-09-10'],
  ['2026-12-22', '2027-01-06'],
]);

/**
 * Comunidad de Madrid: Christmas & Semana Santa from OKDiario (citing CMadrid non-teaching days); summer = day after fin de curso ~19 Jun → ~8 Sep return pattern.
 */
const ES_SCHOOL = mergeRanges([
  ['2025-12-20', '2026-01-07'],
  ['2026-03-27', '2026-04-06'],
  ['2026-06-20', '2026-09-07'],
]);

/**
 * Poland: winter union + shared breaks from PublicHolidays.pl (gov.pl) 2025/26; 2026/27–2027/28 from Feiertagskalender Voivodeship Pomeranian (winter differs by region).
 */
const PL_SCHOOL = mergeRanges([
  ['2025-12-22', '2025-12-31'],
  ['2026-01-19', '2026-03-01'],
  ['2026-04-02', '2026-04-07'],
  ['2026-06-27', '2026-08-31'],
  ['2026-12-23', '2027-01-01'],
  ['2027-02-01', '2027-02-14'],
  ['2027-03-25', '2027-03-30'],
  ['2027-06-26', '2027-08-31'],
  ['2027-12-22', '2028-01-01'],
  ['2028-04-13', '2028-04-18'],
  ['2028-06-24', '2028-09-03'],
  ['2028-12-22', '2028-12-31'],
]);

/** Stub school break dates by market (not legal truth; planning fiction). */
export const STUB_SCHOOL_HOLIDAY_DATES_BY_MARKET: Readonly<Record<string, readonly string[]>> = {
  AU: AU_SCHOOL,
  UK: UK_SCHOOL,
  DE: DE_SCHOOL,
  FR: FR_SCHOOL,
  CA: CA_SCHOOL,
  NA: NA_SCHOOL,
  IT: IT_SCHOOL,
  ES: ES_SCHOOL,
  PL: PL_SCHOOL,
};

export function listStubPublicHolidayDates(market: string): string[] {
  const a = STUB_PUBLIC_HOLIDAY_DATES_BY_MARKET[market];
  return a ? [...a] : [];
}

export function listStubSchoolHolidayDates(market: string): string[] {
  const a = STUB_SCHOOL_HOLIDAY_DATES_BY_MARKET[market];
  return a ? [...a] : [];
}
