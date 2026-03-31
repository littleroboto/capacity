import { mergeMarketsToMultiDocYaml } from '@/lib/mergeMarketYaml';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { isRunwayAllMarkets } from '@/lib/markets';
import {
  extractMarketDocument,
  replaceMarketDocument,
  splitToDslByMarket,
} from '@/lib/multiDocMarketYaml';
import { useAtcStore } from '@/store/useAtcStore';

type DslWorkspaceSlice = {
  country: string;
  dslText: string;
  dslByMarket: Record<string, string>;
  runwayMarketOrder: readonly string[];
};

function buildFullMultiDocFromState(s: DslWorkspaceSlice): string {
  if (isRunwayAllMarkets(s.country)) {
    return s.dslText.trim();
  }
  const t = s.dslText.trim();
  const bm = { ...s.dslByMarket, [s.country]: t };
  return mergeMarketsToMultiDocYaml(bm, s.runwayMarketOrder);
}

/** YAML body for one market tab (multi-doc segment or merged slice). */
export function getCodeTabDocumentText(marketId: string): string {
  const s = useAtcStore.getState();
  const full = buildFullMultiDocFromState(s);
  const seg = extractMarketDocument(full, marketId);
  if (seg?.trim()) return seg;
  const fb = s.dslByMarket[marketId]?.trim();
  if (fb) return fb;
  return defaultDslForMarket(marketId);
}

/** Merge one market’s editor buffer back into `dslText` / `dslByMarket`. */
export function applyCodeTabDocumentEdit(marketId: string, newDoc: string): void {
  useAtcStore.setState((base) => {
    const { country, dslText, dslByMarket } = base;
    const nextFull = replaceMarketDocument(buildFullMultiDocFromState(base), marketId, newDoc);
    const split = splitToDslByMarket(nextFull);
    const nextBm = { ...dslByMarket, ...split };
    if (isRunwayAllMarkets(country)) {
      return { dslText: nextFull, dslByMarket: nextBm };
    }
    const nextText =
      split[country]?.trim() ||
      extractMarketDocument(nextFull, country)?.trim() ||
      dslText;
    return { dslText: nextText, dslByMarket: nextBm };
  });
}
