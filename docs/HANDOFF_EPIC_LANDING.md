# Handoff: Landing page & first-run story

**Epic:** [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) — `epic-landing`  
**Stack context:** React 18 + Vite 6 SPA, `base: './'` ([`vite.config.ts`](../vite.config.ts)). **No client router today** — single bundle mounts `App` at `/` ([`src/main.tsx`](../src/main.tsx)). Optional Clerk **sign-in gate** wraps the full app ([`SignInGate`](../src/components/SignInGate.tsx)).

This document is a **design + build-ready handoff**: it inventories today’s entry experience, names gaps versus the epic goal, proposes routing and content options, and breaks work into verifiable slices.

---

## 1. Epic goal (product)

**Goal:** A proper **marketing / entry** experience before (or beside) the heavy workbench shell.

**Outcomes (from backlog):** New visitors understand the product; a clear path into the workspace; optional SEO (title, meta, OG) if the deployment is public.

**Dependencies:** Optional alignment with **`epic-auth-org`** — e.g. real “Sign in” CTA on the landing page vs today’s global gate ([`HANDOFF_EPIC_USER_ORG_ENTERPRISE.md](./HANDOFF_EPIC_USER_ORG_ENTERPRISE.md)).

---

## 2. Current behaviour (inventory)

### 2.1 First paint

| Piece | Role |
| --- | --- |
| [`index.html`](../index.html) | Document title / OG: **Segment Workbench**; favicon; theme boot script; single `#root`. |
| [`src/main.tsx`](../src/main.tsx) | `SignInGate` → `ClerkProvider` (if key) → `ClerkSharedDslBridge` → **`App`** (full workbench). No intermediate marketing screen. |
| [`src/App.tsx`](../src/App.tsx) | Header, runway grid / DSL panel, bootstrap of markets + optional shared DSL. |

**Implication:** First-time visitors with **Clerk enabled** see **sign-in UI immediately**, not a product story. Without Clerk, they land **directly in the experiment** with no narrative frame.

### 2.2 Product naming (duplicated strings)

The same experiment title appears in multiple places (keep in mind for a single “brand line” later):

- `index.html` `<title>`
- [`Header.tsx`](../src/components/Header.tsx) — `<h1>` (compact and default layouts): **Segment Workbench** + `SegmentWorkbenchMark`

### 2.3 Auth and “entry”

| Piece | Role |
| --- | --- |
| [`SignInGate`](../src/components/SignInGate.tsx) | When Clerk is configured and auth not disabled, children render only after sign-in. |
| [`ProductionAuthHintBanner`](../src/components/ProductionAuthHintBanner.tsx) | Amber hint when publishable key missing in production build. |

There is **no** dedicated “Sign in” button on a pre-app page — sign-in **is** the gate.

### 2.4 Routing and hosting

- **No `react-router`** (or similar) in dependencies; deep linking is effectively **query params** only (e.g. `?llm` for assistant — see [`MainDslWorkspace`](../src/components/MainDslWorkspace.tsx)).
- **Vercel:** static SPA from `dist`; `api/*` serverless. For **`/app`**-style paths, ensure **fallback to `index.html`** for client routes (Vite + Vercel usually handled via framework preset or explicit rewrite).

### 2.5 Docs that already describe the product

- [`README.md`](../README.md) — positioning paragraph, Vercel/Clerk/Blob setup.
- [`docs/PRODUCT_BASELINE.md`](./PRODUCT_BASELINE.md) — what ships today (runway lenses, shared workspace POC).

---

## 3. Gaps vs epic (problem statement)

1. **No dedicated landing:** Value prop, screenshots, and “enter app” are not separated from the workbench.
2. **SEO / share cards:** `index.html` has minimal meta; no OG/Twitter tags for a public link preview.
3. **First-run overload:** New users hit heatmaps, YAML, and controls without a guided story (optional onboarding is out of scope unless added to this epic).
4. **Auth UX coupling:** Clerk gate = entire app; a landing might want **anonymous read** of marketing + explicit **Sign in to open workspace** (product decision — may overlap `epic-auth-org`).

---

## 4. Target design (recommended direction)

### 4.1 Principles

- **One URL strategy:** Pick either **(A)** marketing at `/` and app at `/app` (or `/workbench`), or **(B)** landing as a **modal / first-visit overlay** with `#/` still the app (lighter routing change, worse SEO separation).
- **Single source for title/tagline** where possible (constant or small config module consumed by `index.html` via Vite plugin, or accept duplication with a comment pointer).
- **Clerk:** Decide whether landing is **inside** or **outside** `SignInGate`; outside allows public marketing + CTA into gated app.

### 4.2 Options (trade-offs)

| Approach | Pros | Cons |
| --- | --- | --- |
| **A — `react-router-dom`** — `/` = `LandingPage`, `/app` = current `App` | Clear separation; bookmarkable app; SEO on `/` | New dependency; Vercel rewrites; refactor `main.tsx` tree |
| **B — Hash or query gate** — e.g. `/?view=home` | No server rewrite | Ugly URLs; weak SEO |
| **C — Landing as routeless component** toggled by `sessionStorage` “seen intro” | Tiny diff | Easy to skip; poor SEO; stateful |

**Recommendation:** **A** if the site is public and you care about OG + clean links; **C** only for a quick internal experiment.

### 4.3 SEO (if public)

- Set `<title>`, `<meta name="description">`, Open Graph (`og:title`, `og:description`, `og:image`), Twitter card.
- `og:image` needs a static asset under `public/` (designed screenshot or logo).

### 4.4 Non-goals (this epic)

- Full **onboarding tour** inside the runway (could be a follow-up).
- Replacing **README** content — landing should **link** to docs/GitHub, not duplicate runbooks.

---

## 5. Implementation slices (suggested order)

### Story 1 — Router skeleton + `/app`

- Add **`react-router-dom`** (version aligned with React 18).
- **`/`** → new `LandingPage` (placeholder hero + “Open workbench” → navigate to `/app`).
- **`/app`** → existing workbench (`App`); preserve Clerk wrapper behaviour (likely wrap **router** inside `ClerkProvider`, gate only **`/app`** or entire tree per product choice).
- **Vercel:** SPA fallback so `/app` loads `index.html` (verify after deploy).

**Acceptance:** Direct navigation to `/app` loads the current experience; `/` shows landing without loading heavy runway first paint (lazy route acceptable).

### Story 2 — Landing content (MVP)

- Short value prop (reuse README first paragraph or tighten).
- Primary CTA: **Open workbench** (`/app`); secondary: **Docs** (link `README` anchor or `docs/` on GitHub if public).
- Optional: one **hero visual** (static image in `public/`).

**Acceptance:** A non-engineer understands what the tool is from `/` alone.

### Story 3 — Meta + title

- Update **`index.html`** defaults **or** inject per-route head (e.g. `react-helmet-async` or small `useEffect` on `document.title` for `/app` vs `/`).
- Add OG tags for `/`.

**Acceptance:** Shared link shows sensible title/description/image (validate with a debugger or social preview tool).

### Story 4 — Clerk alignment (optional)

- If marketing should be **public:** render **`LandingPage` outside `SignInGate`**; wrap only **`/app`** (or a layout route) with gate.
- Landing **Sign in** button uses Clerk `SignInButton` / navigate to `/app` where gate applies.

**Acceptance:** Signed-out user sees landing + CTA; signed-in user can jump straight to workbench.

---

## 6. Testing and verification

- **Manual:** Cold load `/` and `/app`; refresh; back button; production build `pnpm run build` + `pnpm preview`.
- **Clerk:** Sign-out on landing, sign-in path to `/app` (if Story 4).
- **Vercel:** After deploy, hit production `/app` directly (no 404 HTML from edge).

---

## 7. Critical file map

| Concern | Location |
| --- | --- |
| Entry / providers | [`src/main.tsx`](../src/main.tsx) |
| Workbench root | [`src/App.tsx`](../src/App.tsx) |
| Sign-in gate | [`src/components/SignInGate.tsx`](../src/components/SignInGate.tsx) |
| Header title copy | [`src/components/Header.tsx`](../src/components/Header.tsx) |
| Document shell | [`index.html`](../index.html) |
| Base URL / build | [`vite.config.ts`](../vite.config.ts) |
| Product copy reference | [`README.md`](../README.md), [`docs/PRODUCT_BASELINE.md`](./PRODUCT_BASELINE.md) |
| Auth handoff | [`HANDOFF_EPIC_USER_ORG_ENTERPRISE.md`](./HANDOFF_EPIC_USER_ORG_ENTERPRISE.md) |

---

## 8. Open decisions (capture before coding)

1. **Public marketing vs gated whole app** — Should `/` be readable without Clerk? (Drives Story 4 and `SignInGate` placement.)
2. **Path names** — `/app` vs `/workbench` vs `/studio`.
3. **Lazy loading** — Code-split `App` so landing bundle stays small (recommended for Story 1).

---

*Last updated: aligns with backlog epic `epic-landing` and repo layout as of handoff authoring.*
