/**
 * Single Vercel serverless entry for all `/api/*` handlers (Hobby plan function limit).
 * `vercel.json` rewrites each public `/api/...` path here and sets `__cap` from the matched segment;
 * `__cap` is stripped before the real handler runs.
 */
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

/** @type {Record<string, string>} */
const RUNTIME_BY_ROUTE = {
  health: './_health.runtime.cjs',
  me: './_me.runtime.cjs',
  fragments: './_fragments.runtime.cjs',
  builds: './_builds.runtime.cjs',
  config: './_config.runtime.cjs',
  validate: './_validate.runtime.cjs',
  revisions: './_revisions.runtime.cjs',
  audit: './_audit.runtime.cjs',
  markets: './_markets.runtime.cjs',
  import: './_import.runtime.cjs',
  'holiday-entries': './_holidayEntries.runtime.cjs',
  'shared-dsl': './_shared-dsl.runtime.cjs',
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
