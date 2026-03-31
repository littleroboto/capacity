# Market Capacity Surface

**A communication tool for visualising how capacity is consumed** — not a replacement for your planning systems, but a shared picture everyone can read: where pressure is building, what kind of work is driving it, and how **business rhythm** connects to **maintenance and transformation** (technology delivery).

---

## Live app

**[Open the deployed site →](https://littleroboto.github.io/capacity/)**

The GitHub Pages build tracks `main` (see `[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)`). After the first successful deploy, enable **Settings → Pages → Branch `gh-pages` / root** if you have not already.

---

## What you’re looking at

The interface is a **dynamic visual of system pressure**. Colour and summaries encode load and risk in a single glance:

- **Restaurant Activity** — restaurant trading curve (**`store_pressure`**) as the heatmap; combined risk still blends tech and campaigns.
- **Technology Teams** — labs, Market IT, and backend work versus capacity (**tech capacity demand**), including overload when demand exceeds caps.

The same **YAML-driven model** powers every market. Parameters are named and scaled **consistently** so you can **compare regions and countries** side by side without reconciling different spreadsheets or definitions.

---

## Why YAML?

The visual is **fully driven** by a detailed **YAML schema**: resources, BAU, campaigns, holiday behaviour, store trading patterns, and technology cadence. That means:

- **One language** for “what we believe is true” about a market.
- **Repeatable** scenarios — change the file, refresh the story.
- **Comparable** markets — same fields, same semantics, different numbers and dates.

Authoring help: **[docs/CAPACITY-RUNWAY.md](docs/CAPACITY-RUNWAY.md)** (pipeline and field reference), **[docs/MARKET_DSL_AND_PIPELINE.md](docs/MARKET_DSL_AND_PIPELINE.md)** (DSL and data flow).

---

## Run locally

```bash
npm install
npm run dev
```

Or with pnpm:

```bash
pnpm install
pnpm dev
```

The dev server runs Vite (see `package.json`). Market definitions load from `**public/data/markets/*.yaml**`.

### Build

```bash
npm run build
```

Output: `**dist/**`. For GitHub Pages, the workflow sets `GITHUB_PAGES=true` during build.

---

## Repository map


| Area                   | Role                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `public/data/markets/` | Per-country YAML — the source of truth for the demo markets |
| `src/`                 | React UI, pipeline wiring, heatmap and summary components   |
| `docs/`                | Deeper technical and handoff documentation                  |


