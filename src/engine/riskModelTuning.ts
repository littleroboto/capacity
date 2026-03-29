/**
 * Tunable parameters for combined pressure (UI + persisted store as `riskTuning`).
 * Importances are relative — they are normalized to weights that sum to 1.
 */
import { knotsFromLegacyPeakMultiplier, type PaydayKnotTuple } from '@/engine/paydayMonthShape';
import { isRunwayAllMarkets } from '@/lib/markets';

/** Lab/team effective capacity on public or school holidays (fixed; not user-tunable). */
export const HOLIDAY_CAPACITY_SCALE = 0.5;

/**
 * Hard cap for store-trading outputs after early-month boost and campaign amplification (aligned with
 * `campaign_effect_scale` UI clamp). Values above 1 are visible in Business lens / tooltips; combined
 * `risk_score` still clamps to 1.
 */
export const STORE_PRESSURE_MAX = 2.5;

export type RiskModelTuning = {
  importanceTech: number;
  importanceStore: number;
  importanceCampaign: number;
  /** When &gt; 0, public or school holidays contribute directly to combined pressure (0–1 per day). */
  importanceHoliday: number;
  /** Kept for persisted blobs; always {@link HOLIDAY_CAPACITY_SCALE} after clamp. */
  holidayCapacityScale: number;
  /**
   * Peak multiplier on YAML-derived `store_pressure` in calendar week 1; fades to 1× by end of week 3 (day 21), then
   * stays 1×. 1 = off. Typical ~1.15; capped at 2 in the UI/engine.
   * Kept in sync with {@link storePaydayMonthKnotMultipliers}[0] for legacy readers / single-knob YAML.
   */
  storePaydayMonthPeakMultiplier: number;
  /**
   * Independent knot multipliers (1–2) on DOM 4, 11, 18, 25 — global UI curve; see `storePaydayMonthMultiplierFromKnots`.
   */
  storePaydayMonthKnotMultipliers: PaydayKnotTuple;
  /**
   * UI multiplier on each market’s effective `campaign_effect_scale` (YAML value or 1). Scales campaign risk and
   * store boosts during campaigns. 1 = match DSL; 0 = no campaign pressure from those channels.
   */
  campaignEffectUiMultiplier: number;
};

/** Legacy UI used 0–100 scaled by this delta to the old peak multiplier (for persisted state). */
const LEGACY_PAYDAY_RAMP_MAX_DELTA = 0.14;

const DEFAULT_PAYDAY_PEAK = 1.15;

/** Fixed “balanced” mix: Tech · Restaurant · Marketing · Resources (ratios only; normalized in engine). */
export const DEFAULT_RISK_TUNING: RiskModelTuning = {
  importanceTech: 30,
  importanceStore: 30,
  importanceCampaign: 30,
  importanceHoliday: 10,
  holidayCapacityScale: HOLIDAY_CAPACITY_SCALE,
  storePaydayMonthPeakMultiplier: DEFAULT_PAYDAY_PEAK,
  storePaydayMonthKnotMultipliers: knotsFromLegacyPeakMultiplier(DEFAULT_PAYDAY_PEAK),
  campaignEffectUiMultiplier: 1,
};

/**
 * LIOM (all markets / compare runway): use max campaign-effect multiplier so columns show full campaign lift.
 * Matches {@link clampCampaignEffectUiMultiplier} upper bound used in the pipeline.
 */
export const LIOM_CAMPAIGN_EFFECT_UI_MULTIPLIER = 2.5;

/** Tuning passed into {@link runPipelineFromDsl}: boosts campaign scaling when the header picker is all markets. */
export function riskTuningForPipelineView(
  tuning: RiskModelTuning,
  pickerCountry: string
): RiskModelTuning {
  if (!isRunwayAllMarkets(pickerCountry)) return tuning;
  return { ...tuning, campaignEffectUiMultiplier: LIOM_CAMPAIGN_EFFECT_UI_MULTIPLIER };
}

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

function clampPaydayKnotTuple(k: readonly number[]): PaydayKnotTuple {
  const a = k.map((n) =>
    !Number.isFinite(n) ? 1 : Math.min(2, Math.max(1, Math.round(n * 1000) / 1000))
  );
  return [a[0]!, a[1]!, a[2]!, a[3]!];
}

