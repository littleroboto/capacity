/**
 * Multi-entry API bundler. Replaces the single-entry bundle-shared-dsl.mjs.
 * Produces one .runtime.cjs file per API implementation in api/.
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'api');

const entries = [
  { impl: 'api/_sharedDslImpl.ts', out: 'api/_shared-dsl.runtime.cjs' },
  { impl: 'api/_healthImpl.ts',    out: 'api/_health.runtime.cjs' },
  { impl: 'api/_meImpl.ts',        out: 'api/_me.runtime.cjs' },
  { impl: 'api/_fragmentsImpl.ts', out: 'api/_fragments.runtime.cjs' },
  { impl: 'api/_buildsImpl.ts',    out: 'api/_builds.runtime.cjs' },
  { impl: 'api/_configImpl.ts',    out: 'api/_config.runtime.cjs' },
  { impl: 'api/_validateImpl.ts',  out: 'api/_validate.runtime.cjs' },
  { impl: 'api/_revisionsImpl.ts', out: 'api/_revisions.runtime.cjs' },
  { impl: 'api/_auditImpl.ts',     out: 'api/_audit.runtime.cjs' },
  { impl: 'api/_marketsImpl.ts',   out: 'api/_markets.runtime.cjs' },
  { impl: 'api/_importImpl.ts',   out: 'api/_import.runtime.cjs' },
  { impl: 'api/_holidayEntriesImpl.ts', out: 'api/_holidayEntries.runtime.cjs' },
];

const existing = entries.filter(e => fs.existsSync(path.join(root, e.impl)));

if (existing.length === 0) {
  console.log('bundle-api: no impl files found, skipping');
  process.exit(0);
}

const results = await Promise.all(
  existing.map(async ({ impl, out }) => {
    const entry = path.join(root, impl);
    const outfile = path.join(root, out);
    try {
      await esbuild.build({
        absWorkingDir: root,
        entryPoints: [entry],
        bundle: true,
        platform: 'node',
        target: 'node20',
        format: 'cjs',
        outfile,
        sourcemap: false,
        logLevel: 'warning',
      });
      return { impl, out, ok: true };
    } catch (err) {
      console.error(`bundle-api: FAILED ${impl}:`, err.message);
      return { impl, out, ok: false, err: err.message };
    }
  })
);

for (const r of results) {
  const rel = path.relative(root, path.join(root, r.out));
  console.log(`bundle-api: ${r.ok ? '✓' : '✗'} ${rel}`);
}

const failed = results.filter(r => !r.ok);
if (failed.length > 0) {
  console.error(`bundle-api: ${failed.length} bundle(s) failed`);
  process.exit(1);
}

// Empty api/<route>/ directories (e.g. from older layouts) can confuse Vercel's api scanner so
// `functions["api/shared-dsl.js"]` no longer matches; remove only if the directory is empty.
const orphanRouteDirs = [
  'shared-dsl',
  'me',
  'fragments',
  'builds',
  'config',
  'validate',
  'revisions',
  'audit',
  'markets',
  'import',
];
for (const name of orphanRouteDirs) {
  const dir = path.join(apiDir, name);
  if (!fs.existsSync(dir)) continue;
  const st = fs.statSync(dir);
  if (!st.isDirectory()) continue;
  const kids = fs.readdirSync(dir);
  if (kids.length > 0) {
    console.warn(
      `bundle-api: api/${name}/ is non-empty; not removing (may conflict with api/${name}.js for Vercel)`
    );
    continue;
  }
  fs.rmdirSync(dir);
  console.log(`bundle-api: removed empty api/${name}/ directory`);
}
