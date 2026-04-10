# Handoff: Phase 1b runway UX — lens naming & day-summary IA (“build A”)

**Purpose:** A **fresh-context** engineer or agent can **design and ship** the backlog **Phase 1b** slice focused on **clarity and exec-readability** of the runway — without re-deriving architecture from chat history.

**Parent roadmap:** [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) → table row **“1b — Runway experience”**.

**Epic ids in scope (primary):**

| Id | Name | This handoff |
|----|------|----------------|
| `epic-runway-lens-naming` | Runway lens naming & surface consistency | **P0 — do first** |
| `epic-day-summary-ia` | Day summary & cell detail — information architecture | **P0 — do second** (pairs with naming) |

**Epic ids in scope (optional stretch — only if time / demo need):**

| Id | Name | Note |
|----|------|------|
| `epic-heatmap-continuous-spectrum` | Interpolated heatmap ramp | Visual-only; see `riskHeatmapColors.ts` |
| `epic-iso-runway-polish` | 3D iso labels / light mode | `RunwayIsoSkyline`, `RunwayIsoCityBlock` |

**Out of scope for this handoff:** auto-plan, corporate calendar risk *features*, auth, versioning, landing page (those are other epics).

---

## 1. Product intent (why this matters)

- **Execs and planners** should see **one vocabulary** for each runway lens: radio label, heatmap title, tooltips, day-detail headers, and settings copy must not fight each other (e.g. “Technology Teams” vs “tech headroom” vs “tech pressure” without explanation).
- **Clicking a cell** should answer **“what does this colour mean *for this lens*?”** in **one scannable beat**, then offer **depth** (blend score, drivers, footnotes) without a single wall of text.

Success looks like: *a new user can name what the active heatmap measures in one sentence, and find the planning blend in a second, without reading five paragraphs.*

---

## 2. Current code reality (read this first)

### 2.1 Canonical lens config (almost)

**File:** [`src/lib/constants.ts`](../src/lib/constants.ts)

- **`VIEW_MODES`** — each entry has `id`, `label` (short radio text), `runwayHeatmapTitle`, `title` (long description for tooltips / chrome).
- **`normalizeViewModeId`** — maps **persisted legacy** keys (`technology`, `deployment_risk`, `risk_score`, etc.) to current ids. **Do not break** persisted `localStorage` / Zustand keys without a migrate step.
- **There are four runway lenses today:** `combined`, `in_store`, `market_risk`, `code` (not three).

### 2.2 Doc drift to fix as part of this work

**File:** [`docs/PRODUCT_BASELINE.md`](./PRODUCT_BASELINE.md)

- Still describes **three** view modes and says the dedicated risk lens is “not a fourth entry yet.” **That is stale** relative to `VIEW_MODES`. Updating the table and “Not in baseline” bullets is part of **acceptance** for this handoff (see §7).

### 2.3 Day detail / tooltip pipeline

| Piece | Role |
|--------|------|
| [`src/lib/runwayTooltipBreakdown.ts`](../src/lib/runwayTooltipBreakdown.ts) | Builds **`RunwayTooltipPayload`** (structured fields + driver blocks) for a cell. |
| [`src/components/RunwayDayDetailsBody.tsx`](../src/components/RunwayDayDetailsBody.tsx) | Renders payload in **`popover`** (compact) vs **`markdown`** (side panel). Section titles, lists, contributors. |
| [`src/lib/runwayDayDetailsGlossary.ts`](../src/lib/runwayDayDetailsGlossary.ts) | **`glossaryFillScore`**, **`glossaryPlanningBlend`** — long strings wired into definitions / glossary UI. |
| [`src/components/RunwayCellTooltip.tsx`](../src/components/RunwayCellTooltip.tsx) | Hover tooltip wrapper → `RunwayDayDetailsPayloadBody` popover. |
| [`src/components/RunwayDaySummaryPanel.tsx`](../src/components/RunwayDaySummaryPanel.tsx) | Side panel markdown presentation. |

### 2.4 Known string drift (examples — not exhaustive)

