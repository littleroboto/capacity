import { useId, useMemo, type ReactNode } from 'react';
import type { ViewModeId } from '@/lib/constants';
import { gammaFocusMarket, isRunwayMultiMarketStrip } from '@/lib/markets';
import {
  buildDemandCapacityGapPaths,
  pointsForSeries,
  smoothAreaToBaseline,
  smoothLineThrough,
  type GapRibbonLayout,
} from '@/lib/runwayGapRibbonPaths';
import { runwayPickerLayoutBounds } from '@/lib/runwayDateFilter';
import {
  buildRunwayMiniTimeAxisMarks,
  textAnchorForMiniAxisX,
  type MiniTimeAxisMark,
} from '@/lib/runwayMiniChartTimeAxis';
import {
  computeAutoHeatmapPressureOffset,
  computeRestaurantAutoPressureOffset,
  lensHeatmapShapeOptsForAutoCalibrate,
} from '@/lib/autoRestaurantHeatmapOffset';
import { heatmapColorOptsWithMarketYaml } from '@/lib/heatmapColorOptsMarketYaml';
import type { HeatmapColorOpts, HeatmapSpectrumMode } from '@/lib/riskHeatmapColors';
import { extractRunwayMiniSeries, miniChartXForDayYmd } from '@/lib/runwaySummaryMiniSeries';
import { deploymentRiskHeatmapMetric, inStoreHeatmapMetric } from '@/lib/runwayViewMetrics';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

const CAP_LAY: GapRibbonLayout = {
  padL: 10,
  padR: 10,
  padT: 12,
  padB: 30,
  vbW: 420,
  vbH: 112,
};

const DR_LAY: GapRibbonLayout = {
  padL: 10,
  padR: 10,
  padT: 12,
  padB: 30,
  vbW: 420,
  vbH: 100,
};

function plotInnerBounds(lay: GapRibbonLayout) {
  const innerH = lay.vbH - lay.padT - lay.padB;
  return {
    xl: lay.padL,
    xr: lay.vbW - lay.padR,
    yt: lay.padT,
    yb: lay.padT + innerH,
  };
}

const MINI_X_AXIS_TICK_PX = 3.75;

function uniqueTimeAxisTickXs(years: MiniTimeAxisMark[], quarters: MiniTimeAxisMark[]): number[] {
  const seen = new Set<string>();
  const xs: number[] = [];
  for (const m of [...years, ...quarters]) {
    const k = m.x.toFixed(2);
    if (seen.has(k)) continue;
    seen.add(k);
    xs.push(m.x);
  }
  return xs.sort((a, b) => a - b);
}

function TimeAxisLabelsG({
  lay,
  years,
  quarters,
}: {
  lay: GapRibbonLayout;
  years: MiniTimeAxisMark[];
  quarters: MiniTimeAxisMark[];
}) {
  const { yb } = plotInnerBounds(lay);
  const tickXs = useMemo(() => uniqueTimeAxisTickXs(years, quarters), [years, quarters]);

  return (
    <g className="select-none">
      {tickXs.map((x, i) => (
        <line
          key={`xtick-${i}-${x.toFixed(2)}`}
          x1={x}
          y1={yb}
          x2={x}
          y2={yb + MINI_X_AXIS_TICK_PX}
          className="stroke-foreground/45 dark:stroke-foreground/42"
          strokeWidth={0.9}
          strokeLinecap="square"
        />
      ))}
      {years.map((m, i) => (
        <text
          key={`y-${i}-${m.x}-${m.text}`}
          x={m.x}
          y={yb + 9}
          textAnchor={textAnchorForMiniAxisX(m.x, lay)}
          className="fill-foreground/55 dark:fill-foreground/50"
          fontSize={8.5}
          fontWeight={500}
        >
          {m.text}
        </text>
      ))}
      {quarters.map((m, i) => (
        <text
          key={`q-${i}-${m.x}-${m.text}`}
          x={m.x}
          y={yb + 21}
          textAnchor={textAnchorForMiniAxisX(m.x, lay)}
          className="fill-foreground/60 dark:fill-foreground/52"
          fontSize={9}
        >
          {m.text}
        </text>
      ))}
    </g>
  );
}

