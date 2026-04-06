/**
 * Shared multi-document workspace YAML (Vercel Blob).
 *
 * Env:
 * - `BLOB_READ_WRITE_TOKEN` — required
 * - `CLERK_SECRET_KEY` — when set, GET/HEAD require a valid Clerk session JWT; PUT accepts JWT or legacy secret
 * - `CAPACITY_SHARED_DSL_SECRET` — legacy write secret (optional if only Clerk JWT used for PUT)
 * - `CAPACITY_CLERK_AUTHORIZED_PARTIES` — optional comma-separated origins for `verifyToken` (recommended in production)
 * - `CAPACITY_DISABLE_LEGACY_SHARED_DSL_WRITE` — when `1` and `CLERK_SECRET_KEY` is set, PUT rejects legacy shared secret (JWT only)
 * - `CAPACITY_CLERK_DSL_WRITE_ROLES` — optional comma list (e.g. `admin,member,editor`); JWT org role must match after normalizing; unset = any signed-in user may PUT
 * - `CAPACITY_ORG_ADMIN_ROLES` — comma list of Clerk org roles (normalized) that imply workspace admin (see `cap_*` claims in `api/lib/capacityWorkspaceAcl.ts`). Default: `admin`
 * - `CAPACITY_ALLOWED_USER_EMAILS` — optional comma-separated emails; when set, only those users may use Clerk JWT for this API (JWT must include `email` — see `api/lib/allowedUserEmails.ts`). Match client `VITE_ALLOWED_USER_EMAILS`.
 *
 * Session token claims (optional; set in Clerk → Sessions → Customize session token). When absent, behaviour is unchanged (full workspace, edits if org role allows PUT):
 * - `cap_admin` — boolean; full markets + edit
 * - `cap_segs` — string e.g. `LIOM` or `LIOM,IOM` (segment codes from `segments.json`)
 * - `cap_mkts` — optional comma-separated manifest market ids; intersects with `cap_segs` when both set
 * - `cap_ed` — boolean; when true with segment scope, user may edit YAML for allowed markets only (PUT merges into full blob)
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
import {
  filterWorkspaceYamlToMarkets,
  mergePartialWorkspacePut,
  parseCapacityWorkspaceAccess,
  parseOrgAdminRolesFromEnv,
  type CapacityWorkspaceAccess,
} from './capacityWorkspaceAcl';
import {
  authenticateSharedDslBearer,
  bearerFromAuthorizationHeader,
  clerkJwtAllowedToPutSharedDsl,
  clerkSecretKeyConfigured,
  legacySharedDslWriteDisabled,
  parseClerkDslWriteAllowListFromEnv,
  type SharedDslPrincipal,
} from './clerkAuthSharedDsl';

const PATHNAME = 'capacity-shared/workspace.yaml';

function blobStoreAccess(): 'public' | 'private' {
  const v = process.env.CAPACITY_BLOB_ACCESS?.trim().toLowerCase();
  return v === 'public' ? 'public' : 'private';
}

/** `get()` uses `{store}.{public|private}.blob.vercel-storage.com`; must match how objects were written. Retry alternate access on BlobError (common mis-set `CAPACITY_BLOB_ACCESS`). */
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

export async function handleSharedDsl(req: VercelRequest, res: VercelResponse): Promise<void> {
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
      /** `version` duplicates `etag` — opaque optimistic-lock token for clients (no integer revision until DB-backed versioning). */
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
