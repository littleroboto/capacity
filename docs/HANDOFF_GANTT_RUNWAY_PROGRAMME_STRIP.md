# Dev handoff: programme shape (Gantt) + runway grid alignment

This document captures **product intent**, **layout strategy**, and **implementation notes** for a second pass at the programme / Gantt companion work. A full prototype was built in Cursor (then reverted locally); it **does not appear as a commit on the current branch**—recover detail from the transcript cited below.

## Enterprise bar

The target is not a lightweight “demo Gantt” but an **enterprise-quality** programme timeline that product, risk, and ops can trust in reviews:

- **Initiatives on the chart:** **`tech_programmes`** and **`campaigns`** (prep vs live, naming, optional future dependencies / milestones per SME §9.5).
- **Calendar context on the same axis:** treat **deployment freezes** (`deployment_risk_blackouts` and any engine-resolved freeze windows) and **holiday periods** (public / school / market restrictors—resolved the same way the heatmap does) as **first-class background bands or hatched regions**, not footnotes. Users should see *why* a bar sits next to a quiet or risky window without opening a second tool.
- **Quality bar:** readable at default zoom, accessible contrast, clear legend entries for programme vs freeze vs holiday overlays, and **no second calendar math** hidden from the runway when the Gantt is shown beside or under the heatmaps.

## Why this exists

- **Spec:** [SME_CUSTOM_PROJECT_DEFINITION.md](./SME_CUSTOM_PROJECT_DEFINITION.md) §**9.5** (*Programme shape preview — Gantt companion*): derived from YAML, debounced, same **visual language as runway time axes**, not a generic chart skin.
- **Product layout goal (Doug):** Treat the **runway heatmap cell grid** (contribution strip / compare column geometry) as the **spatial guide** for the programme strip so you can **extend a vertical line** through a day and read **Tech capacity**, **Trading / operations pressure**, **Deployment risk**, etc. on the same column—**one calendar**, not two misaligned scales.
- **Presentation = heatmap family:** **alignment and date scales are the non-negotiables**—same `ymd → x` mapping, same stride (`cellPx + gap`), same chronology axis tiers as the contribution strip where the Gantt shares a viewport. Colours, stroke weights, and overlay hatch patterns should **reuse or derive from** heatmap / strip tokens (`--runway-spark-*`, existing freeze and risk styling) so the stack reads as **one instrument**, not a pasted-in chart library.
- **Export (idea, not a v0 requirement):** ship **one composite graphic** (heatmap strip + lenses + programme/Gantt layer + axis chrome) when users “export” for slides or audits; **cropping and masking** happen in Keynote / Figma / the doc tool, not by maintaining multiple export aspect ratios in-app. Implementation-wise that favours **single SVG** (or high-res raster of the same DOM/SVG subtree) with a **consistent coordinate system** end-to-end.

## Two valid placements (session explored both)

| Placement | Pros | Cons |
|-----------|------|------|
| **Under Monaco** (studio DSL editor) | Always visible while editing; matches “companion while typing” story. | Second time axis unless you **reuse the same x-mapping** as runway; easy to drift from heatmap. |
| **Under the runway contribution strip** (single-market multi-lens stack) | **Natural column alignment:** same `cellPx`, `gap`, `placedCells` x as the heatmap → vertical correlation “for free”. | Only on runway when that layout is active; needs `MarketConfig` / applied config, not raw buffer (unless you add a YAML buffer path). |

**Recommendation for the “line up the page” goal:** prioritise the **runway-aligned strip** (`placedCells`-driven x). Optionally **also** keep a slim Monaco preview that calls the **same** `ymd → x` helper fed by the same layout meta (harder when the editor is not tied to the same `gridStartYmd` / range as the visible runway).

## Cursor session recovery (source of truth for reverted code)

Parent transcript: **[Gantt + runway alignment work](6fc7485c-46ff-46ee-82a2-08d571dc0640)** (`agent-transcripts/.../6fc7485c-46ff-46ee-82a2-08d571dc0640.jsonl`).

Rough chronology in that session:

1. **`src/lib/dslProgrammeShapePreview.ts`** — Pure model: **prep** vs **live** segments from `tech_programmes` and `campaigns`, using engine-aligned rules (`testing_prep_duration` / `prep_before_live_days`, live `[start, start+duration)`, interval + `readiness_duration`, skip `presence_only`). Helpers such as **`programmeShapePreviewBounds`** (padded range), **`programmeShapeLanes`**, **`xForYmdOnAxis`** (linear time on a `GapRibbonLike` layout), later **`eachYmdHalfOpen`** for per-day placement.
2. **`src/components/DslProgrammeShapePreview.tsx`** — Debounced (~380ms) `parseAllYamlDocuments` on editor buffer; SVG swimlanes; `buildRunwayMiniTimeAxisMarks` for Q/year ticks; wired under **`DslEditorCore`** in studio mode.
3. **Pivot to runway grid:** **`RunwayProgrammeShapeStripSvg.tsx`** — Draw prep/live as **`cellPx`×`cellPx`** (or merged continuous bars in a later iteration) using **the same x as `placedCells`** for each ISO date; lane y from **`stride = cellPx + gap`** and contribution strip paddings from **`calendarQuarterLayout`**.
4. **`layoutChronologyAxisBelowStripGrid`** (new / refactored in **`src/lib/runwayCompareSvgLayout.ts`**) — Shared chronology axis math with **`RunwayContributionStripSvg`** so month/Q/year tiering stays in sync.
5. **`RunwayProgrammeShapePanel.tsx`** — Collapsible panel, localStorage key like `cpm.runway.programmeShapeOpen`; receives **`marketConfig`**, **`contributionMeta`**, **`placedCells`**, **`cellPx`**, **`gap`**, etc.
6. **`RunwayGrid.tsx`** — Import panel; render **inside** the branch where **`singleMarketMultiLens && contributionMeta`** (alongside the contribution strip column).
7. **Later iteration (same transcript):** export **`appendProgrammeShapeBarsForConfigRow`**, **`activityLedger`** passed from **`RunwayGrid`**, ledger tab / table sync, **continuous** bar geometry across prep+live.

