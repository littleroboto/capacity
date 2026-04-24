/**
 * Light mode is now permanent. This previously read a persisted theme from
 * `capacity_atc` to avoid a flash on the marketing page; now it just guarantees
 * the `dark` class is never present before React paints, even if a stale
 * `state.theme === 'dark'` value is still in localStorage from before the
 * single-mode lock.
 */
export function applyPersistedWorkbenchThemeClass(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove('dark');
}
