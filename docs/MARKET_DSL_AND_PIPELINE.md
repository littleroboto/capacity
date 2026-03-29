# How the market DSL drives the simulation

This document explains **how the system works** from YAML to the runway heatmap, with emphasis on **DSL features** and what each field *means* in the model.

For planning-domain layering, pressure surfaces, and export shapes, see [PLANNING_ARCHITECTURE.md](./PLANNING_ARCHITECTURE.md). For LLM-assisted authoring, see [LLM_MARKET_DSL_PROMPT.md](./LLM_MARKET_DSL_PROMPT.md).

---

## 1. End-to-end flow

1. **Input** — One or more YAML documents (separated by `---`). Each document is one **market** (`country` code). Files live under `public/data/markets/*.yaml`; `manifest.json` lists which ids the app loads.
2. **Parse** — `parseAllYamlDocuments` / `yamlToPipelineConfig` in `src/engine/yamlDslParser.ts` produce a typed **`MarketConfig`** per document (`src/engine/types.ts`).
3. **Calendar** — A shared date grid is built for all loaded markets (`buildCalendar`).
4. **Phase expansion** — `expandPhases` walks each day and applies **BAU**, **tech weekly rhythm**, **campaign** prep/live rules, and optional **`tech_programmes`** (same timing shape as campaigns, but tech load only — **change** surface, no campaign/trading uplift). Loads are tagged into **pressure surfaces** (bau, change, campaign, carryover) for explainability.
5. **Aggregation** — Daily totals per market (lab/team/backend/ops/commercial, split readiness vs sustain where relevant).
6. **Carry-over** — `applyLoadCarryover` adds backlog-style spill from **intrinsic** overload (not from carry-in alone), applied **before** operating-window scaling.
7. **Operating windows** — Date-bounded multipliers (and optional ramps) adjust loads and sometimes **effective lab+team capacity**.
8. **School stress** — On school-holiday days, `stress_correlations.school_holidays` multipliers apply (loads up, optional capacity down).
9. **Store pressure** — Trading weekly pattern + optional **monthly_pattern** and **seasonal** cosine, then **code-only** regional seasoning (see §9a), then early-month boost shape, windows, campaigns, holidays.
10. **Capacity & risk** — Nominal caps come from `resources`; holidays can taper capacity. **Risk** combines utilisation, headroom, store/campaign signals into **`risk_score`**. **Runway cell colour** uses **lens metrics** (`tech_pressure` for Technology, **`inStoreHeatmapMetric`** for Business) after γ + curve — not raw **`risk_score`** (see [CAPACITY-RUNWAY.md](./CAPACITY-RUNWAY.md)).

The result is a per-day **`RiskRow`** series rendered as the runway grid and tooltips.

---

## 2. Top-level DSL structure

| Section | Purpose |
| --- | --- |
| `market` | Preferred market id (`DE`, `AU`, …). Legacy **`country`** still parses; both become `MarketConfig.market`. |
| `title` / `description` | Optional display strings; `title` defaults to market id. |
| `releases` | Optional phased deploy loads (`systems` × `phases` × `load`); see [CAPACITY-RUNWAY.md](./CAPACITY-RUNWAY.md). |
| `resources` | **`labs.capacity`**, **`staff.capacity`** (FTE-style team cap); legacy **`teams.*.size`** still sums to the same cap. |
| `bau` | Preferred: **`days_in_use`** + **`weekly_cycle`** (`labs_required`, `staff_required`, optional `support_days`) + optional **`integration_tests`**. Legacy `weekly_promo_cycle` / `weekly_promo` still supported. |
| `campaigns` | List or map. Preferred keys: **`start_date`**, **`testing_prep_duration`**, **`campaign_support`** (`tech_staff`, `labs_required`, …), **`live_campaign_support`**, **`business_uplift`**. Legacy `start`, `prep_before_live_days`, `load`, `live_support_load` still parse. |
| `tech_programmes` | Optional list or map. **Same prep/live timing as campaigns** (`start_date`, `duration`, `testing_prep_duration` or `readiness_duration`, `load`, `live_support_load`). Use **`programme_support`** / **`live_programme_support`** (or the same **`campaign_support`** / **`live_campaign_support`** aliases). **Only labs, teams, and backend** are applied — ops/commercial YAML keys are ignored. No **`impact`**, **`business_uplift`**, or **`campaign_risk`** / store boosts. Supports **`replaces_bau_tech`** like campaigns. |
| `public_holidays` / `school_holidays` | **`staffing_multiplier`** (cap on that holiday type), optional **`trading_multiplier`**, optional **`load_effects`** on school; **`auto: true`** pulls stub lists from the engine, or **`auto: false`** with explicit quoted **`dates:`** (bundled files use the latter — refresh via **`pnpm run sync:market-holidays`** when `holidayStubCalendar` / `holidayPublicCatalog` change). |
| `holidays` | Cross-cutting: **`capacity_taper_days`**, **`lab_capacity_scale`**. `auto_public` / `auto_school` can also be driven from the new blocks (see parser). |
| `stress_correlations` | Legacy school-holiday load multipliers; merged with `school_holidays.load_effects` / `trading_multiplier` when both present. |
| `operating_windows` | Named calendar windows that scale loads or tighten capacity. |
| `trading` | Weekly store-trading + optional **monthly_pattern**, seasonal, early-month boost, campaign store boosts. |
| `tech` | Weekly tech rhythm scaled into lab/team readiness load. |
| `risk_heatmap_gamma` | Optional exponent on the score before palette mapping (clamped in parser). |
| `risk_heatmap_curve` | Optional transfer curve id (`power`, `linear`, `sigmoid`, …). |

