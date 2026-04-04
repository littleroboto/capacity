/**
 * Locate YAML for routine Market IT weekly rhythm: preferred under
 * `bau.market_it_weekly_load` (and aliases), legacy top-level `tech:`.
 * Keeps in-app DSL patches aligned with bundled market files.
 */

import { TECH_WEEKLY_DAY_KEYS, type TechWeeklyDayKey } from '@/lib/techRhythmDsl';
import { TRADING_MONTH_KEYS, type TradingMonthKey } from '@/lib/tradingMonthlyDsl';
import { CAPACITY_SHAPE_MONTH_KEYS, type CapacityShapeMonthKey } from '@/lib/capacityShapeMonthlyDsl';

/** Top-level YAML key at column 0. */
export const TOP_LEVEL_KEY = /^[a-z][a-z0-9_]*:\s*/;

/** Direct child of `bau:` or `tech:` (exactly two spaces + key). */
export const SECTION_CHILD_KEY = /^  [a-z][a-z0-9_]*:\s*/;

/** Grandchild under `bau.market_it_*` (four spaces + key). */
export const MIL_GRANDCHILD_KEY = /^    [a-z][a-z0-9_]*:\s*/;

/** Merge order matches {@link BAU_MARKET_IT_RHYTHM_KEYS} in yamlDslParser (later wins). */
export const BAU_MARKET_IT_BLOCK_KEYS = [
  'restaurant_it_rhythm',
  'bau_technology_support',
  'market_it_support',
  'market_it_weekly_load',
] as const;

export type BauMarketItBlockKey = (typeof BAU_MARKET_IT_BLOCK_KEYS)[number];

export function findBauBlockRange(lines: string[]): { bauIdx: number; bauEnd: number } | null {
  const bauIdx = lines.findIndex((l) => /^bau:\s*$/.test(l));
  if (bauIdx < 0) return null;
  let bauEnd = lines.length;
  for (let k = bauIdx + 1; k < lines.length; k++) {
    if (TOP_LEVEL_KEY.test(lines[k]!)) {
      bauEnd = k;
      break;
    }
  }
  return { bauIdx, bauEnd };
}

export function findTechBlockRange(lines: string[]): { techIdx: number; techEnd: number } | null {
  const techIdx = lines.findIndex((l) => /^tech:\s*$/.test(l));
  if (techIdx < 0) return null;
  let techEnd = lines.length;
  for (let k = techIdx + 1; k < lines.length; k++) {
    if (TOP_LEVEL_KEY.test(lines[k]!)) {
      techEnd = k;
      break;
    }
  }
  return { techIdx, techEnd };
}

/** First matching `bau` child block among aliases (document order); `milEnd` stops before next 2-space bau key. */
export function findBauMarketItBlockRange(
  lines: string[],
  bauIdx: number,
  bauEnd: number
): { key: BauMarketItBlockKey; milIdx: number; milEnd: number } | null {
  const alt = BAU_MARKET_IT_BLOCK_KEYS.join('|');
  const lineRe = new RegExp(`^  (${alt}):\\s*$`);
  for (let k = bauIdx + 1; k < bauEnd; k++) {
    const m = lines[k]!.match(lineRe);
    if (!m) continue;
    const key = m[1] as BauMarketItBlockKey;
    let milEnd = k + 1;
    while (milEnd < bauEnd) {
      const l = lines[milEnd]!;
      if (/^  [A-Za-z_]/.test(l)) break;
      milEnd++;
    }
    return { key, milIdx: k, milEnd };
  }
  return null;
}

export type TechRhythmYamlTarget =
  | { kind: 'bau_mil'; bauIdx: number; bauEnd: number; milIdx: number; milEnd: number }
  | { kind: 'tech_top'; techIdx: number; techEnd: number };

