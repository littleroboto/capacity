# Runway report: heatmap, receipt, and activity ledger

**Status:** Design approved in conversation (2026-04-17).  
**Scope:** Single-market runway view (primary); multi-market compare is out of scope for v1 unless explicitly extended.

## Purpose

Redesign the main runway area into a **report**: heatmaps on the left, a unified **receipt** on the right (charts + day breakdown in one surface), and a **filterable ledger table** of contributing activities below the receipt. Selection in the ledger drives **attribution** on the heatmaps; selection of a **calendar day** drives the **receipt line items** (scores and drivers for that date).

## Non-goals (v1)

- Replacing engine math with ledger-derived scores (ledger remains **UX / documentation**, not a second source of truth for risk).
- Full pipeline “activity receipt” traces from assembly (future augmentation per `marketActivityLedger` provenance comments).
- Multi-market compare column layout and receipt duplication (defer until product asks).

## Definitions

- **Aggregate mode:** Heatmaps show normal combined / per-lens risk or pressure coloring from existing pipeline output.
- **Attribution mode (mode B):** One or more ledger rows are selected. Heatmaps **mute or replace** aggregate fill with a **neutral base**; selected activities paint **date-span footprints** per lens using v1 rules (ledger `dateStart`…`dateEnd` ∩ visible grid, guided by `lensHints` and `affects`). Clearing ledger selection restores aggregate mode.
- **Receipt:** A single bordered panel (evolution of `RunwayDaySummaryPanel`) that reads like a **slip**: embedded **weekly sparklines** at the top, then **day line items** when a day is selected. Typography favors **scannable rows** (tabular numbers); long prose lives behind **collapsed detail** (e.g. `<details>` or “Show breakdown”).
- **Events table:** TanStack Table over `buildMarketActivityLedgerFromConfig` entries (`MarketActivityLedgerEntry`), with column filters and **multi-select** rows.

## Layout

**Large screens (`lg` and up):**

- **Left column:** Three **stacked** lens heatmaps (same calendar grid, **synchronized** scroll, hover, and selection where applicable). All three remain **visible**; vertical scroll is acceptable.
- **Right column (single scroll column):**
  1. **Receipt** (one card): top = **sparklines inside the receipt** (`RunwaySummaryLineDiagrams` composed inside the receipt shell, not as a separate strip above it).
  2. **Events table** below the receipt (full width of the column).

**Small screens:** Stack vertically: heatmap block → receipt → events table.

## Interaction matrix

| State | Receipt body (day line items) | Heatmap | Sparklines (receipt top) |
|--------|-------------------------------|---------|---------------------------|
| No day, no ledger rows | Placeholder for day summary; charts still visible as runway context | Aggregate | Baseline styling |
| Day selected, no ledger | Filled from that day’s payload (same data family as `RunwayDayDetailsPayloadBody`) | Aggregate (optional existing day highlight) | Day marker / emphasis as today |
| No day, ledger selected | **Remains placeholder** (no synthetic “selection summary” row) | Attribution B | **Muted** series + **range bands** for union of selected entry date spans |
| Day + ledger | Filled for **that calendar day** only | Attribution B | Day emphasis + range bands |

**Precedence:** Day-derived receipt content **never** infers numbers from ledger-only selection (locked choice **A**). Ledger selection only affects heatmaps and sparkline emphasis until the user picks a day.

**Multi-select ledger:** **Union** of date footprints. Overlapping days must remain legible (stronger opacity, small **count** chip, or **pattern** for overlap—pick one in implementation; must not rely on color alone for accessibility).

## Receipt structure (content)

1. **Header zone:** Market / context label if needed; optional receipt title (“Runway receipt” or similar—copy TBD in implementation).
2. **Timeline zone (inside receipt):** `RunwaySummaryLineDiagrams` — store trading, deployment risk, tech capacity vs demand, technology load mix, etc., as today, with attribution-time styling per matrix above.
3. **Day zone (after cell click):** Compact **line items** per lens (or one small table: lens, score, band, one-line gloss). Reuse **`RunwayTooltipPayload`** / same breakdown pipeline as `RunwayDayDetailsPayloadBody` (`presentation="markdown"` patterns), **not** duplicate business logic. Contributor / “how the score is built” blocks: default **collapsed** or shortened; full text available on expand.
4. **Footer zone (optional v1):** Clear day control; optional link to open full detail in modal (only if needed for parity).

## Events table

- **Row model:** `MarketActivityLedgerEntry` from `src/lib/marketActivityLedger.ts`.
- **Columns (initial):** Title, family, entity kind, date span, affected lenses (derived from `affects` / `lensHints`), optional subtitle.
- **TanStack Table:** Filtering, sorting, row multi-select with keyboard-friendly patterns.
- **Selection → heatmap:** Updates shared **selected ledger entry ids**; heatmaps enter attribution mode B; sparklines apply range emphasis.

## State (conceptual)

Shared store or lifted React state (exact store shape in implementation plan):

- `selectedDayYmd: string | null` — from heatmap cell click; drives receipt day zone.
- `selectedLedgerEntryIds: string[]` — from table; drives attribution + sparkline bands.
- `receiptExpandedSectionId` (optional) — UI-only for `<details>`.

Clear actions:

- **Clear day** — clears `selectedDayYmd`; receipt day zone → placeholder; heatmap day highlight removed.
- **Clear ledger** — clears `selectedLedgerEntryIds`; heatmaps → aggregate; sparklines → baseline.

## Accessibility and motion

- Attribution overlays: not **color-only**; use borders, patterns, or labels for overlap.
- Respect `prefers-reduced-motion` for any receipt enter animations (match `RunwayDayDetailsBody` patterns).

## Testing (acceptance)

- With ledger rows selected and **no** day: receipt day section shows **placeholder**; heatmaps show attribution; sparklines show range bands.
- With day selected and **no** ledger: receipt shows **three-lens-style** summary; heatmaps aggregate.
- With both: receipt reflects **day**; heatmaps and sparklines reflect **both** per matrix.
- Clearing each control restores the expected row in the matrix.
- Stacked heatmaps stay **scroll-synced** when implementation adds scroll containers (if not already guaranteed by shared parent).

## Code touchpoints (implementation hints)

- `src/components/RunwayDaySummaryPanel.tsx` → evolve into receipt shell; compose `RunwaySummaryLineDiagrams` **inside** the receipt card.
- `src/components/RunwaySummaryLineDiagrams.tsx` — props for attribution styling (muted + bands) from parent.
- `src/components/RunwayGrid.tsx` / body — left column stacked lenses; wire `selectedLedgerEntryIds` into heatmap render path for mode B.
- `src/lib/marketActivityLedger.ts` — table data; `ledgerEntryCoversDay`, `lensHints` for footprint painting.
- `src/lib/runwayTooltipBreakdown.ts` + `RunwayDayDetailsPayloadBody` — receipt day zone content.

## Self-review

- **Placeholders:** Copy for receipt title and empty state is TBD at implementation time (product copy), not a spec gap for behavior.
- **Consistency:** Ledger-only does not fill day receipt; attribution still applies — aligned.
- **Scope:** Single-market v1 stated explicitly.
- **Ambiguity:** Overlap visualization left as “pick one implementation” with a11y constraint — acceptable for design spec; plan can fix one approach.
