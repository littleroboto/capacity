# Brief: Market / deployment **Risk** runway view

Detailed implementation guide derived from the **current codebase** (April 2026). Goal: add a **fourth runway lens** (alongside Technology Teams, Restaurant Activity, and Code) that shows **graded deployment / enterprise-calendar risk** on a **temperature** heatmap—**not** “banned” windows, but **uneven fragility** across the year for global / franchised / listed contexts.

---

## 1. Product intent (locked)

| Principle | Implication for implementation |
|-----------|--------------------------------|
| **Deployments are not prohibited** | No binary red wall in data; use **continuous 0–1** (or soft bands). Copy: “Higher risk / more fragile,” not “blocked.” |
| **Risk ≠ trading busyness** | **Restaurant** lens already models `store_pressure`. Risk lens may **reuse signals** (e.g. holidays) but the **story** is **calendar + governance + recovery time**, not customer traffic alone. |
| **Risk ≠ tech utilisation** | **Technology** lens uses **lab + Market IT demand** (`tech_demand_ratio`). Risk lens must **not** duplicate that headline; optional **small** tech-overload term is a product choice (default **off** for v1). |
| **Temperature colouring** | Same **spectrum ramp** as Restaurant (`heatmapColorForViewMode` in `src/lib/riskHeatmapColors.ts`): hotter = more risk. **Not** the future “headroom / green = good” paradigm reserved for Technology. |
| **Per market** | Each `RiskRow` is already keyed by `date` + `market`. Corporate events and curves are **per-market** (or segment) in YAML. |

---

## 2. How the app works today (relevant anchors)

### 2.1 View modes

- Defined in **`src/lib/constants.ts`**: `VIEW_MODES` with `id`: `combined` (Technology Teams UI), `in_store`, `code`.
- **`ViewModeId`** is a string union derived from that array; **persisted** via Zustand (`STORAGE_KEYS.capacity_atc`) and legacy key `layer` → **`normalizeViewModeId`** maps old ids (e.g. `risk_score` → **`combined`**) today.

**You must:**

1. Add a new mode, e.g. **`market_risk`** (or `deployment_risk`), with `label`, `runwayHeatmapTitle`, and `title` (tooltip on radios).
2. Extend **`normalizeViewModeId`** so legacy storage does not map unknown strings to the wrong lens; optionally map old **`risk_score`** to **`market_risk`** if product wants “risk” to mean this lens, not Technology.

### 2.2 Cell metric → colour

- **`heatmapCellMetric(row, mode, tuning, techWorkloadScope)`** in **`src/lib/runwayViewMetrics.ts`** switches on `mode`:
  - `combined` → **`technologyHeatmapMetric`**
  - `in_store` → **`inStoreHeatmapMetric`** (`store_pressure / STORE_PRESSURE_MAX`, clamped 0–1)
  - `default` → currently falls through to **technology** (covers `code` when mis-routed; **Code** mode hides the heatmap in **`App.tsx`**).
- **`runwayHeatmapCellFillAndDim`** uses **`heatmapColorForViewMode`**; **`techProjectWorkUsesDimmedCellStyle`** only applies when **`viewMode === 'combined'`** and project scope + zero metric—**no change** needed for Risk unless you add similar UX.
- **`RunwayGrid.tsx`** builds **`heatmapOpts`** with **`riskHeatmapCurve`**, **`riskHeatmapGamma`**, render style, mono colour (`~1494–1501`). **Note:** Store has **`riskHeatmapGammaTech`** / **`riskHeatmapGammaBusiness`** (`useAtcStore`, persisted locally); heatmap γ/curve are **not** read from market YAML. **This grid currently passes a single `riskHeatmapGamma`** for all lenses. For Risk, either **reuse** global gamma or **add `riskHeatmapGammaRisk`** and branch `heatmapOpts` by `viewMode` (mirror pattern you want for Tech vs Business long-term).

### 2.3 Pipeline → `RiskRow`

