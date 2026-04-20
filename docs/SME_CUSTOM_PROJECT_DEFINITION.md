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

## 4. Fixed-width matrix notation (human-first)

### 4.1 Informal sketch (your starting point)

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
- **Cell characters** = relative intensity in that phase (e.g. `w` = weak/low, `-` = none, longer runs or digit bands = stronger — exact legend is part of iteration §4.3).

This is **markdown-table-like** in spirit: fixed columns, scan-friendly, diff-friendly.

### 4.2 Embedding in YAML (recommended carrier)

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

### 4.3 Legend iteration (candidates)

Pick **one** primary scheme per version to avoid ambiguity:

| Scheme | Pros | Cons |
|--------|------|------|
| **A. Glyph ladder** (`-` < `.` < `w` < `W` < `#`) | Fast to type, visual | Needs one-page legend in UI |
| **B. Digits 0–9 per cell** | Unambiguous | Narrow columns only; less “at a glance” |
| **C. Quarter steps** (`0`, `1`, `2`, `3`, `4` = 0%, 25%, …) | Maps cleanly to engine | Slightly more typing |

**Recommendation:** **A for authoring**, with editor **hover / status bar** showing numeric resolution (e.g. “Operations × DEPLOYMENT → 0.75 FTE equivalent”).

### 4.4 Precedence rules (YAML)

When multiple sources exist on one `tech_programmes` item:

1. If `phase_capacity_matrix` (or structured `phases:` list — see §5) is **present and valid** → it drives **relative shape** across phases; absolute scale still comes from `programme_support` / `labs_required` / `tech_staff` unless overridden.
2. If matrix **absent** → existing **`programme_support` + duration** behaviour remains (default template).
3. If both matrix and `load:` / per-phase keys conflict → **matrix wins** for phases it covers; parser emits **warning** listing ignored keys.

---

## 5. Structured YAML alternative (same semantics)

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

## 6. Optional market-level defaults (“programme defaults”)

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

## 7. Default shape when SME types almost nothing

**Input:** `name`, `start_date`, `duration`, and `programme_support` with e.g. `labs_required: 1`, `tech_staff: 1`.

**Behaviour (spec intent):**

1. Choose `shape_template` from `tech_programme_defaults` or a built-in default (e.g. `generic_delivery_v1`).
2. Expand template to **week-level or phase-level** load curves aligned to programme calendar (existing prep/readiness/live split can remain).
3. **Expose** the resolved curve in UI (“This programme uses template *generic_delivery_v1*: …”) so nothing feels like a black box.

SMEs who never add `phase_capacity_matrix` should still see **why** the runway drew that shape.

---

## 8. Monaco / Code view UX — “expert but easy”

### 8.1 Scaffold insertion (cursor-aware)

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
| `campaigns` row | Prep/live/support block matching shipped examples |
| `resources.teams` | One team with `size` |
| `bau` weekly promo | `day`, `labs`, `support_days` |
| Multi-doc separator | Line with only `---` |

### 8.2 “Insert at cursor” vs “insert sibling”

- **Inside a mapping** → insert **key: value** at correct indent.
- **After list item** → insert new `-` item with trailing newline.
- **On blank line under `tech_programmes:`** → insert full new list element.

Requires **indent stack** from current line + known DSL schema (can ship as JSON Schema or hand-maintained “insertion points” map).

### 8.3 Inline assistance (later tranche)

| Feature | Purpose |
|---------|---------|
| **Ghost text** (inline suggest) | After `tech_programmes:` newline, ghost `  - name: ` … |
| **Hover** on `phase_capacity_matrix` | Decode legend + numeric preview for cell under cursor |
| **Fold regions** | Fold literal matrix block independently of rest of file |
| **Diagnostics** | Matrix column count ≠ header → squiggle with fix action “pad or trim” |

### 8.4 DSL assistant alignment

Extend assistant instructions so the model:

- Prefers **patch edits** for matrix blocks (replace whole literal block as one patch when needed).
- Never silently drops `phase_capacity_matrix` when editing unrelated keys.
- When user says “add deployment spike for Operations”, **patch the ASCII row** rather than inventing new scalar fudge keys.

---

## 9. Parser and engine notes (implementation-facing)

1. **Parse step:** extract `phase_capacity_matrix` literal → trim → split lines → parse header row → fixed-width columns (positions from header text or explicit `|` column markers if we add them in v2).
2. **Normalise** glyph cells to numeric weights using published legend.
3. **Combine** with `programme_support` counts to produce **absolute** lab/team units per phase window.
4. **Map** phase windows onto calendar: either **equal-length slices** of `duration` or explicit `phase_duration_days:` map if SME provides it (optional future key).
5. **Warnings:** unknown row label → warn + skip row; unknown column → warn + ignore column.

---

## 10. Alternative uses of the same interaction model

The **“fixed-width table in YAML + scaffold + hover decode”** pattern can extend to:

- **Campaign** prep/live intensity grids (marketing vs tech emphasis).
- **BAU** seasonal overlays (“Q4 extra service desk load” as a small matrix on weeks).
- **Risk / deployment** annotations where SMEs mark sensitive windows per region.

Reuse the same Monaco commands and legend infrastructure; only insertion templates and parsers change.

---

## 11. Open questions (next iteration)

1. **Phase calendar:** equal split of `duration` vs explicit `phase_weights:` or `phase_days:`?
2. **Normalization:** row-wise vs column-wise vs global max for ASCII → numeric?
3. **Central teams:** do they consume the same `resources.teams` pool or a separate virtual pool?
4. **Multi-doc:** can `tech_programme_defaults` live in a shared fragment / `__include__` pattern, or only per market file?
5. **Migration:** do we auto-generate ASCII matrix from existing `tech_programmes` for display-only “matrix view” toggle?

---

## 12. Summary

- **YAML:** Optional `phase_capacity_matrix` (literal fixed-width) **or** structured `phase_drawdown` + `phase_axes`; optional `tech_programme_defaults` for DRY axes and templates.
- **Defaults:** Unchanged simple programmes stay simple; **template + visible resolution** replaces mystery weighting in the product narrative.
- **Monaco:** Cursor-aware **scaffolds**, snippet placeholders, and later hovers/diagnostics make the expert workflow **fast and learnable**.
- **Next step:** narrow §4.3 legend + §11 normalization in a short review, then move to `docs/superpowers/specs/` implementation spec + `writing-plans` when you want engineering scheduled.
