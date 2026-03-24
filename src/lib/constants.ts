/** Rolling model horizon from current quarter start (≥ 1 calendar year of coverage). */
export const MODEL_MONTHS = 15;

/** Five calendar quarters ≈ MODEL_MONTHS. */
export const MODEL_QUARTERS = 5;

/** @deprecated Use MODEL_MONTHS */
export const HORIZON_MONTHS = MODEL_MONTHS;

export const RISK_BANDS = {
  low: { max: 0.33, label: 'Low' },
  medium: { min: 0.33, max: 0.66, label: 'Medium' },
  high: { min: 0.66, label: 'High' },
} as const;

export const VIEW_MODES = [
  {
    id: 'combined',
    label: 'Combined',
    title: 'One score from the weighted blend of tech, restaurant, marketing, and holiday factors.',
  },
  {
    id: 'technology',
    label: 'Tech effort',
    title:
      'Labs, teams, and backend under change and live load. Tech typically leads timelines and overlaps business peaks to support delivery.',
  },
  {
    id: 'in_store',
    label: 'Business',
    title: 'Restaurant trading, marketing windows, and holiday rhythm — demand and activity in the business.',
  },
] as const;

export type ViewModeId = (typeof VIEW_MODES)[number]['id'];

/** Map persisted / legacy layer ids to the three runway lenses. */
export function normalizeViewModeId(raw: string | null): ViewModeId {
  if (!raw) return 'combined';
  const legacy: Record<string, ViewModeId> = {
    combined: 'combined',
    technology: 'technology',
    in_store: 'in_store',
    risk_score: 'combined',
    tech_pressure: 'technology',
    tech_readiness_pressure: 'technology',
    tech_sustain_pressure: 'technology',
    store_pressure: 'in_store',
    campaign_presence: 'in_store',
    campaign_risk: 'in_store',
    holiday_flag: 'in_store',
    school_holiday_flag: 'in_store',
  };
  return legacy[raw] ?? 'combined';
}

export const STORAGE_KEYS = {
  picker: 'owm_picker',
  layer: 'owm_layer',
  theme: 'owm_theme',
  atc_dsl: 'atc_dsl',
  atc_scenarios: 'atc_scenarios',
  /** Zustand persist blob for country, view mode, theme, risk tuning. */
  capacity_atc: 'capacity-atc',
} as const;
