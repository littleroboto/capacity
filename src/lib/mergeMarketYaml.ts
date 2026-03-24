import { FALLBACK_RUNWAY_MARKET_IDS } from '@/lib/markets';

/**
 * Concatenate per-market YAML strings into one multi-document file (`---` between documents).
 * Order should match `manifest.json` / store `runwayMarketOrder`.
 */
export function mergeMarketsToMultiDocYaml(
  dslByMarket: Record<string, string>,
  order: readonly string[] = FALLBACK_RUNWAY_MARKET_IDS
): string {
  const parts: string[] = [];
  for (const id of order) {
    const raw = dslByMarket[id]?.trim();
    if (!raw) continue;
    parts.push(raw.replace(/\s+$/, ''));
  }
  return parts.join('\n---\n\n');
}