**Dates:** Prefer quoted strings (`'2026-04-07'`). Some YAML loaders turn unquoted `YYYY-MM-DD` into `Date` objects and break lexicographic comparisons.

**Multi-document:** Paste several markets in one editor buffer separated by `---`; the parser returns one `MarketConfig` per document. UI helpers match **`market:`** or **`country:`** on the first line of each document (`src/lib/dslMarketLine.ts`).

**LLM authoring:** See [LLM_MARKET_DSL_PROMPT.md](./LLM_MARKET_DSL_PROMPT.md) for the full prompt and schema.

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

### 5.4b `replaces_bau_tech: true`

When **true**, on **prep** and **live** days where this campaign contributes **labs, teams, or backend** (using the same load resolution as phase expansion — including staggered prep and scaled live sustain load), the engine **does not** add **`tech.weekly_pattern`** for that day and **zeros labs/teams/backend** on **BAU** loads (ops/commercial unchanged). Use when campaign work **replaces** the weekly BAU / tech pipe for that period instead of stacking. Days where the live segment only carries **ops / commercial** do **not** strip BAU tech. Default **false** (additive).

### 5.5 Staggered functional prep (`stagger_functional_loads`)

When **`true`** (with `prep_before_live_days`), prep is **not** flat across the whole prep window. Instead:

- **Tech** (`labs`, `teams`, `backend` from `load`) applies only in a **late prep band**: by default the last **42** calendar days of prep, but ending **14** days before go-live (`tech_finish_before_live_days` buffer). Tunable: `tech_prep_days_before_live`, `tech_finish_before_live_days`.
- **Commercial** (`commercial` from `load`) applies in the last **30** days before go-live by default (`marketing_prep_days_before_live`).
- **Ops** (`ops` from `load`) applies in the last **21** days before go-live in prep (`supply_prep_days_before_live`); **live** ops still come from **`live_support_load.ops`**.

This matches a common QSR pattern: engineering finishes early with a cut-over buffer; marketing ramps into stores; supply prepares closer to launch; restaurant intensity peaks in **live**.

### 5.6 Load semantics

Numbers are **dimensionless multipliers / relative intensity**, not FTE. Typical bands: higher values on **labs/teams** during build; higher **ops/commercial** during live. Keep one market self-consistent so comparisons across time make sense.

### 5.7 `tech_programmes`

Use for **platform / infra** work scheduled like a campaign (patching waves, POS/kiosk refresh, hardware cycles) when it is **not** marketing-driven and should **not** increase **Business** lens campaign pressure or store boosts.

- **Timing** — Identical rules to §5.1 / §5.2 (lead model with `testing_prep_duration` / `prep_before_live_days`, or interval + `readiness_duration`).
- **Loads** — `programme_support` + `live_programme_support` (or `campaign_support` / `live_campaign_support` for the same shape). **`load`** / **`live_support_load`** also parse. Only **labs**, **teams**, and **backend** are kept; **ops** and **commercial** are stripped.
- **Surfaces** — Prep and live both accrue to the **change** surface (not **campaign**), so they do not feed **`campaign_risk`** or **`campaign_store_boost_*`**.
- **`live_tech_load_scale`** — Optional; default **1** for tech programmes (full YAML intensity in the live segment), unlike campaigns where the engine defaults to a lighter sustain scale unless you override.
- **`replaces_bau_tech`** — Same meaning as §5.4b: can suppress **BAU** tech buckets and **`tech.weekly_pattern`** on loaded prep/live days.

---

## 6. `operating_windows`

A list of **named, inclusive date ranges** `[start, end]` with optional **multipliers**:

- Load side: `store_pressure_mult`, `lab_load_mult`, `team_load_mult`, `backend_load_mult`, `ops_activity_mult`, `commercial_activity_mult`.
- Capacity side: `lab_team_capacity_mult` (&lt; 1 tightens effective lab+team cap).

**Ramps:** `ramp_in_days` / `ramp_out_days` with **`envelope`**: `smoothstep` (default when ramping), `linear`, or `step`. The effective multiplier **blends** from 1 toward the configured value using the envelope over the window edges.

Overlapping windows **stack** (multiplicatively) where both apply.

---

## 7. `holidays`

