# Technical Architecture: Postgres-Driven Config Assembly

**Status:** Implementation plan with concrete artifacts  
**Last updated:** 2026-04-15

---

## 1. System Overview

The capacity planning app is being refactored from a YAML-blob/Vercel-Blob prototype into a Postgres-driven, version-safe system. This document describes the final target architecture and the concrete artifacts produced.

### Architecture Layers

```
Browser (Vite + React SPA)
    │
    ├── Guided authoring forms
    ├── Expert YAML paste mode
    └── Workbench (existing engine)
    │
    ▼
Vercel Serverless Functions (api/)
    │
    ├── Auth: Clerk JWT → internal scope resolution
    ├── Fragment CRUD + revision tracking
    ├── Validation pipeline
    ├── Assembly pipeline (fragments → YAML)
    ├── Build/publish lifecycle
    └── Cache management
    │
    ▼
┌──────────────┐  ┌──────────────┐
│  Supabase    │  │   Upstash    │
│  Postgres    │  │   Redis      │
│  (truth)     │  │   (cache)    │
└──────────────┘  └──────────────┘
```

### Key Constraints
- **Vite SPA** — not Next.js; `VITE_*` for client env, `process.env.*` for server
- **Vercel serverless** — API routes in `api/`, not Next.js API routes
- **Clerk** — identity provider; authorization is internal scope mapping
- **No microservices** — single Vercel deployment

---

## 2. File Map

| Path | Purpose |
|------|---------|
| **Schema & Migrations** | |
| `supabase/migrations/20260408120000_workspace_canonical.sql` | Original workspace migration (kept for history) |
| `supabase/migrations/20260415100000_config_fragments_schema.sql` | Full fragment schema, RLS, audit, builds |
| `supabase/migrations/20260415100001_seed_admin_user.sql` | Dev admin user seed |
| **Domain Types** | |
| `server/lib/domainTypes.ts` | Canonical domain types for fragments, builds, artifacts |
| `src/engine/types.ts` | Existing engine types (unchanged — assembly targets these) |
| **Auth & Env** | |
| `server/lib/env.ts` | Server-side typed env validation |
| `src/lib/clientEnv.ts` | Client-side typed env validation |
| `server/lib/scopeResolver.ts` | Clerk identity → internal scope resolution |
| `server/lib/supabaseClient.ts` | Server-side Supabase client + RLS scope injection |
| **Services** | |
| `server/services/fragmentService.ts` | Fragment CRUD with optimistic concurrency + revisions |
| `server/services/assemblyPipeline.ts` | Deterministic YAML assembly from fragments |
| `server/services/cacheService.ts` | Upstash Redis cache with scope-aware keys |
| `server/services/validationService.ts` | Fragment, cross-fragment, and artifact validation |
| `server/services/yamlImportService.ts` | YAML decomposition into fragments (migration + expert mode) |
| **Documentation** | |
| `docs/REFACTOR_ARCHITECTURE.md` | High-level refactor plan and domain model |
| `docs/ENV_CONTRACT.md` | Canonical environment variable contract |
| `docs/TECHNICAL_ARCHITECTURE.md` | This document |

---

## 3. Data Model

### Organisational Hierarchy

```
operating_models
  ├── operated_markets
  │    ├── LIOM (Large International Operated Markets: AU, UK, DE, CA, FR, IT, ES, PL)
  │    ├── IOM (International Operated Markets: CH, AT, NL, BE, PT, CZ, SK, SL, UA)
  │    └── (future segments: US, etc.)
  └── licensed_markets
       └── (future segments and markets)
```

Both LIOM and IOM are segments within `operated_markets`. The `licensed_markets` operating model is provisioned for future franchise/licensing markets that differ materially in contract structure and planning rules.

### Fragment Tables

Each market's configuration is decomposed into typed fragments:

| Fragment Table | YAML Source | Storage Pattern |
|---------------|-------------|-----------------|
| `market_configs` | `market`, `title`, `holidays`, `stress_correlations` | Relational + jsonb |
| `resource_configs` | `resources` | Relational + jsonb |
| `bau_configs` | `bau` | Relational + jsonb |
| `campaign_configs` | `campaigns[]` | One row per campaign |
| `tech_programme_configs` | `tech_programmes[]` | One row per programme |
| `holiday_calendars` + `holiday_entries` | `public_holidays`, `school_holidays` | Parent/child |
| `national_leave_band_configs` | `national_leave_bands[]` | One row per band |
| `trading_configs` | `trading` | Relational + jsonb |
| `deployment_risk_configs` | `deployment_risk_*` | Relational + jsonb |
| `operating_window_configs` | `operating_windows[]` | One row per window |

### Scope Columns

Every scoped table carries:
- `operating_model_id` — top-level business context
- `segment_id` — business segment
- `market_id` — individual country market

This is intentionally denormalised for:
- Simple RLS policies (direct column comparison)
- Easy filtering and auditing
- Cache key construction
- Infosec review clarity

