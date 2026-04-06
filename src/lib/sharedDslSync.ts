import { isClerkConfigured } from '@/lib/clerkConfig';
import { looksLikeHtmlOrSpaShell, looksLikeYamlDsl } from '@/lib/dslGuards';
import { mergeStateToFullMultiDoc } from '@/lib/multiDocMarketYaml';
import { setAtcDsl } from '@/lib/storage';
import { useAtcStore } from '@/store/useAtcStore';

const SESSION_BEARER_KEY = 'capacity:shared-dsl-bearer';

/** Fired when Clerk token getter or legacy bearer changes (workspace UI should re-check publish readiness). */
export const SHARED_DSL_AUTH_CHANGED_EVENT = 'capacity:shared-dsl-auth-changed';

/** Fired when PUT returns 409 (another client saved first). App may show a dismissible banner. */
export const SHARED_DSL_SAVE_CONFLICT_EVENT = 'capacity:shared-dsl-save-conflict';

/** Fired after a successful cloud save or pull so any conflict banner can hide. */
export const SHARED_DSL_CONFLICT_CLEARED_EVENT = 'capacity:shared-dsl-conflict-cleared';

function notifySharedDslSaveConflict(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SHARED_DSL_SAVE_CONFLICT_EVENT));
    }
  } catch {
    /* ignore */
  }
}

function notifySharedDslConflictCleared(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SHARED_DSL_CONFLICT_CLEARED_EVENT));
    }
  } catch {
    /* ignore */
  }
}

let clerkTokenGetter: (() => Promise<string | null>) | null = null;
/** When false, Clerk session is present but org role is not allowed to PUT (see {@link setSharedDslClerkOrgWriteAllowed}). */
let clerkOrgWriteAllowed = true;

export function setSharedDslClerkTokenGetter(fn: (() => Promise<string | null>) | null): void {
  clerkTokenGetter = fn;
  if (fn == null) clerkOrgWriteAllowed = true;
  notifySharedDslAuthChanged();
}

export function setSharedDslClerkOrgWriteAllowed(allowed: boolean): void {
  if (clerkOrgWriteAllowed === allowed) return;
  clerkOrgWriteAllowed = allowed;
  notifySharedDslAuthChanged();
}

function notifySharedDslAuthChanged(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SHARED_DSL_AUTH_CHANGED_EVENT));
    }
  } catch {
    /* ignore */
  }
}

/** True if cloud save can authenticate: Clerk session (getter set) or legacy bearer saved. */
export function sharedDslWriteReadySync(): boolean {
  return Boolean(clerkTokenGetter || getSharedDslBearer()?.trim());
}

/**
 * True if outbound PUT to `/api/shared-dsl` should run: has credentials and (for Clerk JWT path) org role allows writes.
 * Legacy bearer-only path is always allowed here; the server still enforces secrets and role lists.
 */
export function sharedDslCloudPutAllowedSync(): boolean {
  if (!sharedDslWriteReadySync()) return false;
  if (clerkTokenGetter == null) return true;
  return clerkOrgWriteAllowed;
}

/**
 * When shared DSL + Clerk sign-in gate are both on, delay the first GET until the session token
 * getter is registered (see `ClerkSharedDslBridge`) or legacy bearer exists — avoids racing a 401
 * when `CLERK_SECRET_KEY` protects reads.
 */
export function shouldWaitForClerkBeforeSharedDslFetch(): boolean {
  return isSharedDslEnabled() && isClerkConfigured();
}

export async function waitForSharedDslFetchAuth(options?: { timeoutMs?: number }): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!shouldWaitForClerkBeforeSharedDslFetch()) return;
  if (sharedDslWriteReadySync()) return;

  const timeoutMs = options?.timeoutMs ?? 10_000;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(tid);
      window.removeEventListener(SHARED_DSL_AUTH_CHANGED_EVENT, tryResolve);
      resolve();
    };
    const tryResolve = () => {
      if (sharedDslWriteReadySync()) finish();
    };
    const tid = window.setTimeout(finish, timeoutMs);
    window.addEventListener(SHARED_DSL_AUTH_CHANGED_EVENT, tryResolve);
    queueMicrotask(tryResolve);
  });
}

/** Whether the last build attached a Clerk JWT, legacy secret, or nothing (open GET if server allows). */
export type SharedDslAuthSent = 'clerk' | 'legacy' | 'none';

