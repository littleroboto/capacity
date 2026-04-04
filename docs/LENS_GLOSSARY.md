# Runway lens glossary (Phase 1b)

Single vocabulary for radio labels, heatmap headings, tooltips, and day-detail copy. **Engine strings** live in `src/lib/constants.ts` (`VIEW_MODES`); this table is the human-readable spec.

| Id | Short name (radio) | Heatmap title | One-line pitch | What it is not | Planning blend (one line) | Engineer anchor |
|----|-------------------|---------------|----------------|----------------|----------------------------|-----------------|
| `combined` | Technology Teams | Tech capacity headroom (scope: Combined / BAU / Project in UI) | **Headroom** on lab + Market IT lanes (0–1); cooler = more capacity free vs scheduled work; backend excluded from headline. | Not store trading rhythm or marketing busyness. | **Planning blend** is a separate 0–1 mix (tech + store + campaign + holiday weights); drives Low/Med/High band—not the tile %. | `technologyHeadroomHeatmapMetric`, `heatmapCellMetric` → `combined` |
| `in_store` | Restaurant Activity | Trading pressure | Modeled **restaurant / store trading** intensity from the store-pressure lane (rhythm, early-month lift, holidays, store boosts). | Does not add scheduled tech work. | Blend still includes tech and campaigns; tile is store-only. | `inStoreHeatmapMetric`, `store_pressure` |
| `market_risk` | Market risk | Market risk | **Deployment / calendar fragility** (0–1): holidays, Q4/month curve, trading intensity, campaigns × peaks, tech bench strain, YAML events. Hotter = more fragile, not a ban. | Not the same construct as the Technology headroom tile. | Blend is the full operational mix; band still reflects that mix while the tile shows market-risk score only. | `deployment_risk_01`, `heatmapCellMetric` → `market_risk` |
| `code` | Code | Market configuration | Multi-market YAML editor; changes are local until you leave this lens. | Not a heatmap lens. | N/A (no runway cell fill for planning blend in this mode). | N/A |

**Legacy ids** (`technology`, `deployment_risk`, `risk_score`, …) map via `normalizeViewModeId` in `constants.ts` — do not remove without a store migrate.
