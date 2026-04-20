# SME custom project definition — spec (YAML + Monaco)

**Status:** design / iteration  
**Audience:** product, SMEs editing market DSL in Monaco, implementers  
**Scope note:** The **implementation wedge** today is market runway / tech-heavy demand, but the **notation and engine direction** aim at **generic transformation capacity** — any programme type, any declared demand axis (§13, §14).  
**Related code today:** `tech_programmes` in YAML (`programme_support`, `live_programme_support`, `load`, `live_support_load`) parsed in `src/engine/yamlDslParser.ts`; editor chrome in `src/components/DslEditorCore.tsx`; assistant contract in `src/lib/dslAssistant/systemPrompt.ts`.

---

## 1. Problem statement

SMEs need to describe **technology / change programmes** (non-campaign work) in a way that:

1. **Defaults are enough** — a programme can be “one block” (dates + duration + rough headcount) and the engine applies a credible **drawdown shape** (e.g. one lab + one tester as % of capacity over time).
2. **Optional precision** — when the SME cares, they can spell out **phases** and **which departments** draw capacity in each phase, without hidden weighting or magic fudge factors in the UI copy.
3. **Fast typing** — power users should be able to sketch matrices in the editor almost as quickly as a markdown table, with **scaffold insertion** so they never have to remember key names from scratch.
4. **Optional coupling** — some real initiatives are **two or three streams** (e.g. digital + POS) that **sequence and converge** for integrated test; the DSL should allow that **without** forcing every SME to model dependencies (see §4).
5. **Shape at a glance** — while editing, a **Gantt-style companion** (swimlanes, bars, dependency arrows) derived from the same YAML makes the **calendar shape** obvious; it should **look like runway time axes**, not an alien chart (see §9.5).
6. **Full-stack authoring** — Monaco (and the DSL assistant) should be able to **insert scaffolds for all four system ingredients** (§2.1): capacity, restrictors, consumers, and risk/timing — so users can bootstrap a coherent market file without memorising the entire schema (§9.1).

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
| **Same pattern, many attach points** | **Capacity draw** = *who is pulled*, *how hard* (%), *when* (phases / dates), *what shape* (glyphs or curves). That tuple should generalise beyond `tech_programmes` (§13); **transformation-wide product intent** in §14. |
| **One schema, segment-native surfaces** | **Compact** markets get **shorter default scaffolds** and fewer matrix rows; **enterprise** markets get richer stubs — same grammar, different **Monaco snippet packs** (§2.3, §9.1). |

### 2.1 System model — four ingredients

The runway is built from four **roles** of YAML (names map to today’s market DSL; exact keys evolve with implementation):

| Ingredient | Plain language | Typical YAML today (illustrative) |
|------------|----------------|-------------------------------------|
| **1. Defined capacity** | How much room exists **before** calendar effects. | `resources:` (`labs`, `teams` / staff counts, optional future pools). |
| **2. Capacity restrictors** | Calendar or policy **shrinks** effective supply (does not “want” work — it **reduces** the envelope). | `public_holidays`, `school_holidays`, capacity taper / staffing multipliers, leave bands, etc. — holidays should carry **human-readable labels** and support **single days or ranges** (§2.4). |
| **3. Capacity consumers** | Things that **pull** on named pools over time. | **`tech_programmes`**, **`campaigns`**, **`bau`** rhythms — each should be able to declare **durations**, **phases**, and **% draw + swimlane** (matrix grammar, §5) against axes that map to supply. |
| **4. Risk / timing informers** | Events that **do not consume capacity** but **constrain when** things may happen (or how risky a window is). | e.g. `deployment_risk_blackouts`, `deployment_risk_events`, fragile windows — “no go-live week before AGM / global convention.” |

**Monaco’s job (authoring):** the editor should be able to **scaffold every ingredient** so a new market file is **syntactically valid and semantically meaningful** from the first insert — not a blank file and a README hunt (see §9.1 starter catalogue).

### 2.2 Marketing campaigns — multi-lane, phase-shifting consumers

Campaigns are **not** “marketing department only.” A flagship promo **redistributes load across departments and across the campaign lifecycle**:

