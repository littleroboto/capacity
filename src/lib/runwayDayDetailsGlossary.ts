import type { ViewModeId } from '@/lib/constants';

/** Fill score tooltip — Technology (capacity demand) vs Restaurant Activity (store trading curve). */
export function glossaryFillScore(mode: ViewModeId): string {
  if (mode === 'combined') {
    return 'Raw tech-capacity fill behind this heatmap, before colour transfer and gamma. It is the maximum of lab, team, and (half-weighted) backend load versus effective capacity—uncapped, so values above 1 mean over 100% demand on the tightest lane. The large percentage in the tile is this value × 100%.';
  }
  return 'Modeled restaurant / store trading intensity (0–1 before display tweaks): the store-pressure lane only—calendar rhythm, seasonal shape, public-holiday trading multiplier, and any YAML **store** boosts during live (or prep if configured). Marketing campaign risk is not blended in separately. The tile % is this value × 100%.';
}

/** Risk score tooltip — same blended planning score for both lenses; wording clarifies vs heatmap. */
export function glossaryRiskScore(mode: ViewModeId): string {
  const base =
    'Single 0–1 score that blends technology pressure, store/restaurant pressure, campaign risk, and (when enabled) a holiday term, using your risk tuning weights. Drives the Low / Medium / High band and headroom.';
  if (mode === 'combined') {
    return `${base} Not the same as the Technology fill: the tile is delivery capacity only; risk is the full planning mix.`;
  }
  return `${base} Restaurant Activity shows store trading intensity only; risk still includes tech delivery and campaign terms, so the two numbers can differ.`;
}
