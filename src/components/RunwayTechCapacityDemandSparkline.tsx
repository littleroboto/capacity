import { useMemo } from 'react';
import { useReducedMotion } from 'motion/react';
import type { RiskRow } from '@/engine/riskModel';
import {
  CONTRIBUTION_STRIP_GRID_AXIS_GAP_PX,
  CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W,
  RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_CHART_PX,
  RUNWAY_TECH_SPARKLINE_STACK_PX,
} from '@/lib/calendarQuarterLayout';
import type { ContributionStripLayoutMeta } from '@/lib/calendarQuarterLayout';
import {
  CONTRIBUTION_STRIP_QUARTER_RAIL_BOUNDARY_TICK_HALF_H_PX,
  CONTRIBUTION_STRIP_QUARTER_RAIL_LABEL_HALO_PX,
  layoutContributionStripRunwayTimeAxisAbove,
} from '@/lib/runwayCompareSvgLayout';
import {
  computeContributionStripDailyCapacityBalance,
  contributionDayIndexForYmd,
  contributionStripDayColumnCenterX,
  contributionStripDaySparklineX,
} from '@/lib/runwayTechContributionOverloadHistogram';
import { cn } from '@/lib/utils';

const RS = {
  marker: 'hsl(var(--primary) / 0.85)',
} as const;

const CHART_H = RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_CHART_PX;
/** Placeholder / min block: chronology + chart (see `RUNWAY_TECH_SPARKLINE_STACK_PX`). */
const BLOCK_H = RUNWAY_TECH_SPARKLINE_STACK_PX;
/** Vertical padding inside the SVG so the trace does not touch the top/bottom edges. */
const PAD_Y = Math.round(CHART_H * 0.1);
/** Minimum `uMax − uMin` on the strip (share of cap) so BAU cadence is readable, not a flat hairline. */
const SCALE_UTIL_SPAN_FLOOR = 0.08;

const Y_AXIS_TICK_X0 = 14;
const Y_AXIS_TICK_X1 = 20;
const Y_AXIS_LABEL_ANCHOR_X = Y_AXIS_TICK_X0 - 2;
const LEFT_AXIS_OVERFLOW_PX = 14;

const DEFICIT_FILL = 'fill-[hsl(350_88%_40%)] dark:fill-[hsl(348_92%_58%)]';
const TIGHT_HEADROOM_FILL = 'fill-rose-500/[0.32] dark:fill-rose-400/[0.28]';
/** Utilization at or above this (and still ≤ 100% of caps) draws the “thin headroom” band up to the 100% line. */
const TIGHT_HEADROOM_UTIL_LOW = 0.86;

type SparkPt = { x: number; y: number };

function ribbonPathsBetweenBaseline(
  pts: SparkPt[],
  cy: number,
  test: (y: number) => boolean,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const ta = test(a.y);
    const tb = test(b.y);
    if (!ta && !tb) continue;
    const dy = b.y - a.y;
    if (ta && tb) {
      out.push(`M ${a.x} ${cy} L ${a.x} ${a.y} L ${b.x} ${b.y} L ${b.x} ${cy} Z`);
      continue;
    }
    if (Math.abs(dy) < 1e-9) continue;
    const xInt = a.x + ((cy - a.y) / dy) * (b.x - a.x);
    if (ta && !tb) {
      out.push(`M ${a.x} ${cy} L ${a.x} ${a.y} L ${xInt} ${cy} Z`);
    } else {
      out.push(`M ${xInt} ${cy} L ${b.x} ${b.y} L ${b.x} ${cy} Z`);
    }
  }
  return out;
}

/** y smaller than cap line = load above 100% of modeled caps (overload stroke). */
function zoneCap(y: number, yCap: number): 'headroom' | 'overload' | 'on' {
  if (y < yCap - 1e-6) return 'overload';
  if (y > yCap + 1e-6) return 'headroom';
  return 'on';
}