- [`src/components/RunwayGrid.tsx`](../src/components/RunwayGrid.tsx) — local strings such as **“Trading pressure”**, **“Deployment risk”** for export / labels; must stay **consistent** with `VIEW_MODES` / chosen glossary.
- Panels: [`HeatmapSettingsPanel.tsx`](../src/components/HeatmapSettingsPanel.tsx), [`DSLPanel.tsx`](../src/components/DSLPanel.tsx), [`RiskModelPanel.tsx`](../src/components/RiskModelPanel.tsx), [`RestaurantTradingPatternsPanel.tsx`](../src/components/RestaurantTradingPatternsPanel.tsx) — inline copy references **Technology Teams**, **Restaurant Activity**, **Deployment Risk**, deployment context, etc.

**Discovery command (run during implementation):**

```bash
rg -n "Technology Teams|Restaurant Activity|Deployment Risk|Tech capacity|Trading pressure|Deployment / calendar|deployment risk|headroom|combined risk|planning blend" src docs README.md
```

---

## 3. Design phase (before coding)

### 3.1 Deliverable: **Lens glossary (one page)**

Produce a **single table** (Notion / Figma / markdown in `docs/` — optional `docs/LENS_GLOSSARY.md`) with **one row per `ViewModeId`**:

| Column | Content |
|--------|---------|
| **Id** | `combined` / `in_store` / `market_risk` / `code` |
| **Short name** | What appears on the radio / tab (may equal `label`) |
| **Heatmap title** | Phrase above the grid (`runwayHeatmapTitle`) |
| **One-line pitch** | What the heatmap measures (user-facing, ≤ 25 words) |
| **What it is not** | One line (e.g. “not store trading”) |
| **Planning blend** | One line: how `risk_score` / Low–Med–High relates to this lens |
| **Engineer anchor** | Primary metric id(s) from [`runwayViewMetrics.ts`](../src/lib/runwayViewMetrics.ts) / engine types |

Resolve explicitly:

- Customer-facing lens label: **Deployment Risk** (`market_risk` id); subtitle/tooltips carry deployment / calendar nuance.
- **Technology lens:** **headroom** vs **demand** — `PRODUCT_BASELINE` still mentions direction on colouring; **copy** must match what the **number in the cell** actually is today (verify in code before rewriting).

### 3.2 Deliverable: **Day-detail IA wireframe**

For **each** lens (and optionally **compare-all** vs single-market), sketch:

1. **Lead block** — headline metric + band + one sentence tied to **that lens’s** fill metric.  
2. **Secondary** — planning blend (band + short explainer).  
3. **Tertiary** — drivers / contributors (existing blocks from payload).  
4. **Progressive disclosure** — e.g. “How this is calculated” `<details>` or accordion for popover; full depth in side panel markdown.

**Non-goals:** changing risk **math** unless a copy bug is discovered (then fix copy or add a footnote — scope creep if you change formulas here).

---

## 4. Implementation plan (suggested order)

### Sprint 1 — `epic-runway-lens-naming`

1. **Freeze glossary** from §3.1 (stakeholder sign-off if applicable).
2. Update **`VIEW_MODES`** in `constants.ts` to match glossary (labels, titles, `runwayHeatmapTitle`).
3. **Sweep** components from the `rg` search: headers, settings, export strings, `RunwayGrid` helpers.
4. **Optional refactor (nice):** introduce `src/lib/lensCopy.ts` (or similar) that exports **short label, heatmap title, one-liner** per `ViewModeId`, and have `VIEW_MODES` consume it — reduces future drift. Keep **`normalizeViewModeId`** in `constants.ts` or colocate with migrate notes.
5. Align **README** / **PRODUCT_BASELINE** lens table with shipped strings.
6. **QA:** switch all four modes + compare-all; screenshot or checklist that **no screen** uses an old name for the active lens.

### Sprint 2 — `epic-day-summary-ia`

1. Refactor **`RunwayDayDetailsBody`** section order to match wireframe: lead → blend → drivers → footnotes.
2. Shorten **repeated** explanations: move shared footnotes to one **DefinitionInfo** or collapsible block (already have [`DefinitionInfo`](../src/components/DefinitionInfo.tsx) patterns).
3. Update **`runwayDayDetailsGlossary.ts`** strings to match glossary; ensure **popover** uses shorter variants if needed (props like `compact` or split `glossaryFillScorePop` vs `...Panel`).
4. **`runwayTooltipBreakdown.ts`** — only change **structure/labels** if needed for IA; avoid churning unrelated driver text unless duplicative.
5. **QA:** same as Sprint 1 + **reduced-motion** / narrow width; confirm popover still fits viewport.

