/**
 * Normalize Clerk org role for comparison (session v2 uses `o.rol` without `org:`; v1 used `org_role`).
 */
export function normalizeClerkOrgRoleToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/^org:/, '');
}

/** Comma-separated roles that may PUT shared DSL (must match server `CAPACITY_CLERK_DSL_WRITE_ROLES`). */
export function parseViteClerkDslWriteRoles(): string[] {
  const v = import.meta.env.VITE_CLERK_DSL_WRITE_ROLES?.trim();
  if (!v) return [];
  return v.split(',').map((s) => normalizeClerkOrgRoleToken(s)).filter(Boolean);
}

/** When the allow list is empty, the UI does not block saves (server may still enforce). */
export function membershipAllowsSharedDslWrite(
  membershipRole: string | null | undefined,
  allowList: string[]
): boolean {
  if (allowList.length === 0) return true;
  const r = membershipRole?.trim();
  if (!r) return false;
  return allowList.includes(normalizeClerkOrgRoleToken(r));
}
