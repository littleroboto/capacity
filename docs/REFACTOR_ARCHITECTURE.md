# Refactor Architecture: Postgres-Driven Config Assembly

**Status:** Implementation plan — Phase 1 active  
**Last updated:** 2026-04-15

---

## 1. Executive Summary

This refactor transitions the capacity planning app from a YAML-blob / Vercel-Blob prototype into a Postgres-driven, version-safe, enterprise-grade system where:

- **Postgres** is the canonical source of truth for all editable configuration
- **YAML** is a generated, versioned, immutable artifact
- **Upstash Redis** is a read-optimised cache — never authoritative
- **Clerk** (Vercel-integrated) provides identity; internal scope mapping provides authorization
- **RLS** enforces simple, auditable row-level access

The system supports concurrent editing, deterministic rebuilds, full audit trails, and dual-mode authoring (guided + expert).

---

## 2. Current State Analysis

### Framework
- **Vite 6 + React 18 SPA** (not Next.js)
- Single Vercel serverless function (`/api/shared-dsl`) for team workspace
- Static market YAML files under `public/data/markets/`
- Client-side engine processes YAML into capacity models

### Auth (current)
- Clerk React (`@clerk/react`) on client — keyed by `VITE_CLERK_PUBLISHABLE_KEY`
- Clerk Backend (`@clerk/backend`) on server — keyed by `CLERK_SECRET_KEY`
- JWT claims (`cap_admin`, `cap_segs`, `cap_mkts`, `cap_ed`) drive workspace ACL
- Legacy shared secret (`CAPACITY_SHARED_DSL_SECRET`) still active but disableable

### Storage (current)
- **Vercel Blob** stores one monolithic `workspace.yaml`
- Per-market YAML split/merge happens at the API layer
- Optimistic concurrency via Blob `ifMatch` (etag)

### Database (current)
- Supabase Postgres provisioned; migration exists but **not wired** into app
- Existing migration: `workspaces`, `market_documents`, `market_document_revisions`, `segment_markets`

### Cache (current)
- Upstash Redis provisioned; **not used** in application code

---

## 3. Target Architecture

### Four-Layer Model

```
┌──────────────────────────────────────────────────────┐
│  Layer 4: Read-Optimised Cache (Upstash Redis)       │
│  - Active assembled artifacts                        │
│  - Selected read models                              │
│  - Scope-aware cache keys                            │
│  - Explicit invalidation                             │
├──────────────────────────────────────────────────────┤
│  Layer 3: Assembly / Build Pipeline                  │
│  - Deterministic YAML generation from fragments      │
│  - Build provenance (component → revision → artifact)│
│  - Validation (fragment + cross-fragment + artifact)  │
│  - Status: draft → generated → validated → published │
├──────────────────────────────────────────────────────┤
│  Layer 2: Revision / Version Layer                   │
│  - Immutable revision records per fragment            │
│  - Optimistic concurrency (version_number)           │
│  - Audit trail (created_by, updated_by)              │
├──────────────────────────────────────────────────────┤
│  Layer 1: Canonical Fragment Layer (Postgres)        │
│  - Scoped structured objects (not blobs)             │
│  - operating_model → segment → market hierarchy      │
│  - Direct scope columns for RLS/filtering            │
│  - Fragment types: resources, BAU, campaigns, etc.   │
└──────────────────────────────────────────────────────┘
```

### Business Context Boundary

Two first-class operating contexts, not cosmetic labels:

| Operating Model | Description |
|----------------|-------------|
| `operated_markets` | Markets under direct operational control |
| `licensed_markets` | Markets under licensing/franchise model |

Currently all 17 markets sit under `operated_markets`, split across two segments:

| Segment | Full Name | Operating Model | Markets |
|---------|-----------|----------------|---------|
| `LIOM` | Large International Operated Markets | `operated_markets` | AU, UK, DE, CA, FR, IT, ES, PL |
| `IOM` | International Operated Markets | `operated_markets` | CH, AT, NL, BE, PT, CZ, SK, SL, UA |

Future segments (e.g. `US`) can be added under either operating model. The `licensed_markets` operating model exists to support markets that may be onboarded under a franchise/licensing structure — materially different in contract terms, validation rules, config patterns, and planning interpretation.

These are not cosmetic labels. The operating model boundary is foundational in the data model.

---

## 4. Domain Model

### Organisational Scope

