import { parseTechRhythmScalar } from '@/engine/techWeeklyPattern';

/** Canonical day keys for `tech.weekly_pattern` (matches parser / phase engine weekday names). */
export const TECH_WEEKLY_DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type TechWeeklyDayKey = (typeof TECH_WEEKLY_DAY_KEYS)[number];

export const TECH_WEEKLY_PATTERN_DEFAULT_UNIT = 0.5;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return TECH_WEEKLY_PATTERN_DEFAULT_UNIT;
  return Math.min(1, Math.max(0, n));
}

/** Quantise for YAML + stable pointer comparisons (3 decimal places). */
export function roundTechUnit(n: number): number {
  return Math.round(clamp01(n) * 1000) / 1000;
}

/** Coerce a single day value from config (number or legacy string). */
export function coerceTechWeeklyDayValue(v: unknown): number {
  const p = parseTechRhythmScalar(v);
  return p != null ? p : TECH_WEEKLY_PATTERN_DEFAULT_UNIT;
}

export function fullTechWeeklyPatternFromPartial(
  partial?: Record<string, unknown> | undefined
): Record<TechWeeklyDayKey, number> {
  const out = {} as Record<TechWeeklyDayKey, number>;
  for (const d of TECH_WEEKLY_DAY_KEYS) {
    out[d] = roundTechUnit(coerceTechWeeklyDayValue(partial?.[d]));
  }
  return out;
}

/** Pointer Y within chart rect → 0–1 (top of chart = 1). */
export function yRelToUnit(relY: number, height: number): number {
  if (height <= 0) return TECH_WEEKLY_PATTERN_DEFAULT_UNIT;
  const t = relY / height;
  const clamped = Math.min(1, Math.max(0, t));
  return roundTechUnit(1 - clamped);
}