function clampCampaignEffectUiMultiplier(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_RISK_TUNING.campaignEffectUiMultiplier;
  const s = Math.round(n / 0.05) * 0.05;
  return Math.min(2.5, Math.max(0, Math.round(s * 100) / 100));
}

function buildRiskTuning(m: Partial<RiskModelTuning> & { storePaydayMonthRamp?: number }): RiskModelTuning {
  const merged = { ...DEFAULT_RISK_TUNING, ...m };
  const clampI = (n: number) => Math.min(100, Math.max(0, Math.round(n * 100) / 100));
  const knots = clampPaydayKnotTuple(merged.storePaydayMonthKnotMultipliers!);
  const peak = clampPaydayPeakMultiplier(knots[0]!);
  return {
    importanceTech: clampI(merged.importanceTech),
    importanceStore: clampI(merged.importanceStore),
    importanceCampaign: clampI(merged.importanceCampaign),
    importanceHoliday: clampI(merged.importanceHoliday),
    holidayCapacityScale: HOLIDAY_CAPACITY_SCALE,
    storePaydayMonthKnotMultipliers: knots,
    storePaydayMonthPeakMultiplier: peak,
    campaignEffectUiMultiplier: clampCampaignEffectUiMultiplier(merged.campaignEffectUiMultiplier),
  };
}

/**
 * Merge persisted or scenario slices with defaults. Knot tuple is used only when explicitly present on `p`;
 * otherwise knots are derived from the legacy peak fields.
 */
export function riskTuningFromPersisted(
  p: Partial<RiskModelTuning> & { storePaydayMonthRamp?: number } | undefined
): RiskModelTuning {
  const mergedBase = { ...DEFAULT_RISK_TUNING, ...(p ?? {}) };
  const hasValidKnots =
    p != null &&
    Array.isArray(p.storePaydayMonthKnotMultipliers) &&
    p.storePaydayMonthKnotMultipliers.length === 4 &&
    p.storePaydayMonthKnotMultipliers.every((x) => Number.isFinite(x));
  const knots: PaydayKnotTuple = hasValidKnots
    ? clampPaydayKnotTuple(p.storePaydayMonthKnotMultipliers!)
    : knotsFromLegacyPeakMultiplier(
        clampPaydayPeakMultiplier(resolvePaydayPeakMultiplier(mergedBase))
      );
  return buildRiskTuning({ ...mergedBase, storePaydayMonthKnotMultipliers: knots, storePaydayMonthPeakMultiplier: knots[0]! });
}

/**
 * Merge one `setRiskTuning` patch into the current snapshot.
 * - Patch includes `storePaydayMonthKnotMultipliers` → replace the whole knot tuple (independent W1–W4 UI).
 * - Patch includes only legacy peak / ramp → rebuild knots from that peak (old single-knob behaviour).
 * - Otherwise → keep existing knots (e.g. importance-only updates).
 */
export function applyRiskTuningPatch(
  prev: RiskModelTuning,
  patch: Partial<RiskModelTuning> & { storePaydayMonthRamp?: number }
): RiskModelTuning {
  let knots = prev.storePaydayMonthKnotMultipliers;
  if (Object.prototype.hasOwnProperty.call(patch, 'storePaydayMonthKnotMultipliers')) {
    knots = clampPaydayKnotTuple(patch.storePaydayMonthKnotMultipliers!);
  } else if (
    Object.prototype.hasOwnProperty.call(patch, 'storePaydayMonthPeakMultiplier') ||
    Object.prototype.hasOwnProperty.call(patch, 'storePaydayMonthRamp')
  ) {
    const peakResolved = clampPaydayPeakMultiplier(resolvePaydayPeakMultiplier({ ...prev, ...patch }));
    knots = knotsFromLegacyPeakMultiplier(peakResolved);
  }
  return buildRiskTuning({
    ...prev,
    ...patch,
    storePaydayMonthKnotMultipliers: knots,
    storePaydayMonthPeakMultiplier: knots[0]!,
  });
}

/** @deprecated Prefer {@link riskTuningFromPersisted} or {@link applyRiskTuningPatch}. */
export function clampRiskTuning(
  partial: Partial<RiskModelTuning> & { storePaydayMonthRamp?: number }
): RiskModelTuning {
  return riskTuningFromPersisted(partial);
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
