/**
 * Keep only AGM-related rows in deployment_risk_events (kind agm_prep, agm).
 * Removes earnings (and any other non-AGM) events. Block-level yaml splice only.
 *
 * Usage: node scripts/strip-earnings-deployment-risk-events.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const marketsDir = path.join(root, 'public/data/markets');

const KEY = 'deployment_risk_events';
const KEEP_KINDS = new Set(['agm_prep', 'agm']);

/** Next top-level `key:` (column 0), not indented. */
function findTopLevelBlock(raw, key) {
  const re = new RegExp(`^${key}:`, 'm');
  const match = raw.match(re);
  if (!match || match.index === undefined) return null;
  const start = match.index;
  const fromStart = raw.slice(start);
  const lines = fromStart.split('\n');
  let endLineIdx = lines.length;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (!line.startsWith(' ') && !line.startsWith('\t') && /^[a-z_][a-z0-9_]*:/.test(line)) {
      endLineIdx = i;
      break;
    }
  }
  const blockStr = lines.slice(0, endLineIdx).join('\n');
  const end = start + blockStr.length;
  return { start, end, blockStr };
}

function processMarketFile(filePath) {
  let raw = fs.readFileSync(filePath, 'utf8');
  const block = findTopLevelBlock(raw, KEY);
  if (!block) {
    console.warn('skip (no block):', path.basename(filePath));
    return;
  }
  const obj = yaml.load(block.blockStr);
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj[KEY])) return;
  const next = obj[KEY].filter((e) => e && KEEP_KINDS.has(String(e.kind)));
  if (next.length === obj[KEY].length) {
    console.log('unchanged →', path.basename(filePath));
    return;
  }
  obj[KEY] = next;
  const newBlock = yaml
    .dump(obj, { lineWidth: -1, noRefs: true, sortKeys: false })
    .replace(/\n$/, '');
  raw = raw.slice(0, block.start) + newBlock + raw.slice(block.end);
  fs.writeFileSync(filePath, raw, 'utf8');
  console.log('stripped earnings →', path.basename(filePath));
}

const files = fs
  .readdirSync(marketsDir)
  .filter((f) => f.endsWith('.yaml'))
  .sort();
for (const f of files) {
  processMarketFile(path.join(marketsDir, f));
}
