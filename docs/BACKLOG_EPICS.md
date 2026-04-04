# Product backlog — epics

Structured for prioritization and for breaking into **engineering plans** (human or agent). Each epic lists **goal**, **scope hints**, **dependencies**, and **suggested outcomes**.

**Naming:** **Runway auto-plan** (epic below) is an **in-app feature**—suggested initiative slots from runway analysis. **Roadmap** at the bottom is **build order** for these epics, not that feature.

---

## Epic: Data model — segments, countries, and markets

**Goal:** Let the product add **new runway segments** and **new countries/markets** without deep code changes each time.

**Scope (indicative):**

- Manifest-driven or config-driven market list (extend `generate-market-manifest`, `public/data/markets/*`, runway ordering).
- Clear contract: what a “segment” means in DSL + UI (filters, columns, rules).
- Validation and seeds for new ISO / region entries.
- Docs or internal checklist for “add a country” (YAML + assets + manifest).

**Dependencies:** None (foundational).

**Outcomes:** Checklist or script path to ship a new market; fewer hard-coded assumptions in UI and DSL parsing.

**Tags:** `data`, `markets`, `segments`

---

## Epic: Landing page & first-run story

**Goal:** A proper **marketing / entry** experience before the heavy app shell (or alongside it).

**Scope (indicative):**

- Route structure: `/` landing vs `/app` (or similar) if the tool stays SPA-heavy.
- Value prop, screenshots or demo, link to docs / GitHub if public.
- Optional: auth entry points placeholder (Sign in) for future user model.
- SEO basics (title, meta, OG) if public.

**Dependencies:** Optional alignment with **User & org model** if login CTA is real.

**Outcomes:** New visitors understand the product; clear path into the workspace.

**Tags:** `marketing`, `ux`, `routing`

---

## Epic: User, org, and permissions (foundation)

**Goal:** **Identity and tenancy** so shared workspaces, billing, and audit are sane later.

**Scope (indicative):**

- Provider choice (e.g. Clerk, Auth0) vs minimal custom JWT.
- Org/team entity, membership, role (viewer / editor / admin).
- Map “team workspace” to `workspace_id` / org; retire or wrap shared secret as bootstrap only.

**Dependencies:** None for MVP auth shell; **blocks** secure PartyKit, comments attribution, version history “who.”

**Outcomes:** `userId`, `orgId` available in client and API; protected routes pattern.

**Tags:** `auth`, `foundation`, `multi-tenant`

**Handoff (implementation):** [HANDOFF_EPIC_USER_ORG_ENTERPRISE.md](./HANDOFF_EPIC_USER_ORG_ENTERPRISE.md)

---

## Epic: Real-time collaborative editing (Yjs + PartyKit)

**Goal:** **Multiple editors** in the same workspace without last-write-wins over HTTP Blob alone.

**Scope (indicative):**

- PartyKit project, `y-partykit` server, deploy + env (`VITE_PARTYKIT_HOST`, room id strategy).
- Client: `Y.Doc`, provider lifecycle, feature flag.
- `y-monaco` (or chosen binding) for workspace YAML; single `Y.Text` MVP then optional split by market.
- Hydration from current load path (Blob/local); define single writer to Zustand for collab buffer.

**Dependencies:** **User & org** (or interim shared secret) for **connection auth** on PartyKit; optional coexistence with Blob checkpoint.

**Outcomes:** Two browsers see live edits; reconnect behavior documented.

**Tags:** `collab`, `partykit`, `yjs`, `monaco`

---

## Epic: Workspace version control & history

**Goal:** **Named or timed snapshots**, diff, restore — distinct from CRDT sync (complementary).

**Scope (indicative):**

- Storage: Postgres (or Blob versioned keys) + `version`, `created_at`, `created_by`, optional label.
- API: list versions, get version, restore (with confirm).
- UI: timeline or list, diff view (Monaco diff or textual).
- Policy: auto-save snapshot debounce vs manual “Save version.”

**Dependencies:** **User & org** for attribution; **Collaborative editing** defines whether snapshots capture Yjs export or merged YAML from server.

**Outcomes:** Users can roll back and audit “what changed when.”

