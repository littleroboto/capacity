# SME custom project definition — spec (YAML + Monaco)

**Status:** design / iteration  
**Audience:** product, SMEs editing market DSL in Monaco, implementers  
**Related code today:** `tech_programmes` in YAML (`programme_support`, `live_programme_support`, `load`, `live_support_load`) parsed in `src/engine/yamlDslParser.ts`; editor chrome in `src/components/DslEditorCore.tsx`; assistant contract in `src/lib/dslAssistant/systemPrompt.ts`.

---

## 1. Problem statement

SMEs need to describe **technology / change programmes** (non-campaign work) in a way that:

1. **Defaults are enough** — a programme can be “one block” (dates + duration + rough headcount) and the engine applies a credible **drawdown shape** (e.g. one lab + one tester as % of capacity over time).
2. **Optional precision** — when the SME cares, they can spell out **phases** and **which departments** draw capacity in each phase, without hidden weighting or magic fudge factors in the UI copy.
3. **Fast typing** — power users should be able to sketch matrices in the editor almost as quickly as a markdown table, with **scaffold insertion** so they never have to remember key names from scratch.
4. **Optional coupling** — some real initiatives are **two or three streams** (e.g. digital + POS) that **sequence and converge** for integrated test; the DSL should allow that **without** forcing every SME to model dependencies (see §4).
5. **Shape at a glance** — while editing, a **Gantt-style companion** (swimlanes, bars, dependency arrows) derived from the same YAML makes the **calendar shape** obvious; it should **look like runway time axes**, not an alien chart (see §9.5).

This document iterates the **YAML model** and the **Monaco UX** for that model. Nothing here is implemented until a separate implementation plan lands.

---

## 2. Design principles

| Principle | Meaning |
|-----------|---------|
| **Progressive disclosure** | Minimal YAML → sensible defaults; extra blocks only when needed. |
| **Inspectability** | Any default curve or implied headcount should be **derivable from documented rules** (and ideally visible in a “resolved view” or tooltip later). |
| **No mystery coefficients** | SMEs who opt in to matrices use an **explicit encoding** (fixed-width or structured YAML), not unexplained scalar knobs. |
| **Expert feel, low ceremony** | Scaffolds, snippets, and ghost text — not a mandatory wizard for every field. |
| **Stable engine surface** | Parser maps new shapes into existing internal concepts (`PhaseLoad`, programme windows) where possible to limit engine churn. |

---

## 3. Conceptual model (mental map for SMEs)

Think in three layers:

1. **Programme shell** — name, `start_date`, `duration` (already familiar from `tech_programmes`).
2. **Default shape** — if the SME omits phase detail, the app applies a **programme profile** (template): e.g. “integration-heavy early, deployment spike, aftercare tail” with **fixed fractional draw** on labs and market IT/testing derived from `programme_support`-style counts.
3. **Custom shape (optional)** — explicit **phase × department** matrix (or equivalent structured list) that **replaces** the default shape for that programme only.

**Central / shared teams** (future-friendly): the same matrix notation can add rows for axes that are not purely “market IT” — e.g. `central_platform`, `cyber`, `data` — as long as the market YAML (or a shared include) declares those axes and the engine knows how they consume capacity. v1 can reserve the syntax and ignore unknown axes with a parse warning.

---

## 4. Dataset spectrum: minimal → maximal

### 4.1 Minimal dataset (single lump)

At the **low end**, one SME-facing “project” is enough information for the engine to draw a plausible runway:

- **Identity:** `name`, `start_date`
- **Horizon:** one **`duration`** (single calendar window)
- **Scale:** one notion of **labs** in use and **tech / market IT** headcount (today: `programme_support` / `live_programme_support` style keys)
- **Drain:** an explicit **fraction of those people’s time** (or an equivalent live scale) tied to that window — ideally **one visible number** (or a documented default derived from template), not a stack of hidden coefficients

The SME does **not** name phases. The product applies a **default drawdown shape** inside that one duration (see §8) and shows what it assumed.

### 4.2 Maximal dataset (dependencies, many streams)

At the **high end**, the same DSL needs to absorb initiatives that are **not** a single rectangle on the calendar:

- **Dependencies** — work B cannot start (or cannot cut over) until work A reaches a gate
- **Parallel streams** — two or three programmes progressing partly in parallel with different department mixes
- **Convergence** — a shared **integration / SIT** window where several streams must be **in test together** even if their earlier phases were independent
- **Coupled go-live** — e.g. digital backend “ready in the dark” while stores catch up; activation aligned to POS readiness rather than backend finish alone

