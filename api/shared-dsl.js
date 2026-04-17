/**
 * Vercel serverless entry for GET|HEAD|PUT `/api/shared-dsl`.
 * Runtime is pre-bundled in `_shared-dsl.runtime.cjs` (see scripts/bundle-api.mjs).
 */
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const mod = nodeRequire('./_shared-dsl.runtime.cjs');
const fn = mod.default ?? mod;
export default fn;
