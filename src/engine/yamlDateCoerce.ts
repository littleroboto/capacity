/**
 * js-yaml deserializes unquoted `YYYY-MM-DD` as JavaScript `Date`. `String(date)` is not ISO and breaks
 * `parseDate()` / lexicographic window checks in the pipeline.
 */
export function coerceYamlDateString(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}