- **`runPipeline`** (`src/engine/pipeline.ts`): builds **`aggregated`** loads + **`metaByIndex`** (store, campaign, **`holiday_flag`**, **`public_holiday_flag`**, **`school_holiday_flag`**), then **`computeCapacity`**, merges meta into rows, then **`computeRisk`** (`src/engine/riskModel.ts`), then **`withOperationalNoise`**.
- **`RiskRow`** extends **`CapacityRow`** with **`tech_demand_ratio`**, **`tech_pressure`**, **`store_pressure`**, **`risk_score`**, **`risk_band`**, flags, **`pressure_surfaces`**, etc.

**New field (recommended):** e.g. **`deployment_risk_01: number`** (0–1, already normalised for the heatmap), computed in **`computeRisk`** or **just before** it, from inputs available on each row + **`MarketConfig`**.

Operational noise today jitters **`risk_score`** and **`tech_pressure`** only (`src/engine/dataNoise.ts`). **Decision:** jitter **Risk lens metric** or **not**; default **no jitter** for defensibility (same as store/restaurant headline behaviour).

### 2.4 Tooltips and day details

- **`buildRunwayTooltipPayload`** (`src/lib/runwayTooltipBreakdown.ts`) assembles **`fillMetricValue`** from **`heatmapCellMetric`** (via **`RunwayGrid`**).
- **`buildLensRiskBlendTerms`**: Technology → single “tech workload” term; Restaurant → “restaurant trading.” **Add branch** for **`market_risk`**: e.g. one term “Deployment / calendar risk (this heatmap)” with factor = normalised risk metric, **or** multiple terms (holiday, corporate event, Q4 curve) if you expose sub-scores on the row.
- **`RunwayGrid.tsx`**: **`fillMetricHeadlineForView`** / **`fillMetricLabelForView`** — add cases for the new mode.
- **`RunwayDayDetailsBody.tsx`** / **`runwayDayDetailsGlossary.ts`**: **`glossaryFillScore`**, **`glossaryRiskScore`**, **`LensScoreFootnote`** branch on **`viewMode === 'combined'`** vs **`in_store`**. Add **`market_risk`** copy: fill = this lens; risk = still **blended planning score** unless you change banding policy.
- **`techPressureExplanation`** is irrelevant for Risk; add **`deploymentRiskExplanation(row, config, dateStr)`** (or extend payload) listing **active factors** for that day.

### 2.5 Other touchpoints (grep when implementing)

- **`ViewModeRadios`**: picks from **`VIEW_MODES`**; **`allowedIds`** on LIOM may need to include Risk without Code—check **`WorkbenchRunwayControls`**, **`Header`**, **`App.tsx`** (force off `code` when compare-all-markets).
- **`DSLPanel.tsx`**: **`HeatmapSettingsPanel`** `showCampaignBoost={viewMode !== 'combined'}` — decide if Risk hides campaign boost UI or shows **risk-specific** controls.
- **`RiskModelPanel.tsx`**: maps view mode to **`trading` | `tech_support` | `business`**—extend if Risk has its own tuning block.
- **`RunwayCompareSvgColumn`**, **`RunwayQuarterGridSvg`**, **`RunwayIsoSkyline`**, **`SlotOverlay`**: all use **`heatmapCellMetric`** + **`runwayHeatmapCellFillAndDim`**; they pick up the new mode once **`heatmapCellMetric`** and **`colorLayerKey`** in **`RunwayGrid`** account for it (`colorLayerKey` uses `viewMode`; add stable key for Risk, e.g. `market_risk`).
- **Exports / PNG**: same metric path as grid.

---

## 3. Proposed metric: `deployment_risk_01`

### 3.1 Definition

A **single 0–1 score per day × market** for the **Risk heatmap cell** (before transfer curve / γ in **`heatmapOpts`**):

\[
\text{deployment\_risk\_01} = \mathrm{clamp}_{[0,1]}\Big( \sum_i w_i \cdot f_i(\text{day}, \text{market}, \text{config}) \Big)
\]