**Tags:** `versioning`, `history`, `postgres`, `ux`

---

## Epic: Runway auto-plan (initiative slot finder)

**Goal:** The user gives the system a **project / initiative type** (and rough shape—duration, prep, constraints). The system uses **runway heatmap analysis, pressure, and resourcing** to propose **where to drop it on the calendar**—not just “find a gap,” but a **suggested slot** that respects how tight tech and business load already are.

**Scope (indicative):**

- **Project taxonomy:** Structured input (type, duration, prep, optional flags)—UI form or natural language that normalizes to that structure.
- **Per-market tech / capability config:** Each market carries **YAML (or sidecar) describing the tech stack / lanes** the reasoner must respect (what “counts” as competing load, what stacks can run which initiative classes). Intended to be **LLM-legible** so an assistant can apply policy consistently; deterministic rules can ship first.
- **Analysis inputs:** Existing engine outputs—daily risk, lab/team/backend loads, campaign prep/live windows, holidays, trading pressure—fed as **structured context** (not a screenshot) into scoring +/or LLM.
- **Output:** **Suggested slot** (date range, market(s), confidence or rationale bullets); optional “alternates” ranked second/third.
- **Explicit non-goal for v1:** Pure “first empty week” without pressure awareness—that’s a different, weaker feature.
- **Later input:** **Corporate calendar & deployment risk** (`epic-corporate-calendar-risk`)—Q4 fragility, earnings, shareholder and franchisee events—as hard or soft constraints on slot scoring.

**Dependencies:** **Data model / markets** (stable ids, manifest); runway pipeline outputs already available in-app. **User & org** optional for saving favourite project templates; not required for a read-only suggester POC.

**Outcomes:** PM or planner can request “slot for initiative X” and get a defensible calendar recommendation grounded in current YAML + stack config.

**Tags:** `autoplan`, `slot-finder`, `runway`, `heatmap`, `llm`, `planning`

**Epic id:** `epic-runway-autoplan`

---

## Epic: Corporate calendar & deployment risk windows

**Goal:** Make **business-calendar risk** first-class in planning—not only tech load and store trading, but **when markets are unwilling or extra-vulnerable to big change** because of how the year closes and how external events can derail communications.

**Product narrative (why it matters):**

- **Q4 / year-end:** Trading year closing and figures being finalised raise the cost of mishaps; early in the year, gaps can sometimes be **recovered through more aggressive promotional activity**, but **late Q4** stacks **holiday period**, **higher baseline trade**, and **no runway to recover** if something goes wrong (e.g. tech or ops issues)—a “perfect storm” for deployment risk.
- **Corporate / market events:** Locals may avoid large deployments ahead of **earnings calls**, **shareholder meetings**, or **franchisee co-op meetings**, where **external events** can derail the narrative regardless of delivery quality—risk is as much **reputational and coordination** as utilisation.

**Scope (indicative):**

- **Capture in model:** Optional DSL or sidecar (per market or segment)—e.g. named **blackout windows**, **elevated-risk bands** (Q4 default curve), or **event types** with dates (earnings, AGM, co-op) that feed **scoring** or **auto-plan** constraints rather than changing tech capacity math directly.
- **UI:** Surface these windows on the runway (overlay, legend, tooltip lines) and/or feed **Runway auto-plan** so suggested slots **avoid** or **penalise** them explicitly.
- **Separation of concerns:** Keep **Technology Teams** heatmap as **scheduled work vs capacity**; corporate risk is an **additional lane** or **planning multiplier** on combined risk / slot finder—aligned with the existing split between tech KPIs and store-trading rhythm.

**Dependencies:** **Data model / markets**; **Runway auto-plan** is the natural consumer once windows exist as structured data. Can ship **documentation + YAML convention** before full engine support.

**Outcomes:** Planners can encode “no-go” or “high-caution” periods with a defensible story; slot finder and combined risk can reflect **calendar fragility**, not only utilisation.

**Tags:** `risk`, `calendar`, `q4`, `planning`, `dsl`, `runway`

**Epic id:** `epic-corporate-calendar-risk`

---

