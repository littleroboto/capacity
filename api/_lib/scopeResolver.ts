/**
 * Resolves Clerk identity into internal user access scopes.
 *
 * Flow:
 * 1. Clerk JWT arrives with `sub` (user ID) and optional claims
 * 2. Look up user_access_scopes rows for that clerk_user_id
 * 3. Merge into a single ResolvedUserScope
 * 4. Return for use in RLS session variables and service-layer authorization
 */
import type { OperatingModelId, ResolvedUserScope } from './domainTypes';
import { supabaseServiceClient } from './supabaseClient';

/**
 * Resolve a Clerk user ID into their effective data scope.
 * Uses service_role to bypass RLS (this IS the trust boundary).
 */
export async function resolveUserScope(
  clerkUserId: string,
  email?: string
): Promise<ResolvedUserScope> {
  const client = supabaseServiceClient();

  const { data: scopes, error } = await client
    .from('user_access_scopes')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .eq('is_active', true);

  if (error) {
    console.error('[scopeResolver] Failed to fetch user scopes:', error);
    return emptyScope(clerkUserId, email);
  }

  if (!scopes || scopes.length === 0) {
    /** Dev / multi-instance Clerk: `sub` differs between test and live for the same person; DB row may use the other id. */
    const em = email?.trim();
    if (em) {
      const candidates = em === em.toLowerCase() ? [em] : [em.toLowerCase(), em];
      for (const cand of candidates) {
        const { data, error } = await client
          .from('user_access_scopes')
          .select('*')
          .eq('is_active', true)
          .eq('email', cand);
        if (error) {
          console.error('[scopeResolver] email fallback query failed:', error);
          break;
        }
        if (data && data.length > 0) {
          return mergeScopes(clerkUserId, email, data as unknown[]);
        }
      }
    }
    return emptyScope(clerkUserId, email);
  }

  return mergeScopes(clerkUserId, email, scopes as unknown[]);
}

/** Supabase/PostgREST returns snake_case columns; tests may use camelCase. */
function scopeRowIds(row: unknown): {
  operatingModelId?: OperatingModelId;
  segmentId?: string;
  marketId?: string;
  role?: string;
} {
  const s = row as Record<string, unknown>;
  const om =
    (s.operating_model_id as string | undefined) ??
    (s.operatingModelId as string | undefined);
  const seg = (s.segment_id as string | undefined) ?? (s.segmentId as string | undefined);
  const mkt = (s.market_id as string | undefined) ?? (s.marketId as string | undefined);
  const role = (s.role as string | undefined) ?? undefined;
  return {
    operatingModelId: om as OperatingModelId | undefined,
    segmentId: seg,
    marketId: mkt,
    role,
  };
}

function emptyScope(userId: string, email?: string): ResolvedUserScope {
  return {
    userId,
    email,
    isAdmin: false,
    operatingModelIds: [],
    segmentIds: [],
    marketIds: [],
    canEdit: false,
  };
}

function mergeScopes(
  userId: string,
  email: string | undefined,
  scopes: unknown[]
): ResolvedUserScope {
  const isAdmin = scopes.some((row) => scopeRowIds(row).role === 'admin');

  if (isAdmin) {
    return {
      userId,
      email,
      isAdmin: true,
      operatingModelIds: ['operated_markets', 'licensed_markets'],
      segmentIds: [],
      marketIds: [],
      canEdit: true,
    };
  }

  const opModelIds = new Set<OperatingModelId>();
  const segmentIds = new Set<string>();
  const marketIds = new Set<string>();
  let canEdit = false;

  for (const row of scopes) {
    const { operatingModelId, segmentId, marketId, role } = scopeRowIds(row);
    if (operatingModelId) {
      opModelIds.add(operatingModelId);
    }
    if (segmentId) {
      segmentIds.add(segmentId);
    }
    if (marketId) {
      marketIds.add(marketId);
    }
    if (role === 'segment_editor' || role === 'market_editor') {
      canEdit = true;
    }
  }

  return {
    userId,
    email,
    isAdmin: false,
    operatingModelIds: [...opModelIds],
    segmentIds: [...segmentIds],
    marketIds: [...marketIds],
    canEdit,
  };
}

/**
 * Check if a resolved scope allows access to a specific market.
 */
export function scopeAllowsMarket(
  scope: ResolvedUserScope,
  marketId: string,
  segmentId: string,
  operatingModelId: OperatingModelId
): boolean {
  if (scope.isAdmin) return true;

  if (scope.marketIds.includes(marketId)) return true;

  if (scope.segmentIds.includes(segmentId)) return true;

  if (scope.operatingModelIds.includes(operatingModelId) &&
      scope.segmentIds.length === 0 && scope.marketIds.length === 0) {
    return true;
  }

  return false;
}

/**
 * Check if a resolved scope allows editing a specific market.
 */
export function scopeAllowsMarketEdit(
  scope: ResolvedUserScope,
  marketId: string,
  segmentId: string,
  operatingModelId: OperatingModelId
): boolean {
  if (!scope.canEdit) return false;
  return scopeAllowsMarket(scope, marketId, segmentId, operatingModelId);
}
