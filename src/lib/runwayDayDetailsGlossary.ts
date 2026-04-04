import type { ViewModeId } from '@/lib/constants';

/** Fill score — side panel / markdown (full). */
export function glossaryFillScore(mode: ViewModeId): string {
  if (mode === 'combined') {
    return 'Tech capacity headroom behind this heatmap (0–1 before colour transfer and gamma): share of lab and Market IT capacity still available versus scheduled work on those lanes (headline excludes backend). The large percentage in the tile is this value × 100%.';
  }
  if (mode === 'market_risk') {
    return 'Market risk score (0–1 before colour transfer and gamma): deployment and calendar fragility from holidays, Q4 ramp in the month curve, trading intensity, campaigns, and optional YAML deployment events—not a ban. The tile % is this value × 100%.';
  }
  return 'Modeled restaurant / store trading intensity (0–1 before display tweaks): the store-pressure lane only—calendar rhythm, **early-month lift** (busier starts of the month), seasonal shape, public-holiday trading multiplier, and any YAML **store** boosts during live (or prep if configured). Does not change scheduled tech work. Marketing campaign risk is not blended in separately. The tile % is this value × 100%.';
}

/** Planning blend — side panel / markdown (full). */
export function glossaryPlanningBlend(mode: ViewModeId): string {
  const base =
    'Single 0–1 **planning blend** that mixes technology pressure, store/restaurant pressure, campaign risk, and (when enabled) a holiday term, using your risk tuning weights. Drives the Low / Medium / High band and overall headroom.';
  if (mode === 'combined') {
    return `${base} Not the same as the Technology heatmap tile, which shows tech capacity headroom only.`;
  }
  if (mode === 'market_risk') {
    return `${base} The Market risk heatmap shows deployment/calendar fragility only; the band still reflects this full planning mix.`;
  }
  return `${base} Restaurant Activity shows store trading intensity only; the blend still includes tech delivery and campaign terms, so the two numbers can differ.`;
}

/** Fill score — popover `TermWithDefinition` (short). */
export function glossaryFillScorePopover(mode: ViewModeId): string {
  if (mode === 'combined') {
    return 'Lab + Market IT headroom (0–1) before γ and colour transfer. The big % is this score × 100.';
  }
  if (mode === 'market_risk') {
    return 'Market risk (0–1) before γ and colour transfer. The big % is this score × 100.';
  }
  return 'Store trading intensity (0–1) before display tweaks. The big % is this score × 100.';
}

/** Planning blend — popover `TermWithDefinition` (short). */
export function glossaryPlanningBlendPopover(mode: ViewModeId): string {
  const core =
    'Blends tech, store, campaigns, and holidays (your tuning weights). Sets the Low / Medium / High band.';
  if (mode === 'combined') {
    return `${core} Different from the tech headroom number in the tile.`;
  }
  if (mode === 'market_risk') {
    return `${core} The tile is market risk only.`;
  }
  return `${core} The tile is store trading only.`;
}

/** @deprecated Use {@link glossaryPlanningBlend}. */
export const glossaryRiskScore = glossaryPlanningBlend;
