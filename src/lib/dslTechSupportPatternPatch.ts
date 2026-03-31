import { parseDslMarketId } from '@/lib/dslMarketLine';
import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import { TECH_WEEKLY_DAY_KEYS, roundTechUnit, type TechWeeklyDayKey } from '@/lib/techRhythmDsl';
import {
  roundMonthlyUnit,
  TRADING_MONTH_KEYS,
  type TradingMonthKey,
} from '@/lib/tradingMonthlyDsl';

export type TechSupportWeeklyPatternPatch = Record<TechWeeklyDayKey, number>;
export type TechSupportMonthlyPatternPatch = Record<TradingMonthKey, number>;

const TOP_LEVEL_KEY = /^[a-z][a-z0-9_]*:\s*/;
const TECH_CHILD_KEY = /^  [a-z][a-z0-9_]*:\s*/;

function formatTechYamlUnit(n: number): string {
  const r = roundTechUnit(n);
  const s = r.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function formatSupportMonthlyYamlUnit(n: number): string {
  const r = roundMonthlyUnit(n);
  const s = r.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function buildSupportWeeklyLines(pattern: TechSupportWeeklyPatternPatch): string[] {
  return [
    '  support_weekly_pattern:',
    ...TECH_WEEKLY_DAY_KEYS.map((d) => `    ${d}: ${formatTechYamlUnit(pattern[d]!)}`),
  ];
}

function buildSupportMonthlyLines(pattern: TechSupportMonthlyPatternPatch): string[] {
  return [
    '  support_monthly_pattern:',
    ...TRADING_MONTH_KEYS.map((m) => `    ${m}: ${formatSupportMonthlyYamlUnit(pattern[m]!)}`),
  ];
}

function findTechBlockRange(lines: string[]): { techIdx: number; techEnd: number } | null {
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

function findSupportWeeklyInTech(
  lines: string[],
  techIdx: number,
  techEnd: number
): { wpIdx: number; wpEnd: number } | null {
  for (let k = techIdx + 1; k < techEnd; k++) {
    const l = lines[k]!;
    if (/^  support_weekly_pattern:\s*\S/.test(l)) {
      return { wpIdx: k, wpEnd: k + 1 };
    }
    if (/^  support_weekly_pattern:\s*$/.test(l)) {
      let wpEnd = k + 1;
      while (wpEnd < techEnd) {
        const m = lines[wpEnd]!;
        if (TECH_CHILD_KEY.test(m)) break;
        wpEnd++;
      }
      return { wpIdx: k, wpEnd };
    }
  }
  return null;
}

function findSupportMonthlyInTech(
  lines: string[],
  techIdx: number,
  techEnd: number
): { mpIdx: number; mpEnd: number } | null {
  for (let k = techIdx + 1; k < techEnd; k++) {
    const l = lines[k]!;
    if (/^  support_monthly_pattern:\s*\S/.test(l)) {
      return { mpIdx: k, mpEnd: k + 1 };
    }
    if (/^  support_monthly_pattern:\s*$/.test(l)) {
      let mpEnd = k + 1;
      while (mpEnd < techEnd) {
        const m = lines[mpEnd]!;
        if (TECH_CHILD_KEY.test(m)) break;
        mpEnd++;
      }
      return { mpIdx: k, mpEnd };
    }
  }
  return null;
}

function patchSupportWeeklySegment(segment: string, market: string, pattern: TechSupportWeeklyPatternPatch): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const blockLines = buildSupportWeeklyLines(pattern);
  const range = findTechBlockRange(lines);

  if (!range) {
    const ci = lines.findIndex((l) => /^campaigns:\s*/.test(l));
    const insertAt = ci >= 0 ? ci : lines.length;
    const prefix = insertAt > 0 && lines[insertAt - 1]!.trim() !== '' ? [''] : [];
    const suffix = insertAt < lines.length && lines[insertAt]!.trim() !== '' ? [''] : [];
    lines.splice(insertAt, 0, ...prefix, 'tech:', ...blockLines, ...suffix);
    return lines.join('\n');
  }

  const { techIdx, techEnd } = range;
  const sw = findSupportWeeklyInTech(lines, techIdx, techEnd);

  if (!sw) {
    lines.splice(techEnd, 0, ...blockLines);
    return lines.join('\n');
  }

  lines.splice(sw.wpIdx, sw.wpEnd - sw.wpIdx, ...blockLines);
  return lines.join('\n');
}

function patchSupportMonthlySegment(segment: string, market: string, pattern: TechSupportMonthlyPatternPatch): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const blockLines = buildSupportMonthlyLines(pattern);
  const range = findTechBlockRange(lines);

  if (!range) {
    const ci = lines.findIndex((l) => /^campaigns:\s*/.test(l));
    const insertAt = ci >= 0 ? ci : lines.length;
    const prefix = insertAt > 0 && lines[insertAt - 1]!.trim() !== '' ? [''] : [];
    const suffix = insertAt < lines.length && lines[insertAt]!.trim() !== '' ? [''] : [];
    lines.splice(insertAt, 0, ...prefix, 'tech:', ...blockLines, ...suffix);
    return lines.join('\n');
  }

  const { techIdx, techEnd } = range;
  const sm = findSupportMonthlyInTech(lines, techIdx, techEnd);

  if (!sm) {
    lines.splice(techEnd, 0, ...blockLines);
    return lines.join('\n');
  }

  lines.splice(sm.mpIdx, sm.mpEnd - sm.mpIdx, ...blockLines);
  return lines.join('\n');
}

/** Replace `tech.support_weekly_pattern` for `market` with explicit Mon–Sun numeric keys [0, 1]. */
export function patchDslTechSupportWeeklyPattern(
  dslText: string,
  market: string,
  pattern: TechSupportWeeklyPatternPatch
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchSupportWeeklySegment(seg.trimEnd(), market, pattern));
  return multi ? out.join('\n---\n\n') : out[0]!;
}

/** Replace `tech.support_monthly_pattern` for `market` with explicit Jan–Dec floats [0, 1]. */
export function patchDslTechSupportMonthlyPattern(
  dslText: string,
  market: string,
  pattern: TechSupportMonthlyPatternPatch
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchSupportMonthlySegment(seg.trimEnd(), market, pattern));
  return multi ? out.join('\n---\n\n') : out[0]!;
}
