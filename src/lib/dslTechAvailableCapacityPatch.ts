import { parseDslMarketId } from '@/lib/dslMarketLine';
import {
  buildAvailableCapacityBlockLines,
  findAvailableCapacityRangeForTarget,
  resolveTechRhythmYamlTarget,
} from '@/lib/dslBauMarketItRhythmYaml';
import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import {
  CAPACITY_SHAPE_MONTH_KEYS,
  roundAvailableCapacityUnit,
  type CapacityShapeMonthKey,
} from '@/lib/capacityShapeMonthlyDsl';

export type TechAvailableCapacityPatternPatch = Record<CapacityShapeMonthKey, number>;

function formatAvailableYamlUnit(n: number): string {
  const r = roundAvailableCapacityUnit(n);
  const s = r.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function patchSegment(segment: string, market: string, pattern: TechAvailableCapacityPatternPatch): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const formatMonth = (m: CapacityShapeMonthKey) => formatAvailableYamlUnit(pattern[m]!);
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
      '  monthly_runway_availability:',
      ...CAPACITY_SHAPE_MONTH_KEYS.map((m) => `    ${m}: ${formatMonth(m)}`),
      ...suffix
    );
    return lines.join('\n');
  }

  const blockLines = buildAvailableCapacityBlockLines(formatMonth, target);

  if (target.kind === 'bau_mil' && target.milIdx === target.bauEnd) {
    const prefix = target.bauEnd > 0 && lines[target.bauEnd - 1]!.trim() !== '' ? [''] : [];
    lines.splice(target.bauEnd, 0, ...prefix, ...blockLines);
    return lines.join('\n');
  }

  const ap = findAvailableCapacityRangeForTarget(lines, target);
  if (!ap) {
    if (target.kind === 'bau_mil') {
      lines.splice(target.milEnd, 0, ...blockLines);
    } else {
      lines.splice(target.techEnd, 0, ...blockLines);
    }
    return lines.join('\n');
  }

  lines.splice(ap.apIdx, ap.apEnd - ap.apIdx, ...blockLines);
  return lines.join('\n');
}

/** Replace `available_capacity_pattern` under `bau.market_it_weekly_load` or legacy `tech:`. */
export function patchDslTechAvailableCapacityPattern(
  dslText: string,
  market: string,
  pattern: TechAvailableCapacityPatternPatch
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchSegment(seg.trimEnd(), market, pattern));
  return multi ? out.join('\n---\n\n') : out[0]!;
}