| Phase / window | Who bears load (examples) |
|----------------|---------------------------|
| **Before live** | Technology (prep, integrations), Marketing (creative), Finance / BI (forecasting, baseline), Retail ops (briefings, layout). |
| **During live** | **Retail locations** (customer traffic, in-store execution), Service Desk (volume spike), Technology (incident / stability), Finance / BI (**daily** reporting / pacing), Marketing (in-flight optimisation). |
| **After / tail** | Service Desk (returns, queries), Finance / BI (close, reconciliation), Technology (decommission toggles, hardening), Insights (post-mortem). |

The **bearers of load change** by phase: the same campaign object should support a **`phase_capacity_matrix`** (or structured twin, §6) with **rows for every axis** that matters (including **stores / retail_footprint** as a pseudo-department if modelled as capacity), and **columns** for **PREP | LIVE | AFTER** (or finer). Prep/live split in today’s YAML (`campaign_support` vs `live_campaign_support`) is the **minimal** case; the matrix is the **rich** case when SMEs need cross-functional honesty.

**Spec intent:** reuse the **same % + glyph + `|` phase grammar** for `campaigns:` entries as for `tech_programmes:` (one notation, two consumer kinds — §13). Engine mapping may weight retail vs tech differently; the **file** stays legible.

### 2.3 Market scale and segment-specific authoring (US vs Spain, etc.)

**Same activities, different shape of org:** a **US-scale** market might have **tech-related headcount in the hundreds**, many named teams, handoffs, and parallel streams. A **Spain-scale** (or other compact) market might have **&lt;10** people in the same functional bucket, **fewer named teams**, **fewer handoffs**, and the **same promotional or programme story** told with **much less YAML surface area**.

**Principle — one schema, humane surfaces:** the **underlying DSL** does not fork by country. What changes is **how much the SME is asked to type by default**:

| Concern | Large / enterprise-style market | Compact market (e.g. typical ES SME) |
|---------|-----------------------------------|----------------------------------------|
| **`resources.teams`** | Many named teams, sizes, optional central axes | **One or two** aggregated teams (e.g. `market_it` with `size: 8`) — sufficient when nobody is staffed as “squad A vs squad B” |
| **Matrices** | Full **department × phase** grid when portfolio needs it | **2–3 row** matrix stub (Technology, Service_Desk, Ops) or **skip matrix entirely** in starter — rely on `programme_support` / `campaign_support` |
| **Campaign scaffolds** | Optional **multi-row** PREP/LIVE/AFTER cross-functional block (§2.2) | **Single** prep/live block first; “**Add cross-functional matrix**” as a **second-tier** scaffold, not the default |
| **Composite / streams** | Shown in advanced menu | Hidden until user runs “Insert composite…” or profile is `standard+` |

**Monaco snippets must be segment-specific (or profile-specific):**

1. **Primary signal:** `country:` (or focused market tab in multi-doc) selects a **snippet pack** (`US`, `ES`, …) maintained as data — default matrix row labels, default team names, which optional blocks appear in **starter document**.
2. **Secondary signal:** optional top-level key e.g. `market_authoring_profile: compact | standard | enterprise` (or app UI toggle “**Authoring density**”) overrides country default when SMEs want US-depth in a small market or vice versa.
3. **Heuristic (optional):** if `resources.teams` already has **N &gt; threshold** keys, suggest **enterprise** scaffolds on next insert; if **≤1** team, keep **compact** suggestions.

**Non-goal:** forcing Spain SMEs to scroll past a **US-shaped** 20-line matrix every time they add a campaign. The **first** experience should look like **their** market file today — short, familiar keys — with a **clear path** to deepen (`Insert → Campaign → With cross-functional matrix`).

### 2.4 Labelled holidays (date or range) and LLM-assisted national lists

**Why labels matter:** restrictors are shared context for SMEs, risk, and stores. A heatmap or Gantt should be able to say **“Navidad”**, **“Golden Week”**, **“Thanksgiving weekend”** — not only a mute red cell on `2026-12-25`. **Labels are first-class** in the model, not comments lost to tooling.

**YAML shape (spec direction — evolution from flat `dates:`):**

- Prefer a list of **windows**, each with **`start`** (`YYYY-MM-DD`), optional **`end`** (inclusive range; omit for single day), and **`label`** (short string, UTF-8 OK).
- Remain **backward compatible** with today’s **`dates:`** array of bare strings where labels are unknown; the UI may show generated labels (“Public holiday”) until the SME upgrades entries.

