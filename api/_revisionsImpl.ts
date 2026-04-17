import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyClerkBearerToken } from './lib/verifyClerkBearer';
import { resolveUserScope } from './lib/scopeResolver';
import { getRevisionHistory, getRevisionSnapshot } from './services/fragmentService';
import type { FragmentType } from './lib/domainTypes';

function bearerFromHeader(h: string | string[] | undefined): string | undefined {
  if (!h) return undefined;
  const v = Array.isArray(h) ? h[0] : h;
  return /^Bearer\s+(.+)$/i.exec(v?.trim() ?? '')?.[1]?.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const bearer = bearerFromHeader(req.headers.authorization);
  if (!bearer) { res.status(401).json({ error: 'unauthorized' }); return; }

  try {
    const payload = (await verifyClerkBearerToken(bearer)) as Record<string, unknown>;
    if (!payload.sub) { res.status(401).json({ error: 'invalid token' }); return; }
  } catch {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const revisionId = req.query.revisionId as string | undefined;
  if (revisionId) {
    const snapshot = await getRevisionSnapshot(Number(revisionId));
    if (!snapshot) { res.status(404).json({ error: 'revision not found' }); return; }
    res.status(200).json(snapshot);
    return;
  }

  const table = req.query.table as string;
  const id = req.query.id as string;
  if (!table || !id) {
    res.status(400).json({ error: 'Provide table+id or revisionId query params' });
    return;
  }

  const history = await getRevisionHistory(table as FragmentType, id);
  res.status(200).json(history);
}
