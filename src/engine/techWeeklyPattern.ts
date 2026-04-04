const WEEKLY_PATTERN_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKLY_PATTERN_DAY_SET = new Set<string>(WEEKLY_PATTERN_DAYS);
const WEEKLY_PATTERN_META = new Set(['default', '_default', 'weekdays', 'weekend']);

/** Named levels map to the same numeric scale as `weekday_intensity` / legacy `weekly_pattern` strings. */
export const TECH_RHYTHM_NAMED_LEVEL: Record<string, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  very_high: 1,
};

/**
 * Parse a single weekday map value (e.g. `weekday_intensity` / `weekly_pattern`): number in [0, 1], named level, or numeric string.
 */
export function parseTechRhythmScalar(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.min(1, Math.max(0, v));
  }
  const s = String(v).trim();
  if (!s.length) return undefined;
  const nk = s.toLowerCase().replace(/\s+/g, '_');
  if (nk in TECH_RHYTHM_NAMED_LEVEL) return TECH_RHYTHM_NAMED_LEVEL[nk]!;
  const n = Number(s);
  if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  return undefined;
}

/**
 * Expand compact weekday map to per-day numeric [0, 1] (trading, Market IT rhythm, extra support).
 * Supports `default` / `weekdays` / `weekend` and explicit Mon–Sun (numbers or named levels).
 */
export function expandTechWeeklyPattern(
  raw: Record<string, unknown> | undefined
): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const out: Record<string, number> = {};

  const dft = parseTechRhythmScalar(raw.default ?? raw._default);
  if (dft != null) {
    for (const day of WEEKLY_PATTERN_DAYS) out[day] = dft;
  }

  const wkd = parseTechRhythmScalar(raw.weekdays);
  if (wkd != null) {
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const) {
      out[day] = wkd;
    }
  }

  const wend = parseTechRhythmScalar(raw.weekend);
  if (wend != null) {
    out.Sat = wend;
    out.Sun = wend;
  }

  for (const [k, v] of Object.entries(raw)) {
    if (WEEKLY_PATTERN_META.has(k)) continue;
    if (!WEEKLY_PATTERN_DAY_SET.has(k)) continue;
    const n = parseTechRhythmScalar(v);
    if (n != null) out[k] = n;
  }

  return Object.keys(out).length ? out : undefined;
}
