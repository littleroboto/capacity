/**
 * Reject obvious non-YAML (e.g. saved index.html, SPA shell, pasted page source).
 */
export function looksLikeYamlDsl(text: string | null | undefined): boolean {
  if (text == null || !String(text).trim()) return false;
  const t = String(text).trimStart();
  if (t.startsWith('<!DOCTYPE') || t.startsWith('<html')) return false;
  const lower = t.slice(0, 800).toLowerCase();
  if (lower.includes('@react-refresh') || lower.includes('injectintoglobalhook')) return false;
  if (lower.includes('<head') && lower.includes('<script')) return false;
  return true;
}
