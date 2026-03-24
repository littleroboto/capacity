#!/usr/bin/env node
/**
 * Writes `public/data/markets/manifest.json` from `*.yaml` in that folder (excluding nothing but yaml).
 * Run after adding a new market file: `node scripts/generate-market-manifest.mjs`
 * (also runs on `npm run dev` / `npm run build` via package.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../public/data/markets');

const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') && !f.startsWith('.'))
  : [];
/** Stub markets kept on disk for calendars/engine but omitted from the runway compare grid. */
const MANIFEST_EXCLUDE = new Set(['NA']);
const markets = [...new Set(files.map((f) => path.basename(f, '.yaml')))]
  .filter((id) => !MANIFEST_EXCLUDE.has(id))
  .sort();

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify({ markets }, null, 2)}\n`, 'utf8');
console.log(`manifest: ${markets.length} market(s) -> ${markets.join(', ')}`);
