/**
 * Clerk **organization** `public_metadata` keys used to drive workspace ACL via the session token.
 * Set these in Dashboard → Organizations → [org] → Metadata, then map them to `cap_*` claims
 * under Sessions → Customize session token (see docs/CLERK_CAPACITY_ORG_SETUP.md).
 */
export const CLERK_ORG_PUBLIC_META_SEGMENT = 'capacity_segment' as const;
export const CLERK_ORG_PUBLIC_META_MARKET = 'capacity_market' as const;
export const CLERK_ORG_PUBLIC_META_EDITOR = 'capacity_editor' as const;

/** User-level flag for global admins (maps to `cap_admin` in the session token). */
export const CLERK_USER_PUBLIC_META_ADMIN = 'capacity_admin' as const;

export type ClerkOrgCapacityHints = {
  segment?: string;
  market?: string;
  /** Intended editor vs viewer for this org’s workspace persona (JWT should set `cap_ed`). */
  editorHint?: boolean;
};

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t || undefined;
}

function boolish(v: unknown): boolean | undefined {
  if (v === true || v === 1 || v === '1') return true;
  if (v === false || v === 0 || v === '0') return false;
  if (typeof v === 'string') {
    const x = v.trim().toLowerCase();
    if (x === 'true' || x === 'yes') return true;
    if (x === 'false' || x === 'no') return false;
  }
  return undefined;
}

/** Read segment / market / editor hints from an org’s `publicMetadata` object. */
export function readClerkOrgCapacityHints(publicMetadata: unknown): ClerkOrgCapacityHints {
  if (!publicMetadata || typeof publicMetadata !== 'object' || Array.isArray(publicMetadata)) {
    return {};
  }
  const m = publicMetadata as Record<string, unknown>;
  const segment = str(m[CLERK_ORG_PUBLIC_META_SEGMENT])?.toUpperCase();
  const market = str(m[CLERK_ORG_PUBLIC_META_MARKET])?.toUpperCase();
  const editorHint = boolish(m[CLERK_ORG_PUBLIC_META_EDITOR]);
  return {
    ...(segment ? { segment } : {}),
    ...(market ? { market } : {}),
    ...(editorHint !== undefined ? { editorHint } : {}),
  };
}
