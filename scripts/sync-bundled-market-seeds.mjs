/**
 * Copies market YAML + segments registry from `public/data/` into `src/data/` so Vite can
 * bundle them via `?raw` / JSON imports. Vite does not allow importing from `public/`.
 *
 * Run from: prebuild, dev, postinstall (see package.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pubMarkets = path.join(root, 'public/data/markets');
const srcMarkets = path.join(root, 'src/data/markets');
const pubSegments = path.join(root, 'public/data/segments.json');
const srcSegments = path.join(root, 'src/data/segments.json');

const SEED_IDS = ['AU', 'CA', 'DE', 'ES', 'FR', 'IT', 'PL', 'UK'];

if (!fs.existsSync(pubSegments)) {
  console.error('sync-bundled-market-seeds: missing', pubSegments);
  process.exit(1);
}
if (!fs.existsSync(pubMarkets)) {
  console.error('sync-bundled-market-seeds: missing', pubMarkets);
  process.exit(1);
}

fs.mkdirSync(srcMarkets, { recursive: true });
fs.copyFileSync(pubSegments, srcSegments);

for (const id of SEED_IDS) {
  const from = path.join(pubMarkets, `${id}.yaml`);
  if (!fs.existsSync(from)) {
    console.error(`sync-bundled-market-seeds: missing ${from}`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(srcMarkets, `${id}.yaml`));
}

console.log('sync-bundled-market-seeds: ok → src/data/');