Illustrative (not necessarily final key names — align with parser migration):

```yaml
public_holidays:
  auto: false
  windows:
    - start: '2026-01-01'
      label: Año Nuevo
    - start: '2026-12-25'
      end: '2026-12-26'
      label: Navidad
  staffing_multiplier: 0.25
```

Apply the same idea to **`school_holidays`** (e.g. “Semana santa”, “Summer break”) where ranges are already natural.

**System-maintained national holiday catalog (LLM on the backend):**

- The product may run an **offline or on-demand backend job** (including an **LLM step**) to **propose** national (or regional) public holidays for a given **`country` + year**, returning **dated entries with labels** and optional **`notes`** (“verify against official gazette”).
- **Do not** call the LLM on every Monaco keystroke. Instead:
  1. **Cache** approved suggestions per `(country, year)` (versioned JSON in repo, blob store, or DB — implementation choice).
  2. **Monaco** and scaffolds **read the cache** for completions, “insert next window”, and tooltips — fast, deterministic.
  3. **Refresh flow:** SME or admin triggers **“Suggest / refresh public holidays”** → backend runs LLM + rules → UI shows a **diff preview** → user **accepts** merged lines into YAML (or rejects). Same posture as the existing DSL rule: **never silently fabricate** authoritative dates; **human confirmation** for anything written to the golden file.

**Validation (non-negotiable):** parse dates, reject invalid ranges (`end` &lt; `start`), dedupe overlaps with policy (merge or warn), and keep **audit metadata** optional (`source: official_pdf_2025`, `generated_at`, `model_id`) so enterprise users know what to trust.

**Monaco integration:** autocomplete **labels** and **date ranges** from the cache; scaffolds insert **one commented example** with `windows:` + `label` (§9.1). School holidays get parallel treatment.

---

## 3. Conceptual model (mental map for SMEs)

Within a **single consumer** (e.g. one tech programme), think in three layers:

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

**Evolved form (per-phase % load + glyphs):** each **cell** is an optional **1–3 digit percent** (0–100) immediately followed by a **glyph run**; **`|`** separates phases so columns stay obvious without fragile space alignment.

```text
Project_type: e.g. POS_upgrade, Network_Upgrade, Hardware_Replacement, Store_Refurb
    - Phases:        INTEGRATION | MARKET_TEST | PILOT      | DEPLOYMENT   | AFTERCARE
    - Technology:    50wwww      | 65www       | 65wwwwww   | 45wwwwwwww   | 35wwww
    - Service Desk:  10----      | 15---       | 40----ww   | 55----wwww   | 30wwww
    - Operations:    5----       | 25-ww       | 50wwwwww   | 70wwwwwwww   | 40wwww
```

**Glyph-only cells (backward compatible):** if the SME omits the leading number, behaviour matches the earlier sketch — relative intensity only; the engine may still impute % from `programme_support` + template (§8).

```text
    - Technology:    wwww | www | wwwwww | wwwwwwww | wwww
```

**Encoding (to finalize in §5.3):**

- **Row** = department or workstream (Technology, Service Desk, Operations, …).
- **Column** = phase, in header order, separated by **`|`** (recommended) or aligned whitespace (parser may accept both; **`|` is preferred** for clarity).
- **Cell** = `[pct][glyphs…]` where **`pct`** is **0–100**: *share of that department’s capacity this programme draws during that phase* (see §12 for “% of what exactly?”). **`glyphs`** carry **relative shape / emphasis** within the phase (same ladder as before — duration spread, week-to-week texture, or Gantt bar “fullness”; exact mapping is legend + engine).
- **No leading digits** → glyphs-only cell; % comes from defaults or is derived.

This stays **scan-friendly and diff-friendly**: changing `50` → `65` is an obvious capacity tweak without hunting scalar keys elsewhere.

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
      Phases:           INTEGRATION | MARKET_TEST | PILOT       | DEPLOYMENT  | AFTERCARE
      Technology:       50wwww      | 65www       | 65wwwwww    | 45wwwwwwww  | 35wwww
      Service_Desk:     10----      | 15---       | 40----ww    | 55----wwww  | 30wwww
      Operations:       5----       | 25-ww       | 50wwwwww    | 70wwwwwwww  | 40wwww
