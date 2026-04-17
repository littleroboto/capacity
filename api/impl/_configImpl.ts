import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateScope } from '../_lib/authScope';
import { scopeAllowsMarket } from '../_lib/scopeResolver';
import { getActiveArtifact, getMultiMarketBundle } from '../_services/cacheService';
import { previewAssembledYamlForMarket } from '../_services/assemblyPipeline';
import { supabaseServiceClient } from '../_lib/supabaseClient';
import type { OperatingModelId } from '../_lib/domainTypes';

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

  const marketId = req.query.market as string | undefined;
  const markets = req.query.markets as string | undefined;

  if (marketId) {
    const client = supabaseServiceClient();
    const { data: mkt } = await client.from('markets').select('segment_id, operating_model_id').eq('id', marketId).single();
    if (mkt && !scopeAllowsMarket(scope, marketId, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
      res.status(403).json({ error: 'forbidden' }); return;
    }

    const yaml = await getActiveArtifact(marketId);
    if (yaml) {
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(yaml);
      return;
    }

    const assembled = await previewAssembledYamlForMarket(marketId);
    if (assembled) {
      const previewNotice =
        '# Assembled from live database fragments (preview — not a published artifact).\n' +
        '# Use Build & Publish in admin to create a versioned published artifact.\n\n';
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Capacity-Config-Source', 'assembled-preview');
      res.status(200).send(previewNotice + assembled);
      return;
    }

    res.status(404).json({
      error:
        'No YAML for this market: no published or draft build artifact, and live assembly failed or the market is missing/inactive.',
    });
    return;
  }

  if (markets) {
    const ids = markets.split(',').map(s => s.trim()).filter(Boolean);
    const client = supabaseServiceClient();
    const allowed: string[] = [];
    for (const id of ids) {
      const { data: mkt } = await client.from('markets').select('segment_id, operating_model_id').eq('id', id).single();
      if (mkt && scopeAllowsMarket(scope, id, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
        allowed.push(id);
      }
    }
    const yaml = await getMultiMarketBundle(allowed);
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(yaml);
    return;
  }

  res.status(400).json({ error: 'Provide market or markets query param' });
}
