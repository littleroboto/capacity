import { parseDate } from '@/engine/calendar';
import type { MarketConfig, ProgrammeWindowFields } from '@/engine/types';
import { formatDateYmd } from '@/lib/weekRunway';

export type ProgrammeGanttBarKind = 'campaign' | 'tech_programme';

export type ProgrammeGanttBar = {
  id: string;
  kind: ProgrammeGanttBarKind;
  name: string;
  startYmd: string;
  endYmdInclusive: string;
};

function addDaysYmd(ymd: string, deltaDays: number): string {
  const d = parseDate(ymd);
  d.setDate(d.getDate() + deltaDays);
  return formatDateYmd(d);
}

/**
 * Prep + live footprint on the calendar (inclusive end), matching
 * {@link campaignLoadBearingPrepLiveForDate} window semantics for the lead and interval models.
 */
export function programmeFootprintInclusiveEnd(
  p: Pick<
    ProgrammeWindowFields,
    'start' | 'durationDays' | 'prepBeforeLiveDays' | 'readinessDurationDays' | 'presenceOnly'
  >,
): { startYmd: string; endYmdInclusive: string } | null {
  if (!p.start) return null;
  const dur = p.durationDays ?? 0;
  const prep = p.prepBeforeLiveDays;
  if (prep != null && prep > 0) {
    if (dur <= 0) return null;
    const startYmd = addDaysYmd(p.start, -prep);
    const endExclusive = addDaysYmd(p.start, dur);
    const endYmdInclusive = addDaysYmd(endExclusive, -1);
    return { startYmd, endYmdInclusive };
  }
  if (dur <= 0) return null;
  const endExclusive = addDaysYmd(p.start, dur);
  return { startYmd: p.start, endYmdInclusive: addDaysYmd(endExclusive, -1) };
}

export function collectProgrammeGanttBars(config: MarketConfig | undefined): ProgrammeGanttBar[] {
  if (!config) return [];
  const out: ProgrammeGanttBar[] = [];
  let ci = 0;
  for (const c of config.campaigns) {
    const w = programmeFootprintInclusiveEnd(c);
    if (!w) continue;
    out.push({
      id: `campaign:${ci}:${c.name}`,
      kind: 'campaign',
      name: c.name,
      startYmd: w.startYmd,
      endYmdInclusive: w.endYmdInclusive,
    });
    ci += 1;
  }
  let ti = 0;
  for (const t of config.techProgrammes ?? []) {
    const w = programmeFootprintInclusiveEnd(t);
    if (!w) continue;
    out.push({
      id: `tech:${ti}:${t.name}`,
      kind: 'tech_programme',
      name: t.name,
      startYmd: w.startYmd,
      endYmdInclusive: w.endYmdInclusive,
    });
    ti += 1;
  }
  return out;
}
