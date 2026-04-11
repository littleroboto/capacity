import { CAPACITY_ATC_PERSIST_KEY } from '@/lib/capacityAtcPersist';

/**
 * Apply saved workbench light/dark from `capacity_atc` before React paints.
 * Runs on **all** routes (including `/`) so semantic tokens (`bg-background`, etc.) match the workbench;
 * without this, the marketing page embeds real components with light `:root` variables.
 *
 * No persistence or unknown `theme` → **dark** (product default).
 */
export function applyPersistedWorkbenchThemeClass(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const setDark = (on: boolean) => {
    document.documentElement.classList.toggle('dark', on);
  };
  try {
    const raw = localStorage.getItem(CAPACITY_ATC_PERSIST_KEY);
    if (!raw) {
      setDark(true);
      return;
    }
    const parsed = JSON.parse(raw) as { state?: { theme?: unknown } };
    const theme = parsed.state?.theme;
    if (theme === 'light') {
      setDark(false);
      return;
    }
    if (theme === 'dark') {
      setDark(true);
      return;
    }
    setDark(true);
  } catch {
    setDark(true);
  }
}