The maximal case is still **YAML-first** and **inspectable**: relationships should be readable in the file (or generated with comments preserved), not only in a proprietary graph UI.

### 4.3 Composite programmes (“one initiative, several engines”)

**Product pattern:** two or three “projects” in business language (e.g. **Digital release** + **POS upgrade**) are **one initiative** because they must **land as a sequence** and share an **integrated test** period. The SME should be able to model that **without** splitting capacity across unrelated top-level rows that accidentally double-count or miss the overlap week.

**Modelling directions (to pick or combine in a later tranche):**

| Approach | Idea | Trade-off |
|----------|------|-----------|
| **A. Parent + streams** | One parent `tech_programmes` item (or new `tech_initiatives:`) with nested **`streams:`** each with optional own `start_date` / `duration` / matrix | Clear hierarchy; parser merges loads with rules |
| **B. Linked siblings** | Separate list entries with **`part_of:`** / **`requires:`** / **`converges_with:`** ids pointing at each other | Flexible; risk of inconsistent dates if not validated |
| **C. Single matrix, extra rows** | One calendar, matrix rows include `Digital_backend`, `POS_client`, `Stores_ops` | Simple for two-track; messy for many dependencies |

**Integrated test period:** however we represent streams, the spec should allow a **named phase or date-bounded window** where **multiple streams contribute simultaneously** to labs / teams (matrix columns overlap, or a dedicated `INTEGRATION` column applies to all listed streams).

**“Dark” / staged enablement:** one stream can carry **prep load** while **customer-visible load** stays low until a gate (e.g. `enable_from_phase: PILOT` or `cutover_aligns_with_stream: pos_upgrade`). Exact keys are TBD; the requirement is that SMEs can describe **backend-before-store** behaviour without fake durations.

### 4.4 Minimal vs maximal in the editor

- **Scaffolds** should offer **minimal lump** first, then **“add stream”**, **“add convergence phase”**, **“link to programme id …”** as progressive inserts (Monaco §9).
- **Validation** should catch impossible links (unknown id, circular `requires`, convergence window outside child durations) with fix suggestions.

---

## 5. Fixed-width matrix notation (human-first)

### 5.1 Informal sketch (your starting point)

```text
Project_type: e.g. POS_upgrade, Network_Upgrade, Hardware_Replacement, Store_Refurb
    - Phases: INTEGRATION | MARKET_TEST | PILOT | DEPLOYMENT | AFTERCARE
    - Technology:    wwww | www | wwwwww | wwwwwwww | wwww
    - Service Desk:  ---- | --- | ----ww   | ----wwww | wwww
    - Operations:    ---- | -ww | wwwwww   | wwwwwwww | wwww
```

**Encoding idea (to be finalized):**

- **Row** = department or workstream (Technology, Service Desk, Operations, …).
- **Column** = phase, in header order.
- **Cell characters** = relative intensity in that phase (e.g. `w` = weak/low, `-` = none, longer runs or digit bands = stronger — exact legend is part of iteration §5.3).

This is **markdown-table-like** in spirit: fixed columns, scan-friendly, diff-friendly.

### 5.2 Embedding in YAML (recommended carrier)

Use a **literal block scalar** so SMEs do not escape characters:

```yaml
tech_programmes:
  - name: POS upgrade — pilot market
    start_date: '2026-03-01'
    duration: 120
    programme_support:        # still valid: global defaults if no matrix
      labs_required: 1
      tech_staff: 1
    phase_capacity_matrix: |2
          INTEGRATION  MARKET_TEST  PILOT        DEPLOYMENT   AFTERCARE
      Technology     wwww         www          wwwwww       wwwwwwww     wwww
      Service_Desk   ----         ---          ----ww       ----wwww     wwww
      Operations     ----         -ww          wwwwww       wwwwwwww     wwww
```

**Why literal block:** preserves spaces; aligns with Monaco column editing; easy to paste from email/Confluence.

**Versioning (optional key):** `phase_capacity_matrix_format: ascii_v1` if we ever break encoding.

### 5.3 Legend iteration (candidates)

Pick **one** primary scheme per version to avoid ambiguity:

| Scheme | Pros | Cons |
|--------|------|------|
| **A. Glyph ladder** (`-` < `.` < `w` < `W` < `#`) | Fast to type, visual | Needs one-page legend in UI |
| **B. Digits 0–9 per cell** | Unambiguous | Narrow columns only; less “at a glance” |
| **C. Quarter steps** (`0`, `1`, `2`, `3`, `4` = 0%, 25%, …) | Maps cleanly to engine | Slightly more typing |

