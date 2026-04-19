# Runway ledger counterfactual risk surface (v1)

**Status:** Implementation contract (2026-04-19).  
**Scope:** Workbench runway — heatmap, cell tooltips, side sparklines / mini-series, PNG capture of the same DOM.

## Product choice (locked)

**Meaning B:** Scalar values shown while the activity ledger is in play must reflect a **counterfactual pipeline run**: YAML with the **excluded ledger rows’ entities removed**, then `runPipeline` again. This is not a recolour of the full-model `RiskRow`; it is a **different** daily surface when any market still has at least one included row after exclusions.

## Surfaces

| Surface | Definition |
|---------|------------|
| **Full** | `runPipeline` on the applied multi-doc YAML (today’s `riskSurface` in the store). |
| **Ledger view** | `runPipeline` on `configs'` where each `MarketConfig` is either unchanged or `applyLedgerExclusionsToMarketConfig` for that market’s excluded `entryId`s. |

- If **no** exclusions: ledger view **is** the full surface (same array reference where possible).
- If **every** row for a market is excluded: that market’s config in the counterfactual run is **unchanged** (full); neutral “empty grid” for that degenerate case is handled by the **existing** footprint / BAU UI rules, not by stripping the entire YAML.

## Per-cell scalar (all lenses)

For market `M`, date `D`, lens `L` (Technology / Restaurant / Deployment Risk):

1. Let `row = ledgerViewRiskRow(M, D)` from the ledger-view surface (fallback full if ledger view unset).
2. Cell fill metric = `heatmapCellMetric(row, L, tuning)` — **same function as today**, different input row when exclusions apply.

Code view is unchanged.

## BAU baseline checkbox

Unchanged for v1 relative to store semantics: it still controls **implicit footprint stratum** and the **all rows excluded + BAU off** neutral grid. It does **not** add a third numeric series; counterfactual numbers come only from the ledger-view pipeline.

## Consistency (lockstep)

Any workbench UI that reads daily risk for the focused runway **must** use the ledger-view surface when present:

- `RunwayGrid` (all layouts / SVG / compare columns already fed `riskSurface` from App).
- `RunwaySummaryLineDiagrams` sparklines and bands.
- Day cell tooltip / day summary payloads built from `riskRow` for the selected day.

PNG export uses the live DOM; no separate branch.

## Mapping exclusions → config

Ledger entries carry `metadata.configSliceIndex` for array-backed YAML entities; public holidays use `dateStart`; school holidays use inclusive ISO days from the entry span. See `marketConfigLedgerExclusions.ts` and `buildMarketActivityLedgerFromConfig`.

## Non-goals (v1)

- URL persistence of exclusions (separate spec).
- Worker-only counterfactual (sync `runPipeline` on the main thread for now; acceptable for typical row counts).
