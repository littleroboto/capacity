import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateScope } from './lib/authScope';

function bearerFromHeader(authHeader: string | string[] | undefined): string | undefined {
  if (!authHeader) return undefined;
  const h = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const m = /^Bearer\s+(.+)$/i.exec(h?.trim() ?? '');
  return m?.[1]?.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const bearer = bearerFromHeader(req.headers.authorization);
  if (!bearer) {
    res.status(401).json({ error: 'unauthorized', message: 'Bearer token required' });
    return;
  }

  const auth = await authenticateScope(bearer, res);
  if (!auth.ok) return;
  const { scope } = auth;

  res.status(200).json({
    userId: scope.userId,
    email: scope.email,
    isAdmin: scope.isAdmin,
    canEdit: scope.canEdit,
    operatingModelIds: scope.operatingModelIds,
    segmentIds: scope.segmentIds,
    marketIds: scope.marketIds,
  });
}
