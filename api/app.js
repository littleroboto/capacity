/**
 * Single Vercel serverless entry for all `/api/*` handlers (Hobby plan function limit).
 * Prebuilt handlers live in server-bundles/*.cjs — kept outside api/ so Vercel does not
 * count each bundle as its own function.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const nodeRequire = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.join(__dirname, '..', 'server-bundles');

/** @type {Record<string, string>} */
const RUNTIME_BY_ROUTE = {
  health: path.join(bundleDir, '_health.runtime.cjs'),
  me: path.join(bundleDir, '_me.runtime.cjs'),
  fragments: path.join(bundleDir, '_fragments.runtime.cjs'),
  builds: path.join(bundleDir, '_builds.runtime.cjs'),
  config: path.join(bundleDir, '_config.runtime.cjs'),
  validate: path.join(bundleDir, '_validate.runtime.cjs'),
  revisions: path.join(bundleDir, '_revisions.runtime.cjs'),
  audit: path.join(bundleDir, '_audit.runtime.cjs'),
  markets: path.join(bundleDir, '_markets.runtime.cjs'),
  import: path.join(bundleDir, '_import.runtime.cjs'),
  'holiday-entries': path.join(bundleDir, '_holidayEntries.runtime.cjs'),
  'shared-dsl': path.join(bundleDir, '_shared-dsl.runtime.cjs'),
};

export default async function handler(req, res) {
  const raw = req.query?.__cap;
  const routeKey = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  if (routeKey && req.query && typeof req.query === 'object') {
    delete req.query.__cap;
  }

  const runtime = RUNTIME_BY_ROUTE[routeKey];
  if (!runtime) {
    res.status(404).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'not_found', detail: 'Unknown API route' }));
    return;
  }

  const mod = nodeRequire(runtime);
  const fn = mod.default ?? mod;
  return fn(req, res);
}
