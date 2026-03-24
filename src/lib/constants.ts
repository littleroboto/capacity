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
    label: 'Technology',
    title:
      'Deployment pressure score — tech-led blend with restaurant, marketing, and holidays. Transfer curve and γ apply in this lens.',
  },
  {
    id: 'in_store',
    label: 'Business',
    title:
      'Restaurant trading, marketing windows, and holiday rhythm. Uses a smoother colour ramp so busy periods still show a bit of nuance when values cluster high.',
  },
] as const;

export type ViewModeId = (typeof VIEW_MODES)[number]['id'];

/** Map persisted / legacy layer ids to runway view modes (`combined` = Technology lens in the UI). */
export function normalizeViewModeId(raw: string | null): ViewModeId {
  if (!raw) return 'combined';
  const legacy: Record<string, ViewModeId> = {
    combined: 'combined',
    technology: 'combined',
    in_store: 'in_store',
    risk_score: 'combined',
    tech_pressure: 'combined',
    tech_readiness_pressure: 'combined',
    tech_sustain_pressure: 'combined',
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
  /** Zustand persist blob for country, view mode, theme, pressure tuning (stored as `riskTuning`). */
  capacity_atc: 'capacity-atc',
  /** Header UI: compact bar (`1` / absent). */
  header_compact: 'capacity_header_compact',
} as const;
