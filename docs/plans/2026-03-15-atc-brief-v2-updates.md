# ATC Brief v2 Alignment — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the existing Operational Weather Model POC with the behaviour, data model, and UX described in `brief_v2.md`: YAML DSL, calendar heatmap with view layers, risk formula (tech 0.6 + store 0.3 + campaign 0.1), DSL editor + heatmap layout, localStorage key `atc_dsl`, scenarios, Slot Finder, and manual slot testing.

**Architecture:** Keep the current client-side pipeline (DSL → calendar → phase expansion → capacity → risk → pilot windows). Introduce a YAML-based DSL that maps to the same conceptual model; add store_pressure from trading and campaign_risk; expose view layers (Tech Pressure, Store Trading, Campaigns, Holidays, Combined Risk). UI: two-column layout (DSL editor left, heatmap right), country + view mode, apply-on-edit behaviour, scenario save/load, Slot Finder form, and drag-to-select date range for manual slot risk.

**Tech Stack:** Existing: Vite, vanilla JS, cal-heatmap, motion. Add: YAML parser (e.g. `yaml` or `js-yaml`) for DSL. Brief mentions React + TypeScript + Plotly; this plan aligns behaviour on the current stack; a separate plan can cover migration to React/TS/Plotly if desired.

---

## Current POC vs Brief v2 — Gap Analysis

| Area | Current POC | Brief v2 |
|------|-------------|----------|
| **DSL** | Custom line-based (`market DE`, `capacity labs=4`, `bau weekly_data every Mon`, `release pos_v8 deploy 2026-07-01`) | YAML: `country`, `resources.labs/teams`, `bau.weekly_promo_cycle` / `integration_tests`, `campaigns[]` (name, start, duration, impact), `holidays.auto_*`, `trading.weekly_pattern` |
| **Engine output** | `lab_load`, `team_load`, `backend_load`, `ops_activity`, `commercial_activity` → utilisation → risk_score (lab 0.35, team 0.30, backend 0.20, commercial 0.15) | Per-date: `lab_pressure`, `store_pressure`, `campaign_flag`, `holiday_flag`, `risk_score` = tech×0.6 + store×0.3 + campaign×0.1 |
| **Layers** | risk_score, tech_activity, ops_activity, commercial_activity, lab_utilisation, team_utilisation, backend_pressure | Tech Pressure, Store Trading, Campaigns, Holidays, Combined Risk |
| **UI layout** | Header (picker, layer, theme) then vertical blocks (heatmaps, risk table, pilot list, DSL assistant) | Country selector + View mode radios; two-column: DSL Editor \| Calendar Heatmap; apply changes → immediate update |
| **Storage** | `owm_picker`, `owm_layer`, `owm_theme`, `owm_user_dsl`, etc. | `localStorage["atc_dsl"]`; UI state (country, view mode, filters, scenarios) |
| **Scenarios** | None | Save/load named states (e.g. Baseline, Germany Pilot June) as JSON |
| **Slot Finder** | Auto pilot windows by duration + risk threshold only | User inputs: initiative type, systems, duration, lab requirements, BAU compatibility → highlighted recommended slots |
| **Manual slot** | None | User drags date range on calendar → show “Landing Risk: Moderate” |
| **Heatmap colours** | cal-heatmap YlGn 0–1 | Green = safe, yellow = moderate, red = unsafe (explicit bands) |

---

## Implementation Phases

### Phase 1: Storage and naming alignment

- Use `atc_dsl` for the main market DSL in localStorage (and keep existing UI state keys or alias them).
- Add scenario system: save/load named scenarios (JSON) in localStorage; list in UI.

### Phase 2: YAML DSL and engine data shape

- Add YAML parser; support brief_v2 YAML shape (country, resources, bau, campaigns, holidays, trading).
- Map YAML → internal config used by existing pipeline (or extend pipeline to accept both current and YAML-derived config).
- Derive `store_pressure` from `trading.weekly_pattern`; derive `campaign_flag` / campaign_risk from `campaigns[]` and impact.
- Add `holiday_flag` to risk surface; optionally use `holidays.auto_public` / `auto_school` to populate holiday dates (or keep loading from JSON).

### Phase 3: Risk formula and layers

- Change risk formula to: `risk_score = tech_pressure×0.6 + store_pressure×0.3 + campaign_risk×0.1`.
- Define `tech_pressure` = f(lab load, team load) and keep backend if desired; normalise to 0–1.
- Expose layers: Tech Pressure, Store Trading, Campaigns, Holidays, Combined Risk (and ensure heatmap can colour by these).

### Phase 4: UI layout and apply-on-edit

