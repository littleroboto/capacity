/**
 * Helpers for admin "full section" editors — fragments arrive as PostgREST rows
 * (snake_case keys, JSON already parsed for JSONB columns).
 */

export const BAU_WEEKDAY_CODES = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;

/** Matches common market YAML for `bau.market_it_weekly_load.weekday_intensity`. */
export const BAU_INTENSITY_DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function readRowString(row: Record<string, unknown>, snake: string, camel?: string): string {
  const a = row[snake];
  if (a != null && a !== '') return String(a);
  if (camel) {
    const b = row[camel];
    if (b != null && b !== '') return String(b);
  }
  return '';
}

export function readRowNum(row: Record<string, unknown>, snake: string, camel?: string): number | null {
  const raw = row[snake] ?? (camel ? row[camel] : undefined);
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function readRowBool(row: Record<string, unknown>, snake: string, camel?: string): boolean {
  const raw = row[snake] ?? (camel ? row[camel] : undefined);
  return Boolean(raw);
}

/** JSONB object or null. */
export function readRowObject(row: Record<string, unknown>, snake: string, camel?: string): Record<string, unknown> | null {
  const raw = row[snake] ?? (camel ? row[camel] : undefined);
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

export function readRowArray<T = unknown>(row: Record<string, unknown>, snake: string, camel?: string): T[] | null {
  const raw = row[snake] ?? (camel ? row[camel] : undefined);
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw as T[]) : null;
}

export function stringifyJson(value: unknown, emptyFallback = '{}'): string {
  try {
    if (value == null) return emptyFallback;
    return JSON.stringify(value, null, 2);
  } catch {
    return emptyFallback;
  }
}

export function parseJsonObject(text: string, label: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: true, value: {} };
  try {
    const v = JSON.parse(t) as unknown;
    if (v == null || typeof v !== 'object' || Array.isArray(v)) {
      return { ok: false, error: `${label} must be a JSON object` };
    }
    return { ok: true, value: v as Record<string, unknown> };
  } catch {
    return { ok: false, error: `${label}: invalid JSON` };
  }
}

export function parseJsonArray(text: string, label: string): { ok: true; value: unknown[] } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: true, value: [] };
  try {
    const v = JSON.parse(t) as unknown;
    if (!Array.isArray(v)) return { ok: false, error: `${label} must be a JSON array` };
    return { ok: true, value: v };
  } catch {
    return { ok: false, error: `${label}: invalid JSON` };
  }
}

export function parseOptionalInt(s: string, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = s.trim();
  if (!t) return { ok: true, value: null };
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a whole number` };
  return { ok: true, value: n };
}

export function parseOptionalFloat(s: string, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = s.trim();
  if (!t) return { ok: true, value: null };
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number` };
  return { ok: true, value: n };
}

export function parseRequiredInt(s: string, label: string): { ok: true; value: number } | { ok: false; error: string } {
  const t = s.trim();
  if (!t) return { ok: false, error: `${label} is required` };
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a whole number` };
  return { ok: true, value: n };
}

export function parseRequiredFloat(s: string, label: string): { ok: true; value: number } | { ok: false; error: string } {
  const t = s.trim();
  if (!t) return { ok: false, error: `${label} is required` };
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number` };
  return { ok: true, value: n };
}
