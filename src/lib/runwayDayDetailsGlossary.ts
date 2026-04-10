import type { ViewModeId } from '@/lib/constants';

/** Align with `docs/LENS_GLOSSARY.md` — side panel / markdown (full). */
export function glossaryFillScore(mode: ViewModeId): string {
  if (mode === 'combined') {
    return 'Capacity consumed on lab and Market IT lanes (0–1 before colour transfer and γ): scheduled load versus caps on the tighter lane; backend is excluded from the headline. The tile % is this value × 100%.';
  }
  if (mode === 'market_risk') {
    return 'Deployment risk: model score (0–1) shaped by holidays, Q4/month curve, trading, campaigns, YAML events—then the same pressure offset and heatmap transfer as the runway cells. Tile % is that display value × 100%.';
  }
  return 'Restaurant / store trading from the store-pressure lane (rhythm, early-month lift, holidays, store boosts), then the same pressure offset and heatmap transfer as the runway cells. Tile % is that display value × 100%.';
}

/** Align with `docs/LENS_GLOSSARY.md` — planning blend (full). */
export function glossaryPlanningBlend(mode: ViewModeId): string {
  const base =
    'Separate 0–1 planning blend: tech + store + campaign + holiday weights (your risk tuning). Drives the Low / Medium / High band—not the tile percentage.';
  if (mode === 'combined') {
    return `${base} The Technology Teams tile shows tech capacity consumed only.`;
  }
  if (mode === 'market_risk') {
    return `${base} The Deployment Risk tile % matches heatmap display (offset + transfer on the risk score); the band still reflects the full operational mix.`;
  }
  return `${base} Restaurant Activity shows store trading only while the blend still includes tech and campaigns, so the two numbers can differ.`;
}

/** Popover `TermWithDefinition` (compact). */
export function glossaryFillScorePopover(mode: ViewModeId): string {
  if (mode === 'combined') {
    return 'Lab + Market IT capacity consumed (0–1) before γ and transfer. Tile % = this × 100. Cooler = lighter use.';
  }
  if (mode === 'market_risk') {
    return 'Deployment risk after heatmap offset + transfer (same as cell colour). Tile % = this × 100.';
  }
  return 'Store intensity after heatmap offset + transfer (same as cell colour). Tile % = this × 100.';
}

/** Popover — planning blend (compact). */
export function glossaryPlanningBlendPopover(mode: ViewModeId): string {
  const core = '0–1 mix (tech, store, campaigns, holidays) from your weights. Sets the band.';
  if (mode === 'combined') {
    return `${core} Not the tile capacity-consumed %.`;
  }
  if (mode === 'market_risk') {
    return `${core} Tile is deployment risk only.`;
  }
  return `${core} Tile is store trading only.`;
}

/** Popover footnote — closed by default; avoids repeating header glossary. */
export function glossaryTileVsBandCollapse(mode: ViewModeId): string {
  if (mode === 'combined') {
    return 'The band uses the full planning blend. The large percentage is Technology Teams capacity consumed on lab + Market IT only—backend excluded from that headline.';
  }
  if (mode === 'market_risk') {
    return 'The band uses the full planning blend. The tile % matches Deployment Risk heatmap display (offset + transfer).';
  }
  return 'The band uses the full planning blend. The tile matches Restaurant Activity heatmap display (offset + transfer on store intensity).';
}

/** @deprecated Use {@link glossaryPlanningBlend}. */
export const glossaryRiskScore = glossaryPlanningBlend;
