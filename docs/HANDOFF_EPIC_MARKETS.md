# Handoff: Data model — segments, countries, and markets

**Epic:** [BACKLOG_EPICS.md](./BACKLOG_EPICS.md) — `epic-markets`  
**Stack context:** React 18 + Vite 6 SPA. Bundled market YAML under `public/data/markets/`, runtime order from generated `manifest.json`. Engine parses multi-doc YAML via `parseAllYamlDocuments` (`src/engine/yamlDslParser.ts`).

This document is a **design + build-ready handoff**: it inventories today’s behaviour, names the gaps versus the epic goal, proposes a target shape, and breaks work into verifiable slices.

---

## 1. Epic goal (product)

**Goal:** Add **new runway segments** and **new countries/markets** without scattered code edits and silent drift between files.

**Outcomes (from backlog):** A repeatable checklist or script path to ship a new market; fewer hard-coded assumptions in UI and DSL parsing; a clear contract for what a **segment** means in DSL + UI.

**Dependencies:** None — foundational for `epic-runway-autoplan`, `epic-corporate-calendar-risk`, `epic-market-acl`, and any manifest-driven feature.

---

## 2. Current behaviour (inventory)

### 2.1 Market list and ordering

| Piece | Role |
| --- | --- |
| `public/data/markets/*.yaml` | One file per market id; filename stem = id (e.g. `DE.yaml` → `DE`). |
| `scripts/generate-market-manifest.mjs` | Scans `*.yaml`, excludes `MANIFEST_EXCLUDE` (currently `NA`), sorts ids, writes `public/data/markets/manifest.json`. |
| `npm run generate:markets` / `prebuild` / `dev` | Regenerates manifest before Vite. |
| `src/lib/runwayManifest.ts` → `fetchRunwayMarketOrder()` | Fetches manifest at runtime; validates ids with `/^[A-Za-z]{2,8}$/`; uppercases; falls back to `FALLBACK_RUNWAY_MARKET_IDS` in `src/lib/markets.ts`. |
| `src/App.tsx` (bootstrap) | For each id in (possibly ACL-filtered) order, fetches `data/markets/{id}.yaml`; on failure uses `defaultDslForMarket(id)` from `src/lib/marketDslSeeds.ts`. |

**Implication:** Market **order** in the UI is **alphabetical by id** from the manifest, not author-defined — unless code uses separate ordered arrays (segments, below).

### 2.2 Segments (LIOM / IOM) — triple source of truth

Segments are **not** read from `public/data/segments.json` at runtime for ordering. Instead, the same membership lists are duplicated:

1. **`public/data/segments.json`** — `{ "LIOM": [...], "IOM": [...] }` (JSON).
2. **`src/lib/capacityAccess.ts`** — `SEGMENT_MARKET_IDS` (comment: keep in sync with `segments.json`).
3. **`src/lib/markets.ts`** — `RUNWAY_LIOM_SEGMENT_MARKET_IDS`, `RUNWAY_IOM_SEGMENT_MARKET_IDS` for compare-strip column order and `runwayCompareMarketIds()`.

`RunwayFocusSelect.tsx` uses `runwaySegmentMarketsOrdered()` to intersect segment lists with the live manifest so missing files do not break the picker.

**UI contract today:**

- **`RUNWAY_ALL_MARKETS_VALUE`** (`__ALL__`) + label **LIOM** — multi-column compare for LIOM segment markets.
- **`RUNWAY_IOM_MARKETS_VALUE`** (`__IOM__`) + label **IOM** — same for IOM.
- Single-market focus uses the **ISO-like id** (e.g. `DE`, `UK`).

ACL (`parseCapacityAccess`, `runwayFocusAllowed`) keys off **segment codes** `LIOM` and `IOM` matching `SEGMENT_MARKET_IDS`.

### 2.3 DSL identity field

`yamlDslParser` treats **`market:`** or legacy **`country:`** as the document’s market id (`normalizeYamlObject` / pipeline config). Docs sometimes say “country code”; shipped samples use `market:` (e.g. `UK.yaml`).

### 2.4 Fallback and bundling

- **`defaultDslForMarket`** (`src/lib/marketDslSeeds.ts`): optional `?raw` imports for a **subset** of markets; any other id gets **`minimalDsl(country)`** string template (sufficient to parse, not a full calendar recipe).
- **Stub `NA`**: can exist on disk for calendar/engine experiments but is **omitted from manifest** via `MANIFEST_EXCLUDE`.

---

## 3. Gaps vs epic (problem statement)

1. **Drift:** Adding a market to LIOM or IOM requires updating **three** places (JSON + `capacityAccess` + `markets.ts`) or behaviour diverges (picker, ACL, compare order).
2. **No single “segment registry” API:** Nothing loads `segments.json` as the canonical runtime config; compare order is hard-coded arrays, not data-driven ordering within a segment.
3. **Manifest is id-only:** No metadata (display name, region, segment membership, sort key) in manifest — limits tooling and “add a country” docs.
4. **ID validation is loose:** 2–8 Latin letters; no check against ISO 3166-1 alpha-2 where appropriate, no CI guard that YAML `market:` matches filename.
5. **Operational docs are fragmented:** `MARKET_DSL_AND_PIPELINE.md` mentions new markets; segment sync is easy to forget.

---

## 4. Target design (recommended direction)

### 4.1 Principles

