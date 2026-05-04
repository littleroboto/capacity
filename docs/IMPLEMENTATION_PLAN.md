# Implementation Plan

Step-by-step build order. Each step produces a testable result.
Steps are small enough to complete in a single session unless noted.

**Convention:** `[artifact]` = file already written in the design phase.
Steps marked **manual** need you to do something in a browser/dashboard.
Everything else is code work.

**Paths:** Steps below name `server/lib/*` and `server/services/*` for server code (historical drafts said `api/_lib` / `api/_services`). Handlers are bundled from `server/` into `server-bundles/*.cjs` and invoked via `api/app.js`.

---

## Step 1 — Install dependencies

Add `@supabase/supabase-js` to the project. It is used by every server-side
service and must be importable from `api/`.

```
pnpm add @supabase/supabase-js
```

**Done when:** `import { createClient } from '@supabase/supabase-js'` resolves
in `server/lib/supabaseClient.ts` without errors.

---

## Step 2 — Run the schema migration

Apply the fragment schema to the live Supabase project.

```
supabase db push
```

or apply via the Supabase dashboard SQL editor by pasting
`supabase/migrations/20260415100000_config_fragments_schema.sql` followed by
`supabase/migrations/20260415100001_seed_admin_user.sql`.

**Done when:** `operating_models`, `segments`, `markets`,
`user_access_scopes`, `resource_configs`, `campaign_configs`, …
all exist in the database with seed rows (17 markets, 2 segments,
2 operating models, 1 admin scope row).

---

## Step 3 — Wire the server env loader

Update `server/impl/_sharedDslImpl.ts` to use `[server/lib/env.ts]` for the Clerk
secret key so the new Vercel-integrated key is preferred with a fallback
to the old one.

Concrete change: replace the two raw `process.env.CLERK_SECRET_KEY` reads
in `_sharedDslImpl.ts` with `serverEnv().clerkSecretKey`.

**Done when:** the existing `/api/shared-dsl` endpoint still works
(GET, HEAD, PUT) using either the old or new Clerk secret key
from `.env.local`.

---

## Step 4 — Wire the Supabase client

Make `[server/lib/supabaseClient.ts]` importable from the API bundle.

1. Verify `supabaseClient.ts` compiles in the CJS bundle context
   (`api/package.json` is `"type": "commonjs"`).
2. Add a trivial health-check route — `api/health.ts` — that calls
   `supabaseServiceClient()` and returns the count of rows in `markets`.
3. Deploy or `vercel dev` and hit `/api/health`.

**Done when:** `/api/health` returns `{ ok: true, marketCount: 17 }`.

---

## Step 5 — Wire the scope resolver

Connect Clerk identity to the internal scope model.

1. Add a route `api/me.ts` that:
   - verifies the Clerk JWT (reuse logic from `_sharedDslImpl.ts`)
   - calls `resolveUserScope(clerkUserId, email)` from
     `[server/lib/scopeResolver.ts]`
   - returns the `ResolvedUserScope` as JSON
2. Update the `user_access_scopes` seed row for your dev admin:
   after you sign in via Clerk on the local dev app, grab your
   actual Clerk `user_id` (from the `/api/me` response or
   Clerk dashboard) and update the seed row's `clerk_user_id`.

**Done when:** hitting `/api/me` with a valid Clerk session returns
`{ isAdmin: true, ... }`.

---

## Step 6 — Seed the fragment tables from existing YAML

Write a one-shot migration script that reads each of the 17 YAML files
from `public/data/markets/`, parses them with `js-yaml`, and calls
`importMarketYamlObject()` from `[server/services/yamlImportService.ts]`
for each one.

Location: `scripts/seed-fragments.ts` (run with `tsx` or `ts-node`).

Needs:
- A lookup from market id → segment id (use `segments.json`)
- All markets are `operated_markets` operating model
- Actor = `system_seed`

**Done when:** every fragment table has rows for all 17 markets.
Spot-check: `campaign_configs` should have ≈ 8 rows for UK
(4 campaigns × 2 years).

---

## Step 7 — Verify the assembly round-trip

For each market, run `buildMarket(marketId, 'system_verify')` from
`[server/services/assemblyPipeline.ts]` and compare the generated YAML
against the original file content.

Write this as `scripts/verify-assembly.ts`.

The YAML won't be byte-identical (key order, quoting, whitespace may
differ) so comparison should parse both with `js-yaml` and deep-compare
the resulting objects, or use a structural diff.

