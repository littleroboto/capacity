# Product baseline (April 2026)

Single source of truth for **what this repo ships today**, so older docs (OWM, cal-heatmap, vanilla stack) are not mistaken for current reality. For **roadmap and epics**, see [BACKLOG_EPICS.md](./BACKLOG_EPICS.md). **Runway lens names and heatmap semantics** also have a concise table in [LENS_GLOSSARY.md](./LENS_GLOSSARY.md).

## What ships

- **React + TypeScript + Vite** SPA. Runway visualisation uses **Visx** (not cal-heatmap).
- **Deployed on Vercel**: static client build + **serverless** routes under `api/` (today: shared workspace YAML only).
- **Default data**: bundled per-market YAML under `public/data/markets/*.yaml`, driven by the generated manifest (`pnpm` / `npm` **prebuild** runs `scripts/generate-market-manifest.mjs`).
- **Optional team workspace**: when **`VITE_SHARED_DSL=1`** at build time and Blob + secrets are set on Vercel, the app reads/writes **one** multi-document YAML via **`GET`/`PUT` `/api/shared-dsl`** ([Vercel Blob](https://vercel.com/docs/storage/vercel-blob)). Writes require the shared **`CAPACITY_SHARED_DSL_SECRET`** pasted once per browser session (POC — not multi-user auth).
- **Optional Clerk sign-in**: when **`VITE_CLERK_PUBLISHABLE_KEY`** is set at build time and **`VITE_AUTH_DISABLED`** is not truthy, the SPA shows Clerk **sign-in before the workbench** ([`@clerk/react`](https://clerk.com/docs)). **Server routes are unchanged** — workspace YAML over HTTP is not yet tied to the session (see [HANDOFF_EPIC_USER_ORG_ENTERPRISE.md](./HANDOFF_EPIC_USER_ORG_ENTERPRISE.md)).

## Runway UI and lenses

Four **view modes** (see `VIEW_MODES` in `src/lib/constants.ts`):

| Mode | Label | What the heatmap shows |
|------|--------|-------------------------|
| **`combined`** | Technology Teams | **Tech capacity headroom** (0–1): share of lab and Market IT capacity still free versus scheduled work on those lanes (`technologyHeadroomHeatmapMetric` / related); **backend** YAML loads are **not** included in the headline heatmap. Cooler tiles = more slack. **Store-trading rhythm (including early-month lift) does not feed this metric**; it is phase/capacity only. Optional workload slice: **Combined** / **BAU only** / **Project work**. |
| **`in_store`** | Restaurant Activity | **Trading pressure** — `store_pressure`: weekly × monthly × seasonal rhythm, **early-month multiplier** (capped at **+20%** on normalised store rhythm, YAML/tuning), public-holiday trading multiplier, campaign **store** boosts, operating-window store multipliers. **Does not change tech loads.** |
| **`market_risk`** | Market risk | **Market risk** score (0–1): deployment and calendar **fragility** from holidays, trading intensity, campaigns × peaks, tech bench strain, optional blackouts/events in YAML (`deployment_risk_01`). Hotter = more fragile context—not a deployment ban. |
| **`code`** | Code | Full multi-market **YAML** in the editor (Monaco). Switching back to a runway lens re-runs the pipeline from current DSL. |

**Planning blend** (`planning_blend_01` / `risk_score` family) is a **separate 0–1 mix** (tech + store + campaign + holiday weights from **Heatmap adjustments** tuning). It drives **Low / Medium / High** banding and related copy in day details; it is **not** the same number as the **Technology**, **Restaurant**, or **Market risk** heatmap cell fill. Each lens tooltip and day detail separates **this heatmap’s paint** from the **planning blend**.

**Compare runway** (header: all markets / single market) uses the same engine with market columns as today.

## Model and dates

- The engine builds a **day-indexed runway** per market: calendar → phase expansion → daily loads → capacity → **combined risk** (`src/engine/pipeline.ts`, `capacityModel.ts`, `riskModel.ts`).
- Dates and behaviour come from **YAML** (campaigns, tech programmes, holidays, school stress, trading, resources, operating windows, etc.), not from a separate global “scenario date” API.
- The UI can **filter or focus** the visible horizon while the pipeline produces rows over the model window (`MODEL_MONTHS` / quarters).
- **Authoring rule of thumb**: time-based truth lives in YAML; the app compares and displays **pressure over time** consistently across markets.

## Shared workspace (POC scope)

- **Optimistic locking** on the server: Blob **`ifMatch`** / ETag on `PUT` to reduce blind overwrites.
- **No** in-app “newer copy on server” toast or multi-tab stale banner — multi-tab users rely on **Pull from cloud** in Workspace when they need to align.
- **409 conflict**: manual save shows an error in Workspace; auto-save logs a **console warning** only.

## Not in this baseline (planned / backlog)

- **Full** user/org model on the **API** (protected `GET`/`PUT` shared DSL, roles, SSO) — partial client gate only today; see [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) and [HANDOFF_EPIC_USER_ORG_ENTERPRISE.md](./HANDOFF_EPIC_USER_ORG_ENTERPRISE.md).
- Real-time collab (Yjs / PartyKit); version history DB; comments/chat — see [BACKLOG_EPICS.md](./BACKLOG_EPICS.md).
- **Runway auto-plan** (slot finder, ghost overlays, 3D viz) — backlog **Phase 2**; intended to build on runway lenses once shipped.

## Code anchors

| Area | Location |
|------|----------|
| Shared Blob API | `api/shared-dsl.ts` |
| Client sync (save / pull / autosave) | `src/lib/sharedDslSync.ts` |
| Workspace UI | `src/components/SharedWorkspaceSection.tsx` |
| Bootstrap load (Blob vs bundled) | `src/App.tsx` |
| View mode labels / runway titles | `src/lib/constants.ts` |
| Heatmap metric per lens | `src/lib/runwayViewMetrics.ts` |
| Day-details glossary (fill vs risk) | `src/lib/runwayDayDetailsGlossary.ts` |
| Pipeline + store vs tech separation | `src/engine/pipeline.ts`, `src/engine/paydayMonthShape.ts` |
| Combined risk row | `src/engine/riskModel.ts` |
| DSL parse | `src/engine/yamlDslParser.ts` |
| App state | `src/store/useAtcStore.ts` |

When docs or epics disagree with this file, **trust this file for “what we run in prod now”** and update epics or deep-dive docs as you extend the product.
