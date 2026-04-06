# Product baseline (April 2026)

Single source of truth for **what this repo ships today**, so older docs (OWM, cal-heatmap, vanilla stack) are not mistaken for current reality. For **roadmap and epics**, see [BACKLOG_EPICS.md](./BACKLOG_EPICS.md). **Runway lens names and heatmap semantics** also have a concise table in [LENS_GLOSSARY.md](./LENS_GLOSSARY.md).

## What ships

- **React + TypeScript + Vite** SPA. Runway visualisation uses **Visx** (not cal-heatmap).
- **Deployed on Vercel**: static client build + **serverless** routes under `api/` (today: shared workspace YAML only).
- **Default data**: bundled per-market YAML under `public/data/markets/*.yaml`, driven by the generated manifest (`pnpm` / `npm` **prebuild** runs `scripts/generate-market-manifest.mjs`).
- **Optional team workspace**: when **`VITE_SHARED_DSL=1`** at build time and Blob + secrets are set on Vercel, the app reads/writes **one** multi-document YAML via **`GET`/`PUT` `/api/shared-dsl`** ([Vercel Blob](https://vercel.com/docs/storage/vercel-blob)). With Clerk, **GET/HEAD require a session JWT** when **`CLERK_SECRET_KEY`** is set on the server; **PUT** accepts JWT (and optionally the legacy **`CAPACITY_SHARED_DSL_SECRET`** unless disabled). See `api/shared-dsl.ts` and [HANDOFF_EPIC_USER_ORG_ENTERPRISE.md](./HANDOFF_EPIC_USER_ORG_ENTERPRISE.md).
- **Optional Clerk sign-in**: when **`VITE_CLERK_PUBLISHABLE_KEY`** is set at build time and **`VITE_AUTH_DISABLED`** is not truthy, the SPA shows Clerk **sign-in before the workbench** ([`@clerk/react`](https://clerk.com/docs)). The shared-dsl API can verify the same session when **`CLERK_SECRET_KEY`** is configured.

## Runway UI and lenses

Four **view modes** (see `VIEW_MODES` in `src/lib/constants.ts`):

| Mode | Label | What the heatmap shows |
|------|--------|-------------------------|
| **`combined`** | Technology Teams | **Tech capacity headroom** (0–1): share of lab and Market IT capacity still free versus scheduled work on those lanes (`technologyHeadroomHeatmapMetric` / related); **backend** YAML loads are **not** included in the headline heatmap. Cooler tiles = more slack. **Store-trading rhythm (including early-month lift) does not feed this metric**; it is phase/capacity only. Optional workload slice: **Combined** / **BAU only** / **Project work**. |
| **`in_store`** | Restaurant Activity | **Trading pressure** — `store_pressure`: weekly × monthly × seasonal rhythm, **early-month multiplier** (capped at **+20%** on normalised store rhythm, YAML/tuning), public-holiday trading multiplier, campaign **store** boosts, operating-window store multipliers. **Does not change tech loads.** |
| **`market_risk`** | Deployment Risk | **Deployment risk** score (0–1): deployment and calendar **fragility** from holidays, trading intensity, campaigns × peaks, tech bench strain, optional blackouts/events in YAML (`deployment_risk_01`). Hotter = more fragile context—not a deployment ban. |
| **`code`** | Code | Full multi-market **YAML** in the editor (Monaco). Switching back to a runway lens re-runs the pipeline from current DSL. |

**Planning blend** (`planning_blend_01` / `risk_score` family) is a **separate 0–1 mix** (tech + store + campaign + holiday weights from **Heatmap adjustments** tuning). It drives **Low / Medium / High** banding and related copy in day details; it is **not** the same number as the **Technology**, **Restaurant**, or **Deployment Risk** heatmap cell fill. Each lens tooltip and day detail separates **this heatmap’s paint** from the **planning blend**.

**Compare runway** (header: all markets / single market) uses the same engine with market columns as today.

**Heatmap palette** (Settings → Palette, temperature / spectrum mode): cells default to a **smooth ramp** (RGB interpolation between the same anchor colours after the same transfer curve and γ); **10 solid bands** remain available (`heatmapColorDiscrete` vs `heatmapColorContinuous` in `src/lib/riskHeatmapColors.ts`). **Single colour** (mono) mode still uses opacity steps only. The legend shows a vertical gradient when smooth ramp is on, with faint ticks at the discrete band boundaries for reference.

## Model and dates

- The engine builds a **day-indexed runway** per market: calendar → phase expansion → daily loads → capacity → **combined risk** (`src/engine/pipeline.ts`, `capacityModel.ts`, `riskModel.ts`).
- Dates and behaviour come from **YAML** (campaigns, tech programmes, holidays, school stress, trading, resources, operating windows, etc.), not from a separate global “scenario date” API.
- The UI can **filter or focus** the visible horizon while the pipeline produces rows over the model window (`MODEL_MONTHS` / quarters).
- **Authoring rule of thumb**: time-based truth lives in YAML; the app compares and displays **pressure over time** consistently across markets.

## Shared workspace (POC scope)

- **Optimistic locking** on the server: Blob **`ifMatch`** / ETag on `PUT` to reduce blind overwrites. Successful **`PUT`** returns **`etag`** and duplicate **`version`** (same opaque token) for clients that want a named “revision” field.
- **No live multi-tab sync** — there is no realtime “someone else is editing” channel; align with **Pull from cloud** when needed.
- **409 conflict**: if another client saves first, **Workspace → Save to cloud** shows an inline error; **auto-save** also raises a **dismissible amber banner** (`SharedDslConflictBanner`) with a link to open Workspace. After a successful **Pull from cloud** or successful save, the banner clears.
- **Scenario vs view:** Team YAML (bundled or Vercel Blob) is the shared **scenario**; **View on this device** holds personal presentation state (heatmap transfer curves, γ, smooth vs banded palette, runway filters, isometric 3D toggle, disco, pressure mix, etc.) in the browser unless exported.
- **View settings JSON** (Workspace dialog → **View on this device**): export/import heatmap transfer, γ, palette (including banded vs smooth spectrum), runway year/quarter filters, and risk-tuning sliders — **browser-only**, not a substitute for team YAML on the cloud (`src/lib/viewSettingsPreset.ts`). **Named presets** on this device reuse the same JSON shape (`src/lib/viewSettingsNamedPresets.ts`). Persisted Zustand keys and export keys stay aligned via `VIEW_SETTINGS_PAYLOAD_KEYS` / `sliceViewSettingsForPersist`. Lens-facing blurbs for tooltips stay tied to `VIEW_MODES` via `src/lib/lensCopy.ts`.

## Not in this baseline (planned / backlog)

- **Deeper tenancy** (per-org Blob paths, Postgres revision history, PartyKit) — see [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) (`epic-auth-org`, `epic-partykit-yjs`, `epic-versioning`). Clerk + scoped workspace ACL on `/api/shared-dsl` (segments, optional **`cap_mkts`**, GET filter / PUT merge) ships; per-org storage paths remain backlog. [AUTH_PROVIDER.md](./AUTH_PROVIDER.md) summarizes claims and env vars.
- Real-time collab (Yjs / PartyKit); version history DB; comments/chat — see [BACKLOG_EPICS.md](./BACKLOG_EPICS.md).
- **Runway auto-plan** (slot finder, ghost overlays, 3D viz) — backlog **Phase 2**; intended to build on runway lenses once shipped.

## Code anchors

| Area | Location |
|------|----------|
| Shared Blob API | `api/shared-dsl.ts` |
| Clerk + session claims (`cap_*`) | [AUTH_PROVIDER.md](./AUTH_PROVIDER.md), `api/shared-dsl.ts`, `src/lib/capacityAccess.ts` |
| Client sync (save / pull / autosave) | `src/lib/sharedDslSync.ts` |
| Workspace UI | `src/components/SharedWorkspaceSection.tsx` |
| Cloud save conflict banner (409) | `src/components/SharedDslConflictBanner.tsx` |
| Bootstrap load (Blob vs bundled) | `src/App.tsx` |
| View mode labels / runway titles | `src/lib/constants.ts` |
| Heatmap metric per lens | `src/lib/runwayViewMetrics.ts` |
| Day-details glossary (fill vs risk) | `src/lib/runwayDayDetailsGlossary.ts` |
| Pipeline + store vs tech separation | `src/engine/pipeline.ts`, `src/engine/paydayMonthShape.ts` |
| Combined risk row | `src/engine/riskModel.ts` |
| DSL parse | `src/engine/yamlDslParser.ts` |
| App state | `src/store/useAtcStore.ts` |
| View settings preset (export/import + named on-device presets) | `src/lib/viewSettingsPreset.ts`, `src/lib/viewSettingsNamedPresets.ts`, Workspace → Local data panel |
| Lens copy (heatmap blend captions, etc.) | `src/lib/lensCopy.ts` (reads `VIEW_MODES` in `constants.ts`) |
| Heatmap discrete vs smooth spectrum | `src/lib/riskHeatmapColors.ts`, `HeatmapSettingsPanel.tsx`, `HeatmapLegend.tsx` |

When docs or epics disagree with this file, **trust this file for “what we run in prod now”** and update epics or deep-dive docs as you extend the product.