**Done when:** all 17 markets produce structurally equivalent YAML
from their Postgres fragments. Log any diffs for review. Fix the
assembler if any field is dropped or mis-mapped.

---

## Step 8 — Fragment CRUD API routes

Expose the fragment service over HTTP so the future admin UI has
something to talk to.

Create `api/fragments.ts` — a single Vercel serverless function
that dispatches by query param:

```
GET    /api/fragments?table=campaign_configs&market=UK
GET    /api/fragments?table=campaign_configs&id=<uuid>
POST   /api/fragments?table=campaign_configs          (body = fragment JSON)
PUT    /api/fragments?table=campaign_configs&id=<uuid> (body = partial + expectedVersion)
DELETE /api/fragments?table=campaign_configs&id=<uuid>&expectedVersion=N
```

All routes:
- verify Clerk JWT
- resolve user scope
- check `scopeAllowsMarketEdit` for writes
- delegate to `[server/services/fragmentService.ts]`
- return JSON

Add `vercel.json` rewrite for `/api/fragments`.

**Done when:** you can `curl` a GET that returns UK campaigns and a
PUT that increments the version number. Verify a second PUT with the
old version number returns 409.

---

## Step 9 — Build + publish API routes

Create `api/builds.ts`:

```
POST /api/builds?market=UK        → buildMarket(marketId, actorId)
POST /api/builds/publish?id=<uuid> → publishBuild(buildId, actorId)
GET  /api/builds?market=UK         → list builds for market
GET  /api/builds/artifact?id=<uuid> → return artifact YAML text
```

Add `vercel.json` rewrites.

**Done when:** POST to `/api/builds?market=UK` creates a build row,
artifact row, and returns the build status and artifact checksum.
POST to `/api/builds/publish` moves the build to `published` and
supersedes any previous published artifact.

---

## Step 10 — Cache integration

Wire `[server/services/cacheService.ts]` into the publish flow.

1. After `publishBuild` succeeds, call `cachePublishedArtifact`.
2. After a fragment update succeeds, call `invalidateMarketCache`.
3. Create `api/config.ts`:
   ```
   GET /api/config?market=UK → getActiveArtifact(marketId)
   ```
   This is the new read path — serves published YAML from cache
   (with Postgres fallback).

**Done when:** `/api/config?market=UK` returns the published YAML.
Subsequent calls hit cache (check Upstash dashboard for key).
After a fragment edit + rebuild + publish, the cache is refreshed.

---

## Step 11 — Feature-flag the read path

Add `CAPACITY_CONFIG_SOURCE` env var support to the existing
`/api/shared-dsl` GET handler and to the client-side
`sharedDslSync.ts`.

When `CAPACITY_CONFIG_SOURCE=postgres`:
- `/api/shared-dsl` GET reads from `getMultiMarketBundle`
  instead of Vercel Blob
- Filtered by the user's allowed markets (same ACL as today)

When `blob` (default): existing behaviour unchanged.

**Done when:** setting `CAPACITY_CONFIG_SOURCE=postgres` in
`.env.local` makes the workbench load market data from Postgres
fragments. Setting it back to `blob` restores the old path.
Both work.

---

## Step 12 — Validation API

Create `api/validate.ts`:

```
POST /api/validate?market=UK → validateMarketFragments(fragments)
GET  /api/validate/results?market=UK → recent validation results
```

Wire fragment-level validation into the fragment CRUD route
(Step 8): validate on create/update and persist issues to
`validation_results`.

**Done when:** saving a campaign with `promo_weight: 5.0` returns
a validation error. GET results returns persisted issues.

---

## Step 13 — Revision history API

Create `api/revisions.ts`:

```
GET /api/revisions?table=campaign_configs&id=<uuid>
GET /api/revisions/snapshot?id=<revisionId>
```

**Done when:** after editing a campaign twice, the revision
endpoint returns two snapshots with different version numbers.

---

## Step 14 — Audit log API

Create `api/audit.ts`:

```
GET /api/audit?market=UK&limit=50
GET /api/audit?type=build_published&limit=20
```

Scoped by the user's resolved scope (admin sees all, market
editor sees their market only).

**Done when:** the audit endpoint returns events for fragment
creates, updates, builds, and publishes performed in earlier steps.

---

## Step 15 — Admin UI: market overview page

Add a new route in the React SPA: `/admin`.

