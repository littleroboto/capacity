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
    label: 'Technology Teams',
    /** Short heading above the main runway heatmap. */
    runwayHeatmapTitle: 'Tech capacity headroom',
    title:
      'Available lab and Market IT capacity (headroom): how much room is left versus scheduled work on those lanes (headline excludes backend). Cooler tiles mean more slack; hotter tiles mean less team/lab capacity still free. Store-trading rhythm does not change this heatmap. γ_tech and transfer curve shape load on those lanes before headroom and colour mapping.',
  },
  {
    id: 'in_store',
    label: 'Restaurant Activity',
    runwayHeatmapTitle: 'Trading pressure',
    title:
      'Restaurant busyness from the store trading curve: weekly × monthly × seasonal rhythm, early-month lift (more visits when wallets are fuller), holidays, and store-facing campaign boosts in YAML. This lens does not add tech work—see Technology Teams for delivery load. Same 0–1 scale; γ_business and transfer curve apply.',
  },
  {
    id: 'market_risk',
    label: 'Market risk',
    runwayHeatmapTitle: 'Deployment / calendar risk',
    title:
      'Graded deployment fragility from holidays, optional blackout windows (often “resourcing” but overlapping peak trading), trading intensity, campaign × peak-week compounding, tech bench strain, and YAML events. Hotter = more fragile—not a ban. γ_business and transfer curve apply when set separately from Technology Teams.',
  },
  {
    id: 'code',
    label: 'Code',
    runwayHeatmapTitle: 'Market configuration',
    title:
      'Full multi-market YAML in the main area. Edits stay local until you switch back to Technology Teams or Restaurant Activity — then the model re-runs and the runway updates.',
  },
] as const;

export type ViewModeId = (typeof VIEW_MODES)[number]['id'];

/** Heading shown above the runway grid for the active lens. */
export function runwayHeatmapTitleForViewMode(id: ViewModeId): string {
  const m = VIEW_MODES.find((v) => v.id === id);
  return m?.runwayHeatmapTitle ?? VIEW_MODES[0].runwayHeatmapTitle;
}

/** Map persisted / legacy layer ids to runway view modes (`combined` = Technology lens in the UI). */
export function normalizeViewModeId(raw: string | null): ViewModeId {
  if (!raw) return 'combined';
  if (raw === 'combined' || raw === 'in_store' || raw === 'market_risk' || raw === 'code') {
    return raw;
  }
  const legacy: Record<string, ViewModeId> = {
    technology: 'combined',
    deployment_risk: 'market_risk',
    risk_score: 'market_risk',
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
