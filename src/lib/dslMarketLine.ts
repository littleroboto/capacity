/** First-line market id in a DSL document (`market:` preferred; `country:` legacy). */
export const DSL_MARKET_LINE = /^((?:market|country):\s*(\S+))/m;

export function parseDslMarketId(segment: string): string | null {
  const m = segment.match(DSL_MARKET_LINE);
  return m ? m[2]! : null;
}
