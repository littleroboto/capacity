import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateScope } from '../_lib/authScope';
import { supabaseServiceClient } from '../_lib/supabaseClient';

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

  const auth = await authenticateScope(bearer, res);
  if (!auth.ok) return;
  const { scope } = auth;

  const client = supabaseServiceClient();
  const marketId = req.query.market as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  let query = client.from('audit_events').select('*').order('created_at', { ascending: false }).limit(limit);

  if (marketId) {
    query = query.eq('market_id', marketId);
  } else if (!scope.isAdmin) {
    if (scope.marketIds.length > 0) {
      query = query.in('market_id', scope.marketIds);
    } else if (scope.segmentIds.length > 0) {
      query = query.in('segment_id', scope.segmentIds);
    }
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(200).json(data ?? []);
}
