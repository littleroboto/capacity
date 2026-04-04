import { mergeMarketsToMultiDocYaml } from '@/lib/mergeMarketYaml';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { isRunwayMultiMarketStrip, runwayCompareMarketIds } from '@/lib/markets';
import {
  extractMarketDocument,
  mergeStateToFullMultiDoc,
  replaceMarketDocument,
  splitToDslByMarket,
} from '@/lib/multiDocMarketYaml';
import { useAtcStore } from '@/store/useAtcStore';

/** YAML body for one market tab (multi-doc segment or merged slice). */
export function getCodeTabDocumentText(marketId: string): string {
  const s = useAtcStore.getState();
  const full = mergeStateToFullMultiDoc(s);
  const seg = extractMarketDocument(full, marketId);
  if (seg?.trim()) return seg;
  const fb = s.dslByMarket[marketId]?.trim();
  if (fb) return fb;
  return defaultDslForMarket(marketId);
}

/** Merge one market’s editor buffer back into `dslText` / `dslByMarket`. */
export function applyCodeTabDocumentEdit(marketId: string, newDoc: string): void {
  useAtcStore.setState((base) => {
    const { country, dslText, dslByMarket, runwayMarketOrder } = base;
    const nextFull = replaceMarketDocument(mergeStateToFullMultiDoc(base), marketId, newDoc);
    const split = splitToDslByMarket(nextFull);
    const nextBm = { ...dslByMarket, ...split };
    if (isRunwayMultiMarketStrip(country)) {
      const segOrder = runwayCompareMarketIds(country, runwayMarketOrder);
      return {
        dslText: mergeMarketsToMultiDocYaml(nextBm, segOrder),
        dslByMarket: nextBm,
      };
    }
    const nextText =
      split[country]?.trim() ||
      extractMarketDocument(nextFull, country)?.trim() ||
      dslText;
    return { dslText: nextText, dslByMarket: nextBm };
  });
}
