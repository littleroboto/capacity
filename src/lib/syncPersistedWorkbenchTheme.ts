import { CAPACITY_ATC_PERSIST_KEY } from '@/lib/capacityAtcPersist';

/**
 * Apply saved workbench light/dark from `capacity_atc` before React paints (avoids flash of default dark).
 * Safe no-op on parse errors or missing storage.
 */
export function applyPersistedWorkbenchThemeClass(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(CAPACITY_ATC_PERSIST_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: { theme?: unknown } };
    const theme = parsed.state?.theme;
    if (theme !== 'light' && theme !== 'dark') return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch {
    /* ignore */
  }
}
