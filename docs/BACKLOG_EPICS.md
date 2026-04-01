# Product backlog — epics

Structured for prioritization and for breaking into plans (human or automated). Each epic lists **goal**, **scope hints**, **dependencies**, and **suggested outcomes**.

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

## Auto-plan: suggested phase order

Use this as a default **dependency-aware sequence** when generating implementation plans. Epics in the same phase can sometimes run in parallel if staffed.

| Phase | Epics | Notes |
|-------|--------|--------|
| **1 — Foundation** | Data model (segments/countries), Landing page (lite), Shared workspace polish (optional) | Baseline in [PRODUCT_BASELINE.md](./PRODUCT_BASELINE.md). |
| **2 — Identity** | User, org, and permissions | Unblocks everything that needs “who.” |
| **3 — Collab core** | Yjs + PartyKit | After auth story for rooms; can use secret-gated MVP before full JWT. |
| **4 — History** | Workspace version control | Needs stable YAML export + user ids. |
| **5 — Comms** | Comments, then Chat (or Comments first if review is higher priority) | Both need identity; comments often smaller than full chat. |

### Dependency graph (mermaid)

```mermaid
flowchart TD
  A[Segments and countries]
  B[Landing page]
  C[Shared DSL hardening]
  D[User org permissions]
  E[Yjs PartyKit]
  F[Version control]
  G[Comments]
  H[Chat]
  A --> C
  D --> E
  D --> F
  D --> G
  D --> H
  E --> F
  C --> E
```

### Machine-friendly epic ids

Use in issues or plan scripts: `epic-markets`, `epic-landing`, `epic-auth-org`, `epic-partykit-yjs`, `epic-versioning`, `epic-comments`, `epic-chat`, `epic-shared-dsl-hardening`.

---

## How to “auto-plan” from here

1. Pick a **phase** or **epic id**.
2. Expand epic into **stories** (vertical slices): e.g. “PartyKit dev server + env wiring,” then “provider + empty Y.Doc,” then “y-monaco on one buffer.”
3. For each story, list **files likely touched** (search codebase) and **acceptance criteria** (testable).
4. Run implementation in **one epic at a time** unless dependencies are satisfied.

When you’re ready, name an epic id (e.g. `epic-partykit-yjs`) and ask for a **sprint-sized plan** — we can turn it into a ordered task list against this repo.