```

**Why literal block:** preserves spaces; aligns with Monaco column editing; easy to paste from email/Confluence.

**Versioning (optional key):** `phase_capacity_matrix_format: ascii_v1` if we ever break encoding.

### 5.3 Legend iteration (candidates)

**Percent prefix (recommended with glyphs):**

- **1–3 ASCII digits** at the start of a cell = **load %** for that **department × phase** (clamp 0–100). Trailing **non-digit** characters = glyph ladder (below).
- **Ambiguity rule:** if a cell is **all digits**, it is **100% numeric** (treat as `%` only, uniform within phase — rare).
- **Editor affordance:** hover shows e.g. `Technology · INTEGRATION → 50% capacity · shape wwww (…decoded…)`.

Pick **one** primary **glyph** scheme per version to avoid ambiguity:

| Scheme | Pros | Cons |
|--------|------|------|
| **A. Glyph ladder** (`-` < `.` < `w` < `W` < `#`) | Fast to type, visual | Needs one-page legend in UI |
| **B. Digits 0–9 per cell** | Unambiguous | Narrow columns only; less “at a glance” |
| **C. Quarter steps** (`0`, `1`, `2`, `3`, `4` = 0%, 25%, …) | Maps cleanly to engine | Slightly more typing |

**Recommendation:** **`[pct][glyph ladder]`** for SMEs who want both **headline %** (department draw) and **shape**; **glyph-only** remains valid for relative-only rows; structured YAML (§6) remains the escape hatch for tools.

### 5.4 Precedence rules (YAML)

When multiple sources exist on one `tech_programmes` item:

1. If `phase_capacity_matrix` (or structured `phases:` list — see §6) is **present and valid** → it drives **phase-wise behaviour**. **Leading % in a cell** (when present) is the **authoritative department load %** for that phase; **glyphs** refine **shape** within the phase. Where a cell has **glyphs only**, relative shape still applies and % may be imputed from `programme_support` + template (§8).
2. If matrix **absent** → existing **`programme_support` + duration** behaviour remains (default template).
3. If both matrix and `load:` / per-phase keys conflict → **matrix wins** for phases it covers; parser emits **warning** listing ignored keys.
4. If **structured `phase_department_load_pct`** (§6) and the literal matrix both set % for the same cell → **literal matrix wins** (single source of truth in file order) or **error** — pick one at implementation time and document it.

---

## 6. Structured YAML alternative (same semantics)

Some SMEs will prefer pure YAML. Equivalent expressiveness:

```yaml
phase_axes: [INTEGRATION, MARKET_TEST, PILOT, DEPLOYMENT, AFTERCARE]

# Optional: explicit % per department × phase (0–100), mirrors "50" in "50wwww"
phase_department_load_pct:
  Technology:     [50, 65, 65, 45, 35]
  Service_Desk:   [10, 15, 40, 55, 30]
  Operations:     [5,  25, 50, 70, 40]

# Relative shape only (0–1); combine with pct row-by-row in engine, or omit if glyphs-only matrix carries shape
phase_drawdown:
  Technology:     [0.35, 0.25, 0.55, 0.85, 0.40]
  Service_Desk:   [0.0,  0.1,  0.25, 0.45, 0.40]
  Operations:     [0.0,  0.2,  0.55, 0.85, 0.40]
```

**Mapping:** `phase_department_load_pct` arrays align with `phase_axes` (integers **0–100**). **`phase_drawdown`** values remain **0–1 relative shape** within each phase for that row. If **only** `phase_drawdown` exists (no `%` block), treat as legacy relative-only row (same normalization as before — recommend **per-phase max = 1** across departments for that slice). When **both** `%` and `phase_drawdown` exist, **% sets scale**, **drawdown sets intra-phase curve** (document the combine rule at implementation, e.g. multiply vs week-fraction only).

**Trade-off:** unambiguous but slower to type; good for tooling export/import.

**Spec decision:** support **both** literal matrix (`[pct][glyphs]` per cell) and structured arrays; canonical internal form is numeric matrix post-parse.

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

**Product goal:** Monaco should be able to **create all YAML components** needed to start populating **meaningful** runway data — not only `tech_programmes`, but **supply, restrictors, consumers, and risk** (§2.1), in an order that parses and applies.

**Trigger ideas:**

