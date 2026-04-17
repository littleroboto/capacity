# Environment Variable Contract

**Status:** Active — all new code must follow this contract  
**Last updated:** 2026-04-15

---

## Canonical Variables (keep)

### Clerk Authentication (Vercel Integration)

| Variable | Scope | Source | Notes |
|----------|-------|--------|-------|
| `CLERK_AUTHENTICATION_CLERK_SECRET_KEY` | Server only | Vercel Integration | Canonical secret key from Vercel-provisioned Clerk |
| `NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY` | Client-safe | Vercel Integration | Publishable key; exposed via Vite `envPrefix` (`vite.config.ts`). Optional legacy: `VITE_CLERK_PUBLISHABLE_KEY` |

### Supabase / Postgres

| Variable | Scope | Source | Notes |
|----------|-------|--------|-------|
| `SUPABASE_URL` | Server only | Vercel Integration | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Vercel Integration | Full DB access — never expose to client |
| `SUPABASE_SECRET_KEY` | Server only | Vercel Integration | Alternative secret — server only |
| `VITE_PUBLIC_SUPABASE_URL` | Client-safe | Manual | Supabase URL for client (anon access only) |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | Client-safe | Manual | Anon key for client — RLS enforced |
| `POSTGRES_URL` | Server only | Vercel Integration | Direct Postgres connection (pooled) |
| `POSTGRES_URL_NON_POOLING` | Server only | Vercel Integration | Direct Postgres (non-pooled, for migrations) |
| `POSTGRES_PRISMA_URL` | Server only | Vercel Integration | Prisma-compatible URL with pgbouncer |

### Upstash Redis

| Variable | Scope | Source | Notes |
|----------|-------|--------|-------|
| `STORAGE_UPSTASH_KV_REST_API_URL` | Server only | Vercel Integration | Redis REST API endpoint |
| `STORAGE_UPSTASH_KV_REST_API_TOKEN` | Server only | Vercel Integration | Read/write token |
| `STORAGE_UPSTASH_KV_REST_API_READ_ONLY_TOKEN` | Server only | Vercel Integration | Read-only token |

---

## Compatibility Variables (temporary — phase out)

| Variable | Replacement | Migration Status | Used In |
|----------|-------------|-----------------|---------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Prefer `NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY` | **Optional legacy alias** — same `pk_` value | `clerkConfig.ts`, `clientEnv.ts` |
| `CLERK_SECRET_KEY` | `CLERK_AUTHENTICATION_CLERK_SECRET_KEY` | **Optional server fallback** | `api/lib/env.ts` (all `verifyToken` callers) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | N/A (wrong integration name) | **Do not use** | Not in code |

---

## Legacy Variables (deprecate / remove)

| Variable | Status | Action | Used In |
|----------|--------|--------|---------|
| `CAPACITY_SHARED_DSL_SECRET` | Compatibility only | Remove after Postgres migration complete | `api/_sharedDslImpl.ts` |
| `BLOB_READ_WRITE_TOKEN` | Compatibility only | Remove after Postgres migration complete | `api/_sharedDslImpl.ts` |
| `VITE_SHARED_DSL` | Active | Keep until Postgres read path replaces Blob | `sharedDslSync.ts` |
| `CAPACITY_DISABLE_LEGACY_SHARED_DSL_WRITE` | Active | Remove with legacy write path | `api/_sharedDslImpl.ts` |
| `CAPACITY_CLERK_DSL_WRITE_ROLES` | Active | Replace with `user_access_scopes` | `api/_sharedDslImpl.ts` |
| `VITE_CLERK_DSL_WRITE_ROLES` | Active | Replace with `user_access_scopes` | `clerkDslRoles.ts` |
| `VITE_ALLOWED_USER_EMAILS` | Active | Replace with `user_access_scopes` | `allowedUserEmails.ts` |
| `CAPACITY_ALLOWED_USER_EMAILS` | Active | Replace with `user_access_scopes` | `api/_allowedUserEmails.ts` |
| `CAPACITY_BLOB_ACCESS` | Active | Remove with Blob | `api/_sharedDslImpl.ts` |
| `CAPACITY_ORG_ADMIN_ROLES` | Active | Replace with `user_access_scopes` | `api/_sharedDslImpl.ts` |
| `VITE_CAPACITY_ORG_ADMIN_ROLES` | Active | Replace with `user_access_scopes` | `capacityAccess.ts` |