function subEdgesForCapBaseline(
  a: SparkPt,
  b: SparkPt,
  yCap: number
): Array<{ a: SparkPt; b: SparkPt; dotted: boolean }> {
  const za = zoneCap(a.y, yCap);
  const zb = zoneCap(b.y, yCap);
  if (za === 'headroom' && zb === 'headroom') return [{ a, b, dotted: true }];
  if (za === 'overload' && zb === 'overload') return [{ a, b, dotted: false }];
  if (za === 'on' && zb === 'on') return [{ a, b, dotted: false }];

  const atCrossing = (): SparkPt => {
    const dy = b.y - a.y;
    if (Math.abs(dy) < 1e-12) return { x: b.x, y: yCap };
    const t = (yCap - a.y) / dy;
    const u = Math.max(0, Math.min(1, t));
    return { x: a.x + u * (b.x - a.x), y: yCap };
  };

  if ((za === 'headroom' && zb === 'overload') || (za === 'overload' && zb === 'headroom')) {
    const m = atCrossing();
    if (za === 'headroom') {
      return [
        { a, b: m, dotted: true },
        { a: m, b, dotted: false },
      ];
    }
    return [
      { a, b: m, dotted: false },
      { a: m, b, dotted: true },
    ];
  }

  if (za === 'headroom' || zb === 'headroom') return [{ a, b, dotted: true }];
  return [{ a, b, dotted: false }];
}

function polylineRunsByCapBaseline(
  pts: SparkPt[],
  yCap: number
): Array<{ points: SparkPt[]; dotted: boolean }> {
  if (pts.length < 2) return [];
  const pieces: Array<{ a: SparkPt; b: SparkPt; dotted: boolean }> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    pieces.push(...subEdgesForCapBaseline(pts[i]!, pts[i + 1]!, yCap));
  }

  const runs: Array<{ points: SparkPt[]; dotted: boolean }> = [];
  const near = (p: SparkPt, q: SparkPt) => Math.abs(p.x - q.x) < 1e-4 && Math.abs(p.y - q.y) < 1e-4;

  for (const piece of pieces) {
    const last = runs[runs.length - 1];
    if (
      last &&
      last.dotted === piece.dotted &&
      last.points.length > 0 &&
      near(last.points[last.points.length - 1]!, piece.a)
    ) {
      last.points.push(piece.b);
    } else {
      runs.push({ dotted: piece.dotted, points: [piece.a, piece.b] });
    }
  }

  return runs.filter((r) => r.points.length >= 2);
}

