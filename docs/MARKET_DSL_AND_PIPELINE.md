# How the market DSL drives the simulation

This document explains **how the system works** from YAML to the runway heatmap, with emphasis on **DSL features** and what each field *means* in the model.

For planning-domain layering, pressure surfaces, and export shapes, see [PLANNING_ARCHITECTURE.md](./PLANNING_ARCHITECTURE.md). For LLM-assisted authoring, see [LLM_MARKET_DSL_PROMPT.md](./LLM_MARKET_DSL_PROMPT.md). For shipping a new market file, manifest, and segments, see [ADD_A_MARKET_CHECKLIST.md](./ADD_A_MARKET_CHECKLIST.md).

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
9. **National leave bands** — Optional `national_leave_bands` scale **lab+team effective capacity** on calendar days in each band (flat `capacity_multiplier` and/or stepped **`weeks`** with `week_start` Mondays). Stacks with holiday taper, school pinch, and operating-window capacity multipliers.
10. **Store pressure** — Trading weekly pattern + optional **monthly_pattern** and **seasonal** cosine, then **code-only** regional seasoning (see §9a), then early-month boost shape, windows, campaigns, holidays.
11. **Capacity & risk** — Nominal caps come from `resources`; holidays can taper capacity. **Risk** combines utilisation, headroom, store/campaign signals into **`risk_score`**. **Runway cell colour** uses **lens metrics** (`tech_pressure` for Technology, **`inStoreHeatmapMetric`** for Business) after γ + curve — not raw **`risk_score`** (see [CAPACITY-RUNWAY.md](./CAPACITY-RUNWAY.md)).

The result is a per-day **`RiskRow`** series rendered as the runway grid and tooltips.

---

## 2. Top-level DSL structure

| Section | Purpose |
| --- | --- |
| `market` | Preferred market id (`DE`, `AU`, …). Legacy **`country`** still parses; both become `MarketConfig.market`. |
| `title` / `description` | Optional display strings; `title` defaults to market id. |
| `releases` | Optional phased deploy loads (`systems` × `phases` × `load`); see [CAPACITY-RUNWAY.md](./CAPACITY-RUNWAY.md). |
| `resources` | **`labs.capacity`**, **`staff.capacity`** (FTE-style team cap); legacy **`teams.*.size`** still sums to the same cap. |
| `bau` | Preferred: **`days_in_use`** + **`weekly_cycle`** (`labs_required`, `staff_required`, optional `support_days`) + optional **`integration_tests`**. Add **`market_it_weekly_load`** (aliases: `market_it_support`, `bau_technology_support`, `restaurant_it_rhythm`) for routine **Market IT** rhythm — canonical keys **`weekday_intensity`**, **`labs_multiplier`** / **`teams_multiplier`** / **`backend_multiplier`**, **`extra_support_weekdays`**, **`extra_support_months`**, **`extra_support_teams_scale`**, **`monthly_runway_availability`**. Legacy `weekly_pattern`, `support_*`, `labs_scale`, `available_capacity_pattern`, and top-level **`tech:`** still parse. Legacy `weekly_promo_cycle` / `weekly_promo` still supported. |
| `campaigns` | List or map. Preferred keys: **`start_date`**, **`testing_prep_duration`**, **`campaign_support`** (`tech_staff`, `labs_required`, …), **`live_campaign_support`**, **`promo_weight`** (store / `campaign_risk` intensity; aliases **`business_uplift`**, **`trading_emphasis`**, **`store_trading_weight`**). Legacy `start`, `prep_before_live_days`, `load`, `live_support_load` still parse. |
| `national_leave_bands` | Optional list of collective-leave windows: **`from`** / **`to`** (ISO), optional **`label`** / **`id`**, either flat **`capacity_multiplier`** for the whole span or **`weeks`** with **`week_start`** (Monday) + **`capacity_multiplier`** per ISO week. Overlapping bands multiply. |
| `tech_programmes` | Optional list or map. **Same prep/live timing as campaigns** (`start_date`, `duration`, `testing_prep_duration` or `readiness_duration`, `load`, `live_support_load`). Use **`programme_support`** / **`live_programme_support`** (or the same **`campaign_support`** / **`live_campaign_support`** aliases). **Only labs, teams, and backend** are applied — ops/commercial YAML keys are ignored. No **`impact`**, **`business_uplift`**, or **`campaign_risk`** / store boosts. Supports **`replaces_bau_tech`** like campaigns. |
| `public_holidays` / `school_holidays` | **`staffing_multiplier`** (cap on that holiday type), optional **`trading_multiplier`**, optional **`load_effects`** on school; **`auto: true`** pulls stub lists from the engine, or **`auto: false`** with explicit quoted **`dates:`** and/or **`ranges:`** (`from` / `to`, inclusive — same merge semantics as the parser; bundled files often use **`dates:`** only — refresh via **`pnpm run sync:market-holidays`** when `holidayStubCalendar` / `holidayPublicCatalog` change). |
| `holidays` | Cross-cutting: **`capacity_taper_days`**, **`lab_capacity_scale`**. `auto_public` / `auto_school` can also be driven from the new blocks (see parser). |
| `stress_correlations` | Legacy school-holiday load multipliers; merged with `school_holidays.load_effects` / `trading_multiplier` when both present. |
| `operating_windows` | Named calendar windows that scale loads or tighten capacity. |
| `trading` | Weekly store-trading + optional **monthly_pattern**, seasonal, early-month boost, campaign store boosts. |
| `tech` | **Legacy** top-level block: same fields as **`bau.market_it_weekly_load`** (canonical key names listed under `bau`). If both exist, **`tech:`** wins per key (for overrides). Prefer nesting under **`bau`** when authoring live. |

