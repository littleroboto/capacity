import { verifyToken } from '@clerk/backend';

export type SharedDslPrincipal =
  | { kind: 'clerk'; userId: string; orgRoleNorm: string | null; jwtPayload: Record<string, unknown> }
  | { kind: 'legacy' }
  | { kind: 'none' };

function normalizeClerkOrgRoleToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/^org:/, '');
}

/**
 * Session token v2: `o.rol` (no `org:` prefix). v1: top-level `org_role` e.g. `org:admin`.
 * @see https://clerk.com/docs/guides/sessions/session-tokens
 */
export function extractOrgRoleNormFromVerifiedJwt(payload: Record<string, unknown>): string | null {
  const v1 = payload.org_role;
  if (typeof v1 === 'string' && v1.trim()) return normalizeClerkOrgRoleToken(v1);

  const o = payload.o;
  if (o && typeof o === 'object' && o !== null && !Array.isArray(o)) {
    const rol = (o as Record<string, unknown>).rol;
    if (typeof rol === 'string' && rol.trim()) return normalizeClerkOrgRoleToken(rol);
  }
  return null;
}

/** When non-null, PUT requires JWT org role ∈ list (after normalizing). When null, any signed-in Clerk user may PUT. */
export function parseClerkDslWriteAllowListFromEnv(raw: string | undefined): string[] | null {
  const t = raw?.trim();
  if (!t) return null;
  const parts = t.split(',').map((s) => normalizeClerkOrgRoleToken(s)).filter(Boolean);
  return parts.length ? parts : null;
}

export function clerkJwtAllowedToPutSharedDsl(orgRoleNorm: string | null, allowList: string[] | null): boolean {
  if (allowList == null) return true;
  if (!orgRoleNorm) return false;
  return allowList.includes(orgRoleNorm);
}

export function clerkSecretKeyConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY?.trim());
}

/** When true with `CLERK_SECRET_KEY`, PUT rejects `CAPACITY_SHARED_DSL_SECRET` bearer (session JWT only). */
export function legacySharedDslWriteDisabled(): boolean {
  const v = process.env.CAPACITY_DISABLE_LEGACY_SHARED_DSL_WRITE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function authorizedParties(): string[] | undefined {
  const raw = process.env.CAPACITY_CLERK_AUTHORIZED_PARTIES?.trim();
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

/**
 * Verifies `Authorization: Bearer …` for `/api/shared-dsl`.
 * - When `CLERK_SECRET_KEY` is set, **reads** (GET/HEAD) accept only a valid Clerk session JWT.
 * - **Writes** (PUT) also accept the legacy shared secret when `CAPACITY_SHARED_DSL_SECRET` matches.
 */
export async function authenticateSharedDslBearer(
  rawBearer: string | undefined,
  mode: 'read' | 'write'
): Promise<SharedDslPrincipal> {
  const bearer = typeof rawBearer === 'string' ? rawBearer.trim() : '';
  if (!bearer) return { kind: 'none' };

  const clerkSecret = process.env.CLERK_SECRET_KEY?.trim();
  if (clerkSecret) {
    try {
      const opts: Parameters<typeof verifyToken>[1] = { secretKey: clerkSecret };
      const parties = authorizedParties();
      if (parties?.length) opts.authorizedParties = parties;
      const payload = (await verifyToken(bearer, opts)) as Record<string, unknown>;
      const sub = typeof payload.sub === 'string' ? payload.sub : null;
      if (sub) {
        return {
          kind: 'clerk',
          userId: sub,
          orgRoleNorm: extractOrgRoleNormFromVerifiedJwt(payload),
          jwtPayload: payload,
        };
      }
    } catch {
      /* not a valid Clerk JWT */
    }
  }

  const legacy = process.env.CAPACITY_SHARED_DSL_SECRET?.trim();
  if (legacy && bearer === legacy) {
    if (clerkSecretKeyConfigured() && mode === 'read') {
      return { kind: 'none' };
    }
    if (clerkSecretKeyConfigured() && mode === 'write' && legacySharedDslWriteDisabled()) {
      return { kind: 'none' };
    }
    return { kind: 'legacy' };
  }

  return { kind: 'none' };
}

export function bearerFromAuthorizationHeader(authHeader: string | string | undefined): string | undefined {
  if (authHeader == null) return undefined;
  const h = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const m = /^Bearer\s+(.+)$/i.exec(h?.trim() ?? '');
  return m?.[1]?.trim() || undefined;
}
