import { parseDslMarketId } from '@/lib/dslMarketLine';
import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import {
  PAYDAY_MONTH_MULTIPLIER_MAX,
  type PaydayKnotTuple,
} from '@/engine/paydayMonthShape';

const TOP_LEVEL_KEY = /^[a-z][a-z0-9_]*:\s*/;

/** Direct child of `trading:` (two spaces + key). */
const TRADING_CHILD_KEY = /^  [a-z][a-z0-9_]*:\s*/;

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
): { mpEnd: number } | null {
  for (let k = tradingIdx + 1; k < tradingEnd; k++) {
    const l = lines[k]!;
    if (/^  monthly_pattern:\s*\S/.test(l)) {
      return { mpEnd: k + 1 };
    }
    if (/^  monthly_pattern:\s*$/.test(l)) {
      let mpEnd = k + 1;
      while (mpEnd < tradingEnd) {
        const m = lines[mpEnd]!;
        if (TRADING_CHILD_KEY.test(m)) break;
        mpEnd++;
      }
      return { mpEnd };
    }
  }
  return null;
}

function findWeeklyPatternInTrading(
  lines: string[],
  tradingIdx: number,
  tradingEnd: number
): { wpEnd: number } | null {
  for (let k = tradingIdx + 1; k < tradingEnd; k++) {
    const l = lines[k]!;
    if (/^  weekly_pattern:\s*\S/.test(l)) {
      return { wpEnd: k + 1 };
    }
    if (/^  weekly_pattern:\s*$/.test(l)) {
      let wpEnd = k + 1;
      while (wpEnd < tradingEnd) {
        const m = lines[wpEnd]!;
        if (TRADING_CHILD_KEY.test(m)) break;
        wpEnd++;
      }
      return { wpEnd };
    }
  }
  return null;
}

/** Strip `payday_month_peak_multiplier` and `payday_month_knot_multipliers` inside `trading:`; returns new tradingEnd. */
function stripPaydayFields(
  lines: string[],
  tradingIdx: number,
  tradingEnd: number
): number {
  let k = tradingIdx + 1;
  while (k < tradingEnd) {
    const l = lines[k]!;
    if (/^  payday_month_peak_multiplier:/.test(l)) {
      lines.splice(k, 1);
      tradingEnd--;
      continue;
    }
    if (/^  payday_month_knot_multipliers:\s*\[/.test(l)) {
      lines.splice(k, 1);
      tradingEnd--;
      continue;
    }
    if (/^  payday_month_knot_multipliers:\s*$/.test(l)) {
      let j = k + 1;
      while (j < tradingEnd && /^    /.test(lines[j]!)) j++;
      lines.splice(k, j - k);
      tradingEnd -= j - k;
      continue;
    }
    k++;
  }
  return tradingEnd;
}

function formatPaydayKnotYaml(n: number): string {
  const x = Math.min(PAYDAY_MONTH_MULTIPLIER_MAX, Math.max(1, Math.round(n * 1000) / 1000));
  return x.toFixed(2);
}

function buildPaydayKnotLine(knots: PaydayKnotTuple): string {
  return `  payday_month_knot_multipliers: [${knots.map(formatPaydayKnotYaml).join(', ')}]`;
}

function patchSegment(segment: string, market: string, knots: PaydayKnotTuple): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const paydayLine = buildPaydayKnotLine(knots);
  const range = findTradingBlockRange(lines);

  if (!range) {
    const ci = lines.findIndex((l) => /^campaigns:\s*/.test(l));
    const insertAt = ci >= 0 ? ci : lines.length;
    const prefix = insertAt > 0 && lines[insertAt - 1]!.trim() !== '' ? [''] : [];
    const suffix = insertAt < lines.length && lines[insertAt]!.trim() !== '' ? [''] : [];
    lines.splice(insertAt, 0, ...prefix, 'trading:', paydayLine, ...suffix);
    return lines.join('\n');
  }

  let { tradingIdx, tradingEnd } = range;
  tradingEnd = stripPaydayFields(lines, tradingIdx, tradingEnd);

  const mp = findMonthlyPatternInTrading(lines, tradingIdx, tradingEnd);
  const wp = findWeeklyPatternInTrading(lines, tradingIdx, tradingEnd);
  const insertAt = mp?.mpEnd ?? wp?.wpEnd ?? tradingIdx + 1;

  lines.splice(insertAt, 0, paydayLine);
  return lines.join('\n');
}

/** Writes `trading.payday_month_knot_multipliers` for `market` and removes legacy `payday_month_peak_multiplier`. */
export function patchDslTradingPaydayKnotMultipliers(
  dslText: string,
  market: string,
  knots: PaydayKnotTuple
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchSegment(seg.trimEnd(), market, knots));
  return multi ? out.join('\n---\n\n') : out[0]!;
}
