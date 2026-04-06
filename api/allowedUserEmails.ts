/**
 * Optional deployment allowlist: only these primary emails may use Clerk-protected APIs.
 * Set `CAPACITY_ALLOWED_USER_EMAILS` (comma-separated, case-insensitive).
 *
 * JWT must include the user's email — add to Clerk → Sessions → Customize session token, e.g.:
 * `{ "email": "{{user.primary_email_address}}" }`
 *
 * Shared by `/api/shared-dsl` and PartyKit (`party/collab.ts`).
 */

export function parseAllowedEmailSet(raw: string | undefined): Set<string> {
  const t = raw?.trim();
  if (!t) return new Set();
  return new Set(
    t
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes('@'))
  );
}

export function extractEmailFromClerkJwtPayload(payload: Record<string, unknown>): string | null {
  const asAddr = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const s = v.trim().toLowerCase();
    return s.includes('@') ? s : null;
  };
  return (
    asAddr(payload.email) ??
    asAddr(payload.primary_email_address) ??
    asAddr((payload as { email_address?: unknown }).email_address)
  );
}

/** When `allowed` is empty, all signed-in users pass. */
export function isClerkJwtEmailAllowed(
  payload: Record<string, unknown>,
  allowed: ReadonlySet<string>
): boolean {
  if (allowed.size === 0) return true;
  const email = extractEmailFromClerkJwtPayload(payload);
  if (!email) return false;
  return allowed.has(email);
}