### Version Chain

```
Fragment (e.g. UK campaign "Spring value meal")
  └── version_number: 1, 2, 3, ...
       └── config_revisions (immutable snapshots)

Build (assembly event combining specific revisions)
  └── config_build_components (which revisions contributed)
       └── config_artifacts (generated YAML + checksum)
            └── Status: draft → generated → validated → published
```

---

## 4. Auth Architecture

### Identity Flow

```
1. User signs in via Clerk (React SDK)
2. Client gets session JWT with `sub` (Clerk user ID)
3. Client sends JWT in Authorization header to API
4. Server verifies JWT using CLERK_AUTHENTICATION_CLERK_SECRET_KEY
5. Server looks up user_access_scopes for that clerk_user_id
6. Server merges scope records into ResolvedUserScope
7. Scope injected as Postgres session vars for RLS
8. All subsequent queries respect RLS policies
```

### Env Migration

| Old | New | Status |
|-----|-----|--------|
| `CLERK_SECRET_KEY` | `CLERK_AUTHENTICATION_CLERK_SECRET_KEY` | Fallback chain in `server/lib/env.ts` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Keep (Vite needs `VITE_*` prefix) | Active |
| `NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY` | Ignored by Vite | Vercel-provisioned |

### RLS Policies

Policies use session variables set by trusted server code:

```sql
-- Admin: full access
USING (current_setting('app.user_role', true) = 'admin')

-- Segment editor: scoped to their segment
USING (
  current_setting('app.user_role', true) = 'segment_editor'
  AND operating_model_id = current_setting('app.operating_model_id', true)
  AND segment_id = current_setting('app.segment_id', true)
)

-- Market editor: scoped to their market
USING (
  current_setting('app.user_role', true) = 'market_editor'
  AND market_id = current_setting('app.market_id', true)
)
```

---

## 5. Assembly Pipeline

### Flow

```
loadMarketFragments(marketId)
  → All active fragments for the market
  → assembleMarketYamlObject(fragments)
       → Plain JS object matching existing YAML schema
  → toYamlText(object)
       → Deterministic YAML with sorted keys
  → sha256(yamlText)
       → Checksum for reproducibility verification
  → Persist: config_builds + config_build_components + config_artifacts
  → Cache: update Upstash with active artifact
```

### Determinism Guarantee

Given identical fragment revision IDs, the assembler produces byte-identical YAML:
- Keys sorted by predefined section order, then alphabetically
- Arrays sorted by name + start_date
- Dates always quoted (`'YYYY-MM-DD'`)
- SHA-256 checksum stored with every artifact

### Published Artifact Immutability

Published artifacts cannot be modified. To change:
1. Edit source fragment(s)
2. Create new revision(s)
3. Trigger new build
4. Validate
5. Publish (supersedes previous)

---

## 6. Cache Strategy

### Keys

```
config:mkt:{marketId}:active          → Published YAML for a market
config:build:{buildId}:artifact       → Build-specific artifact
config:build:{buildId}:meta           → Build metadata
readmodel:om:{opModelId}:mkt:{mktId}:summary → Pre-computed summary
```

### Behaviour
- **Write-through on publish**: When a build is published, the cache is updated
- **Invalidation on edit**: When fragments change, market cache is invalidated
- **Cache miss**: Falls back to Postgres query + warms cache
- **TTL**: 1-hour safety net; explicit invalidation is primary
- **Server-only**: Browser never contacts Redis directly

---

## 7. Authoring UX Model

### Two Surfaces, One Backend

Both guided mode and expert mode produce the same result:

```
┌─────────────────┐     ┌─────────────────┐
│  Guided Forms   │     │  Expert YAML    │
│  (structured)   │     │  (paste/patch)  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
    ┌─────────────────────────────────┐
    │  Canonical Fragment Objects     │
    │  (validation → revision → save) │
    └─────────────┬───────────────────┘
                  │
                  ▼
    ┌─────────────────────────────────┐
    │  Assembly Pipeline              │
    │  (fragments → YAML → artifact)  │
    └─────────────────────────────────┘
```

### Guided Mode
- Clean forms with defaults and inline validation
- Scoped editing per market/segment/admin permissions
- Preview before publish
- Low cognitive load for normal users

### Expert Mode
- Paste YAML fragments for bulk changes
- `yamlImportService` decomposes input into canonical fragments
- Shows what will change before commit
- Validates before save — no governance bypass
- Audit trail of what was pasted and what changes resulted

### Per-Domain Edit Surfaces

Each major authoring domain (campaigns, BAU, holidays, etc.) supports:
1. **Quick editor** — scan and make small changes rapidly
2. **Structured detail editor** — guided editing with explicit controls
3. **Expert patch editor** — fast bulk changes via YAML paste

---

## 8. Security Posture

### Principles
- Least privilege, deny by default
- No service-role from browser code
- No server secrets in client bundle
- Immutable published artifacts
- Full audit trail
- No cache-based permission shortcuts
- Low blast radius for compromised accounts

