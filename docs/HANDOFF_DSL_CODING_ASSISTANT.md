# Handoff: DSL coding assistant (BYOK chat, Code view)

This document is the **build prompt** for a right-hand **LLM-powered coding assistant** that helps users draft and edit market YAML in the Capacity Pressure Modeler. It is written for an implementer (human or agent) who will wire UI, state, and API calls to match the quality bar of the existing app.

---

## 1. Product intent

Users stay in **View mode → Code** with the main **YAML editor** (`DslEditorCore` / `MainDslWorkspace`). A **dedicated assistant panel** on the right (replacing the current “DSL authoring / BYOK placeholder” copy in `DSLPanel.tsx`) behaves like a **serious coding assistant**: clear status, streaming replies, and **visible application** of changes to the buffer—not a black box that replaces the whole file silently.

**Representative user utterances:**

- “This market has 5 labs, 5 tech resources and a test capacity of 10.”
- “BAU uses 1 lab and is typically 1 full time tester.”
- “Add a campaign called Spring Promo starting `'2026-04-01'`, 21 days live, 14 days prep, high impact, 2 labs and 1 tech staff in prep, half that live.”
- “Move the **UK** summer campaign start to `'2026-07-01'` and extend duration by 7 days.”
- “Rename `programme_a` to `loyalty_push` and don’t change anything else.”

The assistant must **not** invent or “normalize” **dates**, **holiday lists**, or **unrelated sections** unless the user explicitly asks—this is non-negotiable and must be enforced in **system instructions** (see §6).

---

## 2. Ground truth in the repo

| Concern | Location |
| --- | --- |
| **Authoring rules for the LLM** | [`docs/LLM_MARKET_DSL_PROMPT.md`](./LLM_MARKET_DSL_PROMPT.md) — treat the **SYSTEM / INSTRUCTIONS** block as the canonical system prompt; ship it verbatim or load it at build time. |
| **Schema & behaviour** | [`docs/MARKET_DSL_AND_PIPELINE.md`](./MARKET_DSL_AND_PIPELINE.md), parser `src/engine/yamlDslParser.ts`, types `src/engine/types.ts`. |
| **Editor buffer** | Zustand `useAtcStore`: `dslText` / `setDslText` — the assistant **must** read and write through this so `DslEditorCore` stays the single source of truth. |
| **Code view shell** | `src/components/MainDslWorkspace.tsx`, `src/components/DslEditorCore.tsx`. |
| **Right panel placeholder** | `src/components/DSLPanel.tsx` — “DSL authoring” / `RightPanelSection`; replace placeholder with the real assistant **only when `viewMode === 'code'`** (or always show the section but **enable** chat + patching only in Code view—pick one UX and document it; prefer **visible only in Code view** so Technology/Business lenses stay focused). |
| **Parse errors** | `useAtcStore` `parseError` — after applying a patch, surface success vs failure; on failure, **do not discard** the user’s previous buffer without explicit undo (see §5). |

---

## 3. Deployment & trust model

- **Hosting:** GitHub Pages (static). **No server-side secret.** The user **pastes their own API key** in the UI.
- **Provider (v1):** OpenAI Chat Completions or Responses API with **streaming**.
- **Future:** Second provider (e.g. Google) behind a small **provider interface** (`OpenAIClient` / `GoogleClient`) so the rest of the UI is unchanged.
- **Key handling:** Store key in **`sessionStorage` or in-memory only** (not `localStorage` unless the product owner explicitly wants persistence across sessions). Never log the key; never put it in URLs or analytics. Show a short **security note**: key stays in this browser session; static site cannot hide it from the user’s machine—BYOK risk is accepted.
- **CORS:** Implement against the real OpenAI browser contract (or document a **tiny optional proxy** if platform policy blocks browser calls—only if needed; the goal is static-first).

---

## 4. UX specification (match app quality)

### 4.1 Layout

- **Placement:** Right column, same visual language as `RiskModelPanel` / `WorkbenchRunwayControls`: `border-border`, `bg-card`, `text-xs`/`text-sm` hierarchy, shadcn `Button`, `ScrollArea`, sensible gaps.
- **Regions (top → bottom):**
  1. **Header:** Title (“DSL assistant” or similar), optional link “Syntax reference” (reuse `DslSyntaxHelpBody` pattern from `MainDslWorkspace` if helpful).
  2. **Connection strip:** Provider (OpenAI v1), **model select**, **estimated cost** for the last turn / session (see §7), API key input (password field + “show” toggle), **Connect / Save key** or implicit save on blur.
  3. **Messages:** Scrollable thread; assistant messages support short explanations + optional **collapsible YAML snippet**; user messages as plain text.
  4. **Composer:** `Textarea` + Send; **disabled** when no key, when request in flight, or when not in Code view (if gated).
  5. **Status bar:** Single line: `Idle` | `Calling model…` | `Applying edit…` | `Parse check: OK` | `Parse check: failed — see error`.

### 4.2 Transparency (“never wonder what’s happening”)

- While **streaming:** show token/stream progress (spinner + “Receiving…”).
- Before **mutating `dslText`:** show **what will change** when possible:
  - **Preferred:** a **unified diff preview** (mini diff, syntax-highlighted) with **Apply** / **Discard** for the proposed buffer.
  - **Acceptable for v1:** “Replace entire document” only if the model returns a full file **and** the user confirms—never auto-replace the whole multi-market bundle without confirmation.
- **After apply:** run the same parse path the app already uses (`parseYamlToConfigs` / store pipeline) and show **OK** or the **existing `parseError` string** in the status bar and inline alert.

### 4.3 In-place edits

