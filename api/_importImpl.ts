import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateScope } from './lib/authScope';
import { scopeAllowsMarketEdit } from './lib/scopeResolver';
import { supabaseServiceClient } from './lib/supabaseClient';
import type { OperatingModelId } from './lib/domainTypes';

function bearerFromHeader(h: string | string[] | undefined): string | undefined {
  if (!h) return undefined;
  const v = Array.isArray(h) ? h[0] : h;
  return /^Bearer\s+(.+)$/i.exec(v?.trim() ?? '')?.[1]?.trim();
}

/**
 * POST /api/import?market=UK&mode=preview|apply
 *
 * Body: { yaml: "<raw YAML string>" }
 *
 * mode=preview: parses YAML, shows what fragments would be created/updated (dry run)
 * mode=apply:   decomposes YAML into fragments, creates/updates them
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const bearer = bearerFromHeader(req.headers.authorization);
  if (!bearer) { res.status(401).json({ error: 'unauthorized' }); return; }

  const auth = await authenticateScope(bearer, res);
  if (!auth.ok) return;
  const { scope } = auth;

  if (!scope.canEdit) {
    res.status(403).json({ error: 'forbidden', message: 'Read-only access' });
    return;
  }

  const marketId = String(req.query.market || '').trim();
  const mode = String(req.query.mode || 'preview').trim();

  if (!marketId) {
    res.status(400).json({ error: 'market query parameter required' });
    return;
  }

  // Resolve market metadata
  const client = supabaseServiceClient();
  const { data: mkt } = await client
    .from('markets')
    .select('id, segment_id, operating_model_id')
    .eq('id', marketId)
    .single();

  if (!mkt) {
    res.status(404).json({ error: 'market_not_found' });
    return;
  }

  if (!scopeAllowsMarketEdit(scope, mkt.id, mkt.segment_id, mkt.operating_model_id as OperatingModelId)) {
    res.status(403).json({ error: 'forbidden', message: 'No edit access to this market' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const yamlString = typeof body?.yaml === 'string' ? body.yaml : '';
  if (!yamlString) {
    res.status(400).json({ error: 'yaml field required in request body' });
    return;
  }

  // Dynamic import js-yaml (bundled via esbuild)
  let yaml: typeof import('js-yaml');
  try {
    yaml = await import('js-yaml');
  } catch {
    res.status(500).json({ error: 'yaml_parser_unavailable' });
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = yaml.load(yamlString) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      res.status(400).json({ error: 'invalid_yaml', message: 'YAML must parse to an object' });
      return;
    }
  } catch (e) {
    res.status(400).json({ error: 'yaml_parse_error', message: e instanceof Error ? e.message : String(e) });
    return;
  }

  // Summarize what sections are present
  const sections = summarizeSections(parsed);

  if (mode === 'preview') {
    res.status(200).json({ mode: 'preview', marketId, sections });
    return;
  }

  // mode === 'apply'
  const { importMarketYamlObject } = await import('./services/yamlImportService');
  const result = await importMarketYamlObject(
    { ...parsed, market: marketId },
    mkt.operating_model_id as OperatingModelId,
    mkt.segment_id,
    scope.userId,
    scope.email,
  );

  res.status(200).json({
    mode: 'apply',
    marketId,
    fragmentsCreated: result.fragmentsCreated,
    warnings: result.warnings,
    errors: result.errors,
  });
}

function summarizeSections(obj: Record<string, unknown>): { section: string; action: string; count: number }[] {
  const sections: { section: string; action: string; count: number }[] = [];

  if (obj.resources) sections.push({ section: 'resources', action: 'upsert', count: 1 });
  if (obj.bau) sections.push({ section: 'bau', action: 'upsert', count: 1 });
  if (obj.trading) sections.push({ section: 'trading', action: 'upsert', count: 1 });
  if (Array.isArray(obj.campaigns)) sections.push({ section: 'campaigns', action: 'create', count: obj.campaigns.length });
  if (Array.isArray(obj.tech_programmes)) sections.push({ section: 'tech_programmes', action: 'create', count: obj.tech_programmes.length });
  if (Array.isArray(obj.national_leave_bands)) sections.push({ section: 'national_leave_bands', action: 'create', count: obj.national_leave_bands.length });
  if (obj.public_holidays) sections.push({ section: 'public_holidays', action: 'upsert', count: 1 });
  if (obj.school_holidays) sections.push({ section: 'school_holidays', action: 'upsert', count: 1 });
  if (obj.deployment_risk_events || obj.deployment_risk_blackouts) sections.push({ section: 'deployment_risk', action: 'upsert', count: 1 });
  if (Array.isArray(obj.operating_windows)) sections.push({ section: 'operating_windows', action: 'create', count: obj.operating_windows.length });

  return sections;
}
