import { memo, useCallback, useMemo } from 'react';
import { RunwayHeatmapEmergenceClip } from '@/components/RunwayHeatmapEmergenceClip';
import type { ViewModeId } from '@/lib/constants';
import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import { HEATMAP_RUNWAY_PAD_FILL, type HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { layoutCompareMarketColumnSvg } from '@/lib/runwayCompareSvgLayout';
import type { VerticalYearSection } from '@/lib/calendarQuarterLayout';
import { heatmapCellMetric, runwayHeatmapCellFillAndDim } from '@/lib/runwayViewMetrics';

type RunwayTipAnchor = { clientX: number; clientY: number };

export type RunwayCompareSvgColumnProps = {
  marketKey: string;
  sections: VerticalYearSection[];
  cellPx: number;
  gap: number;
  monthStripW: number;
  riskByDate: Map<string, RiskRow>;
  heatmapOpts: HeatmapColorOpts;
  riskTuning: RiskModelTuning;
  viewMode: ViewModeId;
  todayYmd: string;
  dimPastDays: boolean;
  /** First month in runway order — that month’s block gets Mo–Su headers (compare-all HTML parity). */
  firstCalendarMonthKey: string | null;
  openDayDetailsFromCell: (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => void;
  /** Landing / embed: visual-only cells (no click, keyboard, or detail popover). */
  interactionDisabled?: boolean;
  /** Gentle synced pulse on day cells in this inclusive YYYY-MM-DD range (e.g. landing AU callout). */
  pulseDateRange?: { ymdStart: string; ymdEnd: string };
  /** When true, pulse is skipped (matches global reduced-motion preference). */
  preferReducedMotion?: boolean;
  /** Remounts emergence when runway identity changes; defaults to `marketKey`. */
  emergeResetKey?: string;
  /** Extra delay before this column’s reveal (compare-all wave). */
  emergeStaggerMs?: number;
};

function svgClientPoint(e: React.MouseEvent | React.KeyboardEvent, fallbackW: number, fallbackH: number) {
  const cur = e.currentTarget as unknown as SVGGraphicsElement;
  const r = cur.getBoundingClientRect();
  return { clientX: r.left + fallbackW / 2, clientY: r.top + fallbackH / 2 };
}

export const RunwayCompareSvgColumn = memo(function RunwayCompareSvgColumn({
  marketKey,
  sections,
  cellPx,
  gap,
  monthStripW,
  riskByDate,
  heatmapOpts,
  riskTuning,
  viewMode,
  todayYmd,
  dimPastDays,
  firstCalendarMonthKey,
  openDayDetailsFromCell,
  interactionDisabled = false,
  pulseDateRange,
  preferReducedMotion = false,
  emergeResetKey,
  emergeStaggerMs = 0,
}: RunwayCompareSvgColumnProps) {
  const { width, height, cells, monthLabels, weekdayLabels } = useMemo(
    () => layoutCompareMarketColumnSvg(sections, cellPx, gap, monthStripW, firstCalendarMonthKey),
    [sections, cellPx, gap, monthStripW, firstCalendarMonthKey]
  );

  const onCellActivate = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent, dateStr: string | null, weekdayCol: number, cw: number, ch: number) => {
      if ('key' in e && e.key !== 'Enter' && e.key !== ' ') return;
      if ('key' in e) e.preventDefault();
      const { clientX, clientY } = 'clientX' in e && e.clientX ? e : svgClientPoint(e, cw, ch);
      openDayDetailsFromCell({ clientX, clientY }, dateStr, weekdayCol);
    },
    [openDayDetailsFromCell]
  );

  const emergeKey = emergeResetKey ?? marketKey;

  return (
    <RunwayHeatmapEmergenceClip
      resetKey={emergeKey}
      staggerMs={emergeStaggerMs}
      className="block shrink-0"
    >
    <svg
      className="block shrink-0 text-foreground"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Runway heatmap column ${marketKey}`}
    >
      <rect width={width} height={height} className="fill-transparent" aria-hidden />
      <g className="pointer-events-none select-none fill-muted-foreground" aria-hidden>
        {weekdayLabels.map((wd, wi) => (
          <text
            key={`${marketKey}-wd-${wi}-${wd.abbr}`}
            x={wd.x}
            y={wd.y}
            textAnchor="middle"
            style={{ fontSize: 9, fontWeight: 600, letterSpacing: '-0.02em' }}
          >
            <title>{wd.title}</title>
            {wd.abbr}
          </text>
        ))}
      </g>
      <g className="pointer-events-none select-none fill-foreground" aria-hidden>
        {monthLabels.map((lb, li) => (
          <text
            key={`${marketKey}-ml-${li}-${lb.text}-${lb.y}`}
            x={lb.x}
            y={lb.y}
            textAnchor="middle"
            className="text-[11px] font-semibold capitalize tracking-tighter"
            style={{ fontSize: 11 }}
          >
            {lb.text}
          </text>
        ))}
      </g>
      {cells.map((c, i) => {
        if (c.cell === false) return null;
        const dateStr = c.cell;
        const row = dateStr ? riskByDate.get(dateStr) : undefined;
        const metric = row ? heatmapCellMetric(row, viewMode, riskTuning) : undefined;
        const { fill, dimOpacity: dimOp } = !dateStr
          ? { fill: HEATMAP_RUNWAY_PAD_FILL, dimOpacity: 1 }
          : runwayHeatmapCellFillAndDim(viewMode, metric, heatmapOpts, row);
        const pastDimmed = dimPastDays && typeof dateStr === 'string' && dateStr < todayYmd;
        const opacity = pastDimmed ? 0.25 * dimOp : dimOp;
        const isToday = typeof dateStr === 'string' && dateStr === todayYmd;
        const inPulseRange =
          pulseDateRange != null &&
          typeof dateStr === 'string' &&
          dateStr >= pulseDateRange.ymdStart &&
          dateStr <= pulseDateRange.ymdEnd;
        const pulseLow = Math.max(0.2, opacity * 0.62);

        return (
          <g key={`${marketKey}-svg-${i}-${c.x}-${c.y}`}>
            <rect
              x={c.x}
              y={c.y}
              width={c.w}
              height={c.h}
              rx={3}
              ry={3}
              fill={fill}
              opacity={opacity}
              className="stroke-border/35"
              strokeWidth={0.5}
              style={interactionDisabled ? undefined : { cursor: 'pointer' }}
              role={interactionDisabled ? 'presentation' : 'button'}
              tabIndex={interactionDisabled ? undefined : 0}
              aria-hidden={interactionDisabled ? true : undefined}
              aria-label={
                interactionDisabled ? undefined : dateStr ? `Day details for ${dateStr}` : 'Day cell'
              }
              onClick={
                interactionDisabled
                  ? undefined
                  : (e) => onCellActivate(e, dateStr, c.weekdayCol, c.w, c.h)
              }
              onKeyDown={
                interactionDisabled
                  ? undefined
                  : (e) => onCellActivate(e, dateStr, c.weekdayCol, c.w, c.h)
              }
            >
              {inPulseRange && !preferReducedMotion ? (
                <animate
                  attributeName="opacity"
                  values={`${opacity};${pulseLow};${opacity}`}
                  keyTimes="0;0.5;1"
                  dur="1.05s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
                />
              ) : null}
            </rect>
            {isToday ? (
              <circle
                cx={c.x + c.w * 0.55}
                cy={c.y + c.h * 0.38}
                r={Math.max(1.8, c.w * 0.14)}
                className="fill-primary stroke-background"
                strokeWidth={0.75}
                pointerEvents="none"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
    </RunwayHeatmapEmergenceClip>
  );
});
