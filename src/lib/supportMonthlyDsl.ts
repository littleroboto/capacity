/**
 * Jan–Dec multipliers under `tech.support_monthly_pattern` only (not `trading.monthly_pattern`).
 * Reuses the same numeric helpers as store trading months — values are written only inside the `tech:` block.
 */
export {
  TRADING_MONTH_KEYS as SUPPORT_MONTH_KEYS,
  type TradingMonthKey as SupportMonthKey,
  roundMonthlyUnit as roundSupportMonthlyUnit,
  fullTradingMonthlyPatternFromPartial as fullSupportMonthlyPatternFromPartial,
} from '@/lib/tradingMonthlyDsl';
