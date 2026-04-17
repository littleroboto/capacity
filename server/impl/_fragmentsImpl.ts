import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateScope } from '../lib/authScope';
import { scopeAllowsMarket, scopeAllowsMarketEdit } from '../lib/scopeResolver';
import { getFragment, listFragments, createFragment, updateFragment, archiveFragment } from '../services/fragmentService';
import type { FragmentType, OperatingModelId } from '../lib/domainTypes';
import { supabaseServiceClient } from '../lib/supabaseClient';

const ALLOWED_TABLES: Set<string> = new Set([
  'resource_configs', 'bau_configs', 'campaign_configs',
  'tech_programme_configs', 'holiday_calendars',
  'national_leave_band_configs', 'trading_configs',
  'deployment_risk_configs', 'operating_window_configs',
  'market_configs',
]);

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

async function lookupMarketMeta(marketId: string) {
  const client = supabaseServiceClient();
  const { data } = await client.from('markets').select('segment_id, operating_model_id').eq('id', marketId).single();
  return data as { segment_id: string; operating_model_id: string } | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;

  const table = (req.query.table as string) || '';
  if (!ALLOWED_TABLES.has(table)) {
    res.status(400).json({ error: `Invalid table: ${table}. Allowed: ${[...ALLOWED_TABLES].join(', ')}` });
    return;
  }

  const method = req.method?.toUpperCase();

  if (method === 'GET') {
    const id = req.query.id as string | undefined;
    const marketId = req.query.market as string | undefined;

    if (id) {
      const frag = await getFragment(table as FragmentType, id);
      if (!frag) { res.status(404).json({ error: 'not found' }); return; }
      const fragRow = frag as unknown as Record<string, string>;
      const mkt = await lookupMarketMeta(fragRow.market_id);
      if (mkt && !scopeAllowsMarket(auth.scope, fragRow.market_id, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      res.status(200).json(frag);
      return;
    }

    if (marketId) {
      const mkt = await lookupMarketMeta(marketId);
      if (mkt && !scopeAllowsMarket(auth.scope, marketId, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      const status = req.query.status as string | undefined;
      const data = await listFragments(table as FragmentType, marketId, status);
      res.status(200).json(data);
      return;
    }

    res.status(400).json({ error: 'Provide id or market query param' });
    return;
  }

  if (method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const marketId = body?.market_id;
    if (!marketId) { res.status(400).json({ error: 'market_id required in body' }); return; }
    const mkt = await lookupMarketMeta(marketId);
    if (!mkt) { res.status(404).json({ error: 'market not found' }); return; }
    if (!scopeAllowsMarketEdit(auth.scope, marketId, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const result = await createFragment(table as FragmentType, body, auth.scope.userId, auth.email);
    if (!result.ok) {
      const status = result.errorCode === 'conflict' ? 409 : result.errorCode === 'validation' ? 422 : 500;
      res.status(status).json({ error: result.error, code: result.errorCode });
      return;
    }
    res.status(201).json(result.data);
    return;
  }

  if (method === 'PUT') {
    const id = req.query.id as string;
    if (!id) { res.status(400).json({ error: 'id query param required' }); return; }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const expectedVersion = body?.expectedVersion ?? body?.expected_version;
    if (expectedVersion == null) { res.status(400).json({ error: 'expectedVersion required in body' }); return; }

    const existing = await getFragment(table as FragmentType, id);
    if (!existing) { res.status(404).json({ error: 'not found' }); return; }
    const existingRow = existing as unknown as Record<string, string>;
    const mkt = await lookupMarketMeta(existingRow.market_id);
    if (mkt && !scopeAllowsMarketEdit(auth.scope, existingRow.market_id, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const result = await updateFragment(table as FragmentType, id, body, Number(expectedVersion), auth.scope.userId, auth.email);
    if (!result.ok) {
      const status = result.errorCode === 'conflict' ? 409 : result.errorCode === 'not_found' ? 404 : 500;
      res.status(status).json({ error: result.error, code: result.errorCode });
      return;
    }
    res.status(200).json(result.data);
    return;
  }

  if (method === 'DELETE') {
    const id = req.query.id as string;
    const expectedVersion = Number(req.query.expectedVersion ?? req.query.expected_version);
    if (!id) { res.status(400).json({ error: 'id query param required' }); return; }
    if (!expectedVersion) { res.status(400).json({ error: 'expectedVersion query param required' }); return; }

    const existing = await getFragment(table as FragmentType, id);
    if (!existing) { res.status(404).json({ error: 'not found' }); return; }
    const existingRow = existing as unknown as Record<string, string>;
    const mkt = await lookupMarketMeta(existingRow.market_id);
    if (mkt && !scopeAllowsMarketEdit(auth.scope, existingRow.market_id, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const result = await archiveFragment(table as FragmentType, id, expectedVersion, auth.scope.userId, auth.email);
    if (!result.ok) {
      const status = result.errorCode === 'conflict' ? 409 : 500;
      res.status(status).json({ error: result.error, code: result.errorCode });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader('Allow', 'GET, POST, PUT, DELETE');
  res.status(405).json({ error: 'method_not_allowed' });
}
