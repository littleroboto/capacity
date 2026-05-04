# Canonical workspace: Supabase + Redis (Clerk auth)

This doc describes how **Postgres (Supabase)** becomes the **system of record** for per-market workspace YAML, how **Redis** keeps reads snappy for large bundles, and how **Clerk** stays the **only** sign-in — matching today’s `cap_admin` / `cap_segs` / `cap_mkts` / `cap_ed` model ([AUTH_PROVIDER.md](./AUTH_PROVIDER.md), [CLERK_CAPACITY_ORG_SETUP.md](./CLERK_CAPACITY_ORG_SETUP.md)).

## Pragmatic pilot stack (internal, ~50–500 seats, light daily use)

For a **non–mass-market**, **internal** app with **hundreds** of possible users and **modest** concurrency (not everyone live-editing at once):

| Layer | Pragmatic choice | Why |
|--------|------------------|-----|
| **System of record** | **Supabase = Postgres** | Blob does not give you **per-market rows**, **transactions**, **version history**, **org-scoped tenancy**, or **audit** without hacks. Postgres is the **smallest jump** that matches [Entity model](#entity-model) below. Supabase is convenient (dashboard, migrations, Vercel Marketplace); **Neon** or any **managed Postgres** is fine if you prefer — same schema. |
| **Cache** | **Upstash Redis** (or **Vercel KV**) — **optional at first** | At pilot scale, **Postgres-only** reads may be **enough**. Add **HTTP Redis** when merged **bundle** `GET`s or cold queries show up in metrics. Pattern below stays the same. |
| **Auth** | **Clerk only** (keep) | Do **not** add Supabase Auth for users; server verifies JWT and uses **service role** to Postgres — already aligned with this doc. |
| **Realtime / Yjs** | **Not required** for pilot | Pull + optimistic lock + (later) revision list matches **low** simultaneous editor count; skip until product demands it. |

**Bottom line:** **Supabase Postgres** (or equivalent managed Postgres) is the **one** backend you **must** add to graduate from Blob; **Upstash** is **nice-to-have** acceleration, not a second source of truth. Cost and ops stay **small** at this footprint; complexity stays **bounded** if you avoid running **two** competing databases for YAML (e.g. don’t try to make Redis canonical).

## Why not Supabase Auth?

Session handling remains **Clerk**. Vercel serverless verifies the session JWT (`CLERK_SECRET_KEY` + `verifyToken`), resolves **allowed market ids** the same way as `server/impl/_sharedDslImpl.ts` and `src/lib/capacityAccess.ts`, then talks to Postgres with the **service role** (or a dedicated DB user limited to `SELECT/INSERT/UPDATE` on these tables). **Do not** expose the service role to the browser.

`segment_markets` in the database is a **reference** for migrations and CI alignment with `public/data/segments.json`; **authorization** still uses JWT claims at runtime, not a join to `segment_markets` for user identity.

## Entity model

| Concept | Storage |
|--------|---------|
| Tenant | `workspaces` — one row per **Clerk organization** (`clerk_organization_id` = `org_…` from the active org in the JWT). |
| Scenario YAML | `market_documents` — one row per `(workspace_id, market_id)` with `yaml_body` + `version` (optimistic lock). |
| Bundle invalidation | `workspaces.revision` — incremented by trigger on any change to `market_documents`; drives Redis keys so you avoid `KEYS`/`SCAN` on every write. |
| Audit (optional) | `market_document_revisions` — append-only snapshots when you implement “save revision” in the API. |

**Segment admins (LIOM / IOM):** JWT has `cap_segs` including `LIOM` and/or `IOM`, no `cap_mkts` narrowing (or empty) → server allows **all markets in that segment** (same set as today’s `SEGMENT_TO_MARKETS`).

**Market members:** JWT has `cap_segs` + `cap_mkts` (or only `cap_mkts`) → server **intersects** to **one** (or listed) markets → `GET` returns only those documents; `PUT` **merges** only allowed `market_id` rows and rejects unknown ids.

**Platform admin:** `cap_admin` or org role in `CAPACITY_ORG_ADMIN_ROLES` → full manifest for that workspace (or all markets you choose to support in product policy).

## Read path (snappy)

1. Client calls **`GET /api/workspace/bundle`** (or similar) with `Authorization: Bearer <Clerk JWT>`.
2. Server resolves `org_id` from JWT, loads `workspaces` by `clerk_organization_id` (insert row on first touch if product allows).
3. Read **`workspaces.revision`** (cheap).
4. **Redis:** `GET cap:v1:bundle:{workspace_uuid}:{revision}`  
   - **Hit:** return cached body immediately (large multi-doc YAML or pre-merged JSON).  
   - **Miss:** `SELECT market_id, yaml_body, version FROM market_documents WHERE workspace_id = $1 ORDER BY ...`, merge in **manifest order** (same as app’s multi-doc rules), optionally **compress** (e.g. gzip) before `SETEX`, return to client.
5. TTL: **60–300s** is typical; correctness does not depend on TTL because the key includes `revision` — after any write, revision bumps and old keys become unused.

**Per-market hot cache** (optional, for scoped editors or lazy loading):

- Key: `cap:v1:doc:{workspace_uuid}:{market_id}`  
- Store `{ yaml_body, version, revision_at_fetch }` — on PUT success, you can `DEL` that key **or** rely only on bundle revision (simpler: **only bundle key** until you need partial loads).

## Write path (version-safe)

1. Client sends **PUT** with body containing one or more markets (multi-doc YAML or JSON), plus optional **`If-Match`** / per-doc `expected_version` (mirror today’s Blob etag behaviour).
2. Server verifies Clerk JWT, computes **allowed `market_id` set**; reject any document outside the set with **403**.
3. For each allowed market, **`UPDATE market_documents SET yaml_body = $1, version = version + 1, ... WHERE workspace_id = $2 AND market_id = $3 AND version = $4`**; if `rowcount = 0`, return **409** (conflict).
4. Trigger bumps **`workspaces.revision`** → new bundle cache key on next read.
5. Optionally insert into **`market_document_revisions`** for history.

**Transactions:** wrap multi-market PUT in a **single transaction** so you do not bump revision twice or leave a half-updated bundle.

## Redis on Vercel

Common choices:

- **[Upstash Redis](https://upstash.com/)** — HTTP REST client, no open TCP from Fluid/serverless issues; set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
- **Vercel KV** — Redis-compatible, same invalidation pattern.

Env vars (see [.env.example](../.env.example)):

- `SUPABASE_URL` — project URL  
- `SUPABASE_SERVICE_ROLE_KEY` — server only  
- `DATABASE_URL` — optional direct Postgres URL for `pg` / Drizzle if you bypass PostgREST  
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or Vercel KV equivalents)

## Large payloads

- Prefer **server-side merge** once per request, one Redis **SET** for the bundle.  
- If responses exceed comfortable JSON size, return **gzip** `Content-Encoding` or a **signed short-lived URL** to Blob for the bundle (optional hybrid) — only if profiling shows API CPU/network as a bottleneck.  
- Pipeline heatmaps stay client-side; the “large datapoints” cost here is usually **YAML size × markets**, which caching addresses.

## Migrations

SQL lives in `supabase/migrations/`. Apply via [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase db push` / linked project) or paste into the SQL editor.

When **segments or markets** change, update:

1. `public/data/segments.json`  
2. `api/_capacityWorkspaceAcl.data.ts` (and `scripts/sync-api-workspace-acl.mjs` if you use it)  
3. **New migration** inserting into `segment_markets` (or treat `segment_markets` as documentation-only and stop inserting — but then CI cannot assert parity).

## Related backlog

- [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) — **`epic-canonical-workspace-postgres`**, **`epic-workspace-bundle-cache`**, plus **`epic-auth-org`**, **`epic-market-acl`**, **`epic-versioning`**, **`epic-shared-dsl-hardening`**.