async function buildSharedDslAuth(): Promise<{
  headers: Record<string, string>;
  authSent: SharedDslAuthSent;
}> {
  if (clerkTokenGetter) {
    try {
      const t = await clerkTokenGetter();
      if (t?.trim()) return { headers: { Authorization: `Bearer ${t.trim()}` }, authSent: 'clerk' };
    } catch {
      /* ignore */
    }
  }
  const legacy = getSharedDslBearer();
  if (legacy?.trim()) return { headers: { Authorization: `Bearer ${legacy.trim()}` }, authSent: 'legacy' };
  return { headers: {}, authSent: 'none' };
}

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
  notifySharedDslAuthChanged();
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
async function reconcileEtagAfterSuccessfulPut(body: { etag?: string; version?: string }): Promise<void> {
  const putEtag =
    (typeof body.etag === 'string' && body.etag.trim() ? body.etag.trim() : '') ||
    (typeof body.version === 'string' && body.version.trim() ? body.version.trim() : '');
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

export type FetchSharedDslFailReason =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'server_error'
  | 'invalid_yaml'
  /** Vite dev server returned index.html instead of the Vercel function. */
  | 'html_spa_fallback'
  | 'network'
  | 'disabled';

export type FetchSharedDslDetailed =
  | { ok: true; yaml: string; etag: string; authSent: SharedDslAuthSent }
  | {
      ok: false;
      authSent: SharedDslAuthSent;
      reason: FetchSharedDslFailReason;
      httpStatus?: number;
      /** First ~120 chars of body when reason is `invalid_yaml` (debug). */
      bodyPreview?: string;
      /** Parsed from JSON error bodies (e.g. blob_access_mismatch) for Connection check. */
      serverDetail?: string;
    };

function parseSharedDslErrorDetail(text: string): string | undefined {
  const t = text.trim();
  if (!t.startsWith('{')) return undefined;
  try {
    const j = JSON.parse(t) as { message?: unknown; hint?: unknown; error?: unknown };
    const parts: string[] = [];
    if (typeof j.error === 'string' && j.error.trim()) parts.push(j.error.trim());
    if (typeof j.message === 'string' && j.message.trim()) parts.push(j.message.trim());
    if (typeof j.hint === 'string' && j.hint.trim()) parts.push(j.hint.trim());
    return parts.length ? parts.join(' — ') : undefined;
  } catch {
    return undefined;
  }
}

/** Human-readable lines for the Workspace “Connection check” panel. */
export function describeSharedDslProbe(d: FetchSharedDslDetailed): string[] {
  const authLine =
    d.authSent === 'clerk'
      ? 'Request used: Clerk session token (Authorization: Bearer …).'
      : d.authSent === 'legacy'
        ? 'Request used: legacy team secret from this browser session.'
        : 'Request used: no Authorization header (OK only if the server does not require Clerk for GET).';

  if (d.ok) {
    return [
      'GET /api/shared-dsl: success.',
      authLine,
      d.etag ? `ETag preview: ${d.etag.slice(0, 16)}…` : 'ETag: (empty — unusual but allowed)',
    ];
  }

  const lines = [authLine];

  switch (d.reason) {
    case 'disabled':
      lines.unshift('Cloud sync is off (VITE_SHARED_DSL not enabled in this build).');
      break;
    case 'unauthorized':
      lines.unshift(
        `GET returned 401. Server expects a valid Clerk JWT when CLERK_SECRET_KEY is set. Check sign-in, Vercel env CLERK_SECRET_KEY (same instance as publishable key), and CAPACITY_CLERK_AUTHORIZED_PARTIES (must include this origin exactly).`
      );
      if (d.authSent === 'legacy') {
        lines.push(
          'You only sent the legacy team secret. Reads (GET) do not accept that when CLERK_SECRET_KEY is set — sign in so the app sends a Clerk session token, or you are hitting an API that still requires JWT.'
        );
      }
      break;
    case 'forbidden':
      lines.unshift(
        'GET returned 403 — this account is not on the deployment email allowlist, or the session JWT does not include your email. Match VITE_ALLOWED_USER_EMAILS with CAPACITY_ALLOWED_USER_EMAILS on the server; in Clerk add `"email": "{{user.primary_email_address}}"` to the session token JSON.'
      );
      if (d.serverDetail) lines.push(d.serverDetail);
      break;
    case 'not_found':
      lines.unshift('GET returned 404 — no Blob file yet (normal until someone saves once).');
      break;
    case 'server_error':
      lines.unshift(`GET failed with HTTP ${d.httpStatus ?? '?'}. Check Vercel function logs.`);
      if (d.serverDetail) lines.push(d.serverDetail);
      break;
    case 'invalid_yaml':
      lines.unshift('Response was not valid workspace YAML (wrong body, API source file, or unexpected text).');
      if (d.bodyPreview) {
        lines.push(`Body preview: ${d.bodyPreview}${d.bodyPreview.length >= 120 ? '…' : ''}`);
      }
      break;
    case 'html_spa_fallback':
      lines.unshift(
        'Response looks like HTML (often the Vite dev shell or `<html>…` without hitting the serverless route). Plain `pnpm dev` does not run `/api/*` — use `vercel dev` with env vars, or test on your Vercel deployment.'
      );
      if (d.authSent === 'legacy') {
        lines.push(
          'The legacy secret does not fix local API routing; you still need `vercel dev` or a deployed URL for GET /api/shared-dsl.'
        );
      }
      break;
    case 'network':
      lines.unshift('Network error talking to /api/shared-dsl.');
      break;
    default:
      lines.unshift('Request failed.');
  }

  return lines;
}

/** GET workspace with auth headers when Clerk / legacy bearer is available. */
export async function fetchSharedDslDetailed(): Promise<FetchSharedDslDetailed> {
  if (!isSharedDslEnabled()) return { ok: false, authSent: 'none', reason: 'disabled' };
  let authSent: SharedDslAuthSent = 'none';
  try {
    const built = await buildSharedDslAuth();
    authSent = built.authSent;
    const res = await fetch(apiUrl(), { method: 'GET', cache: 'no-store', headers: built.headers });
    if (res.status === 401) return { ok: false, authSent, reason: 'unauthorized', httpStatus: 401 };
    if (res.status === 403) {
      const raw = await res.text();
      return {
        ok: false,
        authSent,
        reason: 'forbidden',
        httpStatus: 403,
        serverDetail: parseSharedDslErrorDetail(raw),
      };
    }
    if (res.status === 404) return { ok: false, authSent, reason: 'not_found', httpStatus: 404 };
    if (!res.ok) {
      const raw = await res.text();
      const serverDetail = parseSharedDslErrorDetail(raw);
      return {
        ok: false,
        authSent,
        reason: 'server_error',
        httpStatus: res.status,
        bodyPreview: raw.replace(/\s+/g, ' ').trim().slice(0, 120) || undefined,
        serverDetail,
      };
    }

    const ct = res.headers.get('content-type') ?? '';
    const yaml = await res.text();
    if (ct.includes('text/html') || looksLikeHtmlOrSpaShell(yaml)) {
      return { ok: false, authSent, reason: 'html_spa_fallback', httpStatus: res.status };
    }
    if (!looksLikeYamlDsl(yaml)) {
      const bodyPreview = yaml.replace(/\s+/g, ' ').trim().slice(0, 120);
      return {
        ok: false,
        authSent,
        reason: 'invalid_yaml',
        httpStatus: res.status,
        bodyPreview: bodyPreview || undefined,
      };
    }

    const etag = res.headers.get('X-DSL-Etag') ?? res.headers.get('x-dsl-etag');
    if (!etag?.trim()) return { ok: true, yaml: yaml.trim(), etag: '', authSent };
    return { ok: true, yaml: yaml.trim(), etag: etag.trim(), authSent };
  } catch {
    return { ok: false, authSent, reason: 'network' };
  }
}

/** GET current workspace from the server. Returns null if none, misconfigured, unauthorized, or invalid body. */
export async function fetchSharedDsl(): Promise<FetchSharedDslResult | null> {
  const d = await fetchSharedDslDetailed();
  if (d.ok) return { yaml: d.yaml, etag: d.etag };
  return null;
}

export type PutSharedDslResult = {
  ok: boolean;
  etag?: string;
  conflict?: boolean;
  /** Set when ok is false (network, 401, 503, etc.). */
  errorMessage?: string;
};

export async function putSharedDsl(yaml: string, ifMatch: string | null): Promise<PutSharedDslResult> {
  if (!sharedDslCloudPutAllowedSync()) {
    return {
      ok: false,
      errorMessage:
        'Your organization role cannot save the team workspace in this session. Ask an admin for a role listed in VITE_CLERK_DSL_WRITE_ROLES (must match server CAPACITY_CLERK_DSL_WRITE_ROLES).',
    };
  }
  const { headers } = await buildSharedDslAuth();
  if (!headers.Authorization) {
    return {
      ok: false,
      errorMessage:
        'Not signed in or no team secret — sign in (Clerk) or paste CAPACITY_SHARED_DSL_SECRET in Workspace.',
    };
  }
  try {
    const res = await fetch(apiUrl(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        yaml,
        ...(ifMatch ? { ifMatch } : {}),
      }),
    });
    if (res.status === 409) {
      notifySharedDslSaveConflict();
      return { ok: false, conflict: true, errorMessage: 'Someone else saved first (conflict).' };
    }
    if (res.status === 403) {
      let msg = 'Save forbidden — your role cannot edit the team workspace.';
      try {
        const j = (await res.json()) as { message?: string };
        if (typeof j.message === 'string' && j.message.trim()) msg = j.message.trim();
      } catch {
        /* ignore */
      }
      return { ok: false, errorMessage: msg };
    }
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
    const j = (await res.json()) as { ok?: boolean; etag?: string; version?: string };
    await reconcileEtagAfterSuccessfulPut(j);
    notifySharedDslConflictCleared();
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
    notifySharedDslConflictCleared();
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
    if (!sharedDslCloudPutAllowedSync()) return;

    if (outboundSyncDebounceTimer) clearTimeout(outboundSyncDebounceTimer);
    outboundSyncDebounceTimer = setTimeout(() => {
      outboundSyncDebounceTimer = null;
      const latest = mergeStateToFullMultiDoc(useAtcStore.getState());
      if (!looksLikeYamlDsl(latest) || latest === lastPushedYaml) return;

      void (async () => {
        const r = await putSharedDsl(latest, lastKnownEtag);
        if (r.conflict) {
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
