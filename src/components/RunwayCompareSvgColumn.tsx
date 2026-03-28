import { memo, useCallback, useMemo } from 'react';
import type { ViewModeId } from '@/lib/constants';
import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import {
  heatmapColorForViewMode,
  HEATMAP_RUNWAY_PAD_FILL,
  type HeatmapColorOpts,
} from '@/lib/riskHeatmapColors';
import { layoutCompareMarketColumnSvg } from '@/lib/runwayCompareSvgLayout';
import type { VerticalYearSection } from '@/lib/calendarQuarterLayout';
import { heatmapCellMetric } from '@/lib/runwayViewMetrics';

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

  return (
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
        const fill = !dateStr ? HEATMAP_RUNWAY_PAD_FILL : heatmapColorForViewMode(viewMode, metric, heatmapOpts);
        const dimOp = 1;
        const pastDimmed = dimPastDays && typeof dateStr === 'string' && dateStr < todayYmd;
        const opacity = pastDimmed ? 0.25 * dimOp : dimOp;
        const isToday = typeof dateStr === 'string' && dateStr === todayYmd;

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
              style={{ cursor: 'pointer' }}
              role="button"
              tabIndex={0}
              aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
              onClick={(e) => onCellActivate(e, dateStr, c.weekdayCol, c.w, c.h)}
              onKeyDown={(e) => onCellActivate(e, dateStr, c.weekdayCol, c.w, c.h)}
            />
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
  );
});
