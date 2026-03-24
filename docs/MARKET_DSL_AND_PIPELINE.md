# How the market DSL drives the simulation

This document explains **how the system works** from YAML to the runway heatmap, with emphasis on **DSL features** and what each field *means* in the model.

For planning-domain layering, pressure surfaces, and export shapes, see [PLANNING_ARCHITECTURE.md](./PLANNING_ARCHITECTURE.md). For LLM-assisted authoring, see [LLM_MARKET_DSL_PROMPT.md](./LLM_MARKET_DSL_PROMPT.md).

---

## 1. End-to-end flow

1. **Input** — One or more YAML documents (separated by `---`). Each document is one **market** (`country` code). Files live under `public/data/markets/*.yaml`; `manifest.json` lists which ids the app loads.
2. **Parse** — `parseAllYamlDocuments` / `yamlToPipelineConfig` in `src/engine/yamlDslParser.ts` produce a typed **`MarketConfig`** per document (`src/engine/types.ts`).
3. **Calendar** — A shared date grid is built for all loaded markets (`buildCalendar`).
4. **Phase expansion** — `expandPhases` walks each day and applies **BAU**, **tech weekly rhythm**, and **campaign** prep/live rules. Loads are tagged into **pressure surfaces** (bau, change, campaign, carryover) for explainability.
5. **Aggregation** — Daily totals per market (lab/team/backend/ops/commercial, split readiness vs sustain where relevant).
6. **Carry-over** — `applyLoadCarryover` adds backlog-style spill from **intrinsic** overload (not from carry-in alone), applied **before** operating-window scaling.
7. **Operating windows** — Date-bounded multipliers (and optional ramps) adjust loads and sometimes **effective lab+team capacity**.
8. **School stress** — On school-holiday days, `stress_correlations.school_holidays` multipliers apply (loads up, optional capacity down).
9. **Store pressure** — Trading weekly pattern + optional **seasonal** cosine + pipeline extras (e.g. December retail seasoning; Australia post-Christmas summer lift) feed **store_pressure** and risk blending.
10. **Capacity & risk** — Nominal caps come from `resources`; holidays can taper capacity. **Risk** combines utilisation, headroom, store/campaign signals, then optional **heatmap gamma** and **transfer curve** for colour mapping.

The result is a per-day **`RiskRow`** series rendered as the runway grid and tooltips.

---

## 2. Top-level DSL structure

| Section | Purpose |
| --- | --- |
| `country` | Market id (e.g. `DE`, `AU`). Becomes `MarketConfig.market`. |
| `resources` | Nominal **capacity**: lab slots and summed team sizes. |
| `bau` | Repeating weekly spikes (promo cycle, integration tests). |
| `campaigns` | Named programmes with prep and live (or presence-only) loads. |
| `operating_windows` | Named calendar windows that scale loads or tighten capacity. |
| `holidays` | Flags for auto public/school stubs + optional capacity taper near holidays. |
| `stress_correlations` | Extra multipliers when **school** holidays apply. |
| `trading` | Weekly store-trading intensity + optional **seasonal** peak month/amplitude. |
| `tech` | Weekly tech rhythm scaled into lab/team readiness load. |
| `risk_heatmap_gamma` | Optional exponent on the score before palette mapping (clamped in parser). |
| `risk_heatmap_curve` | Optional transfer curve id (`power`, `linear`, `sigmoid`, …). |

**Dates:** Prefer quoted strings (`'2026-04-07'`). Some YAML loaders turn unquoted `YYYY-MM-DD` into `Date` objects and break lexicographic comparisons.

**Multi-document:** Paste several markets in one editor buffer separated by `---`; the parser returns one `MarketConfig` per document.

---

## 3. `resources`

- **`resources.labs.capacity`** — Number of parallel lab-style units (default 5 if missing).
- **`resources.teams`** — Arbitrary named groups; **`size`** values are **summed** into total “team” capacity. Optional `sme_depth` is accepted in YAML for documentation; it is not used in the numeric engine today.

Backend nominal capacity in config is fixed for pipeline purposes; the meaningful knobs for backend are loads in campaigns/BAU, not this section.

---

## 4. `bau` (business-as-usual)

Supported shapes (you can combine multiple):

- **`weekly_promo_cycle`** (and alias-style **`weekly_promo`**) — `day` (`Sun`–`Sat`), `labs`, `support_days` (extends the spike across following weekdays).
- **`integration_tests`** — `day`, `labs`.

Mapped internally to **`BauEntry`** rows with weekday and a small lab load. BAU contributes to the **bau** surface and baseline lab load.

---

## 5. `campaigns`

Each item is a programme with a **go-live date** (`start`), **live window** (`duration` days), and optional **prep**.

### 5.1 Lead model (preferred)

When **`prep_before_live_days`** is set:

- **Prep** runs on `[start − prep_before_live_days, start)` using **`load`** (readiness / change intensity).
- **Live** runs on `[start, start + duration)` using **`live_support_load`** if any keys are present; otherwise live segment uses **`load * live_support_scale`** (default scale **0.45** if unspecified).

**`load`** and **`live_support_load`** are **partial** objects: each dimension is optional (`labs`, `teams`, `backend`, `ops`, `commercial`). Omitted keys behave as zero where the engine applies that phase.

### 5.2 Alternative: readiness duration

If you omit `prep_before_live_days` but set **`readiness_duration`** (or camelCase equivalent), the **first N days** of the interval `[start, start + duration)` use `load`, and the remainder use `live_support_load` (or scaled `load`). This is an older shape; the lead model is usually clearer for “build then launch”.

