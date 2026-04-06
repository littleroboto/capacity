/// <reference types="vite/client" />

declare global {
  /** Clerk session JWT custom claims (Sessions → Customize session token). */
  interface CustomJwtSessionClaims {
    cap_admin?: boolean;
    cap_segs?: string;
    cap_mkts?: string;
    cap_ed?: boolean;
  }
}

interface ImportMetaEnv {
  /** When `1` or `true`, load/save workspace YAML via `/api/shared-dsl` (Vercel Blob). */
  readonly VITE_SHARED_DSL?: string;
  /** Clerk publishable key — when set (and not disabled), the workbench requires sign-in. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** When `1` or `true`, skip the Clerk sign-in gate even if `VITE_CLERK_PUBLISHABLE_KEY` is set. */
  readonly VITE_AUTH_DISABLED?: string;
  /**
   * Optional comma-separated org roles allowed to PUT shared workspace YAML (normalized, `org:` optional).
   * Must match server `CAPACITY_CLERK_DSL_WRITE_ROLES`. Unset = UI does not block saves (server may still enforce).
   */
  readonly VITE_CLERK_DSL_WRITE_ROLES?: string;
  /**
   * Optional comma-separated Clerk org roles (normalized) that imply workspace admin (match server `CAPACITY_ORG_ADMIN_ROLES`).
   * Default: `admin`.
   */
  readonly VITE_CAPACITY_ORG_ADMIN_ROLES?: string;
}

declare module '*.yaml?raw' {
  const src: string;
  export default src;
}

declare module '*.md?raw' {
  const src: string;
  export default src;
}
