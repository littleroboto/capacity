/**
 * Mirrors client {@link ../src/lib/capacityAccess.ts} using bundled JSON (no Node fs).
 */
import rawManifest from '../public/data/markets/manifest.json';
import rawSegments from '../public/data/segments.json';

type SegmentRegistry = Readonly<Record<string, readonly string[]>>;

function normalizeSegments(input: unknown): SegmentRegistry {
  if (input == null || typeof input !== 'object') return {};
  const o = input as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(o)) {
    const code = k.trim().toUpperCase();
    if (!code) continue;
    if (!Array.isArray(v)) continue;
    out[code] = v.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  }
  return out;
}

const SEGMENTS_REGISTRY = normalizeSegments(rawSegments);

const MANIFEST_MARKETS: readonly string[] = (() => {
  const m = rawManifest as { markets?: unknown };
  const list = m.markets;
  if (!Array.isArray(list)) return [];
  return list.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
})();

const MANIFEST_SET = new Set(MANIFEST_MARKETS);

function getSegmentMarkets(segmentCode: string): readonly string[] | undefined {
  return SEGMENTS_REGISTRY[segmentCode.trim().toUpperCase()];
}

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

function normalizeOrgRoleToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/^org:/, '');
}

export function extractOrgRoleNormFromVerifiedJwt(payload: Record<string, unknown>): string | null {
  const v1 = payload.org_role;
  if (typeof v1 === 'string' && v1.trim()) return normalizeOrgRoleToken(v1);

  const o = payload.o;
  if (o && typeof o === 'object' && o !== null && !Array.isArray(o)) {
    const rol = (o as Record<string, unknown>).rol;
    if (typeof rol === 'string' && rol.trim()) return normalizeOrgRoleToken(rol);
  }
  return null;
}

export type PartyCapacityAccess = {
  legacyFullAccess: boolean;
  admin: boolean;
  allowedMarketIds: ReadonlySet<string>;
  canEditYaml: boolean;
};

export function parseOrgAdminRolesFromEnv(raw: string | undefined): string[] {
  const t = raw?.trim();
  if (!t) return ['admin'];
  return t
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^org:/, ''))
    .filter(Boolean);
}

export function parseCapacityAccessServer(
  claims: Record<string, unknown> | null | undefined,
  orgRoleNorm: string | null,
  orgAdminRoles: readonly string[]
): PartyCapacityAccess {
  if (!claims || typeof claims !== 'object') {
    return {
      legacyFullAccess: true,
      admin: true,
      allowedMarketIds: new Set(MANIFEST_MARKETS),
      canEditYaml: true,
    };
  }
  const c = claims;
  const hasCapAdmin = Object.prototype.hasOwnProperty.call(c, 'cap_admin');
  const hasCapSegs = Object.prototype.hasOwnProperty.call(c, 'cap_segs');
  const hasCapEd = Object.prototype.hasOwnProperty.call(c, 'cap_ed');
  const hasCapMkts = Object.prototype.hasOwnProperty.call(c, 'cap_mkts');

  if (!hasCapAdmin && !hasCapSegs && !hasCapEd && !hasCapMkts) {
    return {
      legacyFullAccess: true,
      admin: true,
      allowedMarketIds: new Set(MANIFEST_MARKETS),
      canEditYaml: true,
    };
  }

  const capAdmin = truthyClaim(c.cap_admin);
  const segs = parseSegList(c.cap_segs);
  const capEd = truthyClaim(c.cap_ed);
  const capMktsRaw = parseSegList(c.cap_mkts);
  const capMkts = capMktsRaw.filter((id) => MANIFEST_SET.has(id));

  const adminByOrg = Boolean(orgRoleNorm && orgAdminRoles.includes(orgRoleNorm));
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

  const canEditYaml = admin || capEd;

  return {
    legacyFullAccess: false,
    admin,
    allowedMarketIds: allowed,
    canEditYaml,
  };
}

export function isKnownManifestMarket(marketId: string): boolean {
  return MANIFEST_SET.has(marketId.trim().toUpperCase());
}