- **Command palette:** “DSL: Insert scaffold…”
- **Context menu** on YAML structure gutter (if we add custom margin glyph later)
- **Keybinding** e.g. `Cmd+Shift+Y` (configurable) when focus is in Monaco
- **High-level:** “**Insert starter market document**” — one action drops a **commented skeleton** with `country`, `resources`, holiday stubs, `bau`, `campaigns`, `tech_programmes`, and `deployment_risk_*` placeholders in a sensible order — **variant chosen by segment / profile** (§2.3).

**Behaviour:**

1. Resolve **snippet tier** (`compact` \| `standard` \| `enterprise`) from **`country:`** (default pack per ISO market), optional **`market_authoring_profile`**, and/or **UI authoring density** — see §2.3.
2. Detect **AST position** (tree-sitter YAML or lightweight line/heuristic parser): are we under `tech_programmes`, `campaigns`, `resources`, `bau`, `public_holidays`, `deployment_risk_*`, top-level?
3. Offer **entity-specific** scaffold: e.g. under `- name:` inside `tech_programmes` → insert block for **minimal programme**, **programme + matrix stub** (row count depends on tier), or **campaign row**; at **document root** on empty buffer → offer **full starter bundle** (tiered, below).
4. Insert as **snippet placeholders** (`${1:name}`, `${2:date}`) with Monaco snippet mode.

**Scaffold catalogue (non-exhaustive):**

| Context | Scaffold |
|---------|----------|
| **Starter market document (compact)** | Shorter bundle for small markets: `country` → `resources` (**labs + one aggregated team**, comment “split teams when N grows”) → holidays → minimal `bau` → **one** `campaigns` example (**prep/live only**, no multi-row matrix) → **one** `tech_programmes` example (**no** `phase_capacity_matrix` in default) → optional single `deployment_risk_blackouts` comment block |
| **Starter market document (standard)** | Current “full but sane” skeleton: labs + one team + one campaign + one programme + both holiday blocks + risk stubs |
| **Starter market document (enterprise)** | Adds: **multiple** `resources.teams` lines (named squads), sample **`phase_capacity_matrix`** on programme, **campaign cross-functional matrix** stub (§2.2), optional composite stream comment |
| New `tech_programmes` item | Minimal `name`, `start_date`, `duration`, `programme_support` |
| Same + phases | Adds `phase_capacity_matrix: \|2` with header + example rows using **`|`-separated `pct+glyph` cells** (§5.1); **row count** scales with snippet tier (§2.3) — compact = fewer swimlanes |
| Composite initiative | Stub for **second stream** + optional **convergence / integration** phase labels (see §4.3) |
| `campaigns` row | Prep/live/support block matching shipped examples; **optional** second scaffold: **campaign + departmental phase matrix** (rows: Technology, Service_Desk, Finance_BI, Retail_ops, Marketing — cols: PREP \| LIVE \| AFTER) per §2.2 |
| `resources.teams` | One team with `size` |
| `bau` weekly promo | `day`, `labs`, `support_days` |
| `public_holidays` / `school_holidays` | Prefer **`windows:`** with **`start` / optional `end` / `label`** (§2.4); fallback stub: `auto: false`, empty `dates:` + comment on multipliers + “Insert labelled windows from catalog” |
| `deployment_risk_blackouts` / events | Named window + `dates` or month curve stub + comment “does not consume capacity — timing only” |
| Multi-doc separator | Line with only `---` |

*Implementation note:* default **country → tier** mapping is **data** (JSON / TS map), not hard-coded prejudice — e.g. ship `ES` → `compact`, `US` → `standard` until SMEs opt into `enterprise`; always overridable via `market_authoring_profile` or UI.

### 9.2 “Insert at cursor” vs “insert sibling”

- **Inside a mapping** → insert **key: value** at correct indent.
- **After list item** → insert new `-` item with trailing newline.
- **On blank line under `tech_programmes:`** → insert full new list element.

Requires **indent stack** from current line + known DSL schema (can ship as JSON Schema or hand-maintained “insertion points” map).

### 9.3 Inline assistance (later tranche)

