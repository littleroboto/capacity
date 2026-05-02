import { parseDate } from '@/engine/calendar';
import type { CampaignConfig, MarketConfig, ProgrammeWindowFields, TechProgrammeConfig } from '@/engine/types';
import { formatDateYmd } from '@/lib/weekRunway';

export type ProgrammeGanttBarKind = 'campaign' | 'tech_programme';

/** Lucide-aligned icons drawn in the programme strip (via `foreignObject`). */
export type ProgrammeGanttChronicleIcon = 'hammer' | 'flask' | 'none';

export type ProgrammeGanttChronicleMark =
  | { kind: 'diamond'; ymd: string; label?: string }
  | { kind: 'tick'; ymd: string; label?: string; tickStyle?: 'line' | 'dot' }
  /** Horizontal dashed “rail” (planning lead-in, build, test, post–offer tail). */
  | {
      kind: 'dotted_span';
      startYmd: string;
      endYmdInclusive: string;
      icon: ProgrammeGanttChronicleIcon;
      /** Render style override. Default: dotted for `icon:none`, dashed for icon rails. */
      railStyle?: 'dotted' | 'dashed';
      /** Optional short phase caption drawn above the rail. */
      phaseLabel?: string;
      /** Optional SVG `<title>` (e.g. offer-code tail). */
      title?: string;
    }
  /** Inverted U: cap + two legs at span ends (readiness fence before go-live). */
  | { kind: 'bracket_span'; startYmd: string; endYmdInclusive: string }
  /** Solid hatched live window. */
  | { kind: 'run_bar'; startYmd: string; endYmdInclusive: string };

export type ProgrammeGanttChronicleLane = {
  id: string;
  kind: ProgrammeGanttBarKind;
  parentName: string;
  /** Full prep+live footprint (labels / titles). */
  footprintStartYmd: string;
  footprintEndYmdInclusive: string;
  marks: ProgrammeGanttChronicleMark[];
};