/** Prefer nested `bau.market_it_*` when present; else top-level `tech:`. */
export function resolveTechRhythmYamlTarget(lines: string[]): TechRhythmYamlTarget | null {
  const bau = findBauBlockRange(lines);
  const tech = findTechBlockRange(lines);
  if (bau) {
    const mil = findBauMarketItBlockRange(lines, bau.bauIdx, bau.bauEnd);
    if (mil) {
      return {
        kind: 'bau_mil',
        bauIdx: bau.bauIdx,
        bauEnd: bau.bauEnd,
        milIdx: mil.milIdx,
        milEnd: mil.milEnd,
      };
    }
    return {
      kind: 'bau_mil',
      bauIdx: bau.bauIdx,
      bauEnd: bau.bauEnd,
      milIdx: bau.bauEnd,
      milEnd: bau.bauEnd,
    };
  }
  if (tech) return { kind: 'tech_top', ...tech };
  return null;
}

/** Canonical YAML keys; legacy aliases are still parsed (see yamlDslParser `mapTechRhythm`). */
const YK = {
  weekdayIntensity: 'weekday_intensity',
  extraSupportWeekdays: 'extra_support_weekdays',
  extraSupportMonths: 'extra_support_months',
  monthlyRunwayAvailability: 'monthly_runway_availability',
} as const;

function formatWeekdayIntensityLines(
  dayLines: (d: TechWeeklyDayKey) => string,
  indent: 'tech' | 'bau_mil'
): string[] {
  if (indent === 'tech') {
    return [`  ${YK.weekdayIntensity}:`, ...TECH_WEEKLY_DAY_KEYS.map((d) => `    ${d}: ${dayLines(d)}`)];
  }
  return [`    ${YK.weekdayIntensity}:`, ...TECH_WEEKLY_DAY_KEYS.map((d) => `      ${d}: ${dayLines(d)}`)];
}

export function buildTechWeeklyPatternBlockLines(
  dayLines: (d: TechWeeklyDayKey) => string,
  target: TechRhythmYamlTarget
): string[] {
  if (target.kind === 'tech_top') {
    return formatWeekdayIntensityLines(dayLines, 'tech');
  }
  const isNewBlock = target.milIdx === target.bauEnd;
  const inner = formatWeekdayIntensityLines(dayLines, 'bau_mil');
  if (isNewBlock) {
    return ['  market_it_weekly_load:', ...inner];
  }
  return inner;
}

export function findWeeklyPatternRangeForTarget(
  lines: string[],
  target: TechRhythmYamlTarget
): { wpIdx: number; wpEnd: number } | null {
  if (target.kind === 'tech_top') {
    return findWeeklyPatternInTechTop(lines, target.techIdx, target.techEnd);
  }
  return findWeeklyPatternInBauMil(lines, target.milIdx, target.milEnd);
}

function findWeeklyPatternInTechTop(
  lines: string[],
  techIdx: number,
  techEnd: number
): { wpIdx: number; wpEnd: number } | null {
  for (let k = techIdx + 1; k < techEnd; k++) {
    const l = lines[k]!;
    if (/^  (weekday_intensity|weekly_pattern):\s*\S/.test(l)) {
      return { wpIdx: k, wpEnd: k + 1 };
    }
    if (/^  (weekday_intensity|weekly_pattern):\s*$/.test(l)) {
      let wpEnd = k + 1;
      while (wpEnd < techEnd) {
        const m = lines[wpEnd]!;
        if (SECTION_CHILD_KEY.test(m)) break;
        wpEnd++;
      }
      return { wpIdx: k, wpEnd };
    }
  }
  return null;
}

function findWeeklyPatternInBauMil(
  lines: string[],
  milIdx: number,
  milEnd: number
): { wpIdx: number; wpEnd: number } | null {
  for (let k = milIdx + 1; k < milEnd; k++) {
    const l = lines[k]!;
    if (/^    (weekday_intensity|weekly_pattern):\s*\S/.test(l)) {
      return { wpIdx: k, wpEnd: k + 1 };
    }
    if (/^    (weekday_intensity|weekly_pattern):\s*$/.test(l)) {
      let wpEnd = k + 1;
      while (wpEnd < milEnd) {
        const m = lines[wpEnd]!;
        if (MIL_GRANDCHILD_KEY.test(m)) break;
        wpEnd++;
      }
      return { wpIdx: k, wpEnd };
    }
  }
  return null;
}

