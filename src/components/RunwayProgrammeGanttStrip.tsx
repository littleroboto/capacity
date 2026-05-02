import { useEffect, useId, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
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
import type { ProgrammeGanttChronicleIcon, ProgrammeGanttChronicleLane } from '@/lib/runwayProgrammeGanttModel';
import type { ProgrammeGanttDisplayPrefs } from '@/lib/runwayProgrammeGanttPrefs';

const LABEL_GAP_PX = 5;
const LABEL_FONT_SIZE_PX = 11;
const CHRONICLE_ICON_PX = 13;
const CHRONICLE_ICON_HALF = CHRONICLE_ICON_PX / 2;
/** Campaign hammer/flask: sit just above the dashed baseline (foreignObject top-left). */
const CHRONICLE_ICON_ABOVE_LINE_PAD_PX = 3;

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
    }
  | { kind: 'run_bar'; key: string; x: number; y: number; w: number; h: number; fill: string; opacity: number }
  | { kind: 'bracket_span'; key: string; x0: number; x1: number; yTop: number; yBot: number }
  | { kind: 'tick'; key: string; cx: number; y0: number; y1: number; tickLabel?: string; tickStyle?: 'line' | 'dot' }
  | { kind: 'diamond'; key: string; cx: number; cy: number; r: number; diamondLabel?: string };

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
}: RunwayProgrammeGanttStripProps) {
  const uid = useId().replace(/:/g, '');
  const schoolHatchId = `gantt-school-hatch-45-${uid}`;
  const barHatchId = `gantt-bar-hatch-45-${uid}`;
  const barTile = Math.max(2, Math.min(14, prefs.barHatchSpacingPx));
  const barMid = barTile / 2;

  const { clipStart, clipEnd, layout } = useMemo(() => {
    const layout = contributionStripYmdToCellLayout(placedCells, cellPx);
    const clipStart = contributionMeta.rangeStartYmd;
    const clipEnd = contributionMeta.rangeEndYmd;
    return { clipStart, clipEnd, layout };
  }, [placedCells, cellPx, contributionMeta.rangeStartYmd, contributionMeta.rangeEndYmd]);

  const { laneRows, svgHeight, schoolOverlaySpans, blackoutSpans, blackoutBandPx } = useMemo(() => {
    const { stripTopPadPx, barHeightPx, laneGapPx, stripBottomPadPx, barOpacity } = prefs;
    const stride = barHeightPx + laneGapPx;

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
    let i = 0;
    for (const lane of lanes) {
      const yRow = stripTopPadPx + blackoutBandPx + i * stride;
      const midY = yRow + barHeightPx / 2;
      const y0t = yRow + 3;
      const y1t = yRow + barHeightPx - 3;
      const marks: PlacedMark[] = [];
      let maxRightX = -Infinity;
      const isPosLane = lane.kind === 'tech_programme' && (/\bpos\b/i.test(lane.parentName) || /point\s*of\s*sale/i.test(lane.parentName));
      let posRunEdgeX0: number | null = null;
      let posRunEdgeX1: number | null = null;
      let posRunStartYmd: string | null = null;
      if (isPosLane) {
        const runMark = lane.marks.find((m): m is Extract<typeof m, { kind: 'run_bar' }> => m.kind === 'run_bar');
        if (runMark) {
          posRunStartYmd = runMark.startYmd;
          const runSpan = xSpanForInclusiveYmdRangeClipped(
            runMark.startYmd,
            runMark.endYmdInclusive,
            layout,
            clipStart,
            clipEnd,
          );
          if (runSpan) {
            posRunEdgeX0 = runSpan.x0;
            posRunEdgeX1 = runSpan.x1;
          }
        }
      }

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
          let x1 = cEnd ? cEnd.x + cEnd.cellPx / 2 : span.x1;
          const isLastPosPilot =
            isPosLane &&
            m.icon === 'none' &&
            m.railStyle === 'dashed' &&
            (m.title?.startsWith('Pilot phase') ?? false) &&
            posRunStartYmd != null &&
            nextYmd(m.endYmdInclusive) === posRunStartYmd &&
            posRunEdgeX0 != null;
          if (isLastPosPilot && posRunEdgeX0 != null) x1 = posRunEdgeX0;
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
          });
        } else if (m.kind === 'tick') {
          let cx = cellCenterX(m.ymd, layout);
          if (isPosLane && m.label === 'NDR' && posRunEdgeX0 != null) cx = posRunEdgeX0;
          if (isPosLane && m.label === 'NDC' && posRunEdgeX1 != null) cx = posRunEdgeX1;
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
          });
        } else if (m.kind === 'diamond') {
          const cx = cellCenterX(m.ymd, layout);
          if (cx == null) continue;
          maxRightX = Math.max(maxRightX, cx + 5);
          marks.push({ kind: 'diamond', key: `${lane.id}-dm-${m.ymd}`, cx, cy: midY, r: 4, diamondLabel: m.label });
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
      i += 1;
    }

    const n = laneRows.length;
    const bodyPx = n === 0 ? 0 : n * barHeightPx + (n - 1) * laneGapPx;
    const svgHeight = stripTopPadPx + blackoutBandPx + bodyPx + stripBottomPadPx;

    return { laneRows, svgHeight, schoolOverlaySpans, blackoutSpans, blackoutBandPx };
  }, [lanes, layout, clipStart, clipEnd, prefs, riskByDate, blackouts, cellPx]);

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

      <rect
        x={gutter}
        y={0.5}
        width={Math.max(0, gridWidth - gutter)}
        height={svgHeight - 1}
        rx={2}
        className="fill-zinc-50 stroke-zinc-300/90 dark:fill-zinc-950 dark:stroke-zinc-800"
        strokeWidth={1}
      />
      <g>
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'dotted_span' }> => m.kind === 'dotted_span')
            .map((m) => {
              const railStyle = m.railStyle ?? (m.icon === 'none' ? 'dotted' : 'dashed');
              const isDotted = railStyle === 'dotted';
              return (
                <g key={m.key}>
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
                  strokeOpacity={isDotted ? 0.62 : 0.92}
                  strokeLinecap={isDotted ? 'round' : 'butt'}
                  vectorEffect="non-scaling-stroke"
                />
                {m.phaseLabel?.trim() ? (
                  <text
                    x={(m.x0 + m.x1) / 2}
                    y={m.midY - 7}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fill="currentColor"
                    fontSize={9}
                    fontWeight={500}
                    opacity={0.88}
                    style={{ letterSpacing: '-0.005em' }}
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
          return (
            <g key={s.key}>
              <title>{`School holiday context: ${s.ymdStart}${s.ymdEnd !== s.ymdStart ? ` → ${s.ymdEnd}` : ''}`}</title>
              <rect
                x={s.x0}
                y={barAreaTop}
                width={Math.max(0, s.x1 - s.x0)}
                height={Math.max(0, svgHeight - barAreaTop - 1)}
                fill={`url(#${schoolHatchId})`}
                fillOpacity={schoolFillOp}
              />
              <rect
                x={s.x0}
                y={barAreaTop}
                width={Math.max(0, s.x1 - s.x0)}
                height={Math.max(0, svgHeight - barAreaTop - 1)}
                fill="none"
                className="stroke-zinc-400 dark:stroke-zinc-500"
                strokeWidth={1}
                strokeOpacity={schoolStrokeOp}
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </g>

      <g>
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'run_bar' }> => m.kind === 'run_bar')
            .map((m) => (
              <g key={m.key} opacity={m.opacity}>
                <title>{`${row.lane.kind === 'campaign' ? 'Campaign' : 'Tech'} live: ${row.lane.parentName}`}</title>
                <rect x={m.x} y={m.y} width={Math.max(0, m.w)} height={m.h} rx={1} fill={m.fill} />
                {prefs.barHatchOpacity > 0.001 ? (
                  <rect
                    x={m.x}
                    y={m.y}
                    width={Math.max(0, m.w)}
                    height={m.h}
                    rx={1}
                    fill={`url(#${barHatchId})`}
                    fillOpacity={prefs.barHatchOpacity}
                  />
                ) : null}
                <rect
                  x={m.x}
                  y={m.y}
                  width={Math.max(0, m.w)}
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
                  width={Math.max(0, m.w - 1)}
                  height={Math.max(0, m.h - 1)}
                  rx={0.5}
                  fill="none"
                  className="stroke-white/25 dark:stroke-zinc-950/35"
                  strokeWidth={0.75}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )),
        )}
      </g>

      <g className="pointer-events-none">
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'bracket_span' }> => m.kind === 'bracket_span')
            .map((m) => (
              <g key={m.key}>
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
            )),
        )}
      </g>

      <g className="pointer-events-none">
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'tick' }> => m.kind === 'tick')
            .map((m) => (
              <g key={m.key}>
                {m.tickStyle === 'dot' ? (
                  <circle
                    cx={m.cx}
                    cy={(m.y0 + m.y1) / 2}
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
                {m.tickLabel?.trim() ? (
                  <text
                    x={m.cx}
                    y={m.y0 - 6}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fill="currentColor"
                    fontSize={9}
                    fontWeight={600}
                    opacity={0.92}
                    style={{ letterSpacing: '-0.005em' }}
                  >
                    {m.tickLabel.trim()}
                  </text>
                ) : null}
              </g>
            )),
        )}
      </g>

      <g className="pointer-events-none">
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'diamond' }> => m.kind === 'diamond')
            .map((m) => (
              <g key={m.key}>
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
                    opacity={0.92}
                    style={{ letterSpacing: '-0.005em' }}
                  >
                    {m.diamondLabel.trim()}
                  </text>
                ) : null}
              </g>
            )),
        )}
      </g>

      <g className="pointer-events-none">
        {laneRows.flatMap((row) =>
          row.marks
            .filter((m): m is Extract<PlacedMark, { kind: 'dotted_span' }> => m.kind === 'dotted_span')
            .filter((m) => m.icon !== 'none')
            .map((m) => {
              const cx = (m.x0 + m.x1) / 2;
              const isPosLane =
                row.lane.kind === 'tech_programme' &&
                (/\bpos\b/i.test(row.lane.parentName) || /point\s*of\s*sale/i.test(row.lane.parentName));
              const iconY =
                row.lane.kind === 'campaign' || isPosLane
                  ? m.midY - CHRONICLE_ICON_PX - CHRONICLE_ICON_ABOVE_LINE_PAD_PX
                  : m.midY - CHRONICLE_ICON_HALF;
              return (
                <g key={`${m.key}-ico`} transform={`translate(${cx - CHRONICLE_ICON_HALF}, ${iconY})`}>
                  <ChronicleIconMount icon={m.icon === 'hammer' ? 'hammer' : 'flask'} />
                </g>
              );
            }),
        )}
      </g>

      <g>
        {laneRows.map((row) => (
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
          >
            <title>{`${row.lane.kind === 'campaign' ? 'Campaign' : 'Tech programme'}: ${row.lane.parentName} (${row.lane.footprintStartYmd}${
              row.lane.footprintStartYmd === row.lane.footprintEndYmdInclusive ? '' : `–${row.lane.footprintEndYmdInclusive}`
            })`}</title>
            {programmeBarTrailingLabel(
              row.lane.parentName,
              row.lane.footprintStartYmd,
              row.lane.footprintEndYmdInclusive,
              prefs.showBarTrailingCaption,
            )}
          </text>
        ))}
      </g>

      <g className="pointer-events-none select-none">
        {schoolOverlaySpans.map((s) => {
          if (s.x1 - s.x0 < SCHOOL_STRIP_ICON_PX + 3) return null;
          return (
            <g
              key={`${s.key}-school-ico`}
              transform={`translate(${s.x0 + 2}, ${barAreaTop + 2})`}
              className="text-zinc-700 dark:text-zinc-300"
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
            const showRibbonSnowflake = spanW >= RIBBON_BLACKOUT_ICON_PX + 2;
            const snowflakeTx = showRibbonSnowflake
              ? Math.min(
                  Math.max((s.x0 + s.x1) / 2 - RIBBON_BLACKOUT_ICON_HALF, s.x0 + 1),
                  s.x1 - 1 - RIBBON_BLACKOUT_ICON_PX,
                )
              : 0;
            return (
              <g key={`bl-${s.key}`}>
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
    </svg>
  );
}
