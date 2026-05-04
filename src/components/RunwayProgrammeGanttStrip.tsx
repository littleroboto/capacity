import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, useReducedMotion } from 'motion/react';
import { Hammer, FlaskConical } from 'lucide-react';
import { parseDate } from '@/engine/calendar';
import type { DeploymentRiskBlackout } from '@/engine/types';
import type { RiskRow } from '@/engine/riskModel';
import type { ContributionStripLayoutMeta, PlacedRunwayCell } from '@/lib/calendarQuarterLayout';
import { CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W } from '@/lib/calendarQuarterLayout';
import {
  deploymentBlackoutYamlEnvelopeForSpan,
  formatDeploymentBlackoutIsoRange,
  ymdInAnyDeploymentRiskBlackout,
} from '@/lib/deploymentRiskBlackoutCalendar';
import { enumerateIsoDatesInclusive } from '@/lib/runwayDateFilter';
import { formatDateYmd } from '@/lib/weekRunway';
import {
  contributionStripYmdToCellLayout,
  xSpanForInclusiveYmdRangeClipped,
} from '@/lib/runwayProgrammeGanttLayout';
import { layoutContributionStripRunwaySvg } from '@/lib/runwayCompareSvgLayout';
import type { ProgrammeGanttChronicleIcon, ProgrammeGanttChronicleLane } from '@/lib/runwayProgrammeGanttModel';
import type { ProgrammeGanttDisplayPrefs } from '@/lib/runwayProgrammeGanttPrefs';
import type { ProgrammeGanttDisclosureTier } from '@/lib/runwayProgrammeGanttDisclosure';
import { organicHeatmapCellLayerIndex } from '@/lib/runwayHeatmapOrganicLayers';
import {
  buildPlanAnimationSchedule,
  planBuildProgressAt,
  planBuildVisible,
  scheduleLookup,
  usePlanBuildElapsedMs,
  type PlanAnimScheduledItem,
  type PlanBuildMilestone,
  type PlanScheduleLaneRow,
  type PlanScheduleMark,
} from '@/lib/runwayProgrammeGanttBuildAnimation';
import { buildProgrammeGanttBuildLogLines } from '@/lib/runwayProgrammeGanttBuildConsoleScript';
import { useAtcStore } from '@/store/useAtcStore';

const LABEL_GAP_PX = 5;
const LABEL_FONT_SIZE_PX = 11;
const CHRONICLE_ICON_PX = 13;
const CHRONICLE_ICON_HALF = CHRONICLE_ICON_PX / 2;
/** Campaign hammer/flask: sit just above the dashed baseline (foreignObject top-left). */
const CHRONICLE_ICON_ABOVE_LINE_PAD_PX = 3;
/** Give tech programme rows a little more vertical breathing room for milestone labels. */
const TECH_PROGRAMME_EXTRA_ROW_GAP_PX = 5;

function programmeBarTrailingLabel(
  name: string,
  startYmd: string,
  endYmdInclusive: string,
  includeDateRange: boolean,
): string {
  if (!includeDateRange) return name;
  const range =
    startYmd === endYmdInclusive ? startYmd : `${startYmd}–${endYmdInclusive}`;
  return `${name} · ${range}`;
}

/** Reserved above programme bars when deployment blackouts are shown (ribbon + vertical guides). */
export const PROGRAMME_GANTT_BLACKOUT_CHROME_H_PX = 22;

const RIBBON_BLACKOUT_ICON_PX = 16;
const RIBBON_BLACKOUT_ICON_HALF = RIBBON_BLACKOUT_ICON_PX / 2;
const SCHOOL_STRIP_ICON_PX = 13;

const SNOWFLAKE_PATH_DS = [
  'm10 20-1.25-2.5L6 18',
  'M10 4 8.75 6.5 6 6',
  'm14 20 1.25-2.5L18 18',
  'm14 4 1.25 2.5L18 6',
  'm17 21-3-6h-4',
  'm17 3-3 6 1.5 3',
  'M2 12h6.5L10 9',
  'm20 10-1.5 2 1.5 2',
  'M22 12h-6.5L14 15',
  'm4 10 1.5 2L4 14',
  'm7 21 3-6-1.5-3',
  'm7 3 3 6h4',
] as const;

const PALMTREE_PATH_DS = [
  'M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4',
  'M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3',
  'M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35',
  'M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14',
] as const;

function nextYmd(ymd: string): string {
  const d = parseDate(ymd);
  d.setDate(d.getDate() + 1);
  return formatDateYmd(d);
}

function mergeContiguousYmdToSpans(
  sortedYmSet: Set<string>,
  layout: ReadonlyMap<string, { x: number; cellPx: number }>,
): Array<{ key: string; x0: number; x1: number; ymdStart: string; ymdEnd: string }> {
  const sorted = [...sortedYmSet].sort();
  const groups: string[][] = [];
  for (const ymd of sorted) {
    const g = groups[groups.length - 1];
    const last = g?.[g.length - 1];
    if (!g || !last || nextYmd(last) !== ymd) groups.push([ymd]);
    else g.push(ymd);
  }
  return groups
    .map((g, i) => {
      const c0 = layout.get(g[0]!);
      const c1 = layout.get(g[g.length - 1]!);
      if (!c0 || !c1) return null;
      return {
        key: `span-${i}-${g[0]}`,
        x0: c0.x,
        x1: c1.x + c1.cellPx,
        ymdStart: g[0]!,
        ymdEnd: g[g.length - 1]!,
      };
    })
    .filter(Boolean) as Array<{ key: string; x0: number; x1: number; ymdStart: string; ymdEnd: string }>;
}

function programmeBlackoutSpanLabel(
  blackouts: readonly DeploymentRiskBlackout[] | null | undefined,
  ymdStart: string,
  ymdEnd: string,
): string {
  if (!blackouts?.length) return 'Blackout';
  for (const b of blackouts) {
    if (!(ymdStart <= b.end && ymdEnd >= b.start)) continue;
    const t = (b.public_reason ?? '').trim();
    if (t) return t.length > 42 ? `${t.slice(0, 40)}…` : t;
    return 'Blackout';
  }
  return 'Blackout';
}

