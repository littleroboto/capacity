import { useCallback, useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { RiskRow } from '@/engine/riskModel';
import { DEFAULT_RISK_TUNING, type RiskModelTuning } from '@/engine/riskModelTuning';
import {
  CONTRIBUTION_STRIP_GRID_AXIS_GAP_PX,
  CONTRIBUTION_STRIP_TIME_AXIS_STACK_H,
  CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W,
  RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_CHART_PX,
  RUNWAY_TECH_SPARKLINE_LEGEND_BELOW_CHART_PX,
} from '@/lib/calendarQuarterLayout';
import type { ContributionStripLayoutMeta } from '@/lib/calendarQuarterLayout';
import {
  CONTRIBUTION_STRIP_QUARTER_RAIL_BOUNDARY_TICK_HALF_H_PX,
  CONTRIBUTION_STRIP_QUARTER_RAIL_LABEL_HALO_PX,
  layoutContributionStripRunwayTimeAxisAbove,
} from '@/lib/runwayCompareSvgLayout';
import {
  layeredHeatmapCellMetric,
  organicHeatmapCellLayerIndex,
} from '@/lib/runwayHeatmapOrganicLayers';
import {
  computeContributionStripDailyCapacityBalance,
  contributionDayIndexForYmd,
  contributionStripDayColumnCenterX,
  contributionStripDaySparklineX,
} from '@/lib/runwayTechContributionOverloadHistogram';
import type { HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import {
  buildGanttLensOverlayU01Series,
  movingAverageForModeledDays,
} from '@/lib/runwayGanttLensOverlaySeries';
import { heatmapCellMetric } from '@/lib/runwayViewMetrics';
import {
  loadSparklineTripleSeriesVisibility,
  saveSparklineTripleSeriesVisibility,
  type SparklineTripleSeriesKey,
} from '@/lib/runwaySparklineSeriesVisibility';
import { cn } from '@/lib/utils';

const RS = {
  marker: 'hsl(var(--primary) / 0.85)',
} as const;

/** Minimum `uMax − uMin` on the strip (share of cap) so BAU cadence is readable, not a flat hairline. */
const SCALE_UTIL_SPAN_FLOOR = 0.08;
/** Programme Gantt unified three-line chart: centered moving average window (modeled days only). */
const GANTT_TRIPLE_MOVING_AVERAGE_WINDOW = 7;
/** Per-trace vertical span floor (tech ratios): keeps a flat week from collapsing to a hairline. */
const GANTT_TRIPLE_TECH_SPAN_FLOOR = 0.08;
/** Per-trace span floor (restaurant / risk 0–1 display scalars): same intent as strip lens sparklines. */
const GANTT_TRIPLE_LENS_SPAN_FLOOR = 0.06;

const Y_AXIS_TICK_X0 = 14;
const Y_AXIS_TICK_X1 = 20;
const Y_AXIS_LABEL_ANCHOR_X = Y_AXIS_TICK_X0 - 2;
/** Extra width left of the strip for High/Low labels + margin (~14px wider than legacy 14). */
const LEFT_AXIS_OVERFLOW_PX = 28;

function SparklineLegendLineSwatch({
  className,
  dashed,
}: {
  className: string;
  dashed?: boolean;
}) {
  return (
    <svg width={14} height={10} viewBox="0 0 14 10" className="shrink-0 overflow-visible" aria-hidden>
      <line
        x1={0}
        y1={5}
        x2={14}
        y2={5}
        fill="none"
        className={className}
        strokeWidth={dashed ? 1.2 : 2}
        strokeLinecap="round"
        strokeDasharray={dashed ? '3 3' : undefined}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Tech utilization / tech demand trace (single- and triple-line). */
const SPARKLINE_TECH_STROKE_SOLID = 'stroke-blue-600 dark:stroke-blue-400';
/** Single-line mode: dotted segments below 100% cap — still blue family. */
const SPARKLINE_TECH_STROKE_HEADROOM = 'stroke-blue-500/55 dark:stroke-blue-400/48';
/** Store / in-restaurant trading lens overlay (triple-line). */
const SPARKLINE_STORE_TRADING_STROKE = 'stroke-emerald-600 dark:stroke-emerald-400';
/** Deployment risk lens overlay (triple-line). */
const SPARKLINE_DEPLOYMENT_RISK_STROKE = 'stroke-rose-700 dark:stroke-rose-400';

const DEFICIT_FILL = 'fill-[hsl(350_88%_40%)] dark:fill-[hsl(348_92%_58%)]';
const TIGHT_HEADROOM_FILL = 'fill-rose-500/[0.32] dark:fill-rose-400/[0.28]';
/** Utilization at or above this (and still ≤ 100% of caps) draws the “thin headroom” band up to the 100% line. */
const TIGHT_HEADROOM_UTIL_LOW = 0.86;

type SparkPt = { x: number; y: number };

type DayWithTrace = ReturnType<typeof computeContributionStripDailyCapacityBalance>[number] & {
  uTrace: number;
};

/**
 * Odd window ≥ 3: centered mean of `uTrace` over modeled (`hasData`) neighbors only.
 * Leaves `hasData: false` days unchanged (flat baseline segment).
 */
function movingAverageUTraceForModeledDays(days: readonly DayWithTrace[], window: number): number[] {
  const n = days.length;
  const out = days.map((d) => d.uTrace);
  if (window < 3 || window % 2 === 0 || n === 0) return out;
  const half = (window - 1) / 2;
  for (let i = 0; i < n; i += 1) {
    if (!days[i]!.hasData) continue;
    let sum = 0;
    let cnt = 0;
    for (let k = -half; k <= half; k += 1) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      if (!days[j]!.hasData) continue;
      sum += days[j]!.uTrace;
      cnt += 1;
    }
    if (cnt > 0) out[i] = sum / cnt;
  }
  return out;
}

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
  /** When true, omit dashed selection lines (parent draws one overlay through the stack). */
  suppressSelectionColumnLine?: boolean;
  /**
   * Workbench: same tick + per-day hash as tech heatmap cells — trace amplitude scales with layered
   * combined metric until the intro finishes (axis stays from full utilization).
   */
  organicLayerTick?: number;
  /** Hash salt for {@link organicHeatmapCellLayerIndex}; use the same key as the combined tech strip. */
  organicLayerMarketKey?: string;
  /**
   * When set with {@link landingMarketingSweepReveal}, delay the stack-in CSS until the organic
   * tick reaches this value (homepage: sparkline eases in after Gantt has started drawing).
   */
  landingSparklineStackInMinOrganicTick?: number;
  /**
   * Odd window ≥ 3: smooth displayed utilization (centered moving average over modeled days only).
   * Keeps underlying model and axis span from raw ratios; softens single-day jitter in the stroke and fills.
   */
  sparklineUtilSmoothWindow?: number;
  riskTuning?: RiskModelTuning;
  /**
   * Programme Gantt: optional unified chart — tech utilization, restaurant, and deployment risk in one strip with
   * fixed 7-day smoothing; each trace is vertically stretched from its own in-window min/max (qualitative shapes).
   * Merged from prefs in {@link RunwayProgrammeGanttBlock}.
   */
  ganttLensOverlays?: {
    unifiedThreeLine: boolean;
    heatmapOptsTrading: HeatmapColorOpts;
    heatmapOptsRisk: HeatmapColorOpts;
    organicLayerMarketKeyTrading: string;
    organicLayerMarketKeyRisk: string;
  };
  /**
   * Chart SVG height in px (viewBox height for the utilization plot). Workbench uses the default
   * {@link RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_CHART_PX}; programme Gantt passes a smaller value for a squished Y band.
   */
  chartSvgHeightPx?: number;
  /** Extra px between the chronology SVG and the chart SVG (programme Gantt uses ~30px). */
  chartContentMarginTopPx?: number;
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
  suppressSelectionColumnLine = false,
  organicLayerTick,
  organicLayerMarketKey,
  landingSparklineStackInMinOrganicTick,
  sparklineUtilSmoothWindow,
  riskTuning = DEFAULT_RISK_TUNING,
  ganttLensOverlays,
  chartSvgHeightPx = RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_CHART_PX,
  chartContentMarginTopPx = 0,
}: RunwayTechCapacityDemandSparklineProps) {
  const chartH = chartSvgHeightPx;
  const padY = Math.round(chartH * 0.1);
  const blockStackH =
    CONTRIBUTION_STRIP_TIME_AXIS_STACK_H +
    CONTRIBUTION_STRIP_GRID_AXIS_GAP_PX +
    chartContentMarginTopPx +
    chartH +
    RUNWAY_TECH_SPARKLINE_LEGEND_BELOW_CHART_PX;
  const prefersReducedMotion = useReducedMotion();
  const [tripleSeriesVisible, setTripleSeriesVisible] = useState(() => loadSparklineTripleSeriesVisibility());
  const setTripleSeriesVis = useCallback((key: SparklineTripleSeriesKey, value: boolean) => {
    setTripleSeriesVisible((prev) => {
      const next = { ...prev, [key]: value };
      saveSparklineTripleSeriesVisibility(next);
      return next;
    });
  }, []);
  const organicTraceOn =
    organicLayerTick != null &&
    organicLayerMarketKey != null &&
    organicLayerMarketKey.length > 0 &&
    !prefersReducedMotion;
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

  const innerH = chartH - padY * 2;
  const centerY = padY + innerH / 2;
  const halfSpan = Math.max(12, innerH / 2 - 4);
  const yBandTop = centerY - halfSpan;
  const yBandBot = centerY + halfSpan;

  const modeledDays = useMemo(
    () => (!modelTraceSuppressed ? days.filter((d) => d.hasData) : []),
    [days, modelTraceSuppressed],
  );

  /** Display utilization (may scale down during organic intro); axis span still from full ratios. */
  const daysForTrace = useMemo(() => {
    if (!organicTraceOn) {
      return days.map((d) => ({ ...d, uTrace: d.capacityUtilizationRatio }));
    }
    return days.map((d) => {
      if (modelTraceSuppressed || !d.hasData) {
        return { ...d, uTrace: d.capacityUtilizationRatio };
      }
      const row = riskByDate.get(d.ymd);
      if (!row) return { ...d, uTrace: d.capacityUtilizationRatio };
      const layerIdx = organicHeatmapCellLayerIndex({
        tick: organicLayerTick!,
        marketKey: organicLayerMarketKey!,
        dateYmd: d.ymd,
      });
      const mFull = heatmapCellMetric(row, 'combined', riskTuning);
      const mLayer = layeredHeatmapCellMetric(row, 'combined', riskTuning, layerIdx);
      const uFull = d.capacityUtilizationRatio;
      const scale = mFull > 1e-9 ? Math.min(1, Math.max(0, mLayer / mFull)) : 0;
      return { ...d, uTrace: uFull * scale };
    });
  }, [
    days,
    modelTraceSuppressed,
    organicTraceOn,
    organicLayerTick,
    organicLayerMarketKey,
    riskByDate,
    riskTuning,
  ]);

  const utilSmoothedForDisplay = useMemo(() => {
    const w = sparklineUtilSmoothWindow;
    if (w == null || w < 3 || w % 2 === 0) return null;
    return movingAverageUTraceForModeledDays(daysForTrace, w);
  }, [daysForTrace, sparklineUtilSmoothWindow]);

  const daysForSparkDisplay = useMemo((): DayWithTrace[] => {
    if (!utilSmoothedForDisplay) return daysForTrace;
    return daysForTrace.map((d, i) => ({ ...d, uTrace: utilSmoothedForDisplay[i]! }));
  }, [daysForTrace, utilSmoothedForDisplay]);

  const ganttTripleUnified =
    Boolean(ganttLensOverlays?.unifiedThreeLine) && !modelTraceSuppressed && ganttLensOverlays != null;

  const tripleLinePack = useMemo(() => {
    if (!ganttTripleUnified || !ganttLensOverlays) return null;
    const go = ganttLensOverlays;
    const n = days.length;
    const has = days.map((d) => d.hasData);
    const w = GANTT_TRIPLE_MOVING_AVERAGE_WINDOW;
    const techRaw = daysForTrace.map((d) => d.uTrace);
    const techSm = movingAverageForModeledDays(techRaw, has, w);
    const restRaw = buildGanttLensOverlayU01Series(
      days,
      riskByDate,
      'in_store',
      go.heatmapOptsTrading,
      riskTuning,
      organicLayerTick,
      go.organicLayerMarketKeyTrading,
      prefersReducedMotion,
      sparklineUtilSmoothWindow,
      'none',
    );
    const riskRaw = buildGanttLensOverlayU01Series(
      days,
      riskByDate,
      'market_risk',
      go.heatmapOptsRisk,
      riskTuning,
      organicLayerTick,
      go.organicLayerMarketKeyRisk,
      prefersReducedMotion,
      sparklineUtilSmoothWindow,
      'none',
    );
    const restSm = movingAverageForModeledDays(restRaw, has, w);
    const riskSm = movingAverageForModeledDays(riskRaw, has, w);

    const qualScale = (uArr: number[], spanFloor: number): { uMin: number; span: number } | null => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < n; i += 1) {
        if (!has[i]) continue;
        lo = Math.min(lo, uArr[i]!);
        hi = Math.max(hi, uArr[i]!);
      }
      if (!Number.isFinite(lo)) return null;
      const span = Math.max(spanFloor, hi - lo);
      return { uMin: lo, span };
    };

    const techQ = qualScale(techSm, GANTT_TRIPLE_TECH_SPAN_FLOOR);
    const restQ = qualScale(restSm, GANTT_TRIPLE_LENS_SPAN_FLOOR);
    const riskQ = qualScale(riskSm, GANTT_TRIPLE_LENS_SPAN_FLOOR);
    if (!techQ || !restQ || !riskQ) return null;

    const toPts = (uArr: number[], q: { uMin: number; span: number }): SparkPt[] =>
      days.map((d, i) => {
        const x = contributionStripDaySparklineX(cellPx, gap, d.dayIndex) + LEFT_AXIS_OVERFLOW_PX;
        if (!d.hasData) return { x, y: yBandBot };
        return { x, y: yForUtilizationStroke(uArr[i]!, q.uMin, q.span, yBandTop, yBandBot) };
      });
    const techPts = toPts(techSm, techQ);
    const restPts = toPts(restSm, restQ);
    const riskPts = toPts(riskSm, riskQ);
    const y100Raw =
      1 >= techQ.uMin - 1e-9 && 1 <= techQ.uMin + techQ.span + 1e-9
        ? yForUtilizationCapLine(1, techQ.uMin, techQ.span, yBandTop, yBandBot)
        : null;
    return {
      techQ,
      restQ,
      riskQ,
      techPts,
      restPts,
      riskPts,
      y100: y100Raw != null ? Math.min(yBandBot, Math.max(yBandTop, y100Raw)) : null,
    };
  }, [
    ganttTripleUnified,
    ganttLensOverlays,
    days,
    daysForTrace,
    riskByDate,
    riskTuning,
    organicLayerTick,
    prefersReducedMotion,
    sparklineUtilSmoothWindow,
    cellPx,
    gap,
    yBandTop,
    yBandBot,
  ]);

  const uScale = useMemo(() => {
    if (tripleLinePack) {
      const { techQ } = tripleLinePack;
      return { uMin: techQ.uMin, uMax: techQ.uMin + techQ.span, span: techQ.span };
    }
    if (!modeledDays.length) {
      return { uMin: 0, uMax: 1, span: 1 };
    }
    const us = modeledDays.map((d) => d.capacityUtilizationRatio);
    const uMin = Math.min(...us);
    const uMax = Math.max(...us);
    const span = Math.max(SCALE_UTIL_SPAN_FLOOR, uMax - uMin);
    return { uMin, uMax, span };
  }, [tripleLinePack, modeledDays]);

  const yCapPx = useMemo(() => {
    if (tripleLinePack?.y100 != null) return tripleLinePack.y100;
    if (tripleLinePack) return (yBandTop + yBandBot) / 2;
    const { uMin, span } = uScale;
    const raw = yForUtilizationCapLine(1, uMin, span, yBandTop, yBandBot);
    return Math.min(yBandBot, Math.max(yBandTop, raw));
  }, [tripleLinePack, uScale, yBandTop, yBandBot]);

  const sparkPtsRawSvg = useMemo((): SparkPt[] => {
    if (tripleLinePack) return tripleLinePack.techPts;
    const { uMin, span } = uScale;
    return daysForSparkDisplay.map((d) => {
      const x = contributionStripDaySparklineX(cellPx, gap, d.dayIndex);
      const xo = x + LEFT_AXIS_OVERFLOW_PX;
      if (modelTraceSuppressed || !d.hasData) {
        return { x: xo, y: yBandBot };
      }
      const y = yForUtilizationStroke(d.uTrace, uMin, span, yBandTop, yBandBot);
      return { x: xo, y };
    });
  }, [tripleLinePack, daysForSparkDisplay, cellPx, gap, uScale, yBandTop, yBandBot, modelTraceSuppressed]);

  const deficitRibbonDsSvg = useMemo(() => {
    if (tripleLinePack) return [];
    return ribbonPathsBetweenBaseline(sparkPtsRawSvg, yCapPx, (y) => y < yCapPx);
  }, [tripleLinePack, sparkPtsRawSvg, yCapPx]);

  const tightHeadroomMask = useMemo(() => {
    if (tripleLinePack || !landingMarketingTightCapacityFill) return null;
    return daysForSparkDisplay.map((d) => {
      if (modelTraceSuppressed || !d.hasData) return false;
      const u = d.uTrace;
      return u >= TIGHT_HEADROOM_UTIL_LOW && u <= 1 + 1e-9;
    });
  }, [tripleLinePack, daysForSparkDisplay, modelTraceSuppressed, landingMarketingTightCapacityFill]);

  const tightRibbonDsSvg = useMemo(() => {
    if (!tightHeadroomMask) return [];
    return ribbonPathsTightHeadroomToCap(sparkPtsRawSvg, tightHeadroomMask, yCapPx);
  }, [tightHeadroomMask, sparkPtsRawSvg, yCapPx]);

  const sparkStrokeRuns = useMemo(() => {
    if (tripleLinePack) {
      if (tripleLinePack.y100 != null) {
        return polylineRunsByCapBaseline(tripleLinePack.techPts, tripleLinePack.y100);
      }
      return tripleLinePack.techPts.length >= 2
        ? [{ dotted: false as const, points: tripleLinePack.techPts }]
        : [];
    }
    return polylineRunsByCapBaseline(sparkPtsRawSvg, yCapPx);
  }, [tripleLinePack, sparkPtsRawSvg, yCapPx]);

  const tripleRestPathD = useMemo(
    () =>
      tripleLinePack && tripleLinePack.restPts.length >= 2 ? pathDFromPoints(tripleLinePack.restPts) : '',
    [tripleLinePack],
  );
  const tripleRiskPathD = useMemo(
    () =>
      tripleLinePack && tripleLinePack.riskPts.length >= 2 ? pathDFromPoints(tripleLinePack.riskPts) : '',
    [tripleLinePack],
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
  const yAxisTopLabel = 'High';
  const yAxisBotLabel = 'Low';

  const stackInOrganicGate =
    landingSparklineStackInMinOrganicTick == null ||
    organicLayerTick == null ||
    organicLayerTick >= landingSparklineStackInMinOrganicTick;

  const softStackIn =
    landingMarketingSweepReveal &&
    !prefersReducedMotion &&
    width >= 24 &&
    contributionMeta.numWeeks >= 1 &&
    stackInOrganicGate;

  if (width < 24 || contributionMeta.numWeeks < 1) {
    return (
      <div
        className={cn('rounded-md border border-border/30 bg-muted/15 dark:border-border/40', className)}
        style={{ width, height: blockStackH }}
        aria-hidden
      />
    );
  }

  const xo = (x: number) => x + LEFT_AXIS_OVERFLOW_PX;

  const ariaChart = tripleLinePack
    ? `Programme chart: three qualitative sparklines — tech demand (blue), store trading (green), and deployment risk (red). Each series is shown with a centered ${GANTT_TRIPLE_MOVING_AVERAGE_WINDOW}-day average on modeled days and is scaled to its own high–low range so shapes read clearly (not a single shared numeric axis). Tech 100% of caps is marked in the band only when that level falls inside the tech trace’s scaled range${
        tripleLinePack.y100 != null ? '.' : ' (off-scale in this window).'
      }`
    : `Daily technology load as a share of effective lab and Market IT capacity along the strip; vertical scale stretches across the lowest and highest share in this window (span about ${axisBandPct} percentage points of cap); a faint horizontal line marks 100% of modeled caps when visible in the band; red fill only where load exceeds 100% of caps${
        landingMarketingTightCapacityFill ? '; rose fill where load is high but still at or below 100% of caps' : ''
      }; dotted stroke where there is headroom below 100%${
        sparklineUtilSmoothWindow != null && sparklineUtilSmoothWindow >= 3
          ? '; displayed trace uses a short moving average for readability'
          : ''
      }`;

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
        {selX != null && !suppressSelectionColumnLine ? (
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
      <div
        className="block max-w-none shrink-0"
        style={{ marginTop: chartContentMarginTopPx }}
      >
      <svg
        width={width + LEFT_AXIS_OVERFLOW_PX}
        height={chartH}
        viewBox={`0 0 ${width + LEFT_AXIS_OVERFLOW_PX} ${chartH}`}
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
            <title>
              {tripleLinePack
                ? 'Top of chart band — each trace is stretched from its own high in this window (qualitative shape, not a common number scale)'
                : `Top of utilization band in this strip (span ≈ ${axisBandPct} pts of cap vs modeled limits)`}
            </title>
            {yAxisTopLabel}
          </text>
          <text
            x={xo(Y_AXIS_LABEL_ANCHOR_X)}
            y={yBandBot}
            dominantBaseline="central"
            textAnchor="end"
            fill="currentColor"
            style={{ fontSize: 9, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            <title>
              {tripleLinePack
                ? 'Bottom of chart band — each trace is stretched from its own low in this window (qualitative comparison of rhythm, not level)'
                : `Lowest share in this strip (bottom of scaled band; span ≈ ${axisBandPct} pts of cap)`}
            </title>
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
          {tripleLinePack && tripleSeriesVisible.trading && tripleRestPathD ? (
            <path
              d={tripleRestPathD}
              fill="none"
              className={SPARKLINE_STORE_TRADING_STROKE}
              strokeWidth={1.35}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {tripleLinePack && tripleSeriesVisible.risk && tripleRiskPathD ? (
            <path
              d={tripleRiskPathD}
              fill="none"
              className={SPARKLINE_DEPLOYMENT_RISK_STROKE}
              strokeWidth={1.35}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {(!tripleLinePack || tripleSeriesVisible.tech) &&
            sparkStrokeRuns.map((run, i) => (
              <path
                key={`spark-run-${i}`}
                d={pathDFromPoints(run.points)}
                fill="none"
                className={
                  tripleLinePack
                    ? SPARKLINE_TECH_STROKE_SOLID
                    : run.dotted
                      ? SPARKLINE_TECH_STROKE_HEADROOM
                      : SPARKLINE_TECH_STROKE_SOLID
                }
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
        {tripleLinePack ? (
          tripleLinePack.y100 != null && tripleSeriesVisible.tech ? (
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
          ) : null
        ) : (
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
        )}
        {selX != null && !suppressSelectionColumnLine ? (
          <line
            x1={xo(selX)}
            x2={xo(selX)}
            y1={2}
            y2={chartH - 2}
            stroke={RS.marker}
            strokeWidth={1.75}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            opacity={0.88}
          />
        ) : null}
      </svg>
      <div
        role="group"
        aria-label="Chart legend"
        className="mt-1 flex min-h-[20px] flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] font-medium leading-tight text-muted-foreground"
        style={{
          marginLeft: -LEFT_AXIS_OVERFLOW_PX,
          width: width + LEFT_AXIS_OVERFLOW_PX,
          paddingLeft: gutter,
        }}
      >
        {tripleLinePack ? (
          <>
            <label className="inline-flex cursor-pointer select-none items-center gap-1 text-foreground/90 hover:text-foreground">
              <input
                type="checkbox"
                checked={tripleSeriesVisible.tech}
                onChange={(e) => setTripleSeriesVis('tech', e.target.checked)}
                className="accent-primary h-3 w-3 shrink-0"
              />
              <SparklineLegendLineSwatch className={SPARKLINE_TECH_STROKE_SOLID} />
              <span>Tech Demand</span>
            </label>
            <label className="inline-flex cursor-pointer select-none items-center gap-1 text-foreground/90 hover:text-foreground">
              <input
                type="checkbox"
                checked={tripleSeriesVisible.trading}
                onChange={(e) => setTripleSeriesVis('trading', e.target.checked)}
                className="accent-primary h-3 w-3 shrink-0"
              />
              <SparklineLegendLineSwatch className={SPARKLINE_STORE_TRADING_STROKE} />
              <span>Store trading</span>
            </label>
            <label className="inline-flex cursor-pointer select-none items-center gap-1 text-foreground/90 hover:text-foreground">
              <input
                type="checkbox"
                checked={tripleSeriesVisible.risk}
                onChange={(e) => setTripleSeriesVis('risk', e.target.checked)}
                className="accent-primary h-3 w-3 shrink-0"
              />
              <SparklineLegendLineSwatch className={SPARKLINE_DEPLOYMENT_RISK_STROKE} />
              <span>Deployment risk</span>
            </label>
            {tripleLinePack.y100 != null ? (
              <span className="inline-flex items-center gap-1">
                <svg width={14} height={10} viewBox="0 0 14 10" className="shrink-0 text-muted-foreground" aria-hidden>
                  <line
                    x1={0}
                    y1={5}
                    x2={14}
                    y2={5}
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeOpacity={0.55}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <span>100% of tech caps</span>
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1">
              <SparklineLegendLineSwatch className={SPARKLINE_TECH_STROKE_SOLID} />
              <span>Tech Demand</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <svg width={12} height={10} viewBox="0 0 12 10" className="shrink-0 overflow-visible" aria-hidden>
                <rect x={0} y={2} width={12} height={6} rx={1} className={DEFICIT_FILL} fillOpacity={0.52} />
              </svg>
              <span>Over 100% of caps</span>
            </span>
            {landingMarketingTightCapacityFill ? (
              <span className="inline-flex items-center gap-1">
                <svg width={12} height={10} viewBox="0 0 12 10" className="shrink-0 overflow-visible" aria-hidden>
                  <rect x={0} y={2} width={12} height={6} rx={1} className={TIGHT_HEADROOM_FILL} fillOpacity={0.95} />
                </svg>
                <span>High load (under cap)</span>
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <SparklineLegendLineSwatch dashed className="stroke-muted-foreground/45" />
              <span>Headroom</span>
            </span>
          </>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
