/**
 * Admin API client: typed fetch wrappers for the Postgres-backed config API.
 * Uses a registerable Clerk token getter (set by AdminClerkBridge).
 */

let tokenGetter: (() => Promise<string | null>) | null = null;

export function setAdminTokenGetter(fn: (() => Promise<string | null>) | null): void {
  tokenGetter = fn;
}

async function getSessionToken(): Promise<string> {
  if (!tokenGetter) throw new Error('Admin API: no Clerk session registered');
  const token = await tokenGetter();
  if (!token) throw new Error('Admin API: no session token available');
  return token;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getSessionToken();
  return fetch(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

function parseJsonBody<T>(text: string, label: string): T {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('import') || trimmed.startsWith('export ')) {
    throw new Error(
      `${label}: the server returned JavaScript instead of JSON. Use \`pnpm dev:vercel\` locally (not plain \`pnpm dev\`) so /api/* routes run, or test on a Vercel deployment.`
    );
  }
  if (trimmed.startsWith('<!')) {
    throw new Error(
      `${label}: the server returned HTML instead of JSON — often a dev-server or hosting fallback. Use \`pnpm dev:vercel\` for local admin APIs.`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label}: invalid JSON (first 160 chars): ${text.slice(0, 160)}`);
  }
}

function throwApiError(status: number, headers: Headers, text: string, label: string): never {
  let detail = '';
  let requestId = '';
  try {
    const j = JSON.parse(text) as {
      detail?: string;
      error?: string;
      message?: string;
      hint?: string;
      requestId?: string;
      step?: string;
      clerk_sub?: string;
      jwt_email?: string | null;
    };
    if (j.step) detail += ` — step:${j.step}`;
    if (j.clerk_sub) detail += ` — clerk_sub:${j.clerk_sub}`;
    if (j.jwt_email !== undefined && j.jwt_email !== null && j.jwt_email !== '')
      detail += ` — jwt_email:${j.jwt_email}`;
    else if (j.jwt_email === null || j.jwt_email === '')
      detail += ` — jwt_email:(missing — add email to Clerk session JWT template)`;
    if (j.detail) detail += ` — ${j.detail}`;
    else if (typeof j.message === 'string' && j.message) detail += ` — ${j.message}`;
    else if (j.error && !j.detail) detail += ` — ${j.error}`;
    if (typeof j.hint === 'string' && j.hint.trim()) detail += ` — ${j.hint.trim()}`;
    if (j.requestId) requestId = ` [Vercel Logs: search "${j.requestId}"]`;
  } catch {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (snippet) detail += ` — body: ${snippet}`;
  }
  if (!requestId) {
    const hdr = headers.get('x-vercel-id');
    if (hdr) requestId = ` [Vercel Logs: search "${hdr}"]`;
  }
  throw new Error(`${label}: ${status}${detail}${requestId}`);
}

async function readJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) throwApiError(res.status, res.headers, text, label);
  return parseJsonBody<T>(text, label);
}

/** POST/PUT-style JSON where error bodies are usually `{ error?, message? }`. */
async function readJsonMutation<T extends Record<string, unknown>>(
  res: Response,
  label: string
): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text) as { error?: string; message?: string };
      throw new Error(j.error || j.message || `${label}: ${res.status}`);
    } catch (e) {
      if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
      throwApiError(res.status, res.headers, text, label);
    }
  }
  return parseJsonBody<T>(text, label);
}

export async function fetchMarkets() {
  const res = await apiFetch('/api/markets');
  return readJson<unknown[]>(res, 'Failed to fetch markets');
}

export async function fetchFragments(table: string, marketId: string, status?: string) {
  let url = `/api/fragments?table=${table}&market=${marketId}`;
  if (status) url += `&status=${status}`;
  const res = await apiFetch(url);
  return readJson<Record<string, unknown>[]>(res, `Failed to fetch ${table}`);
}

export async function fetchFragment(table: string, id: string) {
  const res = await apiFetch(`/api/fragments?table=${table}&id=${id}`);
  return readJson<Record<string, unknown>>(res, 'Failed to fetch fragment');
}

export async function createFragmentApi(table: string, body: Record<string, unknown>) {
  const res = await apiFetch(`/api/fragments?table=${table}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return readJsonMutation(res, `Create ${table}`);
}

export async function updateFragmentApi(table: string, id: string, body: Record<string, unknown>) {
  const res = await apiFetch(`/api/fragments?table=${table}&id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text) as { error?: string; code?: string };
      const err = new Error(j.error || `Update failed: ${res.status}`);
      (err as unknown as Record<string, unknown>).code = j.code;
      throw err;
    } catch (e) {
      if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
      throwApiError(res.status, res.headers, text, `Update ${table}`);
    }
  }
  return parseJsonBody<Record<string, unknown>>(text, `Update ${table}`);
}

export async function deleteFragmentApi(table: string, id: string, expectedVersion: number) {
  const res = await apiFetch(`/api/fragments?table=${table}&id=${id}&expectedVersion=${expectedVersion}`, {
    method: 'DELETE',
  });
  return readJsonMutation(res, `Delete ${table}`);
}

export async function buildMarketApi(marketId: string) {
  const res = await apiFetch(`/api/builds?action=build&market=${marketId}`, { method: 'POST' });
  return readJsonMutation(res, 'Build market');
}

export async function publishBuildApi(buildId: string) {
  const res = await apiFetch(`/api/builds?action=publish&id=${buildId}`, { method: 'POST' });
  return readJsonMutation(res, 'Publish build');
}

export async function fetchBuilds(marketId: string) {
  const res = await apiFetch(`/api/builds?market=${marketId}`);
  return readJson<Record<string, unknown>[]>(res, 'Failed to fetch builds');
}

export async function fetchBuild(buildId: string) {
  const res = await apiFetch(`/api/builds?id=${buildId}`);
  return readJson<Record<string, unknown>>(res, 'Failed to fetch build');
}

export async function validateMarketApi(marketId: string) {
  const res = await apiFetch(`/api/validate?market=${marketId}`, { method: 'POST' });
  return readJsonMutation(res, 'Validation');
}

export async function fetchRevisions(table: string, id: string) {
  const res = await apiFetch(`/api/revisions?table=${table}&id=${id}`);
  return readJson<unknown[]>(res, 'Failed to fetch revisions');
}

export async function fetchAuditLog(marketId?: string, limit = 50) {
  let url = `/api/audit?limit=${limit}`;
  if (marketId) url += `&market=${marketId}`;
  const res = await apiFetch(url);
  return readJson<Record<string, unknown>[]>(res, 'Failed to fetch audit');
}

export async function createHolidayEntryApi(body: {
  calendar_id: string;
  holiday_date: string;
  label?: string;
}) {
  const res = await apiFetch('/api/holiday-entries', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return readJsonMutation<Record<string, unknown>>(res, 'Create holiday entry');
}

export async function deleteHolidayEntryApi(entryId: string) {
  const res = await apiFetch(`/api/holiday-entries?id=${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
  });
  return readJsonMutation<Record<string, unknown>>(res, 'Delete holiday entry');
}

export async function fetchConfigYaml(marketId: string) {
  const res = await apiFetch(`/api/config?market=${marketId}`);
  const text = await res.text();
  if (!res.ok) throwApiError(res.status, res.headers, text, 'Failed to fetch config');
  return text;
}

export async function previewYamlImport(marketId: string, yamlText: string) {
  const res = await apiFetch(`/api/import?market=${marketId}&mode=preview`, {
    method: 'POST',
    body: JSON.stringify({ yaml: yamlText }),
  });
  return readJsonMutation(res, 'YAML preview');
}

export async function applyYamlImport(marketId: string, yamlText: string) {
  const res = await apiFetch(`/api/import?market=${marketId}&mode=apply`, {
    method: 'POST',
    body: JSON.stringify({ yaml: yamlText }),
  });
  return readJsonMutation(res, 'YAML apply');
}