function addDaysYmd(ymd: string, deltaDays: number): string {
  const d = parseDate(ymd);
  d.setDate(d.getDate() + deltaDays);
  return formatDateYmd(d);
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b;
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

/** Build / prep engineering window (~3–4 weeks). */
const BUILD_BLOCK_MIN_DAYS = 21;
const BUILD_BLOCK_MAX_DAYS = 28;
/** Test / validation (~3–6 weeks). */
const TEST_BLOCK_MIN_DAYS = 21;
const TEST_BLOCK_MAX_DAYS = 42;
/** Quiet “ready” window immediately before go-live (1–2 weeks). */
const GAP_BEFORE_GO_LIVE_MIN = 7;
const GAP_BEFORE_GO_LIVE_MAX = 14;
/** After live ends: offer / codes tail (~2 weeks). */
const POST_RUN_CODES_DAYS = 14;
/** POS pilot stage nominal length; actual count can expand/shrink with available prep. */
const POS_PILOT_STAGE_DAYS = 7;
/** Initial POS test phase after HoC (2–3 weeks). */
const POS_TEST_MIN_DAYS = 14;
const POS_TEST_MAX_DAYS = 21;

function looksLikePosProgramme(kind: ProgrammeGanttBarKind, name: string): boolean {
  if (kind !== 'tech_programme') return false;
  return /\bpos\b/i.test(name) || /point\s*of\s*sale/i.test(name) || /\bhoc\b/i.test(name);
}

function buildChronicleMarksForProgramme(
  goLiveYmd: string,
  prepDays: number,
  liveDurationDays: number,
): { marks: ProgrammeGanttChronicleMark[]; footprintEndYmdInclusive: string } {
  const P = Math.floor(prepDays);
  const goLive = goLiveYmd;
  const dur = liveDurationDays;
  const prepStart = addDaysYmd(goLive, -P);
  const runEnd = addDaysYmd(addDaysYmd(goLive, dur), -1);

  const clampInt = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(n)));

  let gapD = Math.min(GAP_BEFORE_GO_LIVE_MAX, Math.max(GAP_BEFORE_GO_LIVE_MIN, 10));
  const prepAfterGap = Math.max(1, P - gapD);
  let buildD = clampInt(prepAfterGap * 0.3, BUILD_BLOCK_MIN_DAYS, BUILD_BLOCK_MAX_DAYS);
  let testD = clampInt(prepAfterGap * 0.4, TEST_BLOCK_MIN_DAYS, TEST_BLOCK_MAX_DAYS);

  // Ensure build+test+gap fit in prep; for short prep, shrink test then build, then gap.
  while (gapD + buildD + testD > P && testD > 7) testD -= 1;
  while (gapD + buildD + testD > P && buildD > 7) buildD -= 1;
  while (gapD + buildD + testD > P && gapD > 1) gapD -= 1;
  if (gapD + buildD + testD > P) {
    const overflow = gapD + buildD + testD - P;
    testD = Math.max(3, testD - overflow);
  }

  const gapStart = addDaysYmd(goLive, -gapD);
  const testEnd = addDaysYmd(gapStart, -1);
  const testStart = addDaysYmd(testEnd, -(testD - 1));
  const buildEnd = addDaysYmd(testStart, -1);
  let buildStart = addDaysYmd(buildEnd, -(buildD - 1));

  if (buildStart < prepStart) {
    buildStart = prepStart;
  }

  /** Diamond is the start of the campaign object / prep timeline. */
  const briefDeliveryYmd = prepStart;
  /** Dotted planning rail runs from brief delivery up to (but not including) build start. */
  const planningRailEnd = addDaysYmd(buildStart, -1);

  const marks: ProgrammeGanttChronicleMark[] = [];

  if (planningRailEnd >= briefDeliveryYmd) {
    marks.push({
      kind: 'dotted_span',
      startYmd: briefDeliveryYmd,
      endYmdInclusive: planningRailEnd,
      icon: 'none',
      title: 'Planning / long lead-in',
    });
  }

  marks.push({ kind: 'diamond', ymd: briefDeliveryYmd });

  if (buildEnd >= buildStart) {
    marks.push({ kind: 'tick', ymd: buildStart });
    marks.push({ kind: 'dotted_span', startYmd: buildStart, endYmdInclusive: buildEnd, icon: 'hammer' });
  }

  if (testEnd >= testStart) {
    marks.push({ kind: 'tick', ymd: testStart });
    marks.push({ kind: 'dotted_span', startYmd: testStart, endYmdInclusive: testEnd, icon: 'flask' });
    marks.push({ kind: 'tick', ymd: testEnd });
  }

  // Show the quiet buffer before go-live as a faint dotted span (instead of only baseline).
  const gapEnd = addDaysYmd(goLive, -1);
  const postTestGapStart = addDaysYmd(testEnd, 1);
  if (gapEnd >= postTestGapStart) {
    marks.push({
      kind: 'dotted_span',
      startYmd: postTestGapStart,
      endYmdInclusive: gapEnd,
      icon: 'none',
      title: 'Quiet gap before go-live',
    });
  }

  marks.push({ kind: 'run_bar', startYmd: goLive, endYmdInclusive: runEnd });

  const codesStart = addDaysYmd(runEnd, 1);
  const codesEnd = addDaysYmd(runEnd, POST_RUN_CODES_DAYS);
  marks.push({
    kind: 'dotted_span',
    startYmd: codesStart,
    endYmdInclusive: codesEnd,
    icon: 'none',
    title: 'Offer codes (until expiry)',
  });
  marks.push({ kind: 'tick', ymd: codesEnd });

  return { marks, footprintEndYmdInclusive: codesEnd };
}

function buildPosRolloutMarksForProgramme(
  goLiveYmd: string,
  prepDays: number,
  liveDurationDays: number,
): { marks: ProgrammeGanttChronicleMark[]; footprintEndYmdInclusive: string } {
  const P = Math.floor(prepDays);
  const goLive = goLiveYmd;
  const runEnd = addDaysYmd(addDaysYmd(goLive, liveDurationDays), -1);
  const hocYmd = addDaysYmd(goLive, -P);
  const clampInt = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(n)));

  // HoC is a marker day; remaining prep is split into test + N pilot phases.
  const phaseBudget = Math.max(1, P - 1);
  let testDays = clampInt(phaseBudget * 0.45, POS_TEST_MIN_DAYS, POS_TEST_MAX_DAYS);
  const pilotMinTotal = Math.min(1, Math.max(1, phaseBudget - 1));
  if (testDays > phaseBudget - pilotMinTotal) {
    testDays = Math.max(1, phaseBudget - pilotMinTotal);
  }
  const pilotBudget = Math.max(1, phaseBudget - testDays);
  const pilotCountCap = Math.min(8, pilotBudget);
  const pilotCount = Math.max(1, Math.min(pilotCountCap, Math.round(pilotBudget / POS_PILOT_STAGE_DAYS)));
  const pilotBaseDays = Math.floor(pilotBudget / pilotCount);
  let pilotRemainder = pilotBudget - pilotBaseDays * pilotCount;
  const pilotDurations: number[] = [];
  for (let i = 0; i < pilotCount; i += 1) {
    const d = pilotBaseDays + (pilotRemainder > 0 ? 1 : 0);
    if (pilotRemainder > 0) pilotRemainder -= 1;
    pilotDurations.push(Math.max(1, d));
  }

  const testStart = addDaysYmd(hocYmd, 1);
  const testEnd = addDaysYmd(testStart, testDays - 1);

  const marks: ProgrammeGanttChronicleMark[] = [];
  marks.push({ kind: 'diamond', ymd: hocYmd }); // HoC

  if (testEnd >= testStart) {
    marks.push({ kind: 'tick', ymd: testStart });
    marks.push({
      kind: 'dotted_span',
      startYmd: testStart,
      endYmdInclusive: testEnd,
      icon: 'flask',
      railStyle: 'dashed',
      title: 'Test phase',
    });
    marks.push({ kind: 'tick', ymd: testEnd });
  }

  let pilotStart = addDaysYmd(testEnd, 1);
  for (let i = 0; i < pilotDurations.length; i += 1) {
    const pilotDays = pilotDurations[i]!;
    const pilotEnd = addDaysYmd(pilotStart, pilotDays - 1);
    marks.push({ kind: 'tick', ymd: pilotStart, tickStyle: 'dot' });
    marks.push({
      kind: 'dotted_span',
      startYmd: pilotStart,
      endYmdInclusive: pilotEnd,
      icon: 'none',
      railStyle: 'dashed',
      title: `Pilot phase ${i + 1}`,
    });
    pilotStart = addDaysYmd(pilotEnd, 1);
  }
  marks.push({ kind: 'tick', ymd: goLive, label: 'NDR' }); // National Deployment Ready

  marks.push({ kind: 'run_bar', startYmd: goLive, endYmdInclusive: runEnd }); // National rollout
  marks.push({ kind: 'tick', ymd: runEnd, label: 'NDC' }); // National Deployment Complete

  return { marks, footprintEndYmdInclusive: runEnd };
}

