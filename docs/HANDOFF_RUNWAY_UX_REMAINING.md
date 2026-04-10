# Handoff: Runway UX / UI — after smooth heatmap ramp

**Purpose:** A **fresh-context** engineer or agent can pick up **remaining Phase 1b runway experience** work (and small polish) without re-reading prior chats. **Lens naming**, **day-summary IA**, and **continuous heatmap spectrum** (cells + legend + Settings toggle + preset export) are **shipped**; this doc is **what’s next** for runway-facing UX/UI.

**Parent roadmap:** [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) → **Phase 1b — Runway experience** (rows still open: iso polish, view settings; optional day-detail depth).

**Canonical product snapshot:** [PRODUCT_BASELINE.md](./PRODUCT_BASELINE.md) (incl. smooth vs banded heatmap, four lenses, [LENS_GLOSSARY.md](./LENS_GLOSSARY.md)).

---

## 1. Already shipped (do not re-derive)

| Area | Epic id | Notes |
|------|---------|--------|
| Lens vocabulary & surfaces | `epic-runway-lens-naming` | `VIEW_MODES`, glossary sweep, `normalizeViewModeId` unchanged |
| Day detail / popover IA | `epic-day-summary-ia` | `RunwayDayDetailsBody`, `runwayDayDetailsGlossary`, progressive disclosure |
| Smooth heatmap ramp | `epic-heatmap-continuous-spectrum` | `heatmapColorContinuous`, store flag `heatmapSpectrumContinuous`, Settings → Palette, legend gradient + discrete-edge ticks |
| Iso empty/pad theming + skyline label alignment | `epic-iso-runway-polish` (partial) | `--iso-empty-*`, `--iso-pad-*`, `--iso-label-stroke-width` in `index.css`; `RunwayIsoHeatCell`, `RunwayIsoSkyline`, `RunwayIsoCityBlock` |

**Code anchors:** `src/lib/riskHeatmapColors.ts`, `src/components/RunwayGrid.tsx`, `src/components/HeatmapSettingsPanel.tsx`, `src/components/HeatmapLegend.tsx`, `src/store/useAtcStore.ts`, `src/lib/viewSettingsPreset.ts`; iso: `src/index.css`, `RunwayIsoHeatCell.tsx`, `RunwayIsoSkyline.tsx`, `RunwayIsoCityBlock.tsx`.

---

## 2. Recommended order (runway UX/UI only)

### P0 — **Isometric 3D polish** (`epic-iso-runway-polish`)

**Why next:** Same runway data as 2D; biggest visible gap vs polished 2D grid — especially **light mode** and **label stability**.

**Done (baseline pass):** CSS variables `--iso-empty-*`, `--iso-pad-*`, themed today-dot and label halo width; quarter/year ground seams use `currentColor` on `muted-foreground`. **Skyline** month/Q/year labels keep their own `BASELINE_FRAC` + `moMatrix(tx,ty,fs)` (not CityBlock’s BLEED_COMP — different layout).

**Scope (remaining / optional):**

- **Chronology labels:** if scaling still feels off — HTML overlay band, `preserveAspectRatio` / viewBox tweaks, or pixel-snapped SVG.
- **Compare-all 3D:** `RunwayIsoCityBlock` now shares pad-face tokens; optional **market-strip** seams / light-mode column strokes.

**Success:** Light and dark both feel intentional; labels readable at common breakpoints (narrow desktop, laptop).

**Files (starting list):** `RunwayIsoSkyline.tsx`, `RunwayIsoCityBlock.tsx`, `RunwayIsoHeatCell` (or colocated iso components), `runwayIsoSkylineLayout.ts` if layout affects labels.

---

### P1 — **View settings vs scenario clarity** (`epic-view-settings-presets`)

**Why:** Reduces “why does my heatmap look different?” when YAML is shared but **browser** state isn’t.

**Scope (from backlog):**

- **Copy:** Short, visible explainer: **team YAML / Blob** = scenario; **View on this device** / Zustand = personal (heatmap curve, γ, smooth ramp, filters, 3D toggle, etc.).
- **Preset story:** Export/import JSON already exists (`viewSettingsPreset.ts`) — audit that **all** relevant keys round-trip; add **named preset** UX only if product wants (optional); otherwise improve labels and Workspace panel hierarchy.
- **Docs:** One paragraph in README or PRODUCT_BASELINE when copy lands.

**Files (starting list):** `SharedWorkspaceSection.tsx`, `LocalDataSection.tsx` (or wherever “View on this device” lives), `viewSettingsPreset.ts`, `useAtcStore` persist slice.

---

### P2 — **Day-detail depth** (same epic `epic-day-summary-ia`, optional)

**Only if** exec-readability still feels heavy after P0/P1:

- **Shorter driver copy:** Deduplicate repeated lines in `runwayTooltipBreakdown.ts` (e.g. pressure surface / tech sustain) — one shared footnote instead of near-duplicate bullets (**copy/structure only**; avoid risk math churn).
- **Breakdown presentation:** Optional compact rows (e.g. surface vs scheduled vs free) vs four prose sentences — design first, then implement.

**Constraint:** Do not change risk formulas unless you find a **clear** copy/engine mismatch; document in a one-line comment if you must.

---

### P3 — **Nice-to-have engineering hygiene**

- **`lensCopy.ts` (optional):** Centralise short label, heatmap title, one-liner per `ViewModeId` and consume from `VIEW_MODES` to reduce future drift ([HANDOFF_PHASE_1B_RUNWAY_UX.md](./HANDOFF_PHASE_1B_RUNWAY_UX.md) §4 Sprint 1 optional).
- **Regression grep:** Periodically `rg` for old lens strings (see HANDOFF Phase 1b §2.4 discovery command).

---

## 3. Explicitly out of scope here

- **Runway auto-plan**, **corporate calendar risk** — Phase 2 [BACKLOG_EPICS.md](./BACKLOG_EPICS.md).
- **Auth / versioning** — later phases.
- **New heatmap metrics or banding policy** — product epic, not “polish.”

---

## 4. Acceptance checklist (binary, for a “runway UX slice” PR)

1. **Iso (if shipping P0):** Light + dark screenshots or manual pass; labels don’t clip or drift egregiously at 1280px and ~1920px widths; compare-all 3D not worse than single-market 3D.
2. **View settings (if shipping P1):** New user can read **one** sentence explaining YAML vs device view; export/import still works; `npm run build` passes.
3. **Day-detail (if shipping P2):** Word count / scan time improved without breaking `normalizeViewModeId` or lens semantics.
4. **No regressions:** Heatmap smooth vs banded still matches legend; mono mode unchanged.

---

## 5. Prompt snippet for a new chat / agent

Paste after loading the repo:

> Read `docs/HANDOFF_RUNWAY_UX_REMAINING.md` and implement the next runway UX slice. Start from **§2 P0** (`epic-iso-runway-polish`) unless the user names P1 or P2. Use [PRODUCT_BASELINE.md](./PRODUCT_BASELINE.md) and [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) for scope boundaries. Do not change risk engine formulas except documented copy fixes. Finish with `npm run build` and a short note of files touched.

---

*Last updated: follows Phase 1b after continuous heatmap spectrum; adjust epics in BACKLOG_EPICS.md if priorities change.*