- Restructure layout: top bar = Country selector + View mode (radio) for layer.
- Main area: left = DSL editor (full market YAML), right = calendar heatmap(s).
- “Apply” or on blur/change: parse DSL, run pipeline, re-render heatmap immediately (no page reload).
- Persist current DSL to `atc_dsl` on apply/save.

### Phase 5: Heatmap presentation

- Keep cal-heatmap; change scale to green/yellow/red bands (e.g. 0–0.33 green, 0.33–0.66 yellow, 0.66–1 red) so “Combined Risk” view matches brief.

### Phase 6: Slot Finder

- Add form: initiative type, systems touched, duration, lab requirements, BAU compatibility.
- Use existing `findPilotWindows` (or extend) with these params; highlight recommended landing slots on the heatmap or in a list.

### Phase 7: Manual slot testing

- Add drag-to-select date range on calendar (or start/end date pickers).
- On selection: compute aggregate risk for that window (e.g. max or average risk_score); show “Landing Risk: Low/Moderate/High”.

### Phase 8: Scenarios

- UI: “Save scenario” (name), “Load scenario” (dropdown/list). Persist to localStorage as JSON (e.g. `atc_scenarios` = array of { name, dsl, uiState }).
- Loading a scenario restores DSL and optionally country/view mode.

---

## Task List (bite-sized)

### Task 1: Add YAML dependency and atc_dsl storage key

**Files:**
- Modify: `package.json` (add `yaml` or `js-yaml`)
- Modify: `src/constants.js` (add `atc_dsl` to STORAGE_KEYS or new ATC_KEYS)
- Modify: `src/storage.js` (add get/set for `atc_dsl` if not using generic getStored/setStored)

**Step 1:** Add YAML library.

Run: `npm install yaml` (or `js-yaml`)

**Step 2:** Add storage constant and helpers.

In `src/constants.js` add:
`atc_dsl: 'atc_dsl'`, `atc_scenarios: 'atc_scenarios'`.

In `src/storage.js` add `getAtcDsl()`, `setAtcDsl(text)` using STORAGE_KEYS.atc_dsl.

**Step 3:** Commit.

```bash
git add package.json package-lock.json src/constants.js src/storage.js
git commit -m "chore: add yaml dep and atc_dsl storage key"
```

---

### Task 2: YAML DSL parser — parse country, resources, bau (stub)

**Files:**
- Create: `src/engine/yaml-dsl-parser.js`
- Test: `src/engine/yaml-dsl-parser.test.js` (if no test runner, create a simple node script or manual test)

**Step 1:** Write a minimal YAML parser that parses the brief_v2 example structure.

- Import `yaml` (or js-yaml), parse string to object.
- Export `parseYamlDSL(dslText)` returning `{ country, resources: { labs: { capacity }, teams: {} }, bau: {}, campaigns: [], holidays: {}, trading: {} }`.
- Handle missing sections (default to empty).

**Step 2:** Add unit test or manual verification.

e.g. `parseYamlDSL(dslSample).country === 'DE'` and `resources.labs.capacity === 5`.

**Step 3:** Commit.

```bash
git add src/engine/yaml-dsl-parser.js src/engine/yaml-dsl-parser.test.js
git commit -m "feat: add YAML DSL parser (country, resources, bau stub)"
```

---

### Task 3: YAML DSL parser — map to pipeline config shape

**Files:**
- Modify: `src/engine/yaml-dsl-parser.js`
- Modify: `src/engine/dsl-parser.js` or pipeline (to accept “market config” from either parser)

**Step 1:** In yaml-dsl-parser, convert parsed YAML to the same shape expected by `runPipeline` (market, title, capacity, bau, campaigns, releases).

- Map `country` → `market`; `resources.labs.capacity` → `capacity.labs`; `resources.teams` → derive capacity.teams / team list.
- Map `bau.weekly_promo_cycle` to bau block (day, labs, support_days); `bau.integration_tests` to second BAU or combined.
- Map `campaigns[]` (name, start, duration, impact) to existing campaign shape (start, durationDays, load or impact → load).
- Leave releases empty or optional from YAML for now.

**Step 2:** Ensure pipeline and phase-engine can consume this config (same property names). Adjust dsl-parser or add a single entry point that tries YAML first, then falls back to legacy DSL if needed.

**Step 3:** Commit.

```bash
git add src/engine/yaml-dsl-parser.js src/engine/dsl-parser.js src/engine/pipeline.js
git commit -m "feat: map YAML DSL to pipeline config shape"
```

---

### Task 4: Engine — add store_pressure from trading pattern

**Files:**
- Modify: `src/engine/phase-engine.js` or `src/engine/capacity-model.js` (add trading intensity per day)
- Modify: `src/engine/calendar.js` if needed (no change if trading is per-weekday)

