import { memo, useCallback, useId, useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { useRunwayHeatmapEmergence, runwayHeatmapEmergenceClipRect } from '@/hooks/useRunwayHeatmapEmergence';
import type { ViewModeId } from '@/lib/constants';
import type { RiskRow } from '@/engine/riskModel';
import type { DeploymentRiskBlackout } from '@/engine/types';
import { ymdInAnyDeploymentRiskBlackout } from '@/lib/deploymentRiskBlackoutCalendar';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import { HEATMAP_RUNWAY_PAD_FILL, type HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { layoutQuarterGridRunwaySvg } from '@/lib/runwayCompareSvgLayout';
import {
  CALENDAR_MONTH_HEADER_H,
  CALENDAR_WEEKDAY_HEADER_H,
  type VerticalYearSection,
} from '@/lib/calendarQuarterLayout';
import { heatmapCellMetric, runwayHeatmapCellFillAndDim } from '@/lib/runwayViewMetrics';
import {
  effectiveLedgerFootprintOverlap,
  LEDGER_EMPTY_DAY_OPACITY_FACTOR,
  ledgerAttributionHeatmapMetric,
  ledgerAttributionNeutralFillHex,
  maxRawLedgerOverlapInMap,
} from '@/lib/runwayLedgerAttribution';

type RunwayTipAnchor = { clientX: number; clientY: number };

export type RunwayQuarterGridSvgProps = {
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
  /** Matches side-summary selection (e.g. default “today” on load). */
  selectedDayYmd?: string | null;
  openDayDetailsFromCell: (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => void;
  /** Remounts emergence when runway identity changes; defaults to `marketKey`. */
  emergeResetKey?: string;
  /** Activity exclusions → per-day footprint (same semantics as HTML heatmap cells). */
  ledgerAttribution?: { overlapByDay: Map<string, number>; lens: Exclude<ViewModeId, 'code'> } | null;
  ledgerImplicitBaselineFootprint?: boolean;
  cellRadiusPx?: number;
  /** Deployment Risk lens: change-freeze windows → diagonal on cells. */
  deploymentRiskBlackouts?: readonly DeploymentRiskBlackout[] | null;
};

function svgClientPoint(e: MouseEvent | KeyboardEvent, fallbackW: number, fallbackH: number) {
  const cur = e.currentTarget as unknown as SVGGraphicsElement;
  const r = cur.getBoundingClientRect();
  return { clientX: r.left + fallbackW / 2, clientY: r.top + fallbackH / 2 };
}

export const RunwayQuarterGridSvg = memo(function RunwayQuarterGridSvg({
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
  selectedDayYmd = null,
  openDayDetailsFromCell,
  emergeResetKey,
  ledgerAttribution = null,
  ledgerImplicitBaselineFootprint = true,
  cellRadiusPx = 3,
  deploymentRiskBlackouts = null,
}: RunwayQuarterGridSvgProps) {
  const { width, height, cells, monthLabels, weekdayLabels, yearLabels, quarterLabels } = useMemo(
    () => layoutQuarterGridRunwaySvg(sections, cellPx, gap, monthStripW),
    [sections, cellPx, gap, monthStripW]
  );

  const onCellActivate = useCallback(
    (e: MouseEvent | KeyboardEvent, dateStr: string | null, weekdayCol: number, cw: number, ch: number) => {
      if ('key' in e && e.key !== 'Enter' && e.key !== ' ') return;
      if ('key' in e) e.preventDefault();
      const { clientX, clientY } = 'clientX' in e && e.clientX ? e : svgClientPoint(e, cw, ch);
      openDayDetailsFromCell({ clientX, clientY }, dateStr, weekdayCol);
    },
    [openDayDetailsFromCell]
  );

  const emergeKey = emergeResetKey ?? marketKey;
  const insetTopPct = useRunwayHeatmapEmergence(emergeKey);
  const cellClipId = useId().replace(/:/g, '');
  const clipR = runwayHeatmapEmergenceClipRect(width, height, insetTopPct);

  const ledgerRawOverlapMax = useMemo(
    () => (ledgerAttribution ? maxRawLedgerOverlapInMap(ledgerAttribution.overlapByDay) : 1),
    [ledgerAttribution],
  );

  const selectedDayGuide = useMemo(() => {
    if (!selectedDayYmd) return null;
    let hit: (typeof cells)[number] | undefined;
    for (const c of cells) {
      if (c.cell === selectedDayYmd) {
        hit = c;
        break;
      }
    }
    if (!hit) return null;
    const cx = hit.x + hit.w / 2;
    const monthPrefix = selectedDayYmd.slice(0, 7);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of cells) {
      if (typeof c.cell !== 'string') continue;
      if (c.cell.slice(0, 7) !== monthPrefix) continue;
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y + c.h);
    }
    if (!Number.isFinite(minY)) {
      return { cx, y0: hit.y, y1: hit.y + hit.h };
    }
    const y0 = minY - CALENDAR_MONTH_HEADER_H - CALENDAR_WEEKDAY_HEADER_H;
    return { cx, y0: Math.max(0, y0), y1: maxY };
  }, [cells, selectedDayYmd]);

  return (
    <svg
      className="block shrink-0 text-foreground"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Runway heatmap ${marketKey}`}
    >
      <defs>
        <clipPath id={cellClipId} clipPathUnits="userSpaceOnUse">
          <rect x={clipR.x} y={clipR.y} width={clipR.w} height={clipR.h} />
        </clipPath>
      </defs>
      <rect width={width} height={height} className="fill-transparent" aria-hidden />
      <g className="pointer-events-none select-none fill-foreground" aria-hidden>
        {yearLabels.map((yl, i) => (
          <text
            key={`${marketKey}-y-${i}-${yl.text}`}
            x={yl.x}
            y={yl.y}
            textAnchor="middle"
            className="text-lg font-bold tabular-nums tracking-tight"
            style={{ fontSize: 18, fontWeight: 700 }}
          >
            {yl.text}
          </text>
        ))}
      </g>
      <g className="pointer-events-none select-none fill-muted-foreground" aria-hidden>
        {quarterLabels.map((ql, i) => (
          <text
            key={`${marketKey}-q-${i}-${ql.text}`}
            x={ql.x}
            y={ql.y}
            textAnchor="middle"
            className="text-sm font-extrabold tabular-nums tracking-tight"
            style={{ fontSize: 14, fontWeight: 800 }}
          >
            <title>{ql.title}</title>
            {ql.text}
          </text>
        ))}
      </g>
      <g className="pointer-events-none select-none fill-muted-foreground" aria-hidden>
        {weekdayLabels.map((wd, wi) => (
          <text
            key={`${marketKey}-wd-${wi}-${wd.abbr}-${wd.x}-${wd.y}`}
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
            key={`${marketKey}-ml-${li}-${lb.text}-${lb.x}`}
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
      <g clipPath={`url(#${cellClipId})`}>
      {cells.map((c, i) => {
        if (c.cell === false) return null;
        const dateStr = c.cell;
        const row = dateStr ? riskByDate.get(dateStr) : undefined;
        const metric = row ? heatmapCellMetric(row, viewMode, riskTuning) : undefined;
        const { fill: baseFill, dimOpacity: dimOp } = !dateStr
          ? { fill: HEATMAP_RUNWAY_PAD_FILL, dimOpacity: 1 }
          : runwayHeatmapCellFillAndDim(viewMode, metric, heatmapOpts, row);
        let fill = baseFill;
        let overlap = 0;
        if (ledgerAttribution && dateStr) {
          const raw = ledgerAttribution.overlapByDay.get(dateStr) ?? 0;
          overlap = effectiveLedgerFootprintOverlap(raw, ledgerImplicitBaselineFootprint);
          const lm = ledgerAttributionHeatmapMetric(metric, raw, overlap, ledgerRawOverlapMax);
          fill =
            lm === null
              ? ledgerAttributionNeutralFillHex()
              : runwayHeatmapCellFillAndDim(viewMode, lm, heatmapOpts, row).fill;
        }
        const pastDimmed = dimPastDays && typeof dateStr === 'string' && dateStr < todayYmd;
        const ledgerEmptyNonOverlap = Boolean(ledgerAttribution && dateStr && overlap === 0);
        const opacity =
          (pastDimmed ? 0.25 * dimOp : dimOp) * (ledgerEmptyNonOverlap ? LEDGER_EMPTY_DAY_OPACITY_FACTOR : 1);
        const isToday = typeof dateStr === 'string' && dateStr === todayYmd;
        const isSelected = typeof dateStr === 'string' && dateStr === selectedDayYmd;
        const rr = Math.min(cellRadiusPx, c.w / 2, c.h / 2);
        const deployFreezeMark =
          viewMode === 'market_risk' &&
          typeof dateStr === 'string' &&
          ymdInAnyDeploymentRiskBlackout(dateStr, deploymentRiskBlackouts ?? undefined);
        const freezeStroke = Math.max(0.85, Math.min(2.6, cellPx * 0.11));

        return (
          <g key={`${marketKey}-svg-${i}-${c.x}-${c.y}`}>
            <rect
              x={c.x}
              y={c.y}
              width={c.w}
              height={c.h}
              rx={rr}
              ry={rr}
              fill={fill}
              opacity={opacity}
              className={isSelected ? 'stroke-primary' : 'stroke-border/35'}
              strokeWidth={
                isSelected ? 1.75 : ledgerAttribution && overlap > 1 ? 1.25 : 0.5
              }
              aria-pressed={isSelected}
              style={{ cursor: 'pointer' }}
              role="button"
              tabIndex={0}
              aria-label={
                dateStr
                  ? `Day details for ${dateStr}${deployFreezeMark ? '; change-freeze window' : ''}`
                  : 'Day cell'
              }
              onClick={(e) => onCellActivate(e, dateStr, c.weekdayCol, c.w, c.h)}
              onKeyDown={(e) => onCellActivate(e, dateStr, c.weekdayCol, c.w, c.h)}
            />
            {deployFreezeMark ? (
              <line
                x1={c.x}
                y1={c.y + c.h}
                x2={c.x + c.w}
                y2={c.y}
                className="pointer-events-none stroke-foreground/55"
                strokeWidth={freezeStroke}
                opacity={opacity}
              />
            ) : null}
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
      </g>
      {selectedDayGuide ? (
        <line
          x1={selectedDayGuide.cx}
          x2={selectedDayGuide.cx}
          y1={selectedDayGuide.y0}
          y2={selectedDayGuide.y1}
          className="pointer-events-none"
          stroke="hsl(var(--primary) / 0.85)"
          strokeWidth={1.75}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
          opacity={0.88}
        />
      ) : null}
    </svg>
  );
});