## Epic: In-app chat

**Goal:** **Team communication** inside or beside the workspace (contextual to org/workspace).

**Scope (indicative):**

- Product choice: embed (e.g. provider) vs custom (channels, messages table, realtime).
- Realtime transport (PartyKit channel, Ably, Supabase Realtime, etc.).
- Persistence, search, notifications (stretch).

**Dependencies:** **User & org** strongly; rooms keyed by `workspace_id` or `org_id`.

**Outcomes:** Members can message without leaving the app.

**Tags:** `chat`, `realtime`, `social`

---

## Epic: Comments (contextual annotations)

**Goal:** **Threaded comments** tied to DSL lines, markets, or UI regions — not the same as chat.

**Scope (indicative):**

- Anchor model: line range in YAML, or `marketId` + optional line, or component id.
- CRUD API + store; resolve/delete/moderation for org admins.
- Optional: realtime “someone commented” via same stack as chat.

**Dependencies:** **User & org**; stable identifiers in DSL or file path.

**Outcomes:** Review and async feedback on plans without editing the YAML.

**Tags:** `comments`, `collaboration`, `review`

---

## Epic: Shared workspace hardening (current Blob path)

**Goal:** Keep **non-collab** Blob save/load trustworthy until Postgres + PartyKit (or version API) own the story.

**Scope (indicative):**

- POC currently has **no** multi-tab stale toast; users **Pull from cloud** when needed. Revisit **server `version` + optional banner** when auth lands.
- Optional migration to **integer version** in DB; clearer conflict UX in-app.

**Dependencies:** Overlaps **Collaborative editing** and **Version control**.

**Outcomes:** Predictable saves, honest 409 handling, documented limits.

**Tags:** `shared-dsl`, `blob`, `reliability`

---

## Epic: Runway lens naming & surface consistency

**Goal:** **Control labels, runway headings, and tooltips** use the same vocabulary so execs and planners aren’t reconciling “Technology Teams” vs “tech headroom” or “Market risk” vs “deployment / calendar risk.”

**Scope (indicative):**

- Align `VIEW_MODES` labels with `runwayHeatmapTitle` and glossary copy (`src/lib/constants.ts`, `runwayDayDetailsGlossary`, README / PRODUCT_BASELINE).
- Short lens names + one-line subtitles where radio space is tight (e.g. Technology capacity / headroom; Deployment & calendar risk).
- Sweep header, legend, and day-detail strings for the old names; keep legacy `normalizeViewModeId` mappings for persisted keys.

**Dependencies:** None.

**Outcomes:** One clear name per lens everywhere in the UI; docs match shipped strings.

**Tags:** `ux`, `copy`, `runway`

**Epic id:** `epic-runway-lens-naming`

---

## Epic: Heatmap — continuous spectrum (interpolated ramp)

**Goal:** **Differentiate heavy-load days** beyond ten solid bands by interpolating colour along the existing anchor palette (same ten stops, smooth RGB lerp between neighbours).

**Scope (indicative):**

- Use `heatmapColorContinuous` (already in `riskHeatmapColors.ts`) for spectrum cell fills instead of/in addition to `heatmapColorDiscrete`; optional **Settings** toggle: banded vs smooth (default TBD).
- Update **legend** (`HeatmapLegend`, swatch helpers): gradient strip or ticked ramp so it matches cells; adjust `heatmapLegendSwatchAtBand` / call sites if legend stays discrete for reference only.
- Keep **mono** mode behaviour; ensure tooltips / export still describe “temperature” scale honestly.
- Optional later: perceptual lerp (OKLab) if RGB mid-tones feel muddy.

**Dependencies:** None.

**Outcomes:** Finer visual distinction in the red/orange head of the scale; legend truthful to mapping.

**Tags:** `heatmap`, `visual`, `runway`

**Epic id:** `epic-heatmap-continuous-spectrum`

---

## Epic: Day summary & cell detail — information architecture

**Goal:** Clicking a cell yields a **scannable** story: what the **tile colour means** for the active lens first; long KPI / blend copy is **secondary**, not one wall of text.

**Scope (indicative):**

