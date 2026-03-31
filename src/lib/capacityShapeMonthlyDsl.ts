import { TRADING_MONTH_KEYS, type TradingMonthKey } from '@/lib/tradingMonthlyDsl';

export { TRADING_MONTH_KEYS as CAPACITY_SHAPE_MONTH_KEYS, type TradingMonthKey as CapacityShapeMonthKey };

/** Relative lab / staff headcount vs YAML baseline (`resources.*.capacity`). Default 1 = no change. */
export const CAPACITY_SHAPE_MIN = 0.1;
export const CAPACITY_SHAPE_MAX = 5;
export const CAPACITY_SHAPE_DEFAULT = 1;

/** Share of (month-shaped) nominal lab+team capacity counted toward runway denominators. Default 1. */
export const AVAILABLE_CAPACITY_MIN = 0.05;
export const AVAILABLE_CAPACITY_MAX = 1;
export const AVAILABLE_CAPACITY_DEFAULT = 1;

export function roundCapacityShapeUnit(n: number): number {
  if (!Number.isFinite(n)) return CAPACITY_SHAPE_DEFAULT;
  const c = Math.min(CAPACITY_SHAPE_MAX, Math.max(CAPACITY_SHAPE_MIN, n));
  return Math.round(c * 1000) / 1000;
}

export function roundAvailableCapacityUnit(n: number): number {
  if (!Number.isFinite(n)) return AVAILABLE_CAPACITY_DEFAULT;
  const c = Math.min(AVAILABLE_CAPACITY_MAX, Math.max(AVAILABLE_CAPACITY_MIN, n));
  return Math.round(c * 1000) / 1000;
}

function coerceCapacityShapeValue(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return CAPACITY_SHAPE_DEFAULT;
  return roundCapacityShapeUnit(n);
}

function coerceAvailableValue(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return AVAILABLE_CAPACITY_DEFAULT;
  return roundAvailableCapacityUnit(n);
}

export function fullCapacityShapeMonthlyFromPartial(
  partial?: Record<string, unknown> | undefined
): Record<TradingMonthKey, number> {
  const out = {} as Record<TradingMonthKey, number>;
  for (const m of TRADING_MONTH_KEYS) {
    out[m] = coerceCapacityShapeValue(partial?.[m]);
  }
  return out;
}

/** Staff: absolute FTE per month, or baseline FTE when a month is omitted in YAML. */
export function fullStaffCapacityMonthlyFromPartial(
  partial: Record<string, unknown> | undefined,
  teamBaseline: number
): Record<TradingMonthKey, number> {
  const fb = Math.round(Math.max(0, teamBaseline));
  const out = {} as Record<TradingMonthKey, number>;
  for (const m of TRADING_MONTH_KEYS) {
    const v = partial?.[m];
    const n = Number(v);
    out[m] = v != null && Number.isFinite(n) ? Math.min(50, Math.max(0, Math.round(n))) : fb;
  }
  return out;
}

export function fullAvailableCapacityMonthlyFromPartial(
  partial?: Record<string, unknown> | undefined
): Record<TradingMonthKey, number> {
  const out = {} as Record<TradingMonthKey, number>;
  for (const m of TRADING_MONTH_KEYS) {
    out[m] = coerceAvailableValue(partial?.[m]);
  }
  return out;
}

export function clampHolidayStaffingUi(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0.12, Math.round(n * 1000) / 1000));
}