function pathDFromPoints(pts: SparkPt[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i]!.x} ${pts[i]!.y}`;
  }
  return d;
}

/** Headroom band from the 100% line up to the trace when utilization is high but still on the “under cap” side of the line. */
function ribbonPathsTightHeadroomToCap(pts: SparkPt[], mask: boolean[], yCap: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (!mask[i] || !mask[i + 1]) continue;
    if (a.y <= yCap || b.y <= yCap) continue;
    out.push(`M ${a.x} ${yCap} L ${a.x} ${a.y} L ${b.x} ${b.y} L ${b.x} ${yCap} Z`);
  }
  return out;
}

export type RunwayTechCapacityDemandSparklineProps = {
  contributionMeta: ContributionStripLayoutMeta;
  cellPx: number;
  gap: number;
  riskByDate: Map<string, RiskRow>;
  width: number;
  selectedDayYmd?: string | null;
  className?: string;
  /**
   * When the activity ledger has no included rows **and** BAU baseline is off, hide the modeled tech trace
   * (matches empty heatmap); user can enable BAU to see repeating lab+Market-IT load on caps.
   */
  modelTraceSuppressed?: boolean;
  /** Landing / YAML preview: loop an x-axis reveal along the strip timeline. */
  landingMarketingSweepReveal?: boolean;
  /** Landing / YAML preview: rose fill between the trace and 100% when utilization is high but not overloaded. */
  landingMarketingTightCapacityFill?: boolean;
};

function yForUtilizationStroke(
  u: number,
  uMin: number,
  span: number,
  yTop: number,
  yBot: number
): number {
  const t = (u - uMin) / span;
  const tc = Math.min(1.08, Math.max(-0.06, t));
  return yBot - tc * (yBot - yTop);
}

function yForUtilizationCapLine(u: number, uMin: number, span: number, yTop: number, yBot: number): number {
  const t = (u - uMin) / span;
  const tc = Math.min(1, Math.max(0, t));
  return yBot - tc * (yBot - yTop);
}

/**
 * Daily strip-aligned trace of lab+team load vs effective capacity (one sample per calendar day on the grid).
 */
export function RunwayTechCapacityDemandSparkline({
  contributionMeta,
  cellPx,
  gap,
  riskByDate,
  width,
  selectedDayYmd = null,
  className,
  modelTraceSuppressed = false,
  landingMarketingSweepReveal = false,
  landingMarketingTightCapacityFill = false,
}: RunwayTechCapacityDemandSparklineProps) {
  const prefersReducedMotion = useReducedMotion();
  const gutter = CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W;

  const chronologyAbove = useMemo(
    () =>
      layoutContributionStripRunwayTimeAxisAbove({
        cellPx,
        gap,
        width,
        meta: contributionMeta,
      }),
    [cellPx, gap, width, contributionMeta],
  );

  const days = useMemo(
    () => computeContributionStripDailyCapacityBalance(contributionMeta, riskByDate),
    [contributionMeta, riskByDate],
  );

  const innerH = CHART_H - PAD_Y * 2;
  const centerY = PAD_Y + innerH / 2;
  const halfSpan = Math.max(12, innerH / 2 - 4);
  const yBandTop = centerY - halfSpan;
  const yBandBot = centerY + halfSpan;

  const modeledDays = useMemo(
    () => (!modelTraceSuppressed ? days.filter((d) => d.hasData) : []),
    [days, modelTraceSuppressed],
  );

  const uScale = useMemo(() => {
    if (!modeledDays.length) {
      return { uMin: 0, uMax: 1, span: 1 };
    }
    const us = modeledDays.map((d) => d.capacityUtilizationRatio);
    const uMin = Math.min(...us);
    const uMax = Math.max(...us);
    const span = Math.max(SCALE_UTIL_SPAN_FLOOR, uMax - uMin);
    return { uMin, uMax, span };
  }, [modeledDays]);

  const yCapPx = useMemo(() => {
    const { uMin, span } = uScale;
    const raw = yForUtilizationCapLine(1, uMin, span, yBandTop, yBandBot);
    return Math.min(yBandBot, Math.max(yBandTop, raw));
  }, [uScale, yBandTop, yBandBot]);

  const sparkPtsRawSvg = useMemo((): SparkPt[] => {
    const { uMin, span } = uScale;
    return days.map((d) => {
      const x = contributionStripDaySparklineX(cellPx, gap, d.dayIndex);
      const xo = x + LEFT_AXIS_OVERFLOW_PX;
      if (modelTraceSuppressed || !d.hasData) {
        return { x: xo, y: yBandBot };
      }
      const y = yForUtilizationStroke(d.capacityUtilizationRatio, uMin, span, yBandTop, yBandBot);
      return { x: xo, y };
    });
  }, [days, cellPx, gap, uScale, yBandTop, yBandBot, modelTraceSuppressed]);

  const deficitRibbonDsSvg = useMemo(
    () => ribbonPathsBetweenBaseline(sparkPtsRawSvg, yCapPx, (y) => y < yCapPx),
    [sparkPtsRawSvg, yCapPx],
  );

  const tightHeadroomMask = useMemo(() => {
    if (!landingMarketingTightCapacityFill) return null;
    return days.map((d) => {
      if (modelTraceSuppressed || !d.hasData) return false;
      const u = d.capacityUtilizationRatio;
      return u >= TIGHT_HEADROOM_UTIL_LOW && u <= 1 + 1e-9;
    });
  }, [days, modelTraceSuppressed, landingMarketingTightCapacityFill]);

  const tightRibbonDsSvg = useMemo(() => {
    if (!tightHeadroomMask) return [];
    return ribbonPathsTightHeadroomToCap(sparkPtsRawSvg, tightHeadroomMask, yCapPx);
  }, [tightHeadroomMask, sparkPtsRawSvg, yCapPx]);

  const sparkStrokeRuns = useMemo(
    () => polylineRunsByCapBaseline(sparkPtsRawSvg, yCapPx),
    [sparkPtsRawSvg, yCapPx],
  );

  const selX = useMemo(() => {
    if (!selectedDayYmd?.trim()) return null;
    const di = contributionDayIndexForYmd(contributionMeta, selectedDayYmd);
    if (di == null) return null;
    return contributionStripDayColumnCenterX(cellPx, gap, di);
  }, [selectedDayYmd, contributionMeta, cellPx, gap]);

  const anyModeledDay = useMemo(
    () => !modelTraceSuppressed && days.some((d) => d.hasData),
    [days, modelTraceSuppressed],
  );

  const hasOverload = useMemo(
    () => modeledDays.some((d) => d.capacityUtilizationRatio > 1 + 1e-9),
    [modeledDays],
  );

  const axisBandPct = Math.round(Math.min(250, uScale.span * 100));
  const yAxisTopLabel = 'Peak';
  const yAxisMidLabel = '100%';
  const yAxisBotLabel = 'Low';

  const softStackIn =
    landingMarketingSweepReveal &&
    !prefersReducedMotion &&
    width >= 24 &&
    contributionMeta.numWeeks >= 1;

  if (width < 24 || contributionMeta.numWeeks < 1) {
    return (
      <div
        className={cn('rounded-md border border-border/30 bg-muted/15 dark:border-border/40', className)}
        style={{ width, height: BLOCK_H }}
        aria-hidden
      />
    );
  }

  const xo = (x: number) => x + LEFT_AXIS_OVERFLOW_PX;

  const ariaChart = `Daily technology load as a share of effective lab and Market IT capacity along the strip; vertical scale stretches across the lowest and highest share in this window (span about ${axisBandPct} percentage points of cap); middle tick marks 100% of modeled caps; red fill only where load exceeds 100% of caps${
    landingMarketingTightCapacityFill ? '; rose fill where load is high but still at or below 100% of caps' : ''
  }; dotted stroke where there is headroom below 100%`;

  const ch = chronologyAbove.height;

  return (
    <div
      className={cn('flex select-none flex-col overflow-visible', className)}
      style={{ width, rowGap: CONTRIBUTION_STRIP_GRID_AXIS_GAP_PX }}
    >
      <div
        className={cn('flex flex-col', softStackIn && 'landing-sparkline-stack-in')}
      >
      <svg
        width={width + LEFT_AXIS_OVERFLOW_PX}
        height={ch}
        viewBox={`0 0 ${width + LEFT_AXIS_OVERFLOW_PX} ${ch}`}
        className="block max-w-none shrink-0 text-foreground"
        style={{ marginLeft: -LEFT_AXIS_OVERFLOW_PX }}
        role="presentation"
        aria-hidden
      >
        <g className="pointer-events-none select-none fill-foreground/90" aria-hidden>
          {chronologyAbove.yearLabels.map((lb, li) => (
            <text
              key={`spark-chrono-yl-${li}-${lb.text}-${lb.x}`}
              x={xo(lb.x)}
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
        <g className="pointer-events-none select-none" aria-hidden>
          {chronologyAbove.quarterLabels.map((lb, li) => {
            if (lb.railLeft == null || lb.railRight == null) return null;
            const halo = CONTRIBUTION_STRIP_QUARTER_RAIL_LABEL_HALO_PX;
            const yy = lb.y;
            const leftEnd = xo(lb.x) - halo;
            const rightStart = xo(lb.x) + halo;
            const leftStart = xo(lb.railLeft);
            const rightEnd = xo(lb.railRight);
            const showLeft = leftEnd - leftStart >= 3;
            const showRight = rightEnd - rightStart >= 3;
            if (!showLeft && !showRight) return null;
            return (
              <g key={`spark-chrono-qrail-${li}-${lb.text}`}>
                {showLeft ? (
                  <line
                    x1={leftStart}
                    x2={leftEnd}
                    y1={yy}
                    y2={yy}
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
                    y1={yy}
                    y2={yy}
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
          {chronologyAbove.quarterLabels.map((lb, li) => (
            <text
              key={`spark-chrono-ql-${li}-${lb.text}-${lb.x}`}
              x={xo(lb.x)}
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
          {chronologyAbove.quarterRailBoundaryTicks.map((tk, ti) => {
            const h = CONTRIBUTION_STRIP_QUARTER_RAIL_BOUNDARY_TICK_HALF_H_PX;
            return (
              <line
                key={`spark-chrono-qbnd-${ti}-${tk.x}`}
                x1={xo(tk.x)}
                x2={xo(tk.x)}
                y1={tk.y - h}
                y2={tk.y + h}
                className="stroke-muted-foreground/60"
                strokeWidth={1.25}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </g>
        <g className="pointer-events-none select-none fill-foreground" aria-hidden>
          {chronologyAbove.monthLabels.map((lb, li) => (
            <text
              key={`spark-chrono-ml-${li}-${lb.text}-${lb.x}`}
              x={xo(lb.x)}
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
          {chronologyAbove.axisTicks.map((tk, ti) => (
            <line
              key={`spark-chrono-tk-${ti}-${tk.x}`}
              x1={xo(tk.x)}
              x2={xo(tk.x)}
              y1={tk.y1}
              y2={tk.y2}
              className="stroke-muted-foreground/75"
              strokeWidth={tk.strokeWidth ?? 1.25}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {selX != null ? (
          <line
            x1={xo(selX)}
            x2={xo(selX)}
            y1={0}
            y2={ch}
            stroke={RS.marker}
            strokeWidth={1.75}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            opacity={0.88}
          />
        ) : null}
      </svg>
      <svg
        width={width + LEFT_AXIS_OVERFLOW_PX}
        height={CHART_H}
        viewBox={`0 0 ${width + LEFT_AXIS_OVERFLOW_PX} ${CHART_H}`}
        className="block max-w-none shrink-0 text-foreground"
        style={{ marginLeft: -LEFT_AXIS_OVERFLOW_PX }}
        role="img"
        aria-label={ariaChart}
      >
        <g className="text-muted-foreground" aria-hidden>
          <line
            x1={xo(gutter - 0.5)}
            x2={xo(gutter - 0.5)}
            y1={yBandTop}
            y2={yBandBot}
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            opacity={0.45}
          />
          <line
            x1={xo(Y_AXIS_TICK_X0)}
            x2={xo(Y_AXIS_TICK_X1)}
            y1={yBandTop}
            y2={yBandTop}
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          />
          <line
            x1={xo(Y_AXIS_TICK_X0)}
            x2={xo(Y_AXIS_TICK_X1)}
            y1={yCapPx}
            y2={yCapPx}
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          />
          <line
            x1={xo(Y_AXIS_TICK_X0)}
            x2={xo(Y_AXIS_TICK_X1)}
            y1={yBandBot}
            y2={yBandBot}
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          />
          <text
            x={xo(Y_AXIS_LABEL_ANCHOR_X)}
            y={yBandTop}
            dominantBaseline="central"
            textAnchor="end"
            fill="currentColor"
            style={{ fontSize: 9, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            <title>{`Highest share of lab+Market IT caps consumed in this strip (top of scaled band; span ≈ ${axisBandPct} pts of cap)`}</title>
            {yAxisTopLabel}
          </text>
          <text
            x={xo(Y_AXIS_LABEL_ANCHOR_X)}
            y={yCapPx}
            dominantBaseline="central"
            textAnchor="end"
            fill="currentColor"
            style={{ fontSize: 9, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            <title>100% of modeled lab and Market IT effective capacity</title>
            {yAxisMidLabel}
          </text>
          <text
            x={xo(Y_AXIS_LABEL_ANCHOR_X)}
            y={yBandBot}
            dominantBaseline="central"
            textAnchor="end"
            fill="currentColor"
            style={{ fontSize: 9, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            <title>{`Lowest share in this strip (bottom of scaled band; span ≈ ${axisBandPct} pts of cap)`}</title>
            {yAxisBotLabel}
          </text>
        </g>
        <g pointerEvents="none">
          {tightRibbonDsSvg.map((d, i) => (
            <path
              key={`tight-ribbon-${i}`}
              d={d}
              className={TIGHT_HEADROOM_FILL}
              fillOpacity={0.95}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {deficitRibbonDsSvg.map((d, i) => (
            <path
              key={`def-ribbon-${i}`}
              d={d}
              className={DEFICIT_FILL}
              fillOpacity={0.52}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {sparkStrokeRuns.map((run, i) => (
            <path
              key={`spark-run-${i}`}
              d={pathDFromPoints(run.points)}
              fill="none"
              className={run.dotted ? 'stroke-muted-foreground/45' : 'stroke-foreground/80'}
              strokeWidth={run.dotted ? 1.2 : 1.35}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              strokeDasharray={run.dotted ? '3 3' : undefined}
            />
          ))}
        </g>
        {!anyModeledDay ? (
          <text
            x={xo(width / 2)}
            y={centerY}
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-muted-foreground/85"
            style={{ fontSize: 11, fontWeight: 500 }}
          >
            {modelTraceSuppressed
              ? 'No tech baseline in strip — enable BAU or include rows'
              : 'No modeled days in strip'}
          </text>
        ) : null}
        {anyModeledDay && !hasOverload ? (
          <text
            x={xo(width / 2)}
            y={yBandTop + 10}
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-muted-foreground/75"
            style={{ fontSize: 10, fontWeight: 500 }}
          >
            No days over 100% of caps in this strip
          </text>
        ) : null}
        <line
          x1={xo(gutter)}
          x2={xo(width - 2)}
          y1={yCapPx}
          y2={yCapPx}
          className="text-muted-foreground"
          stroke="currentColor"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          opacity={0.55}
        />
        {selX != null ? (
          <line
            x1={xo(selX)}
            x2={xo(selX)}
            y1={2}
            y2={CHART_H - 2}
            stroke={RS.marker}
            strokeWidth={1.75}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            opacity={0.88}
          />
        ) : null}
      </svg>
      </div>
    </div>
  );
}