### Stretch (defer unless requested)

- **`epic-heatmap-continuous-spectrum`** — wire `heatmapColorContinuous` in grid + legend toggle in settings.  
- **`epic-iso-runway-polish`** — tokenized empty cells, label snapping / overlay experiment.

---

## 5. Technical constraints

- **Persistence:** `STORAGE_KEYS.capacity_atc` / `layer` key stores **view mode**. Legacy **`normalizeViewModeId`** mappings must remain until a **versioned migrate** in [`useAtcStore.ts`](../src/store/useAtcStore.ts) is explicitly added.
- **Accessibility:** popovers should keep **focus / aria** behaviour; don’t remove headings that screen readers rely on — use **visibility** or **disclosure** instead of deleting structure.
- **Performance:** day details run on hover/selection; avoid heavy work in render — prefer memoized derived strings.

---

## 6. Files likely touched (checklist)

Use as a merge review list (add/remove as you discover):

- [ ] `src/lib/constants.ts`
- [ ] `src/lib/runwayDayDetailsGlossary.ts`
- [ ] `src/components/RunwayDayDetailsBody.tsx`
- [ ] `src/components/RunwayCellTooltip.tsx`
- [ ] `src/components/RunwayDaySummaryPanel.tsx`
- [ ] `src/components/RunwayGrid.tsx`
- [ ] `src/components/HeatmapLegend.tsx` / `src/lib/riskHeatmapColors.ts` (if legend copy must match naming)
- [ ] `src/components/HeatmapSettingsPanel.tsx`
- [ ] `src/components/DSLPanel.tsx`
- [ ] `src/components/RiskModelPanel.tsx`
- [ ] `src/components/RestaurantTradingPatternsPanel.tsx`
- [ ] `src/components/Header.tsx` (if lens labels appear)
- [ ] `docs/PRODUCT_BASELINE.md`
- [ ] `README.md` (short alignment only if needed)
- [ ] Optional new: `docs/LENS_GLOSSARY.md`, `src/lib/lensCopy.ts`

---

## 7. Acceptance criteria (binary)

1. **Single vocabulary:** For each `ViewModeId`, **radio label**, **heatmap title**, and **first paragraph** of day detail / glossary refer to the **same lens name** family (allow explicit “subtitle” only where designed).
2. **PRODUCT_BASELINE** reflects **four** lenses and matches `VIEW_MODES` strings (or points to `LENS_GLOSSARY.md` as SSOT).
3. **Day detail IA:** Popover shows **≤ ~120 words** above the fold (or equivalent visual block) before driver lists; **planning blend** is visually **secondary** but present; side panel can stay longer.
4. **No regression:** `normalizeViewModeId` still maps old persisted values; pipeline and heatmap metrics **unchanged** unless a documented copy bugfix requires a one-line code comment.
5. **`npm run build`** passes.

---

## 8. Reference links

- Backlog phases: [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) (Phase **1b** row + epic blurbs).
- Market / deployment risk **design** (related lens, may overlap copy): [BRIEF_MARKET_RISK_VIEW.md](./BRIEF_MARKET_RISK_VIEW.md).
- Auth / workspace (out of scope here): [HANDOFF_EPIC_USER_ORG_ENTERPRISE.md](./HANDOFF_EPIC_USER_ORG_ENTERPRISE.md).

---

## 9. Prompt snippet for a fresh agent session

Paste below into a new chat after loading the repo:

> Read `docs/HANDOFF_PHASE_1B_RUNWAY_UX.md` and implement **Sprint 1** (`epic-runway-lens-naming`): update `VIEW_MODES` and sweep UI/docs per the file’s glossary and `rg` search. Then **Sprint 2** (`epic-day-summary-ia`): refactor `RunwayDayDetailsBody` + glossary per §4. Do not change risk formulas unless you find a clear copy/engine mismatch — document it. Finish by updating `PRODUCT_BASELINE.md` and passing `npm run build`.

---

*Last updated: aligns with repo state as of Phase 1b planning; adjust file paths if the tree moves.*