- **`auto_public`** / **`auto_school`** — Set from **`public_holidays.auto`** / **`school_holidays.auto`**. When **true**, the pipeline merges stub date lists from `holidayStubCalendar.ts` / `holidayPublicCatalog.ts` (via `holidayCalc.ts`). When **false**, only explicit **`dates:`** in YAML are used (no double-counting).
- **`capacity_taper_days`** — Smoothly increases “holiday proximity” stress over nearby days (clamped), feeding capacity softening rather than a hard on/off.

---

## 8. `stress_correlations`

Currently the engine uses **`school_holidays`**: when the day is a **school** holiday (per auto stubs or merged lists), apply the given multipliers to loads and optionally **`lab_team_capacity_mult`** for effective cap.

Public holidays still set `holiday_flag` but use this block only when the day is also school or when combined flags drive other logic; the YAML name reflects “extra load when schools are out.”

---

## 9. `trading`

- **`weekly_pattern`** — For each weekday name (`Sun`–`Sat`), a **0–1** number or the same named levels as tech (`low`, `medium`, `high`, `very_high`). Compact keys `default`, `weekdays`, `weekend` are expanded in the parser. These become numeric store-pressure contributions.
- **`monthly_pattern`** — Optional Jan–Dec scalars multiplying weekly store pressure for that month.
- **`campaign_effect_scale`** — Per-market **0–2.5** (default **1**). Scales **`campaign_risk`** (Marketing in the Business lens and in **`risk_score`**) and multiplies **`campaign_store_boost_prep`** / **`campaign_store_boost_live`**. **0** removes campaign-driven pressure (phase loads from campaigns are unchanged). The in-app **Campaign scenario overlay** slider multiplies this per market (not persisted in YAML); see [DSL_CAMPAIGNS_AND_TRADING.md](./DSL_CAMPAIGNS_AND_TRADING.md).
- **`campaign_store_boost_prep`**, **`campaign_store_boost_live`** — Additive uplift on base store pressure while load-bearing campaigns are in prep / live (defaults 0 and 0.28). These are multiplied by **`campaign_effect_scale`** after YAML parse.
- **`payday_month_peak_multiplier`** — Early-month store boost (week 1 at peak, fades to 1× by day 21); see `paydayMonthShape.ts`.
- **`seasonal`** — `peak_month` (1–12) and `amplitude` (capped in parser, e.g. ≤ 0.6) define a gentle annual cosine on store pressure so summer vs winter markets differ without hand-editing every day.

### 9a. Non-YAML store seasoning (fair-comparison note)

After YAML-derived weekly, monthly, and **seasonal** trading, **`getStorePressureForDate`** (`src/engine/pipeline.ts`) applies **fixed engine behaviour** (not controllable in DSL today):

- **`applyDecemberRestaurantSeasoning`** — All markets: modest extra lift **1–24 Dec**, **0** on **25 Dec**, then YAML level only for the rest of December (`src/engine/weighting.ts`).
- **`applyAustraliaPostChristmasSummerLift`** — **`market === 'AU'`** only: small extra lift **26–31 Dec** and through **January** (southern summer / holidays).

Authors comparing markets should treat these as **shared platform seasoning**, not per-file DSL.

---

## 10. `tech`

- **`weekly_pattern`** — Same rules as `trading.weekly_pattern` (numeric 0–1 or named levels); drives recurring **tech rhythm** loads (scaled into lab/team readiness).
- **`labs_scale`**, **`teams_scale`**, **`backend_scale`** — Scale factors for that rhythm (sensible defaults if omitted).

---

## 11. Heatmap tuning

- **`risk_heatmap_gamma`** / **`risk_heatmap_gamma_tech`** / **`risk_heatmap_gamma_business`** — Exponent on the **lens metric** before palette mapping (clamped in the parser). Per-lens gammas override the legacy single γ when set.
- **`risk_heatmap_curve`** — Transfer curve id (`power`, `linear`, `sigmoid`, …); see `RISK_HEATMAP_CURVE_OPTIONS` in `src/lib/riskHeatmapTransfer.ts`.

These affect **visualisation**, not the underlying load math.

---

## 12. `releases`

Optional YAML array: **`deploy_date`**, **`systems`**, **`phases`** (`name` + `offset_days`), **`load`**. See [CAPACITY-RUNWAY.md](./CAPACITY-RUNWAY.md). When omitted, **`releases`** defaults to `[]`.

---

## 13. Operational notes

- **Determinism:** Core loads, parsing, carry-over, and blend weights are deterministic for a given YAML. A small **operational noise** layer jitters **`risk_score`** and **`tech_pressure`** (`dataNoise.ts`); Business lens colouring is mostly unaffected.
- **Holiday dates:** Stub multi-year lists live in **`holidayStubCalendar.ts`** (school) and **`holidayPublicCatalog.ts`** (public names + dates). Bundled YAML embeds them under **`dates:`** with **`auto: false`**; **`pnpm run sync:market-holidays`** regenerates those lists. Not an authoritative legal calendar — treat flags as **illustrative** for PMO conversations.
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
