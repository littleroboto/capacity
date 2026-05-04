/**
 * Collapse consecutive ISO dates under public_holidays.dates / school_holidays.dates
 * into dates: (singletons) + ranges: (inclusive from/to). Preserves existing ranges:
 * (prepended to new ranges from dates). Only re-serializes each holiday block — the
 * rest of each market file is untouched (avoids full-document yaml.dump data loss).
 *
 * Usage: node scripts/collapse-market-holiday-ranges.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const marketsDir = path.join(root, 'public/data/markets');

const ISO = /^(\d{4}-\d{2}-\d{2})$/;

function dayPlusOne(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + 86400000;
  const x = new Date(t);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

function collapseIsoDates(isoList) {
  const uniq = [...new Set(isoList.filter((s) => ISO.test(s)))].sort();
  const singletons = [];
  const ranges = [];
  let i = 0;
  while (i < uniq.length) {
    let j = i;
    while (j + 1 < uniq.length && dayPlusOne(uniq[j]) === uniq[j + 1]) j++;
    const from = uniq[i];
    const to = uniq[j];
    if (i === j) singletons.push(from);
    else ranges.push({ label: `${from} – ${to}`, from, to });
    i = j + 1;
  }
  return { singletons, ranges };
}

function orderHolidayBlockKeys(b) {
  const skip = new Set(['auto', 'dates', 'ranges']);
  const out = {};
  if ('auto' in b) out.auto = b.auto;
  if (b.dates?.length) out.dates = b.dates;
  if (b.ranges?.length) out.ranges = b.ranges;
  for (const [k, v] of Object.entries(b)) {
    if (!skip.has(k)) out[k] = v;
  }
  return out;
}

function transformHolidayBlock(block) {
  if (!block || typeof block !== 'object') return;
  const rawDates = block.dates;
  if (!Array.isArray(rawDates) || rawDates.length === 0) return;
  const iso = [];
  for (const item of rawDates) {
    const s = String(item).trim();
    if (ISO.test(s)) iso.push(s);
  }
  const { singletons, ranges: fromDates } = collapseIsoDates(iso);
  const existingRanges = Array.isArray(block.ranges) ? [...block.ranges] : [];
  delete block.dates;
  if (singletons.length) block.dates = singletons;
  else delete block.dates;
  const mergedRanges = [...existingRanges, ...fromDates];
  if (mergedRanges.length) block.ranges = mergedRanges;
  else delete block.ranges;
}

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
  for (const key of ['public_holidays', 'school_holidays']) {
    const block = findTopLevelBlock(raw, key);
    if (!block) continue;
    const obj = yaml.load(block.blockStr);
    if (!obj || typeof obj !== 'object' || !obj[key]) continue;
    transformHolidayBlock(obj[key]);
    obj[key] = orderHolidayBlockKeys(obj[key]);
    const newBlock = yaml
      .dump(obj, { lineWidth: -1, noRefs: true, sortKeys: false })
      .replace(/\n$/, '');
    raw = raw.slice(0, block.start) + newBlock + raw.slice(block.end);
  }
  fs.writeFileSync(filePath, raw, 'utf8');
}

const files = fs
  .readdirSync(marketsDir)
  .filter((f) => f.endsWith('.yaml'))
  .sort();
for (const f of files) {
  processMarketFile(path.join(marketsDir, f));
  console.log('collapsed holidays →', f);
}
