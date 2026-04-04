# Operational capacity runway — documentation

Single-page app: **YAML DSL → calendar engine → risk surface → week-based runway heatmap** (7 columns = Mon–Sun). This document describes what is implemented, what is stubbed, and **exactly** how the DSL maps to numbers.

---

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173/`). Use **Apply DSL** after editing YAML. DSL is persisted under `localStorage` key `atc_dsl` (see [Browser storage](#browser-storage)).

---

## Architecture (data flow)

1. **Parse** — `js-yaml` loads one or more YAML documents → `MarketConfig[]` per market.
2. **Calendar** — For each market, build daily rows from **quarter start (today’s quarter)** for **`MODEL_MONTHS` (15)** months.
3. **Phase expansion** — BAU patterns, campaigns, and optional **releases** add per-day **loads** (labs, Market IT, backend, ops, commercial). Campaign rows can split **readiness** vs **live/support** using `readiness_duration` + `live_support_load`.
4. **Aggregate** — Sum loads per `(date, market)`.
5. **Store & campaign meta** — `trading.weekly_pattern` → **store_pressure**; campaigns → **campaign_risk** / **campaign_presence**; separate **public** vs **school** auto lists → **public_holiday_flag** / **school_holiday_flag**; **holiday_flag** = either (used for capacity scaling & optional combined-risk holiday term).
6. **Capacity** — Convert loads to utilisations using **labs / Market IT / backend** capacity; holidays scale lab & Market IT capacity by a fixed **0.5** (50%).
7. **Risk** — Combine **tech_pressure**, **store_pressure**, **campaign_risk** into **risk_score** (0–1) and **risk_band** (used for tooltips, band labels, and planning helpers — not the default heatmap cell value).
8. **Display noise** — Deterministic jitter on **`risk_score`** and **`tech_pressure`** (`src/engine/dataNoise.ts`); **`risk_band`** is recomputed from the noised **`risk_score`**. The **Business** lens is driven mostly by **`store_pressure`** and is **not** given the same jitter.
9. **UI** — Filter surface by **header country** (or **all markets** side-by-side); build **vertical month stacks** (each month = Mon–Sun weeks); colour cells from **`heatmapCellMetric`** (`src/lib/runwayViewMetrics.ts`) for the active lens (10-step palette after γ + transfer curve).

---

## What is built

| Area | Details |
|------|---------|
| **Stack** | React 18, TypeScript, Vite, Tailwind, Radix/shadcn-style UI, Zustand, Monaco Editor, `@visx/group`, `@use-gesture/react`, `js-yaml` |
| **Layout** | Header (country dropdown includes **All markets**, view mode, dark mode) · **DSL panel** (Monaco, Apply / Reset / Save scenario) · **Runway** (full week grid; scroll the main column) |
| **YAML DSL** | Single or **multi-document** YAML (`---`) for multiple markets in one file |
| **Parser** | `src/engine/yamlDslParser.ts` → `src/engine/types.ts` (`MarketConfig`) |
| **Pipeline** | `src/engine/pipeline.ts` orchestrates calendar → phases → capacity → risk → noise |
| **Runway** | **7 days wide** (Mon–Sun) per month; **months stacked vertically** in one column (Q1–Q4 labels on Jan / Apr / Jul / Oct). **All markets**: one column per market, horizontal scroll, shared colour scale |
| **Heatmap colour** | 10-step green→red from the **active lens metric** after γ and transfer curve (`heatmapCellMetric` → `src/lib/riskHeatmapColors.ts`). **Technology** (`combined`): **`technologyHeadroomHeatmapMetric`**. **Restaurant** (`in_store`): **`inStoreHeatmapMetric`** / **`store_pressure`**. **Market risk** (`market_risk`): **`deployment_risk_01`**. Not raw **`risk_score`**. |
| **View modes** | **Technology Teams** (`combined`), **Restaurant Activity** (`in_store`), **Market risk** (`market_risk`), **Code** (`code`); legacy ids map via `normalizeViewModeId` in `src/lib/constants.ts`. |
| **Slot selection** | Drag rectangle aggregates the **same lens metric** as the heatmap (`heatmapCellMetric`); no footer readout while status bar is absent |
| **Scenarios** | Save/load named scenarios in `localStorage` (`atc_scenarios`) |
| **Guards** | Reject HTML/page source in editor/storage; sane `public/` URLs (`src/lib/dslGuards.ts`, `src/lib/publicUrl.ts`) |
| **Market templates** | `public/data/markets/*.yaml` only (fetched at runtime; bundled `?raw` seeds as fallback) |

---

## What is stubbed, partial, or not in this UI

| Item | Status |
|------|--------|
| **AI assistant** | Copy-only placeholder in `DSLPanel`; no API, no streaming (old `?llm=1` flow removed) |
| **Releases** | Optional top-level **`releases:`** → `MarketConfig.releases` (see [Releases](#releases-yaml)); omit or `[]` if none |
| **Pilot / Slot Finder** | Not present in current React shell (removed with legacy app) |
| **Legacy line-based `.dsl`** | Not supported; only YAML |
| **Holidays** | **`auto_public` / `auto_school`** use **multi-year stubs (2026–2028+)** in `holidayCalc.ts` so a full **15-month / five-quarter** runway from any quarter start still hits holiday/school flags. **AU, UK, DE, FR, CA** lists differ by market. Not a real holiday API. Optional JSON under `data/holidays/` is **not** wired into the pipeline |
| **`integration_tests.frequency`** | Ignored (only `day` and `labs` matter) |
| **`teams.*.sme_depth`** | Ignored for capacity (only **`size`** summed) |
| **Backend capacity** | Fixed **1000** in config; not read from YAML |
| **Segments** | `public/data/segments.json` still expands the **country dropdown** market list only |
| **Display noise** | **Not** part of the “true” model; cosmetic jitter on **`risk_score`** and **`tech_pressure`** after calculation (`src/engine/dataNoise.ts`) |

---

## DSL specification (YAML)

### Documents

- **One document** → one market (`country`).
- **Multiple documents** separated by `---` → multiple markets in one editor; pipeline runs all.
- **Default bundle**: on first load (no `atc_dsl` in `localStorage`), the app concatenates every shipped `public/data/markets/{AU,CA,DE,ES,FR,IT,PL,UK}.yaml` into **one multi-doc** in the editor (`mergeMarketsToMultiDocYaml`). **Reset** restores that same merged file (not a single country).
- **Header → Country** picks focus for γ patching and single-column runway; it does **not** replace the editor with one market when the buffer already holds valid YAML (so multi-doc stays intact).
- **All markets** (`country` value `__ALL__` in app state only — not a YAML `country:` key): one heatmap column per `country` document in the applied YAML.

### Top-level shape

```yaml
country: DE                    # Market id; becomes pipeline market key

resources:
  labs:
    capacity: 5                # Integer; default 5 if missing
  teams:                       # Optional map of named teams
    pos_team:
      size: 4                  # Summed for Market IT capacity; default total 4 if no sizes
      sme_depth: 2             # Parsed in YAML but NOT used in engine

bau:
  weekly_promo:                # Optional; same rules as weekly_promo_cycle
    day: Tue                   # Sun..Sat string
    labs: 2                    # Lab load on anchor day
    support_days: 2            # Support window length in weekdays (see rules below)
  weekly_promo_cycle:          # Optional; duplicate concept, both can exist
    day: Tue
    labs: 2
    support_days: 2
  integration_tests:         # Optional
    frequency: weekly          # NOT used by engine
    day: Thu
    labs: 1

campaigns:
  - name: summer_campaign
    start: 2026-06-10          # YYYY-MM-DD
    duration: 14               # Days; end = start + duration (exclusive end day)
    impact: high               # low | medium | high | very_high (case-insensitive match)

holidays:
  auto_public: true            # Merges stub public dates for this market
  auto_school: true            # Merges stub school-ish dates (same for all markets)

trading:
  weekly_pattern:              # Optional; keys must be Mon..Sun
    Mon: medium
    Tue: medium
    # ... low | medium | high | very_high
```

### Rules by section

#### `country`

- **Required** for a meaningful config; if empty and nothing else qualifies, parser may still yield a row with defaults.
- String; used as **`market`** everywhere (calendar, maps, header filter).

#### `resources.labs.capacity`

- **Number** of lab “slots” for utilisation denominator.
- Default **5** if missing or invalid.

#### `resources.teams`

- Each child object may have **`size`** (number).
- **Team capacity** = sum of all `size`; if sum is **0**, engine uses **6**.

#### `bau.weekly_promo` / `bau.weekly_promo_cycle`

Both use the same mapping:

| Field | Rule |
|-------|------|
| `day` | Weekday name (`Sun` … `Sat`). Invalid/missing → **Tuesday** (`Tue`). |
| `labs` | Non-negative number; **lab_load** on the anchor weekday. |
| `support_days` | Integer; if **0**, treated like **1** for span. **Support window**: same weekday index through **`min(6, weekday + support_days - 1)`** inclusive. On those weekdays, additional **BAU support** rows add **0.5 ×** the same `labs` load (see phase engine). |

**Anchor weekday**: full **1.0 × labs** on `day`. **Support days**: **0.5 × labs** on each weekday from `supportStart` through `supportEnd` (inclusive), **including** overlapping with anchor (anchor day gets both contributions if it lies in range).

If **both** `weekly_promo` and `weekly_promo_cycle` are present, **both** BAU entries are applied (duplicate load if configured identically).

#### `bau.integration_tests`

| Field | Rule |
|-------|------|
| `day` | Weekday; default **Thu**. |
| `labs` | Lab load on that weekday only (scale **1.0**). |
| `frequency` | **Ignored**. |

#### `campaigns[]`

| Field | Rule |
|-------|------|
| `name` | String; default `"campaign"`. |
| `start` | Start date string; parsed as local calendar date. |
| `duration` | **Integer days**; active interval **`[start, start + duration)`** (start inclusive, end exclusive). |
| `impact` | Maps to default **commercial** load factor: `low→0.25`, `medium→0.5`, `high→0.8`, `very_high→1`. Unknown → **0.5**. |
| `load` | Optional object: **`labs`**, **`teams`**, **`backend`**, **`ops`**, **`commercial`** (numbers). Merged with `impact`: explicit `load.commercial` overrides the impact mapping. |
| `readiness_duration` | Optional positive integer. If set, the first **N** days of the campaign interval use **`load`** for **readiness** (change) work; remaining days use **`live_support_load`** for **live / hypercare / on-call** style scheduling. If omitted, the whole interval is tagged **readiness** (same as before). |
| `live_support_load` | Optional partial load object (same keys as `load`). Used only after `readiness_duration` days; omitted keys count as **0** for that segment. |
| `presence_only` | If **true**, does not add phase loads; still counts for **campaign_presence** / **campaign_risk** (use with `operating_windows` to avoid double-counting). |
| `replaces_bau_tech` | If **true** (alias `replacesBauTech`), on **prep** and **live** days where this campaign adds **labs / Market IT / backend** (same resolution as the phase engine), the main **`weekday_intensity`** rhythm is skipped and **BAU** loads have those three buckets zeroed (ops/commercial unchanged) so the campaign **replaces** the weekly tech/BAU pipe instead of stacking. Live-only ops/commercial does not strip BAU tech. Default **false**. |

**Phase engine** adds **commercial_load** (and any **labs** / **teams** / etc. from `load` or `live_support_load`) on each active day. BAU and releases are always tagged **readiness**; campaign days use **readiness** vs **sustain** per the rules above.

**Risk model**: **tech_pressure** still uses **total** scheduled load vs capacity (unchanged for the **Technology** heatmap lens). **tech_readiness_pressure** and **tech_sustain_pressure** are not separate header views; they remain on each row for **Technology** tooltips (readiness vs live/support breakdown) and do **not** sum to **tech_pressure**.

**Pipeline** also computes **campaign_risk** for risk formula: same interval; **campaign_risk** = max of mapped impact across overlapping campaigns. **campaign_presence** = **1** if any campaign active, else **0**.

#### `holidays`

| Key | Rule |
|-----|------|
| `auto_public` | If true, append market’s **stub** public holiday date list (`holidayCalc.ts`). |
| `auto_school` | If true, append that market’s **stub** school-break calendar (`holidayCalc.ts`: AU NSW Eastern, UK England-style, DE NRW-style, FR Zone B–style, CA Ontario-style). |

Auto public dates and auto school dates are kept in **separate** per-market sets. **`public_holiday_flag`** / **`school_holiday_flag`** reflect each; **`holiday_flag`** is true if **either** applies (and drives lab / Market IT capacity scaling).

#### `stress_correlations` (optional)

| Key | Rule |
|-----|------|
| `school_holidays` | When **`school_holiday_flag`** is true for a day, optional multipliers adjust **loads**, **store_pressure**, and **lab / Market IT capacity**. |

Under `school_holidays`, all keys are optional numbers (defaults = no change when omitted):

| Key | Effect |
|-----|--------|
| `store_pressure_mult` | Multiply **store_pressure** after the weekly pattern (clamped to 1). |
| `lab_load_mult`, `team_load_mult`, `backend_load_mult` | Multiply aggregated loads before utilisation. |
| `ops_activity_mult`, `commercial_activity_mult` | Multiply those activity fields (feeds phase aggregates when present). |
| `lab_team_capacity_mult` | Extra multiplier on **labsCap** and **teamsCap** in `computeCapacity` (stacked with holiday scale; &lt; 1 = tighter capacity). |

#### `operating_windows` (optional)

Array of named **inclusive** date ranges (`start` / `end` as `YYYY-MM-DD`) with the same optional multiplier keys as `school_holidays`, including **`lab_team_capacity_mult`** on **labsCap** / **teamsCap** (multiplies together with the school-holiday cap mult when both apply). Applied to loads / **store_pressure** **before** school-holiday stress; cap mults are read again in `computeCapacity`. Multiple windows on the same day **stack**. **`store_pressure`** can exceed 1.0 here; `computeRisk` still clamps **store_pressure** to 1 for the risk blend.

#### `releases` (optional)

Array of deploy-shaped **change** loads (same expansion as engine `ReleaseConfig`). Omitted or `[]` means no release rows.

| Field | Rule |
|-------|------|
| `deploy_date` / `deployDate` | Optional ISO date; if omitted, engine infers from calendar (see `phaseEngine` `inferDeployDate`). |
| `systems` | Non-empty string array (e.g. `POS`, `Mobile`) — each names a **system** column in expanded rows. |
| `phases` | Non-empty array of `{ name, offset_days \| offsetDays }` — integer day offset from deploy date. |
| `load` | Object of numeric buckets (`labs`, `teams`, `backend`, `ops`, `commercial`, …) applied on each phase date. |

Each phase date adds **readiness** / **change** surface load for `(system × phase)`.

#### `title` / `description` (optional)

- **`title`** — Shown in runway focus picker and compare-column tooltips when different from `country`; defaults to **`country`**.
- **`description`** — Parsed into `MarketConfig` for future UI; optional narrative for authors.

#### `trading.weekly_pattern`

- Keys **`Mon` … `Sun`** (must match exactly as shown; lookup uses `Date.getDay()` → name).
- Values: **`low`**, **`medium`**, **`high`**, **`very_high`** (case-insensitive when read from YAML in practice).
- Maps to **store_pressure** 0–1: `low→0.25`, `medium→0.5`, `high→0.75`, `very_high→1`; unknown key → **0.5**.
- Missing pattern or missing day → **0** for that day.

---

## Engine rules (numbers)

### Calendar

- **Start**: First day of the **current calendar quarter** containing “today” (local), unless overridden internally (currently always quarter start from “now”).
- **End**: Start **+ `MODEL_MONTHS` months** (15 → about five quarters, ≥ one year of days).
- One row per **(date, market)** for each config’s market.

### Phase expansion → loads

Loads are **additive** per expanded row, then **summed** per day.

| Source | Effect |
|--------|--------|
| BAU anchor day | `lab_load += labs` (and `teams` if ever set in load; YAML BAU only sets `labs`) |
| BAU support | `lab_load += 0.5 * labs` on support weekdays |
| Campaign | `commercial_load += impact_factor` |
| Release phases | If `releases` non-empty in config (from YAML or tests), per-phase loads on given dates |

If YAML omits **`releases`**, the list is empty.

### Capacity (`computeCapacity`)

- **lab_utilisation** = `min(1, lab_load / labsCap)`
- **team_utilisation** = `min(1, team_load / teamsCap)` (Market IT lane; YAML `resources.teams` / `capacity.teams`)
- **backend_pressure** = `min(1, backend_load / backendCap)`
- **labsCap** = `capacity.labs * (holiday ? holidayCapacityScale : 1) * labTeamCapMult` (**school** `stress_correlations` × each active **`operating_windows.lab_team_capacity_mult`**, e.g. Oktoberfest)
- **teamsCap** = `capacity.teams * (holiday ? holidayCapacityScale : 1) * labTeamCapMult`
- **backendCap** unchanged by holiday in current code

### Tech pressure & risk (`computeRisk`)

- **tech_pressure** = `compress(min(1, max(lab_utilisation, team_utilisation)))` — backend utilisation is **not** included in this headline (combined **risk_score** still uses **tech_pressure** as the tech term)
- **tech_demand_ratio** = `max(lab_load_ratio, team_load_ratio)` — uncapped; drives Technology heatmap fill when using full combined tech scope
- **store_pressure** = from trading pattern (already 0–1)
- **campaign_risk** = from campaigns (0–1)
- **risk_score** = `0.6 * tech_pressure + 0.3 * store_pressure + 0.1 * campaign_risk` (then rounded to 2 decimals)
- **risk_band**: Low if ≤ 0.33, Medium if ≤ 0.66, else High

### Display noise (`withOperationalNoise`)

- Adds deterministic **±`RISK_SCORE_NOISE_AMPLITUDE`** (default **0.028** half-range) to **`risk_score`** and the same delta to **`tech_pressure`**, clamps **0–1**, rounds 2 dp, recomputes **`risk_band`** from **`risk_score`**.
- **`store_pressure`** and **`campaign_risk`** are unchanged in the row.

### Heatmap colour (runway cells)

- **Input** = **`heatmapCellMetric(row, viewMode, riskTuning)`** — Technology lens uses **`tech_demand_ratio`** (max lab vs Market IT; **not** noise-jittered); BAU/project scopes use the same max on merged surfaces. **`tech_pressure`** (after noise) feeds the combined-risk **tech** term only. Business lens uses **`inStoreHeatmapMetric`** = **`store_pressure` / `STORE_PRESSURE_MAX`** clamped 0–1 (restaurant busyness; **`store_pressure`** is not noise-jittered).
- **index** = `floor(clamp(transformedMetric,0,1) * 9)` into a fixed **10-colour** array (green → red), after per-lens γ and optional **stress cutoff** dimming (UI-only; see `MARKET_DSL_AND_PIPELINE.md`).
- **`risk_score`** remains the weighted **tech / store / campaign** blend for banding and explanations where the UI shows “combined risk,” not for default cell fill.

---

## Runway UI rules

- **Columns**: exactly **7**, **Monday → Sunday**.
- **Rows**: one per **ISO-style week** (Monday week start) overlapping the model’s first/last day; leading/trailing weekdays outside range are **grey**.
- **Gutter**: Monday’s date (`MM-DD`).
- **Data column**: risk for **`country`** equal to **Header → Country** only.
- **Viewport**: tries for at least **~53 week-rows** of scroll area when the panel is tall enough (`RunwayGrid` + `MIN_WEEKS_VISIBLE`).

---

## Browser storage

| Key | Purpose |
|-----|---------|
| `atc_dsl` | Last applied / edited YAML |
| `atc_scenarios` | JSON array of `{ id, name, dsl, picker, layer }` |
| `owm_picker` | Selected country code |
| `owm_layer` | View mode id |
| `owm_theme` | `light` / `dark` |
| `capacity-atc` (Zustand persist) | Partial: country (may be `__ALL__` for All markets), viewMode, theme, risk tuning |

---

## Source map (main modules)

| Path | Role |
|------|------|
| `src/App.tsx` | Shell, loads `public/data` templates, builds default multi-doc |
| `src/lib/mergeMarketYaml.ts` | Join per-market YAML with `---` for default / reset |
| `src/store/useAtcStore.ts` | State, apply/reset/hydrate |
| `src/components/Header.tsx` | Country, view, scenario, theme |
| `src/components/DSLPanel.tsx` | Monaco + actions + AI placeholder |
| `src/components/RunwayGrid.tsx` | Week grid, list, tooltips |
| `src/components/SlotOverlay.tsx` | Drag selection |
| `src/engine/pipeline.ts` | Full pipeline |
| `src/engine/yamlDslParser.ts` | YAML → configs |
| `src/engine/calendar.ts` | Timeline |
| `src/engine/phaseEngine.ts` | BAU / campaign / release expansion |
| `src/engine/campaignPrepLive.ts` | Shared campaign prep vs live segment (pipeline meta + phase expansion) |
| `src/engine/capacityModel.ts` | Utilisation |
| `src/engine/riskModel.ts` | Risk |
| `src/engine/dataNoise.ts` | Display jitter |
| `src/engine/holidayCalc.ts` | Stub auto holidays |
| `src/lib/weekRunway.ts` | Week strip builder |
| `src/engine/calendarEngine.ts` | Thin exports / timeline helper |

---

## Version note

This document matches the **React + TypeScript** runway app. Older README references (legacy DSL file format, cal-heatmap-only UI, pilot finder) are **not** current unless reintroduced in code.