**Recommendation:** **A for authoring**, with editor **hover / status bar** showing numeric resolution (e.g. “Operations × DEPLOYMENT → 0.75 FTE equivalent”).

### 5.4 Precedence rules (YAML)

When multiple sources exist on one `tech_programmes` item:

1. If `phase_capacity_matrix` (or structured `phases:` list — see §6) is **present and valid** → it drives **relative shape** across phases; absolute scale still comes from `programme_support` / `labs_required` / `tech_staff` unless overridden.
2. If matrix **absent** → existing **`programme_support` + duration** behaviour remains (default template).
3. If both matrix and `load:` / per-phase keys conflict → **matrix wins** for phases it covers; parser emits **warning** listing ignored keys.

---

## 6. Structured YAML alternative (same semantics)

Some SMEs will prefer pure YAML. Equivalent expressiveness:

```yaml
phase_axes: [INTEGRATION, MARKET_TEST, PILOT, DEPLOYMENT, AFTERCARE]

phase_drawdown:
  Technology:     [0.35, 0.25, 0.55, 0.85, 0.40]
  Service_Desk:     [0.0,  0.1,  0.25, 0.45, 0.40]
  Operations:       [0.0,  0.2,  0.55, 0.85, 0.40]
```

**Mapping:** arrays must align with `phase_axes` length; values are **0–1 relative draw** within that department row, normalized per phase or globally per a documented rule (implementation must fix one normalization — recommend **per-phase max = 1** so deployment can be “everyone at peak” without forcing maths on SMEs).

**Trade-off:** unambiguous but slower to type; good for tooling export/import.

**Spec decision:** support **both** literal matrix and structured arrays; canonical internal form is numeric matrix post-parse.

---

## 7. Optional market-level defaults (“programme defaults”)

To avoid repeating axes on every programme:

```yaml
tech_programme_defaults:
  phase_axes: [INTEGRATION, MARKET_TEST, PILOT, DEPLOYMENT, AFTERCARE]
  default_support:
    labs_required: 1
    tech_staff: 1
  # Optional: named template id implemented in code/docs
  shape_template: pos_rollout_v1
```

Each `tech_programmes` entry inherits `phase_axes` and counts unless overridden.

---

## 8. Default shape when SME types almost nothing

**Input:** `name`, `start_date`, `duration`, and `programme_support` with e.g. `labs_required: 1`, `tech_staff: 1`.

**Behaviour (spec intent):**

1. Choose `shape_template` from `tech_programme_defaults` or a built-in default (e.g. `generic_delivery_v1`).
2. Expand template to **week-level or phase-level** load curves aligned to programme calendar (existing prep/readiness/live split can remain).
3. **Expose** the resolved curve in UI (“This programme uses template *generic_delivery_v1*: …”) so nothing feels like a black box.

SMEs who never add `phase_capacity_matrix` should still see **why** the runway drew that shape.

---

## 9. Monaco / Code view UX — “expert but easy”

### 9.1 Scaffold insertion (cursor-aware)

**Trigger ideas:**

- **Command palette:** “DSL: Insert scaffold…”
- **Context menu** on YAML structure gutter (if we add custom margin glyph later)
- **Keybinding** e.g. `Cmd+Shift+Y` (configurable) when focus is in Monaco

**Behaviour:**

1. Detect **AST position** (tree-sitter YAML or lightweight line/heuristic parser): are we under `tech_programmes`, `campaigns`, `resources`, `bau`, top-level?
2. Offer **entity-specific** scaffold: e.g. under `- name:` inside `tech_programmes` → insert block for **minimal programme**, **programme + matrix stub**, or **campaign row**.
3. Insert as **snippet placeholders** (`${1:name}`, `${2:date}`) with Monaco snippet mode.

**Scaffold catalogue (non-exhaustive):**

| Context | Scaffold |
|---------|----------|
| New `tech_programmes` item | Minimal `name`, `start_date`, `duration`, `programme_support` |
| Same + phases | Adds `phase_capacity_matrix: \|2` with header + 3 example rows |
| Composite initiative | Stub for **second stream** + optional **convergence / integration** phase labels (see §4.3) |
| `campaigns` row | Prep/live/support block matching shipped examples |
| `resources.teams` | One team with `size` |
| `bau` weekly promo | `day`, `labs`, `support_days` |
| Multi-doc separator | Line with only `---` |

### 9.2 “Insert at cursor” vs “insert sibling”

