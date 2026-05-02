import { memo, useCallback, useId, useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { ContributionStripAxisChrome } from '@/components/ContributionStripAxisChrome';
import { useReducedMotion } from 'motion/react';
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
import { layoutContributionStripRunwaySvg } from '@/lib/runwayCompareSvgLayout';
import {
  layeredHeatmapCellMetric,
  organicHeatmapCellLayerIndex,
} from '@/lib/runwayHeatmapOrganicLayers';
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
import { cn } from '@/lib/utils';
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
  /** Extra delay before this strip’s emergence (e.g. stagger stacked lenses left-to-right in time). */
  emergeStaggerMs?: number;
  /** When false, weekday rail + month axis labels are omitted (stacked triple-lens: only bottom strip). */
  showAxisLabels?: boolean;
  /** Activity exclusions → per-day footprint (matches HTML heatmap / compare SVG column). */
  ledgerAttribution?: { overlapByDay: Map<string, number>; lens: Exclude<ViewModeId, 'code'> } | null;
  ledgerImplicitBaselineFootprint?: boolean;
  /** Pixel corner radius for day rects (clamped per cell so quarters stay valid). */
  cellRadiusPx?: number;
  deploymentRiskBlackouts?: readonly DeploymentRiskBlackout[] | null;
  /**
   * Disable vertical clip emergence and build cell colour in organic layers (hash-staggered timing,
   * smooth fill transitions).
   */
  landingStaggerCellPulse?: boolean;
  /** Required when `landingStaggerCellPulse` is true. */
  organicLayerTick?: number;
  /** When true, omit the dashed day column line (e.g. triple-lens uses a parent overlay line). */
  suppressSelectionColumnLine?: boolean;
};

function svgClientPoint(e: MouseEvent | KeyboardEvent, fallbackW: number, fallbackH: number) {
  const cur = e.currentTarget as unknown as SVGGraphicsElement;
  const r = cur.getBoundingClientRect();
  return { clientX: r.left + fallbackW / 2, clientY: r.top + fallbackH / 2 };
}

