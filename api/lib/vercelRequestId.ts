import type { VercelRequest } from '@vercel/node';

/** `x-vercel-id` on requests — paste into Vercel → project → Logs to find this invocation. */
export function vercelRequestId(req: VercelRequest): string | undefined {
  const h = req.headers['x-vercel-id'];
  if (typeof h === 'string') return h.trim() || undefined;
  if (Array.isArray(h) && h[0]) return String(h[0]).trim() || undefined;
  return undefined;
}