**Step 1:** In config shape, support `trading.weekly_pattern` (e.g. Mon: medium, Tue: medium, …, Sat: very_high). Normalise to 0–1 (e.g. low=0.25, medium=0.5, high=0.75, very_high=1).

**Step 2:** In pipeline or capacity step, for each (date, market) set `store_pressure` from the weekday’s trading value. Add to rows passed to risk model.

**Step 3:** Commit.

```bash
git add src/engine/phase-engine.js src/engine/capacity-model.js src/engine/pipeline.js
git commit -m "feat: add store_pressure from trading weekly_pattern"
```

---

### Task 5: Engine — add campaign_flag and campaign_risk per date

**Files:**
- Modify: `src/engine/phase-engine.js` (or risk-model) to set `campaign_active` and `campaign_risk` (e.g. from impact: high=0.8, very_high=1) for each date.
- Modify: `src/engine/pipeline.js` to pass these through to risk surface.

**Step 1:** For each date in calendar, if any campaign overlaps, set `campaign_active: true` and `campaign_risk` = max(impact) of overlapping campaigns. Add to daily rows.

**Step 2:** Commit.

```bash
git add src/engine/phase-engine.js src/engine/pipeline.js src/engine/risk-model.js
git commit -m "feat: add campaign_flag and campaign_risk per date"
```

---

### Task 6: Risk model — brief_v2 formula and holiday_flag

**Files:**
- Modify: `src/engine/risk-model.js`
- Modify: `src/constants.js` (RISK_BANDS unchanged; optional to add brief labels)

**Step 1:** Change risk formula to:
`risk_score = (tech_pressure * 0.6) + (store_pressure * 0.3) + (campaign_risk * 0.1)`.
Define `tech_pressure` as combination of lab_utilisation and team_utilisation (e.g. max or weighted average). Ensure `store_pressure` and `campaign_risk` are 0–1. Add `holiday_flag` to output (from isHoliday).

**Step 2:** Ensure risk surface rows include: `tech_pressure`, `store_pressure`, `campaign_active`, `campaign_risk`, `holiday_flag`, `risk_score`, `risk_band`.

**Step 3:** Commit.

```bash
git add src/engine/risk-model.js src/engine/capacity-model.js src/engine/pipeline.js
git commit -m "feat: risk formula tech 0.6 + store 0.3 + campaign 0.1, holiday_flag"
```

---

### Task 7: Constants — brief_v2 layer list

**Files:**
- Modify: `src/constants.js`

**Step 1:** Replace or extend LAYERS with: Tech Pressure, Store Trading, Campaigns, Holidays, Combined Risk. Map to keys: `tech_pressure`, `store_pressure`, `campaign_risk` (or campaign_flag), `holiday_flag`, `risk_score`.

**Step 2:** Commit.

```bash
git add src/constants.js
git commit -m "feat: layers Tech Pressure, Store Trading, Campaigns, Holidays, Combined Risk"
```

---

### Task 8: Heatmap — green/yellow/red colour scale

**Files:**
- Modify: `src/viz/heatmap.js`
- Modify: `src/constants.js` (RISK_BANDS for thresholds if needed)

**Step 1:** In cal-heatmap options, set scale.color to a custom domain/range: 0–0.33 green, 0.33–0.66 yellow, 0.66–1 red (or use cal-heatmap’s custom scale API). Ensure layer values are 0–1 for Combined Risk.

**Step 2:** Commit.

```bash
git add src/viz/heatmap.js
git commit -m "feat: heatmap green/yellow/red risk bands"
```

---

### Task 9: UI — two-column layout (DSL editor | heatmap)

**Files:**
- Modify: `src/ui/app.js`
- Modify: `src/styles.css`

**Step 1:** Restructure render(): header with Country selector and View mode (radio buttons for each layer). Main content: two-column grid — left column = DSL editor (textarea with current market YAML), right column = heatmap container(s). Move risk surface / pilot list below or into a collapsible section.

**Step 2:** Commit.

```bash
git add src/ui/app.js src/styles.css
git commit -m "feat: two-column layout DSL editor | heatmap"
```

---

### Task 10: UI — load/save atc_dsl and apply on button

**Files:**
- Modify: `src/ui/app.js`
- Modify: `src/storage.js` (already have getAtcDsl/setAtcDsl)

**Step 1:** On load, if `atc_dsl` is set, use it as initial DSL for selected country; else fall back to dslByMarket[country] or sample YAML. Add “Apply” button: parse DSL (YAML), run pipeline, re-render heatmap. On Apply, call setAtcDsl(editorValue). If parse fails, show inline error.