- **Inside a mapping** → insert **key: value** at correct indent.
- **After list item** → insert new `-` item with trailing newline.
- **On blank line under `tech_programmes:`** → insert full new list element.

Requires **indent stack** from current line + known DSL schema (can ship as JSON Schema or hand-maintained “insertion points” map).

### 9.3 Inline assistance (later tranche)

| Feature | Purpose |
|---------|---------|
| **Ghost text** (inline suggest) | After `tech_programmes:` newline, ghost `  - name: ` … |
| **Hover** on `phase_capacity_matrix` | Decode legend + numeric preview for cell under cursor |
| **Fold regions** | Fold literal matrix block independently of rest of file |
| **Diagnostics** | Matrix column count ≠ header → squiggle with fix action “pad or trim” |
| **Gantt companion** | Live **shape preview** under or beside the editor (§9.5) |

### 9.4 DSL assistant alignment

Extend assistant instructions so the model:

- Prefers **patch edits** for matrix blocks (replace whole literal block as one patch when needed).
- Never silently drops `phase_capacity_matrix` when editing unrelated keys.
- When user says “add deployment spike for Operations”, **patch the ASCII row** rather than inventing new scalar fudge keys.

### 9.5 Programme shape preview (Gantt companion)

While drafting a `tech_programmes` block (or future composite initiative), the SME should see a **generated diagram** of the **calendar shape** without switching mental models to heatmap cells. This is a **companion view**, not a second source of truth: it is **derived from the YAML** (plus documented defaults), debounced off the editor buffer.

#### Goals

| Goal | Detail |
|------|--------|
| **Familiar** | Horizontal **time** axis, **bars** for work packages / phases, **arrows** for finish-to-start (or other) **dependencies** between bars. |
| **Swimlanes** | **Rows = departments** (Technology, Service Desk, Operations, …) and/or **streams** when composite (§4.3); multiple bars in one lane allowed when the same department is active on parallel threads. |
| **Shape, not capacity truth** | Bar length and lane placement show **when** work sits and **how pieces chain**; optional second encoding (bar height or opacity) can hint **relative load** from matrix glyphs — full runway heatmap remains the “capacity truth” view elsewhere. |
| **Consistent look** | **Same visual language as runway time axes** so Code view and Runway feel like one product: tick marks, quarter/year labels, muted gridlines, typography weights aligned with existing runway SVGs — not a generic third-party Gantt skin. |

#### Visual system (align with existing runway code)

Implementation should **reuse** established pieces where possible rather than inventing parallel styling:

- **Time mapping:** linear calendar X over `[previewStartYmd, previewEndYmd]` derived from the programme(s) in focus (pad a few weeks before/after for context), using the same **quarter / Jan-1 year** mark philosophy as `buildRunwayMiniTimeAxisMarks` in `src/lib/runwayMiniChartTimeAxis.ts`.
- **Tokens:** stroke and label colours should follow **`--runway-spark-*`** and related CSS variables from `src/index.css` (e.g. grid, axis tick, programme tint `--runway-spark-mix-programme`) so light/dark themes stay coherent with `RunwaySummaryLineDiagrams` / contribution strips.
- **Axis chrome:** month / weekday / tick treatment should echo `RunwayContributionStripSvg` (`src/components/RunwayContributionStripSvg.tsx`) — same “muted foreground ticks + semibold month labels” tiering, adapted to the wider Gantt width.

#### Diagram content

1. **Tasks / segments** — Each drawable segment has: start/end date (from explicit YAML dates, phase slices of `duration`, or resolved template phases), **label** (stream name, phase name, or programme name), **lane key** (department).
2. **Bars** — Rounded rects per segment; **critical-style** outline optional when the parser marks a stream on the critical path (future).
3. **Dependency edges** — SVG paths from **bar end** (or milestone marker) to **successor start**: prefer short orthogonal elbows or slight bezier; arrowhead at successor; **cycle** and **dangling** refs → diagnostic in editor + dashed “invalid” edge in preview.
4. **Milestones** — Optional diamond nodes for “cutover”, “SIT start”, when YAML exposes milestone dates.
5. **Today / selection** — Vertical line for “today” if in range; optional sync with runway **selected day** when both panes visible.

#### Placement and behaviour

