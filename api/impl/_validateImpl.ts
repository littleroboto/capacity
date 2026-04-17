import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateScope } from '../_lib/authScope';
import { scopeAllowsMarket } from '../_lib/scopeResolver';
import { loadMarketFragments } from '../_services/assemblyPipeline';
import { validateMarketFragments, persistValidationResults } from '../_services/validationService';
import { supabaseServiceClient } from '../_lib/supabaseClient';
import type { OperatingModelId } from '../_lib/domainTypes';

function bearerFromHeader(h: string | string[] | undefined): string | undefined {
  if (!h) return undefined;
  const v = Array.isArray(h) ? h[0] : h;
  return /^Bearer\s+(.+)$/i.exec(v?.trim() ?? '')?.[1]?.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const bearer = bearerFromHeader(req.headers.authorization);
  if (!bearer) { res.status(401).json({ error: 'unauthorized' }); return; }

  const auth = await authenticateScope(bearer, res);
  if (!auth.ok) return;
  const { scope } = auth;

  const marketId = req.query.market as string;
  if (!marketId) { res.status(400).json({ error: 'market query param required' }); return; }

  const client = supabaseServiceClient();
  const { data: mkt } = await client.from('markets').select('segment_id, operating_model_id').eq('id', marketId).single();
  if (mkt && !scopeAllowsMarket(scope, marketId, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
    res.status(403).json({ error: 'forbidden' }); return;
  }

  if (req.method === 'POST') {
    const fragments = await loadMarketFragments(marketId);
    if (!fragments) { res.status(404).json({ error: 'market not found' }); return; }
    const report = validateMarketFragments(fragments);
    await persistValidationResults(report.issues, 'cross_fragment', 'market', marketId);
    res.status(200).json(report);
    return;
  }

  if (req.method === 'GET') {
    const { data } = await client.from('validation_results')
      .select('*')
      .eq('target_id', marketId)
      .order('created_at', { ascending: false })
      .limit(100);
    res.status(200).json(data ?? []);
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