where \(f_i \in [0,1]\) are **normalised factor severities** and \(w_i\) are **weights** (fixed v1, later **risk tuning** in Zustand / YAML).

### 3.2 v1 factors (minimal shippable)

Use data **already on `RiskRow` or derivable without new DSL**:

| Factor | Source in code | Suggested \(f\) (example) |
|--------|----------------|---------------------------|
| **Public holiday** | `row.public_holiday_flag` | e.g. **0.35** (not 1—avoid “everything is max red”) |
| **School holiday** | `row.school_holiday_flag` | e.g. **0.25** (additive cap with public via max or weighted sum) |
| **Marketing / calendar pressure** | `row.campaign_risk` (already 0–1, scaled in pipeline) | Optional **small** weight—**or omit v1** to avoid double-counting Restaurant story |
| **Q4 / month curve** | **New**: `month` from `date` + optional **`MarketConfig.deployment_risk_month_curve`** | e.g. piecewise multipliers on **Nov–Dec** |

**Explicitly exclude v1 (unless product reverses):**

- **`tech_demand_ratio`** as primary driver (keeps Risk distinct from Technology).
- **Raw `store_pressure`** as primary driver (keeps Risk distinct from Restaurant).

### 3.3 v2 factors (YAML-driven corporate calendar)

Add to **`MarketConfig`** (and parser in **`yamlDslParser.ts`**):

```yaml
# Example shape — final names to match parser + types
deployment_risk_events:
  - id: q3_earnings
    start: '2025-07-28'
    end: '2025-07-29'
    severity: 0.6        # 0–1 contribution when active
    kind: earnings       # optional, for tooltips only
```

For each day, **`f_events = max(severity)`** over events covering that date (or sum with cap—**max** is simpler and matches “worst concurrent stress”).

Optional: **global** defaults in shared DSL blob; **per-market** overrides.

---

## 4. Engine implementation steps

1. **`src/engine/types.ts`**  
   - Add optional **`deployment_risk_events?: …[]`** (and optional month curve type) on **`MarketConfig`**.

2. **`src/engine/yamlDslParser.ts`**  
   - Parse new block under market root (snake_case + camelCase aliases consistent with repo).

3. **`src/engine/riskModel.ts`** (preferred location)  
   - Extend **`PreRiskRow`** / **`computeRisk`** input: either pass **`configsByMarket`** into **`computeRisk`** or compute **`deployment_risk_01`** in **`pipeline.ts`** before **`computeRisk`** and attach to row.  
   - **Cleanest:** add optional argument **`getDeploymentRiskFactors(date, market, config, row): {...}`** or compute inside **`computeRisk`** if you thread **`MarketConfig[]`** into **`computeRisk`** (today it only receives rows + tuning—**signature change** required unless you add the field in **`pipeline`** after **`computeRisk`** in a second pass).  
   - **Pragmatic v1:** second map in **`pipeline.ts`**:  
     `const riskRows = computeRisk(withStoreCampaign, tuning);`  
     then `riskRows.map(r => ({ ...r, deployment_risk_01: computeDeploymentRisk01(r, configByMarket[r.market]) }))`.

4. **`computeDeploymentRisk01`** (new module e.g. **`src/engine/deploymentRiskModel.ts`**)  
   - Pure function: **`RiskRow`**, **`MarketConfig`**, **`date`** → **0–1**.  
   - Unit tests here (table-driven: holidays only, holidays + event overlap, month curve).

5. **`RiskRow` type**  
   - Add **`deployment_risk_01: number`**.

6. **`runwayViewMetrics.ts`**  
   - **`marketRiskHeatmapMetric(row: RiskRow): number`** → **`row.deployment_risk_01`** clamped **[0,1]** (already clamped in engine).  
   - **`heatmapCellMetric`**: `case 'market_risk': return marketRiskHeatmapMetric(row);`  
   - **`default` branch:** keep **`technologyHeatmapMetric`** only for **`code`** if `code` can leak into metric path; or **`throw`** / assert—audit call sites.

