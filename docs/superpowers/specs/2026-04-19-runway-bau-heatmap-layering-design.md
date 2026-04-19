# Runway heatmap: BAU baseline vs activity ledger layering

**Status:** Design agreed in conversation (2026-04-19).  
**Scope:** Activity ledger + heatmap cells (quarter grid, compare column, contribution strip, related SVG paths). Single-market and compare views that pass `ledgerAttribution` / `ledgerImplicitBaselineFootprint`.

## Purpose

Align behaviour with the product story: **named activities** are optional overlays on a **per-market model**; **BAU baseline** means “show that model’s daily heat” even when no ledger row is checked. Avoid the current contradiction where BAU required “at least one row included” to paint baseline days.

## Truth table (authoritative)

| Named activity rows (included) | BAU baseline (UI) | Heatmap |
|--------------------------------|-------------------|---------|
| None | Off | **Empty grid** — neutral strip / no model fill through the ledger attribution path (intentional “off”). |
| None | On | **Full baseline heat** — same per-day metrics as the non-ledger heatmap for that market (`riskByDate` → lens metric → cell fill). Per-country variance comes from **existing pipeline output** (labs, resourcing, trading patterns, risk tuning, DSL), not a separate global BAU parameter set. |
| One or more | Off | Footprint gating as today: days with no included overlap → neutral (unless product later revises). |
| One or more | On | Days with no row overlap still count **one baseline stratum** so cells keep model colour; overlapping rows stack / boost per existing overlap rules. |

## Architecture direction

1. **Semantic fix (preferred):** Treat BAU as a **first-class condition** for “effective footprint” on a day — e.g. synthetic stratum or equivalent — instead of only adjusting `effectiveLedgerFootprintOverlap` when `rawOverlap === 0` **and** at least one row remains included.

2. **Visual direction (light touch from compositing):** When BAU is on, keep **base model fill** readable at full saturation for baseline-only days; **named activities** can modulate border, thin overlay, or overlap boost rather than replacing fill with grey whenever possible.

## Current implementation notes (pre-change)

- `RunwayGrid.tsx` gates implicit baseline for the heatmap with `runwayLedgerImplicitBaselineFootprint && runwayLedgerActiveEntryIds.length > 0`, which blocks “all rows unchecked + BAU on”.
- `ledgerAttributionHeatmapMetric` in `runwayLedgerAttribution.ts` returns `null` when `effectiveOverlap <= 0`, which drives neutral fill in SVG cell renderers.
- Copy in `RunwayActivityLedgerTable.tsx` still describes the old “needs at least one row included” rule; update when behaviour ships.

## Implementation checklist (for a later plan)

- [ ] Remove or replace the `activeEntryIds.length > 0` gate for heatmap implicit baseline when BAU is checked; preserve empty grid when BAU is off and no rows included.
- [ ] Ensure all ledger-aware SVG paths (`RunwayQuarterGridSvg`, `RunwayCompareSvgColumn`, `RunwayContributionStripSvg`, `RunwayGrid` mini month grid if applicable) receive consistent `ledgerImplicitBaselineFootprint` semantics.
- [ ] Revisit overlap max / boost scaling if a synthetic floor of 1 on every day changes `maxRawLedgerOverlapInMap` behaviour.
- [ ] Update a11y copy: BAU describes baseline model heat; “hide all rows + BAU off” describes empty/neutral grid.
- [ ] Optional follow-up: dedicated “BAU-only” metric slice in YAML — **out of scope** unless product asks; baseline remains full pipeline row for the lens.

## Non-goals (this spec)

- Changing how `RiskRow` is computed per market (labs, caps, etc.) beyond wiring BAU to **use** that output when no rows are selected.
- URL persistence of ledger exclusions / BAU (unless merged into the URL view-state spec deliberately).