```
operating_models
  ├── operated_markets
  │    ├── LIOM (Large International Operated Markets)
  │    │    └── AU, UK, DE, CA, FR, IT, ES, PL
  │    ├── IOM (International Operated Markets)
  │    │    └── CH, AT, NL, BE, PT, CZ, SK, SL, UA
  │    └── (future: US, etc.)
  └── licensed_markets
       └── (future segments and markets)
```

### Entity Map

| Category | Entity | Storage | Versioned |
|----------|--------|---------|-----------|
| Scope | `operating_models` | relational | no |
| Scope | `segments` | relational | no |
| Scope | `markets` | relational | no |
| Config | `market_configs` | relational + jsonb | yes |
| Config | `resource_configs` | relational + jsonb | yes |
| Config | `bau_configs` | relational + jsonb | yes |
| Config | `campaign_configs` | relational + jsonb | yes |
| Config | `tech_programme_configs` | relational + jsonb | yes |
| Config | `holiday_calendars` | relational | yes |
| Config | `holiday_entries` | relational | no (owned by calendar) |
| Config | `national_leave_bands` | relational + jsonb | yes |
| Config | `trading_configs` | relational + jsonb | yes |
| Config | `deployment_risk_configs` | relational + jsonb | yes |
| Config | `operating_window_configs` | relational + jsonb | yes |
| Config | `weight_sets` | relational + jsonb | yes |
| Config | `scenario_configs` | relational + jsonb | yes |
| Build | `config_builds` | relational | n/a |
| Build | `config_build_components` | relational | n/a |
| Build | `config_artifacts` | relational + text | n/a |
| Governance | `audit_events` | append-only | n/a |
| Governance | `import_jobs` | relational | n/a |
| Governance | `validation_results` | relational | n/a |
| Auth | `user_access_scopes` | relational | no |

---

## 5. YAML-to-Fragment Mapping

Each top-level YAML section maps to one or more Postgres fragment tables:

| YAML Section | Fragment Table | Scope | Notes |
|-------------|----------------|-------|-------|
| `market`, `title`, `description` | `market_configs` | market | Core market identity + display |
| `resources` | `resource_configs` | market | labs, staff, testing capacity, monthly patterns |
| `bau` | `bau_configs` | market | BAU entries + market IT weekly load |
| `campaigns[]` | `campaign_configs` | market | One row per campaign; jsonb for load details |
| `tech_programmes[]` | `tech_programme_configs` | market | One row per programme |
| `public_holidays` | `holiday_calendars` + `holiday_entries` | market | Calendar with type=public |
| `school_holidays` | `holiday_calendars` + `holiday_entries` | market | Calendar with type=school |
| `national_leave_bands[]` | `national_leave_bands` | market | One row per band |
| `holidays` | `market_configs.holiday_settings` | market | jsonb within market config |
| `trading` | `trading_configs` | market | Weekly/monthly patterns, seasonal, boosts |
| `deployment_risk_*` | `deployment_risk_configs` | market | Events, blackouts, month curves |
| `operating_windows[]` | `operating_window_configs` | market | One row per window |
| `stress_correlations` | `market_configs.stress_settings` | market | jsonb within market config |

### Config Inheritance / Resolution Order

```
1. System defaults (hardcoded engine defaults)
2. Operating model defaults (operated vs licensed)
3. Segment defaults (LIOM-wide, IOM-wide)
4. Market overrides (UK-specific, DE-specific)
5. Scenario overrides (what-if modelling)
```

The assembler combines these layers deterministically. Each layer can override or extend the layer above.

---

## 6. Auth & Env Rationalisation

### Current Clerk Env Vars in Code

| Var | Used In | Status |
|-----|---------|--------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `clerkConfig.ts`, `main.tsx` | **Legacy — migrate** |
| `CLERK_SECRET_KEY` | `_sharedDslImpl.ts` | **Legacy — migrate** |
| `CLERK_AUTHENTICATION_CLERK_SECRET_KEY` | `.env.local` only | **Canonical — adopt** |
| `NEXT_PUBLIC_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY` | `.env.local` only | **Canonical — adapt for Vite** |

### Migration Plan

The app is Vite-based, so `NEXT_PUBLIC_*` vars are invisible to `import.meta.env`. Strategy:

1. **Server side**: Migrate from `CLERK_SECRET_KEY` to `CLERK_AUTHENTICATION_CLERK_SECRET_KEY` with fallback
2. **Client side**: Since this is Vite, the canonical publishable key needs a `VITE_` prefix. Options:
   - Add `VITE_CLERK_AUTHENTICATION_CLERK_PUBLISHABLE_KEY` (mirrors the Vercel integration name)
   - Or keep `VITE_CLERK_PUBLISHABLE_KEY` as an alias with typed env validation
3. **Deprecation**: Phase out old names after confirming all paths work

### Final Env Contract

See `docs/ENV_CONTRACT.md` (produced separately) for the complete canonical env specification.

---

## 7. Internal Authorization Model

### `user_access_scopes` Table

```sql
CREATE TABLE user_access_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'segment_editor', 'market_editor', 'viewer')),
  operating_model_id TEXT REFERENCES operating_models(id),
  segment_id TEXT REFERENCES segments(id),
  market_id TEXT REFERENCES markets(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);
```

### Example Assignments

| User | Role | operating_model_id | segment_id | market_id |
|------|------|--------------------|------------|-----------|
| dougbooth@mac.com | admin | NULL | NULL | NULL |
| uk_editor@co.uk | market_editor | operated_markets | LIOM | UK |
| europe_lead@co.uk | segment_editor | operated_markets | LIOM | NULL |

### Authorization Flow

```
1. Clerk JWT arrives → extract clerk_user_id (sub claim)
2. Server resolves user_access_scopes WHERE clerk_user_id = ? AND is_active = true
3. Most permissive scope wins for the user's session
4. Scope set passed to RLS via session variables or parameterised queries
```

---

## 8. RLS Design

### Principles
- Enable RLS on all scoped editable tables
- Deny by default — no policies = no access (except service_role)
- Direct scope column comparison — no relational hopping
- Policies documented in plain English

### Policy Pattern

For each scoped table (e.g. `campaign_configs`):

```sql
-- Admin: full access
CREATE POLICY admin_all ON campaign_configs
  FOR ALL TO authenticated
  USING (
    current_setting('app.user_role', true) = 'admin'
  );

-- Segment editor: read/write within their segment
CREATE POLICY segment_editor ON campaign_configs
  FOR ALL TO authenticated
  USING (
    current_setting('app.user_role', true) = 'segment_editor'
    AND operating_model_id = current_setting('app.operating_model_id', true)
    AND segment_id = current_setting('app.segment_id', true)
  );

-- Market editor: read/write within their market
CREATE POLICY market_editor ON campaign_configs
  FOR ALL TO authenticated
  USING (
    current_setting('app.user_role', true) = 'market_editor'
    AND operating_model_id = current_setting('app.operating_model_id', true)
    AND segment_id = current_setting('app.segment_id', true)
    AND market_id = current_setting('app.market_id', true)
  );
```

Session variables (`app.user_role`, `app.operating_model_id`, etc.) are set by trusted server-side code before any query execution.

### RLS Scope

RLS answers: can this user read/insert/update/delete this row?

RLS does NOT handle:
- Who can publish
- Who can approve imports
- Who can trigger cross-segment rebuilds

Those are service-layer authorization decisions.

---

## 9. Versioning Model

### Three-Level Version Chain

```
Logical Object (enduring business entity)
  ├── e.g. "UK campaign: Spring value meal"
  │
  └── Revision 1 (immutable snapshot)
  └── Revision 2 (immutable snapshot)  ← current
  └── Revision 3 (immutable snapshot)

Build 47 (deterministic assembly event)
  ├── Component: UK/campaign_configs rev 2
  ├── Component: UK/resource_configs rev 5
  ├── Component: UK/trading_configs rev 3
  └── ...
  │
  └── Artifact (generated YAML + checksum)
      └── Status: published → immutable
```

### Build Statuses

`draft` → `generated` → `validated` → `published` → `superseded`

Published artifacts are immutable. To change, edit source fragments and create a new build.

---

## 10. Assembly Pipeline

### Flow

```
1. User edits config fragment(s) via guided or expert UI
2. Fragment-level validation runs
3. Build generation triggered (manual or auto)
4. Assembler loads correct source revisions per operating_model/segment/market
5. Config inheritance resolved (system → op_model → segment → market → scenario)
6. Final YAML assembled deterministically
7. Assembled artifact validated (structure, consistency, references)
8. Build record + artifact version written to Postgres
9. Upstash cache updated/invalidated
10. Active published pointer updated on explicit publish action
```