function findSupportWeeklyInTechTop(
  lines: string[],
  techIdx: number,
  techEnd: number
): { wpIdx: number; wpEnd: number } | null {
  for (let k = techIdx + 1; k < techEnd; k++) {
    const l = lines[k]!;
    if (/^  (extra_support_weekdays|support_weekly_pattern):\s*\S/.test(l)) {
      return { wpIdx: k, wpEnd: k + 1 };
    }
    if (/^  (extra_support_weekdays|support_weekly_pattern):\s*$/.test(l)) {
      let wpEnd = k + 1;
      while (wpEnd < techEnd) {
        const m = lines[wpEnd]!;
        if (SECTION_CHILD_KEY.test(m)) break;
        wpEnd++;
      }
      return { wpIdx: k, wpEnd };
    }
  }
  return null;
}

function findSupportWeeklyInBauMil(
  lines: string[],
  milIdx: number,
  milEnd: number
): { wpIdx: number; wpEnd: number } | null {
  for (let k = milIdx + 1; k < milEnd; k++) {
    const l = lines[k]!;
    if (/^    (extra_support_weekdays|support_weekly_pattern):\s*\S/.test(l)) {
      return { wpIdx: k, wpEnd: k + 1 };
    }
    if (/^    (extra_support_weekdays|support_weekly_pattern):\s*$/.test(l)) {
      let wpEnd = k + 1;
      while (wpEnd < milEnd) {
        const m = lines[wpEnd]!;
        if (MIL_GRANDCHILD_KEY.test(m)) break;
        wpEnd++;
      }
      return { wpIdx: k, wpEnd };
    }
  }
  return null;
}

export function findSupportWeeklyRangeForTarget(
  lines: string[],
  target: TechRhythmYamlTarget
): { wpIdx: number; wpEnd: number } | null {
  if (target.kind === 'tech_top') {
    return findSupportWeeklyInTechTop(lines, target.techIdx, target.techEnd);
  }
  return findSupportWeeklyInBauMil(lines, target.milIdx, target.milEnd);
}

export function buildSupportWeeklyBlockLines(
  formatDay: (d: TechWeeklyDayKey) => string,
  target: TechRhythmYamlTarget
): string[] {
  if (target.kind === 'tech_top') {
    return [
      `  ${YK.extraSupportWeekdays}:`,
      ...TECH_WEEKLY_DAY_KEYS.map((d) => `    ${d}: ${formatDay(d)}`),
    ];
  }
  const inner = [
    `    ${YK.extraSupportWeekdays}:`,
    ...TECH_WEEKLY_DAY_KEYS.map((d) => `      ${d}: ${formatDay(d)}`),
  ];
  if (target.milIdx === target.bauEnd) {
    return ['  market_it_weekly_load:', ...inner];
  }
  return inner;
}

function findSupportMonthlyInTechTop(
  lines: string[],
  techIdx: number,
  techEnd: number
): { mpIdx: number; mpEnd: number } | null {
  for (let k = techIdx + 1; k < techEnd; k++) {
    const l = lines[k]!;
    if (/^  (extra_support_months|support_monthly_pattern):\s*\S/.test(l)) {
      return { mpIdx: k, mpEnd: k + 1 };
    }
    if (/^  (extra_support_months|support_monthly_pattern):\s*$/.test(l)) {
      let mpEnd = k + 1;
      while (mpEnd < techEnd) {
        const m = lines[mpEnd]!;
        if (SECTION_CHILD_KEY.test(m)) break;
        mpEnd++;
      }
      return { mpIdx: k, mpEnd };
    }
  }
  return null;
}

function findSupportMonthlyInBauMil(
  lines: string[],
  milIdx: number,
  milEnd: number
): { mpIdx: number; mpEnd: number } | null {
  for (let k = milIdx + 1; k < milEnd; k++) {
    const l = lines[k]!;
    if (/^    (extra_support_months|support_monthly_pattern):\s*\S/.test(l)) {
      return { mpIdx: k, mpEnd: k + 1 };
    }
    if (/^    (extra_support_months|support_monthly_pattern):\s*$/.test(l)) {
      let mpEnd = k + 1;
      while (mpEnd < milEnd) {
        const m = lines[mpEnd]!;
        if (MIL_GRANDCHILD_KEY.test(m)) break;
        mpEnd++;
      }
      return { mpIdx: k, mpEnd };
    }
  }
  return null;
}