- **Lead block:** one sentence + headline metric (`fillMetricHeadline`, `fillMetricValue`, risk band) per lens; progressive disclosure (“How this is calculated” collapsed or tab).
- **Shorten repetitive strings** in `runwayTooltipBreakdown.ts` (e.g. `pressureSurfaceLines`, `techReadinessSustainExplanation`) — one shared footnote for “tighter lane; backend excluded” instead of repeating per bullet.
- **Surface breakdown:** small table or compact rows (`Surface | scheduled | free`) vs four near-duplicate sentences.
- **Separate** “this heatmap’s paint” from **planning blend / combined risk** so users aren’t confused in one scroll (`RunwayDayDetailsBody`, `RunwayCellTooltip` / side panel).
- Popover = minimal; side panel = optional depth (existing `presentation` split).

**Dependencies:** None; aligns with lens naming epic for terminology.

**Outcomes:** Faster comprehension; less copy fatigue; easier onboarding.

**Tags:** `ux`, `tooltips`, `runway`, `copy`

**Epic id:** `epic-day-summary-ia`

---

## Epic: Isometric runway (3D) — visual polish & label stability

**Goal:** **Iso skyline / city block** feels as intentional in **light mode** as in dark mode; **month / quarter / year** labels don’t subtly drift with responsive SVG scaling.

**Scope (indicative):**

- **Theme-aware empty / pad styling:** replace fixed `EMPTY_*` RGB in `RunwayIsoHeatCell` with tokens or CSS variables so light backgrounds don’t look like dark-mode leftovers; tune pad cells and strokes for contrast.
- **Label drift:** review `RunwayIsoSkyline` (`preserveAspectRatio`, expanded viewBox, `moMatrix` text); consider **HTML overlay** axis for month/quarter/year or pixel-snapping / separate SVG band.
- **Compare-all** path: same treatment in `RunwayIsoCityBlock`.
- Optional: subtle column outline in light mode for separation.

**Dependencies:** None.

**Outcomes:** Cohesive light/dark iso views; readable chronology axis at common breakpoints.

**Tags:** `visual`, `runway`, `3d`, `a11y-contrast`

**Epic id:** `epic-iso-runway-polish`

---

## Epic: View settings vs scenario data — clarity & presets

**Goal:** Users understand **what travels with the team** (YAML / Blob workspace) vs **what is personal** (browser persistence in `useAtcStore`), and can share **heatmap / filter preferences** without forking markets.

**Scope (indicative):**

- **In-app copy:** short explainer near Workspace / Controls (market YAML vs “my view settings on this device”).
- **Export / import JSON** for UI-only state: curves, γ, tail power, filters, 3D toggle, heatmap style — separate from YAML export (optional names e.g. “CFO view”).
- **Later:** optional team-default `ui_state` in Blob or YAML sidecar — only if product wants shared defaults without polluting canonical DSL.
- Document in PRODUCT_BASELINE / README when shipped.

**Dependencies:** None; complements **Shared workspace hardening** and **User & org** for server-side presets later.

**Outcomes:** Less “why does my heatmap look different?” confusion; shareable view presets.

**Tags:** `ux`, `settings`, `workspace`, `dx`

**Epic id:** `epic-view-settings-presets`

---

## Epic: Enterprise readiness — quality, access, and trust (cross-cutting)

**Goal:** Raise the bar toward **enterprise-standard** delivery without replacing epics above: accessibility, observability, procurement-facing basics, and identity extensions.

**Scope (indicative):**

- **Accessibility:** tabular or textual **alternate** for heatmap summaries; keyboard path for cell selection already partial — extend where gaps remain.
- **Observability:** client error reporting / RUM for heavy runway views; serverless route health for `api/*`.
- **Identity extensions (after `epic-auth-org`):** SSO / SAML where provider supports it; SCIM stretch.
- **Trust:** export bundle includes **engine / schema version** narrative for reproducibility; security FAQ pointers (Blob read path until auth, etc.).
- **Data lifecycle hooks:** retention / delete story documented for when Postgres + orgs exist (may overlap **Version control**).

**Dependencies:** **User & org** for SSO and tenant delete; some items can start earlier (a11y, client errors).

