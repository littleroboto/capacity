# Cal-Heatmap integration for OWM

This document defines clean ways to interact with [cal-heatmap](https://github.com/wa0x6e/cal-heatmap) visualisations in the Operational Weather Model web tool. The cal-heatmap source and options were captured using **repomix** against the [cal-heatmap GitHub repo](https://github.com/wa0x6e/cal-heatmap); the packed output is in the repo as `cal-heatmap-repomix.md`. Official docs: [cal-heatmap.com](https://cal-heatmap.com/).

---

## 1. Source material

- **Repomix pack:** `cal-heatmap-repomix.md` (run `npx repomix@latest --remote wa0x6e/cal-heatmap --include "src/**/*.ts,src/**/*.js,README.md,package.json" --style markdown -o cal-heatmap-repomix.md` to refresh).
- **Docs:** [Installation](https://cal-heatmap.com/docs/getting-started/installation), [Options](https://cal-heatmap.com/docs/options).

---

## 2. Public API (clean interaction surface)

Use a single **CalHeatmap** instance per heatmap (one per market when showing a segment).

| Method | Purpose |
|--------|---------|
| `paint(options?, plugins?)` | Setup and first paint. Pass options (see below). Returns `Promise<unknown>`. Call once per container when creating the heatmap. |
| `fill(dataSource?)` | Fill cells with data. `dataSource` = same as `options.data.source` (array of records or URL). If omitted, uses the source from options. Call after `paint()` and whenever the data set changes (e.g. layer or filter change). Returns `Promise<unknown>`. |
| `next(n)` / `previous(n)` | Shift calendar by n domains (e.g. months). Use if you need animated date navigation. |
| `jumpTo(date, reset?)` | Jump to the domain containing `date`; `reset: true` makes that domain the first. |
| `destroy()` | Teardown. Call when removing the heatmap or switching view. |
| `on(name, fn)` | Subscribe to events (e.g. `'fill'` after cells are filled). |
| `dimensions()` | Returns `{ width, height }` of the SVG. |

**Lifecycle (OWM):**

1. Create container (e.g. `#heatmap-uk`).
2. `cal.paint({ ...options })` — sets domain/subDomain, date range, scale, theme, **data.x / data.y** (and optionally **data.source** if you pass data later).
3. `cal.fill(riskDataArray)` — pass the array of `{ date, value }` (or your key names) for the current layer/market. Cal-heatmap will filter by current domain min/max and fill cells.
4. On layer or filter change: update `options.data` if needed, then `cal.fill(newDataArray)` again (no need to repaint unless you change domain/range/scale).
5. On teardown or view switch: `cal.destroy()`.

---

## 3. Data shape (OWM → cal-heatmap)

The JS engine produces a per-day, per-market table (e.g. `date`, `market`, `risk_score`, `lab_utilisation`, …). For **one heatmap per market**:

- Build an array of **records** with a **timestamp** (or date string cal-heatmap can parse) and a **value** for the selected layer.
- Map to the shape cal-heatmap expects:

```ts
// Cal-heatmap data.options (from Options.ts)
data: {
  source: Array<Record<string, string | number>>,  // or URL
  type: 'json',
  x: string | ((datum) => number),   // key or fn: timestamp (ms or parseable)
  y: string | ((datum) => number),   // key or fn: value for cell
  groupY: 'sum' | 'count' | 'min' | 'max' | 'average' | ((values) => value),
  defaultValue: null | number | string,
}
```

**Recommended OWM mapping:**

- **Risk surface rows** → one record per day: `{ date: string (YYYY-MM-DD), value: number }`.
- Use **`data.x`** = `'date'` and **`data.y`** = `'value'` (or the key names you use). If cal-heatmap expects timestamps, convert `date` to Unix ms in a pre-step or use `x: (d) => new Date(d.date).getTime()`.
- Pass the array as **`data.source`** in options, or set `data.source` to the array and call **`fill()`** with no args; alternatively omit `data.source` at paint and call **`fill(riskDataArray)`** so the same instance can be refilled with different data (e.g. when switching layer).

**Data contract (implementation checklist):**

- One array per market per layer: `{ date: ISO date or timestamp, value: number }[]`.
- Filter by `date` within the current cal-heatmap domain (or let cal-heatmap filter if you pass full range and it supports it). The library uses `domainCollection.min` and `endDate` when fetching/filling.

---

## 4. Options that matter for OWM

Set these in the object passed to **`paint(options)`** (and optionally update + repaint when switching view):

| Option | Use in OWM |
|--------|------------|
| `itemSelector` | CSS selector or element for the container (e.g. `#heatmap-uk`). |
| `range` | Number of domains to show (e.g. 5 quarters ≈ 15 months → `range: 15` for month domains). |
| `domain.type` | `'month'` or `'year'` for calendar layout (month = one column per month). |
| `subDomain.type` | `'day'` (GitHub-style day cells). |
| `date.start` | Start date of the calendar (e.g. first day of first quarter). |
| `date.min` / `date.max` | Optional bounds. |
| `date.locale` | Locale for labels. |
| `data.source` | Your array of `{ date, value }` (or leave unset and pass to `fill()` each time). |
| `data.x` | `'date'` or function returning timestamp. |
| `data.y` | `'value'` or function returning value. |
| `data.groupY` | `'sum'` or `'average'` if multiple values per day. |
| `data.defaultValue` | `0` or `null` for empty cells. |
| `scale` | Color or opacity scale (e.g. `scale: { color: { scheme: 'YlGn', domain: [0, 1] } }` for risk 0–1). |
| `animationDuration` | ms (e.g. 200). Respect `prefers-reduced-motion` by setting to 0 when reduced. |
| `theme` | `'light'` or `'dark'`. |
| `verticalOrientation` | `true` to stack domains vertically (e.g. one row per month). |

---

## 5. One instance per market (segment view)

- For **segment** = group of countries: create one CalHeatmap instance per country, each with its own container (`#heatmap-uk`, `#heatmap-de`, …).
- For each instance: **paint** once with shared options (domain type, subDomain type, scale, theme) and market-specific `itemSelector` and optional `date.start`; then **fill(marketRiskArray)** with that market’s time-series for the selected layer.
- **View filtering** (layer, date range, which countries): when the user changes layer or range, for each visible market call **fill(newDataArray)** with the new data; no need to destroy/recreate unless you remove a country from the view (then destroy that instance and remove its container).

---

## 6. Events and accessibility

- **Events:** Use **`on('fill', fn)`** to run logic after the calendar is filled (e.g. trigger Motion animations on the block wrapper).
- **Reduced motion:** Set **`animationDuration: 0`** when `window.matchMedia('(prefers-reduced-motion: reduce)').matches` so cal-heatmap does not animate transitions.

---

## 7. Refreshing the repomix pack

To re-spider the cal-heatmap repo and regenerate the packed context:

```bash
npx repomix@latest --remote wa0x6e/cal-heatmap \
  --include "src/**/*.ts,src/**/*.js,README.md,package.json" \
  --style markdown \
  -o cal-heatmap-repomix.md
```

Use `cal-heatmap-repomix.md` as the single reference for options, types, and internal behaviour when implementing or debugging the integration.
