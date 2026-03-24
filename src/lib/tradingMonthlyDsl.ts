/** Canonical month keys for `trading.monthly_pattern` (store / business load shape). */
export const TRADING_MONTH_KEYS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export type TradingMonthKey = (typeof TRADING_MONTH_KEYS)[number];

export const TRADING_MONTH_DEFAULT_UNIT = 1;

export function clampMonthlyUnit(n: number): number {
  if (!Number.isFinite(n)) return TRADING_MONTH_DEFAULT_UNIT;
  return Math.min(1, Math.max(0, n));
}

export function roundMonthlyUnit(n: number): number {
  return Math.round(clampMonthlyUnit(n) * 1000) / 1000;
}

function coerceMonthValue(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return TRADING_MONTH_DEFAULT_UNIT;
  return roundMonthlyUnit(n);
}

/** Full year with defaults: missing keys → 1 (neutral vs weekly store level). */
export function fullTradingMonthlyPatternFromPartial(
  partial?: Record<string, unknown> | undefined
): Record<TradingMonthKey, number> {
  const out = {} as Record<TradingMonthKey, number>;
  for (const m of TRADING_MONTH_KEYS) {
    const raw = partial?.[m];
    out[m] = raw === undefined || raw === null ? TRADING_MONTH_DEFAULT_UNIT : coerceMonthValue(raw);
  }
  return out;
}