function chronicleLaneForEntity(
  id: string,
  kind: ProgrammeGanttBarKind,
  name: string,
  ent: Pick<
    CampaignConfig | TechProgrammeConfig,
    'start' | 'durationDays' | 'prepBeforeLiveDays' | 'readinessDurationDays' | 'presenceOnly'
  >,
): ProgrammeGanttChronicleLane | null {
  const ft = programmeFootprintInclusiveEnd(ent);
  if (!ft) return null;
  const start = ent.start?.trim() ?? '';
  const dur = ent.durationDays ?? 0;
  if (!start || dur <= 0) return null;

  const prep = ent.prepBeforeLiveDays;
  if (prep != null && prep >= 3) {
    const { marks, footprintEndYmdInclusive } = looksLikePosProgramme(kind, name)
      ? buildPosRolloutMarksForProgramme(start, prep, dur)
      : buildChronicleMarksForProgramme(start, prep, dur);
    return {
      id,
      kind,
      parentName: name,
      footprintStartYmd: ft.startYmd,
      footprintEndYmdInclusive: maxYmd(ft.endYmdInclusive, footprintEndYmdInclusive),
      marks,
    };
  }

  return {
    id,
    kind,
    parentName: name,
    footprintStartYmd: ft.startYmd,
    footprintEndYmdInclusive: ft.endYmdInclusive,
    marks: [{ kind: 'run_bar', startYmd: ft.startYmd, endYmdInclusive: ft.endYmdInclusive }],
  };
}

/**
 * One swimlane per campaign / tech programme. When `prepBeforeLiveDays` ≥ 3, draws a technical chronicle:
 * **diamond at prep start** → dotted planning rail → tick + ~3–4 wk build (hammer) → tick + ~3–6 wk test (flask)
 * ending on a tick → **1–2 wk dotted quiet gap** → hatched live run → ~2 wk dotted offer-code tail ending on an expiry tick.
 * POS-labelled tech programmes use a POS rollout style: HoC diamond → 2–3 wk test phase (Flask) → N pilot phases
 * with tick boundaries leading to NDR → national rollout bar (4–8 wk from YAML) ending at NDC.
 * Durations scale down if prep is shorter than the nominal plan.
 */
export function collectProgrammeGanttChronicleLanes(config: MarketConfig | undefined): ProgrammeGanttChronicleLane[] {
  if (!config) return [];
  const out: ProgrammeGanttChronicleLane[] = [];
  let ci = 0;
  for (const c of config.campaigns) {
    const lane = chronicleLaneForEntity(`campaign:${ci}:${c.name}`, 'campaign', c.name, c);
    if (lane) out.push(lane);
    ci += 1;
  }
  let ti = 0;
  for (const t of config.techProgrammes ?? []) {
    const lane = chronicleLaneForEntity(`tech:${ti}:${t.name}`, 'tech_programme', t.name, t);
    if (lane) out.push(lane);
    ti += 1;
  }
  return out;
}
