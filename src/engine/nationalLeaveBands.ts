import type { NationalLeaveBand, NationalLeaveWeekSlice } from './types';
import { coerceYamlDateString } from './yamlDateCoerce';

const MULT_MIN = 0.05;
const MULT_MAX = 1.5;

export function addIsoCalendarDays(iso: string, deltaDays: number): string {
  const parts = iso.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function clampMult(n: number): number {
  return Math.min(MULT_MAX, Math.max(MULT_MIN, n));
}

function parseWeekSlices(raw: unknown): NationalLeaveWeekSlice[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: NationalLeaveWeekSlice[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const weekStart = coerceYamlDateString(row.week_start ?? row.weekStart);
    const cmRaw = row.capacity_multiplier ?? row.capacityMultiplier;
    const cm = Number(cmRaw);
    if (!weekStart || cmRaw == null || cmRaw === '' || !Number.isFinite(cm) || cm < 0) continue;
    out.push({ weekStart, capacityMultiplier: clampMult(cm) });
  }
  return out.length ? out.sort((a, b) => a.weekStart.localeCompare(b.weekStart)) : undefined;
}

/**
 * YAML `national_leave_bands` → typed bands. Invalid rows are skipped.
 */
export function parseNationalLeaveBands(raw: unknown): NationalLeaveBand[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: NationalLeaveBand[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const from = coerceYamlDateString(row.from ?? row.from_date ?? row.fromDate);
    const to = coerceYamlDateString(row.to ?? row.to_date ?? row.toDate ?? row.until);
    if (!from || !to || from > to) continue;
    const flatRaw = row.capacity_multiplier ?? row.capacityMultiplier;
    const flatN = Number(flatRaw);
    const flat =
      flatRaw != null && flatRaw !== '' && Number.isFinite(flatN) && flatN >= 0
        ? clampMult(flatN)
        : undefined;
    const weeks = parseWeekSlices(row.weeks);
    if (flat == null && !weeks?.length) continue;
    const id = row.id != null && String(row.id).trim() ? String(row.id).trim() : undefined;
    const label = row.label != null && String(row.label).trim() ? String(row.label).trim() : undefined;
    out.push({
      id,
      label,
      from,
      to,
      ...(flat != null ? { capacityMultiplier: flat } : {}),
      ...(weeks?.length ? { weeks } : {}),
    });
  }
  return out.length ? out : undefined;
}

function multiplierForDayInBand(b: NationalLeaveBand, date: string): number {
  const weeks = b.weeks;
  if (weeks?.length) {
    let best: number | undefined;
    for (const w of weeks) {
      const wEnd = addIsoCalendarDays(w.weekStart, 6);
      if (date >= w.weekStart && date <= wEnd) {
        best = best == null ? w.capacityMultiplier : Math.min(best, w.capacityMultiplier);
      }
    }
    if (best != null) return best;
  }
  const fb = b.capacityMultiplier;
  return fb != null && Number.isFinite(fb) ? clampMult(fb) : 1;
}

/**
 * Product of all bands that cover `date` (lab+team effective cap multiplier).
 */
export function nationalLeaveLabTeamCapMult(bands: NationalLeaveBand[] | undefined, date: string): number {
  if (!bands?.length) return 1;
  let m = 1;
  for (const b of bands) {
    if (date < b.from || date > b.to) continue;
    m *= multiplierForDayInBand(b, date);
  }
  return clampMult(m);
}
