/** Comma-separated allowlist from `VITE_ALLOWED_USER_EMAILS` (must match server `CAPACITY_ALLOWED_USER_EMAILS`). */

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

export function viteAllowedUserEmails(): Set<string> {
  return parseAllowedEmailSet(import.meta.env.VITE_ALLOWED_USER_EMAILS);
}

export function normalizeUserEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailInAllowList(emailNorm: string, allowed: ReadonlySet<string>): boolean {
  if (allowed.size === 0) return true;
  return allowed.has(emailNorm);
}
