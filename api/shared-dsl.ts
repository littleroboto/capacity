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
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobNotFoundError, BlobPreconditionFailedError, get, head, put } from '@vercel/blob';
import {
  authenticateSharedDslBearer,
  bearerFromAuthorizationHeader,
  clerkJwtAllowedToPutSharedDsl,
  clerkSecretKeyConfigured,
  legacySharedDslWriteDisabled,
  parseClerkDslWriteAllowListFromEnv,
} from './lib/clerkAuthSharedDsl';

const PATHNAME = 'capacity-shared/workspace.yaml';

function blobStoreAccess(): 'public' | 'private' {
  const v = process.env.CAPACITY_BLOB_ACCESS?.trim().toLowerCase();
  return v === 'public' ? 'public' : 'private';
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

async function requireReadAuth(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (!clerkSecretKeyConfigured()) return true;
  const bearer = bearerFromAuthorizationHeader(req.headers.authorization);
  const p = await authenticateSharedDslBearer(bearer, 'read');
  if (p.kind === 'clerk') return true;
  res.status(401).json({
    error: 'unauthorized',
    message: 'Sign in is required to load the team workspace. Ensure CLERK_SECRET_KEY is set on the server and you are signed in.',
  });
  return false;
}

async function requireWriteAuth(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const bearer = bearerFromAuthorizationHeader(req.headers.authorization);
  const p = await authenticateSharedDslBearer(bearer, 'write');

  if (clerkSecretKeyConfigured()) {
    if (p.kind === 'legacy') return true;
    if (p.kind === 'clerk') {
      const allow = parseClerkDslWriteAllowListFromEnv(process.env.CAPACITY_CLERK_DSL_WRITE_ROLES);
      if (!clerkJwtAllowedToPutSharedDsl(p.orgRoleNorm, allow)) {
        res.status(403).json({
          error: 'forbidden',
          message:
            'Your organization role cannot save the team workspace. Use an active organization in Clerk and a role listed in CAPACITY_CLERK_DSL_WRITE_ROLES (server env), e.g. admin or a custom editor role.',
        });
        return false;
      }
      return true;
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
    return false;
  }

  if (p.kind === 'legacy') return true;
  const secret = process.env.CAPACITY_SHARED_DSL_SECRET?.trim();
  if (!secret) {
    res.status(503).json({ error: 'Writes are not configured (CAPACITY_SHARED_DSL_SECRET or CLERK_SECRET_KEY).' });
    return false;
  }
  res.status(401).json({ error: 'unauthorized' });
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'Server storage is not configured (BLOB_READ_WRITE_TOKEN).' });
    return;
  }

  if (req.method === 'HEAD') {
    if (!(await requireReadAuth(req, res))) return;
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
    if (!(await requireReadAuth(req, res))) return;
    try {
      const access = blobStoreAccess();
      const result = await get(PATHNAME, { access, token, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) {
        res.status(404).json({ ok: false, reason: 'no_workspace' });
        return;
      }
      const yaml = await streamToText(result.stream);
      res.setHeader('X-DSL-Etag', result.blob.etag);
      res.setHeader('Access-Control-Expose-Headers', 'X-DSL-Etag');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.status(200).send(yaml);
    } catch (e) {
      console.error('[shared-dsl GET]', e);
      res.status(500).json({ error: 'Failed to read workspace' });
    }
    return;
  }

  if (req.method === 'PUT') {
    if (!(await requireWriteAuth(req, res))) return;

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const yaml = typeof body?.yaml === 'string' ? body.yaml : '';
    if (!yaml.trim()) {
      res.status(400).json({ error: 'yaml required' });
      return;
    }
    const ifMatch = typeof body?.ifMatch === 'string' && body.ifMatch.trim() ? body.ifMatch.trim() : undefined;

    try {
      const access = blobStoreAccess();
      const putResult = await put(PATHNAME, yaml, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'text/yaml; charset=utf-8',
        token,
        ifMatch,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ok: true, etag: putResult.etag });
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) {
        res.status(409).json({ error: 'conflict', message: 'Another edit was saved first. Reload the latest workspace.' });
        return;
      }
      const access = blobStoreAccess();
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[shared-dsl PUT]', e, { blobAccess: access, pathname: PATHNAME });
      if (errMsg.includes('public access') && errMsg.includes('private store')) {
        res.status(500).json({
          error: 'blob_access_mismatch',
          message: errMsg,
          hint:
            'Production is sending public Blob access but your store is private. Redeploy so this api/shared-dsl.ts runs (it uses private access by default). In Vercel: Deployments → Redeploy, or push the latest commit. Do not set CAPACITY_BLOB_ACCESS=public unless the store is public.',
        });
        return;
      }
      res.status(500).json({ error: 'Failed to save workspace', message: errMsg });
    }
    return;
  }

  res.setHeader('Allow', 'GET, HEAD, PUT');
  res.status(405).json({ error: 'method_not_allowed' });
}
