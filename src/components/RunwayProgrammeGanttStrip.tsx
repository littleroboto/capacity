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
  const hatchBlackoutId = `gantt-hatch-b-${uid}`;
  const hatchSchoolId = `gantt-hatch-s-${uid}`;

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
        const stroke = b.kind === 'campaign' ? prefs.campaignStroke : prefs.techStroke;
        return {
          key: b.id,
          x: span.x0,
          y,
          w: span.x1 - span.x0,
          h: barHeightPx,
          fill,
          stroke,
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
      stroke: string;
      name: string;
      kind: string;
      opacity: number;
    }>;
  }, [bars, layout, clipStart, clipEnd, prefs, campaignLaneY, techLaneY]);

  const gutter = CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W;

  return (
    <svg
      className="max-w-full shrink-0 text-foreground"
      width={width}
      height={svgHeight}
      viewBox={`0 0 ${width} ${svgHeight}`}
      role="img"
      aria-label={`Programme timeline for ${marketKey}`}
    >
      <defs>
        <pattern
          id={hatchBlackoutId}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(32)"
        >
          <rect
            x="0"
            y="-1"
            width="2.2"
            height="8"
            fill="rgb(9 9 11)"
            fillOpacity={prefs.blackoutHatchOpacity}
          />
        </pattern>
        <pattern
          id={hatchSchoolId}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-42)"
        >
          <rect
            x="0"
            y="-1"
            width="1.8"
            height="7"
            fill="rgb(91 33 182)"
            fillOpacity={prefs.schoolHatchOpacity}
          />
        </pattern>
      </defs>

      {/* Baseline track */}
      <rect
        x={gutter}
        y={0.5}
        width={Math.max(0, width - gutter)}
        height={svgHeight - 1}
        rx="6"
        className="fill-muted/15 stroke-border/50"
        strokeWidth={1}
      />

      {/* Day column overlays (same x as heatmap cells) */}
      <g className="pointer-events-none">
        {overlayRects.map((r, i) => (
          <g key={`${r.kind}-${i}-${r.x0}`}>
            <rect
              x={r.x0}
              y={1}
              width={r.x1 - r.x0}
              height={svgHeight - 2}
              fill={r.kind === 'blackout' ? prefs.blackoutFill : prefs.schoolFill}
              fillOpacity={r.kind === 'blackout' ? 0.95 : 0.85}
            />
            <rect
              x={r.x0}
              y={1}
              width={r.x1 - r.x0}
              height={svgHeight - 2}
              fill={`url(#${r.kind === 'blackout' ? hatchBlackoutId : hatchSchoolId})`}
              opacity={0.9}
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
              rx="3"
              fill={b.fill}
              stroke={b.stroke}
              strokeWidth={1}
              opacity={b.opacity}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}
