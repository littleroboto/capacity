import { memo, useCallback, useId, useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { parseDate } from '@/engine/calendar';
import { useRunwayHeatmapEmergence, runwayHeatmapEmergenceClipRect } from '@/hooks/useRunwayHeatmapEmergence';
import type { ViewModeId } from '@/lib/constants';
import type { RiskRow } from '@/engine/riskModel';
import type { DeploymentRiskBlackout } from '@/engine/types';
import { ymdInAnyDeploymentRiskBlackout } from '@/lib/deploymentRiskBlackoutCalendar';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import {
  CONTRIBUTION_STRIP_TOP_PAD,
  CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W,
  type ContributionStripLayoutMeta,
  type PlacedRunwayCell,
} from '@/lib/calendarQuarterLayout';
import { HEATMAP_RUNWAY_PAD_FILL, type HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import type { CompareSvgLayoutCell } from '@/lib/runwayCompareSvgLayout';
import {
  CONTRIBUTION_STRIP_QUARTER_RAIL_BOUNDARY_TICK_HALF_H_PX,
  CONTRIBUTION_STRIP_QUARTER_RAIL_LABEL_HALO_PX,
  layoutContributionStripRunwaySvg,
} from '@/lib/runwayCompareSvgLayout';
import { heatmapCellMetric, runwayHeatmapCellFillAndDim } from '@/lib/runwayViewMetrics';
import {
  effectiveLedgerFootprintOverlap,
  LEDGER_EMPTY_DAY_OPACITY_FACTOR,
  ledgerAttributionHeatmapMetric,
  ledgerAttributionNeutralFillHex,
  maxRawLedgerOverlapInMap,
} from '@/lib/runwayLedgerAttribution';
import {
  contributionDayIndexForYmd,
  contributionStripDayColumnCenterX,
} from '@/lib/runwayTechContributionOverloadHistogram';
import { formatDateYmd } from '@/lib/weekRunway';
import { useAtcStore } from '@/store/useAtcStore';

type RunwayTipAnchor = { clientX: number; clientY: number };

export type RunwayContributionStripSvgProps = {
  marketKey: string;
  placedCells: PlacedRunwayCell[];
  contributionMeta: ContributionStripLayoutMeta;
  cellPx: number;
  gap: number;
  width: number;
  height: number;
  riskByDate: Map<string, RiskRow>;
  heatmapOpts: HeatmapColorOpts;
  riskTuning: RiskModelTuning;
  viewMode: ViewModeId;
  todayYmd: string;
  dimPastDays: boolean;
  selectedDayYmd?: string | null;
  openDayDetailsFromCell: (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => void;
  emergeResetKey?: string;
  /** When false, weekday rail + month axis labels are omitted (stacked triple-lens: only bottom strip). */
  showAxisLabels?: boolean;
  /** Activity exclusions → per-day footprint (matches HTML heatmap / compare SVG column). */
  ledgerAttribution?: { overlapByDay: Map<string, number>; lens: Exclude<ViewModeId, 'code'> } | null;
  ledgerImplicitBaselineFootprint?: boolean;
  /** Pixel corner radius for day rects (clamped per cell so quarters stay valid). */
  cellRadiusPx?: number;
  deploymentRiskBlackouts?: readonly DeploymentRiskBlackout[] | null;
};

function svgClientPoint(e: MouseEvent | KeyboardEvent, fallbackW: number, fallbackH: number) {
  const cur = e.currentTarget as unknown as SVGGraphicsElement;
  const r = cur.getBoundingClientRect();
  return { clientX: r.left + fallbackW / 2, clientY: r.top + fallbackH / 2 };
}

/** Calendar day for a cell (including `null` payload cells) from strip geometry. */
function ymdForContributionCell(
  c: CompareSvgLayoutCell,
  cellPx: number,
  gap: number,
  gridStartYmd: string
): string {
  const stride = cellPx + gap;
  const w = Math.round((c.x - CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W) / stride);
  const d = Math.round((c.y - CONTRIBUTION_STRIP_TOP_PAD) / stride);
  const t0 = parseDate(gridStartYmd).getTime();
  return formatDateYmd(new Date(t0 + (w * 7 + d) * 86400000));
}

function monthStripeParity(ymd: string): 0 | 1 {
  const mo = parseInt(ymd.slice(5, 7), 10) - 1;
  const y = parseInt(ymd.slice(0, 4), 10);
  return ((y * 12 + mo) % 2) as 0 | 1;
}

/** Two near-neutral greys that alternate by calendar month. */
function monthStripeBand(theme: 'light' | 'dark', parity: 0 | 1): string {
  if (theme === 'dark') {
    return parity === 0 ? '#17191d' : '#14161c';
  }
  return parity === 0 ? '#f3f4f6' : '#eceef1';
}

export const RunwayContributionStripSvg = memo(function RunwayContributionStripSvg({
  marketKey,
  placedCells,
  contributionMeta,
  cellPx,
  gap,
  width,
  height,
  riskByDate,
  heatmapOpts,
  riskTuning,
  viewMode,
  todayYmd,
  dimPastDays,
  selectedDayYmd = null,
  openDayDetailsFromCell,
  emergeResetKey,
  showAxisLabels = true,
  ledgerAttribution = null,
  ledgerImplicitBaselineFootprint = true,
  cellRadiusPx = 3,
  deploymentRiskBlackouts = null,
}: RunwayContributionStripSvgProps) {
  const theme = useAtcStore((s) => s.theme);

  const ledgerRawOverlapMax = useMemo(
    () => (ledgerAttribution ? maxRawLedgerOverlapInMap(ledgerAttribution.overlapByDay) : 1),
    [ledgerAttribution],
  );

  const { cells, monthLabels, weekdayLabels, axisTicks, quarterLabels, quarterRailBoundaryTicks, yearLabels } =
    useMemo(
      () =>
        layoutContributionStripRunwaySvg({
          placedCells,
          cellPx,
          gap,
          width,
          height,
          meta: contributionMeta,
        }),
      [placedCells, cellPx, gap, width, height, contributionMeta]
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

  const selectedDayColumnX = useMemo(() => {
    if (!selectedDayYmd?.trim()) return null;
    const di = contributionDayIndexForYmd(contributionMeta, selectedDayYmd);
    if (di == null) return null;
    return contributionStripDayColumnCenterX(cellPx, gap, di);
  }, [selectedDayYmd, contributionMeta, cellPx, gap]);

  return (
    <svg
      className="block shrink-0 text-foreground"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Runway heatmap ${marketKey}; month, calendar quarter, and year labels under the grid with one row of ticks at period boundaries`}
    >
      <defs>
        <clipPath id={cellClipId} clipPathUnits="userSpaceOnUse">
          <rect x={clipR.x} y={clipR.y} width={clipR.w} height={clipR.h} />
        </clipPath>
      </defs>
      <rect width={width} height={height} className="fill-transparent" aria-hidden />
      {showAxisLabels ? (
        <>
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
          <g className="pointer-events-none select-none" aria-hidden>
            {axisTicks.map((tk, ti) => (
              <line
                key={`${marketKey}-axtk-${ti}-${tk.x}`}
                x1={tk.x}
                x2={tk.x}
                y1={tk.y1}
                y2={tk.y2}
                className="stroke-muted-foreground/75"
                strokeWidth={tk.strokeWidth ?? 1.25}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          <g className="pointer-events-none select-none fill-foreground" aria-hidden>
            {monthLabels.map((lb, li) => (
              <text
                key={`${marketKey}-ml-${li}-${lb.text}-${lb.x}`}
                x={lb.x}
                y={lb.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[11px] font-semibold capitalize tracking-tighter"
                style={{ fontSize: 11 }}
              >
                {lb.text}
              </text>
            ))}
          </g>
          <g className="pointer-events-none select-none" aria-hidden>
            {quarterLabels.map((lb, li) => {
              if (lb.railLeft == null || lb.railRight == null) return null;
              const halo = CONTRIBUTION_STRIP_QUARTER_RAIL_LABEL_HALO_PX;
              const y = lb.y;
              const leftEnd = lb.x - halo;
              const rightStart = lb.x + halo;
              const leftStart = lb.railLeft;
              const rightEnd = lb.railRight;
              const showLeft = leftEnd - leftStart >= 3;
              const showRight = rightEnd - rightStart >= 3;
              if (!showLeft && !showRight) return null;
              return (
                <g key={`${marketKey}-qrail-${li}-${lb.text}`}>
                  {showLeft ? (
                    <line
                      x1={leftStart}
                      x2={leftEnd}
                      y1={y}
                      y2={y}
                      className="stroke-muted-foreground/50"
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {showRight ? (
                    <line
                      x1={rightStart}
                      x2={rightEnd}
                      y1={y}
                      y2={y}
                      className="stroke-muted-foreground/50"
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </g>
              );
            })}
          </g>
          <g className="pointer-events-none select-none fill-foreground/90" aria-hidden>
            {quarterLabels.map((lb, li) => (
              <text
                key={`${marketKey}-ql-${li}-${lb.text}-${lb.x}`}
                x={lb.x}
                y={lb.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] font-semibold tracking-tight tabular-nums"
                style={{ fontSize: 10 }}
              >
                <title>{lb.title}</title>
                {lb.text}
              </text>
            ))}
          </g>
          <g className="pointer-events-none select-none" aria-hidden>
            {quarterRailBoundaryTicks.map((tk, ti) => {
              const h = CONTRIBUTION_STRIP_QUARTER_RAIL_BOUNDARY_TICK_HALF_H_PX;
              return (
                <line
                  key={`${marketKey}-qbnd-${ti}-${tk.x}`}
                  x1={tk.x}
                  x2={tk.x}
                  y1={tk.y - h}
                  y2={tk.y + h}
                  className="stroke-muted-foreground/60"
                  strokeWidth={1.25}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>
          <g className="pointer-events-none select-none fill-foreground/90" aria-hidden>
            {yearLabels.map((lb, li) => (
              <text
                key={`${marketKey}-yl-${li}-${lb.text}-${lb.x}`}
                x={lb.x}
                y={lb.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] font-semibold tracking-tight tabular-nums"
                style={{ fontSize: 10 }}
              >
                {lb.text}
              </text>
            ))}
          </g>
        </>
      ) : null}
      <g clipPath={`url(#${cellClipId})`}>
        {cells.map((c, i) => {
          if (c.cell === false) return null;
          const dateStr = c.cell;
          const row = dateStr ? riskByDate.get(dateStr) : undefined;
          const metric = row ? heatmapCellMetric(row, viewMode, riskTuning) : undefined;
          const { fill: baseFill, dimOpacity: dimOp } = !dateStr
            ? { fill: HEATMAP_RUNWAY_PAD_FILL, dimOpacity: 1 }
            : runwayHeatmapCellFillAndDim(viewMode, metric, heatmapOpts, row);
          const ymd =
            typeof dateStr === 'string' ? dateStr : ymdForContributionCell(c, cellPx, gap, contributionMeta.gridStartYmd);
          const band = monthStripeBand(theme, monthStripeParity(ymd));

          let overlap = 0;
          let rawLedger = 0;
          if (ledgerAttribution && dateStr) {
            rawLedger = ledgerAttribution.overlapByDay.get(dateStr) ?? 0;
            overlap = effectiveLedgerFootprintOverlap(rawLedger, ledgerImplicitBaselineFootprint);
          }
          let displayFill: string;
          if (ledgerAttribution && dateStr) {
            const lm = ledgerAttributionHeatmapMetric(metric, rawLedger, overlap, ledgerRawOverlapMax);
            if (lm === null) {
              displayFill = ledgerAttributionNeutralFillHex();
            } else if (row) {
              const boosted = runwayHeatmapCellFillAndDim(viewMode, lm, heatmapOpts, row).fill;
              displayFill = `color-mix(in srgb, ${boosted} 90%, ${band})`;
            } else {
              displayFill = band;
            }
          } else {
            displayFill = dateStr && row ? `color-mix(in srgb, ${baseFill} 90%, ${band})` : band;
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
            ymdInAnyDeploymentRiskBlackout(ymd, deploymentRiskBlackouts ?? undefined);
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
                fill={displayFill}
                opacity={opacity}
                className={isSelected ? 'stroke-primary' : 'stroke-border/35'}
                strokeWidth={
                  isSelected ? 1.75 : ledgerAttribution && overlap > 1 ? 1.25 : 0.5
                }
                aria-pressed={isSelected}
                style={{ cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                aria-label={`Day details for ${dateStr ?? ymd}${deployFreezeMark ? '; change-freeze window' : ''}`}
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
      {selectedDayColumnX != null ? (
        <line
          x1={selectedDayColumnX}
          x2={selectedDayColumnX}
          y1={0}
          y2={height}
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
