import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const mod = nodeRequire('./_builds.runtime.cjs');
export default mod.default ?? mod;
