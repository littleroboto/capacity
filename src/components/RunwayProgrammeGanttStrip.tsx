import { useId, useMemo } from 'react';
import type { DeploymentRiskBlackout } from '@/engine/types';
import type { RiskRow } from '@/engine/riskModel';
import type { ContributionStripLayoutMeta, PlacedRunwayCell } from '@/lib/calendarQuarterLayout';
import { CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W } from '@/lib/calendarQuarterLayout';
import { ymdInAnyDeploymentRiskBlackout } from '@/lib/deploymentRiskBlackoutCalendar';
import { enumerateIsoDatesInclusive } from '@/lib/runwayDateFilter';
import {
  contributionStripYmdToCellLayout,
  xSpanForInclusiveYmdRangeClipped,
} from '@/lib/runwayProgrammeGanttLayout';
import type { ProgrammeGanttBar } from '@/lib/runwayProgrammeGanttModel';
import type { ProgrammeGanttDisplayPrefs } from '@/lib/runwayProgrammeGanttPrefs';

const LABEL_GAP_PX = 5;
/** Rough advance for 11px UI sans labels (waterfall read). */
const LABEL_CHAR_ADVANCE_PX = 6.15;
const LABEL_FONT_SIZE_PX = 11;

export type RunwayProgrammeGanttStripProps = {
  marketKey: string;
  placedCells: readonly PlacedRunwayCell[];
  contributionMeta: ContributionStripLayoutMeta;
  cellPx: number;
  gap: number;
  width: number;
  riskByDate: ReadonlyMap<string, RiskRow>;
  bars: readonly ProgrammeGanttBar[];
  blackouts: readonly DeploymentRiskBlackout[] | null | undefined;
  prefs: ProgrammeGanttDisplayPrefs;
};

export function runwayProgrammeGanttStripHeightPx(prefs: ProgrammeGanttDisplayPrefs): number {
  const { stripTopPadPx, stripBottomPadPx, barHeightPx, laneGapPx } = prefs;
  return stripTopPadPx + barHeightPx + laneGapPx + barHeightPx + stripBottomPadPx;
}