- **One canonical file** for “which markets exist” and **one** for “segment → ordered market ids” (or merge into a single manifest with nested segments).
- **Runtime** reads generated JSON only; **TypeScript** derives types or narrow helpers from the same source to avoid a third duplicate list.
- **Validate** in CI: manifest ↔ files on disk; optional: `market:` in each YAML matches basename; segment lists ⊆ manifest ids.

### 4.2 Options (trade-offs)

| Approach | Pros | Cons |
| --- | --- | --- |
| **A — Extend `manifest.json`** with `markets: [{ id, label?, sortKey?, segment? }]` and generate segments into the same file | Single fetch; room for display names later | Larger manifest; generator script grows |
| **B — Keep `manifest.json` minimal**; add `segments.json` as **only** segment source; TS imports JSON (Vite) or codegen | Clear separation | Must ensure codegen or import replaces manual `SEGMENT_MARKET_IDS` / runway arrays |
| **C — YAML front-matter in each market file** for segment membership | Colocated | Harder to scan; merge order still needs a rule |

**Recommendation:** **B or A**. Prefer **B** if you want minimal churn to existing `manifest.json` consumers: make **`public/data/segments.json` authoritative**, delete duplicated arrays from `markets.ts` / `capacityAccess.ts` by **importing** the JSON (or generating a `.ts` barrel in `prebuild`). Prefer **A** if you want **one HTTP request** and a single place for ops to look.

### 4.3 Contract: “segment” (for implementers)

- A **segment** is a **named bundle of market ids** with a **stable code** (`LIOM`, `IOM`, future codes). It is **not** a DSL field inside each document today; membership is a **product/config** concern used for compare strips and ACL.
- **Compare strip order** = **array order** in config for that segment (intersected with manifest-present ids), preserving intentional PMO ordering rather than alphabetical id sort.
- **Single-market** focus remains one id from the manifest.

### 4.4 Non-goals (this epic)

- **Server-side persistence** of market lists (Postgres) — optional later.
- **Changing** `epic-market-acl` enforcement logic beyond **reading** segment definitions from the new source (ACL epic owns server PUT rules).
- **Per-market stack config** for auto-plan — lives under `epic-runway-autoplan` / YAML sidecars.

---

## 5. Implementation slices (suggested order)

### Story 1 — Canonical segment config + remove duplication

- Load segment definitions from **one file** (`segments.json` or merged manifest).
- Replace `SEGMENT_MARKET_IDS`, `RUNWAY_LIOM_SEGMENT_MARKET_IDS`, and `RUNWAY_IOM_SEGMENT_MARKET_IDS` with helpers that read the canonical structure (e.g. `getSegmentMarkets('LIOM')`).
- **Files:** `src/lib/capacityAccess.ts`, `src/lib/markets.ts`, `src/components/RunwayFocusSelect.tsx`, tests if any for ACL.

**Acceptance:** Adding a market id to **only** the canonical segment list updates picker + compare order + ACL union without editing three TS arrays.

### Story 2 — Manifest generator hardening

- Optionally extend `scripts/generate-market-manifest.mjs` to: validate basename = YAML `market:` (parse front matter or full doc); fail CI on mismatch; emit warnings for ids not in ISO-3166-1 alpha-2 when using 2-letter ids.
- Document `MANIFEST_EXCLUDE` behaviour (stubs like `NA`).

**Acceptance:** `npm run build` fails if a `.yaml` file’s `market:` ≠ filename stem (configurable escape hatch for legacy).

### Story 3 — Developer checklist doc (operational)

- Add **`docs/ADD_A_MARKET_CHECKLIST.md`** (or a section in `MARKET_DSL_AND_PIPELINE.md`): new `XX.yaml`, run `generate:markets`, update segments if needed, optional `?raw` bundle in `marketDslSeeds.ts`, smoke-test runway + LIOM/IOM strips.

**Acceptance:** A new contributor can add a country without reading the codebase.

### Story 4 — (Stretch) Richer manifest

- Add optional **labels** for header/dropdown (e.g. `DE` → “Germany”) from manifest or separate `market-meta.json`.

---

## 6. Testing and verification

- **Manual:** After changes, verify `RunwayFocusSelect` shows LIOM/IOM nested groups; compare-all columns match segment order; restricted Clerk session with `cap_segs` still aligns with segment membership.
- **Automated (where present):** Unit tests for `runwayCompareMarketIds`, `filterManifestOrderForAccess`, `parseCapacityAccess` with new segment source.

---

## 7. Critical file map

| Concern | Location |
| --- | --- |
| Manifest generation | `scripts/generate-market-manifest.mjs` |
| Runtime market order | `src/lib/runwayManifest.ts`, `src/lib/markets.ts` |
| Bootstrap load | `src/App.tsx` |
| Segment compare / labels | `src/lib/markets.ts`, `src/components/RunwayFocusSelect.tsx` |
| ACL segment → markets | `src/lib/capacityAccess.ts` |
| DSL parse / `market:` | `src/engine/yamlDslParser.ts` |
| Default YAML | `src/lib/marketDslSeeds.ts` |
| Canonical JSON (today) | `public/data/segments.json`, `public/data/markets/manifest.json` |

---

## 8. Open decisions (capture before coding)

1. **Single merged manifest vs `segments.json` + `manifest.json`** — pick A or B (§4.2).
2. **Strict ISO-3166-1** — enforce 2-letter ids for “countries” or allow longer internal codes (already 2–8 in `runwayManifest.ts`).
3. **Ordering:** Should global manifest order ever be **non-alphabetical**? If yes, manifest generator must accept an explicit ordered list file.

---

*Last updated: aligns with repo state at epic definition time; adjust file line references if refactors land first.*
