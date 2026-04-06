#!/usr/bin/env node
/**
 * Writes `public/data/markets/manifest.json` from `*.yaml` in that folder.
 * Validates each file's `market:` / `country:` (all YAML documents) against the filename stem,
 * and checks `public/data/segments.json` references only existing `*.yaml` files.
 *
 * Run after adding a new market: `node scripts/generate-market-manifest.mjs`
 * (also runs on `npm run dev` / `npm run build` via package.json).
 *
 * Escape hatch: `SKIP_MARKET_YAML_STEM_CHECK=1` skips YAML stem validation only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const marketsDir = path.join(repoRoot, 'public/data/markets');
const segmentsPath = path.join(repoRoot, 'public/data/segments.json');

const files = fs.existsSync(marketsDir)
  ? fs.readdirSync(marketsDir).filter((f) => f.endsWith('.yaml') && !f.startsWith('.'))
  : [];

/** Stub markets kept on disk for calendars/engine but omitted from the runway compare grid. */
const MANIFEST_EXCLUDE = new Set(['NA']);

const stemSet = new Set(files.map((f) => path.basename(f, '.yaml').toUpperCase()));

function yamlStemError(filePath, stem, message) {
  return new Error(`[generate-market-manifest] ${path.relative(repoRoot, filePath)} (${stem}.yaml): ${message}`);
}

function extractMarketIdFromDoc(doc) {
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) return undefined;
  const o = doc;
  const m = o.market ?? o.country;
  if (m == null || m === '') return undefined;
  return String(m).trim().toUpperCase();
}

function validateYamlStem(filePath, stemUpper, content) {
  let docs;
  try {
    docs = yaml.loadAll(content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw yamlStemError(filePath, stemUpper, `YAML parse error: ${msg}`);
  }
  const declared = [];
  for (const doc of docs) {
    const id = extractMarketIdFromDoc(doc);
    if (id) declared.push(id);
  }
  if (declared.length === 0) {
    throw yamlStemError(
      filePath,
      stemUpper,
      'no market: or country: found in any document (required to match filename stem)'
    );
  }
  const mismatch = declared.find((id) => id !== stemUpper);
  if (mismatch) {
    throw yamlStemError(
      filePath,
      stemUpper,
      `document declares market/country "${mismatch}" but filename stem is "${stemUpper}"`
    );
  }
}

if (!process.env.SKIP_MARKET_YAML_STEM_CHECK) {
  for (const f of files) {
    const stem = path.basename(f, '.yaml');
    const stemUpper = stem.toUpperCase();
    const filePath = path.join(marketsDir, f);
    const content = fs.readFileSync(filePath, 'utf8');
    validateYamlStem(filePath, stemUpper, content);
  }
} else {
  console.warn('manifest: SKIP_MARKET_YAML_STEM_CHECK is set — skipping YAML stem validation');
}

const markets = [...new Set(files.map((f) => path.basename(f, '.yaml')))]
  .filter((id) => !MANIFEST_EXCLUDE.has(id))
  .sort();

const manifestSet = new Set(markets.map((id) => id.toUpperCase()));

if (fs.existsSync(segmentsPath)) {
  let segments;
  try {
    segments = JSON.parse(fs.readFileSync(segmentsPath, 'utf8'));
  } catch (e) {
    console.error('manifest: failed to read public/data/segments.json', e);
    process.exit(1);
  }
  if (segments && typeof segments === 'object' && !Array.isArray(segments)) {
    for (const [segName, ids] of Object.entries(segments)) {
      if (!Array.isArray(ids)) continue;
      for (const rawId of ids) {
        const id = String(rawId).trim().toUpperCase();
        if (!id) continue;
        if (!stemSet.has(id)) {
          console.error(
            `manifest: segments.json segment "${segName}" lists "${rawId}" but there is no ${id}.yaml under public/data/markets/`
          );
          process.exit(1);
        }
        if (!manifestSet.has(id) && !MANIFEST_EXCLUDE.has(id)) {
          console.error(
            `manifest: segments.json segment "${segName}" lists "${rawId}" which is not in manifest (excluded stub?)`
          );
          process.exit(1);
        }
      }
    }
  }
}

fs.mkdirSync(marketsDir, { recursive: true });
fs.writeFileSync(path.join(marketsDir, 'manifest.json'), `${JSON.stringify({ markets }, null, 2)}\n`, 'utf8');
console.log(`manifest: ${markets.length} market(s) -> ${markets.join(', ')}`);
console.log(
  'manifest: MANIFEST_EXCLUDE (omitted from manifest & segments must not rely on stubs):',
  [...MANIFEST_EXCLUDE].join(', ') || '(none)'
);
