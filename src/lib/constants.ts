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
    runwayHeatmapTitle: 'Tech capacity consumed',
    title:
      'Lab and Market IT capacity consumed (0–1 on the tighter lane): how much of that capacity is already scheduled versus caps (headline excludes backend). Cooler tiles mean lighter use; hotter tiles mean more of lab and Market IT capacity is in play. Store-trading rhythm does not change this heatmap. γ_tech and transfer curve shape load on those lanes before the tile value and colour mapping.',
  },
  {
    id: 'in_store',
    label: 'Restaurant Activity',
    runwayHeatmapTitle: 'Trading pressure',
    title:
      'Restaurant busyness from the store trading curve: weekly × monthly × seasonal rhythm, early-month lift (more visits when wallets are fuller), holidays, and store-facing campaign boosts in YAML. This lens does not add tech work—use Technology Teams for delivery load. Same 0–1 scale; γ_business and transfer curve apply.',
  },
  {
    id: 'market_risk',
    label: 'Deployment Risk',
    runwayHeatmapTitle: 'Deployment Risk',
    title:
      'Deployment and calendar fragility (the deployment risk score): holidays, optional blackout windows (often “resourcing” but overlapping peak trading), trading intensity, campaign × peak-week compounding, tech bench strain, and YAML events. Hotter = more fragile—not a ban. γ_business and transfer curve apply when set separately from Technology Teams.',
  },
  {
    id: 'code',
    label: 'YAML',
    runwayHeatmapTitle: 'YAML editor',
    title:
      'Full multi-market YAML in the main area. Edits stay local until you switch back to Technology Teams, Restaurant Activity, or Deployment Risk — then the model re-runs and the runway updates.',
  },
] as const;

export type ViewModeId = (typeof VIEW_MODES)[number]['id'];

/** Heading shown above the runway grid for the active lens. */
export function runwayHeatmapTitleForViewMode(id: ViewModeId): string {
  const m = VIEW_MODES.find((v) => v.id === id);
  return m?.runwayHeatmapTitle ?? VIEW_MODES[0].runwayHeatmapTitle;
}

/** Product name for tooltips / chrome (e.g. Technology Teams, Restaurant Activity). */
export function runwayLensProductLabel(id: ViewModeId): string {
  const m = VIEW_MODES.find((v) => v.id === id);
  return m?.label ?? id;
}

/** Map legacy layer ids to runway view modes (`combined` = Technology lens in the UI). */
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