Page 1: **Market overview** — table of all markets the user can
access, showing:
- market id, label, segment
- fragment count
- last build date + status
- last published date
- outstanding validation errors/warnings

Data comes from the APIs built in steps 8–14.

**Done when:** `/admin` renders a table with all 17 markets.

---

## Step 16 — Admin UI: market detail + fragment editors

Add `/admin/market/:id` — tabbed view per fragment type.

Start with **campaigns** (highest value, most rows):
- List view with inline quick-edit (name, dates, weight)
- Detail form for full editing
- Save calls PUT `/api/fragments`
- Show validation errors inline
- Show revision count

Then repeat the pattern for remaining fragment types in priority
order: resources → BAU → trading → holidays → national leave bands →
deployment risk → tech programmes → operating windows.

**Done when:** you can edit a UK campaign in the admin UI, save it,
see the new version number, and confirm the revision was recorded.

---

## Step 17 — Admin UI: build + publish controls

Add to the market detail page:
- "Build" button → POST `/api/builds?market=UK`
- Build status display
- "Publish" button (enabled when build status = validated)
- Published artifact preview (YAML viewer)
- Build history list

**Done when:** you can edit a campaign, build, publish, and see
the workbench load the new data (with `CAPACITY_CONFIG_SOURCE=postgres`).

---

## Step 18 — Expert mode: YAML paste editor

Add a tab or modal in the market detail page:
- Monaco editor pre-loaded with current market's assembled YAML
- "Preview changes" button → diff view showing what fragments
  will be created/updated
- "Apply" button → decomposes pasted YAML via `yamlImportService`
  logic, validates, creates/updates fragments
- Clear audit trail of what was pasted

**Done when:** pasting a modified campaign block in the editor,
clicking preview, then apply, creates a new campaign fragment
revision visible in the guided editor.

---

## Step 19 — RLS smoke tests

Write a test script (`scripts/test-rls.ts`) that:

1. Sets `app.user_role = 'market_editor'`,
   `app.market_id = 'UK'`, `app.segment_id = 'LIOM'`,
   `app.operating_model_id = 'operated_markets'`
2. Queries `campaign_configs` — should return only UK rows
3. Tries to insert a row for `market_id = 'DE'` — should fail
4. Resets to `app.user_role = 'admin'`
5. Queries `campaign_configs` — should return all rows

Run via `tsx scripts/test-rls.ts`.

**Done when:** all assertions pass. Document results.

---

## Step 20 — Legacy cleanup

1. Remove the `CAPACITY_CONFIG_SOURCE=blob` fallback code path
   from `/api/shared-dsl` and `sharedDslSync.ts`.
2. Mark `BLOB_READ_WRITE_TOKEN`, `CAPACITY_SHARED_DSL_SECRET`,
   and related vars as deprecated in `.env.example`.
3. Update README to reflect the new architecture.
4. Remove the now-unused `server/impl/_sharedDslImpl.ts` blob logic
   (keep the Clerk auth bits that were extracted into `env.ts`
   and `scopeResolver.ts`).

**Done when:** the app runs entirely on Postgres-backed fragments
with no Blob dependency. `vercel deploy --prod` succeeds.

---

## Dependency graph

```
 1  Install deps
 │
 2  Run migration
 │
 3  Wire env loader ─────────────────────┐
 │                                       │
 4  Wire Supabase client                 │
 │                                       │
 5  Wire scope resolver                  │
 │                                       │
 6  Seed fragments from YAML             │
 │                                       │
 7  Verify assembly round-trip           │
 │                                       │
 8  Fragment CRUD API ───────┐           │
 │                           │           │
 9  Build + publish API      │           │
 │                           │           │
10  Cache integration        │           │
 │                           │           │
11  Feature-flag read path ──┤───────────┘
 │                           │
12  Validation API           │
 │                           │
13  Revision history API     │
 │                           │
14  Audit log API            │
 │                           │
15  Admin UI: overview ──────┘
 │
16  Admin UI: fragment editors
 │
17  Admin UI: build + publish
 │
18  Expert mode
 │
19  RLS smoke tests
 │
20  Legacy cleanup
```

Steps 1–7 are foundation. Steps 8–14 are the API surface.
Steps 15–18 are UI. Steps 19–20 are hardening and cleanup.

Steps 1–11 get you to a working Postgres-backed app with
the old UI still functioning. Steps 12–14 add governance.
Steps 15–18 replace the Monaco YAML editor with structured
editing. Step 19 proves the security model. Step 20 retires
the prototype plumbing.