| Feature | Purpose |
|---------|---------|
| **Ghost text** (inline suggest) | After `tech_programmes:` newline, ghost `  - name: ` … |
| **Hover** on `phase_capacity_matrix` | Decode **% + glyph** for cell / segment under cursor (§5.3) |
| **Fold regions** | Fold literal matrix block independently of rest of file |
| **Diagnostics** | Matrix column count ≠ header → squiggle with fix action “pad or trim” |
| **Gantt companion** | Live **shape preview** under or beside the editor (§9.5) |

### 9.4 DSL assistant alignment

Extend assistant instructions so the model:

- Prefers **patch edits** for matrix blocks (replace whole literal block as one patch when needed).
- Never silently drops `phase_capacity_matrix` when editing unrelated keys.
- When user says “add deployment spike for Operations”, **patch the ASCII row** rather than inventing new scalar fudge keys.
- For **campaigns**, when the user adds cross-functional load, **extend the same matrix grammar** (§2.2) rather than introducing campaign-only fudge keys.
- For **holidays**, **never** invent official dates without user intent; if using LLM-backed suggestions, output only as **preview / patch** for acceptance (§2.4). Labels must survive the edit.

### 9.5 Programme shape preview (Gantt companion)

While drafting a **`tech_programmes`** or **`campaigns`** block (or future composite initiative), the SME should see a **generated diagram** of the **calendar shape** without switching mental models to heatmap cells. This is a **companion view**, not a second source of truth: it is **derived from the YAML** (plus documented defaults), debounced off the editor buffer.

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

1. **Parse step:** extract `phase_capacity_matrix` literal → trim → split lines → header row → **split each body row on `|`** (trim segments). Whitespace-only alignment mode (no `|`) can be a fallback parser path if we keep supporting pasted tables.
2. **Per cell:** apply `^(\d{1,3})?(.*)$` to trimmed segment → optional **integer %** (clamp 0–100) + **glyph tail** (may be empty if cell is digits-only). Normalise glyph tail with published legend to **shape weights**.
3. **Combine:** `%` × department capacity (or programme-attributed slice — see §12) × shape weights → **absolute** lab/team units per sub-phase or per week inside each phase window.
4. **Map** phase windows onto calendar: either **equal-length slices** of `duration` or explicit `phase_duration_days:` map if SME provides it (optional future key).
5. **Warnings:** unknown row label → warn + skip row; **wrong segment count** vs header → error or warn; **% > 100** → clamp + warn.

---

## 11. Alternative uses of the same interaction model

The **“fixed-width table in YAML + scaffold + hover decode”** pattern can extend to:

- **Campaign** prep / live / after **multi-department** intensity grids (§2.2) — same `% + glyph + \|` grammar as programmes.
- **BAU** seasonal overlays (“Q4 extra service desk load” as a small matrix on weeks).
- **Risk / deployment** annotations where SMEs mark sensitive windows per region (informers, not consumers — §2.1).

Reuse the same Monaco commands and legend infrastructure; only insertion templates and parsers change.

---

## 12. Open questions (next iteration)

1. **Phase calendar:** equal split of `duration` vs explicit `phase_weights:` or `phase_days:`?
2. **Normalization:** row-wise vs column-wise vs global max for ASCII → numeric?
3. **% semantics:** % of **department pool** (market IT / SD / Ops capacity) vs % of **programme-attributed FTE** from `programme_support` — must be one documented rule (and shown in Gantt hover, §9.5).
4. **Central teams:** do they consume the same `resources.teams` pool or a separate virtual pool?
5. **Multi-doc:** can `tech_programme_defaults` live in a shared fragment / `__include__` pattern, or only per market file?
6. **Migration:** do we auto-generate ASCII matrix from existing `tech_programmes` for display-only “matrix view” toggle?
7. **Composite shape:** prefer **parent + `streams:`** vs **linked sibling ids** for digital + POS style cases?
8. **Convergence:** is `INTEGRATION` always a shared calendar slice across streams, or a separate explicit `convergence:` block with dates?
9. **“Dark” delivery:** express as phase-gated visibility, separate virtual load channel, or documentation-only until engine supports it?
10. **Gantt preview:** default-on vs opt-in; split **below** vs **beside** Monaco; show **all** programmes in buffer vs cursor-scoped only?
11. **Lane taxonomy:** fixed department list vs YAML-driven row labels only; how to order streams vs departments in swimlanes?
12. **Enterprise registry:** global department / cost-centre id list vs fully market-local row labels; versioning when HR renames org units?
13. **Central vs market supply:** single YAML document vs shared **global capacity** file (central product dev, platform) referenced by many markets — how do we avoid double-booking shared pools?
14. **Campaign matrix:** same top-level key `phase_capacity_matrix` on a campaign row vs nested `cross_functional_load:` — naming and parser precedence vs legacy `campaign_support` keys?
15. **Retail / store capacity:** model as a named **demand axis** (footfall proxy) vs implicit trading load only — does it get its own row in the matrix?
16. **Snippet tier defaults:** who owns **country → compact/standard/enterprise** defaults (product data vs per-tenant config); how to avoid stereotyping while keeping ES files **welcoming** by default?
17. **Holiday authority:** primary source = **government ICS / API** vs **LLM-only** proposal with mandatory human sign-off; legal/regional subdivisions (state vs federal) — single `country:` key enough?

