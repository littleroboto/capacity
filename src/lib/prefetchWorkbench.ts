/**
 * Start loading the lazy workbench route chunk early (landing → /app).
 * Duplicate `import()` calls share the same module promise; failures are ignored here.
 */
export function prefetchWorkbenchApp(): void {
  void import('@/App').catch(() => {
    /* navigation will retry */
  });
}
