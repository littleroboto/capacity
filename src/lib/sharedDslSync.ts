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

export function getSharedDslEtag(): string | null {
  return lastKnownEtag;
}

export function setSharedDslEtag(etag: string | null): void {
  const next = etag?.trim() ? etag.trim() : null;
  if (next === lastKnownEtag) return;
  lastKnownEtag = next;
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

/**
 * After a successful PUT, prefer JSON `etag` (authoritative). If absent, GET once for metadata.
 */
async function reconcileEtagAfterSuccessfulPut(body: { etag?: string }): Promise<void> {
  const putEtag = typeof body.etag === 'string' && body.etag.trim() ? body.etag.trim() : '';
  let next = putEtag;
  if (!next) {
    try {
      const got = await fetchSharedDsl();
      if (got?.etag?.trim()) next = got.etag.trim();
    } catch {
      /* ignore */
    }
  }
  if (next) setSharedDslEtag(next);
}

export type PullTeamWorkspaceResult = 'ok' | 'cancelled' | 'no_remote' | 'failed';

/**
 * Pull latest YAML from the server. Confirms only if local YAML differs from last pushed baseline
 * (unsaved local edits would be lost). No remote “stale” / multi-tab toast in POC.
 */
export async function pullTeamWorkspaceWithUserConfirm(): Promise<PullTeamWorkspaceResult> {
  const probe = await fetchSharedDsl();
  if (!probe) return 'no_remote';
  const dirty = isSharedDslLocallyEdited();
  if (dirty) {
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
  }
  return r;
}

/** Replace local workspace from server (clears applied DSL cache entry first). */
export async function pullSharedDslToStore(): Promise<boolean> {
  const r = await fetchSharedDsl();
  if (!r) return false;
  clearOutboundSyncDebounce();
  suppressSharedDslOutboundSync = true;
  try {
    setAtcDsl(null);
    setSharedDslEtag(r.etag || null);
    useAtcStore.getState().hydrateFromStorage(r.yaml);
    const full = mergeStateToFullMultiDoc(useAtcStore.getState()).trim();
    setAtcDsl(full);
    markSharedDslBaseline(full);
    return true;
  } finally {
    suppressSharedDslOutboundSync = false;
  }
}

/** Debounced upload when the merged multi-doc YAML changes (requires {@link setSharedDslBearer}). */
export function initSharedDslOutboundSync(): () => void {
  if (!isSharedDslEnabled()) return () => {};

  const unsub = useAtcStore.subscribe((state) => {
    if (suppressSharedDslOutboundSync) return;
    const full = mergeStateToFullMultiDoc(state);
    if (!looksLikeYamlDsl(full)) return;
    if (full === lastPushedYaml) return;
    if (!getSharedDslBearer()) return;

    if (outboundSyncDebounceTimer) clearTimeout(outboundSyncDebounceTimer);
    outboundSyncDebounceTimer = setTimeout(() => {
      outboundSyncDebounceTimer = null;
      const latest = mergeStateToFullMultiDoc(useAtcStore.getState());
      if (!looksLikeYamlDsl(latest) || latest === lastPushedYaml) return;

      void (async () => {
        const r = await putSharedDsl(latest, lastKnownEtag);
        if (r.conflict) {
          console.warn('[shared-dsl] Save conflict (409): another client saved first. Pull from cloud or merge manually.');
          return;
        }
        if (r.ok) {
          lastPushedYaml = latest;
          setAtcDsl(latest);
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