export function findSupportMonthlyRangeForTarget(
  lines: string[],
  target: TechRhythmYamlTarget
): { mpIdx: number; mpEnd: number } | null {
  if (target.kind === 'tech_top') {
    return findSupportMonthlyInTechTop(lines, target.techIdx, target.techEnd);
  }
  return findSupportMonthlyInBauMil(lines, target.milIdx, target.milEnd);
}

export function buildSupportMonthlyBlockLines(
  formatMonth: (m: TradingMonthKey) => string,
  target: TechRhythmYamlTarget
): string[] {
  if (target.kind === 'tech_top') {
    return [
      `  ${YK.extraSupportMonths}:`,
      ...TRADING_MONTH_KEYS.map((m) => `    ${m}: ${formatMonth(m)}`),
    ];
  }
  const inner = [
    `    ${YK.extraSupportMonths}:`,
    ...TRADING_MONTH_KEYS.map((m) => `      ${m}: ${formatMonth(m)}`),
  ];
  if (target.milIdx === target.bauEnd) {
    return ['  market_it_weekly_load:', ...inner];
  }
  return inner;
}

function findAvailableInTechTop(
  lines: string[],
  techIdx: number,
  techEnd: number
): { apIdx: number; apEnd: number } | null {
  for (let k = techIdx + 1; k < techEnd; k++) {
    const l = lines[k]!;
    if (/^  (monthly_runway_availability|available_capacity_pattern):\s*\S/.test(l)) {
      return { apIdx: k, apEnd: k + 1 };
    }
    if (/^  (monthly_runway_availability|available_capacity_pattern):\s*$/.test(l)) {
      let apEnd = k + 1;
      while (apEnd < techEnd) {
        const m = lines[apEnd]!;
        if (SECTION_CHILD_KEY.test(m)) break;
        apEnd++;
      }
      return { apIdx: k, apEnd };
    }
  }
  return null;
}

function findAvailableInBauMil(
  lines: string[],
  milIdx: number,
  milEnd: number
): { apIdx: number; apEnd: number } | null {
  for (let k = milIdx + 1; k < milEnd; k++) {
    const l = lines[k]!;
    if (/^    (monthly_runway_availability|available_capacity_pattern):\s*\S/.test(l)) {
      return { apIdx: k, apEnd: k + 1 };
    }
    if (/^    (monthly_runway_availability|available_capacity_pattern):\s*$/.test(l)) {
      let apEnd = k + 1;
      while (apEnd < milEnd) {
        const m = lines[apEnd]!;
        if (MIL_GRANDCHILD_KEY.test(m)) break;
        apEnd++;
      }
      return { apIdx: k, apEnd };
    }
  }
  return null;
}

export function findAvailableCapacityRangeForTarget(
  lines: string[],
  target: TechRhythmYamlTarget
): { apIdx: number; apEnd: number } | null {
  if (target.kind === 'tech_top') {
    return findAvailableInTechTop(lines, target.techIdx, target.techEnd);
  }
  return findAvailableInBauMil(lines, target.milIdx, target.milEnd);
}

export function buildAvailableCapacityBlockLines(
  formatMonth: (m: CapacityShapeMonthKey) => string,
  target: TechRhythmYamlTarget
): string[] {
  if (target.kind === 'tech_top') {
    return [
      `  ${YK.monthlyRunwayAvailability}:`,
      ...CAPACITY_SHAPE_MONTH_KEYS.map((m) => `    ${m}: ${formatMonth(m)}`),
    ];
  }
  const inner = [
    `    ${YK.monthlyRunwayAvailability}:`,
    ...CAPACITY_SHAPE_MONTH_KEYS.map((m) => `      ${m}: ${formatMonth(m)}`),
  ];
  if (target.milIdx === target.bauEnd) {
    return ['  market_it_weekly_load:', ...inner];
  }
  return inner;
}