**Dates:** Prefer quoted strings (`'2026-04-07'`). Some YAML loaders turn unquoted `YYYY-MM-DD` into `Date` objects and break lexicographic comparisons.

**Multi-document:** Paste several markets in one editor buffer separated by `---`; the parser returns one `MarketConfig` per document. UI helpers match **`market:`** or **`country:`** on the first line of each document (`src/lib/dslMarketLine.ts`).

**Admin YAML import (Postgres fragments):** Pasted expert YAML is decomposed in `server/services/yamlImportService.ts`. For `public_holidays` / `school_holidays`, **`ranges:`** are expanded into per-day **`holiday_entries`** (aligned with `src/lib/holidayBlockDatesAndRanges.ts` / the engine’s date merge). Round-tripped assembled YAML emits flat **`dates:`** only. See [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md).

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
- **`market_it_weekly_load`** (recommended block name) — routine **Market IT / restaurant support** curve: **`weekday_intensity`** (0–1 per weekday, same rules as `trading.weekly_pattern`), optional **`labs_multiplier`**, **`teams_multiplier`**, **`backend_multiplier`**, **`extra_support_weekdays`**, **`extra_support_months`**, **`extra_support_teams_scale`**, **`monthly_runway_availability`**. Legacy YAML keys (`weekly_pattern`, `labs_scale`, `support_*`, `available_capacity_pattern`) still parse. Block aliases: **`market_it_support`**, **`bau_technology_support`**, **`restaurant_it_rhythm`**. **Not** **`tech_programmes`** (dated change projects).

Mapped internally to **`BauEntry`** rows with weekday and a small lab load. BAU contributes to the **bau** surface and baseline lab load. The nested IT-rhythm block feeds the same **`techRhythm`** pipeline as legacy top-level **`tech:`**.

---

## 5. `campaigns`

Each item is a programme with a **go-live date** (`start`), **live window** (`duration` days), and optional **prep**.

**`promo_weight`** (preferred) scales the campaign’s **business / store** signal (`campaign_risk`, prep/live store boosts). Typical range about **0.5**–**1.3**; clamped in the parser. Same field as legacy **`business_uplift`** — if both are set, **`promo_weight`** wins.

---

## 5b. `national_leave_bands` (collective leave density)

Use this when a **calendar band** should reduce **lab+team effective capacity** (many people OOO at once), independent of the public-holiday stub list.