**Step 2:** Wire country selector to load that market’s DSL into editor (from dslByMarket or atc_dsl per country — decide schema: one atc_dsl for “current” or per-country keys; brief says one `atc_dsl`, so single current config is fine).

**Step 3:** Commit.

```bash
git add src/ui/app.js
git commit -m "feat: load/save atc_dsl, apply DSL updates heatmap"
```

---

### Task 11: Scenarios — save/load named states

**Files:**
- Modify: `src/storage.js` (getScenarios, saveScenario, loadScenario)
- Modify: `src/constants.js` (atc_scenarios key)
- Modify: `src/ui/app.js` (UI: scenario name input, Save scenario, Load scenario dropdown)

**Step 1:** Scenarios = array of `{ id, name, dsl, picker, layer }`. getScenarios() returns list; saveScenario(name, state) appends; loadScenario(id) returns state. Persist in localStorage under atc_scenarios.

**Step 2:** In app, add “Save as scenario” (prompt for name) and “Load scenario” (select from list). On load, set editor content, picker, layer and run pipeline + render.

**Step 3:** Commit.

```bash
git add src/storage.js src/constants.js src/ui/app.js
git commit -m "feat: scenarios save/load named states"
```

---

### Task 12: Slot Finder — form and recommended slots

**Files:**
- Modify: `src/ui/app.js` (form: initiative type, systems, duration, lab req, BAU compatibility)
- Modify: `src/engine/pilot-selector.js` (optional: accept extra filters)

**Step 1:** Add Slot Finder section: form fields (initiative type, systems touched, duration, lab requirements, BAU compatibility). On “Find slots”, use existing findPilotWindows with duration and risk threshold; display results as “Recommended landing slots” list. Optionally highlight those windows on the heatmap (e.g. overlay or list with dates).

**Step 2:** Commit.

```bash
git add src/ui/app.js src/engine/pilot-selector.js
git commit -m "feat: Slot Finder form and recommended slots list"
```

---

### Task 13: Manual slot testing — date range selection and risk label

**Files:**
- Modify: `src/ui/app.js` (date range inputs or drag on heatmap)
- Modify: `src/viz/heatmap.js` (optional: emit range selection event)

**Step 1:** Add “Manual slot” UI: start date and end date (inputs or from heatmap click/drag). When range is set, filter riskSurface to that range and market, compute max or average risk_score; map to Low/Moderate/High and show “Landing Risk: Moderate” (or equivalent).

**Step 2:** If cal-heatmap supports range selection, wire it; else use two date pickers. Commit.

```bash
git add src/ui/app.js src/viz/heatmap.js
git commit -m "feat: manual slot testing with date range and landing risk"
```

---

### Task 14: Holiday data — optional auto_public / auto_school

**Files:**
- Modify: `src/engine/holiday-loader.js` or new `src/engine/holiday-calc.js`
- Modify: `src/engine/yaml-dsl-parser.js` (pass holidays config to pipeline)

**Step 1:** If `holidays.auto_public: true` or `auto_school: true`, optionally generate a list of dates for the market (e.g. use a simple rule or static list per country). Merge with any fetched holiday JSON. This can be a stub (e.g. UK public holidays 2026) and extended later.

**Step 2:** Commit.

```bash
git add src/engine/holiday-loader.js src/engine/yaml-dsl-parser.js
git commit -m "feat: optional holiday auto_public/auto_school stub"
```

---

### Task 15: Documentation and sample YAML

**Files:**
- Create or modify: `public/data/markets/DE.yaml` (or keep .dsl and add .yaml sample)
- Modify: `README.md` (describe YAML DSL, layers, scenarios, Slot Finder, manual slot)

**Step 1:** Add sample YAML file matching brief_v2 example (country DE, resources, bau, campaigns, holidays, trading). Update README with how to use DSL editor, view modes, scenarios, and slot finder.

**Step 2:** Commit.

```bash
git add public/data/markets/DE.yaml README.md
git commit -m "docs: sample YAML and README for brief v2"
```

---

## Verification

- Load app; select country; paste brief_v2 YAML into editor; Apply → heatmap updates with no reload.
- Switch view mode → heatmap shows Tech Pressure, Store Trading, Campaigns, Holidays, Combined Risk.
- Save scenario → reload page → load scenario → same DSL and view.
- Slot Finder: set duration 14 days → see recommended slots.
- Manual slot: pick range → see “Landing Risk: Low/Moderate/High”.
- localStorage has `atc_dsl` and `atc_scenarios` after use.

---

## Reference

- Spec: `brief_v2.md`
- Current entry: `src/main.js` → `src/ui/app.js`; pipeline: `src/engine/pipeline.js`; heatmap: `src/viz/heatmap.js`; storage: `src/storage.js`.
