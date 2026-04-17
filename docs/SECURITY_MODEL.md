# Security Model

## Overview

The capacity planning application implements a defense-in-depth security model
with three enforcement layers: authentication, application-level authorization,
and database-level row security.

## Authentication

All API endpoints (except `/api/health`) require a valid Clerk JWT.

- **Provider**: Clerk (provisioned via Vercel Marketplace integration)
- **Token flow**: Browser → Clerk session → `getToken()` → `Authorization: Bearer <JWT>`
- **Verification**: Server-side `verifyToken()` from `@clerk/backend` validates
  signature and expiry using `CLERK_SECRET_KEY`
- **No secrets in client**: `CLERK_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
  are only accessed in server-side code (`api/lib/env.ts`). Client code uses
  only the Clerk publishable key via Vite env vars.

## Authorization (Application Layer)

After JWT verification, the user's Clerk ID is resolved to an internal scope
via `api/lib/scopeResolver.ts`:

```
Clerk userId → user_access_scopes table → ResolvedUserScope
```

### Roles

| Role | Read | Write | Scope |
|------|------|-------|-------|
| `admin` | All markets | All markets | Global |
| `segment_editor` | Segment markets | Segment markets | Operating model + segment |
| `market_editor` | Single market | Single market | Operating model + segment + market |
| `viewer` | Scoped markets | None | As granted |

### Scope Resolution

- `scopeAllowsMarket(scope, marketId, segmentId, opModelId)` — read access check
- `scopeAllowsMarketEdit(scope, marketId, segmentId, opModelId)` — write access check
- Admin bypasses all scope checks
- Segment editors can access any market in their segment
- Market editors can only access their specific market(s)

## Row-Level Security (Database Layer)

Postgres RLS policies on all fragment tables enforce data scoping using
session variables set by `withUserScope()`:

- `app.user_role` — determines policy branch
- `app.operating_model_id` — scope to operating model
- `app.segment_id` — scope to segment
- `app.market_id` — scope to market

### Policy Structure

Each fragment table has four policies:

1. **`admin_all_*`** — Full CRUD when `app.user_role = 'admin'`
2. **`segment_editor_*`** — Full CRUD within operating model + segment
3. **`market_editor_*`** — Full CRUD within operating model + segment + market
4. **`viewer_read_*`** — SELECT only within scope

### Important Notes

- The service-role Supabase client bypasses RLS (used for build pipeline, seeding)
- RLS is applied on the `authenticated` role
- Session variables are set per-request in `withUserScope()`
- Reference tables (operating_models, segments, markets) allow read by all authenticated users

## API Security Summary

| Endpoint | Auth | Read Scope | Write Scope |
|----------|------|------------|-------------|
| `/api/health` | None | Public | N/A |
| `/api/me` | JWT | Own profile | N/A |
| `/api/markets` | JWT | Filtered by scope | N/A |
| `/api/fragments` | JWT | Filtered by scope | Edit scope check |
| `/api/builds` | JWT | Filtered by scope | Edit scope check |
| `/api/config` | JWT | Filtered by scope | N/A |
| `/api/validate` | JWT | Filtered by scope | Edit scope check |
| `/api/revisions` | JWT | Filtered by scope | N/A |
| `/api/audit` | JWT | Filtered by scope | N/A |
| `/api/import` | JWT | N/A | Edit scope check |
| `/api/shared-dsl` | JWT | Clerk + legacy | Clerk + legacy |

## Data Integrity

- **Optimistic concurrency**: Fragment updates require `expectedVersion` to prevent
  lost updates from concurrent editors
- **Revision tracking**: Every fragment update creates an immutable revision snapshot
- **Audit logging**: All mutations are recorded in `audit_events` with actor, timestamp,
  and change details
- **Immutable artifacts**: Published build artifacts are write-once; new publications
  create new artifact records

## Environment Variables

### Server-only (never in client bundle)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Postgres connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged DB access |
| `CLERK_SECRET_KEY` | JWT verification |
| `UPSTASH_REDIS_REST_URL` | Cache connection |
| `UPSTASH_REDIS_REST_TOKEN` | Cache auth |

### Client-safe (Vite VITE_ prefix)

| Variable | Purpose |
|----------|---------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk frontend auth |
| `VITE_CAPACITY_CLERK_AUTHORIZED_PARTIES` | JWT audience validation |
