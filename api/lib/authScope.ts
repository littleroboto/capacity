import type { VercelResponse } from '@vercel/node';
import type { ResolvedUserScope } from './domainTypes';
import { resolveUserScope } from './scopeResolver';
import { verifyClerkBearerToken } from './verifyClerkBearer';

function isServerConfigurationError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    e.message.includes('Missing required env var') ||
    e.message.includes('Missing required env var: one of')
  );
}

export type AuthenticateScopeResult =
  | { ok: true; scope: ResolvedUserScope; email?: string; clerkSub: string }
  | { ok: false };

/** Best-effort email from verified Clerk JWT (depends on session token template). */
function jwtEmailFromPayload(payload: Record<string, unknown>): string | undefined {
  const pick = (v: unknown) => (typeof v === 'string' && v.includes('@') ? v.trim() : undefined);
  return (
    pick(payload.email) ??
    pick(payload.primary_email_address) ??
    pick(payload.primaryEmailAddress) ??
    undefined
  );
}

/**
 * Verify Clerk JWT then resolve DB-backed scope. Sends the HTTP response on failure.
 * Missing Supabase (or other server env) is **503**, not 401 — config errors were
 * previously mis-reported as `unauthorized` because they shared a try/catch with Clerk.
 */
export async function authenticateScope(
  bearer: string,
  res: VercelResponse,
  extraJson?: Record<string, string>
): Promise<AuthenticateScopeResult> {
  try {
    const payload = (await verifyClerkBearerToken(bearer)) as Record<string, unknown>;
    const sub = payload.sub as string;
    if (!sub) {
      res.status(401).json({ error: 'invalid token', ...extraJson });
      return { ok: false };
    }
    const email = jwtEmailFromPayload(payload);
    const scope = await resolveUserScope(sub, email);
    return { ok: true, scope, email, clerkSub: sub };
  } catch (e) {
    if (isServerConfigurationError(e)) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(503).json({
        error: 'server_misconfigured',
        message,
        hint:
          'This is the exact env error from serverEnv() in this process. For `vercel dev`, run from the repo root with `.env.local` present, or run `vercel env pull`. Vercel UI: set vars for Preview/Development too, not only Production.',
        ...extraJson,
      });
      return { ok: false };
    }
    const msg = e instanceof Error ? e.message : String(e);
    res.status(401).json({ error: 'unauthorized', message: msg, ...extraJson });
    return { ok: false };
  }
}