---

## 13. Enterprise generalization (north star)

Yes — the direction **does** make sense as the seed of a **small, opinionated enterprise DSL** focused on one job: describing **capacity draw** (who is pulled, how hard, over which time slices) in a way humans can type and diff.

**Core abstraction (generic):**

| Dimension | Role |
|-----------|------|
| **Initiative** | Something that consumes capacity: tech programme, campaign, BAU spike, risk response, central programme, … |
| **Demand axis (“department”)** | Any named pool the org cares about: Technology, Service Desk, Operations, **Finance change**, **HR ops**, **Central platform**, store labour, **labs** (may be a different unit than FTE %), etc. |
| **Time structure** | Phases, weeks, or explicit dates — aligned to a calendar span. |
| **Draw** | **`%`** = headline load on that axis for that slice (once §12.3 picks the denominator: pool vs programme FTE). **`Glyphs`** (or numeric curves) = **shape** within the slice so the same 50% can still look “flat” vs “spiky” in the engine and Gantt. |

**Why this is “almost generic” but not unconstrained:**

- It is **not** trying to be MS Project in YAML — no full task network as the default path.
- It **is** trying to be a **portable notation** for “this initiative stresses these axes, this much, then” — the same matrix grammar can attach to **`tech_programmes` today**, and later to **`campaigns`**, **BAU overlays**, or a top-level **`capacity_initiatives:`** list if the product splits concerns.
- **Row labels** stay **YAML-driven** (SME-defined strings) until a **registry** maps them to engine pools (`resources.teams`, labs, central teams); unknown rows → warn + policy (ignore vs aggregate to “other”).

**What you gain for the enterprise story:**

- One **visual and editorial habit** (matrix + optional Gantt) for many entity types.
- **Explicit %** removes the “trust the black box” problem when talking to IT, Ops, and Finance about the same plan.
- **Structured twin** (`phase_department_load_pct` + `phase_drawdown`, §6) keeps **ETL / portfolio tools** happy while SMEs keep the ASCII table.

**Implementation posture:** ship the grammar in **one vertical** (`tech_programmes`) first; prove parser + preview + runway consumption; then **lift** the same block shape to other initiative types without inventing a second notation.

For **positioning** (transformation-wide scope, central pools, OSS intent), see **§14** below.

---

## 14. Vision: transformation capacity → generic platform

### 14.1 TRANSFORMATION_CAPACITY (the space we mean)

**Transformation capacity** is the umbrella: **any change or run-the-business programme** that pulls on **finite people, teams, or machine-like slots** — not only “market IT + labs.” That includes:

- **Market / segment** delivery (stores, local ops, local tech).
- **Central / global** product and platform engineering, **undefined or evolving team names** (row labels in the matrix precede formal org design; the **registry** in §13 catches up when `resources` or a shared taxonomy defines the pool).
- **Shared services** (finance change, HR, internal comms, risk, cyber) when the org wants them on the **same runway** as tech.

The DSL’s job stays the same: **declare supply**, **declare demand as draw over time**, **show the squeeze** — whether the denominator is “testers in Poland” or “global platform squad hours.”

### 14.2 Central, global, and “teams not invented yet”