### Determinism Guarantee

Given the same set of fragment revision IDs, the assembler MUST produce byte-identical YAML. This is enforced by:
- Sorting keys alphabetically within sections
- Consistent date formatting
- Deterministic array ordering (by name, then start_date)
- SHA-256 checksum stored with each artifact

---

## 11. Cache Strategy (Upstash)

### Cache Key Patterns

```
config:om:{operatingModelId}:active                          → active build ID
config:om:{operatingModelId}:seg:{segmentId}:active          → segment active build
config:om:{operatingModelId}:mkt:{marketId}:active           → market active artifact
config:build:{buildId}:artifact                              → generated YAML text
config:build:{buildId}:meta                                  → build metadata
readmodel:om:{operatingModelId}:mkt:{marketId}:summary       → pre-computed summary
```

### Rules
- Cache outputs, not truth
- Cache keys are scope-aware — no cross-scope leakage
- Explicit invalidation on publish/rebuild
- TTL as safety net (e.g. 1 hour), not primary expiry mechanism
- Server-side cache reads only — browser never hits Redis directly

---

## 12. Phased Implementation Plan

### Phase 1: Auth & Env Cleanup
- Audit all env var usage in code
- Standardise on Vercel-integrated Clerk env names
- Create typed env loader with validation
- Document final env contract
- Remove/deprecate legacy auth paths

### Phase 2: Domain Discovery & YAML Mapping
- Map existing YAML sections to fragment types (done — see §5)
- Identify relational vs jsonb boundaries
- Document inheritance/resolution model

### Phase 3: Schema Design & Migrations
- Design operating_model → segment → market hierarchy
- Design fragment tables with scope columns
- Design revision, build, artifact tables
- Create Supabase migrations
- Seed reference data

### Phase 4: Internal Authorization Model
- Create `user_access_scopes` table
- Connect Clerk identity to internal scope records
- Implement server-side scope resolution
- Prepare RLS posture

### Phase 5: Fragment Persistence Layer
- Implement CRUD services for each fragment type
- Implement revision-safe writes with optimistic concurrency
- Add fragment-level validation
- Stop relying on monolithic YAML as source of truth

### Phase 6: Assembly Pipeline
- Implement deterministic YAML assembly from active fragments
- Implement config inheritance resolution
- Persist builds and generated artifacts
- Record build provenance (which revisions contributed)

### Phase 7: Cache Integration
- Implement Upstash caching for active artifacts
- Add scope-aware cache keys
- Implement invalidation on publish/rebuild
- Add cache-miss fallback to Postgres

### Phase 8: Admin Refactor
- Move editing to fragment/object surfaces
- Surface validation results
- Add revision history browsing
- Add build/publish controls

### Phase 9: RLS & Security Hardening
- Apply RLS to scoped tables
- Keep policies simple (direct column comparison)
- Document policies in plain English
- Add audit coverage
- Security test matrix

### Phase 10: UX & Expert Authoring
- Guided authoring (forms, defaults, inline validation)
- Expert mode (YAML paste → fragment decomposition → validation)
- Quick editor for common changes
- Preview before publish

### Phase 11: Legacy Deprecation
- Deprecate Vercel Blob write path
- Confirm deployment/rollback strategy
- Finalise documentation

---

## 13. Transition Strategy

### Parallel Operation Period

During migration, the system runs in **dual mode**:

1. **Read path**: App can read from either Blob (legacy) or Postgres-assembled artifacts
2. **Write path**: New writes go through fragment persistence; legacy Blob writes deprecated
3. **Feature flag**: `CAPACITY_CONFIG_SOURCE=blob|postgres` controls which read path is active

### Migration Steps

1. Seed Postgres fragments by decomposing existing market YAML files
2. Verify assembled output matches original YAML (checksum comparison)
3. Switch read path to Postgres-assembled artifacts
4. Disable Blob write path
5. Remove Blob read path after stabilisation

### Rollback

At any point during transition, setting `CAPACITY_CONFIG_SOURCE=blob` restores the original behaviour. No data is deleted from Blob during migration.

---

## 14. Non-Goals

- No microservices — single Vercel deployment
- Redis is never source of truth
- No editable monolithic YAML as write model
- No over-normalised dozen-table designs for small concepts
- No clever security tricks
- No separate rogue path for expert users
- No enterprise form-filling ceremony
