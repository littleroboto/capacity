import { parseDslMarketId } from '@/lib/dslMarketLine';
import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import { clampHolidayStaffingUi } from '@/lib/capacityShapeMonthlyDsl';

export type HolidayStaffingBlockKind = 'public' | 'school';

const TOP_LEVEL_KEY = /^[a-z][a-z0-9_]*:\s*/;

function blockStartRe(kind: HolidayStaffingBlockKind): RegExp {
  return kind === 'public' ? /^public_holidays:\s*$/ : /^school_holidays:\s*$/;
}

function blockHeaderLine(kind: HolidayStaffingBlockKind): string {
  return kind === 'public' ? 'public_holidays:' : 'school_holidays:';
}

function formatStaffingLine(value: number): string {
  const v = clampHolidayStaffingUi(value);
  const s = v.toFixed(3).replace(/\.?0+$/, '');
  return `  staffing_multiplier: ${s || '0.12'}`;
}

function findTopLevelBlock(
  lines: string[],
  kind: HolidayStaffingBlockKind
): { start: number; end: number } | null {
  const re = blockStartRe(kind);
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let k = start + 1; k < lines.length; k++) {
    if (TOP_LEVEL_KEY.test(lines[k]!)) {
      end = k;
      break;
    }
  }
  return { start, end };
}

function applyStaffingToBlock(
  lines: string[],
  blockStart: number,
  blockEnd: number,
  value: number
): void {
  const newLine = formatStaffingLine(value);
  for (let k = blockStart + 1; k < blockEnd; k++) {
    if (/^\s*staffing_multiplier:\s*/.test(lines[k]!)) {
      lines[k] = newLine;
      return;
    }
  }
  lines.splice(blockStart + 1, 0, newLine);
}

function patchSegment(
  segment: string,
  market: string,
  kind: HolidayStaffingBlockKind,
  value: number
): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const range = findTopLevelBlock(lines, kind);

  if (!range) {
    const ci = lines.findIndex((l) => /^campaigns:\s*/.test(l));
    const insertAt = ci >= 0 ? ci : lines.length;
    const prefix = insertAt > 0 && lines[insertAt - 1]!.trim() !== '' ? [''] : [];
    const suffix = insertAt < lines.length && lines[insertAt]!.trim() !== '' ? [''] : [];
    lines.splice(insertAt, 0, ...prefix, blockHeaderLine(kind), formatStaffingLine(value), ...suffix);
    return lines.join('\n');
  }

  applyStaffingToBlock(lines, range.start, range.end, value);
  return lines.join('\n');
}

/** Update `public_holidays.staffing_multiplier` or `school_holidays.staffing_multiplier` for `market`. */
export function patchDslHolidayStaffingMultiplier(
  dslText: string,
  market: string,
  kind: HolidayStaffingBlockKind,
  value: number
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchSegment(seg.trimEnd(), market, kind, value));
  return multi ? out.join('\n---\n\n') : out[0]!;
}