Example — flat August pinch:

```yaml
national_leave_bands:
  - label: France — August collective leave (illustrative)
    from: '2026-08-01'
    to: '2026-08-31'
    capacity_multiplier: 0.72
```

Example — different factor by ISO week (`week_start` must be the **Monday** of that week):

```yaml
national_leave_bands:
  - label: June stepped leave
    from: '2026-06-01'
    to: '2026-06-28'
    capacity_multiplier: 0.85   # fallback if a day falls outside listed weeks
    weeks:
      - week_start: '2026-06-01'
        capacity_multiplier: 0.7
      - week_start: '2026-06-08'
        capacity_multiplier: 0.55
```

Dates should be quoted (`'YYYY-MM-DD'`). Overlapping bands **multiply** together for the same day.

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

When **true**, on **prep** and **live** days where this campaign contributes **labs, teams, or backend** (using the same load resolution as phase expansion — including staggered prep and scaled live sustain load), the engine **does not** add the main **`weekday_intensity`** rhythm row or the **`extra_support_weekdays`** (**`support_pattern`**) teams row for that day and **zeros labs/teams/backend** on **BAU** loads (ops/commercial unchanged). Use when campaign work **replaces** the weekly BAU / tech pipe for that period instead of stacking. Days where the live segment only carries **ops / commercial** do **not** strip BAU tech. Default **false** (additive).

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
- **`replaces_bau_tech`** — Same meaning as §5.4b: can suppress **BAU** tech buckets, **`weekday_intensity`**, and **`extra_support_weekdays`** on loaded prep/live days.

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
- **`payday_month_peak_multiplier`** — Early-month store boost (week 1 at peak, fades to 1× by day 21); **1–1.2** (+20% max). See `paydayMonthShape.ts`.
- **`seasonal`** — `peak_month` (1–12) and `amplitude` (capped in parser, e.g. ≤ 0.6) define a gentle annual cosine on store pressure so summer vs winter markets differ without hand-editing every day.

### 9a. Non-YAML store seasoning (fair-comparison note)

After YAML-derived weekly, monthly, and **seasonal** trading, **`getStorePressureForDate`** (`src/engine/pipeline.ts`) applies **fixed engine behaviour** (not controllable in DSL today):

- **`applyDecemberRestaurantSeasoning`** — All markets: ramp **1–24 Dec**, then **25–31 Dec** keep peak-season lift plus a **floor** so the whole month reads consistently hot on the Restaurant Activity lens (`src/engine/weighting.ts`).
- **`applyAustraliaPostChristmasSummerLift`** — **`market === 'AU'`** only: small extra lift **26–31 Dec** and through **January** (southern summer / holidays).

Authors comparing markets should treat these as **shared platform seasoning**, not per-file DSL.

### 9b. Store-trading calibration rationale

The `monthly_pattern`, `seasonal` cosine, `campaign_effect_scale`, and hardcoded December seasoning are **multiplicative layers** — they stack. Getting the parameters wrong in any layer double-counts effects and distorts the runway.

#### The stacking chain

For any calendar day, **`store_pressure`** is assembled in this order:

```
base = weekly_pattern[day]
     × monthly_pattern[month]                             (1)
     × seasonalTradingFactor(peak_month, amplitude)       (2)
     × applyDecemberRestaurantSeasoning (+22% ramp Dec)   (3)  ← engine, not YAML
     × paydayMult (early-month boost, ≤ +20%)             (4)
     × publicHolidayTradingMultiplier                     (5)
     × (1 + campaign_store_boost_live                     (6)
            × campaign_effect_scale × UI_slider)
```

Layer (3) is **hardcoded in `weighting.ts`** — every market gets a +22% December ramp to Christmas Eve and a 0.78 floor through month-end. This means `monthly_pattern.Dec` should **not** already be the peak; the engine will lift it.

Layer (6) is **multiplicative on base** — at `campaign_effect_scale: 2.5` and `campaign_store_boost_live: 0.28`, a live campaign adds **+70%** on top of the base. This is almost certainly too aggressive for a typical promo; a value of **1.0–1.5** gives a more realistic **+28–42%** lift.

