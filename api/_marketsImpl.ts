import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateScope } from './lib/authScope';
import { scopeAllowsMarket } from './lib/scopeResolver';
import { supabaseServiceClient } from './lib/supabaseClient';
import type { OperatingModelId } from './lib/domainTypes';
import { vercelRequestId } from './lib/vercelRequestId';

/** Strip PostgREST row to plain JSON (no spread of `*`, which can include non-JSON types). */
function toMarketListDto(
  m: Record<string, unknown>,
  latestBuild: { status?: unknown; created_at?: unknown } | null,
  validationErrors: number
): Record<string, unknown> {
  const rawSeg = m.segments;
  let segments: { label: string } | undefined;
  if (rawSeg && typeof rawSeg === 'object' && !Array.isArray(rawSeg) && 'label' in rawSeg) {
    const lab = (rawSeg as { label: unknown }).label;
    if (typeof lab === 'string') segments = { label: lab };
  } else if (Array.isArray(rawSeg) && rawSeg[0] && typeof rawSeg[0] === 'object' && rawSeg[0] !== null) {
    const lab = (rawSeg[0] as { label?: unknown }).label;
    if (typeof lab === 'string') segments = { label: lab };
  }

  return {
    id: String(m.id ?? ''),
    label: String(m.label ?? ''),
    segment_id: String(m.segment_id ?? ''),
    country_code: String(m.country_code ?? ''),
    operating_model_id: m.operating_model_id != null ? String(m.operating_model_id) : null,
    display_order: Number(m.display_order ?? 0) || 0,
    is_active: Boolean(m.is_active),
    ...(segments ? { segments } : {}),
    latestBuildStatus: latestBuild?.status != null ? String(latestBuild.status) : null,
    latestBuildDate: latestBuild?.created_at != null ? String(latestBuild.created_at) : null,
    validationErrors,
  };
}

function bearerFromHeader(h: string | string[] | undefined): string | undefined {
  if (!h) return undefined;
  const v = Array.isArray(h) ? h[0] : h;
  return /^Bearer\s+(.+)$/i.exec(v?.trim() ?? '')?.[1]?.trim();
}

function sendJsonIfOpen(
  res: VercelResponse,
  status: number,
  body: Record<string, unknown>
): void {
  if (res.headersSent) return;
  res.status(status).json(body);
}

async function enrichOneMarket(
  client: ReturnType<typeof supabaseServiceClient>,
  m: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const mid = String(m.id ?? '');
  const { data: latestBuild, error: buildErr } = await client
    .from('config_builds')
    .select('status, created_at')
    .eq('market_id', mid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (buildErr) {
    console.error('[markets] config_builds for', mid, buildErr);
  }

  const { count: issueCount, error: valErr } = await client
    .from('validation_results')
    .select('*', { count: 'exact', head: true })
    .eq('target_id', mid)
    .eq('severity', 'error');

  if (valErr) {
    console.error('[markets] validation_results for', mid, valErr);
  }

  return toMarketListDto(m, latestBuild ?? null, Math.max(0, Number(issueCount ?? 0)));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const bearer = bearerFromHeader(req.headers.authorization);
  if (!bearer) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const requestId = vercelRequestId(req);
  const rid: Record<string, string> | undefined = requestId ? { requestId } : undefined;

  const auth = await authenticateScope(bearer, res, rid);
  if (!auth.ok) return;
  const { scope, clerkSub, email: jwtEmail } = auth;

  let step = 'init';
  try {
    step = 'supabase_client';
    const client = supabaseServiceClient();

    step = 'markets_query';
    const { data: rawMarkets, error: marketsError } = await client
      .from('markets')
      .select('*, segments(label)')
      .eq('is_active', true)
      .order('display_order');

    if (marketsError) {
      console.error(
        JSON.stringify({
          tag: 'markets',
          step: 'markets_query',
          ...rid,
          message: marketsError.message,
          code: marketsError.code,
        })
      );
      sendJsonIfOpen(res, 502, {
        error: 'database_error',
        step: 'markets_query',
        detail: marketsError.message,
        ...rid,
      });
      return;
    }

    step = 'normalize_rows';
    const markets: Record<string, unknown>[] = Array.isArray(rawMarkets)
      ? (rawMarkets as Record<string, unknown>[])
      : rawMarkets && typeof rawMarkets === 'object'
        ? [rawMarkets as Record<string, unknown>]
        : [];

    if (markets.length === 0) {
      res.status(200).json([]);
      return;
    }

    step = 'filter';
    const filtered = scope.isAdmin
      ? markets
      : markets.filter((row) =>
          scopeAllowsMarket(
            scope,
            String(row.id ?? ''),
            String(row.segment_id ?? ''),
            String(row.operating_model_id ?? '') as OperatingModelId
          )
        );

    if (filtered.length === 0 && markets.length > 0) {
      sendJsonIfOpen(res, 403, {
        error: 'no_market_scope',
        clerk_sub: clerkSub,
        jwt_email: jwtEmail ?? null,
        detail:
          'Signed in, but this Clerk user has no Postgres scope that allows any market. Ensure `user_access_scopes.clerk_user_id` matches `clerk_sub`, or the row email matches `jwt_email` (add email to the Clerk session JWT template if `jwt_email` is null). Confirm `SUPABASE_URL` in this environment is the same project where scopes were inserted.',
        ...rid,
      });
      return;
    }

    step = 'enrich';
    const enriched: Record<string, unknown>[] = [];
    for (const m of filtered) {
      try {
        enriched.push(await enrichOneMarket(client, m));
      } catch (inner) {
        const im = inner instanceof Error ? inner.message : String(inner);
        throw new Error(`enrich market ${String(m.id ?? '?')}: ${im}`);
      }
    }

    step = 'respond';
    let payload: string;
    try {
      payload = JSON.stringify(enriched, (_k, v) =>
        typeof v === 'bigint' ? v.toString() : v
      );
    } catch (stringifyErr) {
      const sm = stringifyErr instanceof Error ? stringifyErr.message : String(stringifyErr);
      sendJsonIfOpen(res, 500, {
        error: 'server_error',
        step: 'respond',
        detail: `json_stringify: ${sm}`,
        ...rid,
      });
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ tag: 'markets', step, ...rid, message: msg }), e);
    sendJsonIfOpen(res, 500, {
      error: 'server_error',
      step,
      detail: msg,
      ...rid,
    });
  }
}