- **Layout:** **Split pane** under Monaco (or collapsible **side rail**) so YAML and Gantt scroll independently; optional **narrow mode** collapses to a single-row **spark-Gantt** when height is tight.
- **Focus:** When the cursor is **inside** a `tech_programmes` list item, highlight that programme’s bars (stroke or glow); multi-doc → **country / document** selector or “all programmes in buffer” with overflow scroll.
- **Sync:** **Click bar** → jump cursor to the **approximate YAML line** (name row or matrix block); **invalid YAML** → show last good diagram greyed with banner “Preview stale — fix parse error”.
- **Update cadence:** Debounce (e.g. 300–500 ms) after keystrokes; avoid blocking the main thread for large buffers (Web Worker layout later if needed).

#### Data pipeline (conceptual)

```text
Editor buffer → YAML parse (tolerant) → canonical “preview model”
  (tasks, lanes, edges, date range) → layout (lane assignment, x scale) → SVG
```

The **preview model** should be the same structural intermediate we want for **documentation export** later (one graph, two consumers: Gantt + docs).

**Scaffold / opt-in:** default preview scope is **infer from cursor** inside `tech_programmes`; only if we add explicit ids would an optional comment such as `# preview: programme_id: …` be needed.

---

## 10. Parser and engine notes (implementation-facing)

1. **Parse step:** extract `phase_capacity_matrix` literal → trim → split lines → parse header row → fixed-width columns (positions from header text or explicit `|` column markers if we add them in v2).
2. **Normalise** glyph cells to numeric weights using published legend.
3. **Combine** with `programme_support` counts to produce **absolute** lab/team units per phase window.
4. **Map** phase windows onto calendar: either **equal-length slices** of `duration` or explicit `phase_duration_days:` map if SME provides it (optional future key).
5. **Warnings:** unknown row label → warn + skip row; unknown column → warn + ignore column.

---

## 11. Alternative uses of the same interaction model

The **“fixed-width table in YAML + scaffold + hover decode”** pattern can extend to:

- **Campaign** prep/live intensity grids (marketing vs tech emphasis).
- **BAU** seasonal overlays (“Q4 extra service desk load” as a small matrix on weeks).
- **Risk / deployment** annotations where SMEs mark sensitive windows per region.

Reuse the same Monaco commands and legend infrastructure; only insertion templates and parsers change.

---

## 12. Open questions (next iteration)

1. **Phase calendar:** equal split of `duration` vs explicit `phase_weights:` or `phase_days:`?
2. **Normalization:** row-wise vs column-wise vs global max for ASCII → numeric?
3. **Central teams:** do they consume the same `resources.teams` pool or a separate virtual pool?
4. **Multi-doc:** can `tech_programme_defaults` live in a shared fragment / `__include__` pattern, or only per market file?
5. **Migration:** do we auto-generate ASCII matrix from existing `tech_programmes` for display-only “matrix view” toggle?
6. **Composite shape:** prefer **parent + `streams:`** vs **linked sibling ids** for digital + POS style cases?
7. **Convergence:** is `INTEGRATION` always a shared calendar slice across streams, or a separate explicit `convergence:` block with dates?
8. **“Dark” delivery:** express as phase-gated visibility, separate virtual load channel, or documentation-only until engine supports it?
9. **Gantt preview:** default-on vs opt-in; split **below** vs **beside** Monaco; show **all** programmes in buffer vs cursor-scoped only?
10. **Lane taxonomy:** fixed department list vs YAML-driven row labels only; how to order streams vs departments in swimlanes?

---

## 13. Summary

- **Spectrum:** **Minimal** = one duration, one resource picture, one visible drain model; **maximal** = dependencies, **streams**, convergence (shared integration test), optional **dark / gated** cutover — still YAML-first and inspectable.
- **YAML:** Optional `phase_capacity_matrix` (literal fixed-width) **or** structured `phase_drawdown` + `phase_axes`; optional `tech_programme_defaults` for DRY axes and templates; **composite** modelling (parent + streams vs linked siblings) to be chosen from §4.3.
- **Defaults:** Unchanged simple programmes stay simple; **template + visible resolution** replaces mystery weighting in the product narrative.
- **Monaco:** Cursor-aware **scaffolds**, snippet placeholders, and later hovers/diagnostics make the expert workflow **fast and learnable**; composite cases get **progressive** inserts (stream, convergence, link).
- **Gantt companion:** A **derived** swimlane + dependency diagram (bars + arrows) shares **runway-aligned time axes and tokens** (§9.5) so users see **project shape** while typing; heatmaps remain the detailed capacity view.
- **Next step:** narrow §5.3 legend + §12 normalization and composite choice in a short review, then move to `docs/superpowers/specs/` implementation spec + `writing-plans` when you want engineering scheduled.
