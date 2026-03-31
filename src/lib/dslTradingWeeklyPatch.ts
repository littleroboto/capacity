import { parseDslMarketId } from '@/lib/dslMarketLine';
import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import { TECH_WEEKLY_DAY_KEYS, roundTechUnit, type TechWeeklyDayKey } from '@/lib/techRhythmDsl';

/** Mon–Sun 0–1 values under `trading.weekly_pattern`. */
export type TradingWeeklyPatternPatch = Record<TechWeeklyDayKey, number>;

const TOP_LEVEL_KEY = /^[a-z][a-z0-9_]*:\s*/;

/** Direct child of `trading:` (two spaces + key). */
const TRADING_CHILD_KEY = /^  [a-z][a-z0-9_]*:\s*/;

function formatTradingYamlUnit(n: number): string {
  const r = roundTechUnit(n);
  const s = r.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function buildWeeklyPatternLines(pattern: TradingWeeklyPatternPatch): string[] {
  return [
    '  weekly_pattern:',
    ...TECH_WEEKLY_DAY_KEYS.map((d) => `    ${d}: ${formatTradingYamlUnit(pattern[d]!)}`),
  ];
}

function findTradingBlockRange(lines: string[]): { tradingIdx: number; tradingEnd: number } | null {
  const tradingIdx = lines.findIndex((l) => /^trading:\s*$/.test(l));
  if (tradingIdx < 0) return null;
  let tradingEnd = lines.length;
  for (let k = tradingIdx + 1; k < lines.length; k++) {
    if (TOP_LEVEL_KEY.test(lines[k]!)) {
      tradingEnd = k;
      break;
    }
  }
  return { tradingIdx, tradingEnd };
}

function findWeeklyPatternInTrading(
  lines: string[],
  tradingIdx: number,
  tradingEnd: number
): { wpIdx: number; wpEnd: number; inline: boolean } | null {
  for (let k = tradingIdx + 1; k < tradingEnd; k++) {
    const l = lines[k]!;
    if (/^  weekly_pattern:\s*\S/.test(l)) {
      return { wpIdx: k, wpEnd: k + 1, inline: true };
    }
    if (/^  weekly_pattern:\s*$/.test(l)) {
      let wpEnd = k + 1;
      while (wpEnd < tradingEnd) {
        const m = lines[wpEnd]!;
        if (TRADING_CHILD_KEY.test(m)) break;
        wpEnd++;
      }
      return { wpIdx: k, wpEnd, inline: false };
    }
  }
  return null;
}

function patchSegment(segment: string, market: string, pattern: TradingWeeklyPatternPatch): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const blockLines = buildWeeklyPatternLines(pattern);
  const range = findTradingBlockRange(lines);

  if (!range) {
    const ci = lines.findIndex((l) => /^campaigns:\s*/.test(l));
    const insertAt = ci >= 0 ? ci : lines.length;
    const prefix = insertAt > 0 && lines[insertAt - 1]!.trim() !== '' ? [''] : [];
    const suffix = insertAt < lines.length && lines[insertAt]!.trim() !== '' ? [''] : [];
    lines.splice(insertAt, 0, ...prefix, 'trading:', ...blockLines, ...suffix);
    return lines.join('\n');
  }

  const { tradingIdx, tradingEnd } = range;
  const wp = findWeeklyPatternInTrading(lines, tradingIdx, tradingEnd);

  if (!wp) {
    lines.splice(tradingEnd, 0, ...blockLines);
    return lines.join('\n');
  }

  lines.splice(wp.wpIdx, wp.wpEnd - wp.wpIdx, ...blockLines);
  return lines.join('\n');
}

/** Replace `trading.weekly_pattern` for `market` with explicit Mon–Sun numeric keys [0, 1]. */
export function patchDslTradingWeeklyPattern(
  dslText: string,
  market: string,
  pattern: TradingWeeklyPatternPatch
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchSegment(seg.trimEnd(), market, pattern));
  return multi ? out.join('\n---\n\n') : out[0]!;
}
