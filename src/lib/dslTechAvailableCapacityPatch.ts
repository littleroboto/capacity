import { parseDslMarketId } from '@/lib/dslMarketLine';
import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import {
  CAPACITY_SHAPE_MONTH_KEYS,
  roundAvailableCapacityUnit,
  type CapacityShapeMonthKey,
} from '@/lib/capacityShapeMonthlyDsl';

export type TechAvailableCapacityPatternPatch = Record<CapacityShapeMonthKey, number>;

const TOP_LEVEL_KEY = /^[a-z][a-z0-9_]*:\s*/;
const TECH_CHILD_KEY = /^  [a-z][a-z0-9_]*:\s*/;

function formatAvailableYamlUnit(n: number): string {
  const r = roundAvailableCapacityUnit(n);
  const s = r.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function buildAvailableLines(pattern: TechAvailableCapacityPatternPatch): string[] {
  return [
    '  available_capacity_pattern:',
    ...CAPACITY_SHAPE_MONTH_KEYS.map((m) => `    ${m}: ${formatAvailableYamlUnit(pattern[m]!)}`),
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

function findAvailableInTech(
  lines: string[],
  techIdx: number,
  techEnd: number
): { apIdx: number; apEnd: number } | null {
  for (let k = techIdx + 1; k < techEnd; k++) {
    const l = lines[k]!;
    if (/^  available_capacity_pattern:\s*\S/.test(l)) {
      return { apIdx: k, apEnd: k + 1 };
    }
    if (/^  available_capacity_pattern:\s*$/.test(l)) {
      let apEnd = k + 1;
      while (apEnd < techEnd) {
        const m = lines[apEnd]!;
        if (TECH_CHILD_KEY.test(m)) break;
        apEnd++;
      }
      return { apIdx: k, apEnd };
    }
  }
  return null;
}

function patchSegment(segment: string, market: string, pattern: TechAvailableCapacityPatternPatch): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const blockLines = buildAvailableLines(pattern);
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
  const ap = findAvailableInTech(lines, techIdx, techEnd);

  if (!ap) {
    lines.splice(techEnd, 0, ...blockLines);
  } else {
    lines.splice(ap.apIdx, ap.apEnd - ap.apIdx, ...blockLines);
  }
  return lines.join('\n');
}

/** Replace `tech.available_capacity_pattern` for `market` (Jan–Dec 0.05–1 share of lab+team caps). */
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
