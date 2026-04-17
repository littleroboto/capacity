import { parseYamlToConfigs } from '@/engine/pipeline';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { looksLikeYamlDsl } from '@/lib/dslGuards';
import { mergeMarketsToMultiDocYaml } from '@/lib/mergeMarketYaml';
import {
  FALLBACK_RUNWAY_MARKET_IDS,
  isRunwayMultiMarketStrip,
  runwayCompareMarketIds,
} from '@/lib/markets';
import { extractMarketDocument, splitToDslByMarket } from '@/lib/multiDocMarketYaml';

export type WorkbenchHydrateBundle = {
  dslMultiDoc: string;
  dslText: string;
  dslByMarket: Record<string, string>;
};

function countParsedMarkets(dsl: string): number {
  try {
    return parseYamlToConfigs(dsl).length;
  } catch {
    return 0;
  }
}

/**
 * Pure merge step shared by {@link useAtcStore}'s `hydrateFromStorage` — computes editor text + merged multi-doc
 * for the pipeline without running the pipeline.
 */
export function computeWorkbenchHydrateBundle(input: {
  country: string;
  dslByMarket: Record<string, string>;
  runwayMarketOrder: string[];
  multiDocFallback?: string;
}): WorkbenchHydrateBundle {
  const { country, dslByMarket, runwayMarketOrder, multiDocFallback } = input;
  const mergedFromDisk = mergeMarketsToMultiDocYaml(dslByMarket, runwayMarketOrder);
  const firstId = runwayMarketOrder[0] ?? FALLBACK_RUNWAY_MARKET_IDS[0]!;
  let singleFallback: string;
  if (isRunwayMultiMarketStrip(country)) {
    const segOrder = runwayCompareMarketIds(country, runwayMarketOrder);
    const segYaml = mergeMarketsToMultiDocYaml(dslByMarket, segOrder);
    const fb = segOrder[0] ?? firstId;
    singleFallback =
      segYaml.trim() && looksLikeYamlDsl(segYaml) ? segYaml : dslByMarket[fb] ?? defaultDslForMarket(fb);
  } else {
    singleFallback = dslByMarket[country] ?? defaultDslForMarket(country);
  }
  if (!looksLikeYamlDsl(singleFallback)) {
    if (isRunwayMultiMarketStrip(country)) {
      const fb = runwayCompareMarketIds(country, runwayMarketOrder)[0] ?? firstId;
      singleFallback = defaultDslForMarket(fb);
    } else {
      singleFallback = defaultDslForMarket(country);
    }
  }
  const merged =
    multiDocFallback?.trim() && looksLikeYamlDsl(multiDocFallback) ? multiDocFallback.trim() : mergedFromDisk;
  const mergedOk = merged.length > 0 && looksLikeYamlDsl(merged);
  const diskOk = mergedFromDisk.length > 0 && looksLikeYamlDsl(mergedFromDisk);
  const bundledCount = mergedOk ? countParsedMarkets(merged) : 0;
  const diskCount = diskOk ? countParsedMarkets(mergedFromDisk) : 0;
  const preferBundled = mergedOk && bundledCount > 0 && (!diskOk || bundledCount > diskCount);
  const dslMultiDoc = preferBundled ? merged : diskOk ? mergedFromDisk : mergedOk ? merged : singleFallback;
  const split = splitToDslByMarket(dslMultiDoc);
  const nextByMarket =
    Object.keys(split).length > 0 ? { ...dslByMarket, ...split } : { ...dslByMarket };
  let dslText = dslMultiDoc;
  if (isRunwayMultiMarketStrip(country)) {
    dslText = mergeMarketsToMultiDocYaml(nextByMarket, runwayCompareMarketIds(country, runwayMarketOrder));
    if (!looksLikeYamlDsl(dslText)) dslText = singleFallback;
  } else {
    dslText = extractMarketDocument(dslMultiDoc, country) ?? nextByMarket[country] ?? singleFallback;
    if (!looksLikeYamlDsl(dslText)) dslText = singleFallback;
  }
  return { dslMultiDoc, dslText, dslByMarket: nextByMarket };
}