**Outcomes:** Clearer compliance story; fewer silent failures in production.

**Tags:** `enterprise`, `a11y`, `observability`, `security`

**Epic id:** `epic-enterprise-readiness`

---

## Roadmap: suggested implementation phase order

Use this as a default **dependency-aware sequence** when scheduling engineering work. Epics in the same phase can sometimes run in parallel if staffed.

| Phase | Epics | Notes |
|-------|--------|--------|
| **1 — Foundation** | Data model (segments/countries), Landing page (lite), Shared workspace polish (optional) | Baseline in [PRODUCT_BASELINE.md](./PRODUCT_BASELINE.md). |
| **1b — Runway experience** | **Lens naming**; **Continuous heatmap**; **Day summary IA**; **Iso 3D polish**; **View settings & presets** | Parallel UX/visual work; no hard deps on auth. Ids: `epic-runway-lens-naming`, `epic-heatmap-continuous-spectrum`, `epic-day-summary-ia`, `epic-iso-runway-polish`, `epic-view-settings-presets`. **Agent handoff (naming + day-summary IA):** [HANDOFF_PHASE_1B_RUNWAY_UX.md](./HANDOFF_PHASE_1B_RUNWAY_UX.md). |
| **2 — Planning intelligence** | **Runway auto-plan** (slot finder); **Corporate calendar & deployment risk** (optional, feeds constraints / scoring) | Auto-plan uses runway + stack config; corporate windows extend DSL/scoring when ready—see `epic-corporate-calendar-risk`. |
| **3 — Identity** | User, org, and permissions | Unblocks everything that needs “who.” |
| **4 — Collab core** | Yjs + PartyKit | After auth story for rooms; can use secret-gated MVP before full JWT. |
| **5 — History** | Workspace version control | Needs stable YAML export + user ids. |
| **6 — Comms** | Comments, then Chat (or Comments first if review is higher priority) | Both need identity; comments often smaller than full chat. |
| **7 — Enterprise quality** | **Enterprise readiness** (a11y, observability, SSO extensions, reproducible exports) | Cross-cutting; SSO/tenant hooks after **User & org**. Id: `epic-enterprise-readiness`. |

### Dependency graph (mermaid)

```mermaid
flowchart TD
  A[Segments and countries]
  B[Landing page]
  C[Shared DSL hardening]
  U1[Runway lens naming]
  U2[Continuous heatmap]
  U3[Day summary IA]
  U4[Iso runway polish]
  U5[View settings presets]
  P[Runway auto-plan slot finder]
  R[Corporate calendar risk windows]
  D[User org permissions]
  Q[Enterprise readiness]
  E[Yjs PartyKit]
  F[Version control]
  G[Comments]
  H[Chat]
  A --> C
  A --> P
  A --> R
  R --> P
  D --> E
  D --> F
  D --> G
  D --> H
  D --> Q
  E --> F
  C --> E
  U1 -.-> U3
```

### Machine-friendly epic ids

Use in issues or plan scripts: `epic-markets`, `epic-landing`, `epic-runway-autoplan`, `epic-corporate-calendar-risk`, `epic-auth-org`, `epic-partykit-yjs`, `epic-versioning`, `epic-comments`, `epic-chat`, `epic-shared-dsl-hardening`, `epic-runway-lens-naming`, `epic-heatmap-continuous-spectrum`, `epic-day-summary-ia`, `epic-iso-runway-polish`, `epic-view-settings-presets`, `epic-enterprise-readiness`.

---

## How to turn epics into sprint plans

1. Pick a **phase** or **epic id** (e.g. `epic-runway-autoplan`).
2. Expand into **stories** (vertical slices): e.g. “schema for per-market stack config in YAML,” “slot scorer from `RiskRow[]`,” “LLM prompt + structured output for suggestion.”
3. For each story, list **files likely touched** (search codebase) and **acceptance criteria** (testable).
4. Run implementation in **one epic at a time** unless dependencies are satisfied.

When you’re ready, name an epic id and ask for a **sprint-sized plan** — we can turn it into an ordered task list against this repo.
