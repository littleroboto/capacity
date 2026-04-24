import { CAPACITY_ATC_PERSIST_KEY } from '@/lib/capacityAtcPersist';
import { RUNWAY_ALL_MARKETS_LABEL, RUNWAY_ALL_MARKETS_VALUE } from '@/lib/markets';
import { WORKBENCH_URL_KEYS } from '@/lib/workbenchUrlViewState';

/**
 * Landing / marketing links: same-origin path the workbench should open on first navigation.
 * When we have a persisted runway focus market, include it in the query so the URL matches the
 * workbench before async Zustand rehydration (avoids a one-frame wrong market).
 */
export function workbenchEntryHref(): string {
  if (typeof window === 'undefined') return '/app';
  try {
    const raw = localStorage.getItem(CAPACITY_ATC_PERSIST_KEY);
    if (!raw) return '/app';
    const parsed = JSON.parse(raw) as { state?: { country?: unknown } };
    const c = parsed.state?.country;
    if (typeof c !== 'string') return '/app';
    const trimmed = c.trim();
    if (!trimmed) return '/app';
    if (trimmed === RUNWAY_ALL_MARKETS_VALUE) {
      return `/app?${WORKBENCH_URL_KEYS.country}=${encodeURIComponent(RUNWAY_ALL_MARKETS_LABEL)}`;
    }
    return `/app?${WORKBENCH_URL_KEYS.country}=${encodeURIComponent(trimmed)}`;
  } catch {
    return '/app';
  }
}