7. **`runwayHeatmapCellFillAndDim`**  
   - If Risk never uses project-work dimming, **no change**. If you add “empty day” semantics, extend **`techProjectWorkUsesDimmedCellStyle`** guard.

---

## 5. UI / copy checklist

| Item | Action |
|------|--------|
| **`VIEW_MODES`** | New entry + titles |
| **`normalizeViewModeId`** | New id + legacy mapping policy |
| **`ViewModeRadios` / workbench** | Show Risk on single-market and LIOM as needed |
| **`App.tsx`** | Code mode: Risk should behave like other runway lenses when leaving Code (no special case unless desired) |
| **`RunwayGrid`** | Title, `colorLayerKey`, `heatmapOpts` gamma branch (optional) |
| **`HeatmapLegend`** | If legend text is lens-specific, extend |
| **`buildLensRiskBlendTerms`** | Risk branch |
| **`buildRunwayTooltipPayload` / day details** | Headline, glossary, explanation function |
| **`PRODUCT_BASELINE.md` / `CAPACITY-RUNWAY.md`** | Document new field and lens |
| **DSL docs** | `MARKET_DSL_AND_PIPELINE.md` + LLM prompt/schema if events are authorable |

---

## 6. Acceptance criteria (suggested)

1. Switching to **Risk** shows a **temperature** heatmap; **Technology** and **Restaurant** unchanged for same YAML.
2. **Public + school** holidays increase risk relative to baseline **without** maxing every cell if weights tuned moderately.
3. With **no** optional events in YAML, v1 still produces a **non-flat** year if month curve or holiday logic is on.
4. Adding a **`deployment_risk_event`** spanning a date range **visibly** raises those cells and appears in **tooltip explanation**.
5. **Persisted** `viewMode` survives reload; **compare-all-markets** column heatmap uses the same metric per market column.
6. **Combined `risk_score`** in day details remains **documented** as the **planning blend** (unless product explicitly decouples banding).

---

## 7. Open decisions (record in PR / design note)

1. **Combine vs independent:** Should **`risk_score`**’s holiday term **correlate** with Risk lens, or is Risk **independent** by design? (Today **`importanceHoliday`** can add a step function; Risk can use **graded** holidays for smoother story.)
2. **Campaign risk:** Include **`campaign_risk`** in deployment risk or keep campaigns **only** in blended `risk_score`?
3. **Executive gating:** v1 ships **same app for all users**; **role-based** Risk is **Phase 3 auth** (see **`BACKLOG_EPICS.md`**).
4. **Noise:** **`withOperationalNoise`**—exclude **`deployment_risk_01`** by default.
5. **Naming:** User-facing label **“Market risk”** vs **“Deployment risk”** vs **“Calendar risk”**—align with steering committee language.

---

## 8. File reference summary

| Layer | Files |
|-------|--------|
| Constants / types | `src/lib/constants.ts`, `src/engine/types.ts`, `src/engine/riskModel.ts` |
| Metric + colour | `src/lib/runwayViewMetrics.ts`, `src/lib/riskHeatmapColors.ts` |
| Pipeline | `src/engine/pipeline.ts`, new `src/engine/deploymentRiskModel.ts` (suggested) |
| Parse | `src/engine/yamlDslParser.ts` |
| Tooltips / details | `src/lib/runwayTooltipBreakdown.ts`, `src/lib/runwayDayDetailsGlossary.ts`, `src/components/RunwayDayDetailsBody.tsx`, `src/components/RunwayGrid.tsx` |
| State | `src/store/useAtcStore.ts` (persisted `viewMode`, optional `riskHeatmapGammaRisk`) |
| Secondary views | `RunwayCompareSvgColumn.tsx`, `RunwayQuarterGridSvg.tsx`, `RunwayIsoSkyline.tsx`, `SlotOverlay.tsx` |

This brief is the **single checklist** for an implementer; update it when factor formulas or YAML shape stabilise.
