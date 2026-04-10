# Documentation index

Start here after the [root README](../README.md) (run, deploy, Blob env vars).

| Doc | Purpose |
|-----|--------|
| [PRODUCT_BASELINE.md](./PRODUCT_BASELINE.md) | **Current POC reality** — Vercel, Blob workspace, date-scoped runway, what is intentionally out of scope. |
| [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) | Product epics, **runway auto-plan** (in-app slot finder), and phased engineering roadmap. |
| [BRIEF_MARKET_RISK_VIEW.md](./BRIEF_MARKET_RISK_VIEW.md) | **Implementation brief** — fourth runway lens (deployment / calendar risk), engine + UI touchpoints vs current code. |
| [CAPACITY-RUNWAY.md](./CAPACITY-RUNWAY.md) | Pipeline and field reference for the runway / capacity surface. |
| [MARKET_DSL_AND_PIPELINE.md](./MARKET_DSL_AND_PIPELINE.md) | DSL shape and data flow into the engine. |
| [DSL_CAMPAIGNS_AND_TRADING.md](./DSL_CAMPAIGNS_AND_TRADING.md) | Campaigns, trading, and related YAML behaviour. |
| [PLANNING_ARCHITECTURE.md](./PLANNING_ARCHITECTURE.md) | Planning-oriented architecture notes. |
| [VP-CAPACITY-RUNWAY-ONE-PAGER.md](./VP-CAPACITY-RUNWAY-ONE-PAGER.md) | Short executive-style product summary. |
| [LLM_MARKET_DSL_PROMPT.md](./LLM_MARKET_DSL_PROMPT.md) | LLM authoring instructions (full). |
| [LLM_MARKET_DSL_SCHEMA_COMPACT.md](./LLM_MARKET_DSL_SCHEMA_COMPACT.md) | Compact schema for prompts / assistants. |
| [HANDOFF_DSL_CODING_ASSISTANT.md](./HANDOFF_DSL_CODING_ASSISTANT.md) | Build notes for a future in-app DSL coding assistant. |
| [AUTH_PROVIDER.md](./AUTH_PROVIDER.md) | **Clerk** — env vars, session claims (`cap_*`), code map for identity and `/api/shared-dsl`. |
| [SUPABASE_REDIS_WORKSPACE.md](./SUPABASE_REDIS_WORKSPACE.md) | **Supabase + Redis** — canonical per-market workspace schema, bundle cache keys, Clerk-only auth (service role from Vercel). |
| [CLERK_CAPACITY_ORG_SETUP.md](./CLERK_CAPACITY_ORG_SETUP.md) | **Org layout** — IOM/LIOM segment orgs vs market teams, `public_metadata` keys, session token mapping. |
| [HANDOFF_EPIC_USER_ORG_ENTERPRISE.md](./HANDOFF_EPIC_USER_ORG_ENTERPRISE.md) | **Engineering handoff** — identity, protected `/api/shared-dsl`, roles; next step for enterprise-grade tenancy. |
| [HANDOFF_EPIC_LANDING.md](./HANDOFF_EPIC_LANDING.md) | **Engineering handoff** — landing vs workbench routes, SEO, Clerk entry alignment (`epic-landing`). |
| [HANDOFF_EPIC_MARKETS.md](./HANDOFF_EPIC_MARKETS.md) | **Engineering handoff** — segments, manifest, markets data model (`epic-markets`). |
Removed as obsolete (pre-rebaseline): stale-toast handoff, OWM/cal-heatmap implementation plan, one-off review prompt, dated ATC brief plan (superseded by current React/Visx app).
