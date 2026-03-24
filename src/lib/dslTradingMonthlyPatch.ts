import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import { roundMonthlyUnit, TRADING_MONTH_KEYS, type TradingMonthKey } from '@/lib/tradingMonthlyDsl';

export type TradingMonthlyPatternPatch = Record<TradingMonthKey, number>;

const TOP_LEVEL_KEY = /^[a-z][a-z0-9_]*:\s*/;

/** Direct child of `trading:` (two spaces + key). */
const TRADING_CHILD_KEY = /^  [a-z][a-z0-9_]*:\s*/;

function formatTradingMonthlyYamlUnit(n: number): string {
  const r = roundMonthlyUnit(n);
  const s = r.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function buildMonthlyPatternLines(pattern: TradingMonthlyPatternPatch): string[] {
  return [
    '  monthly_pattern:',
    ...TRADING_MONTH_KEYS.map((m) => `    ${m}: ${formatTradingMonthlyYamlUnit(pattern[m]!)}`),
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

function findMonthlyPatternInTrading(
  lines: string[],
  tradingIdx: number,
  tradingEnd: number
): { mpIdx: number; mpEnd: number; inline: boolean } | null {
  for (let k = tradingIdx + 1; k < tradingEnd; k++) {
    const l = lines[k]!;
    if (/^  monthly_pattern:\s*\S/.test(l)) {
      return { mpIdx: k, mpEnd: k + 1, inline: true };
    }
    if (/^  monthly_pattern:\s*$/.test(l)) {
      let mpEnd = k + 1;
      while (mpEnd < tradingEnd) {
        const m = lines[mpEnd]!;
        if (TRADING_CHILD_KEY.test(m)) break;
        mpEnd++;
      }
      return { mpIdx: k, mpEnd, inline: false };
    }
  }
  return null;
}

function patchSegment(segment: string, market: string, pattern: TradingMonthlyPatternPatch): string {
  const m = segment.match(/^country:\s*(\S+)/m);
  if (!m || m[1] !== market) return segment;

  const lines = segment.split('\n');
  const blockLines = buildMonthlyPatternLines(pattern);
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
  const mp = findMonthlyPatternInTrading(lines, tradingIdx, tradingEnd);

  if (!mp) {
    lines.splice(tradingEnd, 0, ...blockLines);
    return lines.join('\n');
  }

  lines.splice(mp.mpIdx, mp.mpEnd - mp.mpIdx, ...blockLines);
  return lines.join('\n');
}

/** Replace `trading.monthly_pattern` in the document for `market` with explicit Jan–Dec floats [0, 1]. */
export function patchDslTradingMonthlyPattern(
  dslText: string,
  market: string,
  pattern: TradingMonthlyPatternPatch
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchSegment(seg.trimEnd(), market, pattern));
  return multi ? out.join('\n---\n\n') : out[0]!;
}
