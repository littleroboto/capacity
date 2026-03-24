import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import { TECH_WEEKLY_DAY_KEYS, roundTechUnit, type TechWeeklyDayKey } from '@/lib/techRhythmDsl';

export type TechWeeklyPatternPatch = Record<TechWeeklyDayKey, number>;

/** Top-level YAML key at column 0 (starts document section). */
const TOP_LEVEL_KEY = /^[a-z][a-z0-9_]*:\s*/;

/** Direct child of `tech:` (exactly two spaces + key). */
const TECH_CHILD_KEY = /^  [a-z][a-z0-9_]*:\s*/;

function formatTechYamlUnit(n: number): string {
  const r = roundTechUnit(n);
  const s = r.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function buildWeeklyPatternLines(pattern: TechWeeklyPatternPatch): string[] {
  return [
    '  weekly_pattern:',
    ...TECH_WEEKLY_DAY_KEYS.map((d) => `    ${d}: ${formatTechYamlUnit(pattern[d]!)}`),
  ];
}

function findTechBlockRange(lines: string[]): { techIdx: number; techEnd: number } | null {
  const techIdx = lines.findIndex((l) => /^tech:\s*$/.test(l));
  if (techIdx < 0) return null;
  let techEnd = lines.length;
  for (let k = techIdx + 1; k < lines.length; k++) {
    if (TOP_LEVEL_KEY.test(lines[k])) {
      techEnd = k;
      break;
    }
  }
  return { techIdx, techEnd };
}

function findWeeklyPatternInTech(
  lines: string[],
  techIdx: number,
  techEnd: number
): { wpIdx: number; wpEnd: number; inline: boolean } | null {
  for (let k = techIdx + 1; k < techEnd; k++) {
    const l = lines[k]!;
    if (/^  weekly_pattern:\s*\S/.test(l)) {
      return { wpIdx: k, wpEnd: k + 1, inline: true };
    }
    if (/^  weekly_pattern:\s*$/.test(l)) {
      let wpEnd = k + 1;
      while (wpEnd < techEnd) {
        const m = lines[wpEnd]!;
        if (TECH_CHILD_KEY.test(m)) break;
        wpEnd++;
      }
      return { wpIdx: k, wpEnd, inline: false };
    }
  }
  return null;
}

function patchSegment(segment: string, market: string, pattern: TechWeeklyPatternPatch): string {
  const m = segment.match(/^country:\s*(\S+)/m);
  if (!m || m[1] !== market) return segment;

  const lines = segment.split('\n');
  const blockLines = buildWeeklyPatternLines(pattern);
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
  const wp = findWeeklyPatternInTech(lines, techIdx, techEnd);

  if (!wp) {
    lines.splice(techIdx + 1, 0, ...blockLines);
    return lines.join('\n');
  }

  lines.splice(wp.wpIdx, wp.wpEnd - wp.wpIdx, ...blockLines);
  return lines.join('\n');
}

/** Replace `tech.weekly_pattern` in the document for `market` with explicit Mon–Sun numeric keys [0, 1]. */
export function patchDslTechWeeklyPattern(
  dslText: string,
  market: string,
  pattern: TechWeeklyPatternPatch
): string {
  const multi = MULTI_DOC_SPLIT.test(dslText);
  const parts = multi ? dslText.split(MULTI_DOC_SPLIT) : [dslText];
  const out = parts.map((seg) => patchSegment(seg.trimEnd(), market, pattern));
  return multi ? out.join('\n---\n\n') : out[0]!;
}
