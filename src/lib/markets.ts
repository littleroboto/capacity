/**
 * Fallback when `public/data/markets/manifest.json` is missing or invalid.
 * Normal runtime order comes from the manifest (generated from `*.yaml` via `scripts/generate-market-manifest.mjs`).
 */
export const FALLBACK_RUNWAY_MARKET_IDS = [
  'AT',
  'AU',
  'BE',
  'CA',
  'CH',
  'CZ',
  'DE',
  'ES',
  'FR',
  'IT',
  'NL',
  'PL',
  'PT',
  'SK',
  'SL',
  'UA',
  'UK',
] as const;

/** @deprecated Prefer manifest / store `runwayMarketOrder`; alias kept for older imports. */
export const RUNWAY_MARKET_IDS = FALLBACK_RUNWAY_MARKET_IDS;

/**
 * Header country value: multi-column runway, one strip per market in the applied YAML.
 * Not a real `country:` key in DSL.
 */
export const RUNWAY_ALL_MARKETS_VALUE = '__ALL__' as const;

/** Label for the country picker and workbench when `RUNWAY_ALL_MARKETS_VALUE` is selected (e.g. LIOM = all columns). */
export const RUNWAY_ALL_MARKETS_LABEL = 'LIOM' as const;

/**
 * LIOM segment market ids (portfolio list). Keep aligned with `public/data/segments.json` → `LIOM`.
 * The LIOM compare strip (`__ALL__`) shows only these columns (intersected with the manifest).
 */
export const RUNWAY_LIOM_SEGMENT_MARKET_IDS = [
  'AU',
  'UK',
  'DE',
  'CA',
  'FR',
  'IT',
  'ES',
  'PL',
] as const;

/**
 * Header country value: multi-column runway for the IOM segment only (subset of manifest order).
 * Not a real `country:` key in DSL.
 */
export const RUNWAY_IOM_MARKETS_VALUE = '__IOM__' as const;

export const RUNWAY_IOM_MARKETS_LABEL = 'IOM' as const;

/** IOM segment market ids (display / compare order). */
export const RUNWAY_IOM_SEGMENT_MARKET_IDS = [
  'CH',
  'AT',
  'NL',
  'BE',
  'PT',
  'CZ',
  'SK',
  'SL',
  'UA',
] as const;

export function isRunwayAllMarkets(country: string): boolean {
  return country === RUNWAY_ALL_MARKETS_VALUE;
}

export function isRunwayIomMarkets(country: string): boolean {
  return country === RUNWAY_IOM_MARKETS_VALUE;
}

/** LIOM or IOM compare strip (multi-column runway). */
export function isRunwayMultiMarketStrip(country: string): boolean {
  return isRunwayAllMarkets(country) || isRunwayIomMarkets(country);
}

/** Segment ids that exist in `manifestOrder`, preserving segment order. */
export function runwaySegmentMarketsOrdered(
  segmentIds: readonly string[],
  manifestOrder: readonly string[]
): string[] {
  const present = new Set(manifestOrder.map((x) => x.toUpperCase()));
  return segmentIds.filter((id) => present.has(id.toUpperCase()));
}

/**
 * Ordered market ids for the compare runway when a multi strip is focused; otherwise full manifest order.
 */
export function runwayCompareMarketIds(country: string, orderedIds: readonly string[]): string[] {
  if (isRunwayAllMarkets(country)) {
    const present = new Set(orderedIds.map((x) => x.toUpperCase()));
    return [...RUNWAY_LIOM_SEGMENT_MARKET_IDS].filter((id) => present.has(id));
  }
  if (isRunwayIomMarkets(country)) {
    const present = new Set(orderedIds.map((x) => x.toUpperCase()));
    return [...RUNWAY_IOM_SEGMENT_MARKET_IDS].filter((id) => present.has(id));
  }
  return [...orderedIds];
}

export function runwayFocusStripLabel(country: string): string {
  if (isRunwayAllMarkets(country)) return RUNWAY_ALL_MARKETS_LABEL;
  if (isRunwayIomMarkets(country)) return RUNWAY_IOM_MARKETS_LABEL;
  return country;
}

/** For γ slider / YAML patch when a multi strip is focused — first document in that strip’s pipeline order. */
export function gammaFocusMarket(
  country: string,
  configs: { market: string }[],
  order: readonly string[] = FALLBACK_RUNWAY_MARKET_IDS
): string {
  if (isRunwayAllMarkets(country) || isRunwayIomMarkets(country)) {
    const seg = runwayCompareMarketIds(country, order);
    for (const id of seg) {
      const hit = configs.find((c) => c.market === id);
      if (hit) return hit.market;
    }
    return seg[0] ?? order[0] ?? 'DE';
  }
  return country;
}
