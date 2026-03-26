# Fresh-window prompt: critical review of the Capacity Pressure workbench

Copy the block below into a **new** Cursor chat (or any LLM) so it has no prior thread context. Point it at this repo: `/Users/dougbooth/capacity` (or your clone path).

---

## PROMPT (paste below)

You are reviewing a **concept / prototype** web app: a **YAML-driven market simulator** that paints a **multi-month calendar runway** (Mon–Sun weeks) with **Technology** and **Business** heatmap lenses. The product intent:

1. **Honest planning** — Surface **non-production tech work** (weekly BAU, integration cadence, tech weekly rhythm, campaign **prep** and **live** loads) **on the same timeline** as the **“busy periods”** people usually associate with **campaigns** and **in-store trading**, so leadership can see **when pressures stack**.
2. **Fair across markets** — **Per-market parameters** (lab/team/testing capacity, trading pattern, campaigns, optional windows and holiday behaviour) so countries are **not forced into one template** but stay **comparable** on the same UI.
3. **Power vs simplicity** — The engine has many knobs; the **authoring story** (human + LLM) should stay **as simple as possible** unless the scenario truly needs advanced fields.

### Your job

1. **Map reality** — Read the codebase (`src/engine/yamlDslParser.ts`, `types.ts`, `pipeline.ts`, `phaseEngine.ts`, `riskModel.ts`, `runwayViewMetrics.ts`, `useAtcStore.ts`, key components) and docs (`docs/CAPACITY-RUNWAY.md`, `docs/MARKET_DSL_AND_PIPELINE.md`, `docs/DSL_CAMPAIGNS_AND_TRADING.md`, `docs/LLM_MARKET_DSL_PROMPT.md`, `docs/VP-CAPACITY-RUNWAY-ONE-PAGER.md`). Summarise **data flow in plain English** in ≤10 bullets.

2. **Parity audit** — List **YAML keys the parser accepts** that are **missing or wrong** in `docs/LLM_MARKET_DSL_PROMPT.md`. List **documented keys that are ignored or stubbed** in code. Flag **duplicated or overlapping concepts** (e.g. multiple ways to tune “how hot” campaigns feel).

3. **Simplicity pass** — Propose a **tiered authoring model**: e.g. **Tier A (minimum viable market)** vs **Tier B (when you need it)**. For each **Tier B** knob, state **one sentence** on what breaks if we hide it from default LLM instructions.

4. **Weighting / parameters** — Do **not** assume the maths must change. Instead, answer: **Are UI-only tunings** (e.g. combined pressure importances, γ sliders) **clearly separated** from **YAML-per-market** truth? Where does **confusion** arise? Recommend **one** of: *simplify engine*, *simplify YAML surface*, *simplify UI*, or *improve docs only* — per finding.

5. **LLM authoring** — Rewrite **or** outline changes to `docs/LLM_MARKET_DSL_PROMPT.md` so an LLM reliably emits **valid, minimal** YAML first, with **optional advanced sections** only when the user asks. Call out **defaults** the LLM should rely on instead of inventing numbers.

6. **Prioritised backlog** — Give **5–10** items: **P0** (correctness / parity / misleading UX), **P1** (simplicity / onboarding), **P2** (nice-to-have). Each item: **one line** impact, **one line** suggested action.

### Constraints

- Prefer **removing or consolidating** over **adding features** unless there is a clear gap.
- Assume readers include **Segment PMO**-style stakeholders: they care about **pilot / market-0 suitability** and **cross-market comparison**, not LaTeX.
- Output **structured markdown**: sections with headings, tables where helpful, **no** generic fluff.

### Deliverable

A single review document I can drop into `docs/` or a ticket — actionable, opinionated, and grounded in files you actually opened or cited.

---

## After you run it

Merge the review’s **LLM prompt** suggestions back into [`LLM_MARKET_DSL_PROMPT.md`](./LLM_MARKET_DSL_PROMPT.md) and track **P0** items in issues or a short `docs/` note.
