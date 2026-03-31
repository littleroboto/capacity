/**
 * Shared multi-document workspace YAML (Vercel Blob + team write secret).
 * Configure: BLOB_READ_WRITE_TOKEN, CAPACITY_SHARED_DSL_SECRET (same value users enter in the app).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobNotFoundError, BlobPreconditionFailedError, get, head, put } from '@vercel/blob';

const PATHNAME = 'capacity-shared/workspace.yaml';

/**
 * Must match the Blob store type. Default `private` (Vercel’s usual default for new stores).
 * Set `CAPACITY_BLOB_ACCESS=public` only if the store is explicitly public.
 */
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'Server storage is not configured (BLOB_READ_WRITE_TOKEN).' });
    return;
  }

  if (req.method === 'HEAD') {
    try {
      const meta = await head(PATHNAME, { token });
      res.setHeader('X-DSL-Etag', meta.etag);
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
    try {
      // Must match store access: use `private` for private Blob stores (Vercel default for many new stores).
      const access = blobStoreAccess();
      const result = await get(PATHNAME, { access, token, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) {
        res.status(404).json({ ok: false, reason: 'no_workspace' });
        return;
      }
      const yaml = await streamToText(result.stream);
      res.setHeader('X-DSL-Etag', result.blob.etag);
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
    const secret = process.env.CAPACITY_SHARED_DSL_SECRET;
    if (!secret) {
      res.status(503).json({ error: 'Writes are not configured (CAPACITY_SHARED_DSL_SECRET).' });
      return;
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

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