#### Double-count example (before correction)

| Layer | FR (old) Dec Fri + campaign | Product |
|-------|------|---------|
| weekly Fri | 1.0 | 1.0 |
| monthly Dec | **1.0** (peak claim) | 1.0 |
| seasonal (peak=Jul, amp=0.09) | 0.922 | 0.922 |
| December seasoning (+22%) | 1.127 | → clamp 1.0 |
| Campaign live (0.28 × 2.5) | +70% | **1.70** |

December and July both saturate at 1.0 **before** campaigns — the model cannot tell summer from winter. A July Friday with the same campaign also produces 1.70.

#### Calibration against observed QSR traffic

Parameters are not arbitrary; they approximate **actual footfall and revenue patterns** from public industry data:

- **Meaningful Vision** (UK QSR footfall tracker, 60 000+ outlets): January is the deepest trough (~15% below December); April-May are the strongest months; September is the weakest month after February ("September squeeze", back-to-school). Summer is the sustained peak.
- **McDonald's global quarterly revenue** (SEC filings, 2023): Q3 $6.69B (**highest**) > Q4 $6.41B > Q2 $6.50B > Q1 $5.90B. Summer, not Q4/Christmas, is the revenue peak.
- **McDonald's UK Q4 2025** reported 8.5% like-for-like sales growth — driven by **campaign innovation** (Grinch tie-in, festive menu), not inherent December footfall. This is exactly the kind of effect that `campaign_store_boost_live` should capture **separately** from the baseline monthly shape.
- **December QSR dynamics**: weeks 1-3 are lifted by Christmas shopping footfall, festive menus, and office party season. Week 4 (Dec 22-31) is a cliff — reduced hours, closures on Dec 25-26, families cooking at home. Net December sits at roughly **85-92%** of the July peak *before* campaign effects.

#### Corrected parameters

After correction, `monthly_pattern` represents the **natural footfall envelope** — the shape you'd see if no campaign were running. The engine's December seasoning and campaign boosts then add cleanly on top without double-counting.

| Parameter | Old | Corrected | Why |
|-----------|-----|-----------|-----|
| `monthly_pattern.Dec` | 1.0 | ~0.82 | Engine adds +22% → effective ~0.92. Campaigns add separately. |
| `monthly_pattern.Jan` | 0.56 | ~0.72 | Old ratio (1.79:1 Jan-to-peak) exaggerated; actual QSR variance is ~1.4:1. |
| `campaign_effect_scale` | 2.5 | 1.2 | Gives +34% live boost (not +70%). Consistent with observed campaign-driven sales lifts. |
| `seasonal.amplitude` | 0.09–0.12 | 0.04 | Monthly pattern already specifies all 12 months; cosine is now subtle smoothing only. |
| `payday_month_peak_multiplier` | 1.2 | 1.15 | Slightly toned; +15% early-month lift is well within observed ranges. |

#### Verification (FR, corrected)

| Scenario | store_pressure | Comment |
|----------|---------------|---------|
| Jul Fri, no campaign | **1.00** | Peak baseline |
| Dec Fri, no campaign | **0.89** | 89% of July — realistic |
| Dec Fri, festive campaign live | **1.19** | Festive boost visible, not overwhelming |
| Jul Fri, summer campaign live | **1.34** | Summer + promo is the hottest |
| Jan Mon, no campaign | **0.48** | Deep trough — matches MV data |
| Sep Wed, no campaign | **0.63** | Back-to-school squeeze |

The corrected shape separates **natural traffic** from **campaign-driven lifts** and **engine-applied seasonal adjustments**, so each layer is visible and auditable on the runway.

#### Southern hemisphere (AU)

Australia's curve is inverted (peak in Dec-Jan-Feb, trough Jun-Jul). The engine's `applyDecemberRestaurantSeasoning` still fires, so the YAML `monthly_pattern.Dec` should still sit below the raw summer peak to avoid the same double-count. `applyAustraliaPostChristmasSummerLift` adds a further small bump through January.

