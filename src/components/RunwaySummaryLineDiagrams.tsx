import { useMemo, type ReactNode } from 'react';
import type { ViewModeId } from '@/lib/constants';
import { gammaFocusMarket, isRunwayMultiMarketStrip } from '@/lib/markets';
import {
  buildDemandCapacityGapPaths,
  pointsForSeries,
  ribbonPathSmoothTopPolyBottom,
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
import {
  extractRunwayMiniSeries,
  extractTechMixMonthlyRows,
  miniChartMonthBarCenterX,
  miniChartXForDayYmd,
  techMixMonthlyRowsToShares,
  TECH_MIX_MINI_BAR_GAP_VB,
  type TechMixMonthBar,
  type TechMixMonthlyRow,
} from '@/lib/runwaySummaryMiniSeries';
import {
  deploymentRiskHeatmapMetric,
  inStoreHeatmapMetric,
  type TechWorkloadScope,
} from '@/lib/runwayViewMetrics';
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

/**
 * Mini charts: use theme `stroke-zinc-*` / `fill-zinc-*` + opacity (not `fill-[#hex]/xx`) so SVG paints
 * correctly in light mode — arbitrary hex+opacity often resolves to default black fill in practice.
 */
const MINI_INK_STROKE = 'stroke-zinc-950 dark:stroke-white';
const MINI_INK_STROKE_DIM = 'stroke-zinc-600/85 dark:stroke-white/48';
const MINI_INK_STROKE_SOFT = 'stroke-zinc-500/75 dark:stroke-white/30';
const MINI_INK_FILL_Q = 'fill-zinc-900 dark:fill-white/58';
const MINI_INK_FILL_Y = 'fill-zinc-800 dark:fill-white/52';

/** 1.5 CSS px for every stroked mini-chart element; non-scaling so sparklines stay legible when the SVG scales. */
const MINI_STROKE_W = 1.5;
const MINI_STROKE_VEC = { strokeWidth: MINI_STROKE_W, vectorEffect: 'non-scaling-stroke' as const };

/** Mix segment rim — softer than full-ink so the bars read the same as Store trading / Deployment area outlines. */
const TECH_MIX_SEG_OUTLINE_CLASS = 'stroke-zinc-600/75 dark:stroke-white/60';

/**
 * Pattern tile fills for Technology mix (`fill="url(#…)"` like Store trading — direct `fill-zinc` on `<rect>`
 * can fail in SVG and paint black).  Dark mode uses mid-dark zinc (600/500) like the scalar area fill so bars
 * sit against the dark background the same way the restaurant/deployment fills do.
 */
const TECH_MIX_PAT_BAU_CLASS = 'fill-zinc-400/40 dark:fill-zinc-600/32';
const TECH_MIX_PAT_CAMP_CLASS = 'fill-zinc-500/45 dark:fill-zinc-500/34';
const TECH_MIX_PAT_PROJ_CLASS = 'fill-zinc-600/50 dark:fill-zinc-400/36';
const TECH_MIX_PAT_EMPTY_CLASS = 'fill-zinc-300/28 dark:fill-zinc-700/16';

/** Solid demand trace (capacity mini chart). */
const MINI_SOLID_TRACE_CLASS = MINI_INK_STROKE;
const MINI_SOLID_TRACE_PROPS = {
  ...MINI_STROKE_VEC,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
};

/** Scalar charts (deployment / store) and capacity headroom: area fill — applied directly, no stroke (strokes
 *  on multi-segment gap ribbons create visible internal edges that read as hatching). */
const SCALAR_AREA_FILL_CLASS = 'fill-zinc-400/40 dark:fill-zinc-600/32';

/** Stacked tech workload mix — same plot box as {@link CAP_LAY} so paired sparklines scale consistently. */
const MIX_LAY: GapRibbonLayout = {
  padL: 10,
  padR: 10,
  padT: 12,
  padB: 30,
  vbW: 420,
  vbH: 112,
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
/** First text row below ticks: leave gap so quarter glyphs don’t crowd tick ends (~yb + 3.75). */
const MINI_AXIS_QUARTER_LABEL_DY = 13;
/** Second row: farther from axis; keep ~12px baseline step from quarter row. */
const MINI_AXIS_YEAR_LABEL_DY = 25;

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
          className={MINI_INK_STROKE_DIM}
          {...MINI_STROKE_VEC}
          strokeLinecap="square"
        />
      ))}
      {quarters.map((m, i) => (
        <text
          key={`q-${i}-${m.x}-${m.text}`}
          x={m.x}
          y={yb + MINI_AXIS_QUARTER_LABEL_DY}
          textAnchor={textAnchorForMiniAxisX(m.x, lay)}
          className={MINI_INK_FILL_Q}
          fontSize={9}
        >
          {m.text}
        </text>
      ))}
      {years.map((m, i) => (
        <text
          key={`y-${i}-${m.x}-${m.text}`}
          x={m.x}
          y={yb + MINI_AXIS_YEAR_LABEL_DY}
          textAnchor={textAnchorForMiniAxisX(m.x, lay)}
          className={MINI_INK_FILL_Y}
          fontSize={8.5}
          fontWeight={500}
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
      className={cn('fill-none', MINI_INK_STROKE_SOFT)}
      {...MINI_STROKE_VEC}
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
  );
}

/** Dashed top + dotted mid — same language as {@link ScalarTraceMiniChart} / Store trading. */
function MiniPlotScaleGuideLines({ lay }: { lay: GapRibbonLayout }) {
  const { xl, xr, yt, yb } = plotInnerBounds(lay);
  const yMid = yt + (yb - yt) * 0.5;
  return (
    <>
      <line
        x1={xl}
        y1={yt}
        x2={xr}
        y2={yt}
        className={MINI_INK_STROKE}
        strokeOpacity={0.88}
        {...MINI_STROKE_VEC}
        strokeDasharray="5 3"
        strokeLinecap="round"
      />
      <line
        x1={xl}
        y1={yMid}
        x2={xr}
        y2={yMid}
        className={MINI_INK_STROKE_SOFT}
        {...MINI_STROKE_VEC}
        strokeDasharray="2 4"
      />
    </>
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
      className={cn('pointer-events-none', MINI_INK_STROKE)}
      {...MINI_STROKE_VEC}
      strokeOpacity={0.78}
    />
  );
}

/** 100% stacked columns per calendar month (Technology mix, combined scope). */
function TechMixMonthlyStackedBars({
  months,
  lay,
}: {
  months: TechMixMonthBar[];
  lay: GapRibbonLayout;
}) {
  const { xl, xr, yt, yb } = plotInnerBounds(lay);
  const innerW = xr - xl;
  const innerH = yb - yt;
  const n = months.length;
  const gap = TECH_MIX_MINI_BAR_GAP_VB;
  const bw = (innerW - (n - 1) * gap) / n;

  return (
    <g>
      {months.map((m, i) => {
        const barX = xl + i * (bw + gap);
        if (!m.hasData) {
          return (
            <rect
              key={m.monthKey}
              x={barX}
              y={yt}
              width={bw}
              height={innerH}
              rx={0.85}
              ry={0.85}
              className={cn(TECH_MIX_PAT_EMPTY_CLASS, TECH_MIX_SEG_OUTLINE_CLASS)}
              {...MINI_STROKE_VEC}
              strokeLinejoin="round"
              paintOrder="fill stroke"
            />
          );
        }
        const hB = Math.max(0, m.bauShare * innerH);
        const hC = Math.max(0, m.campaignShare * innerH);
        const hP = Math.max(0, m.projectShare * innerH);
        let yCursor = yb;
        const segs: { h: number; cls: string }[] = [
          { h: hB, cls: TECH_MIX_PAT_BAU_CLASS },
          { h: hC, cls: TECH_MIX_PAT_CAMP_CLASS },
          { h: hP, cls: TECH_MIX_PAT_PROJ_CLASS },
        ];
        return (
          <g key={m.monthKey}>
            {segs.map((s, j) => {
              if (s.h < 1e-4) return null;
              yCursor -= s.h;
              return (
                <rect
                  key={j}
                  x={barX}
                  y={yCursor}
                  width={bw}
                  height={s.h}
                  rx={0.85}
                  ry={0.85}
                  className={cn(s.cls, TECH_MIX_SEG_OUTLINE_CLASS)}
                  {...MINI_STROKE_VEC}
                  strokeLinejoin="round"
                  paintOrder="fill stroke"
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** One bar per month: height scales to the active workload slice (max month in view = full column). */
function TechMixMonthlyScopeBars({
  rows,
  lay,
  scope,
  fillClassName,
}: {
  rows: TechMixMonthlyRow[];
  lay: GapRibbonLayout;
  scope: 'bau' | 'campaign' | 'project';
  fillClassName: string;
}) {
  const { xl, xr, yt, yb } = plotInnerBounds(lay);
  const innerW = xr - xl;
  const innerH = yb - yt;
  const n = rows.length;
  const gap = TECH_MIX_MINI_BAR_GAP_VB;
  const bw = (innerW - (n - 1) * gap) / n;

  const val = (r: TechMixMonthlyRow) =>
    scope === 'bau'
      ? r.bauMean
      : scope === 'campaign'
        ? r.campMean
        : r.projectScopeMean;
  const vmax = Math.max(1e-9, ...rows.filter((r) => r.hasData).map(val));

  return (
    <g>
      {rows.map((r, i) => {
        const barX = xl + i * (bw + gap);
        if (!r.hasData) {
          return (
            <rect
              key={r.monthKey}
              x={barX}
              y={yt}
              width={bw}
              height={innerH}
              rx={0.85}
              ry={0.85}
              className={cn(TECH_MIX_PAT_EMPTY_CLASS, TECH_MIX_SEG_OUTLINE_CLASS)}
              {...MINI_STROKE_VEC}
              strokeLinejoin="round"
              paintOrder="fill stroke"
            />
          );
        }
        const v = val(r);
        const h = Math.max(0, (v / vmax) * innerH);
        const yTop = yb - h;
        return (
          <rect
            key={r.monthKey}
            x={barX}
            y={yTop}
            width={bw}
            height={Math.max(h, 1e-4)}
            rx={0.85}
            ry={0.85}
            className={cn(fillClassName, TECH_MIX_SEG_OUTLINE_CLASS)}
            {...MINI_STROKE_VEC}
            strokeLinejoin="round"
            paintOrder="fill stroke"
          />
        );
      })}
    </g>
  );
}

type MiniChartProps = {
  title: string;
  caption: ReactNode;
  vbW: number;
  vbH: number;
  children: ReactNode;
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
        className="block w-full text-zinc-950 dark:text-white"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
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

/** 0–1 trace with grey-filled area, dashed full-scale line, dotted mid — shared by deployment risk and store trading. */
function ScalarTraceMiniChart({
  title,
  caption,
  lay,
  geom,
  fillClassName,
  timeAxisLabels,
  selectedDayX,
}: {
  title: string;
  caption: string;
  lay: GapRibbonLayout;
  geom: ScalarTraceGeom;
  fillClassName: string;
  timeAxisLabels?: ReactNode;
  selectedDayX?: number | null;
}) {
  return (
    <MiniChartFrame
      title={title}
      caption={caption}
      vbW={lay.vbW}
      vbH={lay.vbH}
      timeAxisLabels={timeAxisLabels}
      overlay={<SelectedDayPlotMarker lay={lay} x={selectedDayX ?? null} />}
    >
      <PlotAxes lay={lay} />
      <MiniPlotScaleGuideLines lay={lay} />
      {geom.area && (
        <path
          d={geom.area}
          className={cn(fillClassName, MINI_INK_STROKE_SOFT)}
          {...MINI_STROKE_VEC}
          paintOrder="fill stroke"
        />
      )}
      <path
        d={geom.line}
        fill="none"
        className={MINI_INK_STROKE}
        {...MINI_STROKE_VEC}
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
  const techWorkloadScope = useAtcStore((s) => s.techWorkloadScope);

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

  const techMixRows = useMemo(() => {
    if (!heatmapVisibleRange) return null;
    return extractTechMixMonthlyRows(riskSurface, market, heatmapVisibleRange);
  }, [riskSurface, market, heatmapVisibleRange]);

  const techMixMonths = useMemo(
    () => (techMixRows ? techMixMonthlyRowsToShares(techMixRows) : null),
    [techMixRows],
  );

  const selectedXCap = useMemo(() => {
    if (!selectedDayYmd || !seriesOpts) return null;
    return miniChartXForDayYmd(selectedDayYmd, riskSurface, market, CAP_LAY, seriesOpts);
  }, [selectedDayYmd, riskSurface, market, seriesOpts]);

  const selectedXDr = useMemo(() => {
    if (!selectedDayYmd || !seriesOpts) return null;
    return miniChartXForDayYmd(selectedDayYmd, riskSurface, market, DR_LAY, seriesOpts);
  }, [selectedDayYmd, riskSurface, market, seriesOpts]);

  const selectedXMix = useMemo(() => {
    if (!selectedDayYmd || !heatmapVisibleRange) return null;
    return miniChartMonthBarCenterX(
      selectedDayYmd,
      riskSurface,
      market,
      MIX_LAY,
      heatmapVisibleRange,
    );
  }, [selectedDayYmd, riskSurface, market, heatmapVisibleRange]);

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

  const techMixGeom = useMemo(() => {
    if (!series?.techWorkloadMix) return null;
    const { bauShare, campaignShare } = series.techWorkloadMix;
    const n = bauShare.length;
    if (n < 2) return null;
    const ptsBau = pointsForSeries(bauShare, MIX_LAY);
    const z = Array.from({ length: n }, () => 0);
    const one = Array.from({ length: n }, () => 1);
    const cumCampTop = bauShare.map((b, i) => b + campaignShare[i]!);
    const ptsCumCampTop = pointsForSeries(cumCampTop, MIX_LAY);
    const ptsOne = pointsForSeries(one, MIX_LAY);
    return {
      lineBau: smoothLineThrough(ptsBau),
      lineCumCampTop: smoothLineThrough(ptsCumCampTop),
      lineStackTop: smoothLineThrough(ptsOne),
      stackBau: ribbonPathSmoothTopPolyBottom(bauShare, z, MIX_LAY),
      stackCampaign: ribbonPathSmoothTopPolyBottom(cumCampTop, bauShare, MIX_LAY),
      stackProject: ribbonPathSmoothTopPolyBottom(one, cumCampTop, MIX_LAY),
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

  if (!series || !capGeom || !techMixGeom || !drGeom || !storeGeom) {
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

  const cardClass = cn('flex w-full flex-col gap-4 px-0 py-2 sm:px-0', className);

  const timeAxisCap =
    timeAxisMarks && (
      <TimeAxisLabelsG lay={CAP_LAY} years={timeAxisMarks.years} quarters={timeAxisMarks.quarters} />
    );
  const timeAxisDr =
    timeAxisMarks && (
      <TimeAxisLabelsG lay={DR_LAY} years={timeAxisMarks.years} quarters={timeAxisMarks.quarters} />
    );

  const mixScope: TechWorkloadScope = techWorkloadScope;

  const techMixBlock = (
    <MiniChartFrame
      title="Technology load mix"
      caption={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 shrink-0 rounded-sm bg-zinc-400/55 dark:bg-zinc-600/42" />
            BAU
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 shrink-0 rounded-sm bg-zinc-500/60 dark:bg-zinc-500/44" />
            Campaign
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 shrink-0 rounded-sm bg-zinc-600/65 dark:bg-zinc-400/46" />
            Programmes
          </span>
        </span>
      }
      vbW={MIX_LAY.vbW}
      vbH={MIX_LAY.vbH}
      timeAxisLabels={
        timeAxisMarks && (
          <TimeAxisLabelsG lay={MIX_LAY} years={timeAxisMarks.years} quarters={timeAxisMarks.quarters} />
        )
      }
      overlay={<SelectedDayPlotMarker lay={MIX_LAY} x={selectedXMix} />}
    >
      {(() => {
        const { xl, xr, yt, yb } = plotInnerBounds(MIX_LAY);
        return (
          <rect
            x={xl}
            y={yt}
            width={xr - xl}
            height={yb - yt}
            rx={3}
            className="fill-zinc-200/30 dark:fill-zinc-800/15"
          />
        );
      })()}
      <PlotAxes lay={MIX_LAY} />
      <MiniPlotScaleGuideLines lay={MIX_LAY} />
      {techMixRows && techMixRows.length > 0 && techMixMonths ? (
        mixScope === 'all' ? (
          <TechMixMonthlyStackedBars
            months={techMixMonths}
            lay={MIX_LAY}
          />
        ) : (
          <TechMixMonthlyScopeBars
            rows={techMixRows}
            lay={MIX_LAY}
            scope={mixScope}
            fillClassName={
              mixScope === 'bau'
                ? TECH_MIX_PAT_BAU_CLASS
                : mixScope === 'campaign'
                  ? TECH_MIX_PAT_CAMP_CLASS
                  : TECH_MIX_PAT_PROJ_CLASS
            }
          />
        )
      ) : (
        <>
          <path
            d={techMixGeom.stackBau}
            className={cn(TECH_MIX_PAT_BAU_CLASS, TECH_MIX_SEG_OUTLINE_CLASS)}
            {...MINI_STROKE_VEC}
            strokeLinejoin="round"
            paintOrder="fill stroke"
          />
          <path
            d={techMixGeom.stackCampaign}
            className={cn(TECH_MIX_PAT_CAMP_CLASS, TECH_MIX_SEG_OUTLINE_CLASS)}
            {...MINI_STROKE_VEC}
            strokeLinejoin="round"
            paintOrder="fill stroke"
          />
          <path
            d={techMixGeom.stackProject}
            className={cn(TECH_MIX_PAT_PROJ_CLASS, TECH_MIX_SEG_OUTLINE_CLASS)}
            {...MINI_STROKE_VEC}
            strokeLinejoin="round"
            paintOrder="fill stroke"
          />
          <path
            d={techMixGeom.lineBau}
            fill="none"
            className={MINI_INK_STROKE}
            {...MINI_STROKE_VEC}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={techMixGeom.lineCumCampTop}
            fill="none"
            className={MINI_INK_STROKE_DIM}
            {...MINI_STROKE_VEC}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={techMixGeom.lineStackTop}
            fill="none"
            className={MINI_INK_STROKE_SOFT}
            {...MINI_STROKE_VEC}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
    </MiniChartFrame>
  );

  const capacityBlock = (
    <MiniChartFrame
      title="Capacity vs demand"
      caption="Dashed line is capacity, solid is demand. Grey fill where demand is below capacity; red where it exceeds."
      vbW={CAP_LAY.vbW}
      vbH={CAP_LAY.vbH}
      timeAxisLabels={timeAxisCap}
      overlay={<SelectedDayPlotMarker lay={CAP_LAY} x={selectedXCap} />}
    >
      <PlotAxes lay={CAP_LAY} />
      <MiniPlotScaleGuideLines lay={CAP_LAY} />
      {capGeom.gap.under && (
        <path
          d={capGeom.gap.under}
          className={SCALAR_AREA_FILL_CLASS}
          stroke="none"
        />
      )}
      {capGeom.gap.over && (
        <path
          d={capGeom.gap.over}
          className="fill-red-500/50 dark:fill-red-400/48"
          stroke="none"
        />
      )}
      <path
        d={capGeom.lineC}
        fill="none"
        className={MINI_INK_STROKE}
        strokeOpacity={0.9}
        {...MINI_STROKE_VEC}
        strokeDasharray="5 3"
        strokeLinecap="round"
      />
      <path
        d={capGeom.lineD}
        fill="none"
        className={MINI_SOLID_TRACE_CLASS}
        {...MINI_SOLID_TRACE_PROPS}
      />
    </MiniChartFrame>
  );

  const deploymentBlock = (
    <ScalarTraceMiniChart
      title="Deployment risk"
      caption="Weekly deployment-risk score. Higher values mean more fragile release windows."
      lay={DR_LAY}
      geom={drGeom}
      fillClassName={SCALAR_AREA_FILL_CLASS}
      timeAxisLabels={timeAxisDr}
      selectedDayX={selectedXDr}
    />
  );

  const storeBlock = (
    <ScalarTraceMiniChart
      title="Store trading"
      caption="Weekly restaurant trading intensity. Higher values mean busier trading periods."
      lay={DR_LAY}
      geom={storeGeom}
      fillClassName={SCALAR_AREA_FILL_CLASS}
      timeAxisLabels={timeAxisDr}
      selectedDayX={selectedXDr}
    />
  );

  if (viewMode === 'combined') {
    return (
      <div className={cardClass}>
        {capacityBlock}
        {techMixBlock}
      </div>
    );
  }
  if (viewMode === 'market_risk') {
    return <div className={cardClass}>{deploymentBlock}</div>;
  }
  if (viewMode === 'in_store') {
    return <div className={cardClass}>{storeBlock}</div>;
  }

  return null;
}
