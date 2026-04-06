import type { ViewModeId } from '@/lib/constants';

/** Align with `docs/LENS_GLOSSARY.md` — side panel / markdown (full). */
export function glossaryFillScore(mode: ViewModeId): string {
  if (mode === 'combined') {
    return 'Headroom on lab and Market IT lanes (0–1 before colour transfer and γ): more free capacity vs scheduled work on those lanes; backend is excluded from the headline. The tile % is this value × 100%.';
  }
  if (mode === 'market_risk') {
    return 'Deployment risk (0–1 before transfer and γ): deployment and calendar fragility—holidays, Q4/month curve, trading intensity, campaigns × peaks, tech bench strain, YAML events. Hotter = more fragile, not a ban. The tile % is this value × 100%.';
  }
  return 'Trading pressure: modeled restaurant / store trading intensity from the store-pressure lane (0–1 before display tweaks)—rhythm, early-month lift, holidays, store boosts. Does not add scheduled tech work. The tile % is this value × 100%.';
}

/** Align with `docs/LENS_GLOSSARY.md` — planning blend (full). */
export function glossaryPlanningBlend(mode: ViewModeId): string {
  const base =
    'Separate 0–1 planning blend: tech + store + campaign + holiday weights (your risk tuning). Drives the Low / Medium / High band—not the tile percentage.';
  if (mode === 'combined') {
    return `${base} The Technology Teams tile shows tech capacity headroom only.`;
  }
  if (mode === 'market_risk') {
    return `${base} The Deployment Risk heatmap shows deployment/calendar fragility only; the band still reflects the full operational mix.`;
  }
  return `${base} Restaurant Activity shows store trading only while the blend still includes tech and campaigns, so the two numbers can differ.`;
}

/** Popover `TermWithDefinition` (compact). */
export function glossaryFillScorePopover(mode: ViewModeId): string {
  if (mode === 'combined') {
    return 'Lab + Market IT headroom (0–1) before γ and transfer. Tile % = this × 100. Cooler = more capacity free.';
  }
  if (mode === 'market_risk') {
    return 'Deployment/calendar fragility (0–1) before γ and transfer. Tile % = this × 100.';
  }
  return 'Store-pressure trading intensity (0–1) before display tweaks. Tile % = this × 100.';
}

/** Popover — planning blend (compact). */
export function glossaryPlanningBlendPopover(mode: ViewModeId): string {
  const core = '0–1 mix (tech, store, campaigns, holidays) from your weights. Sets the band.';
  if (mode === 'combined') {
    return `${core} Not the tile headroom %.`;
  }
  if (mode === 'market_risk') {
    return `${core} Tile is deployment risk only.`;
  }
  return `${core} Tile is store trading only.`;
}

/** Popover footnote — closed by default; avoids repeating header glossary. */
export function glossaryTileVsBandCollapse(mode: ViewModeId): string {
  if (mode === 'combined') {
    return 'The band uses the full planning blend. The large percentage is Technology Teams headroom on lab + Market IT only—backend excluded from that headline.';
  }
  if (mode === 'market_risk') {
    return 'The band uses the full planning blend. The tile is the deployment-risk score (deployment/calendar fragility) only.';
  }
  return 'The band uses the full planning blend. The tile is restaurant/store trading intensity from the store curve only.';
}

/** @deprecated Use {@link glossaryPlanningBlend}. */
export const glossaryRiskScore = glossaryPlanningBlend;
