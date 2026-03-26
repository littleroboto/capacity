/**
 * Tunable parameters for combined pressure (UI + persisted store as `riskTuning`).
 * Importances are relative — they are normalized to weights that sum to 1.
 */
/** Lab/team effective capacity on public or school holidays (fixed; not user-tunable). */
export const HOLIDAY_CAPACITY_SCALE = 0.5;

export type RiskModelTuning = {
  importanceTech: number;
  importanceStore: number;
  importanceCampaign: number;
  /** When &gt; 0, public or school holidays contribute directly to combined pressure (0–1 per day). */
  importanceHoliday: number;
  /** Kept for persisted blobs; always {@link HOLIDAY_CAPACITY_SCALE} after clamp. */
  holidayCapacityScale: number;
  /**
   * Peak multiplier on YAML-derived `store_pressure` in the first calendar week (post-payday lift), then easing
   * toward month-end. 1 = off. Typical ~1.15; capped at 2 in the UI/engine.
   */
  storePaydayMonthPeakMultiplier: number;
  /**
   * UI multiplier on each market’s effective `campaign_effect_scale` (YAML value or 1). Scales campaign risk and
   * store boosts during campaigns. 1 = match DSL; 0 = no campaign pressure from those channels.
   */
  campaignEffectUiMultiplier: number;
};

/** Legacy UI used 0–100 scaled by this delta to the old peak multiplier (for persisted state). */
const LEGACY_PAYDAY_RAMP_MAX_DELTA = 0.14;

/** Fixed “balanced” mix: Tech · Restaurant · Marketing · Resources (ratios only; normalized in engine). */
export const DEFAULT_RISK_TUNING: RiskModelTuning = {
  importanceTech: 30,
  importanceStore: 30,
  importanceCampaign: 30,
  importanceHoliday: 10,
  holidayCapacityScale: HOLIDAY_CAPACITY_SCALE,
  storePaydayMonthPeakMultiplier: 1.15,
  campaignEffectUiMultiplier: 1,
};

function resolvePaydayPeakMultiplier(
  partial: Partial<RiskModelTuning> & { storePaydayMonthRamp?: number }
): number {
  if (Object.prototype.hasOwnProperty.call(partial, 'storePaydayMonthRamp')) {
    const ramp = partial.storePaydayMonthRamp;
    if (ramp != null && Number.isFinite(ramp)) {
      const s = Math.min(1, Math.max(0, ramp / 100));
      if (s <= 0) return 1;
      return 1 + LEGACY_PAYDAY_RAMP_MAX_DELTA * s;
    }
    return 1;
  }
  if (
    partial.storePaydayMonthPeakMultiplier != null &&
    Number.isFinite(partial.storePaydayMonthPeakMultiplier)
  ) {
    return partial.storePaydayMonthPeakMultiplier;
  }
  return DEFAULT_RISK_TUNING.storePaydayMonthPeakMultiplier;
}

function clampPaydayPeakMultiplier(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_RISK_TUNING.storePaydayMonthPeakMultiplier;
  return Math.min(2, Math.max(1, Math.round(n * 1000) / 1000));
}

function clampCampaignEffectUiMultiplier(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_RISK_TUNING.campaignEffectUiMultiplier;
  const s = Math.round(n / 0.05) * 0.05;
  return Math.min(2.5, Math.max(0, Math.round(s * 100) / 100));
}

export function clampRiskTuning(
  partial: Partial<RiskModelTuning> & { storePaydayMonthRamp?: number }
): RiskModelTuning {
  const m = { ...DEFAULT_RISK_TUNING, ...partial };
  const clampI = (n: number) => Math.min(100, Math.max(0, Math.round(n * 100) / 100));
  return {
    importanceTech: clampI(m.importanceTech),
    importanceStore: clampI(m.importanceStore),
    importanceCampaign: clampI(m.importanceCampaign),
    importanceHoliday: clampI(m.importanceHoliday),
    holidayCapacityScale: HOLIDAY_CAPACITY_SCALE,
    storePaydayMonthPeakMultiplier: clampPaydayPeakMultiplier(resolvePaydayPeakMultiplier(partial)),
    campaignEffectUiMultiplier: clampCampaignEffectUiMultiplier(m.campaignEffectUiMultiplier),
  };
}

/** Normalized weights for the linear pressure blend (sum = 1). */
export function normalizedRiskWeights(t: RiskModelTuning): {
  tech: number;
  store: number;
  campaign: number;
  holiday: number;
} {
  const sum =
    t.importanceTech +
    t.importanceStore +
    t.importanceCampaign +
    t.importanceHoliday;
  if (sum <= 0) {
    return { tech: 0.3, store: 0.3, campaign: 0.3, holiday: 0.1 };
  }
  const inv = 1 / sum;
  return {
    tech: t.importanceTech * inv,
    store: t.importanceStore * inv,
    campaign: t.importanceCampaign * inv,
    holiday: t.importanceHoliday * inv,
  };
}
