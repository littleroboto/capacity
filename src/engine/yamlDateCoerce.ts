/**
 * js-yaml deserializes unquoted `YYYY-MM-DD` as JavaScript `Date` (UTC midnight in modern engines).
 * Using `getFullYear()` / `getMonth()` / `getDate()` shifts the **calendar day** west of UTC
 * (e.g. 15 Dec → 14 Dec in US), which makes deployment blackouts and other windows land in the wrong month.
 *
 * Rules:
 * - Plain `YYYY-MM-DD` strings pass through unchanged.
 * - `Date` values use **UTC** calendar components so the ISO calendar day matches the YAML source.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function coerceYamlDateString(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') {
    const t = v.trim();
    if (ISO_DAY.test(t)) return t;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}