function cellCenterX(ymd: string, layout: ReadonlyMap<string, { x: number; cellPx: number }>): number | null {
  const c = layout.get(ymd);
  if (!c) return null;
  return c.x + c.cellPx / 2;
}

/** Same cadence as contribution heatmap organic layers (homepage hero build-out). */
function landingGanttDrawProgress(
  tick: number | undefined,
  marketKey: string,
  anchorYmd: string,
  salt: string,
): number {
  if (tick == null) return 1;
  const L = organicHeatmapCellLayerIndex({ tick, marketKey, dateYmd: anchorYmd, salt });
  return (L + 1) / 5;
}

/** Landing uses organic tick; workbench staged plan uses schedule map + elapsed ms. */
function workbenchPlanDrawP(
  landingHero: boolean,
  useWorkbenchSchedule: boolean,
  schedMap: Map<string, PlanAnimScheduledItem>,
  elapsed: number,
  barGrowMs: number,
  schedKey: string,
  organicTick: number | undefined,
  organicMk: string,
  anchorYmd: string,
  organicSalt: string,
): number {
  if (landingHero) return landingGanttDrawProgress(organicTick, organicMk, anchorYmd, organicSalt);
  if (!useWorkbenchSchedule) return 1;
  const it = schedMap.get(schedKey);
  if (!it) return 1;
  if (!planBuildVisible(elapsed, it)) return 0;
  return planBuildProgressAt(elapsed, it, barGrowMs);
}

export type RunwayProgrammeGanttStripProps = {
  marketKey: string;
  placedCells: readonly PlacedRunwayCell[];
  contributionMeta: ContributionStripLayoutMeta;
  cellPx: number;
  gap: number;
  width: number;
  riskByDate: ReadonlyMap<string, RiskRow>;
  lanes: readonly ProgrammeGanttChronicleLane[];
  blackouts: readonly DeploymentRiskBlackout[] | null | undefined;
  prefs: ProgrammeGanttDisplayPrefs;
  /** Remount key for subtle in-place pop animation of timeline content. */
  animateInKey?: string | number;
  /**
   * Progressive disclosure driven by timeline zoom (0 = overview, 3 = full detail).
   * Icons and labels stay mounted where needed to avoid mount flicker during zoom.
   */
  disclosureTier?: ProgrammeGanttDisclosureTier;
  /**
   * Landing hero: drive segment reveal from the same organic tick as contribution heatmaps
   * (`organicLayerTick` in RunwayGridBody). Omit when {@link ProgrammeGanttDisplayPrefs.planBuildAnimation}
   * is `staged` so the strip uses the same schedule as /app.
   */
  landingHeatmapOrganicSyncTick?: number;
  /**
   * When syncing with heatmaps, use the same `marketKey` as those strips (e.g. `${country}-combined`)
   * so per-day reveal order matches; programme `marketKey` alone would hash differently.
   */
  landingOrganicSyncMarketKey?: string;
  /** Ephemeral / marketing: do not push staged-build lines into {@link useAtcStore} workbench event log. */
  suppressPlanBuildWorkbenchLog?: boolean;
};

export function runwayProgrammeGanttStripHeightPx(prefs: ProgrammeGanttDisplayPrefs, laneCount: number): number {
  const { stripTopPadPx, stripBottomPadPx, barHeightPx, laneGapPx } = prefs;
  const n = Math.max(0, laneCount);
  const bodyPx = n === 0 ? 0 : n * barHeightPx + (n - 1) * laneGapPx;
  return stripTopPadPx + bodyPx + stripBottomPadPx;
}

type PlacedMark =
  | {
      kind: 'dotted_span';
      key: string;
      x0: number;
      x1: number;
      midY: number;
      icon: ProgrammeGanttChronicleIcon;
      railStyle?: 'dotted' | 'dashed';
      phaseLabel?: string;
      spanTitle?: string;
      anchorYmd: string;
    }
  | {
      kind: 'run_bar';
      key: string;
      x: number;
      y: number;
      w: number;
      h: number;
      fill: string;
      opacity: number;
      anchorYmd: string;
    }
  | { kind: 'bracket_span'; key: string; x0: number; x1: number; yTop: number; yBot: number; anchorYmd: string }
  | {
      kind: 'tick';
      key: string;
      cx: number;
      y0: number;
      y1: number;
      tickLabel?: string;
      tickStyle?: 'line' | 'dot';
      anchorYmd: string;
    }
  | { kind: 'diamond'; key: string; cx: number; cy: number; r: number; diamondLabel?: string; anchorYmd: string };

type LaneRow = {
  lane: ProgrammeGanttChronicleLane;
  yRow: number;
  midY: number;
  marks: PlacedMark[];
  labelX: number;
  maxRightX: number;
};

/** Mount Lucide icons inside SVG `foreignObject` (tiny isolated roots; unmount on teardown). */
function ChronicleIconMount({ icon }: { icon: Exclude<ProgrammeGanttChronicleIcon, 'none'> }) {
  const ref = useRef<SVGForeignObjectElement | null>(null);
  useEffect(() => {
    const fo = ref.current;
    if (!fo) return;
    const host = document.createElement('div');
    host.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    Object.assign(host.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      margin: '0',
      padding: '0',
    });
    fo.replaceChildren(host);
    const root = createRoot(host);
    const Ico = icon === 'hammer' ? Hammer : FlaskConical;
    root.render(
      <Ico size={CHRONICLE_ICON_PX - 2} strokeWidth={2} className="text-zinc-600 dark:text-zinc-400" aria-hidden />,
    );
    return () => {
      root.unmount();
    };
  }, [icon]);
  return (
    <foreignObject
      ref={ref}
      x={0}
      y={0}
      width={CHRONICLE_ICON_PX}
      height={CHRONICLE_ICON_PX}
      className="pointer-events-none overflow-visible"
    />
  );
}

