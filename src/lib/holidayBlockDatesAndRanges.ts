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
