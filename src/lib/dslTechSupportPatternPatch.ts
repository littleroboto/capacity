import { parseDslMarketId } from '@/lib/dslMarketLine';
import {
  buildSupportMonthlyBlockLines,
  buildSupportWeeklyBlockLines,
  findSupportMonthlyRangeForTarget,
  findSupportWeeklyRangeForTarget,
  resolveTechRhythmYamlTarget,
} from '@/lib/dslBauMarketItRhythmYaml';
import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import { TECH_WEEKLY_DAY_KEYS, roundTechUnit, type TechWeeklyDayKey } from '@/lib/techRhythmDsl';
import {
  roundMonthlyUnit,
  TRADING_MONTH_KEYS,
  type TradingMonthKey,
} from '@/lib/tradingMonthlyDsl';

export type TechSupportWeeklyPatternPatch = Record<TechWeeklyDayKey, number>;
export type TechSupportMonthlyPatternPatch = Record<TradingMonthKey, number>;

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

function patchSupportWeeklySegment(segment: string, market: string, pattern: TechSupportWeeklyPatternPatch): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const formatDay = (d: TechWeeklyDayKey) => formatTechYamlUnit(pattern[d]!);
  const target = resolveTechRhythmYamlTarget(lines);

  if (!target) {
    const ci = lines.findIndex((l) => /^campaigns:\s*/.test(l));
    const insertAt = ci >= 0 ? ci : lines.length;
    const prefix = insertAt > 0 && lines[insertAt - 1]!.trim() !== '' ? [''] : [];
    const suffix = insertAt < lines.length && lines[insertAt]!.trim() !== '' ? [''] : [];
    lines.splice(
      insertAt,
      0,
      ...prefix,
      'tech:',
      '  extra_support_weekdays:',
      ...TECH_WEEKLY_DAY_KEYS.map((d) => `    ${d}: ${formatDay(d)}`),
      ...suffix
    );
    return lines.join('\n');
  }

  const blockLines = buildSupportWeeklyBlockLines(formatDay, target);

  if (target.kind === 'bau_mil' && target.milIdx === target.bauEnd) {
    const prefix = target.bauEnd > 0 && lines[target.bauEnd - 1]!.trim() !== '' ? [''] : [];
    lines.splice(target.bauEnd, 0, ...prefix, ...blockLines);
    return lines.join('\n');
  }

  const sw = findSupportWeeklyRangeForTarget(lines, target);
  if (!sw) {
    if (target.kind === 'bau_mil') {
      lines.splice(target.milEnd, 0, ...blockLines);
    } else {
      lines.splice(target.techEnd, 0, ...blockLines);
    }
    return lines.join('\n');
  }

  lines.splice(sw.wpIdx, sw.wpEnd - sw.wpIdx, ...blockLines);
  return lines.join('\n');
}

function patchSupportMonthlySegment(segment: string, market: string, pattern: TechSupportMonthlyPatternPatch): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const formatMonth = (m: TradingMonthKey) => formatSupportMonthlyYamlUnit(pattern[m]!);
  const target = resolveTechRhythmYamlTarget(lines);

  if (!target) {
    const ci = lines.findIndex((l) => /^campaigns:\s*/.test(l));
    const insertAt = ci >= 0 ? ci : lines.length;
    const prefix = insertAt > 0 && lines[insertAt - 1]!.trim() !== '' ? [''] : [];
    const suffix = insertAt < lines.length && lines[insertAt]!.trim() !== '' ? [''] : [];
    lines.splice(
      insertAt,
      0,
      ...prefix,
      'tech:',
      '  extra_support_months:',
      ...TRADING_MONTH_KEYS.map((m) => `    ${m}: ${formatMonth(m)}`),
      ...suffix
    );
    return lines.join('\n');
  }

  const blockLines = buildSupportMonthlyBlockLines(formatMonth, target);

  if (target.kind === 'bau_mil' && target.milIdx === target.bauEnd) {
    const prefix = target.bauEnd > 0 && lines[target.bauEnd - 1]!.trim() !== '' ? [''] : [];
    lines.splice(target.bauEnd, 0, ...prefix, ...blockLines);
    return lines.join('\n');
  }

  const sm = findSupportMonthlyRangeForTarget(lines, target);
  if (!sm) {
    if (target.kind === 'bau_mil') {
      lines.splice(target.milEnd, 0, ...blockLines);
    } else {
      lines.splice(target.techEnd, 0, ...blockLines);
    }
    return lines.join('\n');
  }

  lines.splice(sm.mpIdx, sm.mpEnd - sm.mpIdx, ...blockLines);
  return lines.join('\n');
}

/** Replace support weekly pattern (`bau.market_it_weekly_load` or `tech:`). */
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

/** Replace support monthly pattern (`bau.market_it_weekly_load` or `tech:`). */
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