### Audit Coverage

| Event | Logged |
|-------|--------|
| Fragment create/update/archive | Yes |
| Build generate/validate/publish/fail | Yes |
| Artifact publish/supersede | Yes |
| Import start/complete/fail | Yes |
| Validation failure | Yes |
| User scope change | Yes |
| Admin config change | Yes |
| Rollback trigger | Yes |

### Security Test Matrix

| Test Case | Expected |
|-----------|----------|
| Market user reads another market's rows | Denied by RLS |
| Market user edits another market's rows | Denied by RLS |
| Segment user reads/writes within segment | Allowed |
| Segment user accesses another segment | Denied by RLS |
| Admin accesses everything | Allowed |
| Cache reads don't leak cross-scope | Keys are scope-specific |
| Stale edits can't overwrite newer revisions | Optimistic concurrency |
| Published artifacts can't be modified | No update policy on published |
| Service-role not used client-side | Env validation enforces |
| Legacy auth paths don't remain active | Env cleanup + feature flags |

---

## 9. Transition Strategy

### Dual-Mode Operation

During migration, a feature flag controls the read path:

```
CAPACITY_CONFIG_SOURCE=blob    → Read from Vercel Blob (legacy)
CAPACITY_CONFIG_SOURCE=postgres → Read from Postgres-assembled artifacts
```

### Migration Steps

1. **Seed Postgres**: Run `yamlImportService` to decompose all 17 market YAML files into fragments
2. **Verify**: Build each market, compare assembled YAML with original (checksum)
3. **Switch read path**: Set `CAPACITY_CONFIG_SOURCE=postgres`
4. **Disable Blob writes**: Set `CAPACITY_DISABLE_LEGACY_SHARED_DSL_WRITE=1` (already done)
5. **Remove Blob read**: After stabilisation, remove Blob fallback code

### Rollback

At any point, `CAPACITY_CONFIG_SOURCE=blob` restores original behaviour. No data is deleted from Blob during migration.

---

## 10. Implementation Phases

| Phase | Description | Dependencies | Status |
|-------|-------------|-------------|--------|
| 1 | Auth & env cleanup | — | Artifacts created |
| 2 | Domain discovery & YAML mapping | — | Complete (in docs) |
| 3 | Schema design & migrations | — | Migration created |
| 4 | Internal authorization model | Phase 1 | Scope resolver created |
| 5 | Fragment persistence layer | Phase 3 | Fragment service created |
| 6 | Assembly pipeline | Phase 5 | Pipeline created |
| 7 | Cache integration | Phase 6 | Cache service created |
| 8 | Admin refactor | Phase 5 | Design documented |
| 9 | RLS & security hardening | Phase 3, 4 | Policies in migration |
| 10 | UX & expert authoring | Phase 5, 8 | Design documented |
| 11 | Legacy deprecation | Phase 6, 7 | Strategy documented |

---

## 11. Admin Refactor Direction

### Current State
- Admin edits YAML in a Monaco editor
- Changes saved as monolithic YAML blob to Vercel Blob
- No structured editing, no validation, no revision history

### Target State
- Admin edits individual config fragments through structured forms
- Each fragment has its own validation, revision history, and audit trail
- Builds are triggered explicitly; artifacts are immutable
- Expert mode allows YAML paste that decomposes into fragments

### Recommended Admin Views

| View | Purpose |
|------|---------|
| Market overview | All markets with status indicators |
| Market detail | All fragment types for one market |
| Campaign manager | List/add/edit campaigns with timeline |
| Holiday calendar | Manage public/school holidays |
| Resource config | Labs, staff, monthly patterns |
| Trading config | Weekly/monthly patterns, seasonal |
| Build history | All builds with status, components, artifacts |
| Revision browser | Per-fragment version history with diffs |
| Validation dashboard | Outstanding issues across markets |
| User management | Scope assignments for team members |

---

## 12. Performance Expectations

| Operation | Target | Strategy |
|-----------|--------|----------|
| Page load (workbench) | < 2s | Cache active artifact in Redis |
| Fragment save | < 500ms | Direct Postgres write |
| Build generation | < 3s per market | Server-side assembly |
| Cache hit read | < 50ms | Upstash REST API |
| Cache miss read | < 500ms | Postgres query + cache warm |
| Multi-market bundle | < 5s | Parallel cache reads |

---

## 13. Dependencies

### Required Packages (to add)

| Package | Purpose |
|---------|---------|
| `@supabase/supabase-js` | Postgres client for server-side operations |
| `js-yaml` | Already present — YAML parsing for import service |

### Existing Packages (unchanged)

| Package | Purpose |
|---------|---------|
| `@clerk/react` | Client-side auth |
| `@clerk/backend` | Server-side JWT verification |
| `@vercel/blob` | Legacy storage (phasing out) |
| `js-yaml` | YAML parsing |
| `zustand` | Client state management |
