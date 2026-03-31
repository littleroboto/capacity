import { parseDslMarketId } from '@/lib/dslMarketLine';
import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import {
  CAPACITY_SHAPE_MONTH_KEYS,
  roundCapacityShapeUnit,
  type CapacityShapeMonthKey,
} from '@/lib/capacityShapeMonthlyDsl';

export type ResourceCapacityMonthlyPatternPatch = Record<CapacityShapeMonthKey, number>;

export type StaffMonthlyPatternPatchOpts = {
  /** When `absolute`, YAML stores headcount per month and `monthly_pattern_basis: absolute` is kept in sync. */
  staffBasis?: 'relative' | 'absolute';
};

const TOP_LEVEL_KEY = /^[a-z][a-z0-9_]*:\s*/;
/** Direct child of `resources:` (two spaces + key). */
const RES_CHILD_KEY = /^  [a-z][a-z0-9_]*:\s*/;

function formatCapacityShapeYamlUnit(n: number): string {
  const r = roundCapacityShapeUnit(n);
  const s = r.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function buildMonthlyPatternLines(
  pattern: ResourceCapacityMonthlyPatternPatch,
  formatValue: (n: number) => string
): string[] {
  return [
    '    monthly_pattern:',
    ...CAPACITY_SHAPE_MONTH_KEYS.map((m) => `      ${m}: ${formatValue(pattern[m]!)}`),
  ];
}

function syncStaffMonthlyPatternBasisLine(
  lines: string[],
  resIdx: number,
  resEnd: number,
  absolute: boolean
): void {
  const sub = findResourceSubBlock(lines, resIdx, resEnd, 'staff');
  if (!sub) return;

  let basisIdx = -1;
  let capacityIdx = -1;
  for (let k = sub.subIdx + 1; k < sub.subEnd; k++) {
    const l = lines[k]!;
    if (/^    monthly_pattern_basis:\s*/.test(l)) basisIdx = k;
    if (/^    capacity:\s*/.test(l)) capacityIdx = k;
  }

  if (absolute) {
    if (basisIdx < 0 && capacityIdx >= 0) {
      lines.splice(capacityIdx + 1, 0, '    monthly_pattern_basis: absolute');
    } else if (basisIdx >= 0) {
      lines[basisIdx] = '    monthly_pattern_basis: absolute';
    }
    return;
  }

  if (basisIdx >= 0) {
    lines.splice(basisIdx, 1);
  }
}

function findResourcesBlockRange(lines: string[]): { resIdx: number; resEnd: number } | null {
  const resIdx = lines.findIndex((l) => /^resources:\s*$/.test(l));
  if (resIdx < 0) return null;
  let resEnd = lines.length;
  for (let k = resIdx + 1; k < lines.length; k++) {
    if (TOP_LEVEL_KEY.test(lines[k]!)) {
      resEnd = k;
      break;
    }
  }
  return { resIdx, resEnd };
}

function findResourceSubBlock(
  lines: string[],
  resIdx: number,
  resEnd: number,
  name: 'labs' | 'staff'
): { subIdx: number; subEnd: number } | null {
  const re = name === 'labs' ? /^  labs:\s*$/ : /^  staff:\s*$/;
  const subIdx = lines.findIndex((l, i) => i > resIdx && i < resEnd && re.test(l));
  if (subIdx < 0) return null;
  let subEnd = resEnd;
  for (let k = subIdx + 1; k < resEnd; k++) {
    if (RES_CHILD_KEY.test(lines[k]!)) {
      subEnd = k;
      break;
    }
  }
  return { subIdx, subEnd };
}

function findMonthlyPatternInResourceSubBlock(
  lines: string[],
  subIdx: number,
  subEnd: number
): { mpIdx: number; mpEnd: number } | null {
  for (let k = subIdx + 1; k < subEnd; k++) {
    const l = lines[k]!;
    if (/^    monthly_pattern:\s*\S/.test(l)) {
      return { mpIdx: k, mpEnd: k + 1 };
    }
    if (/^    monthly_pattern:\s*$/.test(l)) {
      let mpEnd = k + 1;
      while (mpEnd < subEnd) {
        const m = lines[mpEnd]!;
        if (m.trim() === '') {
          mpEnd++;
          continue;
        }
        if (/^      [A-Za-z]/.test(m)) {
          mpEnd++;
          continue;
        }
        if (/^    [a-z][a-z0-9_]*:\s*/.test(m)) break;
        mpEnd++;
      }
      return { mpIdx: k, mpEnd };
    }
  }
  return null;
}

function patchResourceMonthlySegment(
  segment: string,
  market: string,
  name: 'labs' | 'staff',
  pattern: ResourceCapacityMonthlyPatternPatch,
  opts?: StaffMonthlyPatternPatchOpts
): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const staffBasis = opts?.staffBasis ?? 'relative';
  const formatValue =
    name === 'staff' && staffBasis === 'absolute'
      ? (n: number) => String(Math.round(Math.min(50, Math.max(0, n))))
      : formatCapacityShapeYamlUnit;
  const monthlyLines = buildMonthlyPatternLines(pattern, formatValue);
  const subHeader = name === 'labs' ? '  labs:' : '  staff:';
  const capDefault = name === 'labs' ? '5' : '4';

  let range = findResourcesBlockRange(lines);

  if (!range) {
    const ci = lines.findIndex((l) => /^campaigns:\s*/.test(l));
    const insertAt = ci >= 0 ? ci : lines.length;
    const prefix = insertAt > 0 && lines[insertAt - 1]!.trim() !== '' ? [''] : [];
    const suffix = insertAt < lines.length && lines[insertAt]!.trim() !== '' ? [''] : [];
    const resOpen: string[] = ['resources:', subHeader, `    capacity: ${capDefault}`];
    if (name === 'staff' && staffBasis === 'absolute') {
      resOpen.push('    monthly_pattern_basis: absolute');
    }
    resOpen.push(...monthlyLines);
    lines.splice(insertAt, 0, ...prefix, ...resOpen, ...suffix);
    return lines.join('\n');
  }

  const { resIdx, resEnd } = range;
  const sub = findResourceSubBlock(lines, resIdx, resEnd, name);

  if (!sub) {
    const insert = [subHeader, `    capacity: ${capDefault}`];
    if (name === 'staff' && staffBasis === 'absolute') {
      insert.push('    monthly_pattern_basis: absolute');
    }
    lines.splice(resEnd, 0, ...insert, ...monthlyLines);
    return lines.join('\n');
  }

  if (name === 'staff') {
    syncStaffMonthlyPatternBasisLine(lines, resIdx, resEnd, staffBasis === 'absolute');
  }

  const sub2 = findResourceSubBlock(lines, resIdx, resEnd, name)!;
  const mp = findMonthlyPatternInResourceSubBlock(lines, sub2.subIdx, sub2.subEnd);
  if (!mp) {
    lines.splice(sub2.subEnd, 0, ...monthlyLines);
  } else {
    lines.splice(mp.mpIdx, mp.mpEnd - mp.mpIdx, ...monthlyLines);
  }
  return lines.join('\n');
}

/** Replace `resources.labs.monthly_pattern` for `market` (Jan–Dec multipliers vs baseline lab/testing capacity). */
export function patchDslResourcesLabsMonthlyPattern(
  dslText: string,
  market: string,
  pattern: ResourceCapacityMonthlyPatternPatch
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchResourceMonthlySegment(seg.trimEnd(), market, 'labs', pattern));
  return multi ? out.join('\n---\n\n') : out[0]!;
}

/** Replace `resources.staff.monthly_pattern` for `market` (multipliers or absolute headcount vs `staffBasis`). */
export function patchDslResourcesStaffMonthlyPattern(
  dslText: string,
  market: string,
  pattern: ResourceCapacityMonthlyPatternPatch,
  opts?: StaffMonthlyPatternPatchOpts
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) =>
    patchResourceMonthlySegment(seg.trimEnd(), market, 'staff', pattern, opts)
  );
  return multi ? out.join('\n---\n\n') : out[0]!;
}