### 5.3 `impact`

`low` | `medium` | `high` | `very_high` — drives **campaign_risk** metadata (0.25 → 1.0) and, if **`commercial`** is omitted from `load`, fills a default commercial readiness value from the same scale.

### 5.4 `presence_only: true`

Marks the campaign on the calendar for **presence / risk** purposes **without** adding phase loads. Use when the real load is already modeled elsewhere (e.g. **`operating_windows`**) to avoid double-counting.

### 5.5 Staggered functional prep (`stagger_functional_loads`)

When **`true`** (with `prep_before_live_days`), prep is **not** flat across the whole prep window. Instead:

- **Tech** (`labs`, `teams`, `backend` from `load`) applies only in a **late prep band**: by default the last **42** calendar days of prep, but ending **14** days before go-live (`tech_finish_before_live_days` buffer). Tunable: `tech_prep_days_before_live`, `tech_finish_before_live_days`.
- **Commercial** (`commercial` from `load`) applies in the last **30** days before go-live by default (`marketing_prep_days_before_live`).
- **Ops** (`ops` from `load`) applies in the last **21** days before go-live in prep (`supply_prep_days_before_live`); **live** ops still come from **`live_support_load.ops`**.

This matches a common QSR pattern: engineering finishes early with a cut-over buffer; marketing ramps into stores; supply prepares closer to launch; restaurant intensity peaks in **live**.

### 5.6 Load semantics

Numbers are **dimensionless multipliers / relative intensity**, not FTE. Typical bands: higher values on **labs/teams** during build; higher **ops/commercial** during live. Keep one market self-consistent so comparisons across time make sense.

---

## 6. `operating_windows`

A list of **named, inclusive date ranges** `[start, end]` with optional **multipliers**:

- Load side: `store_pressure_mult`, `lab_load_mult`, `team_load_mult`, `backend_load_mult`, `ops_activity_mult`, `commercial_activity_mult`.
- Capacity side: `lab_team_capacity_mult` (&lt; 1 tightens effective lab+team cap).

**Ramps:** `ramp_in_days` / `ramp_out_days` with **`envelope`**: `smoothstep` (default when ramping), `linear`, or `step`. The effective multiplier **blends** from 1 toward the configured value using the envelope over the window edges.

Overlapping windows **stack** (multiplicatively) where both apply.

---

## 7. `holidays`

- **`auto_public`** / **`auto_school`** — Merge stub holiday date sets from `holidayCalc` for that market into the pipeline (public vs school tracked separately for flags and stress).
- **`capacity_taper_days`** — Smoothly increases “holiday proximity” stress over nearby days (clamped), feeding capacity softening rather than a hard on/off.

---

## 8. `stress_correlations`

Currently the engine uses **`school_holidays`**: when the day is a **school** holiday (per auto stubs or merged lists), apply the given multipliers to loads and optionally **`lab_team_capacity_mult`** for effective cap.

Public holidays still set `holiday_flag` but use this block only when the day is also school or when combined flags drive other logic; the YAML name reflects “extra load when schools are out.”

---

## 9. `trading`

- **`weekly_pattern`** — For each weekday name (`Sun`–`Sat`), a level: `low`, `medium`, `high`, `very_high`. These map to numeric store-pressure contributions.
- **`seasonal`** — `peak_month` (1–12) and `amplitude` (capped in parser, e.g. ≤ 0.6) define a gentle annual cosine on store pressure so summer vs winter markets differ without hand-editing every day.

The pipeline may apply additional market-specific seasoning (e.g. December retail, AU summer) on top of this.

---

## 10. `tech`

- **`weekly_pattern`** — Same level vocabulary as trading; drives recurring **tech rhythm** loads (scaled into lab/team readiness).
- **`labs_scale`**, **`teams_scale`**, **`backend_scale`** — Scale factors for that rhythm (sensible defaults if omitted).

---

## 11. Heatmap tuning

- **`risk_heatmap_gamma`** — After the main risk score is computed, the heatmap index may use **score γ** (gamma is clamped to a safe range in the parser). Some **`risk_heatmap_curve`** ids ignore or reinterpret gamma; see `RISK_HEATMAP_CURVE_OPTIONS` in `src/lib/riskHeatmapTransfer.ts`.

These affect **visualisation**, not the underlying load math.

---

## 12. `releases` (typed, rarely in YAML)

`MarketConfig` includes **`releases`** for phased deploy shapes. The main market YAML path today emphasizes **campaigns**; releases are part of the type system for future or advanced bundles.

---

## 13. Operational notes

- **Determinism:** Core loads, parsing, carry-over, and blend weights are deterministic for a given YAML. A small **operational noise** layer may still add visual jitter to risk unless tuned off.
- **New markets:** Add `XX.yaml`, run **`npm run generate:markets`** (or rely on `dev` / `prebuild`) so **`manifest.json`** includes the id.
- **Build output:** `dist/data/markets/` is emitted from `public/`; treat **`public/data/markets/`** as source of truth.

---

## 14. File reference

| Concern | Location |
| --- | --- |
| YAML → `MarketConfig` | `src/engine/yamlDslParser.ts` |
| Config types | `src/engine/types.ts` |
| Phase / surface expansion | `src/engine/phaseEngine.ts` |
| Pipeline order & weighting | `src/engine/pipeline.ts`, `src/engine/weighting.ts` |
| Carry-over | `src/planning/carryover.ts` |
| Capacity | `src/engine/capacityModel.ts` |
| Risk + surfaces in output | `src/engine/riskModel.ts` |
