/**
 * Upstash Redis cache service for read-optimised access to assembled config.
 *
 * Rules:
 * - Cache outputs, not truth
 * - Scope-aware keys — no cross-scope leakage
 * - Explicit invalidation on publish/rebuild
 * - TTL as safety net, not primary mechanism
 * - Server-side only — browser never hits Redis
 */
import { serverEnv } from '../_lib/env';

const DEFAULT_TTL_SECONDS = 3600; // 1 hour safety TTL

// ============================================================================
// Cache Key Patterns
// ============================================================================

export const CacheKeys = {
  activeArtifact: (marketId: string) =>
    `config:mkt:${marketId}:active`,

  buildArtifact: (buildId: string) =>
    `config:build:${buildId}:artifact`,

  buildMeta: (buildId: string) =>
    `config:build:${buildId}:meta`,

  marketSummary: (operatingModelId: string, marketId: string) =>
    `readmodel:om:${operatingModelId}:mkt:${marketId}:summary`,

  segmentActive: (operatingModelId: string, segmentId: string) =>
    `config:om:${operatingModelId}:seg:${segmentId}:active`,

  operatingModelActive: (operatingModelId: string) =>
    `config:om:${operatingModelId}:active`,
} as const;

// ============================================================================
// Redis REST Client (Upstash HTTP API)
// ============================================================================

async function redisCommand(
  command: string,
  ...args: (string | number)[]
): Promise<unknown> {
  const env = serverEnv();
  if (!env.upstashRedisRestUrl || !env.upstashRedisRestToken) {
    return null;
  }

  const url = `${env.upstashRedisRestUrl}`;
  const body = [command, ...args];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.upstashRedisRestToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[cache] Redis ${command} failed: ${response.status} ${text}`);
    return null;
  }

  const result = (await response.json()) as { result: unknown };
  return result.result;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Get a cached value by key.
 */
export async function cacheGet(key: string): Promise<string | null> {
  const result = await redisCommand('GET', key);
  return typeof result === 'string' ? result : null;
}

/**
 * Set a cached value with TTL.
 */
export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  await redisCommand('SET', key, value, 'EX', ttlSeconds);
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key: string): Promise<void> {
  await redisCommand('DEL', key);
}

/**
 * Delete multiple cached keys.
 */
export async function cacheDelMulti(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await redisCommand('DEL', ...keys.map(String) as unknown as (string | number)[]);
}

// ============================================================================
// High-Level Cache Operations
// ============================================================================

/**
 * Cache a published artifact for a market.
 */
export async function cachePublishedArtifact(
  marketId: string,
  _operatingModelId: string,
  _segmentId: string,
  buildId: string,
  yamlContent: string,
  meta: Record<string, unknown>
): Promise<void> {
  await Promise.all([
    cacheSet(CacheKeys.activeArtifact(marketId), yamlContent),
    cacheSet(CacheKeys.buildArtifact(buildId), yamlContent),
    cacheSet(CacheKeys.buildMeta(buildId), JSON.stringify(meta)),
  ]);
}

/**
 * Get the active published YAML for a market.
 * Falls back to Postgres if not in cache.
 */
export async function getActiveArtifact(
  marketId: string
): Promise<string | null> {
  const cached = await cacheGet(CacheKeys.activeArtifact(marketId));
  if (cached) return cached;

  // Cache miss — fall back to Postgres
  const { supabaseServiceClient } = await import('../_lib/supabaseClient');
  const client = supabaseServiceClient();

  const { data: published } = await client
    .from('config_artifacts')
    .select('content')
    .eq('market_id', marketId)
    .eq('artifact_type', 'market_yaml')
    .not('published_at', 'is', null)
    .is('superseded_at', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (published && typeof (published as { content?: string }).content === 'string') {
    const content = (published as { content: string }).content;
    await cacheSet(CacheKeys.activeArtifact(marketId), content);
    return content;
  }

  /** Admin / editor: show latest validated assembly before first publish (no `published_at` yet). */
  const { data: validatedBuild } = await client
    .from('config_builds')
    .select('id')
    .eq('market_id', marketId)
    .eq('status', 'validated')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (validatedBuild?.id) {
    const { data: draftArt } = await client
      .from('config_artifacts')
      .select('content')
      .eq('build_id', validatedBuild.id)
      .eq('artifact_type', 'market_yaml')
      .maybeSingle();
    if (draftArt && typeof (draftArt as { content?: string }).content === 'string') {
      return (draftArt as { content: string }).content;
    }
  }

  return null;
}

/**
 * Invalidate all cache entries for a market.
 * Call this when a market's config is modified or a new build is published.
 */
export async function invalidateMarketCache(
  marketId: string,
  operatingModelId: string,
  segmentId: string
): Promise<void> {
  await cacheDelMulti(
    CacheKeys.activeArtifact(marketId),
    CacheKeys.marketSummary(operatingModelId, marketId),
    CacheKeys.segmentActive(operatingModelId, segmentId),
    CacheKeys.operatingModelActive(operatingModelId)
  );
}

/**
 * Invalidate all cache entries for a segment.
 */
export async function invalidateSegmentCache(
  operatingModelId: string,
  segmentId: string
): Promise<void> {
  await cacheDelMulti(
    CacheKeys.segmentActive(operatingModelId, segmentId),
    CacheKeys.operatingModelActive(operatingModelId)
  );
}

/**
 * Get assembled multi-market YAML bundle for a set of markets.
 * Tries cache first, falls back to Postgres.
 */
export async function getMultiMarketBundle(
  marketIds: string[]
): Promise<string> {
  const parts: string[] = [];

  for (const marketId of marketIds) {
    const yaml = await getActiveArtifact(marketId);
    if (yaml) parts.push(yaml.trim());
  }

  return parts.join('\n---\n\n');
}

/**
 * Check if cache is available (Redis configured and responding).
 */
export async function isCacheAvailable(): Promise<boolean> {
  const env = serverEnv();
  if (!env.upstashRedisRestUrl || !env.upstashRedisRestToken) return false;

  try {
    const result = await redisCommand('PING');
    return result === 'PONG';
  } catch {
    return false;
  }
}
