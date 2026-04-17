/**
 * Fragment CRUD service with revision tracking and optimistic concurrency.
 *
 * All fragment writes:
 * 1. Validate the fragment
 * 2. Check optimistic concurrency (version_number)
 * 3. Create revision snapshot
 * 4. Update the fragment row
 * 5. Log audit event
 */
import { supabaseServiceClient } from '../_lib/supabaseClient';
import type { FragmentType, FragmentMeta, AuditEventType } from '../_lib/domainTypes';

export interface FragmentWriteResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  errorCode?: 'conflict' | 'not_found' | 'validation' | 'forbidden' | 'internal';
}

/**
 * Get a single fragment by ID from any fragment table.
 */
export async function getFragment<T extends FragmentMeta>(
  table: FragmentType,
  id: string
): Promise<T | null> {
  const client = supabaseServiceClient();
  const selectCols = table === 'holiday_calendars' ? '*, holiday_entries(*)' : '*';
  const { data, error } = await client.from(table).select(selectCols).eq('id', id).single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch ${table}/${id}: ${error.message}`);
  }

  return data as unknown as T;
}

/**
 * List fragments for a market, optionally filtered by status.
 */
export async function listFragments<T extends FragmentMeta>(
  table: FragmentType,
  marketId: string,
  status?: string
): Promise<T[]> {
  const client = supabaseServiceClient();

  if (table === 'holiday_calendars') {
    let query = client
      .from('holiday_calendars')
      .select('*, holiday_entries(*)')
      .eq('market_id', marketId);
    if (status) {
      query = query.eq('status', status);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Failed to list ${table} for ${marketId}: ${error.message}`);
    }
    return (data ?? []) as unknown as T[];
  }

  let query = client.from(table).select('*').eq('market_id', marketId);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list ${table} for ${marketId}: ${error.message}`);
  }

  return (data ?? []) as unknown as T[];
}

/**
 * List active fragments for a market (status = 'active').
 */
export async function listActiveFragments<T extends FragmentMeta>(
  table: FragmentType,
  marketId: string
): Promise<T[]> {
  return listFragments<T>(table, marketId, 'active');
}

/**
 * Create a new fragment with version 1.
 */
export async function createFragment<T extends FragmentMeta>(
  table: FragmentType,
  data: Omit<T, 'id' | 'versionNumber' | 'createdAt' | 'updatedAt'>,
  actorId: string,
  actorEmail?: string
): Promise<FragmentWriteResult<T>> {
  const client = supabaseServiceClient();

  const row = {
    ...data,
    version_number: 1,
    created_by: actorId,
    updated_by: actorId,
  };

  const { data: inserted, error } = await client
    .from(table)
    .insert(row)
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message, errorCode: 'internal' };
  }

  const fragment = inserted as unknown as T;

  await createRevision(table, fragment.id, 1, fragment as unknown as Record<string, unknown>, actorId);
  await logAudit('fragment_created', actorId, actorEmail, fragment as unknown as Record<string, unknown>, table);

  return { ok: true, data: fragment };
}

/**
 * Update a fragment with optimistic concurrency control.
 * Rejects if the provided expectedVersion doesn't match the current version_number.
 */
export async function updateFragment<T extends FragmentMeta>(
  table: FragmentType,
  id: string,
  updates: Partial<T>,
  expectedVersion: number,
  actorId: string,
  actorEmail?: string
): Promise<FragmentWriteResult<T>> {
  const client = supabaseServiceClient();

  const current = await getFragment<T>(table, id);
  if (!current) {
    return { ok: false, error: 'Fragment not found', errorCode: 'not_found' };
  }

  const curRow = current as unknown as Record<string, unknown>;
  const currentVersion = rowVersionNumber(curRow);
  if (!Number.isFinite(currentVersion)) {
    return { ok: false, error: 'Fragment row has no valid version_number', errorCode: 'internal' };
  }

  if (currentVersion !== expectedVersion) {
    return {
      ok: false,
      error: `Version conflict: expected ${expectedVersion}, current is ${currentVersion}. Reload and retry.`,
      errorCode: 'conflict',
    };
  }

  const patch = { ...(updates as Record<string, unknown>) };
  delete patch.expectedVersion;
  delete patch.expected_version;
  delete patch.holiday_entries;

  const newVersion = expectedVersion + 1;
  const { data: updated, error } = await client
    .from(table)
    .update({
      ...patch,
      version_number: newVersion,
      updated_by: actorId,
    })
    .eq('id', id)
    .eq('version_number', expectedVersion)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return {
        ok: false,
        error: 'Concurrent edit detected. Reload and retry.',
        errorCode: 'conflict',
      };
    }
    return { ok: false, error: error.message, errorCode: 'internal' };
  }

  const fragment = updated as unknown as T;

  await createRevision(table, id, newVersion, fragment as unknown as Record<string, unknown>, actorId);
  await logAudit('fragment_updated', actorId, actorEmail, fragment as unknown as Record<string, unknown>, table);

  return { ok: true, data: fragment };
}

/**
 * Archive a fragment (soft delete).
 */
export async function archiveFragment<T extends FragmentMeta>(
  table: FragmentType,
  id: string,
  expectedVersion: number,
  actorId: string,
  actorEmail?: string
): Promise<FragmentWriteResult<T>> {
  return updateFragment<T>(
    table,
    id,
    { status: 'archived' } as Partial<T>,
    expectedVersion,
    actorId,
    actorEmail
  );
}

/**
 * Get revision history for a fragment.
 */
export async function getRevisionHistory(
  fragmentType: FragmentType,
  fragmentId: string,
  limit = 50
): Promise<Array<{ id: number; versionNumber: number; createdAt: string; createdBy?: string; changeSummary?: string }>> {
  const client = supabaseServiceClient();
  const { data, error } = await client
    .from('config_revisions')
    .select('id, version_number, created_at, created_by, change_summary')
    .eq('fragment_type', fragmentType)
    .eq('fragment_id', fragmentId)
    .order('version_number', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch revisions: ${error.message}`);
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as number,
    versionNumber: r.version_number as number,
    createdAt: r.created_at as string,
    createdBy: r.created_by as string | undefined,
    changeSummary: r.change_summary as string | undefined,
  }));
}

