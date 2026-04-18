# URL-backed view state (permalink) with merge semantics

**Status:** Design agreed in conversation (2026-04-18).  
**Scope:** Segment Workbench SPA (`/app`): which fields are represented in the query string, how they combine with `useAtcStore` + `persist`, and how shared links behave.

## Purpose

Make **analysis views shareable** via stable, copy-pasteable URLs while keeping **local persistence** for comfort and for fields that do not belong in the bar. Opening a link should **not wipe** the recipient’s saved preferences for dimensions the link omits.

## Definitions

- **URL-backed field:** A piece of UI state that may be read from the query string on load and written back when the user changes it. Only an allow-listed set participates; everything else is out of scope for the URL.
- **Persist-only field:** Still in Zustand `persist` (e.g. theme, panel layout, heatmap styling). The URL never sets these unless we explicitly add them later.
- **Session-only field:** Not persisted today (e.g. some ledger exclusions). Default stays **out of the URL** unless product later decides otherwise (URLs would get long and market-specific).

## Merge rule (authoritative)

On **initial navigation** (cold load or full URL change):

1. **Hydrate** the store from `persist` as today (same merge/version rules as `mergePersistedViewSettings`).
2. **Apply the URL layer:** for each URL-backed key **present** in the query string, parse and assign the corresponding store value. Keys **absent** from the query string are left exactly as after step 1.

After bootstrap, **store and URL stay aligned** for URL-backed fields: user actions that change those fields update the query string (see Writes). There is no ongoing “URL overrides store” except when the user navigates to a **different** URL (browser navigation, pasted link, etc.), in which case the same two-step bootstrap runs again.

**Precedence summary:** For URL-backed keys, **URL wins on load** only where it speaks; **persist fills the rest**. For non-URL-backed keys, **persist only** (until explicitly extended).

## Writes to the URL

- Prefer **`replace: true`** for changes that mirror current view state (avoid cluttering history with every filter tweak). Use `push` only when the product wants a discrete history step (optional; default off).
- Parsing must be **tolerant**: unknown keys ignored; invalid values ignored or clamped without breaking hydration.
- **Size:** Do not put large blobs (full DSL, long id lists) in the query string. Use short ids, enums, dates (`YYYY-MM-DD`), or a future dedicated “share snapshot” API if needed.

## Initial URL-backed candidates (implementation checklist)

Exact query names are TBD; this list is the **intent** aligned with `useAtcStore` today:

| Intent | Store / notes |
|--------|----------------|
| Market / runway focus | `country` (existing admin deep-link uses `market` / `country` once) |
| Workbench view mode | `viewMode` |
| Runway date filters | `runwayFilterYear`, `runwayFilterQuarter`, `runwayIncludeFollowingQuarter` |
| Selected calendar day | `runwaySelectedDayYmd` |
| LLM assistant dock | `llm` flag (already read in `MainDslWorkspace`) |

**Theme,** heatmap render options, disco/3D toggles, and similar **chrome** remain persist-only unless product explicitly promotes them to URL-backed later.

## Migration from current behavior

Today, `App` reads `market` / `country` from the query, applies them, then **removes** those keys from the URL. Under this design, **removal is no longer required** for URL-backed keys: keeping them makes the link **round-trip** (refresh and share reproduce the same view). One-shot admin links can still use the same params; they simply remain visible unless the UX explicitly chooses a “clean bar” mode later.

## Non-goals (this spec)

- Encoding merged multi-doc YAML or share tokens in the query string.
- Defining a compressed `s=` blob or server-side share ids (compatible add-on later).
- Changing pipeline or risk math; this is **navigation + view state** only.

## Edge cases

- **“Reset to my defaults”:** Clearing URL-backed keys without changing persist restores persist for those keys on next load; product may add an explicit control that clears query params and optionally resets persist—out of scope until requested.
- **Invalid day for current market:** Clamp or clear `runwaySelectedDayYmd` with a consistent rule (implementation detail; must not crash).

## Testing notes

- Open app with persist set A, append a minimal query (e.g. only `country`): expect country from URL, everything else from A.
- Open full URL, change a persist-only field (e.g. theme), reload: theme survives; URL-backed fields survive from URL.
- Back/forward: if using `replace` for mirroring, history may be shallow; document actual choice in implementation.
