/**
 * Server-side Supabase client initialisation.
 * Uses service_role for trusted server operations (bypasses RLS).
 * For scoped queries, set session variables before querying.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from './env';
import type { ResolvedUserScope } from './domainTypes';

let _serviceClient: SupabaseClient | null = null;

/** Service-role client — bypasses RLS. Use for admin operations and build pipeline. */
export function supabaseServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  const env = serverEnv();
  _serviceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

/**
 * Execute a callback with RLS session variables set for a specific user scope.
 * This sets app.user_role, app.operating_model_id, app.segment_id, app.market_id
 * as Postgres session variables that RLS policies reference.
 */
export async function withUserScope<T>(
  scope: ResolvedUserScope,
  fn: (client: SupabaseClient) => Promise<T>
): Promise<T> {
  const client = supabaseServiceClient();

  const role = scope.isAdmin ? 'admin' : 
    scope.segmentIds.length > 0 && scope.marketIds.length === 0 ? 'segment_editor' :
    scope.marketIds.length > 0 ? 'market_editor' : 'viewer';

  await client.rpc('set_config', { setting: 'app.user_role', value: role });

  if (scope.operatingModelIds.length === 1) {
    await client.rpc('set_config', {
      setting: 'app.operating_model_id',
      value: scope.operatingModelIds[0],
    });
  }

  if (scope.segmentIds.length === 1) {
    await client.rpc('set_config', {
      setting: 'app.segment_id',
      value: scope.segmentIds[0],
    });
  }

  if (scope.marketIds.length === 1) {
    await client.rpc('set_config', {
      setting: 'app.market_id',
      value: scope.marketIds[0],
    });
  }

  return fn(client);
}
