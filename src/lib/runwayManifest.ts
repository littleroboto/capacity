import { FALLBACK_RUNWAY_MARKET_IDS } from '@/lib/markets';
import { publicAsset } from '@/lib/publicUrl';

const ID_RE = /^[A-Za-z]{2,8}$/;

/**
 * Load ordered market ids from `public/data/markets/manifest.json` (generated from `*.yaml` in that folder).
 * Falls back to `FALLBACK_RUNWAY_MARKET_IDS` if fetch fails or payload is invalid.
 */
export async function fetchRunwayMarketOrder(): Promise<string[]> {
  try {
    const r = await fetch(publicAsset('data/markets/manifest.json'), { cache: 'no-store' });
    if (!r.ok) return [...FALLBACK_RUNWAY_MARKET_IDS];
    const j = (await r.json()) as { markets?: unknown };
    if (!Array.isArray(j.markets) || j.markets.length === 0) return [...FALLBACK_RUNWAY_MARKET_IDS];
    const out = j.markets.filter((x): x is string => typeof x === 'string' && ID_RE.test(x.trim()));
    return out.length > 0 ? out.map((s) => s.trim().toUpperCase()) : [...FALLBACK_RUNWAY_MARKET_IDS];
  } catch {
    return [...FALLBACK_RUNWAY_MARKET_IDS];
  }
}
