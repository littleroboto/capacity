/**
 * Fallback when `public/data/markets/manifest.json` is missing or invalid.
 * Normal runtime order comes from the manifest (generated from `*.yaml` via `scripts/generate-market-manifest.mjs`).
 */
export const FALLBACK_RUNWAY_MARKET_IDS = ['AU', 'CA', 'DE', 'ES', 'FR', 'IT', 'PL', 'UK'] as const;

/** @deprecated Prefer manifest / store `runwayMarketOrder`; alias kept for older imports. */
export const RUNWAY_MARKET_IDS = FALLBACK_RUNWAY_MARKET_IDS;

/**
 * Header country value: multi-column runway, one strip per market in the applied YAML.
 * Not a real `country:` key in DSL.
 */
export const RUNWAY_ALL_MARKETS_VALUE = '__ALL__' as const;

/** Label for the country picker and workbench when `RUNWAY_ALL_MARKETS_VALUE` is selected (e.g. LIOM = all columns). */
export const RUNWAY_ALL_MARKETS_LABEL = 'LIOM' as const;

export function isRunwayAllMarkets(country: string): boolean {
  return country === RUNWAY_ALL_MARKETS_VALUE;
}

/** For γ slider / YAML patch when LIOM (`RUNWAY_ALL_MARKETS_VALUE`) is selected — first document in pipeline order. */
export function gammaFocusMarket(
  country: string,
  configs: { market: string }[],
  order: readonly string[] = FALLBACK_RUNWAY_MARKET_IDS
): string {
  if (!isRunwayAllMarkets(country)) return country;
  return configs[0]?.market ?? order[0] ?? 'DE';
}
