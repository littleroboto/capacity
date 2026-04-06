# Market Capacity Surface

**A communication tool for visualising how capacity is consumed** — not a replacement for your planning systems, but a shared picture everyone can read: where pressure is building, what kind of work is driving it, and how **business rhythm** connects to **maintenance and transformation** (technology delivery).

---

## Live app (Vercel)

Deployment target is **[Vercel](https://vercel.com)** (Vite + serverless `api/` routes, e.g. shared workspace YAML).

1. Import this repo in Vercel (framework preset: **Vite**).
2. Production URL: **Project → Deployments → Production** (or your custom domain).

GitHub Actions **does not** auto-deploy the site on push. **Vercel only auto-builds on push if the project is connected to Git** (Vercel dashboard → **Project → Settings → Git**): correct repository, **Production Branch** (usually `main`), and GitHub App access to that repo. If the project was created with **`vercel link`** / CLI-only deploys, connect Git there or deploy manually with **`vercel deploy --prod`** (from a linked directory) after each push. An optional, **manual** GitHub Pages workflow still exists at [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) if you ever want a static mirror (it does **not** run `api/*`).

#### Production with editable shared YAML (one path)

1. **Connect the repo** to Vercel (**Add New → Project → Import**). Framework: **Vite**. Root/build defaults are usually fine (`pnpm run build` / `dist` or auto-detected).
2. **Create Blob** (**Storage → Blob → Create**) and **connect** it to this project so **`BLOB_READ_WRITE_TOKEN`** appears under **Settings → Environment Variables** for **Production**.
3. Add **`CAPACITY_SHARED_DSL_SECRET`** (long random string) for **Production**, **Sensitive**.
4. Add **`VITE_SHARED_DSL`** = **`1`** for **Production** (turns on client calls to `/api/shared-dsl`).
5. **Deploy** (first deploy or **Deployments → … → Redeploy**). Required so the bundle includes `VITE_*` and functions see the server secrets.
6. Open your **production URL**. **Controls** (right sidebar) → **Workspace** → **Team workspace**: paste `CAPACITY_SHARED_DSL_SECRET` → **Save secret & upload** (uploads immediately). Use **Save to cloud now** after later edits, or wait ~3s for auto-save. If **Cloud sync is off** appears, set **`VITE_SHARED_DSL=1`** at build time and **redeploy**.

Until someone saves once, the app uses bundled `public/data/markets/*.yaml`; the first successful upload creates the blob copy everyone then shares.

#### Optional sign-in gate ([Clerk](https://clerk.com))

1. Create a Clerk application and copy the **publishable key**.
2. Add **`VITE_CLERK_PUBLISHABLE_KEY`** to Vercel (and Preview if needed) and **redeploy** so Vite embeds it.
3. After deploy, the workbench shows **Clerk sign-in** until the user authenticates. Omit the variable (or set **`VITE_AUTH_DISABLED=1`**) to keep the previous anonymous behaviour.

**If production shows no sign-in:** the most common cause is that **`VITE_CLERK_PUBLISHABLE_KEY` was never set for the Production environment in Vercel**, or you have not **redeployed** since adding it. Vite inlines `VITE_*` only at **build** time; `.env.local` on your laptop does not affect the hosted build. The live app also shows an amber banner when the key is missing.

**API reads:** When **`CLERK_SECRET_KEY`** is set on Vercel, **`GET /api/shared-dsl`** requires a valid Clerk session JWT. Without it, reads follow the legacy open behaviour. See [docs/HANDOFF_EPIC_USER_ORG_ENTERPRISE.md](docs/HANDOFF_EPIC_USER_ORG_ENTERPRISE.md).

**Org roles (viewer vs editor)** — do these in order:

1. **Clerk Dashboard** → **Configure** → **Organizations** → enable **Organizations** for this application.
2. **Clerk Dashboard** → **Organizations** → open your org → **Members** → assign roles. Create or use roles whose **keys** match what you will allow (e.g. `admin`, `member`, `editor`). Users who must **not** save YAML get a role you will **omit** from the env list (e.g. `viewer`).
3. Open the live app. In the **header**, use the **organization switcher** (to the left of your avatar). **Choose the organization** for this workspace. Saving with role checks **requires** an active org so the session token includes organization role claims.
4. **Vercel** → your project → **Settings** → **Environment Variables** → **Production**:
   - `CAPACITY_CLERK_DSL_WRITE_ROLES` = `admin,member,editor` (same tokens Clerk puts in the JWT for those roles; no spaces required).
5. Add **`VITE_CLERK_DSL_WRITE_ROLES`** = `admin,member,editor` for **Production** (and Preview if you use it).
6. **Deployments** → **Redeploy** the production deployment so Vite embeds `VITE_*`.

Omit both role env vars to keep **any signed-in user can PUT** (no org role filter).

### Optional real-time collab (PartyKit + Yjs + Monaco)

The **SPA and `/api/shared-dsl` deploy on Vercel** when you push Git. The **collab WebSocket server does not**: it is a separate **PartyKit** project (`party/collab.ts`, `pnpm party:deploy`). **`y-monaco`** is only an npm dependency bundled by Vite when collab is enabled.

- **Agent / operator checklist** (env matrix, order of operations, what fails where): **[docs/HANDOFF_PARTYKIT_YJS_DEPLOY.md](docs/HANDOFF_PARTYKIT_YJS_DEPLOY.md)**  
- **Product / ACL design:** [docs/superpowers/specs/2026-04-06-partykit-yjs-collaborative-dsl-design.md](docs/superpowers/specs/2026-04-06-partykit-yjs-collaborative-dsl-design.md)

You need **`CLERK_SECRET_KEY` on PartyKit** (via `npx partykit env add …` + deploy) as well as on Vercel, and **`VITE_COLLAB_ENABLED` + `VITE_PARTYKIT_HOST`** set on Vercel **Production** with a **redeploy** so Vite embeds them.

---

## What you’re looking at

The interface is a **dynamic visual of system pressure**. Colour and summaries encode load and risk in a single glance:

- **Restaurant Activity** — restaurant trading curve (**`store_pressure`**) as the heatmap; the planning blend still mixes tech and campaigns for banding.
- **Technology Teams** — lab and Market IT **capacity headroom** (0–1 tile; headline excludes backend); cooler tiles mean more slack versus scheduled work.
- **Deployment Risk** — deployment/calendar fragility (**`deployment_risk_01`**) as the heatmap; banding still uses the full planning blend.

The same **YAML-driven model** powers every market. Parameters are named and scaled **consistently** so you can **compare regions and countries** side by side without reconciling different spreadsheets or definitions.

**Scenario vs this browser:** Multi-market YAML on **Vercel Blob** (or bundled files) is what the team shares. **Workspace → View on this device** stores personal heatmap and UI choices (curves, filters, palette, 3D runway, etc.) in local storage; use export/import JSON there if two machines should match — that is separate from **Save to cloud** for YAML.

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

The app stores **one team workspace** in [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) using **`access: private`** by default. The serverless handler **`api/shared-dsl.js`** (pre-bundled from `api/_sharedDslImpl.ts`) uses **`BLOB_READ_WRITE_TOKEN`** to read and write **`capacity-shared/workspace.yaml`**.

**With Clerk (recommended for production):** set **`CLERK_SECRET_KEY`** on Vercel. Then **GET/HEAD** require a **Clerk session JWT** (the SPA sends it automatically after sign-in). **PUT** uses the same JWT; optional **`CAPACITY_CLERK_DSL_WRITE_ROLES`** / **`VITE_CLERK_DSL_WRITE_ROLES`** restrict which **org membership roles** may save. Scoped users can use session claims **`cap_segs`**, **`cap_mkts`**, **`cap_ed`**, **`cap_admin`** — see **[docs/AUTH_PROVIDER.md](docs/AUTH_PROVIDER.md)**. Set **`CAPACITY_DISABLE_LEGACY_SHARED_DSL_WRITE=1`** to stop accepting the old shared secret for PUT.

**Legacy / bootstrap:** **`CAPACITY_SHARED_DSL_SECRET`** can still authorize **PUT** when Clerk is off or during migration; it is **not** accepted for **GET** when **`CLERK_SECRET_KEY`** is set. The Workspace UI can still paste the secret for that legacy write path.

#### Enable Blob on Vercel (step by step)

1. **Open the project** in the [Vercel dashboard](https://vercel.com/dashboard) (the one connected to this repo).
2. Go to **Storage** → **Create** (or **Browse Marketplace**) → choose **Blob**.
3. **Create** a Blob store and, when prompted, **connect it to this project** so Vercel can inject env vars.
4. Open **Project → Settings → Environment Variables** and confirm **`BLOB_READ_WRITE_TOKEN`** exists for **Production** (and Preview if previews should use Blob). If the store was not linked, use the Blob store’s **Connect Project** flow, or add **`BLOB_READ_WRITE_TOKEN`** manually from the store (mark **Sensitive**).
5. **Clerk (recommended):** add **`CLERK_SECRET_KEY`** (server) and **`VITE_CLERK_PUBLISHABLE_KEY`** (build). Optionally **`CAPACITY_CLERK_AUTHORIZED_PARTIES`** listing your production (and preview) origins. **Or legacy-only:** add **`CAPACITY_SHARED_DSL_SECRET`** — long random string (e.g. `openssl rand -hex 32`); users may paste it in Workspace for writes when not using Clerk for PUT.
6. **Turn on the feature in the built app:** **`VITE_SHARED_DSL`** = **`1`** (Production, and Preview if you want it there). Redeploy after any **`VITE_*`** change so Vite embeds the new values.
7. **Redeploy** so the serverless function picks up Blob + auth env vars.

**Local:** `vercel link`, then `vercel env pull` (or copy vars into `.env.local`) and run **`vercel dev`** — plain **`pnpm dev`** does not serve `/api/*`.

**Troubleshooting — `Cannot use public access on a private store`:** Production may be running an **old** shared-dsl bundle. **Redeploy** the latest commit (optionally clear build cache). Optional **`CAPACITY_BLOB_ACCESS`**: omit or `private` for private stores; use `public` only if the Blob store is public.

#### Versioning and visibility (later)

- **Today:** Blob **ETags** / **`ifMatch`** on **PUT**; **409** conflict banner; **Pull from cloud** in Workspace. **GET** is **not** world-readable when **`CLERK_SECRET_KEY`** protects the API.
- **Next:** **Named snapshots** or audit trail → Postgres (or **per-org** blob paths). **Deployment Protection** on previews.

Handler: `api/shared-dsl.js` + `api/_shared-dsl.runtime.cjs` (built in `prebuild`).

---

## Repository map


| Area                   | Role                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `public/data/markets/` | Per-country YAML — the source of truth for the demo markets |
| `src/`                 | React UI, pipeline wiring, heatmap and summary components   |
| `api/`                 | Vercel serverless routes (e.g. shared workspace YAML)      |
| `docs/`                | Index: [docs/README.md](docs/README.md); baseline: [docs/PRODUCT_BASELINE.md](docs/PRODUCT_BASELINE.md) |