export function RunwayProgrammeGanttStrip({
  marketKey,
  placedCells,
  contributionMeta,
  cellPx,
  gap: _gap,
  width,
  riskByDate,
  lanes,
  blackouts,
  prefs,
  animateInKey,
  disclosureTier: disclosureTierProp,
  landingHeatmapOrganicSyncTick,
  landingOrganicSyncMarketKey,
  suppressPlanBuildWorkbenchLog = false,
}: RunwayProgrammeGanttStripProps) {
  const disclosureTier: ProgrammeGanttDisclosureTier = disclosureTierProp ?? 3;
  const landingHeroBuild = landingHeatmapOrganicSyncTick != null;
  const landingOrganicMk =
    landingOrganicSyncMarketKey?.trim() && landingHeroBuild
      ? landingOrganicSyncMarketKey.trim()
      : marketKey;
  const showChronicleIcons = disclosureTier >= 1;
  const showPrepPhaseLabels = disclosureTier >= 2;
  const showTickAndDiamondLabels = disclosureTier >= 2;
  const showSchoolStripIcons = disclosureTier >= 2;
  const showBlackoutRibbonSnowflake = disclosureTier >= 3;
  const showLaneCaptionDates = disclosureTier >= 3 && prefs.showBarTrailingCaption;
  const reduceMotion = useReducedMotion() === true;
  const uid = useId().replace(/:/g, '');
  const schoolHatchId = `gantt-school-hatch-45-${uid}`;
  const barHatchId = `gantt-bar-hatch-45-${uid}`;
  const panelClipId = `gantt-panel-clip-${uid}`;
  const barTile = Math.max(2, Math.min(14, prefs.barHatchSpacingPx));
  const barMid = barTile / 2;

  const { clipStart, clipEnd, layout } = useMemo(() => {
    const layout = contributionStripYmdToCellLayout(placedCells, cellPx);
    const clipStart = contributionMeta.rangeStartYmd;
    const clipEnd = contributionMeta.rangeEndYmd;
    return { clipStart, clipEnd, layout };
  }, [placedCells, cellPx, contributionMeta.rangeStartYmd, contributionMeta.rangeEndYmd]);

  /** Calendar quarter boundaries (same x as contribution strip quarter rail ticks), for faint vertical guides. */
  const quarterRailXs = useMemo(() => {
    const { quarterRailBoundaryTicks } = layoutContributionStripRunwaySvg({
      placedCells: [...placedCells],
      cellPx,
      gap: _gap,
      width,
      height: 0,
      meta: contributionMeta,
    });
    return quarterRailBoundaryTicks.map((t) => t.x);
  }, [placedCells, cellPx, _gap, width, contributionMeta]);

  const { laneRows, svgHeight, schoolOverlaySpans, blackoutSpans, blackoutBandPx } = useMemo(() => {
    const { stripTopPadPx, barHeightPx, laneGapPx, stripBottomPadPx, barOpacity } = prefs;

    const blackoutYmdSet = new Set<string>();
    const schoolYmdSet = new Set<string>();
    for (const ymd of enumerateIsoDatesInclusive(clipStart, clipEnd)) {
      if (!layout.has(ymd)) continue;
      const row = riskByDate.get(ymd);
      const inB = prefs.showBlackouts && ymdInAnyDeploymentRiskBlackout(ymd, blackouts ?? null);
      const inS = prefs.showSchoolHolidays && Boolean(row?.school_holiday_flag);
      if (inB) blackoutYmdSet.add(ymd);
      if (inS) schoolYmdSet.add(ymd);
    }

    const blackoutSpans = mergeContiguousYmdToSpans(blackoutYmdSet, layout);
    const schoolOverlaySpans = mergeContiguousYmdToSpans(schoolYmdSet, layout);
    const blackoutBandPx =
      prefs.showBlackouts && blackoutSpans.length > 0 ? PROGRAMME_GANTT_BLACKOUT_CHROME_H_PX : 0;

    const laneRows: LaneRow[] = [];
    let yCursor = stripTopPadPx + blackoutBandPx;
    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx += 1) {
      const lane = lanes[laneIdx]!;
      const yRow = yCursor;
      const midY = yRow + barHeightPx / 2;
      const y0t = yRow + 3;
      const y1t = yRow + barHeightPx - 3;
      const marks: PlacedMark[] = [];
      let maxRightX = -Infinity;

      for (const m of lane.marks) {
        if (m.kind === 'dotted_span') {
          const span = xSpanForInclusiveYmdRangeClipped(
            m.startYmd,
            m.endYmdInclusive,
            layout,
            clipStart,
            clipEnd,
          );
          if (!span) continue;
          const visibleStartYmd = m.startYmd < clipStart ? clipStart : m.startYmd;
          const visibleEndYmd = m.endYmdInclusive > clipEnd ? clipEnd : m.endYmdInclusive;
          const cStart = layout.get(visibleStartYmd);
          const cEnd = layout.get(visibleEndYmd);
          const x0 = cStart ? cStart.x + cStart.cellPx / 2 : span.x0;
          const x1 = cEnd ? cEnd.x + cEnd.cellPx / 2 : span.x1;
          if (x1 < x0) continue;
          maxRightX = Math.max(maxRightX, x1);
          marks.push({
            kind: 'dotted_span',
            key: `${lane.id}-d-${m.startYmd}`,
            x0,
            x1,
            midY,
            icon: m.icon,
            railStyle: m.railStyle,
            phaseLabel: m.phaseLabel,
            spanTitle: m.title,
            anchorYmd: visibleStartYmd,
          });
        } else if (m.kind === 'run_bar') {
          const span = xSpanForInclusiveYmdRangeClipped(
            m.startYmd,
            m.endYmdInclusive,
            layout,
            clipStart,
            clipEnd,
          );
          if (!span) continue;
          maxRightX = Math.max(maxRightX, span.x1);
          const fill = lane.kind === 'campaign' ? prefs.campaignFill : prefs.techFill;
          marks.push({
            kind: 'run_bar',
            key: `${lane.id}-run`,
            x: span.x0,
            y: yRow + 1,
            w: span.x1 - span.x0,
            h: barHeightPx - 2,
            fill,
            opacity: barOpacity,
            anchorYmd: m.startYmd,
          });
        } else if (m.kind === 'bracket_span') {
          const span = xSpanForInclusiveYmdRangeClipped(
            m.startYmd,
            m.endYmdInclusive,
            layout,
            clipStart,
            clipEnd,
          );
          if (!span) continue;
          const cStart = layout.get(m.startYmd);
          const cEnd = layout.get(m.endYmdInclusive);
          if (!cStart || !cEnd) continue;
          const x0 = cStart.x + cStart.cellPx / 2;
          const x1 = cEnd.x + cEnd.cellPx / 2;
          maxRightX = Math.max(maxRightX, span.x1);
          marks.push({
            kind: 'bracket_span',
            key: `${lane.id}-br`,
            x0,
            x1,
            yTop: yRow + 2.5,
            yBot: yRow + barHeightPx - 2.5,
            anchorYmd: m.startYmd,
          });
        } else if (m.kind === 'tick') {
          const cx = cellCenterX(m.ymd, layout);
          if (cx == null) continue;
          maxRightX = Math.max(maxRightX, cx + 2);
          marks.push({
            kind: 'tick',
            key: `${lane.id}-tk-${m.ymd}`,
            cx,
            y0: y0t,
            y1: y1t,
            tickLabel: m.label,
            tickStyle: m.tickStyle,
            anchorYmd: m.ymd,
          });
        } else if (m.kind === 'diamond') {
          const cx = cellCenterX(m.ymd, layout);
          if (cx == null) continue;
          maxRightX = Math.max(maxRightX, cx + 5);
          marks.push({
            kind: 'diamond',
            key: `${lane.id}-dm-${m.ymd}`,
            cx,
            cy: midY,
            r: 4,
            diamondLabel: m.label,
            anchorYmd: m.ymd,
          });
        }
      }

      const spanFoot = xSpanForInclusiveYmdRangeClipped(
        lane.footprintStartYmd,
        lane.footprintEndYmdInclusive,
        layout,
        clipStart,
        clipEnd,
      );
      const labelX = Math.max(maxRightX, spanFoot?.x1 ?? maxRightX) + LABEL_GAP_PX;

      laneRows.push({ lane, yRow, midY, marks, labelX, maxRightX });
      const isLastLane = laneIdx === lanes.length - 1;
      if (!isLastLane) {
        yCursor +=
          barHeightPx +
          laneGapPx +
          (lane.kind === 'tech_programme' ? TECH_PROGRAMME_EXTRA_ROW_GAP_PX : 0);
      } else {
        yCursor += barHeightPx;
      }
    }

    const bodyPx = laneRows.length === 0 ? 0 : yCursor - (stripTopPadPx + blackoutBandPx);
    const svgHeight = stripTopPadPx + blackoutBandPx + bodyPx + stripBottomPadPx;

    return { laneRows, svgHeight, schoolOverlaySpans, blackoutSpans, blackoutBandPx };
  }, [lanes, layout, clipStart, clipEnd, prefs, riskByDate, blackouts, cellPx]);

  const planScheduleLaneInput = useMemo((): PlanScheduleLaneRow[] => {
    return laneRows.map((row) => ({
      laneId: row.lane.id,
      marks: row.marks.map((m): PlanScheduleMark => {
        if (m.kind === 'dotted_span') {
          return { kind: 'dotted_span', key: m.key, xMid: (m.x0 + m.x1) / 2 };
        }
        if (m.kind === 'run_bar') {
          return { kind: 'run_bar', key: m.key, xMid: m.x + Math.max(0, m.w) / 2 };
        }
        if (m.kind === 'bracket_span') {
          return { kind: 'bracket_span', key: m.key, xMid: (m.x0 + m.x1) / 2 };
        }
        if (m.kind === 'tick') {
          return { kind: 'tick', key: m.key, xMid: m.cx };
        }
        return { kind: 'diamond', key: m.key, xMid: m.cx };
      }),
    }));
  }, [laneRows]);

  const planMarkCounts = useMemo(() => {
    let diamond = 0;
    let dottedSpan = 0;
    let runBar = 0;
    let bracket = 0;
    let tick = 0;
    for (const row of laneRows) {
      for (const m of row.marks) {
        if (m.kind === 'diamond') diamond += 1;
        else if (m.kind === 'dotted_span') dottedSpan += 1;
        else if (m.kind === 'run_bar') runBar += 1;
        else if (m.kind === 'bracket_span') bracket += 1;
        else if (m.kind === 'tick') tick += 1;
      }
    }
    return { diamond, dottedSpan, runBar, bracket, tick };
  }, [laneRows]);

  const planAnimPrefsSlice = useMemo(
    () => ({
      planBuildAnimation: prefs.planBuildAnimation,
      planBuildStaggerMs: prefs.planBuildStaggerMs,
      planBuildCategoryGapMs: prefs.planBuildCategoryGapMs,
      planBuildBarGrowMs: prefs.planBuildBarGrowMs,
    }),
    [
      prefs.planBuildAnimation,
      prefs.planBuildStaggerMs,
      prefs.planBuildCategoryGapMs,
      prefs.planBuildBarGrowMs,
    ],
  );

  const { planTotalMs, planSchedMap, planMilestones } = useMemo(() => {
    if (prefs.planBuildAnimation !== 'staged') {
      return {
        planTotalMs: 0,
        planSchedMap: new Map<string, PlanAnimScheduledItem>(),
        planMilestones: [] as PlanBuildMilestone[],
      };
    }
    const built = buildPlanAnimationSchedule(planScheduleLaneInput, planAnimPrefsSlice);
    return {
      planTotalMs: built.totalMs,
      planSchedMap: scheduleLookup(built.items),
      planMilestones: built.milestones,
    };
  }, [planScheduleLaneInput, planAnimPrefsSlice, prefs.planBuildAnimation]);

  const planBuildLogLines = useMemo(() => {
    if (prefs.planBuildAnimation !== 'staged' || planTotalMs <= 0) return [];
    return buildProgrammeGanttBuildLogLines({
      marketKey,
      milestones: planMilestones,
      totalMs: planTotalMs,
      clipStart,
      clipEnd,
      laneCount: laneRows.length,
      cellCount: layout.size,
      stripWidth: width,
      cellPx,
      counts: planMarkCounts,
    });
  }, [
    prefs.planBuildAnimation,
    planTotalMs,
    planMilestones,
    marketKey,
    clipStart,
    clipEnd,
    laneRows.length,
    layout.size,
    width,
    cellPx,
    planMarkCounts,
  ]);

  const useWorkbenchPlanSchedule =
    !landingHeroBuild && prefs.planBuildAnimation === 'staged' && !reduceMotion && planTotalMs > 0;

  const planElapsedMs = usePlanBuildElapsedMs(
    useWorkbenchPlanSchedule,
    `${String(animateInKey ?? 'static')}:${marketKey}:${planTotalMs}`,
    planTotalMs,
    reduceMotion,
  );

  const planElapsedMsRef = useRef(planElapsedMs);
  planElapsedMsRef.current = planElapsedMs;

  useEffect(() => {
    if (
      suppressPlanBuildWorkbenchLog ||
      !useWorkbenchPlanSchedule ||
      planTotalMs <= 0 ||
      planBuildLogLines.length === 0
    )
      return;
    const push = useAtcStore.getState().pushWorkbenchEventLog;
    const seen = new Set<number>();
    let raf = 0;
    const lines = planBuildLogLines;
    const maxAt = lines.length ? Math.max(...lines.map((l) => l.atMs)) : 0;
    push(`[gantt] programme strip staged build · ${marketKey}`);
    const tick = () => {
      const elapsed = planElapsedMsRef.current;
      const streamMs = Math.min(maxAt + 48, elapsed * 4.1);
      const batch: string[] = [];
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i]!.atMs <= streamMs && !seen.has(i)) {
          seen.add(i);
          batch.push(`[gantt] ${lines[i]!.text}`);
        }
      }
      if (batch.length) push(batch);
      if (elapsed < planTotalMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    suppressPlanBuildWorkbenchLog,
    useWorkbenchPlanSchedule,
    planTotalMs,
    planBuildLogLines,
    marketKey,
    animateInKey,
  ]);

  const wbPlanP = useCallback(
    (schedKey: string, anchorYmd: string, organicSalt: string) =>
      workbenchPlanDrawP(
        landingHeroBuild,
        useWorkbenchPlanSchedule,
        planSchedMap,
        planElapsedMs,
        prefs.planBuildBarGrowMs,
        schedKey,
        landingHeatmapOrganicSyncTick,
        landingOrganicMk,
        anchorYmd,
        organicSalt,
      ),
    [
      landingHeroBuild,
      useWorkbenchPlanSchedule,
      planSchedMap,
      planElapsedMs,
      prefs.planBuildBarGrowMs,
      landingHeatmapOrganicSyncTick,
      landingOrganicMk,
    ],
  );

  const gridWidth = width;
  const gutter = CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W;
  const barAreaTop = prefs.stripTopPadPx + blackoutBandPx;
  const ribbonMidY = prefs.stripTopPadPx + blackoutBandPx / 2;

  return (
    <svg
      className="shrink-0 font-sans text-zinc-700 dark:text-zinc-300"
      width={gridWidth}
      height={svgHeight}
      viewBox={`0 0 ${gridWidth} ${svgHeight}`}
      style={{ overflow: 'visible' }}
      role="img"
      aria-label={`Programme timeline for ${marketKey}`}
    >
      <defs>
        <clipPath id={panelClipId} clipPathUnits="userSpaceOnUse">
          <rect x={gutter} y={0} width={Math.max(0, gridWidth - gutter)} height={Math.max(0, svgHeight)} />
        </clipPath>
        <pattern
          id={schoolHatchId}
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45 1.5 1.5)"
        >
          <line
            x1="1.5"
            y1="-0.5"
            x2="1.5"
            y2="3.5"
            className="stroke-zinc-500 dark:stroke-zinc-400"
            strokeWidth={0.55}
            strokeOpacity={Math.min(0.58, 0.18 + prefs.overlayHatchOpacity * 0.55)}
          />
        </pattern>
        <pattern
          id={barHatchId}
          width={barTile}
          height={barTile}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(45 ${barMid} ${barMid})`}
        >
          <line
            x1={barMid}
            y1={-0.5}
            x2={barMid}
            y2={barTile + 0.5}
            className="stroke-zinc-500 dark:stroke-zinc-400"
            strokeWidth={0.42}
            strokeOpacity={0.55}
          />
        </pattern>
      </defs>

      {/* Flat canvas: one fill, no inset stroke (avoids double-frame with outer UI). */}
      <rect x={0} y={0} width={gridWidth} height={svgHeight} className="fill-white dark:fill-zinc-950" />
      <motion.g
        key={`gantt-pop-${String(animateInKey ?? 'static')}`}
        initial={landingHeroBuild || reduceMotion ? false : { opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={
          landingHeroBuild || reduceMotion
            ? { duration: 0 }
            : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
        }
        style={{ transformOrigin: `${gutter + 8}px ${Math.max(8, barAreaTop + 6)}px` }}
        clipPath={`url(#${panelClipId})`}
      >
      {quarterRailXs.length ? (
        <g className="pointer-events-none" aria-hidden>
          {quarterRailXs.map((x, qi) => (
            <line
              key={`gantt-qgrid-${qi}-${x.toFixed(1)}`}
              x1={x}
              x2={x}
              y1={0}
              y2={svgHeight}
              className="stroke-muted-foreground"
              strokeWidth={0.65}
              strokeOpacity={0.075}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      ) : null}
      <g>
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'dotted_span' }> => m.kind === 'dotted_span')
            .map((m) => {
              const railStyle = m.railStyle ?? (m.icon === 'none' ? 'dotted' : 'dashed');
              const isDotted = railStyle === 'dotted';
              const pLine = wbPlanP(`dotline:${m.key}`, m.anchorYmd, `gantt-dot:${m.key}`);
              const pPhase = wbPlanP(`dotphase:${m.key}`, m.anchorYmd, `gantt-dot-ph:${m.key}`);
              const sx = Math.max(0.02, pLine);
              const gx = m.x0;
              const gy = m.midY;
              return (
                <g key={m.key}>
                  <g transform={`translate(${gx} ${gy}) scale(${sx} 1) translate(${-gx} ${-gy})`}>
                    <title>
                      {m.spanTitle?.trim()
                        ? m.spanTitle.trim()
                        : m.icon === 'hammer'
                          ? 'Build window (prep)'
                          : m.icon === 'flask'
                            ? 'Test / prep window'
                            : 'Prep connector'}
                    </title>
                    <line
                      x1={m.x0}
                      x2={m.x1}
                      y1={m.midY}
                      y2={m.midY}
                      fill="none"
                      className="stroke-zinc-500 dark:stroke-zinc-400"
                      strokeWidth={isDotted ? 1.1 : 1.15}
                      strokeDasharray={isDotted ? '0.01 4.6' : '3.5 3'}
                      strokeOpacity={(isDotted ? 0.62 : 0.92) * Math.min(1, 0.2 + pLine * 0.95)}
                      strokeLinecap={isDotted ? 'round' : 'butt'}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                  {m.phaseLabel?.trim() ? (
                    <text
                      x={(m.x0 + m.x1) / 2}
                      y={m.midY - 7}
                      textAnchor="middle"
                      dominantBaseline="auto"
                      fill="currentColor"
                      fontSize={9}
                      fontWeight={500}
                      opacity={(showPrepPhaseLabels ? 0.88 : 0) * Math.min(1, 0.15 + pPhase)}
                      style={{ letterSpacing: '-0.005em' }}
                      visibility={showPrepPhaseLabels ? 'visible' : 'hidden'}
                    >
                      {m.phaseLabel.trim()}
                    </text>
                  ) : null}
                </g>
              );
            }),
        )}
      </g>

      <g className="pointer-events-none">
        {schoolOverlaySpans.map((s) => {
          const schoolFillOp = Math.min(0.52, 0.12 + prefs.overlayHatchOpacity * 0.32);
          const schoolStrokeOp = Math.min(0.72, 0.28 + prefs.overlayHatchOpacity * 0.42);
          const pSch =
            (landingGanttDrawProgress(
              landingHeatmapOrganicSyncTick,
              landingOrganicMk,
              s.ymdStart,
              `gantt-sch:${s.key}:a`,
            ) +
              landingGanttDrawProgress(
                landingHeatmapOrganicSyncTick,
                landingOrganicMk,
                s.ymdEnd,
                `gantt-sch:${s.key}:b`,
              )) /
            2;
          const schMul = Math.min(1, 0.18 + pSch * 0.92);
          return (
            <g key={s.key}>
              <title>{`School holiday context: ${s.ymdStart}${s.ymdEnd !== s.ymdStart ? ` → ${s.ymdEnd}` : ''}`}</title>
              <rect
                x={s.x0}
                y={barAreaTop}
                width={Math.max(0, s.x1 - s.x0)}
                height={Math.max(0, svgHeight - barAreaTop - 1)}
                fill={`url(#${schoolHatchId})`}
                fillOpacity={schoolFillOp * schMul}
              />
              <rect
                x={s.x0}
                y={barAreaTop}
                width={Math.max(0, s.x1 - s.x0)}
                height={Math.max(0, svgHeight - barAreaTop - 1)}
                fill="none"
                className="stroke-zinc-400 dark:stroke-zinc-500"
                strokeWidth={1}
                strokeOpacity={schoolStrokeOp * schMul}
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </g>

      <g className="pointer-events-none">
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'tick' }> => m.kind === 'tick')
            .map((m) => {
              const p = wbPlanP(m.key, m.anchorYmd, `gantt-tk-glyph:${m.key}`);
              const cy = (m.y0 + m.y1) / 2;
              const sx = Math.max(0.02, p);
              const op = Math.min(1, 0.12 + p * 0.95);
              return (
                <g
                  key={`${m.key}-glyph`}
                  transform={`translate(${m.cx} ${cy}) scale(${sx} 1) translate(${-m.cx} ${-cy})`}
                  opacity={op}
                >
                  {m.tickStyle === 'dot' ? (
                    <circle
                      cx={m.cx}
                      cy={cy}
                      r={2.1}
                      className="fill-zinc-700 dark:fill-zinc-300"
                    />
                  ) : (
                    <line
                      x1={m.cx}
                      x2={m.cx}
                      y1={m.y0}
                      y2={m.y1}
                      className="stroke-zinc-600 dark:stroke-zinc-400"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              );
            }),
        )}
      </g>

      <g>
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'run_bar' }> => m.kind === 'run_bar')
            .map((m) => {
              const pGrow = wbPlanP(m.key, m.anchorYmd, `gantt-run:${m.key}`);
              const fullW = Math.max(0, m.w);
              const minW = Math.min(Math.max(2, m.h - 1), fullW, 8);
              const curW = minW + (fullW - minW) * pGrow;
              const rowOp = m.opacity * Math.min(1, 0.12 + pGrow * 0.95);
              return (
                <g key={m.key} opacity={rowOp}>
                  <title>{`${row.lane.kind === 'campaign' ? 'Campaign' : 'Tech'} live: ${row.lane.parentName}`}</title>
                  <rect x={m.x} y={m.y} width={curW} height={m.h} rx={1} fill={m.fill} />
                  {prefs.barHatchOpacity > 0.001 ? (
                    <rect
                      x={m.x}
                      y={m.y}
                      width={curW}
                      height={m.h}
                      rx={1}
                      fill={`url(#${barHatchId})`}
                      fillOpacity={prefs.barHatchOpacity}
                    />
                  ) : null}
                  <rect
                    x={m.x}
                    y={m.y}
                    width={curW}
                    height={m.h}
                    rx={1}
                    fill="none"
                    className="stroke-zinc-700/90 dark:stroke-zinc-300/80"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x={m.x + 0.5}
                    y={m.y + 0.5}
                    width={Math.max(0, curW - 1)}
                    height={Math.max(0, m.h - 1)}
                    rx={0.5}
                    fill="none"
                    className="stroke-white/25 dark:stroke-zinc-950/35"
                    strokeWidth={0.75}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            }),
        )}
      </g>

      <g className="pointer-events-none">
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'bracket_span' }> => m.kind === 'bracket_span')
            .map((m) => {
              const p = wbPlanP(m.key, m.anchorYmd, `gantt-br:${m.key}`);
              const bx0 = m.x0;
              const bmy = (m.yTop + m.yBot) / 2;
              const bsx = Math.max(0.02, p);
              return (
                <g
                  key={m.key}
                  opacity={Math.min(1, 0.15 + p * 0.92)}
                  transform={`translate(${bx0} ${bmy}) scale(${bsx} 1) translate(${-bx0} ${-bmy})`}
                >
                  <title>{Math.abs(m.x0 - m.x1) < 0.5 ? 'Offer codes expire' : 'Readiness gate (pre–go-live)'}</title>
                  <path
                    d={`M ${m.x0} ${m.yBot} L ${m.x0} ${m.yTop} L ${m.x1} ${m.yTop} L ${m.x1} ${m.yBot}`}
                    fill="none"
                    className="stroke-zinc-600 dark:stroke-zinc-400"
                    strokeWidth={1.15}
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            }),
        )}
      </g>

      <g className="pointer-events-none">
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'tick' }> => m.kind === 'tick')
            .map((m) => {
              const p = wbPlanP(`tktext:${m.key}`, m.anchorYmd, `gantt-tk-lbl:${m.key}`);
              return (
                <g key={m.key}>
                  {m.tickLabel?.trim() ? (
                    <text
                      x={m.cx}
                      y={m.y0 - 6}
                      textAnchor="middle"
                      dominantBaseline="auto"
                      fill="currentColor"
                      fontSize={9}
                      fontWeight={600}
                      opacity={(showTickAndDiamondLabels ? 0.92 : 0) * Math.min(1, 0.12 + p)}
                      style={{ letterSpacing: '-0.005em' }}
                      visibility={showTickAndDiamondLabels ? 'visible' : 'hidden'}
                    >
                      {m.tickLabel.trim()}
                    </text>
                  ) : null}
                </g>
              );
            }),
        )}
      </g>

      <g className="pointer-events-none">
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'diamond' }> => m.kind === 'diamond')
            .map((m) => {
              const pCirc = wbPlanP(m.key, m.anchorYmd, `gantt-dm:${m.key}`);
              const pLbl = wbPlanP(`dmtext:${m.key}`, m.anchorYmd, `gantt-dm-lbl:${m.key}`);
              const sc = Math.max(0.02, pCirc);
              const dop = Math.min(1, 0.12 + pCirc * 0.95);
              return (
                <g
                  key={m.key}
                  transform={`translate(${m.cx} ${m.cy}) scale(${sc}) translate(${-m.cx} ${-m.cy})`}
                  opacity={dop}
                >
                  <circle
                    cx={m.cx}
                    cy={m.cy}
                    r={Math.max(2.25, m.r - 1.25)}
                    className="fill-white stroke-zinc-950 dark:fill-white dark:stroke-zinc-50"
                    strokeWidth={0.75}
                    vectorEffect="non-scaling-stroke"
                  />
                  {m.diamondLabel?.trim() ? (
                    <text
                      x={m.cx}
                      y={m.cy - m.r - 6}
                      textAnchor="middle"
                      dominantBaseline="auto"
                      fill="currentColor"
                      fontSize={9}
                      fontWeight={600}
                      opacity={(showTickAndDiamondLabels ? 0.92 : 0) * Math.min(1, 0.12 + pLbl)}
                      style={{ letterSpacing: '-0.005em' }}
                      visibility={showTickAndDiamondLabels ? 'visible' : 'hidden'}
                    >
                      {m.diamondLabel.trim()}
                    </text>
                  ) : null}
                </g>
              );
            }),
        )}
      </g>

      <g className="pointer-events-none">
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'dotted_span' }> => m.kind === 'dotted_span')
            .filter((m) => m.icon !== 'none')
            .map((m) => {
              const cx = (m.x0 + m.x1) / 2;
              const pIco = wbPlanP(`ico:${m.key}`, m.anchorYmd, `gantt-ico:${m.key}`);
              const isPosLane =
                row.lane.kind === 'tech_programme' &&
                (/\bpos\b/i.test(row.lane.parentName) ||
                  /point\s*of\s*sale/i.test(row.lane.parentName) ||
                  /\bhoc\b/i.test(row.lane.parentName));
              const iconY =
                row.lane.kind === 'campaign' || isPosLane
                  ? m.midY - CHRONICLE_ICON_PX - CHRONICLE_ICON_ABOVE_LINE_PAD_PX
                  : m.midY - CHRONICLE_ICON_HALF;
              return (
                <g
                  key={`${m.key}-ico`}
                  transform={`translate(${cx - CHRONICLE_ICON_HALF}, ${iconY})`}
                  opacity={showChronicleIcons ? Math.min(1, 0.1 + pIco * 0.98) : 0}
                  visibility={showChronicleIcons ? 'visible' : 'hidden'}
                  aria-hidden
                >
                  <ChronicleIconMount icon={m.icon === 'hammer' ? 'hammer' : 'flask'} />
                </g>
              );
            }),
        )}
      </g>

      <g>
        {laneRows.map((row) => {
          const pLane = wbPlanP(
            `lane:${row.lane.id}`,
            row.lane.footprintStartYmd,
            `gantt-lane:${row.lane.id}`,
          );
          return (
            <text
              key={`${row.lane.id}-caption`}
              x={row.labelX}
              y={row.midY}
              dominantBaseline="middle"
              textAnchor="start"
              fill="currentColor"
              fontSize={LABEL_FONT_SIZE_PX}
              fontWeight={500}
              style={{ letterSpacing: '-0.01em' }}
              opacity={Math.min(1, 0.14 + pLane * 0.94)}
            >
              <title>{`${row.lane.kind === 'campaign' ? 'Campaign' : 'Tech programme'}: ${row.lane.parentName} (${row.lane.footprintStartYmd}${
                row.lane.footprintStartYmd === row.lane.footprintEndYmdInclusive ? '' : `–${row.lane.footprintEndYmdInclusive}`
              })`}</title>
              {programmeBarTrailingLabel(
                row.lane.parentName,
                row.lane.footprintStartYmd,
                row.lane.footprintEndYmdInclusive,
                showLaneCaptionDates,
              )}
            </text>
          );
        })}
      </g>

      <g className="pointer-events-none select-none">
        {schoolOverlaySpans.map((s) => {
          if (!showSchoolStripIcons || s.x1 - s.x0 < SCHOOL_STRIP_ICON_PX + 3) return null;
          const pSchIco =
            (landingGanttDrawProgress(
              landingHeatmapOrganicSyncTick,
              landingOrganicMk,
              s.ymdStart,
              `gantt-sch-ico:${s.key}:a`,
            ) +
              landingGanttDrawProgress(
                landingHeatmapOrganicSyncTick,
                landingOrganicMk,
                s.ymdEnd,
                `gantt-sch-ico:${s.key}:b`,
              )) /
            2;
          return (
            <g
              key={`${s.key}-school-ico`}
              transform={`translate(${s.x0 + 2}, ${barAreaTop + 2})`}
              className="text-zinc-700 dark:text-zinc-300"
              opacity={Math.min(1, 0.15 + pSchIco * 0.92)}
            >
              <title>{`School holiday: ${s.ymdStart}${s.ymdEnd !== s.ymdStart ? ` → ${s.ymdEnd}` : ''}`}</title>
              <svg width={SCHOOL_STRIP_ICON_PX} height={SCHOOL_STRIP_ICON_PX} viewBox="0 0 24 24" fill="none">
                {PALMTREE_PATH_DS.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            </g>
          );
        })}
      </g>

      {blackoutBandPx > 0 ? (
        <g className="pointer-events-none select-none">
          {blackoutSpans.map((s) => {
            const label = programmeBlackoutSpanLabel(blackouts, s.ymdStart, s.ymdEnd);
            const yamlEnv = deploymentBlackoutYamlEnvelopeForSpan(blackouts, s.ymdStart, s.ymdEnd);
            const yamlRange = yamlEnv
              ? formatDeploymentBlackoutIsoRange(yamlEnv.start, yamlEnv.end)
              : formatDeploymentBlackoutIsoRange(s.ymdStart, s.ymdEnd);
            const stripRange = formatDeploymentBlackoutIsoRange(s.ymdStart, s.ymdEnd);
            const viewNote =
              yamlEnv && (yamlEnv.start !== s.ymdStart || yamlEnv.end !== s.ymdEnd)
                ? ` In this strip: ${stripRange}.`
                : '';
            const pipe = 5;
            const spanW = s.x1 - s.x0;
            const showRibbonSnowflake = showBlackoutRibbonSnowflake && spanW >= RIBBON_BLACKOUT_ICON_PX + 2;
            const snowflakeTx = showRibbonSnowflake
              ? Math.min(
                  Math.max((s.x0 + s.x1) / 2 - RIBBON_BLACKOUT_ICON_HALF, s.x0 + 1),
                  s.x1 - 1 - RIBBON_BLACKOUT_ICON_PX,
                )
              : 0;
            const pBl = landingGanttDrawProgress(
              landingHeatmapOrganicSyncTick,
              landingOrganicMk,
              s.ymdStart,
              `gantt-blo:${s.key}`,
            );
            const blMul = Math.min(1, 0.16 + pBl * 0.92);
            const cxBl = (s.x0 + s.x1) / 2;
            const ribbonHx = Math.max(0.02, pBl);
            return (
              <g key={`bl-${s.key}`} opacity={blMul}>
                <title>{`Deployment blackout: ${yamlRange}.${viewNote} ${label}`}</title>
                <line
                  x1={s.x0}
                  y1={ribbonMidY - pipe}
                  x2={s.x0}
                  y2={ribbonMidY + pipe}
                  className="stroke-zinc-600 dark:stroke-zinc-400"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={s.x1}
                  y1={ribbonMidY - pipe}
                  x2={s.x1}
                  y2={ribbonMidY + pipe}
                  className="stroke-zinc-600 dark:stroke-zinc-400"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <g
                  transform={`translate(${cxBl} ${ribbonMidY}) scale(${ribbonHx} 1) translate(${-cxBl} ${-ribbonMidY})`}
                >
                  <line
                    x1={s.x0}
                    y1={ribbonMidY}
                    x2={s.x1}
                    y2={ribbonMidY}
                    className="stroke-zinc-500 dark:stroke-zinc-400"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                    strokeOpacity={0.9}
                  />
                </g>
                <line
                  x1={s.x0}
                  y1={barAreaTop}
                  x2={s.x0}
                  y2={svgHeight - 2}
                  className="stroke-zinc-500 dark:stroke-zinc-400"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                  strokeOpacity={0.85}
                />
                <line
                  x1={s.x1}
                  y1={barAreaTop}
                  x2={s.x1}
                  y2={svgHeight - 2}
                  className="stroke-zinc-500 dark:stroke-zinc-400"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                  strokeOpacity={0.85}
                />
                {showRibbonSnowflake ? (
                  <g
                    transform={`translate(${snowflakeTx}, ${ribbonMidY - RIBBON_BLACKOUT_ICON_HALF})`}
                    className="text-zinc-700 dark:text-zinc-300"
                    aria-hidden
                    opacity={Math.min(1, 0.12 + pBl * 0.95)}
                  >
                    <svg
                      width={RIBBON_BLACKOUT_ICON_PX}
                      height={RIBBON_BLACKOUT_ICON_PX}
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      {SNOWFLAKE_PATH_DS.map((d, i) => (
                        <path
                          key={i}
                          d={d}
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>
      ) : null}
      </motion.g>
    </svg>
  );
}
