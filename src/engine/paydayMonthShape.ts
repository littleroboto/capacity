/**
 * Early-month **store-trading** multiplier on top of YAML weekly/monthly rhythm.
 *
 * Two shapes are supported:
 * - **Legacy** {@link storePaydayMonthMultiplier}: one peak, week-1 plateau, linear fade to 1× by day 21.
 * - **Knot curve** {@link storePaydayMonthMultiplierFromKnots}: four independent multipliers on DOM 4/11/18/25
 *   (UI W1–W4), piecewise linear, then fade to 1× by month-end — see pipeline precedence vs YAML.
 */
import { parseDate } from '@/engine/calendar';

/** Last day of calendar week 1 (days 1–7). */
const WEEK1_LAST_DOM = 7;
/** Last day we taper; from day 22 onward multiplier is 1×. */
const TAPER_END_DOM = 21;

/** Sample dates (January) used for UI sparkline — DOM 4, 11, 18, 25. */
export const PAYDAY_KNOT_SAMPLE_DATES = [
  '2025-01-04',
  '2025-01-11',
  '2025-01-18',
  '2025-01-25',
] as const;

export type PaydayKnotTuple = readonly [number, number, number, number];

function clampPaydayMult(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(1, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Piecewise-linear early-month curve from four knot multipliers (≥1) on DOM 4, 11, 18, 25.
 * DOM 1–4 flat at knot[0]; linear between knots; after DOM 25 linear to 1× by month-end.
 */
export function storePaydayMonthMultiplierFromKnots(dateYmd: string, knots: PaydayKnotTuple): number {
  const [k0, k1, k2, k3] = knots.map(clampPaydayMult) as [number, number, number, number];
  const d = parseDate(dateYmd);
  const dom = d.getDate();
  const lastDom = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  if (dom <= 4) return k0;
  if (dom <= 11) return lerp(k0, k1, (dom - 4) / (11 - 4));
  if (dom <= 18) return lerp(k1, k2, (dom - 11) / (18 - 11));
  if (dom <= 25) return lerp(k2, k3, (dom - 18) / (25 - 18));
  if (lastDom <= 25) return k3;
  return lerp(k3, 1, (dom - 25) / (lastDom - 25));
}

/** Build knot tuple that matches the legacy single-peak taper at the four sample DOMs. */
export function knotsFromLegacyPeakMultiplier(peakMultiplier: number): [number, number, number, number] {
  const p = clampPaydayMult(peakMultiplier <= 1 ? 1 : peakMultiplier);
  return PAYDAY_KNOT_SAMPLE_DATES.map((ymd) => storePaydayMonthMultiplier(ymd, p)) as [
    number,
    number,
    number,
    number,
  ];
}

export function isPaydayKnotTuple(v: unknown): v is PaydayKnotTuple {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every((x) => typeof x === 'number' && Number.isFinite(x))
  );
}

/**
 * Early-month store boost on YAML-derived store rhythm: full **peak** on days **1–7**, linear fade to **1×** by end of
 * **day 21** (through calendar week 3), then flat for the rest of the month.
 * `peakMultiplier` is clamped to **1–2**; **1** = off (no boost).
 */
export function storePaydayMonthMultiplier(dateYmd: string, peakMultiplier: number): number {
  if (!Number.isFinite(peakMultiplier) || peakMultiplier <= 1) return 1;
  const M = Math.min(2, Math.max(1, peakMultiplier));
  const dom = parseDate(dateYmd).getDate();
  if (dom <= WEEK1_LAST_DOM) return M;
  if (dom > TAPER_END_DOM) return 1;
  const taperStart = WEEK1_LAST_DOM + 1;
  const span = TAPER_END_DOM - taperStart;
  if (span <= 0) return 1;
  const u = (dom - taperStart) / span;
  return M + u * (1 - M);
}
