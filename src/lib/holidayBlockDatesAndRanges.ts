import { coerceYamlDateString } from '../engine/yamlDateCoerce';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateList(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const item of raw) {
    const s = coerceYamlDateString(item);
    if (ISO_DAY.test(s)) out.push(s);
  }
  return out.length ? out : undefined;
}

/** Inclusive calendar-day expansion using UTC (authoring uses plain ISO dates). */
export function expandIsoInclusiveRange(fromIso: string, toIso: string): string[] {
  if (!ISO_DAY.test(fromIso) || !ISO_DAY.test(toIso)) return [];
  const [fy, fm, fd] = fromIso.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split('-').map(Number) as [number, number, number];
  let t = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  if (t > end) return [];
  const out: string[] = [];
  while (t <= end) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
    t += 86400000;
  }
  return out;
}

export type HolidayBlockDateExpansion = {
  /** Sorted unique ISO days, or undefined if none */
  dates: string[] | undefined;
  /** `ranges:` rows with missing or non-ISO endpoints (parser skips these silently) */
  skippedRangeRows: number;
};

/**
 * `ranges:` under public_holidays / school_holidays — each entry `{ from, to }` (or start/end, camelCase).
 * Merged with explicit `dates:`; result sorted and deduped. Matches `yamlDslParser` holiday merge semantics.
 */
export function expandHolidayBlockDates(block: Record<string, unknown>): HolidayBlockDateExpansion {
  const explicit = normalizeDateList(block.dates) ?? [];
  const rawRanges = block.ranges;
  const fromRanges: string[] = [];
  let skippedRangeRows = 0;
  if (Array.isArray(rawRanges)) {
    for (const row of rawRanges) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const fromRaw = r.from ?? r.start ?? r.Start ?? r.from_date ?? r.fromDate;
      const toRaw = r.to ?? r.end ?? r.End ?? r.to_date ?? r.toDate;
      const from = coerceYamlDateString(fromRaw);
      const to = coerceYamlDateString(toRaw);
      if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) {
        skippedRangeRows++;
        continue;
      }
      fromRanges.push(...expandIsoInclusiveRange(from, to));
    }
  }
  if (explicit.length === 0 && fromRanges.length === 0) {
    return { dates: undefined, skippedRangeRows };
  }
  const merged = Array.from(new Set([...explicit, ...fromRanges])).sort();
  return {
    dates: merged.length ? merged : undefined,
    skippedRangeRows,
  };
}

/** Same as legacy `datesFromHolidayBlockDatesAndRanges` in the parser. */
export function datesFromHolidayBlockDatesAndRanges(
  block: Record<string, unknown>
): string[] | undefined {
  return expandHolidayBlockDates(block).dates;
}

/**
 * Normalised `ranges:` rows for `holiday_calendars.extra_settings` (public or school).
 */
export function extractYamlHolidayRangesForStorage(block: Record<string, unknown>): Record<string, unknown>[] | null {
  const rawRanges = block.ranges;
  if (!Array.isArray(rawRanges) || rawRanges.length === 0) return null;
  const out: Record<string, unknown>[] = [];
  for (const row of rawRanges) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const from = coerceYamlDateString(r.from ?? r.start ?? r.Start ?? r.from_date ?? r.fromDate);
    const to = coerceYamlDateString(r.to ?? r.end ?? r.End ?? r.to_date ?? r.toDate);
    if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) continue;
    const o: Record<string, unknown> = { from, to };
    if (r.label != null && String(r.label).trim() !== '') o.label = String(r.label).trim();
    out.push(o);
  }
  return out.length > 0 ? out : null;
}

/** @deprecated alias — use {@link extractYamlHolidayRangesForStorage} */
export function extractYamlSchoolRangesForStorage(block: Record<string, unknown>): Record<string, unknown>[] | null {
  return extractYamlHolidayRangesForStorage(block);
}

/** Normalised `dates:` list from a holiday block for `extra_settings.yaml_public_dates`. */
export function extractYamlHolidayExplicitDatesForStorage(block: Record<string, unknown>): string[] | null {
  const raw = block.dates;
  if (raw == null || !Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    const s = coerceYamlDateString(item);
    if (ISO_DAY.test(s)) out.push(s);
  }
  return out.length > 0 ? [...new Set(out)].sort() : null;
}

/** Normalise persisted `yaml_*_ranges` JSON for YAML assembly output. */
export function normalizeStoredYamlHolidayRanges(rangeList: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rangeList)) return [];
  const ranges: Record<string, unknown>[] = [];
  for (const raw of rangeList) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const from = String(r.from ?? r.start ?? '').trim();
    const to = String(r.to ?? r.end ?? '').trim();
    if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) continue;
    const row: Record<string, unknown> = { from, to };
    if (r.label != null && String(r.label).trim() !== '') row.label = String(r.label).trim();
    ranges.push(row);
  }
  return ranges;
}

/** All ISO days covered by stored YAML-style range rows. */
export function datesCoveredByYamlRanges(rangeList: unknown[]): Set<string> {
  const s = new Set<string>();
  if (!Array.isArray(rangeList)) return s;
  for (const raw of rangeList) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const from = String(r.from ?? r.start ?? '').trim();
    const to = String(r.to ?? r.end ?? '').trim();
    if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) continue;
    for (const d of expandIsoInclusiveRange(from, to)) s.add(d);
  }
  return s;
}
