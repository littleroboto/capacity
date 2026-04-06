/**
 * Workspace ACL from Clerk session claims + optional org role.
 * Configure in Clerk Dashboard → Sessions → Customize session token, e.g.:
 *   "cap_admin": "{{user.public_metadata.capacity_admin}}",
 *   "cap_segs": "{{user.public_metadata.capacity_segments}}",
 *   "cap_ed": "{{user.public_metadata.capacity_editor}}",
 *   "cap_mkts": "{{user.public_metadata.capacity_markets}}"
 * Optional **cap_mkts** — comma-separated manifest market ids (e.g. "UK,IE"). Intersects with **cap_segs**
 * when both are set; if only **cap_mkts** is set, allowance is those markets (viewer/editor still from cap_ed / admin).
 *
 * When no cap_* claims are present, behaviour matches pre-ACL deployments (full markets, edits allowed).
 */
import { getSegmentMarkets, type SegmentCode } from '@/lib/segmentsConfig';

export type { SegmentCode };

export type CapacityAccess = {
  /** No cap_* claims on the session — treat as legacy full access. */
  legacyFullAccess: boolean;
  admin: boolean;
  /** Union of market ids the user may view (subset of manifest). Empty only if restricted with no segments. */
  allowedMarketIds: readonly string[];
  canEditYaml: boolean;
  /** Segment codes granted (LIOM / IOM), uppercased. */
  segments: readonly string[];
};

export const FULL_CAPACITY_ACCESS: CapacityAccess = {
  legacyFullAccess: true,
  admin: true,
  allowedMarketIds: [],
  canEditYaml: true,
  segments: [],
};

function normSeg(s: string): string {
  return s.trim().toUpperCase();
}

function parseSegList(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).map(normSeg).filter(Boolean);
  }
  const t = String(raw).trim();
  if (!t) return [];
  return t
    .split(',')
    .map((p) => normSeg(p))
    .filter(Boolean);
}

function truthyClaim(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

/** Org roles that imply admin (comma list from env on server; client uses same default). */
export function defaultOrgAdminRoles(): string[] {
  return ['admin'];
}

/** Match server `CAPACITY_ORG_ADMIN_ROLES` (comma list, normalized like org roles). */
export function parseViteCapacityOrgAdminRoles(): string[] {
  const v = import.meta.env.VITE_CAPACITY_ORG_ADMIN_ROLES?.trim();
  if (!v) return defaultOrgAdminRoles();
  return v
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^org:/, ''))
    .filter(Boolean);
}

function normalizeOrgRoleToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/^org:/, '');
}

/**
 * @param claims — Clerk `sessionClaims` or JWT payload
 * @param orgRole — Clerk `orgRole` when using an active organization
 * @param orgAdminRoles — normalized role tokens that count as admin (e.g. from CAPACITY_ORG_ADMIN_ROLES)
 */
export function parseCapacityAccess(
  claims: Record<string, unknown> | null | undefined,
  orgRole: string | null | undefined,
  orgAdminRoles: readonly string[]
): CapacityAccess {
  if (!claims || typeof claims !== 'object') {
    return { ...FULL_CAPACITY_ACCESS, legacyFullAccess: true };
  }
  const c = claims as Record<string, unknown>;
  const hasCapAdmin = Object.prototype.hasOwnProperty.call(c, 'cap_admin');
  const hasCapSegs = Object.prototype.hasOwnProperty.call(c, 'cap_segs');
  const hasCapEd = Object.prototype.hasOwnProperty.call(c, 'cap_ed');
  const hasCapMkts = Object.prototype.hasOwnProperty.call(c, 'cap_mkts');

  if (!hasCapAdmin && !hasCapSegs && !hasCapEd && !hasCapMkts) {
    return { ...FULL_CAPACITY_ACCESS, legacyFullAccess: true };
  }

  const capAdmin = truthyClaim(c.cap_admin);
  const segs = parseSegList(c.cap_segs);
  const capEd = truthyClaim(c.cap_ed);
  const capMkts = parseSegList(c.cap_mkts);

  const or = orgRole?.trim();
  const orgNorm = or ? normalizeOrgRoleToken(or) : '';
  const adminByOrg = Boolean(orgNorm && orgAdminRoles.includes(orgNorm));

  const admin = capAdmin || adminByOrg;

  const allowed = new Set<string>();
  for (const seg of segs) {
    const ids = getSegmentMarkets(seg);
    if (ids) for (const id of ids) allowed.add(id);
  }

  if (capMkts.length > 0) {
    const mset = new Set(capMkts);
    if (allowed.size > 0) {
      const narrowed = new Set<string>();
      for (const id of allowed) {
        if (mset.has(id)) narrowed.add(id);
      }
      allowed.clear();
      for (const id of narrowed) allowed.add(id);
    } else {
      for (const id of capMkts) allowed.add(id);
    }
  }

  const allowedMarketIds = [...allowed];

  const canEditYaml = admin || capEd;

  return {
    legacyFullAccess: false,
    admin,
    allowedMarketIds,
    canEditYaml,
    segments: [...segs],
  };
}

export function filterManifestOrderForAccess(
  manifestOrder: readonly string[],
  access: CapacityAccess
): string[] {
  if (access.legacyFullAccess || access.admin) return [...manifestOrder];
  if (access.allowedMarketIds.length === 0) return [];
  const allow = new Set(access.allowedMarketIds);
  return manifestOrder.filter((id) => allow.has(id));
}

export function runwayFocusAllowed(
  access: CapacityAccess,
  value: string,
  liomValue: string,
  iomValue: string
): boolean {
  if (access.legacyFullAccess || access.admin) return true;
  if (value === liomValue) return access.segments.includes('LIOM');
  if (value === iomValue) return access.segments.includes('IOM');
  return access.allowedMarketIds.includes(value);
}
