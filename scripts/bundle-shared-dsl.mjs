/**
 * Produces a single CommonJS file under server-bundles/ (see scripts/bundle-api.mjs).
 * Avoids @vercel/node's multi-file ESM output (root package.json "type":"module"
 * was yielding ERR_MODULE_NOT_FOUND for split chunks in production).
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'api/_sharedDslImpl.ts');
const outfile = path.join(root, 'server-bundles/_shared-dsl.runtime.cjs');
fs.mkdirSync(path.dirname(outfile), { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile,
  sourcemap: false,
  logLevel: 'info',
  // Inline app + @vercel/blob + @clerk/backend; Node builtins stay external by default
});

console.log('bundle-shared-dsl: wrote', path.relative(root, outfile));
