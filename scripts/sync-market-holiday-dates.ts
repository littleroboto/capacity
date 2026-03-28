/**
 * Embeds stub public + school holiday ISO dates into each `public/data/markets/*.yaml`.
 * Sets `auto: false` so the pipeline uses only explicit `dates:` (no double-merge with `holidayStubCalendar`).
 *
 * Run after editing `holidayStubCalendar.ts` or `holidayPublicCatalog.ts`:
 *   pnpm run sync:market-holidays
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  listStubPublicHolidayDates,
  listStubSchoolHolidayDates,
} from '../src/engine/holidayStubCalendar';
import { getStubPublicHolidayName } from '../src/engine/holidayPublicCatalog';

const MARKETS_DIR = path.join(process.cwd(), 'public/data/markets');

type YamlDoc = {
  market?: string;
  public_holidays?: Record<string, unknown>;
  school_holidays?: Record<string, unknown>;
};

function yamlScalar(n: unknown): string {
  if (n == null) return 'null';
  if (typeof n === 'number' && Number.isFinite(n)) return String(n);
  if (typeof n === 'boolean') return n ? 'true' : 'false';
  return String(n);
}

function addOneCalendarDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Inclusive day count for ISO calendar dates (local calendar arithmetic). */
function inclusiveDayCount(start: string, end: string): number {
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  const a = new Date(ys, ms - 1, ds).getTime();
  const b = new Date(ye, me - 1, de).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

/** Group sorted ISO dates into maximal consecutive calendar-day runs. */
function consecutiveGroups(sorted: string[]): { start: string; end: string }[] {
  if (sorted.length === 0) return [];
  const groups: { start: string; end: string }[] = [];
  let runStart = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const nextFromPrev = addOneCalendarDay(prev);
    if (nextFromPrev === cur) {
      prev = cur;
    } else {
      groups.push({ start: runStart, end: prev });
      runStart = cur;
      prev = cur;
    }
  }
  groups.push({ start: runStart, end: prev });
  return groups;
}

/** Public/bank holidays: one line per date with catalog label as trailing comment. */
function formatPublicDateList(dates: string[], market: string): string {
  const sorted = [...dates].sort();
  return sorted
    .map((d) => {
      const label = getStubPublicHolidayName(market, d);
      const suffix = label ? `  # ${label}` : '';
      return `    - '${d}'${suffix}`;
    })
    .join('\n');
}

/**
 * School closures: long flattened lists — add a range comment before each contiguous run
 * so folded blocks stay readable in the editor.
 */
function formatSchoolDateList(dates: string[]): string {
  const sorted = [...dates].sort();
  const groups = consecutiveGroups(sorted);
  const lines: string[] = [];
  for (const g of groups) {
    const n = inclusiveDayCount(g.start, g.end);
    lines.push(`    # ${g.start} – ${g.end} (${n} consecutive days)`);
    let d = g.start;
    while (true) {
      lines.push(`    - '${d}'`);
      if (d === g.end) break;
      d = addOneCalendarDay(d);
    }
  }
  return lines.join('\n');
}

function formatLoadEffects(le: Record<string, unknown>): string {
  const keys = Object.keys(le).sort();
  const lines = keys.map((k) => `    ${k}: ${yamlScalar(le[k])}`);
  return [`  load_effects:`, ...lines].join('\n');
}

function buildHolidayBlocks(doc: YamlDoc): string {
  const market = String(doc.market ?? '');
  const pubDates = listStubPublicHolidayDates(market);
  const schDates = listStubSchoolHolidayDates(market);
  const pub = doc.public_holidays ?? {};
  const sch = doc.school_holidays ?? {};

  const pubStaff = pub.staffing_multiplier ?? pub.staffingMultiplier ?? 0.5;
  const pubTrad = pub.trading_multiplier ?? pub.tradingMultiplier ?? 1.05;
  const schStaff = sch.staffing_multiplier ?? sch.staffingMultiplier ?? 0.88;
  const schTrad = sch.trading_multiplier ?? sch.tradingMultiplier;
  const loadEffects = sch.load_effects ?? sch.loadEffects;

  const pubLines = [
    `public_holidays:`,
    `  auto: false`,
    `  # Stub bank/public holidays — source: src/engine/holidayPublicCatalog.ts (pnpm run sync:market-holidays).`,
    `  # Each list entry is one closed day; trailing comments are English display names (not legal calendars).`,
    `  # staffing_multiplier / trading_multiplier apply on every listed date.`,
    `  dates:`,
    formatPublicDateList(pubDates, market),
    `  staffing_multiplier: ${yamlScalar(pubStaff)}`,
    `  trading_multiplier: ${yamlScalar(pubTrad)}`,
  ];

  const schLines = [
    `school_holidays:`,
    `  auto: false`,
    `  # Stub school closure days — source: src/engine/holidayStubCalendar.ts (pnpm run sync:market-holidays).`,
    `  # Each list entry is one non-school day (planning fiction). Range lines group contiguous runs.`,
    `  # staffing_multiplier (and optional trading_multiplier / load_effects) apply on every listed date.`,
    `  dates:`,
    formatSchoolDateList(schDates),
    `  staffing_multiplier: ${yamlScalar(schStaff)}`,
  ];
  if (schTrad != null && schTrad !== '') {
    schLines.push(`  trading_multiplier: ${yamlScalar(schTrad)}`);
  }
  if (loadEffects && typeof loadEffects === 'object' && !Array.isArray(loadEffects)) {
    schLines.push(formatLoadEffects(loadEffects as Record<string, unknown>));
  }

  return [...pubLines, '', ...schLines].join('\n');
}

function patchMarketFile(filePath: string): void {
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = yaml.load(raw) as YamlDoc;
  if (!doc?.market) {
    console.warn(`skip (no market): ${filePath}`);
    return;
  }
  const start = raw.indexOf('\npublic_holidays:\n');
  const end = raw.indexOf('\nholidays:\n', start);
  if (start === -1 || end === -1) {
    throw new Error(`Expected \\npublic_holidays:\\n then \\nholidays:\\n in ${filePath}`);
  }
  const newBlocks = buildHolidayBlocks(doc);
  const out = raw.slice(0, start + 1) + newBlocks + raw.slice(end);
  fs.writeFileSync(filePath, out, 'utf8');
  console.log(`updated ${path.basename(filePath)} (${doc.market})`);
}

function main(): void {
  const files = fs.readdirSync(MARKETS_DIR).filter((f) => f.endsWith('.yaml'));
  for (const f of files.sort()) {
    patchMarketFile(path.join(MARKETS_DIR, f));
  }
}

main();