/** Plain L-shaped axes; x-axis tick marks for labels live in {@link TimeAxisLabelsG}. */
function PlotAxes({ lay }: { lay: GapRibbonLayout }) {
  const { xl, xr, yt, yb } = plotInnerBounds(lay);
  return (
    <path
      d={`M ${xl} ${yt} L ${xl} ${yb} L ${xr} ${yb}`}
      className="fill-none stroke-foreground/40 dark:stroke-foreground/38"
      strokeWidth={0.85}
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
  );
}

/** Vertical rule for the heatmap-selected day (same week bucket as mini-series). */
function SelectedDayPlotMarker({ lay, x }: { lay: GapRibbonLayout; x: number | null }) {
  if (x == null) return null;
  const { yt, yb } = plotInnerBounds(lay);
  const xi = Math.round(x * 100) / 100;
  return (
    <line
      x1={xi}
      x2={xi}
      y1={yt}
      y2={yb}
      className="pointer-events-none stroke-primary"
      strokeWidth={1.35}
      strokeOpacity={0.92}
    />
  );
}

type MiniChartProps = {
  title: string;
  caption: string;
  vbW: number;
  vbH: number;
  children: ReactNode;
  /** SVG defs (patterns); omit or null when unused. */
  patterns?: ReactNode | null;
  /** Quarter / year text under the x-axis (same calendar span as the heatmap). */
  timeAxisLabels?: ReactNode;
  /** Optional overlay (e.g. selected-day marker); rendered on top of `children`. */
  overlay?: ReactNode | null;
};

function MiniChartFrame({
  title,
  caption,
  vbW,
  vbH,
  children,
  patterns,
  timeAxisLabels,
  overlay,
}: MiniChartProps) {
  return (
    <div className="w-full">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="block w-full text-foreground"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {patterns != null ? <defs>{patterns}</defs> : null}
        {children}
        {overlay}
        {timeAxisLabels}
      </svg>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{caption}</p>
    </div>
  );
}

type ScalarTraceGeom = {
  area: string | null;
  line: string;
  yHalf: number;
  yFull: number;
};

/** 0–1 trace with hatched area, dashed full-scale line, dotted mid — shared by deployment risk and store trading. */
function ScalarTraceMiniChart({
  title,
  caption,
  lay,
  geom,
  fillPatternId,
  patterns,
  timeAxisLabels,
  selectedDayX,
}: {
  title: string;
  caption: string;
  lay: GapRibbonLayout;
  geom: ScalarTraceGeom;
  fillPatternId: string;
  patterns: ReactNode;
  timeAxisLabels?: ReactNode;
  selectedDayX?: number | null;
}) {
  return (
    <MiniChartFrame
      title={title}
      caption={caption}
      vbW={lay.vbW}
      vbH={lay.vbH}
      patterns={patterns}
      timeAxisLabels={timeAxisLabels}
      overlay={<SelectedDayPlotMarker lay={lay} x={selectedDayX ?? null} />}
    >
      <PlotAxes lay={lay} />
      <line
        x1={lay.padL}
        y1={geom.yFull}
        x2={lay.vbW - lay.padR}
        y2={geom.yFull}
        className="stroke-foreground"
        strokeOpacity={0.88}
        strokeWidth={1.15}
        strokeDasharray="5 3"
        strokeLinecap="round"
      />
      <line
        x1={lay.padL}
        y1={geom.yHalf}
        x2={lay.vbW - lay.padR}
        y2={geom.yHalf}
        className="stroke-foreground/38 dark:stroke-foreground/36"
        strokeWidth={0.75}
        strokeDasharray="2 4"
      />
      {geom.area && (
        <path
          d={geom.area}
          fill={`url(#${fillPatternId})`}
          className="stroke-foreground/28 dark:stroke-foreground/22"
          strokeWidth={0.6}
          paintOrder="stroke fill"
        />
      )}
      <path
        d={geom.line}
        fill="none"
        className="stroke-foreground/90 dark:stroke-foreground/88"
        strokeWidth={1.35}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </MiniChartFrame>
  );
}