---

## Unused in Code (env set but never referenced)

| Variable | Status | Notes |
|----------|--------|-------|
| `POSTGRES_DATABASE` | Not referenced | Available for future direct connections |
| `POSTGRES_HOST` | Not referenced | Available for future direct connections |
| `POSTGRES_PASSWORD` | Not referenced | Available for future direct connections |
| `POSTGRES_USER` | Not referenced | Available for future direct connections |
| `STORAGE_UPSTASH_KV_URL` | Not referenced | TCP Redis URL — use REST API instead |
| `STORAGE_UPSTASH_REDIS_URL` | Not referenced | TCP Redis URL — use REST API instead |
| `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Not referenced | Supabase publishable key — not standard |
| `SUPABASE_JWT_SECRET` | Not referenced | Only needed if verifying Supabase JWTs |

---

## Client vs Server Boundary

### Client-Safe (exposed in browser bundle)

Variables exposed to the browser are controlled by `vite.config.ts` `envPrefix` (`VITE_` and `NEXT_PUBLIC_`). Client-safe examples:

- `NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY` — Clerk publishable (canonical on Vercel integration)
- `VITE_CLERK_PUBLISHABLE_KEY` — same key, legacy name only
- `VITE_PUBLIC_SUPABASE_URL` — public endpoint, safe
- `VITE_PUBLIC_SUPABASE_ANON_KEY` — anon key, RLS-protected
- `VITE_SHARED_DSL` — feature flag, safe
- `VITE_AUTH_DISABLED` — feature flag, safe

### Server-Only (never in client bundle)

All other variables. Verified by:
- Vite only bundles `VITE_*` and `NEXT_PUBLIC_*` (per `envPrefix`) into client code
- `process.env.*` references only exist in `api/` (Vercel serverless)
- No shared utility files import server secrets

---

## Clerk Initialisation Points

| Location | Type | Env Var | Notes |
|----------|------|---------|-------|
| `src/main.tsx` | ClerkProvider | `clerkPublishableKey()` | Reads canonical then legacy (see `clerkConfig.ts`) |
| `src/lib/clerkConfig.ts` | Config helper | `NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_AUTH_DISABLED` | Determines if Clerk active |
| `api/lib/env.ts` | `serverEnv().clerkSecretKey` | `CLERK_AUTHENTICATION_CLERK_SECRET_KEY`, `CLERK_SECRET_KEY` | Server JWT verification |
| `api/_sharedDslImpl.ts` | verifyToken | same as `serverEnv()` | Shared DSL + partial-env fallback |

---

## Migration Checklist

1. [x] Audit all env var references in code
2. [x] Server: `api/lib/env.ts` — `CLERK_AUTHENTICATION_CLERK_SECRET_KEY` with fallback to `CLERK_SECRET_KEY`
3. [x] Client: `clerkConfig.ts` / `clientEnv.ts` — `NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY` with fallback to `VITE_CLERK_PUBLISHABLE_KEY`; Vite `envPrefix` includes `NEXT_PUBLIC_`
4. [ ] Add typed env validation (see `src/lib/env.ts` / `api/lib/env.ts`)
5. [ ] Confirm no server secrets leak to client bundle
6. [ ] Document which Vercel Integration auto-provisions which vars
7. [ ] Remove legacy `VITE_CLERK_*` / `CLERK_SECRET_KEY` aliases after migration stabilises
