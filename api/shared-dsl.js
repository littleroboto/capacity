'use strict';

/**
 * Vercel serverless entry for GET|HEAD|PUT `/api/shared-dsl`.
 * Runtime is pre-bundled in `_shared-dsl.runtime.cjs` (see scripts/bundle-shared-dsl.mjs).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require('./_shared-dsl.runtime.cjs');
const fn = mod.default ?? mod;
module.exports = fn;
