/** HTML / Vite / SPA shell — not workspace YAML (used before stricter YAML heuristics). */
export function looksLikeHtmlOrSpaShell(text: string | null | undefined): boolean {
  if (text == null || !String(text).trim()) return false;
  const t = String(text).trimStart();
  const head = t.slice(0, 32).toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html')) return true;
  const lower = t.slice(0, 800).toLowerCase();
  if (lower.includes('@react-refresh') || lower.includes('injectintoglobalhook')) return true;
  if (lower.includes('<head') && lower.includes('<script')) return true;
  return false;
}

/**
 * Reject obvious non-YAML (e.g. saved index.html, SPA shell, pasted page source,
 * or `api/_sharedDslImpl.ts` accidentally stored in Blob / returned as GET body).
 */
export function looksLikeYamlDsl(text: string | null | undefined): boolean {
  if (text == null || !String(text).trim()) return false;
  if (looksLikeHtmlOrSpaShell(text)) return false;
  const t = String(text).trimStart();
  const probe = t.slice(0, 12000);
  if (
    /\bimport\s+type\s+/.test(probe) ||
    /\bfrom\s+['"]@vercel\//.test(probe) ||
    /\bfrom\s+['"]@vercel\/blob['"]/.test(probe) ||
    /\bfrom\s+['"]@vitejs\//.test(probe) ||
    /\bprocess\.env\./.test(probe) ||
    /\bCAPACITY_BLOB_ACCESS\b/.test(probe) ||
    /\bBLOB_READ_WRITE_TOKEN\b/.test(probe) ||
    /\bCAPACITY_SHARED_DSL_SECRET\b/.test(probe) ||
    /\bfunction\s+blobStoreAccess\s*\(/.test(probe) ||
    /\bconst\s+PATHNAME\s*=\s*[`'"]capacity-shared\/workspace\.yaml[`'"]/.test(probe) ||
    /\bexport\s+default\s+async\s+function\s+handler\s*\(/.test(probe) ||
    /\bVercelRequest\b/.test(probe) ||
    /\bVercelResponse\b/.test(probe) ||
    /\bstreamToText\s*\(/.test(probe) ||
    /\bBlobNotFoundError\b/.test(probe) ||
    /\bBlobPreconditionFailedError\b/.test(probe)
  ) {
    return false;
  }
  return true;
}