- The main editor must **update live** when the user clicks **Apply**: call `setDslText(next)` so Monaco/content reflects the patch immediately.
- Optional polish: brief **highlight flash** on changed line ranges (if easy with Monaco API); if too heavy, skip—diff preview is enough.

### 4.4 Guardrails (UX + copy)

- Short static note under the composer: “Won’t change dates or holidays unless you ask. Won’t invent public holiday dates.”
- If the model returns YAML that **fails parse**, keep the prior `dslText` and show **Retry** / **Edit request** with the error excerpt.

---

## 5. Technical approach for edits (implementation guidance)

Pick **one** strategy and implement it consistently:

**Option A — Structured patch (recommended for “coding assistant” feel)**  
- Use **tool calling** or a **JSON schema** output: e.g. `{ "patches": [ { "type": "replace", "old": "...", "new": "..." } ] }` with strict size limits, or line-based ops validated against the current buffer.
- Apply patches in order; if any patch fails (no unique `old` match), **abort** and return a clear error to the model + user.

**Option B — Full document return**  
- Model returns **complete** YAML for the relevant document(s); client shows diff vs current `dslText` and applies on confirm.
- For **multi-doc** buffers (`---` separators), require the model to return **all documents** unchanged except requested edits, per `LLM_MARKET_DSL_PROMPT.md` **§A**—or restrict v1 to **single-doc focus** when `country` selector targets one market.

**Never:** silently replace the buffer with a full regen of holiday `dates:` lists or campaigns the user did not mention.

---

## 6. System prompt requirements (must ship with the feature)

1. **Inject** the full **SYSTEM / INSTRUCTIONS** from [`docs/LLM_MARKET_DSL_PROMPT.md`](./LLM_MARKET_DSL_PROMPT.md) as the **system** message (or first developer message, depending on API).
2. **Append** a short **product-specific** block:

```text
You are embedded in the CPM web app Code view. The user's current YAML is passed in every request inside a clearly delimited block (e.g. <<<CURRENT_YAML>>> ... <<<END>>>). 
You must:
- Only change sections the user explicitly requested.
- Never change dates, durations, campaign names, or holiday data unless the user asked for that change.
- Never fabricate public or school holiday dates; follow the holiday rules in your base instructions.
- Prefer minimal edits; preserve unrelated lines, comments, and key order.
- Quote dates as 'YYYY-MM-DD' in YAML output.
When proposing file changes, respond with [the chosen structured format per implementation: patches JSON or full YAML + brief rationale].
```

3. **User message template** for each turn: optional user natural language + **always** the latest `dslText` (trimmed if huge; if over context limit, implement **truncation with a clear warning** or **per-market extraction** using existing helpers like `extractMarketDocument` / `dslByMarket` if appropriate).

---

## 7. Model picker and cost display

- **Model dropdown:** Curated list of OpenAI models suitable for coding/YAML (e.g. GPT-4.1, GPT-4o, o4-mini, etc.—keep updated from product owner).
- **Costs:** Maintain a small **in-repo table** (`src/lib/openaiPricing.ts` or similar) of **input $/1M tokens** and **output $/1M tokens** per model id. After each completed call, use **usage** fields from the API response (`prompt_tokens`, `completion_tokens`) to show:
  - **This message:** ~$X.XXXX
  - **Session total:** ~$X.XX  
  Display **estimates** with a disclaimer: “Approximate; actual billing per OpenAI.”
- When streaming completes without usage in stream, optionally **omit** per-message cost or fetch with a second call only if the API supports it—document behaviour.

---

## 8. Accessibility & resilience

- Keyboard: focus trap not required in panel, but **Send** on ⌘↵ / Ctrl+↵ in composer.
- Announce busy state for screen readers (`aria-busy` on the thread container during stream/apply).
- **AbortController** to cancel in-flight requests when the user navigates away from Code view or hits Stop.
- **Rate limiting:** disable Send for ~1s after failure to prevent hammering; optional max message length.

---

## 9. Acceptance criteria (checklist for the builder)

- [ ] Assistant **visible** in Code view right rail; styling consistent with existing controls.
- [ ] OpenAI **streaming** chat works with **user-provided key**; key not persisted to disk by default (or behaviour explicitly documented).
- [ ] **Model** selectable; **token usage** and **approximate $** shown per session / last turn.
- [ ] **dslText** / `setDslText` are the only write path to the main editor buffer.
- [ ] **Diff preview + confirm** (or equivalent) before destructive full-file replace.
- [ ] **Parse validation** after apply; errors shown; previous buffer recoverable.
- [ ] System prompt includes **`LLM_MARKET_DSL_PROMPT.md`** rules + **no implicit date/holiday changes**.
- [ ] Example flows from §1 work without corrupting unrelated YAML.

---

## 10. Out of scope (unless later specified)

- Server-side proxy, OAuth, or team billing.
- Automatic holiday sync (`sync:market-holidays`)—assistant may **explain** the workflow; it does not run commands.
- Multi-user collaboration or comment threads.

---

## 11. Suggested implementation order

1. Replace placeholder in `DSLPanel.tsx` with a shell component + `viewMode === 'code'` gating.
2. Wire **read** `dslText` from store; **write** only via confirmed apply path.
3. OpenAI streaming client + model list + pricing table + usage display.
4. System prompt loader (import markdown section at build time or duplicate into `src/prompts/dslAssistantSystem.ts` with a comment “keep in sync with docs/LLM_MARKET_DSL_PROMPT.md”).
5. Patch or full-doc diff pipeline + parse gate.
6. Polish: Stop button, empty states, error retries, copy for security note.

---

*End of handoff. Primary authoring spec for the LLM remains [`docs/LLM_MARKET_DSL_PROMPT.md`](./LLM_MARKET_DSL_PROMPT.md).*
