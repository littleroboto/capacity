# Add a market (checklist)

Use this when onboarding a **new country/market** to the runway so segment lists, manifest, and YAML stay aligned. Deeper DSL field reference: [MARKET_DSL_AND_PIPELINE.md](./MARKET_DSL_AND_PIPELINE.md).

## 1. Market YAML file

1. Add `public/data/markets/<ID>.yaml` where `<ID>` is the stable market id (e.g. `DE`, `UK`).
2. Set top-level **`market: <ID>`** (preferred) or legacy **`country:`** to the **same** value as the filename stem (case-insensitive). Every YAML document in the file must use that same id.
3. Fill in `title`, `resources`, `bau`, holidays, etc. per the DSL doc.

## 2. Regenerate manifest

Run **`pnpm run generate:markets`** (or start dev / build — `prebuild` runs the generator).

- `public/data/markets/manifest.json` is overwritten from all `*.yaml` files (except names in `MANIFEST_EXCLUDE` inside `scripts/generate-market-manifest.mjs`, currently **`NA`** for optional stubs).
- The script **fails** if any file’s `market:` / `country:` does not match its basename, or if `public/data/segments.json` references a missing or non-manifest `.yaml`. Set **`SKIP_MARKET_YAML_STEM_CHECK=1`** only to bypass YAML stem checks (not recommended for CI).

## 3. Segments (LIOM / IOM)

If the market should appear under **LIOM** or **IOM** in the focus picker, compare strips, and Clerk `cap_segs` ACL:

1. Edit **`public/data/segments.json`** only — add the id to the right array (order = compare-strip column order).
2. Do **not** duplicate lists in TypeScript; the app reads this file via `src/lib/segmentsConfig.ts`.

## 4. Optional bundled default DSL

For offline or fetch-failure fallback, you can add a `?raw` import in `src/lib/marketDslSeeds.ts`. Other ids still get `minimalDsl(id)` until you add one.

## 5. Smoke test

1. Run the app, open the runway **Focus** control — confirm the new id appears (and under the right segment group if configured).
2. Select **LIOM (Segment)** / **IOM (Segment)** and confirm compare columns match `segments.json` order, intersected with the manifest.
3. If you use Clerk ACL, verify a session with `cap_segs` including the segment can see the new market.

## 6. Shared workspace API (Vercel)

Server ACL reads **`public/data/segments.json`** and **`public/data/markets/manifest.json`** at cold start. Deploy after manifest/segment changes so API and UI agree.
