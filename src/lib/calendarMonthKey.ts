import { TRADING_MONTH_KEYS, type TradingMonthKey } from '@/lib/tradingMonthlyDsl';

/** ISO calendar date `YYYY-MM-DD` → `Jan`…`Dec` for capacity / trading month lookups. */
export function tradingMonthKeyFromIsoDate(iso: string): TradingMonthKey {
  const m = iso.slice(5, 7);
  const i = parseInt(m, 10);
  if (i >= 1 && i <= 12) return TRADING_MONTH_KEYS[i - 1]!;
  return 'Jan';
}