export function RunwayProgrammeGanttStrip({
  marketKey,
  placedCells,
  contributionMeta,
  cellPx,
  gap: _gap,
  width,
  riskByDate,
  bars,
  blackouts,
  prefs,
}: RunwayProgrammeGanttStripProps) {
  const uid = useId().replace(/:/g, '');
  const hatchId = `gantt-hatch-45-${uid}`;

  const { clipStart, clipEnd, layout, campaignLaneY, techLaneY, svgHeight } = useMemo(() => {
    const layout = contributionStripYmdToCellLayout(placedCells, cellPx);
    const clipStart = contributionMeta.rangeStartYmd;
    const clipEnd = contributionMeta.rangeEndYmd;
    const { stripTopPadPx, barHeightPx, laneGapPx, stripBottomPadPx } = prefs;
    const campaignLaneY = stripTopPadPx;
    const techLaneY = stripTopPadPx + barHeightPx + laneGapPx;
    const svgHeight = stripTopPadPx + barHeightPx + laneGapPx + barHeightPx + stripBottomPadPx;
    return { clipStart, clipEnd, layout, campaignLaneY, techLaneY, svgHeight };
  }, [placedCells, cellPx, contributionMeta.rangeStartYmd, contributionMeta.rangeEndYmd, prefs]);

  const overlayRects = useMemo(() => {
    const out: { kind: 'school' | 'blackout'; x0: number; x1: number }[] = [];
    for (const ymd of enumerateIsoDatesInclusive(clipStart, clipEnd)) {
      const cell = layout.get(ymd);
      if (!cell) continue;
      const row = riskByDate.get(ymd);
      const inB = prefs.showBlackouts && ymdInAnyDeploymentRiskBlackout(ymd, blackouts ?? null);
      const inS = prefs.showSchoolHolidays && Boolean(row?.school_holiday_flag);
      if (!inB && !inS) continue;
      const kind: 'school' | 'blackout' = inB ? 'blackout' : 'school';
      out.push({ kind, x0: cell.x, x1: cell.x + cell.cellPx });
    }
    return out;
  }, [clipStart, clipEnd, layout, riskByDate, blackouts, prefs.showBlackouts, prefs.showSchoolHolidays]);

  const barRects = useMemo(() => {
    const { barHeightPx, barOpacity } = prefs;
    return bars
      .map((b) => {
        const span = xSpanForInclusiveYmdRangeClipped(b.startYmd, b.endYmdInclusive, layout, clipStart, clipEnd);
        if (!span) return null;
        const y = b.kind === 'campaign' ? campaignLaneY : techLaneY;
        const fill = b.kind === 'campaign' ? prefs.campaignFill : prefs.techFill;
        return {
          key: b.id,
          x: span.x0,
          y,
          w: span.x1 - span.x0,
          h: barHeightPx,
          fill,
          name: b.name,
          kind: b.kind,
          opacity: barOpacity,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      x: number;
      y: number;
      w: number;
      h: number;
      fill: string;
      name: string;
      kind: string;
      opacity: number;
    }>;
  }, [bars, layout, clipStart, clipEnd, prefs, campaignLaneY, techLaneY]);

  const contentWidth = useMemo(() => {
    let m = width;
    for (const b of barRects) {
      const textW = b.name.length * LABEL_CHAR_ADVANCE_PX + LABEL_GAP_PX + 4;
      m = Math.max(m, b.x + b.w + textW);
    }
    return Math.ceil(m + 4);
  }, [width, barRects]);

  const gutter = CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W;
  const labelCenterY = (b: (typeof barRects)[0]) => b.y + b.h / 2;

  return (
    <svg
      className="max-w-full shrink-0 font-sans text-zinc-700 dark:text-zinc-300"
      width={contentWidth}
      height={svgHeight}
      viewBox={`0 0 ${contentWidth} ${svgHeight}`}
      role="img"
      aria-label={`Programme timeline for ${marketKey}`}
    >
      <defs>
        <pattern
          id={hatchId}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
            <line
            x1="0"
            y1="0"
            x2="0"
            y2="10"
            className="stroke-zinc-400 dark:stroke-zinc-500"
            strokeWidth={1}
            strokeOpacity={prefs.overlayHatchOpacity}
          />
        </pattern>
      </defs>

      <rect
        x={gutter}
        y={0.5}
        width={Math.max(0, contentWidth - gutter)}
        height={svgHeight - 1}
        rx={0}
        className="fill-zinc-100 stroke-zinc-200 dark:fill-zinc-950 dark:stroke-zinc-800"
        strokeWidth={1}
      />

      <g className="pointer-events-none">
        {overlayRects.map((r, i) => (
          <g key={`${r.kind}-${i}-${r.x0}`}>
            <rect
              x={r.x0}
              y={1}
              width={r.x1 - r.x0}
              height={svgHeight - 2}
              fill={prefs.overlayColumnFill}
            />
            <rect
              x={r.x0}
              y={1}
              width={r.x1 - r.x0}
              height={svgHeight - 2}
              fill={`url(#${hatchId})`}
            />
          </g>
        ))}
      </g>

      <g>
        {barRects.map((b) => (
          <g key={b.key}>
            <title>{`${b.kind === 'campaign' ? 'Campaign' : 'Tech programme'}: ${b.name}`}</title>
            <rect
              x={b.x}
              y={b.y}
              width={Math.max(0, b.w)}
              height={b.h}
              rx={0}
              fill={b.fill}
              opacity={b.opacity}
            />
            <text
              x={b.x + b.w + LABEL_GAP_PX}
              y={labelCenterY(b)}
              dominantBaseline="middle"
              textAnchor="start"
              fill="currentColor"
              fontSize={LABEL_FONT_SIZE_PX}
              fontWeight={500}
              style={{ letterSpacing: '-0.01em' }}
            >
              {b.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
