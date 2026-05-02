/**
 * Reusable envelopes and seasonal curves for DSL-driven capacity / trading signals.
 * YAML references these via `envelope`, `ramp_in_days` / `ramp_out_days`, and `trading.seasonal`.
 */

export type EnvelopeKind = 'step' | 'linear' | 'smoothstep';

export function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** Hermite smoothstep on [0,1]. */
export function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * Weight for day `dayIndex` in a window of `totalDays` calendar rows (0 .. totalDays-1).
 * Ramps up over the first `rampIn` days and down over the last `rampOut` days.
 */
export function segmentEnvelopeWeight(
  dayIndex: number,
  totalDays: number,
  rampIn: number,
  rampOut: number,
  kind: EnvelopeKind
): number {
  if (totalDays <= 0) return 1;
  if (kind === 'step') return 1;
  const ri = Math.max(0, rampIn);
  const ro = Math.max(0, rampOut);
  const curve = kind === 'smoothstep' ? smoothstep01 : clamp01;
  const wIn = ri <= 0 ? 1 : curve(clamp01((dayIndex + 0.5) / ri));
  const wOut = ro <= 0 ? 1 : curve(clamp01((totalDays - dayIndex - 0.5) / ro));
  return clamp01(Math.min(wIn, wOut));
}

/**
 * Multiplier applied to base store-trading pressure: ~`1 + amplitude` at `peak_month`, ~`1 - amplitude` opposite season.
 * `peak_month`: 1–12 (e.g. 7 = July).
 */
export function seasonalTradingFactor(isoDate: string, peakMonth: number, amplitude: number): number {
  if (amplitude <= 0 || !Number.isFinite(amplitude)) return 1;
  const pm = Math.min(12, Math.max(1, Math.round(peakMonth)));
  const parts = isoDate.split('-').map(Number);
  const m = parts[1];
  if (!Number.isFinite(m) || m < 1 || m > 12) return 1;
  const angle = ((m - pm) / 12) * 2 * Math.PI;
  return 1 + amplitude * Math.cos(angle);
}

/** Gregorian Christmas (closure modelling); same calendar for all markets in this model. */
export function isGregorianChristmasDay(isoDate: string): boolean {
  return /^\d{4}-12-25$/.test(isoDate);
}

/**
 * December retail season on **in-store trading pressure** (all markets): ramp from 1 Dec through Christmas Eve,
 * then **stay hot** through month-end (incl. 25 Dec) so December reads as one consistently stressed band on the runway.
 * {@link DECEMBER_STORE_PRESSURE_FLOOR} keeps low YAML trading days from printing “cool” tiles mid-month.
 * Peak extra lift ≈ {@link DECEMBER_RETAIL_STORE_BUMP}. Applied after `weekly_pattern` and optional `trading.seasonal`.
 */
export const DECEMBER_RETAIL_STORE_BUMP = 0.22;
/** Floor (0–1) on store pressure for every day in December after the December bump. */
export const DECEMBER_STORE_PRESSURE_FLOOR = 0.78;

export function applyDecemberRestaurantSeasoning(isoDate: string, storePressure01: number): number {
  const p = Math.min(1, Math.max(0, storePressure01));
  const parts = isoDate.split('-').map(Number);
  const m = parts[1];
  const day = parts[2];
  if (!Number.isFinite(m) || !Number.isFinite(day)) return p;
  if (m !== 12) return p;

  const peakMult = 1 + DECEMBER_RETAIL_STORE_BUMP;

  if (day >= 1 && day <= 24) {
    const t = clamp01((day - 1) / 23);
    const mult = 1 + DECEMBER_RETAIL_STORE_BUMP * smoothstep01(t);
    const out = Math.min(1, p * mult);
    return Math.min(1, Math.max(DECEMBER_STORE_PRESSURE_FLOOR, out));
  }

  // 25–31: peak-season multiplier + same floor (no “closed” zero tile; year-end stays in the red band)
  const out = Math.min(1, p * peakMult);
  return Math.min(1, Math.max(DECEMBER_STORE_PRESSURE_FLOOR, out));
}