export function RunwaySummaryLineDiagrams({
  className,
  viewMode,
  selectedDayYmd = null,
}: {
  className?: string;
  viewMode: ViewModeId;
  /** ISO `YYYY-MM-DD` from the heatmap day summary; draws a vertical marker on the sparklines. */
  selectedDayYmd?: string | null;
}) {
  const uid = useId().replace(/:/g, '');
  const riskSurface = useAtcStore((s) => s.riskSurface);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const country = useAtcStore((s) => s.country);
  const configs = useAtcStore((s) => s.configs);
  const runwayMarketOrder = useAtcStore((s) => s.runwayMarketOrder);
  const runwayFilterYear = useAtcStore((s) => s.runwayFilterYear);
  const runwayFilterQuarter = useAtcStore((s) => s.runwayFilterQuarter);
  const runwayIncludeFollowingQuarter = useAtcStore((s) => s.runwayIncludeFollowingQuarter);
  const riskHeatmapTuningByLens = useAtcStore((s) => s.riskHeatmapTuningByLens);
  const heatmapRenderStyle = useAtcStore((s) => s.heatmapRenderStyle);
  const heatmapMonoColor = useAtcStore((s) => s.heatmapMonoColor);
  const heatmapSpectrumContinuous = useAtcStore((s) => s.heatmapSpectrumContinuous);

  const market = useMemo(() => {
    if (isRunwayMultiMarketStrip(country)) {
      return gammaFocusMarket(country, configs, runwayMarketOrder);
    }
    return country;
  }, [country, configs, runwayMarketOrder]);

  /** Same span as `layoutDatesSorted` in {@link RunwayGrid} (heatmap columns). */
  const heatmapVisibleRange = useMemo(() => {
    if (runwayFilterYear != null) {
      const { start, end } = runwayPickerLayoutBounds(
        runwayFilterYear,
        runwayFilterQuarter,
        runwayIncludeFollowingQuarter,
      );
      return { start, end };
    }
    const dates = [...new Set(riskSurface.map((r) => r.date))].sort();
    if (dates.length === 0) return null;
    return { start: dates[0]!, end: dates[dates.length - 1]! };
  }, [
    riskSurface,
    runwayFilterYear,
    runwayFilterQuarter,
    runwayIncludeFollowingQuarter,
  ]);

  const inStoreShapeOptsForAuto = useMemo(
    () =>
      lensHeatmapShapeOptsForAutoCalibrate({
        lensTuning: riskHeatmapTuningByLens.in_store,
        heatmapRenderStyle,
        heatmapMonoColor,
        heatmapSpectrumContinuous,
      }),
    [riskHeatmapTuningByLens.in_store, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous]
  );

  const marketRiskShapeOptsForAuto = useMemo(
    () =>
      lensHeatmapShapeOptsForAutoCalibrate({
        lensTuning: riskHeatmapTuningByLens.market_risk,
        heatmapRenderStyle,
        heatmapMonoColor,
        heatmapSpectrumContinuous,
      }),
    [riskHeatmapTuningByLens.market_risk, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous]
  );

  const inStoreAutoPressureOffset = useMemo(() => {
    const raws = riskSurface.filter((r) => r.market === market).map((r) => inStoreHeatmapMetric(r));
    const t = riskHeatmapTuningByLens.in_store;
    const cfg = configs.find((c) => c.market === market);
    const yamlRaw = cfg?.riskHeatmapBusinessPressureOffset;
    const y = yamlRaw != null && Number.isFinite(yamlRaw) ? yamlRaw : 0;
    return computeRestaurantAutoPressureOffset({
      rawMetrics: raws,
      shapeOpts: inStoreShapeOptsForAuto,
      globalPressureOffset: t.pressureOffset,
      yamlPressureDelta: y,
    });
  }, [riskSurface, market, configs, riskHeatmapTuningByLens.in_store, inStoreShapeOptsForAuto]);

  const marketRiskAutoPressureOffset = useMemo(() => {
    const raws = riskSurface.filter((r) => r.market === market).map((r) => deploymentRiskHeatmapMetric(r));
    const t = riskHeatmapTuningByLens.market_risk;
    const cfg = configs.find((c) => c.market === market);
    const yamlRaw = cfg?.riskHeatmapMarketRiskPressureOffset;
    const y = yamlRaw != null && Number.isFinite(yamlRaw) ? yamlRaw : 0;
    return computeAutoHeatmapPressureOffset({
      viewMode: 'market_risk',
      rawMetrics: raws,
      shapeOpts: marketRiskShapeOptsForAuto,
      globalPressureOffset: t.pressureOffset,
      yamlPressureDelta: y,
    });
  }, [riskSurface, market, configs, riskHeatmapTuningByLens.market_risk, marketRiskShapeOptsForAuto]);

  /** Same offset + transfer as Restaurant Activity runway cells for this market (YAML + auto calibration). */
  const inStoreHeatmapColorOpts = useMemo((): HeatmapColorOpts => {
    const heatmapSpectrumMode: HeatmapSpectrumMode = heatmapSpectrumContinuous
      ? 'continuous'
      : 'discrete';
    const t = riskHeatmapTuningByLens.in_store;
    const base: HeatmapColorOpts = {
      riskHeatmapCurve: t.curve,
      riskHeatmapGamma: t.gamma,
      riskHeatmapTailPower: t.tailPower,
      businessHeatmapPressureOffset: t.pressureOffset,
      renderStyle: heatmapRenderStyle,
      monoColor: heatmapMonoColor,
      heatmapSpectrumMode,
    };
    const cfg = configs.find((c) => c.market === market);
    return heatmapColorOptsWithMarketYaml('in_store', base, cfg, inStoreAutoPressureOffset, 0);
  }, [
    riskHeatmapTuningByLens,
    heatmapRenderStyle,
    heatmapMonoColor,
    heatmapSpectrumContinuous,
    configs,
    market,
    inStoreAutoPressureOffset,
  ]);

  /** Same offset + transfer as Deployment Risk runway cells (YAML + auto calibration). */
  const marketRiskHeatmapColorOpts = useMemo((): HeatmapColorOpts => {
    const heatmapSpectrumMode: HeatmapSpectrumMode = heatmapSpectrumContinuous
      ? 'continuous'
      : 'discrete';
    const t = riskHeatmapTuningByLens.market_risk;
    const base: HeatmapColorOpts = {
      riskHeatmapCurve: t.curve,
      riskHeatmapGamma: t.gamma,
      riskHeatmapTailPower: t.tailPower,
      businessHeatmapPressureOffset: t.pressureOffset,
      renderStyle: heatmapRenderStyle,
      monoColor: heatmapMonoColor,
      heatmapSpectrumMode,
    };
    const cfg = configs.find((c) => c.market === market);
    return heatmapColorOptsWithMarketYaml('market_risk', base, cfg, 0, marketRiskAutoPressureOffset);
  }, [
    riskHeatmapTuningByLens,
    heatmapRenderStyle,
    heatmapMonoColor,
    heatmapSpectrumContinuous,
    configs,
    market,
    marketRiskAutoPressureOffset,
  ]);

  const seriesOpts = useMemo(
    () =>
      heatmapVisibleRange
        ? {
            tuning: riskTuning,
            visibleDateRange: heatmapVisibleRange,
            inStoreHeatmapColorOpts,
            marketRiskHeatmapColorOpts,
          }
        : null,
    [riskTuning, heatmapVisibleRange, inStoreHeatmapColorOpts, marketRiskHeatmapColorOpts],
  );

  const series = useMemo(() => {
    if (!seriesOpts) return null;
    return extractRunwayMiniSeries(riskSurface, market, seriesOpts);
  }, [riskSurface, market, seriesOpts]);

  const selectedXCap = useMemo(() => {
    if (!selectedDayYmd || !seriesOpts) return null;
    return miniChartXForDayYmd(selectedDayYmd, riskSurface, market, CAP_LAY, seriesOpts);
  }, [selectedDayYmd, riskSurface, market, seriesOpts]);

  const selectedXDr = useMemo(() => {
    if (!selectedDayYmd || !seriesOpts) return null;
    return miniChartXForDayYmd(selectedDayYmd, riskSurface, market, DR_LAY, seriesOpts);
  }, [selectedDayYmd, riskSurface, market, seriesOpts]);

  const timeAxisMarks = useMemo(() => {
    if (!heatmapVisibleRange) return null;
    return buildRunwayMiniTimeAxisMarks(
      heatmapVisibleRange.start,
      heatmapVisibleRange.end,
      CAP_LAY,
    );
  }, [heatmapVisibleRange]);

  const capGeom = useMemo(() => {
    if (!series) return null;
    const gap = buildDemandCapacityGapPaths(series.demand, series.capacity, CAP_LAY);
    const dPts = pointsForSeries(series.demand, CAP_LAY);
    const cPts = pointsForSeries(series.capacity, CAP_LAY);
    return {
      gap,
      lineD: smoothLineThrough(dPts),
      lineC: smoothLineThrough(cPts),
    };
  }, [series]);

  const drGeom = useMemo(() => {
    if (!series) return null;
    const pts = pointsForSeries(series.deploymentRisk, DR_LAY);
    const innerH = DR_LAY.vbH - DR_LAY.padT - DR_LAY.padB;
    const yHalf = DR_LAY.padT + innerH * 0.5;
    const yFull = DR_LAY.padT;
    return {
      area: smoothAreaToBaseline(pts, DR_LAY),
      line: smoothLineThrough(pts),
      yHalf,
      yFull,
    };
  }, [series]);

  const storeGeom = useMemo(() => {
    if (!series) return null;
    const pts = pointsForSeries(series.storeTrading01, DR_LAY);
    const innerH = DR_LAY.vbH - DR_LAY.padT - DR_LAY.padB;
    const yHalf = DR_LAY.padT + innerH * 0.5;
    const yFull = DR_LAY.padT;
    return {
      area: smoothAreaToBaseline(pts, DR_LAY),
      line: smoothLineThrough(pts),
      yHalf,
      yFull,
    };
  }, [series]);

  if (viewMode === 'code') {
    return (
      <div
        className={cn(
          'rounded-md bg-transparent px-0 py-2 text-[11px] leading-relaxed text-muted-foreground',
          className,
        )}
      >
        Lens trend charts are hidden in Code view. Switch to Technology Teams, Restaurant Activity, or
        Deployment Risk to see the matching runway trace.
      </div>
    );
  }

  if (!series || !capGeom || !drGeom || !storeGeom) {
    return (
      <div
        className={cn(
          'rounded-md bg-transparent px-0 py-2 text-[11px] text-muted-foreground',
          className,
        )}
      >
        Diagrams appear when the runway has enough days modelled for this market.
      </div>
    );
  }

  const pDr = `dr-fill-${uid}`;
  const pStore = `store-fill-${uid}`;

  const cardClass = cn('flex w-full flex-col gap-4 px-0 py-2 sm:px-0', className);

  const timeAxisCap =
    timeAxisMarks && (
      <TimeAxisLabelsG lay={CAP_LAY} years={timeAxisMarks.years} quarters={timeAxisMarks.quarters} />
    );
  const timeAxisDr =
    timeAxisMarks && (
      <TimeAxisLabelsG lay={DR_LAY} years={timeAxisMarks.years} quarters={timeAxisMarks.quarters} />
    );

  const capacityBlock = (
    <MiniChartFrame
      title="Capacity vs demand"
      caption="Solid ribbons between the lines: warm fill where demand exceeds capacity; cool tint where there is headroom. Dashed line = capacity (theme foreground); solid = demand. Vertical line = selected heatmap day. X-axis: quarters (Q1–Q4) and two-digit years, with ticks at each mark."
      vbW={CAP_LAY.vbW}
      vbH={CAP_LAY.vbH}
      timeAxisLabels={timeAxisCap}
      patterns={null}
      overlay={<SelectedDayPlotMarker lay={CAP_LAY} x={selectedXCap} />}
    >
      <PlotAxes lay={CAP_LAY} />
      {capGeom.gap.under && (
        <path
          d={capGeom.gap.under}
          className="fill-teal-600/[0.22] stroke-teal-800/[0.28] dark:fill-teal-400/[0.18] dark:stroke-teal-200/[0.35]"
          strokeWidth={0.55}
          strokeLinejoin="miter"
          paintOrder="stroke fill"
        />
      )}
      {capGeom.gap.over && (
        <path
          d={capGeom.gap.over}
          className="fill-orange-600/[0.38] stroke-orange-900/[0.3] dark:fill-orange-500/[0.34] dark:stroke-orange-200/[0.32]"
          strokeWidth={0.55}
          strokeLinejoin="miter"
          paintOrder="stroke fill"
        />
      )}
      <path
        d={capGeom.lineC}
        fill="none"
        className="stroke-foreground"
        strokeOpacity={0.9}
        strokeWidth={1.35}
        strokeDasharray="5 3"
        strokeLinecap="round"
      />
      <path
        d={capGeom.lineD}
        fill="none"
        className="stroke-foreground/90 dark:stroke-foreground/88"
        strokeWidth={1.35}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </MiniChartFrame>
  );

  const deploymentBlock = (
    <ScalarTraceMiniChart
      title="Deployment risk"
      caption="Hatched area under the deployment-risk trace (same pressure offset, transfer curve, and palette mapping as Deployment Risk heatmap cells). Dashed top = full scale (1.0); dotted = mid (0.5). Vertical line = selected heatmap day. X-axis: quarters, two-digit years, and ticks at each mark."
      lay={DR_LAY}
      geom={drGeom}
      fillPatternId={pDr}
      timeAxisLabels={timeAxisDr}
      selectedDayX={selectedXDr}
      patterns={
        <pattern
          id={pDr}
          width="4"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(90)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            className="stroke-foreground/50 dark:stroke-foreground/45"
            strokeWidth="0.9"
          />
        </pattern>
      }
    />
  );

  const storeBlock = (
    <ScalarTraceMiniChart
      title="Store trading"
      caption="Hatched area under modeled restaurant / store-trading intensity (normalized store lane, then same pressure offset and heatmap transfer as Restaurant Activity cells). Dashed top = full scale; dotted = mid (0.5). Vertical line = selected heatmap day. X-axis: quarters, two-digit years, and ticks at each mark."
      lay={DR_LAY}
      geom={storeGeom}
      fillPatternId={pStore}
      timeAxisLabels={timeAxisDr}
      selectedDayX={selectedXDr}
      patterns={
        <pattern
          id={pStore}
          width="4"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(90)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            className="stroke-foreground/50 dark:stroke-foreground/45"
            strokeWidth="0.9"
          />
        </pattern>
      }
    />
  );

  if (viewMode === 'combined') {
    return <div className={cardClass}>{capacityBlock}</div>;
  }
  if (viewMode === 'market_risk') {
    return <div className={cardClass}>{deploymentBlock}</div>;
  }
  if (viewMode === 'in_store') {
    return <div className={cardClass}>{storeBlock}</div>;
  }

  return null;
}
