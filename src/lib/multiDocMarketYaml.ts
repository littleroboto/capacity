import { parseDslMarketId } from '@/lib/dslMarketLine';
import { mergeMarketsToMultiDocYaml } from '@/lib/mergeMarketYaml';
import { isRunwayAllMarkets } from '@/lib/markets';

/** Match `dslRiskHeatmapPatch` / YAML multi-doc convention. */
export const MULTI_DOC_SPLIT = /\r?\n---\s*\r?\n/;

/**
 * Split a multi-document YAML string into `country` code → document text.
 * Single-document strings yield one entry when `market:` or `country:` is present.
 */
export function splitToDslByMarket(multiDocYaml: string): Record<string, string> {
  const trimmed = multiDocYaml.trim();
  if (!trimmed) return {};
  const parts = MULTI_DOC_SPLIT.test(trimmed) ? trimmed.split(MULTI_DOC_SPLIT) : [trimmed];
  const out: Record<string, string> = {};
  for (const seg of parts) {
    const id = parseDslMarketId(seg);
    if (id) out[id] = seg.trim();
  }
  return out;
}

/** Return the YAML document for `marketId`, or null if not found. */
export function extractMarketDocument(multiDocYaml: string, marketId: string): string | null {
  const trimmed = multiDocYaml.trim();
  if (!trimmed) return null;
  const parts = MULTI_DOC_SPLIT.test(trimmed) ? trimmed.split(MULTI_DOC_SPLIT) : [trimmed];
  for (const seg of parts) {
    const id = parseDslMarketId(seg);
    if (id === marketId) return seg.trim();
  }
  return null;
}

/**
 * Replace the document whose `market:` / `country:` is `marketId` (or matches new doc’s id).
 * If none match, appends `newDocYaml` as a new document.
 */
export function replaceMarketDocument(
  multiDocYaml: string,
  marketId: string,
  newDocYaml: string
): string {
  const newTrim = newDocYaml.trim();
  const newCountry = parseDslMarketId(newTrim) ?? marketId;
  const trimmed = multiDocYaml.trim();
  if (!trimmed) return newTrim;
  const parts = MULTI_DOC_SPLIT.test(trimmed) ? trimmed.split(MULTI_DOC_SPLIT) : [trimmed];
  let replaced = false;
  const out = parts.map((seg) => {
    const id = parseDslMarketId(seg);
    if (id && (id === marketId || id === newCountry)) {
      replaced = true;
      return newTrim;
    }
    return seg.trim();
  });
  if (!replaced) {
    return [...out.filter(Boolean), newTrim].join('\n---\n\n');
  }
  return out.filter(Boolean).join('\n---\n\n');
}

export type MergeStateSlice = {
  country: string;
  dslText: string;
  dslByMarket: Record<string, string>;
  runwayMarketOrder: readonly string[];
};

/**
 * Full multi-document YAML for the pipeline and `atc_dsl` persistence.
 * When a single market is selected, `dslText` is that market's doc; other markets come from `dslByMarket`.
 */
export function mergeStateToFullMultiDoc(s: MergeStateSlice): string {
  if (isRunwayAllMarkets(s.country)) {
    return s.dslText.trim();
  }
  const t = s.dslText.trim();
  const bm = { ...s.dslByMarket, [s.country]: t };
  const m = mergeMarketsToMultiDocYaml(bm, s.runwayMarketOrder);
  return m.trim() ? m : t;
}