/**
 * Australia: southern summer + long school holidays add a modest extra lift **late Dec–Jan** on top of global
 * December seasoning. Kept smaller than historical tuning so the overall holiday bump stays moderate.
 */
export function applyAustraliaPostChristmasSummerLift(isoDate: string, storePressure01: number): number {
  const p = Math.min(1, Math.max(0, storePressure01));
  const parts = isoDate.split('-').map(Number);
  const m = parts[1];
  const day = parts[2];
  if (!Number.isFinite(m) || !Number.isFinite(day)) return p;
  if (m === 12 && day >= 26) {
    const t = clamp01((day - 26) / 5);
    const mult = 1 + 0.06 * smoothstep01(t);
    return Math.min(1, p * mult);
  }
  if (m === 1 && day <= 28) {
    const t = clamp01((28 - day) / 28);
    const mult = 1 + 0.1 * smoothstep01(t);
    return Math.min(1, p * mult);
  }
  return p;
}

/** ISO date → local calendar day (consistent with `calendar.ts`). */
export function parseIsoDate(iso: string): Date {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d);
}

/** Inclusive calendar days from `start` through `end` (`YYYY-MM-DD`). */
export function inclusiveDayCount(start: string, end: string): number {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** 0-based index of `date` within inclusive `[start, end]`, or null if outside. */
export function inclusiveWindowSpan(
  start: string,
  end: string,
  date: string
): { dayIndex: number; totalDays: number } | null {
  if (date < start || date > end) return null;
  return {
    dayIndex: Math.round((parseIsoDate(date).getTime() - parseIsoDate(start).getTime()) / 86_400_000),
    totalDays: inclusiveDayCount(start, end),
  };
}

function calendarDaysBetween(a: string, b: string): number {
  const da = parseIsoDate(a);
  const db = parseIsoDate(b);
  return Math.round(Math.abs(db.getTime() - da.getTime()) / 86_400_000);
}

/**
 * 1 on exact holiday dates, decays to 0 `taperDays` away (linear distance, optional smoothstep).
 */
export function holidayProximityStrength(
  dateStr: string,
  holidayDates: Set<string>,
  taperDays: number,
  edge: EnvelopeKind = 'linear'
): number {
  if (holidayDates.has(dateStr)) return 1;
  if (taperDays <= 0) return 0;
  let best = 0;
  for (const h of holidayDates) {
    const dist = calendarDaysBetween(dateStr, h);
    if (dist > taperDays) continue;
    const t = clamp01(1 - dist / taperDays);
    const w = edge === 'smoothstep' ? smoothstep01(t) : t;
    if (w > best) best = w;
  }
  return clamp01(best);
}

/**
 * 0–1 weight for days **strictly before** the next public holiday: strongest the calendar day
 * immediately prior, fading to 0 at `taperDays` before that holiday. Public holiday dates return 0.
 */
export function upcomingPublicHolidayPrepStrength(
  dateStr: string,
  publicHolidayDates: Set<string>,
  taperDays: number
): number {
  if (taperDays <= 0 || publicHolidayDates.has(dateStr)) return 0;
  let best = 0;
  for (const h of publicHolidayDates) {
    if (h <= dateStr) continue;
    const dist = calendarDaysBetween(dateStr, h);
    if (dist < 1 || dist > taperDays) continue;
    const t = clamp01(1 - (dist - 1) / taperDays);
    const w = smoothstep01(t);
    if (w > best) best = w;
  }
  return clamp01(best);
}

/** Blend multiplicative factor: `1 + (mult - 1) * weight`. When weight=0 → 1; weight=1 → mult. */
export function blendTowardMultiplier(mult: number, weight: number): number {
  if (!Number.isFinite(mult)) return 1;
  const w = clamp01(weight);
  return 1 + (mult - 1) * w;
}
