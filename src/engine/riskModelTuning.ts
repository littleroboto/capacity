/**
 * Tunable parameters for combined risk (UI + persisted store).
 * Importances are relative — they are normalized to weights that sum to 1.
 */
/** Lab/team effective capacity on public or school holidays (fixed; not user-tunable). */
export const HOLIDAY_CAPACITY_SCALE = 0.5;

export type RiskModelTuning = {
  importanceTech: number;
  importanceStore: number;
  importanceCampaign: number;
  /** When &gt; 0, public or school holidays contribute directly to combined risk (0–1 per day). */
  importanceHoliday: number;
  /** Kept for persisted blobs; always {@link HOLIDAY_CAPACITY_SCALE} after clamp. */
  holidayCapacityScale: number;
};

export const DEFAULT_RISK_TUNING: RiskModelTuning = {
  importanceTech: 60,
  importanceStore: 30,
  importanceCampaign: 10,
  importanceHoliday: 0,
  holidayCapacityScale: HOLIDAY_CAPACITY_SCALE,
};

export function clampRiskTuning(partial: Partial<RiskModelTuning>): RiskModelTuning {
  const m = { ...DEFAULT_RISK_TUNING, ...partial };
  const clampI = (n: number) => Math.min(100, Math.max(0, Math.round(n * 100) / 100));
  return {
    importanceTech: clampI(m.importanceTech),
    importanceStore: clampI(m.importanceStore),
    importanceCampaign: clampI(m.importanceCampaign),
    importanceHoliday: clampI(m.importanceHoliday),
    holidayCapacityScale: HOLIDAY_CAPACITY_SCALE,
  };
}

/** Normalized weights for the linear risk blend (sum = 1). */
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
    return { tech: 0.6, store: 0.3, campaign: 0.1, holiday: 0 };
  }
  const inv = 1 / sum;
  return {
    tech: t.importanceTech * inv,
    store: t.importanceStore * inv,
    campaign: t.importanceCampaign * inv,
    holiday: t.importanceHoliday * inv,
  };
}