- **Undefined axes:** matrix **row labels** are allowed **before** those teams exist in `resources:`; the engine treats them as **demand lines** that resolve once supply is named (warn until mapped). That matches how transformation portfolios are written before headcount is final.
- **Central capacity:** supply blocks can describe **global pools** (e.g. `central_product_engineering: { size: N }`) consumed by initiatives that are not tied to a single country document — multi-doc or `includes:` (see §12, item 13) are the likely mechanism; **draw** rows reference the same axis names as matrix rows.
- **Non-specific “capacity”:** labs and FTE are **examples** of units; the model generalises to **any scalar or counted pool** the schema admits, as long as demand declares **which pool** and **what % / shape**.

### 14.3 Path to a generic programme platform

Short-term, the product stays anchored in **segment / market runway** (today’s app). Medium-term, the **same file format and UI patterns** (YAML, Monaco, Gantt preview, heatmaps) support **programmes of any kind across departments of any kind** — with initiative types and supply types growing by **registration**, not forked notations.

Long-term **platform** traits (design goals, not commitments on a date):

- Pluggable **initiative kinds** (tech programme, HR transformation, regulatory programme, …) sharing **one draw grammar**.
- Pluggable **supply dimensions** (people, vendor throughput, environment slots, …) where the org defines pools.
- Optional **federation**: market files that **reference** central capacity so global teams are not double-counted across regions.

### 14.4 Open source and “no Smartsheet / M365 tax”

**Intent:** release something teams can **run, fork, and extend** without a **Microsoft 365 / Smartsheet-class** subscription as the price of entry for honest capacity-on-a-calendar views. YAML-in-git already aligns with **inspectable, portable** planning.

**What OSS does *not* replace:** portfolio governance, approvals, or HR systems — it **grounds the conversation** in a shared numeric and timeline surface. Commercial packaging (hosted SaaS, support) can coexist with an OSS core if the project goes that way; this section records **product intent**, not a licence choice (that remains a repo-level decision when you ship).

---

## 15. Summary

- **Spectrum:** **Minimal** = one duration, one resource picture, one visible drain model; **maximal** = dependencies, **streams**, convergence (shared integration test), optional **dark / gated** cutover — still YAML-first and inspectable.
- **YAML:** Optional `phase_capacity_matrix` (literal: **`|`-separated cells**, each **`[pct][glyphs]`** or glyph-only) **or** structured `phase_axes` + optional **`phase_department_load_pct`** + `phase_drawdown`; optional `tech_programme_defaults` for DRY axes and templates; **composite** modelling (parent + streams vs linked siblings) to be chosen from §4.3.
- **Defaults:** Unchanged simple programmes stay simple; **template + visible resolution** replaces mystery weighting in the product narrative.
- **Monaco:** Cursor-aware **scaffolds**, snippet placeholders, and later hovers/diagnostics make the expert workflow **fast and learnable**; composite cases get **progressive** inserts (stream, convergence, link).
- **Gantt companion:** A **derived** swimlane + dependency diagram (bars + arrows) shares **runway-aligned time axes and tokens** (§9.5) so users see **project shape** while typing; heatmaps remain the detailed capacity view.
- **Enterprise DSL seed:** §13 — same **% + phase + axis** pattern generalises to **any initiative type** once demand axes are registered; start with `tech_programmes`, lift notation later.
- **Transformation → platform:** §14 — **TRANSFORMATION_CAPACITY** (umbrella for any change programme on finite pools); central / undefined teams; generic programme × department platform path; **OSS intent** so capacity-on-a-calendar is not M365/Smartsheet–gated (§14.4).
- **Four ingredients + Monaco:** §2.1 (capacity, restrictors, consumers, risk informers); §9.1 **tiered starter scaffolds** (compact / standard / enterprise) for a whole coherent file; **campaigns** as multi-lane phase-shifting consumers (§2.2).
- **Segment-native YAML:** §2.3 — **one schema**, different **default snippet depth** (US-scale vs ES-scale); ES SMEs are not greeted with US-shaped walls of YAML; **same activities**, fewer named handoffs in compact files.
- **Holidays:** §2.4 — **date or inclusive range + label**; optional **LLM-assisted** national lists **cached** for Monaco; **labelled** restrictors for runway clarity; human accept before write.
- **Next step:** narrow §5.3 legend + §12 normalization and composite choice in a short review, then move to `docs/superpowers/specs/` implementation spec + `writing-plans` when you want engineering scheduled.

**One-line north star:** same draw notation, many initiative and supply types; transformation-wide in intent, generic platform over time; inspectable YAML in git as the portable contract.
