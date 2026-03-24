import { parseDate } from '@/engine/calendar';

/**
 * Models higher in-store trading just after pay / start of month, tapering toward month-end.
 * `peakMultiplier` is the factor on YAML-derived `store_pressure` in the first calendar week (clamped ≥ 1).
 * 1 = off (flat). Month-end approaches `2 - peakMultiplier` symmetrically (same distance below 1 as peak is above).
 */
export function storePaydayMonthMultiplier(dateYmd: string, peakMultiplier: number): number {
  if (!Number.isFinite(peakMultiplier) || peakMultiplier <= 1) return 1;
  const M = Math.min(2, Math.max(1, peakMultiplier));
  const amplitude = M - 1;
  const d = parseDate(dateYmd);
  const y = d.getFullYear();
  const mo = d.getMonth();
  const dom = d.getDate();
  const L = new Date(y, mo + 1, 0).getDate();
  const weekLast = Math.min(7, L);
  if (dom <= weekLast) {
    return M;
  }
  const span = L - weekLast;
  if (span <= 0) return Math.max(0, 1 - amplitude);
  const u = (dom - weekLast) / span;
  return 1 + amplitude * (1 - 2 * u);
}
