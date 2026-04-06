/**
 * Server-side workspace ACL for `/api/shared-dsl`.
 * Segment list and manifest order are read from repo JSON at module load (same sources as the SPA).
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseDslMarketId } from './dslMarketLine';

function readProjectJson<T>(relativeFromRepoRoot: string): T {
  const full = path.join(process.cwd(), relativeFromRepoRoot);
  if (!existsSync(full)) {
    throw new Error(`capacityWorkspaceAcl: missing ${full} (cwd=${process.cwd()})`);
  }
  return JSON.parse(readFileSync(full, 'utf8')) as T;
}

function loadSegmentToMarkets(): Record<string, readonly string[]> {
  const raw = readProjectJson<Record<string, unknown>>('public/data/segments.json');
  const out: Record<string, readonly string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    const code = k.trim().toUpperCase();
    if (!code) continue;
    if (!Array.isArray(v)) continue;
    out[code] = v.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  }
  return out;
}

function loadManifestMarketOrder(): readonly string[] {
  const m = readProjectJson<{ markets?: unknown }>('public/data/markets/manifest.json');
  const list = m.markets;
  if (!Array.isArray(list)) {
    throw new Error('capacityWorkspaceAcl: manifest.json missing "markets" array');
  }
  return list.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
}

/** Segment code → ordered market ids (`public/data/segments.json`). */
export const SEGMENT_TO_MARKETS: Record<string, readonly string[]> = loadSegmentToMarkets();

/** Runway market order from generated manifest (`public/data/markets/manifest.json`). */
export const WORKSPACE_MANIFEST_MARKET_ORDER: readonly string[] = loadManifestMarketOrder();

const MULTI_DOC_SPLIT = /\r?\n---\s*\r?\n/;

export type CapacityWorkspaceAccess = {
  legacyFullAccess: boolean;
  admin: boolean;
  allowedMarketIds: ReadonlySet<string>;
  canEditYaml: boolean;
  segments: readonly string[];
};

export function parseOrgAdminRolesFromEnv(raw: string | undefined): string[] {
  const t = raw?.trim();
  if (!t) return ['admin'];
  return t
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^org:/, ''))
    .filter(Boolean);
}

function truthyClaim(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function parseSegList(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  }
  const t = String(raw).trim();
  if (!t) return [];
  return t
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
}

function normalizeOrgRoleToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/^org:/, '');
}

/**
 * Read cap_* claims from verified Clerk JWT payload (customize session token in Clerk).
 */
export function parseCapacityWorkspaceAccess(
  payload: Record<string, unknown>,
  orgRoleNorm: string | null,
  orgAdminRoles: readonly string[]
): CapacityWorkspaceAccess {
  const c = payload;
  const hasCapAdmin = Object.prototype.hasOwnProperty.call(c, 'cap_admin');
  const hasCapSegs = Object.prototype.hasOwnProperty.call(c, 'cap_segs');
  const hasCapEd = Object.prototype.hasOwnProperty.call(c, 'cap_ed');

  if (!hasCapAdmin && !hasCapSegs && !hasCapEd) {
    return {
      legacyFullAccess: true,
      admin: true,
      allowedMarketIds: new Set(WORKSPACE_MANIFEST_MARKET_ORDER),
      canEditYaml: true,
      segments: [],
    };
  }

  const capAdmin = truthyClaim(c.cap_admin);
  const segs = parseSegList(c.cap_segs);
  const capEd = truthyClaim(c.cap_ed);
  const adminByOrg = Boolean(orgRoleNorm && orgAdminRoles.includes(orgRoleNorm));

  const admin = capAdmin || adminByOrg;
  const allowed = new Set<string>();
  for (const seg of segs) {
    const ids = SEGMENT_TO_MARKETS[seg];
    if (ids) for (const id of ids) allowed.add(id);
  }

  return {
    legacyFullAccess: false,
    admin,
    allowedMarketIds: allowed,
    canEditYaml: admin || capEd,
    segments: segs,
  };
}

export function splitMultiDocYamlToMap(multiDocYaml: string): Record<string, string> {
  const trimmed = multiDocYaml.trim();
  if (!trimmed) return {};
  const parts = MULTI_DOC_SPLIT.test(trimmed) ? trimmed.split(MULTI_DOC_SPLIT) : [trimmed];
  const out: Record<string, string> = {};
  for (const seg of parts) {
    const id = parseDslMarketId(seg);
    if (id) out[id] = seg.trim();
  }
  return out;
}

function mergeMapToYaml(dslByMarket: Record<string, string>, order: readonly string[]): string {
  const parts: string[] = [];
  for (const id of order) {
    const raw = dslByMarket[id]?.trim();
    if (!raw) continue;
    parts.push(raw.replace(/\s+$/, ''));
  }
  return parts.join('\n---\n\n');
}

/** Drop documents whose market id is not in `allow` (admin / legacy: pass full order list). */
export function filterWorkspaceYamlToMarkets(
  multiDocYaml: string,
  allow: ReadonlySet<string>,
  order: readonly string[] = WORKSPACE_MANIFEST_MARKET_ORDER
): string {
  const by = splitMultiDocYamlToMap(multiDocYaml);
  const next: Record<string, string> = {};
  for (const id of order) {
    if (!allow.has(id)) continue;
    if (by[id]) next[id] = by[id]!;
  }
  return mergeMapToYaml(next, order);
}

/** Apply PUT body: only `allowed` market docs are taken from client; others preserved from current blob. */
export function mergePartialWorkspacePut(
  currentYaml: string,
  clientYaml: string,
  allowed: ReadonlySet<string>,
  order: readonly string[] = WORKSPACE_MANIFEST_MARKET_ORDER
): string {
  const cur = splitMultiDocYamlToMap(currentYaml);
  const cli = splitMultiDocYamlToMap(clientYaml);
  const merged: Record<string, string> = { ...cur };
  for (const id of allowed) {
    if (cli[id]) merged[id] = cli[id]!;
  }
  return mergeMapToYaml(merged, order);
}
