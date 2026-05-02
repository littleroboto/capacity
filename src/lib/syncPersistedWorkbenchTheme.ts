/**
 * Keep the document root in light mode for the marketing site. The workbench (`/app`)
 * applies `workbench-studio` on its own root for scoped tokens; they do not leak to `/`.
 * This still strips a stale `.dark` on `<html>` from older persisted state before paint.
 */
export function applyPersistedWorkbenchThemeClass(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove('dark');
}
