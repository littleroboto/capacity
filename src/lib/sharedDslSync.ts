import { looksLikeYamlDsl } from '@/lib/dslGuards';
import { mergeStateToFullMultiDoc } from '@/lib/multiDocMarketYaml';
import { setAtcDsl } from '@/lib/storage';
import { useAtcStore } from '@/store/useAtcStore';

const SESSION_BEARER_KEY = 'capacity:shared-dsl-bearer';

/** Build-time flag: fetch/save workspace YAML via `/api/shared-dsl` (Vercel Blob). */
export function isSharedDslEnabled(): boolean {
  const v = import.meta.env.VITE_SHARED_DSL;
  return v === '1' || v === 'true';
}

function apiUrl(): string {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/api/shared-dsl`;
}

export function getSharedDslBearer(): string | null {
  try {
    const t = sessionStorage.getItem(SESSION_BEARER_KEY);
    return t?.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

export function setSharedDslBearer(token: string | null): void {
  try {
    if (token == null || !token.trim()) sessionStorage.removeItem(SESSION_BEARER_KEY);
    else sessionStorage.setItem(SESSION_BEARER_KEY, token.trim());
  } catch {
    /* ignore */
  }
}

let lastKnownEtag: string | null = null;
let lastPushedYaml: string | null = null;

/**
 * Incremented whenever `lastKnownEtag` changes so in-flight stale checks can be discarded.
 * Avoids the banner flashing: an old HEAD request may complete after pull/save and wrongly set stale.
 */
let sharedDslStaleCheckEpoch = 0;

export function getSharedDslStaleCheckEpoch(): number {
  return sharedDslStaleCheckEpoch;
}

/**
 * After this window successfully pushes or pulls, ignore brief "cloud newer" HEAD results (races with our own save).
 * Other browser windows never call {@link notifySharedDslLocalAlignedWithServer}, so they still show the banner.
 */
let remoteStaleMutedUntil = 0;

const LOCAL_ALIGNED_EVENT = 'capacity:shared-dsl-local-aligned';

export function isSharedDslRemoteStaleMuted(): boolean {
  return Date.now() < remoteStaleMutedUntil;
}

/** Call when this tab successfully saved to the blob or pulled the latest (updates etag / baseline). */
export function notifySharedDslLocalAlignedWithServer(): void {
  remoteStaleMutedUntil = Date.now() + 2000;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOCAL_ALIGNED_EVENT));
}

export function onSharedDslLocalAligned(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = fn;
  window.addEventListener(LOCAL_ALIGNED_EVENT, w);
  return () => window.removeEventListener(LOCAL_ALIGNED_EVENT, w);
}

/** While true, outbound auto-save ignores store updates (avoids scheduling PUT during cloud pull). */
let suppressSharedDslOutboundSync = false;

/** Shared debounce timer for {@link initSharedDslOutboundSync} so pulls can cancel a pending PUT. */
let outboundSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function clearOutboundSyncDebounce(): void {
  if (outboundSyncDebounceTimer) {
    clearTimeout(outboundSyncDebounceTimer);
    outboundSyncDebounceTimer = null;
  }
}

/** Compare etags from HEAD vs GET/PUT without tripping on quoting differences. */
function normalizeEtagForCompare(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('W/"') && s.endsWith('"')) return s.slice(3, -1);
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

/** While the merged YAML differs from the last pushed baseline, extend this deadline on each store update. */
let editingGraceUntil = 0;
const EDITING_GRACE_MS = 4500;

export function touchSharedDslEditingGrace(): void {
  editingGraceUntil = Date.now() + EDITING_GRACE_MS;
}

export function isSharedDslEditingGraceActive(): boolean {
  return Date.now() < editingGraceUntil;
}

export function getSharedDslEtag(): string | null {
  return lastKnownEtag;
}

export function setSharedDslEtag(etag: string | null): void {
  const next = etag?.trim() ? etag.trim() : null;
  if (next === lastKnownEtag) return;
  lastKnownEtag = next;
  sharedDslStaleCheckEpoch++;
}

/** Call after hydrating from remote or bundle so we do not immediately re-upload the same YAML. */
export function markSharedDslBaseline(fullYaml: string): void {
  lastPushedYaml = fullYaml.trim() || null;
}

/** True when merged YAML differs from the last successful cloud baseline (push or pull). */
export function isSharedDslLocallyEdited(): boolean {
  const full = mergeStateToFullMultiDoc(useAtcStore.getState()).trim();
  if (!looksLikeYamlDsl(full)) return false;
  if (lastPushedYaml == null) return false;
  return full !== lastPushedYaml.trim();
}

export type SharedDslRemoteVsLocal =
  | { status: 'no_remote' }
  | { status: 'in_sync'; remoteEtag: string }
  | { status: 'cloud_newer'; remoteEtag: string; localEtag: string };

/**
 * HEAD only — etag for stale polling (avoids downloading full YAML on an interval).
 * Falls back to full GET when the API predates HEAD support (405).
 */
export async function fetchSharedDslEtag(): Promise<string | null> {
  if (!isSharedDslEnabled()) return null;
  try {
    let res = await fetch(apiUrl(), { method: 'HEAD', cache: 'no-store' });
    if (res.status === 405) {
      const remote = await fetchSharedDsl();
      if (!remote) return null;
      return remote.etag?.trim() ? remote.etag.trim() : '';
    }
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const etag = res.headers.get('X-DSL-Etag') ?? res.headers.get('x-dsl-etag');
    return etag?.trim() ? etag.trim() : '';
  } catch {
    return null;
  }
}

/**
 * After a successful PUT, align `lastKnownEtag` with what HEAD returns so polling and `ifMatch`
 * stay consistent (JSON etag vs header/head() quirks, or missing etag in the response body).
 */
async function reconcileEtagAfterSuccessfulPut(body: { etag?: string }): Promise<void> {
  let next = typeof body.etag === 'string' && body.etag.trim() ? body.etag.trim() : '';
  try {
    const headRaw = await fetchSharedDslEtag();
    if (headRaw != null && headRaw.trim()) {
      const h = headRaw.trim();
      if (!next || normalizeEtagForCompare(next) !== normalizeEtagForCompare(h)) {
        next = h;
      }
    }
  } catch {
    /* ignore */
  }
  if (next) setSharedDslEtag(next);
}

/** Compare server ETag to our last known post-save ETag (HEAD + headers only; no auth). */
export async function getSharedDslRemoteVsLocal(): Promise<SharedDslRemoteVsLocal> {
  const reRaw = await fetchSharedDslEtag();
  if (reRaw == null) return { status: 'no_remote' };
  const re = reRaw.trim();
  const le = lastKnownEtag?.trim() ?? '';
  const reN = normalizeEtagForCompare(re);
  const leN = normalizeEtagForCompare(le);
  if (!leN) {
    return { status: 'in_sync', remoteEtag: re };
  }
  if (!reN || reN === leN) return { status: 'in_sync', remoteEtag: re };
  return { status: 'cloud_newer', remoteEtag: re, localEtag: le };
}

export type PullTeamWorkspaceResult = 'ok' | 'cancelled' | 'no_remote' | 'failed';

/**
 * Pull latest YAML from the server into the store after optional confirm when local edits or server is ahead.
 */
export async function pullTeamWorkspaceWithUserConfirm(): Promise<PullTeamWorkspaceResult> {
  const vs = await getSharedDslRemoteVsLocal();
  if (vs.status === 'no_remote') return 'no_remote';
  const dirty = isSharedDslLocallyEdited();
  if (dirty || vs.status === 'cloud_newer') {
    const ok = window.confirm(
      'Replace this browser’s workspace with the latest from the team cloud? YAML changes that are not successfully saved to the cloud will be lost.'
    );
    if (!ok) return 'cancelled';
  }
  const pulled = await pullSharedDslToStore();
  return pulled ? 'ok' : 'failed';
}

/** Open the Workspace dialog (handled in {@link DSLPanel}). */
export const OPEN_WORKSPACE_EVENT = 'capacity:open-workspace';

export function requestOpenWorkspaceDialog(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT));
}

export type FetchSharedDslResult = { yaml: string; etag: string };

/** GET current workspace from the server (no auth). Returns null if none or misconfigured. */
export async function fetchSharedDsl(): Promise<FetchSharedDslResult | null> {
  if (!isSharedDslEnabled()) return null;
  try {
    const res = await fetch(apiUrl(), { method: 'GET', cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const yaml = await res.text();
    if (!looksLikeYamlDsl(yaml)) return null;
    const etag = res.headers.get('X-DSL-Etag') ?? res.headers.get('x-dsl-etag');
    if (!etag?.trim()) return { yaml: yaml.trim(), etag: '' };
    return { yaml: yaml.trim(), etag: etag.trim() };
  } catch {
    return null;
  }
}

export type PutSharedDslResult = {
  ok: boolean;
  etag?: string;
  conflict?: boolean;
  /** Set when ok is false (network, 401, 503, etc.). */
  errorMessage?: string;
};

export async function putSharedDsl(yaml: string, ifMatch: string | null): Promise<PutSharedDslResult> {
  const bearer = getSharedDslBearer();
  if (!bearer) return { ok: false, errorMessage: 'No write secret — paste the team secret and click Save secret.' };
  try {
    const res = await fetch(apiUrl(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        yaml,
        ...(ifMatch ? { ifMatch } : {}),
      }),
    });
    if (res.status === 409) return { ok: false, conflict: true, errorMessage: 'Someone else saved first (conflict).' };
    if (!res.ok) {
      let errorMessage = `Save failed (HTTP ${res.status})`;
      try {
        const j = (await res.json()) as { error?: string; message?: string; hint?: string };
        if (typeof j.message === 'string' && j.message.trim()) errorMessage = j.message.trim();
        else if (typeof j.error === 'string' && j.error.trim()) errorMessage = j.error.trim();
        if (typeof j.hint === 'string' && j.hint.trim()) {
          errorMessage = `${errorMessage} — ${j.hint.trim()}`;
        }
      } catch {
        /* ignore */
      }
      return { ok: false, errorMessage };
    }
    const j = (await res.json()) as { ok?: boolean; etag?: string };
    await reconcileEtagAfterSuccessfulPut(j);
    return { ok: true, etag: getSharedDslEtag() ?? undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, errorMessage: msg };
  }
}

/** Upload the current merged workspace YAML immediately (same payload as auto-save). */
export async function pushCurrentWorkspaceToCloud(): Promise<PutSharedDslResult> {
  const full = mergeStateToFullMultiDoc(useAtcStore.getState());
  if (!looksLikeYamlDsl(full)) {
    return { ok: false, errorMessage: 'Current workspace is not valid YAML yet.' };
  }
  const r = await putSharedDsl(full, lastKnownEtag);
  if (r.ok) {
    lastPushedYaml = full;
    setAtcDsl(full);
    notifySharedDslLocalAlignedWithServer();
  }
  return r;
}

/** Replace local workspace from server (clears applied DSL cache entry first). */
export async function pullSharedDslToStore(): Promise<boolean> {
  const r = await fetchSharedDsl();
  if (!r) return false;
  /** Cancel any pending auto-save from before the pull; it would use a stale ifMatch or fight the new baseline. */
  clearOutboundSyncDebounce();
  suppressSharedDslOutboundSync = true;
  try {
    setAtcDsl(null);
    setSharedDslEtag(r.etag || null);
    useAtcStore.getState().hydrateFromStorage(r.yaml);
    const full = mergeStateToFullMultiDoc(useAtcStore.getState()).trim();
    setAtcDsl(full);
    markSharedDslBaseline(full);
    notifySharedDslLocalAlignedWithServer();
    return true;
  } finally {
    suppressSharedDslOutboundSync = false;
  }
}

const CONFLICT_EVENT = 'capacity:shared-dsl-conflict';

export function notifySharedDslConflict(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONFLICT_EVENT));
}

export function onSharedDslConflict(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = fn;
  window.addEventListener(CONFLICT_EVENT, w);
  return () => window.removeEventListener(CONFLICT_EVENT, w);
}

/** Debounced upload when the merged multi-doc YAML changes (requires {@link setSharedDslBearer}). */
export function initSharedDslOutboundSync(): () => void {
  if (!isSharedDslEnabled()) return () => {};

  const unsub = useAtcStore.subscribe((state) => {
    if (suppressSharedDslOutboundSync) return;
    const full = mergeStateToFullMultiDoc(state);
    if (!looksLikeYamlDsl(full)) return;
    if (full === lastPushedYaml) return;
    touchSharedDslEditingGrace();
    if (!getSharedDslBearer()) return;

    if (outboundSyncDebounceTimer) clearTimeout(outboundSyncDebounceTimer);
    outboundSyncDebounceTimer = setTimeout(() => {
      outboundSyncDebounceTimer = null;
      const latest = mergeStateToFullMultiDoc(useAtcStore.getState());
      if (!looksLikeYamlDsl(latest) || latest === lastPushedYaml) return;

      void (async () => {
        const r = await putSharedDsl(latest, lastKnownEtag);
        if (r.conflict) {
          notifySharedDslConflict();
          return;
        }
        if (r.ok) {
          lastPushedYaml = latest;
          setAtcDsl(latest);
          notifySharedDslLocalAlignedWithServer();
        } else if (r.errorMessage) {
          console.warn('[shared-dsl] Auto-save failed:', r.errorMessage);
        }
      })();
    }, 2800);
  });

  return () => {
    clearOutboundSyncDebounce();
    unsub();
  };
}