Re-implement by replaying tool outputs from the transcript or by re-deriving from the spec + files listed below.

## Code anchors (current repo — no Gantt files today)

Use these as the **layout contract** when re-adding the strip:

- **`src/lib/runwayCompareSvgLayout.ts`** — `layoutCompareMarketColumnSvg`, contribution strip layout, cell stride **`cellPx + gap`**. This is where **`layoutChronologyAxisBelowStripGrid`** was introduced in the session (refactor `layoutContributionStripRunwaySvg` to call it).
- **`src/lib/calendarQuarterLayout.ts`** — `ContributionStripLayoutMeta`, `PlacedRunwayCell`, constants such as **`CONTRIBUTION_STRIP_TOP_PAD`**, **`CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W`**, **`CONTRIBUTION_STRIP_MONTH_AXIS_H`**.
- **`src/components/RunwayContributionStripSvg.tsx`** — Axis chrome reference (§9.5: muted ticks, semibold month labels).
- **`src/lib/runwayMiniChartTimeAxis.ts`** — **`buildRunwayMiniTimeAxisMarks`**, **`textAnchorForMiniAxisX`** — good for **standalone** mini-Gantt under Monaco; for runway strip prefer **shared** chronology helper once it exists.
- **`src/components/RunwayGrid.tsx`** — `SINGLE_MARKET_STACK_LENS_IDS` / “Tech Capacity, Trading Pressure, Deployment Risk” stack — this is the **vertical** context users align with.
- **`src/engine/yamlDslParser.ts`** — **`parseAllYamlDocuments`** for tolerant multi-doc buffer parse in editor-driven previews.

**Marketing precedent (simpler geometry):** `src/components/landing/LandingCapacityProfilesMock.tsx` — month columns with **horizontal Gantt lanes** under the curve (`ganttY0` / `ganttY1`, `monthColumnRect`, `ganttBarWidth`). Same *narrative* (“who / when” under a time grid); runway version should use **real** `placedCells` x, not 12 equal months.

## Data rules (must stay aligned with engine)

- One source of truth: **parsed `MarketConfig`** rows for **`tech_programmes`** and **`campaigns`** (not a parallel DSL).
- **Freeze and holiday overlays** must come from the **same resolved calendar** the engine uses for the runway (blackout windows, merged public/school dates, labels where the model exposes them)—never a hand-rolled duplicate holiday table in the Gantt layer.
- Prep/live date math must stay consistent with **`yamlToPipelineConfig`** / phase expansion (when you add **`phase_capacity_matrix`**, bars may still be **window**-based; matrix affects **load shape**, not necessarily bar endpoints—see §9.5 “shape, not capacity truth”).
- **Debouncing** for any YAML-buffer-driven UI: §9.5 suggests ~300–500ms.

## Suggested implementation order (second crack)

1. **`dslProgrammeShapePreview.ts`** — Bars + bounds + lane list + `appendProgrammeShapeBarsForConfigRow` export; unit tests on a tiny fixture YAML.
2. **`RunwayProgrammeShapeStripSvg`** + **`layoutChronologyAxisBelowStripGrid`** — Prove **pixel alignment** with `placedCells` for a week (screenshot / story).
3. **`RunwayProgrammeShapePanel`** + **`RunwayGrid`** toggle — Ship behind **feature flag** or dev-only if needed.
4. **Calendar overlays** — Background bands for **deployment_risk_blackouts** (and related freeze semantics) + **holiday / restrictor** spans; legend + z-order so programme bars stay readable on top.
5. **Monaco companion (optional)** — Reuse bar list + mini axis; document that x-scale is **buffer-inferred** until linked to runway scroll position.
6. **Ledger / table sync** — Only after the strip is stable; adds store coupling.
7. **Export path (later)** — One SVG (or screenshot subtree) that includes heatmap + Gantt + axis; document “crop in your deck” for users.

## Acceptance checklist

- [ ] For a given ISO day in range, programme bar **left edge** matches heatmap cell **left edge** (same `placedCells` index / x).
- [ ] Chronology labels (month / Q / year) **match** contribution strip tiering after refactors.
- [ ] **Prep** vs **live** visually distinct; `presence_only` excluded.
- [ ] **Freeze** and **holiday** spans align to the **same day columns** as overlays; legend distinguishes them from programme bars.
- [ ] Parse errors: non-blocking banner or inline status; runway can still use **last applied** config if buffer is broken.
- [ ] Theme: strokes/fills use existing **`--runway-spark-*`** tokens where possible (§9.5); overlays feel like the heatmap family, not a third-party chart.

## Open questions (from spec + session)

- **Multi-doc buffer:** which market’s `tech_programmes` / `campaigns` drive the editor preview?
- **Compare-all markets:** does the strip appear per column, or only single-market stack?
- **Dependencies / arrows:** §9.5 future; v0 was bars only.

---

*Last updated from repo state + Cursor transcript review (no in-tree implementation at handoff time).*
