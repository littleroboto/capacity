# Market Capacity Surface

**A communication tool for visualising how capacity is consumed** — not a replacement for your planning systems, but a shared picture everyone can read: where pressure is building, what kind of work is driving it, and how **business rhythm** connects to **maintenance and transformation** (technology delivery).

---

## Live app (Vercel)

Deployment target is **[Vercel](https://vercel.com)** (Vite + serverless `api/` routes, e.g. shared workspace YAML).

1. Import this repo in Vercel (framework preset: **Vite**).
2. Production URL: **Project → Deployments → Production** (or your custom domain).

GitHub Actions **does not** auto-deploy the site on push; Vercel builds from Git when the repo is connected there. An optional, **manual** GitHub Pages workflow still exists at [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) if you ever want a static mirror (it does **not** run `api/*`).

#### Production with editable shared YAML (one path)

1. **Connect the repo** to Vercel (**Add New → Project → Import**). Framework: **Vite**. Root/build defaults are usually fine (`pnpm run build` / `dist` or auto-detected).
2. **Create Blob** (**Storage → Blob → Create**) and **connect** it to this project so **`BLOB_READ_WRITE_TOKEN`** appears under **Settings → Environment Variables** for **Production**.
3. Add **`CAPACITY_SHARED_DSL_SECRET`** (long random string) for **Production**, **Sensitive**.
4. Add **`VITE_SHARED_DSL`** = **`1`** for **Production** (turns on client calls to `/api/shared-dsl`).
5. **Deploy** (first deploy or **Deployments → … → Redeploy**). Required so the bundle includes `VITE_*` and functions see the server secrets.
6. Open your **production URL**. **Controls** (right sidebar) → **Workspace** → **Team workspace**: paste `CAPACITY_SHARED_DSL_SECRET` → **Save secret & upload** (uploads immediately). Use **Save to cloud now** after later edits, or wait ~3s for auto-save. If **Cloud sync is off** appears, set **`VITE_SHARED_DSL=1`** at build time and **redeploy**.

Until someone saves once, the app uses bundled `public/data/markets/*.yaml`; the first successful upload creates the blob copy everyone then shares.

---

## What you’re looking at

The interface is a **dynamic visual of system pressure**. Colour and summaries encode load and risk in a single glance:

- **Restaurant Activity** — restaurant trading curve (**`store_pressure`**) as the heatmap; combined risk still blends tech and campaigns.
- **Technology Teams** — labs and Market IT work versus capacity (**tech capacity demand**; headline excludes backend), including overload when demand exceeds caps.

The same **YAML-driven model** powers every market. Parameters are named and scaled **consistently** so you can **compare regions and countries** side by side without reconciling different spreadsheets or definitions.

---

## Why YAML?

The visual is **fully driven** by a detailed **YAML schema**: resources, BAU, campaigns, holiday behaviour, store trading patterns, and technology cadence. That means:

- **One language** for “what we believe is true” about a market.
- **Repeatable** scenarios — change the file, refresh the story.
- **Comparable** markets — same fields, same semantics, different numbers and dates.

Authoring help: **[docs/CAPACITY-RUNWAY.md](docs/CAPACITY-RUNWAY.md)** (pipeline and field reference), **[docs/MARKET_DSL_AND_PIPELINE.md](docs/MARKET_DSL_AND_PIPELINE.md)** (DSL and data flow). **Current POC scope** (Vercel, Blob, date-scoped runway): **[docs/PRODUCT_BASELINE.md](docs/PRODUCT_BASELINE.md)**.

---

## Run locally

```bash
npm install
npm run dev
```

Or with pnpm:

```bash
pnpm install
pnpm dev
```

The dev server runs Vite (see `package.json`). Market definitions load from `**public/data/markets/*.yaml**`.

### Build

```bash
npm run build
```

Output: `**dist/**`.

### Shared workspace (Vercel Blob; no redeploy for team YAML edits)

The app stores **one team workspace** in [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) using **`access: private`** (works with Vercel’s default **private** Blob stores). `api/shared-dsl.ts` reads/writes with the token; **writes** need the shared secret. **`GET /api/shared-dsl` is still unauthenticated** (anyone with the app URL can read YAML until you add auth). Treat as **test / internal** until then (see **Versioning and visibility** below).

#### Enable Blob on Vercel (step by step)

1. **Open the project** in the [Vercel dashboard](https://vercel.com/dashboard) (the one connected to this repo).
2. Go to **Storage** → **Create** (or **Browse Marketplace**) → choose **Blob**.
3. **Create** a Blob store and, when prompted, **connect it to this project** so Vercel can inject env vars.
4. Open **Project → Settings → Environment Variables** and confirm **`BLOB_READ_WRITE_TOKEN`** exists for **Production** (and Preview if previews should use Blob). If the store was not linked, use the Blob store’s **Connect Project** flow, or add **`BLOB_READ_WRITE_TOKEN`** manually from the store (mark **Sensitive**).
5. Add **`CAPACITY_SHARED_DSL_SECRET`**: a long random string (e.g. `openssl rand -hex 32`). Use **Production** / **Preview** as needed. **Sensitive.** Users paste this value once per browser session as the write key (must match exactly).
6. **Turn on the feature in the built app:** add env var **`VITE_SHARED_DSL`** = **`1`** (Production, and Preview if you want it there). Only variables whose names start with **`VITE_`** are embedded into the **frontend** bundle at **build** time. So this is the switch that makes the browser actually call `/api/shared-dsl` instead of skipping cloud sync entirely. If you add or change **`VITE_*`** later, you must **redeploy** so Vite runs `build` again with the new value.
7. **Redeploy** production (after steps 4–6) so: (a) the new build includes **`VITE_SHARED_DSL`**, and (b) the serverless function has **`BLOB_READ_WRITE_TOKEN`** and **`CAPACITY_SHARED_DSL_SECRET`**.
8. In the app: **Workspace** → **Save secret & upload** or **Save to cloud now**; failed saves show a red message under the buttons (e.g. wrong secret → `unauthorized`).

**Local:** `vercel link`, then `vercel env pull` (or copy vars into `.env.local`) and run `vercel dev`.

**Troubleshooting — `Cannot use public access on a private store`:** Production is still running an **old** `api/shared-dsl.ts` (before `access: private`). **Redeploy** the latest commit (Git push, or Vercel → Deployments → **Redeploy** with “Use existing Build Cache” **unchecked** if needed). Optional env **`CAPACITY_BLOB_ACCESS`**: omit or `private` for private stores; use `public` only if the Blob store is public.

#### Versioning and visibility (later)

- **POC today:** Blob **ETags** and **`ifMatch`** on `PUT` still reduce clobbering; there is **no** in-app “server has newer YAML” banner — use **Pull from cloud** in Workspace if another tab saved. **409** on save surfaces in Workspace (manual) or the browser console (auto-save).
- **Next:** **Named snapshots** or audit trail → Postgres (or multiple blob paths). **Who can read/write** → auth (e.g. Clerk), server-only blob reads, tenant checks, **Deployment Protection** on previews.

Handler: `api/shared-dsl.ts`.

---

## Repository map


| Area                   | Role                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `public/data/markets/` | Per-country YAML — the source of truth for the demo markets |
| `src/`                 | React UI, pipeline wiring, heatmap and summary components   |
| `api/`                 | Vercel serverless routes (e.g. shared workspace YAML)      |
| `docs/`                | Index: [docs/README.md](docs/README.md); baseline: [docs/PRODUCT_BASELINE.md](docs/PRODUCT_BASELINE.md) |


