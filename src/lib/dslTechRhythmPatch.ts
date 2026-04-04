import { parseDslMarketId } from '@/lib/dslMarketLine';
import {
  buildTechWeeklyPatternBlockLines,
  findWeeklyPatternRangeForTarget,
  resolveTechRhythmYamlTarget,
} from '@/lib/dslBauMarketItRhythmYaml';
import { MULTI_DOC_SPLIT } from '@/lib/multiDocMarketYaml';
import { TECH_WEEKLY_DAY_KEYS, roundTechUnit, type TechWeeklyDayKey } from '@/lib/techRhythmDsl';

export type TechWeeklyPatternPatch = Record<TechWeeklyDayKey, number>;

function formatTechYamlUnit(n: number): string {
  const r = roundTechUnit(n);
  const s = r.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function patchSegment(segment: string, market: string, pattern: TechWeeklyPatternPatch): string {
  const id = parseDslMarketId(segment);
  if (!id || id !== market) return segment;

  const lines = segment.split('\n');
  const dayLines = (d: TechWeeklyDayKey) => formatTechYamlUnit(pattern[d]!);
  const target = resolveTechRhythmYamlTarget(lines);

  if (!target) {
    const ci = lines.findIndex((l) => /^campaigns:\s*/.test(l));
    const insertAt = ci >= 0 ? ci : lines.length;
    const prefix = insertAt > 0 && lines[insertAt - 1]!.trim() !== '' ? [''] : [];
    const suffix = insertAt < lines.length && lines[insertAt]!.trim() !== '' ? [''] : [];
    const blockLines = [
      'tech:',
      '  weekday_intensity:',
      ...TECH_WEEKLY_DAY_KEYS.map((d) => `    ${d}: ${dayLines(d)}`),
    ];
    lines.splice(insertAt, 0, ...prefix, ...blockLines, ...suffix);
    return lines.join('\n');
  }

  const blockLines = buildTechWeeklyPatternBlockLines(dayLines, target);

  if (target.kind === 'bau_mil' && target.milIdx === target.bauEnd) {
    const prefix = target.bauEnd > 0 && lines[target.bauEnd - 1]!.trim() !== '' ? [''] : [];
    lines.splice(target.bauEnd, 0, ...prefix, ...blockLines);
    return lines.join('\n');
  }

  const wp = findWeeklyPatternRangeForTarget(lines, target);
  if (!wp) {
    if (target.kind === 'bau_mil') {
      lines.splice(target.milIdx + 1, 0, ...blockLines);
    } else {
      lines.splice(target.techIdx + 1, 0, ...blockLines);
    }
    return lines.join('\n');
  }

  lines.splice(wp.wpIdx, wp.wpEnd - wp.wpIdx, ...blockLines);
  return lines.join('\n');
}

/** Replace weekly Market IT rhythm in YAML (`bau.market_it_weekly_load` or legacy `tech:`). */
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