#### Weekly pattern — country-specific day-of-week calibration

The `weekly_pattern` is set **per market** rather than using one generic curve. The primary differentiator is **Sunday** — which varies from 0.55 (strict Sunday trading laws) to 0.82 (relaxed weekend culture) — but the weekday shape is also adjusted.

**Data sources:** ONS UK consumer card spending data (Jan 2019 – Jun 2024) confirms QSR/restaurant sectors have higher average weekend spend vs weekdays, with Saturday as peak. Meaningful Vision daypart analysis shows France has 60% more evening QSR traffic than the UK, shifting the Friday/Saturday weight. Google Maps "Popular Times" aggregates (via BestTime) confirm Saturday as universally the busiest QSR day globally.

**Weekday shape:** The old Mon→Fri linear ramp (0.6, 0.7, 0.8, 0.9, 1.0) was artificial. Observed QSR patterns show a Mon-Thu plateau with a step-up at Friday. Thursday is not meaningfully busier than Wednesday in most markets. Friday is strong (pre-weekend evening) but slightly below Saturday (which has longer, more spread-out rushes).

**Sunday by market** — the key differentiator:

| Sunday | Markets | Rationale |
|--------|---------|-----------|
| 0.55 | DE, CH, PL | Strict Sunday rest laws (Sonntagsruhe); strong Catholic tradition (PL). Most retail closed; QSR footfall collapses. |
| 0.58 | AT | Austrian Sunday laws slightly less strict than DE, tourist areas more relaxed. |
| 0.60 | SL | Austrian-influenced culture. Sunday is family day. |
| 0.62 | IT | Pranzo della domenica — sacred Sunday family lunch cooked at home. QSR competes poorly. |
| 0.68 | SK, BE, UA | More traditional than CZ/NL but not as extreme as DE/PL. |
| 0.70 | PT | Similar to Spain, slightly more traditional. |
| 0.72 | FR, CZ, ES | France: reduced but not extreme. CZ: secular, trading normal. ES: going-out culture compensates. |
| 0.75 | NL, UK | NL: koopzondag (Sunday shopping) now normal in cities. UK: QSR exempt from 6hr large-store limit. |
| 0.78 | CA | North American pattern — very relaxed Sunday trading. |
| 0.82 | AU | Strong weekend brunch culture; Sunday trading fully normal. |

**France Wednesday (0.80):** France is the only market with a Wednesday boost. French schools traditionally have Wednesday afternoons off ("le mercredi des enfants"), driving family QSR visits. All other markets use 0.75 for Wednesday.

**Spain Thursday (0.80 vs 0.78):** Spanish social dining culture lifts later-week evenings slightly above the generic European Thursday.

---

## 10. `tech` (legacy) / `bau.market_it_weekly_load` (preferred)

- **`weekday_intensity`** — Same rules as `trading.weekly_pattern` (numeric 0–1 or named levels); drives recurring **Market IT / BAU tech rhythm** loads. Legacy alias: **`weekly_pattern`**.
- **`labs_multiplier`**, **`teams_multiplier`**, **`backend_multiplier`** — Scale factors (defaults unchanged). Legacy: **`labs_scale`**, **`teams_scale`**, **`backend_scale`**.
- **`extra_support_weekdays`**, **`extra_support_months`**, **`extra_support_teams_scale`** — Optional **Market IT–only** additive rhythm (weekly × monthly × scale; omitted months = 1). Legacy: **`support_weekly_pattern`**, **`support_monthly_pattern`**, **`support_teams_scale`**.
- **`monthly_runway_availability`** — Jan–Dec share of lab+team caps on the runway (see parser). Legacy: **`available_capacity_pattern`**.

**Authoring:** Nest under **`bau.market_it_weekly_load`**. Keep top-level **`tech:`** only for overrides or old files.

---

## 11. Heatmap (visualisation)

Heatmap transfer (curve, γ, tail power, etc.) is controlled in the **app** (Settings and Business Patterns), not in market YAML. Legacy top-level **`risk_heatmap_*`** keys are **ignored** if still present in old files — remove them when editing.

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
