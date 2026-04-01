# Product baseline (POC — March 2026)

Single source of truth for **what this repo is today**, so older docs (OWM, cal-heatmap, vanilla stack) are not mistaken for current reality.

## What ships

- **React + TypeScript + Vite** SPA. Runway visualisation uses **Visx** (not cal-heatmap).
- **Deployed on Vercel**: static client build + **serverless** routes under `api/` (e.g. shared workspace YAML).
- **Default data**: bundled per-market YAML under `public/data/markets/*.yaml`, driven by the generated manifest.
- **Optional team workspace**: when **`VITE_SHARED_DSL=1`** at build time and Blob + secrets are set on Vercel, the app reads/writes **one** multi-document YAML via **`GET`/`PUT` `/api/shared-dsl`** ([Vercel Blob](https://vercel.com/docs/storage/vercel-blob)). Writes require the shared **`CAPACITY_SHARED_DSL_SECRET`** pasted once per browser session (POC — not multi-user auth).

## Date scoping

- The engine builds a **day-indexed runway** from each market’s YAML (calendar → phases → loads → capacity → risk). Dates come from **DSL** (`campaigns`, trading windows, holidays, etc.), not from a separate global “scenario date” API.
- The UI can **filter or focus** the visible date range (e.g. runway window helpers) while the underlying pipeline still produces rows per day in scope.
- **Authoring rule of thumb**: anything time-based belongs in YAML; the app compares and displays **pressure over time** consistently across markets.

## Shared workspace (POC scope)

- **Optimistic locking** on the server: Blob **`ifMatch`** / ETag on `PUT` to reduce blind overwrites.
- **No** in-app “newer copy on server” toast or multi-tab stale banner — multi-tab users rely on **Pull from cloud** in Workspace when they need to align.
- **409 conflict**: manual save shows an error in Workspace; auto-save logs a **console warning** only.

## Out of scope for this baseline

- User accounts, orgs, SSO (see [BACKLOG_EPICS.md](./BACKLOG_EPICS.md)).
- Real-time collab (Yjs / PartyKit) — backlog.
- Named version history / audit DB — backlog; Blob holds a single current file today.

## Code anchors

| Area | Location |
|------|-----------|
| Shared Blob API | `api/shared-dsl.ts` |
| Client sync (save / pull / autosave) | `src/lib/sharedDslSync.ts` |
| Workspace UI | `src/components/SharedWorkspaceSection.tsx` |
| Bootstrap load (Blob vs bundled) | `src/App.tsx` (mount effect) |
| Pipeline | `src/engine/pipeline.ts` and related `src/engine/*` |

When docs or epics disagree with this file, **trust this file for “what we run in prod now”** and update epics or deep-dive docs as you extend the product.
