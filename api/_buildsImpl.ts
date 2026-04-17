import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateScope } from './lib/authScope';
import { scopeAllowsMarketEdit } from './lib/scopeResolver';
import { buildMarket, publishBuild } from './services/assemblyPipeline';
import { cachePublishedArtifact, invalidateMarketCache } from './services/cacheService';
import { supabaseServiceClient } from './lib/supabaseClient';
import type { OperatingModelId } from './lib/domainTypes';

function bearerFromHeader(h: string | string[] | undefined): string | undefined {
  if (!h) return undefined;
  const v = Array.isArray(h) ? h[0] : h;
  return /^Bearer\s+(.+)$/i.exec(v?.trim() ?? '')?.[1]?.trim();
}

async function resolveAuth(req: VercelRequest, res: VercelResponse) {
  const bearer = bearerFromHeader(req.headers.authorization);
  if (!bearer) { res.status(401).json({ error: 'unauthorized' }); return null; }
  const auth = await authenticateScope(bearer, res);
  if (!auth.ok) return null;
  return { scope: auth.scope, email: auth.email };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;

  const method = req.method?.toUpperCase();

  if (method === 'POST') {
    const action = req.query.action as string;
    if (action === 'build') {
      const marketId = req.query.market as string;
      if (!marketId) { res.status(400).json({ error: 'market query param required' }); return; }

      const client = supabaseServiceClient();
      const { data: mkt } = await client.from('markets').select('segment_id, operating_model_id').eq('id', marketId).single();
      if (!mkt) { res.status(404).json({ error: 'market not found' }); return; }
      if (!scopeAllowsMarketEdit(auth.scope, marketId, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
        res.status(403).json({ error: 'forbidden' }); return;
      }

      const result = await buildMarket(marketId, auth.scope.userId);
      if (result.error) {
        res.status(500).json({ error: result.error, build: result.build });
        return;
      }
      res.status(200).json({ build: result.build, artifact: result.artifact });
      return;
    }

    if (action === 'publish') {
      const buildId = req.query.id as string;
      if (!buildId) { res.status(400).json({ error: 'id query param required' }); return; }

      const client = supabaseServiceClient();
      const { data: build } = await client.from('config_builds').select('*').eq('id', buildId).single();
      if (!build) { res.status(404).json({ error: 'build not found' }); return; }
      if (build.market_id) {
        const { data: mkt } = await client.from('markets').select('segment_id, operating_model_id').eq('id', build.market_id).single();
        if (mkt && !scopeAllowsMarketEdit(auth.scope, build.market_id, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
          res.status(403).json({ error: 'forbidden' }); return;
        }
      }

      const result = await publishBuild(buildId, auth.scope.userId);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }

      // Cache the published artifact
      if (build.market_id) {
        const { data: artifact } = await client.from('config_artifacts').select('*').eq('build_id', buildId).single();
        if (artifact) {
          await cachePublishedArtifact(
            build.market_id,
            build.operating_model_id,
            build.segment_id || '',
            buildId,
            artifact.content,
            { checksum: artifact.content_sha256, publishedAt: artifact.published_at }
          );
        }
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'action must be "build" or "publish"' });
    return;
  }

  if (method === 'GET') {
    const client = supabaseServiceClient();
    const marketId = req.query.market as string | undefined;
    const buildId = req.query.id as string | undefined;

    if (buildId) {
      const { data } = await client.from('config_builds').select('*, config_artifacts(*)').eq('id', buildId).single();
      if (!data) { res.status(404).json({ error: 'not found' }); return; }
      res.status(200).json(data);
      return;
    }

    if (marketId) {
      const { data } = await client.from('config_builds').select('*').eq('market_id', marketId).order('created_at', { ascending: false }).limit(20);
      res.status(200).json(data ?? []);
      return;
    }

    res.status(400).json({ error: 'Provide id or market query param' });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'method_not_allowed' });
}
