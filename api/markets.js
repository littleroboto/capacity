import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const nodeRequire = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(__dirname, '_markets.runtime.cjs');
if (!fs.existsSync(runtime)) {
  throw new Error(
    'Missing api/_markets.runtime.cjs — run `node scripts/bundle-api.mjs` from the repo root (or `pnpm dev:vercel`, which runs it first).'
  );
}
const mod = nodeRequire('./_markets.runtime.cjs');
export default mod.default ?? mod;
