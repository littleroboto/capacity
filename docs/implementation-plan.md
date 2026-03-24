# OWM Web Tool — Implementation Plan

Implementation plan for the Operational Weather Model GitHub Pages app. Aligned with the [OWM Web Tool Brief](file:///Users/dougbooth/.cursor/plans/owm_web_tool_brief_c15ee6b3.plan.md) and methodology in [brief.md](../brief.md).

---

## 1. Repo structure and tooling

### 1.1 Target layout

```
capacity/
  index.html                 # SPA entry (or app shell)
  brief.md
  docs/
    implementation-plan.md   # this file
    cal-heatmap-integration.md
  data/                      # static DSL + segment config (fetched at runtime)
    markets/
      UK.dsl
      DE.dsl
      FR.dsl
    segments.json            # { "Segment North": ["UK", "DE", "NL"], ... }
    holidays/                # optional: static holiday JSON per market
      UK.json
      DE.json
  src/                       # app source (or lib/ if vanilla)
    engine/                  # pure JS planning engine
      dsl-parser.js
      calendar.js
      phase-engine.js
      holiday-loader.js
      dependency-engine.js
      capacity-model.js
      risk-model.js
      simulation.js
      pilot-selector.js
    viz/
      heatmap.js             # cal-heatmap wrapper + data mapping
      timeline.js
      stats.js
    ui/
      app.js                 # root component / shell
      picker.js
      heatmap-block.js
      stat-cards.js
      timeline-block.js
      pilot-block.js
      dsl-editor.js          # Plate.js or textarea wrapper
      llm-chat.js            # BYOK chat + toggles (guarded by ?llm=1)
    storage.js               # localStorage read/write
    constants.js
  public/                    # static assets (if any)
  dist/                      # build output → GitHub Pages
  package.json
  vite.config.js             # or equivalent; base path for GitHub Pages
```

- **Build:** Vite (or similar) for dev server (`npm run dev` → localhost) and production build. Configure `base: '/<repo-name>/'` for GitHub Pages if not using a custom domain.
- **Deploy:** Push `dist/` to `gh-pages` branch or to `docs/` with GitHub Pages source = `docs/`, or use GitHub Actions to build and deploy.

### 1.2 Tech stack

| Layer | Choice | Notes |
|-------|--------|------|
| Build | Vite | Fast dev, static output, easy GH Pages |
| Framework | Vanilla JS or React | Brief allows "vanilla JS or small app shell"; React optional for Plate.js/Motion ecosystem fit |
| Heatmap | cal-heatmap | [docs/cal-heatmap-integration.md](cal-heatmap-integration.md) |
| Animation | Motion (motion.dev) | Block/card and new-data animation |
| DSL editor | Plate.js or `<textarea>` | Plate.js for rich editing; fallback textarea |
| Styling | CSS (shadcn-style tokens) | Variables for radius, shadow, typography; no dependency on shadcn React if vanilla |
| Charts (timeline, bars) | Lightweight (Chart.js, D3, or CSS bars) | Month-by-month, weekday rhythm |

---

## 2. Data contract

### 2.1 DSL → Engine

- **Input:** DSL string(s) per market (grammar in brief.md §6: `market`, `capacity`, `bau`, `campaign`, `release`, `infra`, `dependency`, `store_rhythm`). Optional: `title`, `description` (or metadata block) for plot.
- **Output (engine):** Per-row table: `date`, `market`, `system`, `phase`, `lab_load`, `backend_load`, `ops_activity`, `commercial_activity`, … → after capacity/risk: `lab_utilisation`, `team_utilisation`, `backend_pressure`, `risk_score`, `risk_band`, plus any columns for other layers (tech_activity, store_business, etc.).

### 2.2 Engine → cal-heatmap

- **Per heatmap (per market, per layer):** Array of `{ date: string (YYYY-MM-DD) or timestamp, value: number }`.
- **Mapping:** From risk table, filter by `market`, select column for layer (e.g. `risk_score`), aggregate to one value per day if needed, then `{ date, value }[]`. See [cal-heatmap-integration.md](cal-heatmap-integration.md) §3.

### 2.3 Segments

- **segments.json:** `{ "<segment_id>": ["UK", "DE", "NL"], ... }`. Picker options = `Object.keys(segments)` plus list of markets (from loaded DSLs). Resolve segment → list of market configs; run pipeline per market or union.

### 2.4 localStorage keys

- `owm_picker` (country or segment id)
- `owm_layer` (risk | tech | ops | commercial | …)
- `owm_theme` (light | dark)
- `owm_user_dsl` (user-added DSL text)
- `owm_llm_key` (optional, only if user opts in "remember in this browser")
- `owm_pilot_duration`, `owm_risk_threshold` (optional)

---

## 3. Phases and tasks

### Phase 1: Local dev and engine (weeks 1–2)

1. **Scaffold project**
   - Init npm, Vite, `index.html` entry.
   - Configure dev server and build; ensure `dist/` is deployable (GH Pages base path if needed).
   - Add `data/markets/`, `data/segments.json` placeholder.

2. **JS engine**
   - Implement **DSL parser** (brief.md §6): parse market, capacity, bau, campaign, release, infra, dependency, store_rhythm; output in-memory config (market id, capacity, bau_events, campaigns, releases, …). Optional: `title`, `description` on market or metadata block.
   - Implement **calendar**: build 5-quarter date range, one row per (date, market) initially.
   - Implement **phase engine**: expand BAU/campaign/release into (date, market, system, phase) with workload columns.
   - Implement **holiday loader**: merge static holiday list (e.g. from `data/holidays/<market>.json`) and apply modifiers (e.g. capacity scale).
   - Implement **dependency engine**: build graph, propagate dependencies.
   - Implement **capacity model**: attach lab/team/backend capacity, compute utilisation and pressure.
   - Implement **risk model**: risk_score formula (e.g. 0.35*lab_u + 0.30*team_u + 0.20*backend_p + 0.15*commercial_p), risk_band (Low/Medium/High).
   - Implement **simulation**: clone config, apply move_campaign / increase_lab_capacity / add_pilot_event, recompute.
   - Implement **pilot selector**: contiguous windows where risk ≤ threshold, duration ≥ pilot_duration_weeks.
   - **Validation:** Run against 1–2 fixture DSLs; compare risk range and band counts to known-good outputs (or snapshot once and regress).

### Phase 2: Static data and picker (week 2–3)

3. **Static data**
   - Add sample **market DSLs** (e.g. UK, DE, FR) under `data/markets/`.
   - Add **segments.json** (e.g. "Segment North" → [UK, DE, NL]).
   - Implement **load flow:** fetch `data/segments.json` and `data/markets/*.dsl` (or inlined at build); parse; build list of picker options (markets + segments).

4. **Picker and single heatmap**
   - **Header:** Country/segment picker (dropdown or tabs). On change: resolve markets, run pipeline for selected scope, store result in app state.
   - **Single heatmap:** One container; when country selected, one cal-heatmap instance; when segment, one instance per market (e.g. stacked rows). Data from engine risk table → `{ date, value }[]` per market/layer. Layer selector (risk, tech, ops, …) and date range filter; refill heatmap(s) on change.
   - **DSL metadata:** If DSL carries `title`/`description`, pass to heatmap block (card heading, subtitle/tooltip).

### Phase 3: Masonry layout and blocks (weeks 3–4)

5. **Masonry layout**
   - **Layout:** CSS Grid or masonry-style grid; shadcn-like cards (border-radius, shadow, typography).
   - **Blocks:** Heatmap block(s) (already wired); **stat cards** (peak risk month, average risk, longest low-risk window, pilot count); **timeline** (month-by-month or weekday rhythm bar chart); **pilot candidates** (table or list with window and market).
   - **Responsive:** Stack on small screens; grid on larger. Picker sticky or always visible.

6. **Motion**
   - Integrate **Motion** (motion.dev): block/card staggered entrance; heatmap block entrance; when **new data** is applied (Apply/Save or LLM insert), animate updated heatmap/stats in (e.g. stagger or fade). Respect `prefers-reduced-motion` (disable or shorten animations).

### Phase 4: User DSL and Save (week 4–5)

7. **User DSL block**
   - **Plate.js** (or `<textarea>`) for user-added DSL; label as "Potential projects" or "User DSL".
   - **Apply:** On click, merge user DSL with base (or run as scenario); recompute pipeline; update heatmap and stats; trigger Motion for new data.
   - **Save:** On click, write current DSL content to `localStorage` key `owm_user_dsl`; show brief confirmation. On load, restore into Plate.js/textarea.

8. **Restore and persistence**
   - On app load: read `owm_picker`, `owm_layer`, `owm_theme`, `owm_user_dsl` from localStorage; apply to UI and restore DSL into editor; optionally re-run pipeline so heatmaps reflect saved state.

### Phase 5: BYOK LLM (optional) (weeks 5–6)

9. **Querystring gate**
   - If `?llm=1` (or `?byok_llm=1`) not present, do not load LLM UI or request API key.
   - When present, show LLM card: API key input (with optional "remember in this browser"), chat input, and DSL-type toggles.

10. **Chat + toggles**
    - **Toggles:** BAU, campaign, release, infra, holidays, dependency (or subset). Selected type is sent as context to the LLM (system prompt or template).
    - **Chat:** User types plain-language instruction; on send, include **current DSL content** from Plate.js in the prompt so the LLM **reads and understands existing content** and **layers in** suggested changes. Call provider API (OpenAI or Anthropic); parse response for DSL block(s); **insert or merge** into Plate.js (user can then Apply or edit by hand).
    - **Security:** No key in repo; document that key in URL is unsafe; prefer in-page key field.

11. **Prompt scaffolding**
    - Per DSL-type: short system prompt + grammar hint so model outputs valid DSL. Example: "You are helping edit an operational capacity DSL. The user wants to add a BAU block. Current DSL: … User request: … Output only the new or modified DSL block(s)."

### Phase 6: Polish (week 6)

12. **Theme and a11y**
    - **Dark theme:** Toggle or follow system; persist in `owm_theme`. Apply to cards and cal-heatmap (theme option).
    - **Accessibility:** Contrast, focus states, keyboard flow; `prefers-reduced-motion` for Motion; label heatmap and controls.

13. **DSL metadata for plot**
    - If not done earlier: extend parser for `title`/`description` (e.g. `market UK title "..." description "..."`); pass to heatmap block; render as card title and subtitle or tooltip.

14. **Docs and deploy**
    - README: how to run locally (`npm run dev`), how to build and deploy to GitHub Pages. Document BYOK and key handling.
    - Ensure `data/` is available in production (fetched from repo or inlined at build).

---

## 4. Component / block list

| Block | Purpose | Data source | Notes |
|-------|---------|-------------|-------|
| Header | Picker (country/segment), theme, layer | segments.json + markets | Sticky or top |
| Heatmap card(s) | cal-heatmap per market; title/description from DSL | risk table → { date, value }[]; metadata from config | One per market in segment view |
| Stat cards | Peak month, avg risk, longest low-risk window, pilot count | risk table + pilot selector output | Shadcn-style |
| Timeline block | Month-by-month or weekday rhythm | risk table aggregated | Simple bars |
| Pilot block | Table/list of candidate windows | pilot selector output | Market, start, end, duration |
| User DSL block | Plate.js or textarea; Apply; Save | User input; localStorage | Restore on load |
| LLM block (optional) | Key input, toggles, chat, insert/merge | User key; current DSL + user message → API | Only when ?llm=1 |

---

## 5. Implementation order (checklist)

- [ ] **1. Local dev** — Vite (or equivalent), `npm run dev`, build → `dist/`
- [ ] **2. JS engine** — Parser, calendar, phases, holidays, capacity, dependencies, risk, simulation, pilot selector; fixtures
- [ ] **3. Static data** — data/markets/*.dsl, data/segments.json; load and parse
- [ ] **4. Picker + heatmap(s)** — Picker UI; cal-heatmap per market; layer/date filter; data mapping from engine
- [ ] **5. Masonry layout** — Grid, cards, stat cards, timeline block, pilot block
- [ ] **6. Motion** — Block entrance; new-data animation; reduced-motion
- [ ] **7. User DSL block** — Plate.js/textarea, Apply, Save → localStorage, restore on load
- [ ] **8. BYOK LLM** — Querystring gate; key input; chat + toggles; context = current DSL; insert/merge
- [ ] **9. Polish** — Dark theme, a11y, DSL metadata for plot, README, deploy

---

## 6. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| cal-heatmap API differs from doc | Keep [cal-heatmap-integration.md](cal-heatmap-integration.md) and repomix pack as reference; validate data shape early |
| Plate.js bundle size | Consider plain textarea + syntax hint for MVP; add Plate.js when needed for rich editing |
| LLM output not valid DSL | Prompt engineering + optional client-side parse check; show error and allow user to edit |
| GitHub Pages base path | Set Vite `base` for repo subpath; test deploy early |

---

## 7. Success criteria

- App runs on localhost and builds to static assets deployable to GitHub Pages.
- Picker (country/segment) loads repo DSLs and segments; pipeline runs; heatmaps show risk (and other layers) via cal-heatmap.
- User can add DSL in Plate.js/textarea, Apply to see effect, Save to localStorage; restore on reload.
- With `?llm=1`, user can supply key, choose DSL type, chat in plain language; LLM output is inserted into DSL field; agent reads existing DSL and layers in changes.
- New data (after Apply/Save or LLM) animates in with Motion.dev style; reduced-motion respected.
- DSL metadata (title, description) when present appears on heatmap card.