/**
 * Get a specific revision snapshot.
 */
export async function getRevisionSnapshot(
  revisionId: number
): Promise<Record<string, unknown> | null> {
  const client = supabaseServiceClient();
  const { data, error } = await client
    .from('config_revisions')
    .select('snapshot')
    .eq('id', revisionId)
    .single();

  if (error) return null;
  return (data as { snapshot: Record<string, unknown> }).snapshot;
}

// ============================================================================
// Internal helpers
// ============================================================================

function rowVersionNumber(row: Record<string, unknown>): number {
  const raw = row.versionNumber ?? row.version_number;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

async function createRevision(
  fragmentType: FragmentType,
  fragmentId: string,
  versionNumber: number,
  snapshot: Record<string, unknown>,
  actorId: string
): Promise<void> {
  const client = supabaseServiceClient();

  const opModelId = (snapshot as Record<string, string>).operating_model_id ?? '';
  const segId = (snapshot as Record<string, string>).segment_id ?? '';
  const mktId = (snapshot as Record<string, string>).market_id ?? null;

  await client.from('config_revisions').insert({
    fragment_type: fragmentType,
    fragment_id: fragmentId,
    version_number: versionNumber,
    operating_model_id: opModelId,
    segment_id: segId,
    market_id: mktId,
    snapshot,
    created_by: actorId,
  });
}

async function logAudit(
  eventType: AuditEventType,
  actorId: string,
  actorEmail: string | undefined,
  fragment: Record<string, unknown>,
  targetType: string
): Promise<void> {
  const client = supabaseServiceClient();

  await client.from('audit_events').insert({
    event_type: eventType,
    actor_id: actorId,
    actor_email: actorEmail,
    operating_model_id: fragment.operating_model_id,
    segment_id: fragment.segment_id,
    market_id: fragment.market_id,
    target_type: targetType,
    target_id: fragment.id,
    details: {
      version_number: fragment.version_number,
      status: fragment.status,
    },
  });
}
