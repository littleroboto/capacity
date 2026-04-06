/**
 * Implementation for `/api/shared-dsl` — bundled by `scripts/bundle-shared-dsl.mjs` into
 * `shared-dsl.runtime.cjs`. File name starts with `_` so Vercel does not deploy it as a
 * separate serverless route.
 *
 * Env: Blob, Clerk, allowlist, cap_* claims (same as before).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  BlobError,
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  head,
  put,
} from '@vercel/blob';
import { verifyToken } from '@clerk/backend';
import { isClerkJwtEmailAllowed, parseAllowedEmailSet } from './_allowedUserEmails';
import { SEGMENT_TO_MARKETS, WORKSPACE_MANIFEST_MARKET_ORDER } from './_capacityWorkspaceAcl.data';

// --- dslMarketLine ---
const DSL_MARKET_LINE = /^((?:market|country):\s*(\S+))/m;

function parseDslMarketId(segment: string): string | null {
  const m = segment.match(DSL_MARKET_LINE);
  return m ? m[2]! : null;
}

// --- capacityWorkspaceAcl ---
const MULTI_DOC_SPLIT = /\r?\n---\s*\r?\n/;

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

function splitMultiDocYamlToMap(multiDocYaml: string): Record<string, string> {
  const trimmed = multiDocYaml.trim();
  if (!trimmed) return {};
  const parts = MULTI_DOC_SPLIT.test(trimmed) ? trimmed.split(MULTI_DOC_SPLIT) : [trimmed];
  const out: Record<string, string> = {};
  for (const seg of parts) {
    const id = parseDslMarketId(seg);
    if (id) out[id] = seg.trim();
  }
  return out;
}

function mergeMapToYaml(dslByMarket: Record<string, string>, order: readonly string[]): string {
  const parts: string[] = [];
  for (const id of order) {
    const raw = dslByMarket[id]?.trim();
    if (!raw) continue;
    parts.push(raw.replace(/\s+$/, ''));
  }
  return parts.join('\n---\n\n');
}

function filterWorkspaceYamlToMarkets(
  multiDocYaml: string,
  allow: ReadonlySet<string>,
  order: readonly string[] = WORKSPACE_MANIFEST_MARKET_ORDER
): string {
  const by = splitMultiDocYamlToMap(multiDocYaml);
  const next: Record<string, string> = {};
  for (const id of order) {
    if (!allow.has(id)) continue;
    if (by[id]) next[id] = by[id]!;
  }
  return mergeMapToYaml(next, order);
}

function mergePartialWorkspacePut(
  currentYaml: string,
  clientYaml: string,
  allowed: ReadonlySet<string>,
  order: readonly string[] = WORKSPACE_MANIFEST_MARKET_ORDER
): string {
  const cur = splitMultiDocYamlToMap(currentYaml);
  const cli = splitMultiDocYamlToMap(clientYaml);
  const merged: Record<string, string> = { ...cur };
  for (const id of allowed) {
    if (cli[id]) merged[id] = cli[id]!;
  }
  return mergeMapToYaml(merged, order);
}

// --- clerkAuthSharedDsl ---
type SharedDslPrincipal =
  | { kind: 'clerk'; userId: string; orgRoleNorm: string | null; jwtPayload: Record<string, unknown> }
  | { kind: 'legacy' }
  | { kind: 'none' }
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

function parseClerkDslWriteAllowListFromEnv(raw: string | undefined): string[] | null {
  const t = raw?.trim();
  if (!t) return null;
  const parts = t.split(',').map((s) => normalizeClerkOrgRoleToken(s)).filter(Boolean);
  return parts.length ? parts : null;
}

function clerkJwtAllowedToPutSharedDsl(orgRoleNorm: string | null, allowList: string[] | null): boolean {
  if (allowList == null) return true;
  if (!orgRoleNorm) return false;
  return allowList.includes(orgRoleNorm);
}

function clerkSecretKeyConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY?.trim());
}

function legacySharedDslWriteDisabled(): boolean {
  const v = process.env.CAPACITY_DISABLE_LEGACY_SHARED_DSL_WRITE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function authorizedParties(): string[] | undefined {
  const raw = process.env.CAPACITY_CLERK_AUTHORIZED_PARTIES?.trim();
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

async function authenticateSharedDslBearer(
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
        if (!isClerkJwtEmailAllowed(payload, allowedUserEmails)) {
          return { kind: 'email_not_allowed' };
        }
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

function bearerFromAuthorizationHeader(authHeader: string | string | undefined): string | undefined {
  if (authHeader == null) return undefined;
  const h = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const m = /^Bearer\s+(.+)$/i.exec(h?.trim() ?? '');
  return m?.[1]?.trim() || undefined;
}

// --- shared-dsl route ---
const PATHNAME = 'capacity-shared/workspace.yaml';

function blobStoreAccess(): 'public' | 'private' {
  const v = process.env.CAPACITY_BLOB_ACCESS?.trim().toLowerCase();
  return v === 'public' ? 'public' : 'private';
}

async function getSharedWorkspaceBlob(token: string): Promise<Awaited<ReturnType<typeof get>>> {
  const primary = blobStoreAccess();
  const alternate: 'public' | 'private' = primary === 'private' ? 'public' : 'private';

  const run = (access: 'public' | 'private') =>
    get(PATHNAME, { access, token, useCache: false });

  try {
    return await run(primary);
  } catch (first) {
    if (!isBlobTransportError(first)) throw first;
    try {
      const second = await run(alternate);
      if (second?.statusCode === 200 && second.stream) {
        console.warn(
          `[shared-dsl] Blob GET succeeded with access="${alternate}" but CAPACITY_BLOB_ACCESS implies "${primary}". Set CAPACITY_BLOB_ACCESS=${alternate} in Vercel env to match this store.`
        );
      }
      return second;
    } catch {
      throw first;
    }
  }
}

function blobAccessMismatchResponse(errMsg: string) {
  return {
    error: 'blob_access_mismatch' as const,
    message: errMsg,
    hint:
      'CAPACITY_BLOB_ACCESS must match how blobs were written (public vs private). Try unsetting it (defaults to private) or set CAPACITY_BLOB_ACCESS=public if the store is public. Redeploy after changing env.',
  };
}

function isBlobTransportError(e: unknown): boolean {
  if (e instanceof BlobError) return true;
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'BlobError';
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) chunks.push(value);
  }
  if (chunks.length === 0) return '';
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return new TextDecoder('utf-8').decode(out);
}

function orgAdminRoles(): string[] {
  return parseOrgAdminRolesFromEnv(process.env.CAPACITY_ORG_ADMIN_ROLES);
}

function fullWorkspaceAccess(): CapacityWorkspaceAccess {
  return parseCapacityWorkspaceAccess({}, null, orgAdminRoles());
}

type ReadAuthResult = { ok: false } | { ok: true; workspaceAccess: CapacityWorkspaceAccess | null };

async function authorizeRead(req: VercelRequest, res: VercelResponse): Promise<ReadAuthResult> {
  if (!clerkSecretKeyConfigured()) return { ok: true, workspaceAccess: null };
  const bearer = bearerFromAuthorizationHeader(req.headers.authorization);
  const p = await authenticateSharedDslBearer(bearer, 'read');
  if (p.kind === 'email_not_allowed') {
    res.status(403).json({
      error: 'forbidden',
      message:
        'This account is not on the deployment allowlist. Use an authorized email or ask for access. The JWT must include your email (Clerk → Sessions → Customize session token).',
    });
    return { ok: false };
  }
  if (p.kind === 'clerk') {
    const workspaceAccess = parseCapacityWorkspaceAccess(p.jwtPayload, p.orgRoleNorm, orgAdminRoles());
    return { ok: true, workspaceAccess };
  }
  res.status(401).json({
    error: 'unauthorized',
    message: 'Sign in is required to load the team workspace. Ensure CLERK_SECRET_KEY is set on the server and you are signed in.',
  });
  return { ok: false };
}

type WriteAuthResult =
  | { ok: false }
  | { ok: true; principal: SharedDslPrincipal; workspaceAccess: CapacityWorkspaceAccess };

async function authorizeWrite(req: VercelRequest, res: VercelResponse): Promise<WriteAuthResult> {
  const bearer = bearerFromAuthorizationHeader(req.headers.authorization);
  const p = await authenticateSharedDslBearer(bearer, 'write');
  if (p.kind === 'email_not_allowed') {
    res.status(403).json({
      error: 'forbidden',
      message:
        'This account is not on the deployment allowlist. Use an authorized email or ask for access. The JWT must include your email (Clerk → Sessions → Customize session token).',
    });
    return { ok: false };
  }
  const full = fullWorkspaceAccess();

  if (clerkSecretKeyConfigured()) {
    if (p.kind === 'legacy') return { ok: true, principal: p, workspaceAccess: full };
    if (p.kind === 'clerk') {
      const allow = parseClerkDslWriteAllowListFromEnv(process.env.CAPACITY_CLERK_DSL_WRITE_ROLES);
      if (!clerkJwtAllowedToPutSharedDsl(p.orgRoleNorm, allow)) {
        res.status(403).json({
          error: 'forbidden',
          message:
            'Your organization role cannot save the team workspace. Use an active organization in Clerk and a role listed in CAPACITY_CLERK_DSL_WRITE_ROLES (server env), e.g. admin or a custom editor role.',
        });
        return { ok: false };
      }
      const workspaceAccess = parseCapacityWorkspaceAccess(p.jwtPayload, p.orgRoleNorm, orgAdminRoles());
      if (!workspaceAccess.canEditYaml) {
        res.status(403).json({
          error: 'forbidden',
          message:
            'This account is a viewer for the team workspace. Only editors (cap_ed) or admins (cap_admin / org admin role) can save YAML.',
        });
        return { ok: false };
      }
      return { ok: true, principal: p, workspaceAccess };
    }
    res.status(401).json({
      error: 'unauthorized',
      message:
        p.kind === 'none'
          ? legacySharedDslWriteDisabled()
            ? 'Sign in and send a Clerk session JWT. Legacy team write secret is disabled on this deployment.'
            : 'Send a Clerk session token (signed in) or the team write secret in Authorization: Bearer.'
          : 'Invalid credentials.',
    });
    return { ok: false };
  }

  if (p.kind === 'legacy') return { ok: true, principal: p, workspaceAccess: full };
  const secret = process.env.CAPACITY_SHARED_DSL_SECRET?.trim();
  if (!secret) {
    res.status(503).json({ error: 'Writes are not configured (CAPACITY_SHARED_DSL_SECRET or CLERK_SECRET_KEY).' });
    return { ok: false };
  }
  res.status(401).json({ error: 'unauthorized' });
  return { ok: false };
}

async function handleSharedDsl(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'Server storage is not configured (BLOB_READ_WRITE_TOKEN).' });
    return;
  }

  if (req.method === 'HEAD') {
    const ra = await authorizeRead(req, res);
    if (!ra.ok) return;
    try {
      const meta = await head(PATHNAME, { token });
      res.setHeader('X-DSL-Etag', meta.etag);
      res.setHeader('Access-Control-Expose-Headers', 'X-DSL-Etag');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).end();
    } catch (e) {
      if (e instanceof BlobNotFoundError) {
        res.status(404).end();
        return;
      }
      console.error('[shared-dsl HEAD]', e);
      res.status(500).json({ error: 'Failed to read workspace metadata' });
    }
    return;
  }

  if (req.method === 'GET') {
    const ra = await authorizeRead(req, res);
    if (!ra.ok) return;
    try {
      const result = await getSharedWorkspaceBlob(token);
      if (!result || result.statusCode !== 200 || !result.stream) {
        res.status(404).json({ ok: false, reason: 'no_workspace' });
        return;
      }
      let yaml = await streamToText(result.stream);
      const ws = ra.workspaceAccess;
      if (ws && !ws.legacyFullAccess && !ws.admin) {
        yaml = filterWorkspaceYamlToMarkets(yaml, ws.allowedMarketIds);
      }
      res.setHeader('X-DSL-Etag', result.blob.etag);
      res.setHeader('Access-Control-Expose-Headers', 'X-DSL-Etag');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.status(200).send(yaml);
    } catch (e) {
      console.error('[shared-dsl GET]', e);
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes('public access') && errMsg.includes('private store')) {
        res.status(500).json(blobAccessMismatchResponse(errMsg));
        return;
      }
      if (isBlobTransportError(e)) {
        res.status(502).json({
          error: 'blob_fetch_failed',
          message: errMsg,
          hint:
            'Check BLOB_READ_WRITE_TOKEN and CAPACITY_BLOB_ACCESS on Vercel. Function logs may show more detail.',
        });
        return;
      }
      res.status(500).json({
        error: 'Failed to read workspace',
        message: errMsg,
        hint: 'See Vercel function logs for [shared-dsl GET].',
      });
    }
    return;
  }

  if (req.method === 'PUT') {
    const wa = await authorizeWrite(req, res);
    if (!wa.ok) return;

    let body: unknown;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      res.status(400).json({ error: 'invalid_json', message: 'PUT body must be valid JSON.' });
      return;
    }
    const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    let yaml = typeof b.yaml === 'string' ? b.yaml : '';
    if (!yaml.trim()) {
      res.status(400).json({ error: 'yaml required' });
      return;
    }
    const ifMatch = typeof b.ifMatch === 'string' && b.ifMatch.trim() ? b.ifMatch.trim() : undefined;

    const ws = wa.workspaceAccess;
    if (
      wa.principal.kind === 'clerk' &&
      ws &&
      !ws.legacyFullAccess &&
      !ws.admin &&
      ws.allowedMarketIds.size > 0
    ) {
      let current = '';
      const curResult = await getSharedWorkspaceBlob(token);
      if (curResult?.statusCode === 200 && curResult.stream) {
        current = await streamToText(curResult.stream);
      }
      yaml = mergePartialWorkspacePut(current, yaml, ws.allowedMarketIds);
    }

    try {
      const blobAccess = blobStoreAccess();
      const putResult = await put(PATHNAME, yaml, {
        access: blobAccess,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'text/yaml; charset=utf-8',
        token,
        ifMatch,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ok: true, etag: putResult.etag, version: putResult.etag });
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) {
        res.status(409).json({ error: 'conflict', message: 'Another edit was saved first. Reload the latest workspace.' });
        return;
      }
      const blobAccess = blobStoreAccess();
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[shared-dsl PUT]', e, { blobAccess, pathname: PATHNAME });
      if (errMsg.includes('public access') && errMsg.includes('private store')) {
        res.status(500).json(blobAccessMismatchResponse(errMsg));
        return;
      }
      res.status(500).json({ error: 'Failed to save workspace', message: errMsg });
    }
    return;
  }

  res.setHeader('Allow', 'GET, HEAD, PUT');
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
      hint:
        'The shared-dsl handler failed before sending a response. Check Vercel function logs for [shared-dsl] entry.',
    });
  }
}
