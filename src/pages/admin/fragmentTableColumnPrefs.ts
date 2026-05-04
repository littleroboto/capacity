/**
 * Persisted TanStack `columnVisibility` for admin fragment grids (per market + entity + table).
 * Only `false` entries are required for semantics; we store the full visibility object from the table.
 */
const STORAGE_PREFIX = 'capacity:admin:fragment-cols:v1';

export function fragmentColumnPrefsStorageKey(marketId: string, entity: string, table: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(marketId)}:${encodeURIComponent(entity)}:${encodeURIComponent(table)}`;
}

/** TanStack: `false` means hidden; missing key means visible. */
export type FragmentColumnVisibility = Record<string, boolean>;

export function readFragmentColumnVisibility(
  key: string,
  allowedColumnIds: ReadonlySet<string>
): FragmentColumnVisibility {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: FragmentColumnVisibility = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!allowedColumnIds.has(id)) continue;
      if (typeof v === 'boolean') out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeFragmentColumnVisibility(key: string, visibility: FragmentColumnVisibility): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(visibility));
  } catch {
    /* quota / private mode */
  }
}

export function clearFragmentColumnVisibility(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