function domClientPoint(e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>, cw: number, ch: number) {
  const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
  return { clientX: r.left + cw / 2, clientY: r.top + ch / 2 };
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
  emergeStaggerMs = 0,
  showAxisLabels = true,
  ledgerAttribution = null,
  ledgerImplicitBaselineFootprint = true,
  cellRadiusPx = 3,
  deploymentRiskBlackouts = null,
  landingStaggerCellPulse = false,
  organicLayerTick,
  suppressSelectionColumnLine = false,
}: RunwayContributionStripSvgProps) {
  const theme = useAtcStore((s) => s.theme);
  const reduceMotion = useReducedMotion();

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

  const onDomCellActivate = useCallback(
    (e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>, dateStr: string | null, weekdayCol: number, cw: number, ch: number) => {
      if ('key' in e && e.key !== 'Enter' && e.key !== ' ') return;
      if ('key' in e) e.preventDefault();
      const { clientX, clientY } =
        'clientX' in e && e.clientX ? { clientX: e.clientX, clientY: e.clientY } : domClientPoint(e, cw, ch);
      openDayDetailsFromCell({ clientX, clientY }, dateStr, weekdayCol);
    },
    [openDayDetailsFromCell]
  );

  const emergeKey = emergeResetKey ?? marketKey;
  const pulseOn = landingStaggerCellPulse && !reduceMotion;
  const organicOn = pulseOn && organicLayerTick != null;
  const insetTopPct = useRunwayHeatmapEmergence(emergeKey, {
    staggerMs: emergeStaggerMs,
    disabled: pulseOn,
  });
  const cellClipId = useId().replace(/:/g, '');
  const clipR = runwayHeatmapEmergenceClipRect(width, height, insetTopPct);

  const selectedDayColumnX = useMemo(() => {
    if (!selectedDayYmd?.trim()) return null;
    const di = contributionDayIndexForYmd(contributionMeta, selectedDayYmd);
    if (di == null) return null;
    return contributionStripDayColumnCenterX(cellPx, gap, di);
  }, [selectedDayYmd, contributionMeta, cellPx, gap]);

  const axisChrome = (
    <ContributionStripAxisChrome
      marketKey={marketKey}
      showAxisLabels={showAxisLabels}
      width={width}
      height={height}
      weekdayLabels={weekdayLabels}
      axisTicks={axisTicks}
      monthLabels={monthLabels}
      quarterLabels={quarterLabels}
      quarterRailBoundaryTicks={quarterRailBoundaryTicks}
      yearLabels={yearLabels}
    />
  );

  const selectedColumnLine =
    selectedDayColumnX != null && !suppressSelectionColumnLine ? (
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
    ) : null;

  const ariaStrip = `Runway heatmap ${marketKey}; month, calendar quarter, and year labels under the grid with one row of ticks at period boundaries`;

  function renderHeatmapCells(asDom: boolean) {
    return cells.map((c, i) => {
      if (c.cell === false) return null;
      const dateStr = c.cell;
      const row = dateStr ? riskByDate.get(dateStr) : undefined;
      const layerIdx =
        organicOn && dateStr
          ? organicHeatmapCellLayerIndex({
              tick: organicLayerTick!,
              marketKey,
              dateYmd: dateStr,
            })
          : 4;
      const metric = row
        ? organicOn
          ? layeredHeatmapCellMetric(row, viewMode, riskTuning, layerIdx)
          : heatmapCellMetric(row, viewMode, riskTuning)
        : undefined;
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
        viewMode === 'market_risk' && ymdInAnyDeploymentRiskBlackout(ymd, deploymentRiskBlackouts ?? undefined);
      const freezeStroke = Math.max(0.85, Math.min(2.6, cellPx * 0.11));

      const dayAria = `Day details for ${dateStr ?? ymd}${deployFreezeMark ? '; change-freeze window' : ''}`;

      if (asDom) {
        const ringClass = isSelected
          ? 'ring-2 ring-primary ring-inset'
          : ledgerAttribution && overlap > 1
            ? 'ring-[1.25px] ring-border/35 ring-inset'
            : 'ring-[0.5px] ring-border/35 ring-inset';

        return (
          <div
            key={`${marketKey}-dom-${i}-${c.x}-${c.y}`}
            className="absolute"
            style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
          >
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                borderRadius: rr,
              }}
            >
              <div
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={dayAria}
                className={cn('size-full cursor-pointer outline-none', ringClass)}
                style={{
                  borderRadius: rr,
                  backgroundColor: displayFill,
                  opacity,
                  transition: 'background-color 0.55s ease, box-shadow 0.45s ease',
                }}
                onClick={(e) => onDomCellActivate(e, dateStr, c.weekdayCol, c.w, c.h)}
                onKeyDown={(e) => onDomCellActivate(e, dateStr, c.weekdayCol, c.w, c.h)}
              />
            </div>
            {deployFreezeMark ? (
              <svg
                className="pointer-events-none absolute inset-0 overflow-visible"
                style={{ opacity, borderRadius: rr }}
                width={c.w}
                height={c.h}
                viewBox={`0 0 ${c.w} ${c.h}`}
                aria-hidden
              >
                <line
                  x1={0}
                  y1={c.h}
                  x2={c.w}
                  y2={0}
                  stroke="white"
                  strokeOpacity={0.92}
                  strokeWidth={freezeStroke}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : null}
            {isToday ? (
              <svg
                className="pointer-events-none absolute inset-0 overflow-visible"
                style={{ opacity }}
                width={c.w}
                height={c.h}
                viewBox={`0 0 ${c.w} ${c.h}`}
                aria-hidden
              >
                <circle
                  cx={c.w * 0.55}
                  cy={c.h * 0.38}
                  r={Math.max(1.8, c.w * 0.14)}
                  className="fill-primary stroke-background"
                  strokeWidth={0.75}
                />
              </svg>
            ) : null}
          </div>
        );
      }

      return (
        <g key={`${marketKey}-svg-${i}-${c.x}-${c.y}`}>
          <g>
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
              strokeWidth={isSelected ? 1.75 : ledgerAttribution && overlap > 1 ? 1.25 : 0.5}
              aria-pressed={isSelected}
              style={{
                cursor: 'pointer',
                ...(organicOn ? { transition: 'fill 0.55s ease, stroke 0.45s ease' } : {}),
              }}
              role="button"
              tabIndex={0}
              aria-label={dayAria}
              onClick={(e) => onCellActivate(e, dateStr, c.weekdayCol, c.w, c.h)}
              onKeyDown={(e) => onCellActivate(e, dateStr, c.weekdayCol, c.w, c.h)}
            />
          </g>
          {deployFreezeMark ? (
            <line
              x1={c.x}
              y1={c.y + c.h}
              x2={c.x + c.w}
              y2={c.y}
              className="pointer-events-none"
              stroke="white"
              strokeOpacity={0.92}
              strokeWidth={freezeStroke}
              opacity={opacity}
              vectorEffect="non-scaling-stroke"
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
    });
  }

  if (pulseOn) {
    return (
      <div
        className="relative block shrink-0 text-foreground"
        style={{ width, height }}
        role="img"
        aria-label={ariaStrip}
      >
        <svg
          className="pointer-events-none absolute inset-0 z-0 block text-foreground"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden
        >
          {axisChrome}
        </svg>
        <div key={emergeKey} className="absolute inset-0 z-[1]">
          {renderHeatmapCells(true)}
        </div>
        <svg
          className="pointer-events-none absolute inset-0 z-[2] block text-foreground"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden
        >
          {selectedColumnLine}
        </svg>
      </div>
    );
  }

  return (
    <svg
      className="block shrink-0 text-foreground"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaStrip}
    >
      <defs>
        <clipPath id={cellClipId} clipPathUnits="userSpaceOnUse">
          <rect x={clipR.x} y={clipR.y} width={clipR.w} height={clipR.h} />
        </clipPath>
      </defs>
      {axisChrome}
      <g clipPath={`url(#${cellClipId})`} key="heatmap-cells">
        {renderHeatmapCells(false)}
      </g>
      {selectedColumnLine}
    </svg>
  );
});
