/**
 * DB-owned per-market YAML from `public.market_documents` merged into the
 * shared multi-doc bundle (see docs/SUPABASE_REDIS_WORKSPACE.md).
 *
 * Read path only; gated by CAPACITY_WORKSPACE_DOCUMENTS_READ (default off).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Active Clerk organization id (`org_…`) for the signed-in session.
 *
 * Claim sources (first non-empty string wins). Clerk session JWT shape depends
 * on the "Customize session token" template and SDK version; we stay defensive:
 * - `org_id` — common default when an organization is active (Clerk session template)
 * - `organization_id` — alias seen in examples / custom templates
 * - `o.id` — nested org shorthand object (same family as `o.rol` for org role in this codebase)
 * - `org.id` / `organization.id` — nested objects if the template emits structured org claims
 */
export function extractClerkOrganizationIdFromJwtPayload(
  payload: Record<string, unknown>
): string | null {
  const asOrgId = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!t.startsWith('org_')) return null;
    return t;
  };

  const top = asOrgId(payload.org_id) ?? asOrgId(payload.organization_id);
  if (top) return top;

  const o = payload.o;
  if (o && typeof o === 'object' && o !== null && !Array.isArray(o)) {
    const id = asOrgId((o as Record<string, unknown>).id);
    if (id) return id;
  }

  const org = payload.org;
  if (org && typeof org === 'object' && org !== null && !Array.isArray(org)) {
    const id = asOrgId((org as Record<string, unknown>).id);
    if (id) return id;
  }

  const organization = payload.organization;
  if (
    organization &&
    typeof organization === 'object' &&
    organization !== null &&
    !Array.isArray(organization)
  ) {
    const id = asOrgId((organization as Record<string, unknown>).id);
    if (id) return id;
  }

  return null;
}

export function isWorkspaceDocumentsReadEnabled(): boolean {
  const v = process.env.CAPACITY_WORKSPACE_DOCUMENTS_READ?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Stable manifest order: `manifestMarketOrder` first, then any extras sorted. */
export function orderMarketIdsForWorkspaceBundle(
  marketIds: readonly string[],
  manifestMarketOrder: readonly string[]
): string[] {
  const set = new Set(marketIds);
  const manifestSet = new Set(manifestMarketOrder);
  const ordered = manifestMarketOrder.filter((id) => set.has(id));
  const extras = [...set].filter((id) => !manifestSet.has(id)).sort();
  return [...ordered, ...extras];
}

export async function lookupWorkspaceIdByClerkOrg(
  client: SupabaseClient,
  clerkOrganizationId: string
): Promise<string | null> {
  const { data, error } = await client
    .from('workspaces')
    .select('id')
    .eq('clerk_organization_id', clerkOrganizationId)
    .maybeSingle();

  if (error) throw error;
  const row = data as { id?: string } | null;
  return typeof row?.id === 'string' ? row.id : null;
}

export async function fetchMarketDocumentsYamlByMarket(
  client: SupabaseClient,
  workspaceId: string,
  marketIds: readonly string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (marketIds.length === 0) return map;

  const { data, error } = await client
    .from('market_documents')
    .select('market_id, yaml_body, version')
    .eq('workspace_id', workspaceId)
    .in('market_id', [...marketIds]);

  if (error) throw error;
  for (const row of data ?? []) {
    const r = row as { market_id?: string; yaml_body?: string };
    if (typeof r.market_id === 'string' && typeof r.yaml_body === 'string') {
      map.set(r.market_id, r.yaml_body);
    }
  }
  return map;
}

/**
 * Per market: use non-empty trimmed `yaml_body` from `documentsByMarket` when present;
 * otherwise `getActiveArtifact(marketId)`.
 */
export async function mergePerMarketYamlWithArtifactFallback(
  orderedMarketIds: readonly string[],
  documentsByMarket: ReadonlyMap<string, string>,
  getActiveArtifact: (marketId: string) => Promise<string | null>
): Promise<string> {
  const parts: string[] = [];
  for (const marketId of orderedMarketIds) {
    const fromDoc = documentsByMarket.get(marketId);
    let yaml: string | null = null;
    if (fromDoc != null && fromDoc.trim()) {
      yaml = fromDoc;
    } else {
      yaml = await getActiveArtifact(marketId);
    }
    if (yaml?.trim()) parts.push(yaml.trim());
  }
  return parts.join('\n---\n\n');
}
