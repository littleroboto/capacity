/**
 * Implementation for `/api/shared-dsl` — serves the assembled multi-market
 * YAML workspace from Postgres-backed config fragments.
 *
 * Previously served from Vercel Blob; now exclusively reads from Postgres
 * via the assembly pipeline + Upstash cache. Write path has been replaced
 * by the fragment CRUD API (`/api/fragments`, `/api/builds`, `/api/import`).
 *
 * Env: Clerk for auth, Supabase for data, Upstash for cache.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';
import { clerkAuthEnvFromProcess } from '../lib/env';
import { isClerkJwtEmailAllowed, parseAllowedEmailSet } from './_allowedUserEmails';
import { SEGMENT_TO_MARKETS, WORKSPACE_MANIFEST_MARKET_ORDER } from './_capacityWorkspaceAcl.data';

type CapacityWorkspaceAccess = {
  legacyFullAccess: boolean;
  admin: boolean;
  allowedMarketIds: ReadonlySet<string>;
  canEditYaml: boolean;
  segments: readonly string[];
};

function parseOrgAdminRolesFromEnv(raw: string | undefined): string[] {
  const t = raw?.trim();
  if (!t) return ['admin'];
  return t
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^org:/, ''))
    .filter(Boolean);
}

function truthyClaim(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function parseSegList(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  }
  const t = String(raw).trim();
  if (!t) return [];
  return t
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
}

function parseCapacityWorkspaceAccess(
  payload: Record<string, unknown>,
  orgRoleNorm: string | null,
  orgAdminRoles: readonly string[]
): CapacityWorkspaceAccess {
  const c = payload;
  const hasCapAdmin = Object.prototype.hasOwnProperty.call(c, 'cap_admin');
  const hasCapSegs = Object.prototype.hasOwnProperty.call(c, 'cap_segs');
  const hasCapEd = Object.prototype.hasOwnProperty.call(c, 'cap_ed');
  const hasCapMkts = Object.prototype.hasOwnProperty.call(c, 'cap_mkts');

  if (!hasCapAdmin && !hasCapSegs && !hasCapEd && !hasCapMkts) {
    return {
      legacyFullAccess: true,
      admin: true,
      allowedMarketIds: new Set(WORKSPACE_MANIFEST_MARKET_ORDER),
      canEditYaml: true,
      segments: [],
    };
  }

  const capAdmin = truthyClaim(c.cap_admin);
  const segs = parseSegList(c.cap_segs);
  const capEd = truthyClaim(c.cap_ed);
  const capMktsRaw = parseSegList(c.cap_mkts);
  const manifestSet = new Set(WORKSPACE_MANIFEST_MARKET_ORDER);
  const capMkts = capMktsRaw.filter((id) => manifestSet.has(id));
  const adminByOrg = Boolean(orgRoleNorm && orgAdminRoles.includes(orgRoleNorm));

  const admin = capAdmin || adminByOrg;
  const allowed = new Set<string>();
  for (const seg of segs) {
    const ids = SEGMENT_TO_MARKETS[seg];
    if (ids) for (const id of ids) allowed.add(id);
  }

  if (capMkts.length > 0) {
    const mset = new Set(capMkts);
    if (allowed.size > 0) {
      const narrowed = new Set<string>();
      for (const id of allowed) {
        if (mset.has(id)) narrowed.add(id);
      }
      allowed.clear();
      for (const id of narrowed) allowed.add(id);
    } else {
      for (const id of capMkts) allowed.add(id);
    }
  }

  return {
    legacyFullAccess: false,
    admin,
    allowedMarketIds: allowed,
    canEditYaml: admin || capEd,
    segments: segs,
  };
}

// --- Auth ---

type SharedDslPrincipal =
  | { kind: 'clerk'; userId: string; orgRoleNorm: string | null; jwtPayload: Record<string, unknown> }
  | { kind: 'auth_failed'; reason: 'no_bearer' | 'jwt_invalid' }
  | { kind: 'email_not_allowed' };

const allowedUserEmails = parseAllowedEmailSet(process.env.CAPACITY_ALLOWED_USER_EMAILS);

function normalizeClerkOrgRoleToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/^org:/, '');
}

function extractOrgRoleNormFromVerifiedJwt(payload: Record<string, unknown>): string | null {
  const v1 = payload.org_role;
  if (typeof v1 === 'string' && v1.trim()) return normalizeClerkOrgRoleToken(v1);
  const o = payload.o;
  if (o && typeof o === 'object' && o !== null && !Array.isArray(o)) {
    const rol = (o as Record<string, unknown>).rol;
    if (typeof rol === 'string' && rol.trim()) return normalizeClerkOrgRoleToken(rol);
  }
  return null;
}

function clerkSecretKeyConfigured(): boolean {
  return Boolean(clerkAuthEnvFromProcess().secretKey);
}

function bearerFromAuthorizationHeader(authHeader: string | string | undefined): string | undefined {
  if (authHeader == null) return undefined;
  const h = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const m = /^Bearer\s+(.+)$/i.exec(h?.trim() ?? '');
  return m?.[1]?.trim() || undefined;
}

async function authenticateBearer(rawBearer: string | undefined): Promise<SharedDslPrincipal> {
  const bearer = typeof rawBearer === 'string' ? rawBearer.trim() : '';
  if (!bearer) return { kind: 'auth_failed', reason: 'no_bearer' };

  const { secretKey: clerkSecret, authorizedParties: parties } = clerkAuthEnvFromProcess();
  if (!clerkSecret) return { kind: 'auth_failed', reason: 'jwt_invalid' };

  try {
    const opts: Parameters<typeof verifyToken>[1] = { secretKey: clerkSecret };
    if (parties.length) opts.authorizedParties = parties;

    let payload: Record<string, unknown>;
    try {
      payload = (await verifyToken(bearer, opts)) as Record<string, unknown>;
    } catch (e) {
      if (!parties.length) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        '[shared-dsl] verifyToken with authorizedParties failed; retried with secretKey only.',
        msg
      );
      payload = (await verifyToken(bearer, { secretKey: clerkSecret })) as Record<string, unknown>;
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    if (!sub) return { kind: 'auth_failed', reason: 'jwt_invalid' };

    if (!isClerkJwtEmailAllowed(payload, allowedUserEmails)) {
      return { kind: 'email_not_allowed' };
    }
    return {
      kind: 'clerk',
      userId: sub,
      orgRoleNorm: extractOrgRoleNormFromVerifiedJwt(payload),
      jwtPayload: payload,
    };
  } catch {
    return { kind: 'auth_failed', reason: 'jwt_invalid' };
  }
}

function orgAdminRoles(): string[] {
  return parseOrgAdminRolesFromEnv(process.env.CAPACITY_ORG_ADMIN_ROLES);
}

type ReadAuthResult = { ok: false } | { ok: true; workspaceAccess: CapacityWorkspaceAccess | null };

async function authorizeRead(req: VercelRequest, res: VercelResponse): Promise<ReadAuthResult> {
  if (!clerkSecretKeyConfigured()) return { ok: true, workspaceAccess: null };
  const bearer = bearerFromAuthorizationHeader(req.headers.authorization);
  const p = await authenticateBearer(bearer);
  if (p.kind === 'email_not_allowed') {
    res.status(403).json({
      error: 'forbidden',
      message:
        'This account is not on the deployment allowlist. Use an authorized email or ask for access.',
    });
    return { ok: false };
  }
  if (p.kind === 'clerk') {
    const workspaceAccess = parseCapacityWorkspaceAccess(p.jwtPayload, p.orgRoleNorm, orgAdminRoles());
    return { ok: true, workspaceAccess };
  }
  if (p.kind === 'auth_failed') {
    const body =
      p.reason === 'no_bearer'
        ? {
            error: 'unauthorized',
            code: 'missing_bearer',
            message: 'No Authorization bearer was sent. Sign in so the workbench attaches a Clerk session token.',
          }
        : {
            error: 'unauthorized',
            code: 'clerk_jwt_invalid',
            message:
              'Clerk JWT did not verify against CLERK_AUTHENTICATION_CLERK_SECRET_KEY / CLERK_SECRET_KEY. Use keys from the same Clerk application as the browser publishable key; sign out and sign in; if CAPACITY_CLERK_AUTHORIZED_PARTIES is set it must include this page origin exactly.',
          };
    res.status(401).json(body);
    return { ok: false };
  }
  const _exhaustive: never = p;
  return _exhaustive;
}

// --- Postgres-backed read path ---

async function handlePostgresGet(
  _req: VercelRequest,
  res: VercelResponse,
  ws: CapacityWorkspaceAccess | null
): Promise<void> {
  const { getMultiMarketBundle } = await import('../services/cacheService');
  const { supabaseServiceClient } = await import('../lib/supabaseClient');

  const client = supabaseServiceClient();
  const { data: allMarkets } = await client
    .from('markets')
    .select('id')
    .eq('is_active', true)
    .order('display_order');

  if (!allMarkets || allMarkets.length === 0) {
    res.status(404).json({ ok: false, reason: 'no_markets' });
    return;
  }

  let marketIds = allMarkets.map((m: { id: string }) => m.id);
  if (ws && !ws.legacyFullAccess && !ws.admin && ws.allowedMarketIds.size > 0) {
    marketIds = marketIds.filter((id: string) => ws.allowedMarketIds.has(id));
  }

  const yaml = await getMultiMarketBundle(marketIds);
  if (!yaml.trim()) {
    res.status(404).json({ ok: false, reason: 'no_published_artifacts' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  res.status(200).send(yaml);
}

// --- Route handler ---

async function handleSharedDsl(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'HEAD') {
    const ra = await authorizeRead(req, res);
    if (!ra.ok) return;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    const ra = await authorizeRead(req, res);
    if (!ra.ok) return;
    try {
      await handlePostgresGet(req, res, ra.workspaceAccess);
    } catch (e) {
      console.error('[shared-dsl GET]', e);
      res.status(500).json({
        error: 'Failed to read from Postgres',
        message: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }

  if (req.method === 'PUT') {
    res.status(410).json({
      error: 'gone',
      message:
        'Direct YAML writes via PUT are no longer supported. ' +
        'Use the fragment CRUD API (/api/fragments) or the expert YAML import (/api/import) instead.',
    });
    return;
  }

  res.setHeader('Allow', 'GET, HEAD');
  res.status(405).json({ error: 'method_not_allowed' });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    await handleSharedDsl(req, res);
  } catch (e) {
    console.error('[shared-dsl] entry', e);
    if (res.headersSent) return;
    const errMsg = e instanceof Error ? e.message : String(e);
    res.status(500).json({
      error: 'shared_dsl_module_failed',
      message: errMsg,
      hint: 'Check Vercel function logs for [shared-dsl] entry.',
    });
  }
}
