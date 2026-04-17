import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ViewModeId } from '@/lib/constants';
import { gammaFocusMarket, isRunwayMultiMarketStrip } from '@/lib/markets';
import { polylineThrough, smoothLineThroughMild, type GapRibbonLayout } from '@/lib/runwayGapRibbonPaths';
import { runwayPickerLayoutBounds } from '@/lib/runwayDateFilter';
import {
  buildRunwayMiniTimeAxisMarks,
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
  miniChartDataIndexForDayYmd,
  techMixMonthlyRowsToShares,
} from '@/lib/runwaySummaryMiniSeries';
import type { MarketActivityLedger } from '@/lib/marketActivityLedger';
import {
  activeLedgerEntryIds,
  ledgerBandsForMiniChart,
  type LedgerMiniChartBand,
} from '@/lib/runwayLedgerAttribution';
import { deploymentRiskHeatmapMetric, inStoreHeatmapMetric } from '@/lib/runwayViewMetrics';
import { formatDateYmd } from '@/lib/weekRunway';
import { useAtcStore } from '@/store/useAtcStore';
import { cn } from '@/lib/utils';

import { ParentSize } from '@visx/responsive';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { useTooltip } from '@visx/tooltip';

/* ── chart layout ── */
const CAP_ASPECT = 140 / 420;
const DR_ASPECT = 120 / 420;
const MIX_ASPECT = 140 / 420;
/** Campaign mix line — short gaps read as dotted at mini scale. */
const MIX_LINE_STROKE_DOTTED = '1 3.5';
/** Programmes mix line. */
const MIX_LINE_STROKE_DASHED = '6 4';
/** Vertical marker when the selected runway day is calendar “today”. */
const SELECTED_TODAY_LINE_DASH = '2 4';

const CHART_MARGIN = { top: 12, right: 6, bottom: 22, left: 28 };
const DR_CHART_MARGIN = { top: 12, right: 6, bottom: 22, left: 28 };

type MiniMargin = { top: number; right: number; bottom: number; left: number };

/* ── SVG paint: CSS vars from index.css (Tailwind JIT often skips classes that only appear in TS string constants) ── */
const RS = {
  grid: 'var(--runway-spark-grid)',
  axisTick: 'var(--runway-spark-axis-tick)',
  line: 'var(--runway-spark-line)',
  lineMuted: 'var(--runway-spark-line-muted)',
  capacityLine: 'var(--runway-spark-capacity-line)',
  scalarArea: 'var(--runway-spark-scalar-area)',
  gapUnder: 'var(--runway-spark-gap-under)',
  legendUnder: 'var(--runway-spark-legend-under)',
  attrib: 'var(--runway-spark-attrib)',
  mixBau: 'var(--runway-spark-mix-bau)',
  mixCamp: 'var(--runway-spark-mix-campaign)',
  mixProj: 'var(--runway-spark-mix-programme)',
} as const;

const TICK_LABEL_PROPS = {
  fill: RS.axisTick,
  fontSize: 7.5,
  fontFamily: 'inherit',
  letterSpacing: '0.01em',
} as const;

const AXIS_TICK_LENGTH = 3;

const MINI_STROKE_W = 1.5;
const MINI_STROKE_VEC = { strokeWidth: MINI_STROKE_W, vectorEffect: 'non-scaling-stroke' as const };

const LEGEND_LINE_LEN = 18;

/** Inline stroke sample matching mini-chart line weight (legends only). */
function LegendStrokeLine({ strokeDasharray, stroke = RS.line }: { strokeDasharray?: string; stroke?: string }) {
  return (
    <svg width={LEGEND_LINE_LEN + 4} height={10} className="shrink-0" aria-hidden>
      <line
        x1={2}
        y1={5}
        x2={LEGEND_LINE_LEN + 2}
        y2={5}
        stroke={stroke}
        strokeWidth={1.35}
        strokeLinecap="round"
        {...(strokeDasharray ? { strokeDasharray } : {})}
      />
    </svg>
  );
}

/** Fill chip for legend swatches (span — not SVG — so use backgroundColor). */
function LegendFillChip({ fill }: { fill: string }) {
  return (
    <span
      className="inline-block h-2.5 w-3.5 shrink-0 rounded-sm ring-1 ring-inset ring-black/10 dark:ring-white/15"
      style={{ backgroundColor: fill }}
      aria-hidden
    />
  );
}

/** Tiny area + line silhouette like scalar runway minis. */
function LegendScalarSpark() {
  return (
    <svg width={24} height={11} className="shrink-0" aria-hidden>
      <path
        d="M 1 8.5 L 5.5 5 L 10 7 L 14.5 3.5 L 19 6 L 23 4 L 23 10 L 1 10 Z"
        fill={RS.scalarArea}
        stroke="none"
      />
      <path
        d="M 1 8.5 L 5.5 5 L 10 7 L 14.5 3.5 L 19 6 L 23 4"
        fill="none"
        stroke={RS.line}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MiniLegendRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5"
      role="list"
      aria-label="Chart legend"
    >
      {children}
    </div>
  );
}

function MiniLegendItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span role="listitem" className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
      {children}
      <span className="text-foreground/85">{label}</span>
    </span>
  );
}

type ScaleFn = (v: number) => number;
type Pt = { x: number; y: number };

type MiniScales = {
  xScale: ScaleFn;
  yScale: ScaleFn;
  innerW: number;
  innerH: number;
};

function scalePoints(vals: number[], xScale: ScaleFn, yScale: ScaleFn): Pt[] {
  return vals.map((v, i) => ({
    x: xScale(i),
    y: yScale(Math.min(1, Math.max(0, v))),
  }));
}

function polylineAreaToBaselineScaled(pts: Pt[], baselineY: number): string {
  const line = polylineThrough(pts);
  if (!line) return '';
  const f = (n: number) => n.toFixed(2);
  return `${line} L ${f(pts[pts.length - 1]!.x)} ${f(baselineY)} L ${f(pts[0]!.x)} ${f(baselineY)} Z`;
}

function gapPathsScaled(
  demandVals: number[], capVals: number[],
  dPts: Pt[], cPts: Pt[],
): { over: string; under: string } {
  const n = demandVals.length;
  if (n < 2) return { over: '', under: '' };
  const eps = 1e-9;
  const sign = (i: number) => {
    const s = demandVals[i]! - capVals[i]!;
    return Math.abs(s) <= eps ? 0 : s > 0 ? 1 : -1;
  };
  const fmtPt = (p: Pt) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  const quad = (a: Pt, b: Pt, c: Pt, d: Pt) => `M ${fmtPt(a)} L ${fmtPt(b)} L ${fmtPt(c)} L ${fmtPt(d)} Z`;
  const tri = (a: Pt, b: Pt, c: Pt) => `M ${fmtPt(a)} L ${fmtPt(b)} L ${fmtPt(c)} Z`;
  const segIntersect = (a: Pt, b: Pt, c: Pt, d: Pt): Pt | null => {
    const x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
    const x3 = c.x, y3 = c.y, x4 = d.x, y4 = d.y;
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-12) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
    if (t < -1e-4 || t > 1.0001 || u < -1e-4 || u > 1.0001) return null;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  };
  const partsOver: string[] = [];
  const partsUnder: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const k0 = sign(i), k1 = sign(i + 1);
    if (k0 === 0 && k1 === 0) continue;
    const d0 = dPts[i]!, d1 = dPts[i + 1]!;
    const c0 = cPts[i]!, c1 = cPts[i + 1]!;
    if (k0 >= 0 && k1 >= 0) { partsOver.push(quad(d0, d1, c1, c0)); }
    else if (k0 <= 0 && k1 <= 0) { partsUnder.push(quad(c0, c1, d1, d0)); }
    else {
      const P = segIntersect(d0, d1, c0, c1);
      if (P) {
        if (k0 > 0) { partsOver.push(tri(d0, P, c0)); partsUnder.push(tri(d1, P, c1)); }
        else { partsUnder.push(tri(c0, P, d0)); partsOver.push(tri(d1, P, c1)); }
      } else if (k0 > 0 || k1 > 0) { partsOver.push(quad(d0, d1, c1, c0)); }
      else { partsUnder.push(quad(c0, c1, d1, d0)); }
    }
  }
  return { over: partsOver.join(' '), under: partsUnder.join(' ') };
}

const Y_TICK_VALUES = [0, 0.5, 1];
const pctFormat = (v: number) => `${Math.round(v * 100)}%`;

function nearestIndexFromLocalX(localX: number, n: number, innerW: number): number {
  if (n <= 1) return 0;
  const t = Math.min(1, Math.max(0, localX / innerW));
  return Math.round(t * (n - 1));
}

function CapacityDemandOverlay({ demand, capacity, s }: { demand: number[]; capacity: number[]; s: MiniScales }) {
  const dPts = scalePoints(demand, s.xScale, s.yScale);
  const cPts = scalePoints(capacity, s.xScale, s.yScale);
  const gap = gapPathsScaled(demand, capacity, dPts, cPts);
  const demandLine = polylineThrough(dPts);
  const capacityLine = polylineThrough(cPts);
  return (
    <>
      {gap.under && (
        <path d={gap.under} fill={RS.gapUnder} stroke="none" pointerEvents="none" />
      )}
      {gap.over && <path d={gap.over} className="fill-red-500/50 dark:fill-red-400/48" stroke="none" pointerEvents="none" />}
      <path
        d={capacityLine}
        fill="none"
        stroke={RS.capacityLine}
        strokeOpacity={0.95}
        {...MINI_STROKE_VEC}
        strokeDasharray="5 3"
        strokeLinecap="round"
        pointerEvents="none"
      />
      <path
        d={demandLine}
        fill="none"
        stroke={RS.line}
        {...MINI_STROKE_VEC}
        strokeLinejoin="round"
        strokeLinecap="round"
        pointerEvents="none"
      />
    </>
  );
}

function SelectedDayLine({
  dataIndex,
  s,
  isToday = false,
}: {
  dataIndex: number | null;
  s: MiniScales;
  /** Calendar today — dotted grey marker instead of solid ink. */
  isToday?: boolean;
}) {
  if (dataIndex == null) return null;
  const x = s.xScale(dataIndex);
  return (
    <line
      x1={x} x2={x} y1={0} y2={s.innerH}
      className="pointer-events-none"
      stroke={isToday ? RS.lineMuted : RS.line}
      {...MINI_STROKE_VEC}
      strokeOpacity={isToday ? 0.88 : 0.78}
      {...(isToday ? { strokeDasharray: SELECTED_TODAY_LINE_DASH } : {})}
    />
  );
}

function ScalarAreaFill({ vals, s }: { vals: number[]; s: MiniScales }) {
  const pts = scalePoints(vals, s.xScale, s.yScale);
  const baselineY = s.yScale(0);
  const area = polylineAreaToBaselineScaled(pts, baselineY);
  if (!area) return null;
  return <path d={area} fill={RS.scalarArea} stroke="none" pointerEvents="none" />;
}

function ScalarLinePath({ vals, s }: { vals: number[]; s: MiniScales }) {
  const pts = scalePoints(vals, s.xScale, s.yScale);
  const line = polylineThrough(pts);
  if (!line) return null;
  return (
    <path
      d={line}
      fill="none"
      stroke={RS.line}
      {...MINI_STROKE_VEC}
      strokeLinejoin="round"
      strokeLinecap="round"
      pointerEvents="none"
    />
  );
}

/**
 * Mix-share line (0–1 per point) drawn with mild cubic smoothing so monthly/daily shares read less jagged.
 * Optional `strokeDasharray`: omit for solid, short gap for dotted, long gap for dashed.
 */
function MixShareLinePath({
  vals,
  s,
  strokeColor = RS.mixBau,
  strokeDasharray,
}: {
  vals: number[];
  s: MiniScales;
  strokeColor?: string;
  strokeDasharray?: string;
}) {
  const safe = vals.map((v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0));
  const pts = scalePoints(safe, s.xScale, s.yScale);
  const line = pts.length >= 2 ? smoothLineThroughMild(pts) : polylineThrough(pts);
  if (!line) return null;
  return (
    <path
      d={line}
      fill="none"
      stroke={strokeColor}
      {...MINI_STROKE_VEC}
      {...(strokeDasharray ? { strokeDasharray } : {})}
      strokeLinejoin="round"
      strokeLinecap="round"
      pointerEvents="none"
    />
  );
}

function buildTickConfig(
  marks: { years: MiniTimeAxisMark[]; quarters: MiniTimeAxisMark[] } | null,
  n: number,
  lay: GapRibbonLayout,
) {
  if (!marks) return { tickValues: [] as number[], tickFormat: () => '' };
  const innerW = lay.vbW - lay.padL - lay.padR;
  const denom = Math.max(n - 1, 1);
  const allMarks = [
    ...marks.quarters.map((m) => ({ ...m, tier: 'quarter' as const })),
    ...marks.years.map((m) => ({ ...m, tier: 'year' as const })),
  ].sort((a, b) => a.x - b.x);

  const tickValues: number[] = [];
  const labelMap = new Map<string, string>();
  for (const m of allMarks) {
    const frac = (m.x - lay.padL) / innerW;
    const dataIdx = frac * denom;
    const key = dataIdx.toFixed(2);
    if (!labelMap.has(key)) tickValues.push(dataIdx);
    const existing = labelMap.get(key);
    if (!existing || m.tier === 'year') labelMap.set(key, m.text);
  }
  const tickFormat = (v: number) => labelMap.get(v.toFixed(2)) ?? '';
  return { tickValues, tickFormat };
}

function MiniChartSection({
  title,
  legend,
  caption,
  children,
}: {
  title: string;
  /** Visual keys (swatches, stroke samples) shown under the title. */
  legend?: ReactNode;
  caption: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {legend}
      {children}
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{caption}</p>
    </div>
  );
}

const CAP_LAY: GapRibbonLayout = { padL: 10, padR: 10, padT: 12, padB: 30, vbW: 420, vbH: 112 };

type TooltipSeries = { key: string; values: number[] };

type MiniRunwaySvgProps = {
  width: number;
  height: number;
  margin: MiniMargin;
  n: number;
  bottomTickValues: number[];
  bottomTickFormat: (v: number) => string;
  selectedDataIdx: number | null;
  /** When the selected runway day is calendar today, the vertical marker is dotted grey. */
  selectionLineIsToday?: boolean;
  /** Ledger span shading in chart index space (union of selected rows). */
  attributionBands?: LedgerMiniChartBand[];
  /** Multiplies opacity of series strokes/fills when ledger rows are selected. */
  seriesMutedOpacity?: number;
  /** Plot layer in inner coordinates (0,0)-(innerW,innerH). */
  children: (s: MiniScales) => ReactNode;
  tooltipSeries: TooltipSeries[];
  crosshair: 'vertical' | 'both';
};

function MiniRunwaySvg({
  width,
  height,
  margin,
  n,
  bottomTickValues,
  bottomTickFormat,
  selectedDataIdx,
  selectionLineIsToday = false,
  attributionBands,
  seriesMutedOpacity = 1,
  children,
  tooltipSeries,
  crosshair,
}: MiniRunwaySvgProps) {
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  const xScale = useMemo(
    () => scaleLinear<number>({ domain: [0, Math.max(1, n - 1)], range: [0, innerW], clamp: true }),
    [n, innerW],
  );
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [0, 1], range: [innerH, 0], clamp: true }),
    [innerH],
  );

  const s: MiniScales = useMemo(
    () => ({
      xScale: (v: number) => xScale(v) ?? 0,
      yScale: (v: number) => yScale(v) ?? 0,
      innerW,
      innerH,
    }),
    [xScale, yScale, innerW, innerH],
  );

  const { showTooltip, hideTooltip, tooltipOpen, tooltipLeft, tooltipTop, tooltipData } = useTooltip<{
    idx: number;
    localX: number;
    localY: number;
  }>();

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const svg = e.currentTarget.ownerSVGElement;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const lx = e.clientX - r.left - margin.left;
      const ly = e.clientY - r.top - margin.top;
      if (lx < 0 || lx > innerW || ly < 0 || ly > innerH) {
        hideTooltip();
        return;
      }
      const idx = nearestIndexFromLocalX(lx, n, innerW);
      showTooltip({
        tooltipData: { idx, localX: lx, localY: ly },
        tooltipLeft: e.clientX,
        tooltipTop: e.clientY,
      });
    },
    [hideTooltip, showTooltip, margin.left, margin.top, innerW, innerH, n],
  );

  const onPointerLeave = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  const idx = tooltipData?.idx ?? 0;
  const snapX = s.xScale(idx);
  let horizY: number | null = null;
  if (tooltipOpen && tooltipData && crosshair === 'both' && tooltipSeries.length > 0) {
    let best = Infinity;
    for (const ser of tooltipSeries) {
      const v = ser.values[idx];
      if (v == null || !Number.isFinite(v)) continue;
      const py = s.yScale(Math.min(1, Math.max(0, v)));
      const d = Math.abs(py - tooltipData.localY);
      if (d < best) {
        best = d;
        horizY = py;
      }
    }
  }

  return (
    <>
      <svg
        width={width}
        height={height}
        className="block max-w-full touch-pan-y cursor-default text-foreground"
        aria-label="Runway mini chart"
      >
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            stroke={RS.grid}
            strokeWidth={0.45}
            strokeOpacity={0.85}
            strokeDasharray="3 4"
            numTicks={2}
            pointerEvents="none"
          />
          {attributionBands?.map((b, i) => {
            const x1 = s.xScale(b.i0);
            const x2 = s.xScale(b.i1);
            const left = Math.min(x1, x2);
            const w = Math.max(Math.abs(x2 - x1), 2);
            return (
              <rect
                key={`ab-${i}`}
                x={left}
                y={0}
                width={w}
                height={innerH}
                fill={RS.attrib}
                pointerEvents="none"
              />
            );
          })}
          <g style={{ opacity: seriesMutedOpacity }}>{children(s)}</g>
          {tooltipOpen && tooltipData ? (
            <g pointerEvents="none">
              <line
                x1={snapX} x2={snapX} y1={0} y2={innerH}
                stroke={RS.lineMuted}
                strokeWidth={0.75}
                strokeDasharray="4 3"
              />
              {crosshair === 'both' && horizY != null ? (
                <line
                  x1={0} x2={innerW} y1={horizY} y2={horizY}
                  stroke={RS.lineMuted}
                  strokeWidth={0.75}
                  strokeDasharray="4 3"
                />
              ) : null}
              {tooltipSeries.map((ser) => {
                const v = ser.values[idx];
                if (v == null || !Number.isFinite(v)) return null;
                const cx = snapX;
                const cy = s.yScale(Math.min(1, Math.max(0, v)));
                return (
                  <circle
                    key={ser.key}
                    cx={cx}
                    cy={cy}
                    r={3}
                    fill={RS.line}
                    stroke="hsl(var(--background))"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}
          {selectedDataIdx != null ? (
            <SelectedDayLine dataIndex={selectedDataIdx} s={s} isToday={selectionLineIsToday} />
          ) : null}
          <rect
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            className="touch-pan-y"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
          />
        </Group>
        <AxisLeft
          left={margin.left}
          top={margin.top}
          scale={yScale}
          tickValues={Y_TICK_VALUES}
          tickFormat={(v) => pctFormat(Number(v))}
          hideAxisLine
          hideTicks
          tickLabelProps={() => ({ ...TICK_LABEL_PROPS })}
        />
        <AxisBottom
          top={height - margin.bottom}
          left={margin.left}
          scale={xScale}
          tickValues={bottomTickValues}
          tickFormat={(v) => bottomTickFormat(Number(v))}
          hideAxisLine
          tickLength={AXIS_TICK_LENGTH}
          stroke={RS.axisTick}
          tickStroke={RS.axisTick}
          tickLabelProps={() => ({ ...TICK_LABEL_PROPS, textAnchor: 'middle' })}
        />
      </svg>
      {tooltipOpen && tooltipData && tooltipSeries.length > 0 ? (
        <div
          className="pointer-events-none fixed z-[80] rounded-md border border-border bg-popover px-2 py-1.5 text-popover-foreground shadow-md"
          style={{
            left: tooltipLeft,
            top: tooltipTop,
            transform: 'translate(-50%, calc(-100% - 8px))',
            fontSize: 10,
            lineHeight: 1.4,
            minWidth: tooltipSeries.length > 1 ? 88 : undefined,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {tooltipSeries.map((ser) => {
            const v = ser.values[tooltipData.idx];
            if (v == null || !Number.isFinite(v)) return null;
            return (
              <div key={ser.key} className="flex items-center gap-2">
                <span className="text-muted-foreground">{ser.key}</span>
                <span className="ml-auto font-medium tabular-nums">{(v * 100).toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function MiniRunwaySvgScalar({
  width,
  height,
  margin,
  n,
  bottomTickValues,
  bottomTickFormat,
  selectedDataIdx,
  selectionLineIsToday = false,
  attributionBands,
  seriesMutedOpacity = 1,
  children,
  values,
  label,
}: {
  width: number;
  height: number;
  margin: MiniMargin;
  n: number;
  bottomTickValues: number[];
  bottomTickFormat: (v: number) => string;
  selectedDataIdx: number | null;
  selectionLineIsToday?: boolean;
  attributionBands?: LedgerMiniChartBand[];
  seriesMutedOpacity?: number;
  children: (s: MiniScales) => ReactNode;
  values: number[];
  label: string;
}) {
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  const xScale = useMemo(
    () => scaleLinear<number>({ domain: [0, Math.max(1, n - 1)], range: [0, innerW], clamp: true }),
    [n, innerW],
  );
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [0, 1], range: [innerH, 0], clamp: true }),
    [innerH],
  );

  const s: MiniScales = useMemo(
    () => ({
      xScale: (v: number) => xScale(v) ?? 0,
      yScale: (v: number) => yScale(v) ?? 0,
      innerW,
      innerH,
    }),
    [xScale, yScale, innerW, innerH],
  );

  const { showTooltip, hideTooltip, tooltipOpen, tooltipLeft, tooltipTop, tooltipData } = useTooltip<{ idx: number }>();

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const svg = e.currentTarget.ownerSVGElement;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const lx = e.clientX - r.left - margin.left;
      const ly = e.clientY - r.top - margin.top;
      if (lx < 0 || lx > innerW || ly < 0 || ly > innerH) {
        hideTooltip();
        return;
      }
      const idx = nearestIndexFromLocalX(lx, n, innerW);
      showTooltip({
        tooltipData: { idx },
        tooltipLeft: e.clientX,
        tooltipTop: e.clientY,
      });
    },
    [hideTooltip, showTooltip, margin.left, margin.top, innerW, innerH, n],
  );

  const onPointerLeave = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  const idx = tooltipData?.idx ?? 0;
  const snapX = s.xScale(idx);
  const vy = values[idx];
  const horizY = vy != null && Number.isFinite(vy) ? s.yScale(Math.min(1, Math.max(0, vy))) : null;

  return (
    <>
      <svg
        width={width}
        height={height}
        className="block max-w-full touch-pan-y cursor-default text-foreground"
        aria-label="Runway mini chart"
      >
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            stroke={RS.grid}
            strokeWidth={0.45}
            strokeOpacity={0.85}
            strokeDasharray="3 4"
            numTicks={2}
            pointerEvents="none"
          />
          {attributionBands?.map((b, i) => {
            const x1 = s.xScale(b.i0);
            const x2 = s.xScale(b.i1);
            const left = Math.min(x1, x2);
            const w = Math.max(Math.abs(x2 - x1), 2);
            return (
              <rect
                key={`abs-${i}`}
                x={left}
                y={0}
                width={w}
                height={innerH}
                fill={RS.attrib}
                pointerEvents="none"
              />
            );
          })}
          <g style={{ opacity: seriesMutedOpacity }}>{children(s)}</g>
          {tooltipOpen && tooltipData && horizY != null ? (
            <g pointerEvents="none">
              <line
                x1={snapX} x2={snapX} y1={0} y2={innerH}
                stroke={RS.lineMuted}
                strokeWidth={0.75}
                strokeDasharray="4 3"
              />
              <line
                x1={0} x2={innerW} y1={horizY} y2={horizY}
                stroke={RS.lineMuted}
                strokeWidth={0.75}
                strokeDasharray="4 3"
              />
              <circle
                cx={snapX}
                cy={horizY}
                r={3}
                fill={RS.line}
                stroke="hsl(var(--background))"
                strokeWidth={1}
              />
            </g>
          ) : null}
          {selectedDataIdx != null ? (
            <SelectedDayLine dataIndex={selectedDataIdx} s={s} isToday={selectionLineIsToday} />
          ) : null}
          <rect
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            className="touch-pan-y"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
          />
        </Group>
        <AxisLeft
          left={margin.left}
          top={margin.top}
          scale={yScale}
          tickValues={Y_TICK_VALUES}
          tickFormat={(v) => pctFormat(Number(v))}
          hideAxisLine
          hideTicks
          tickLabelProps={() => ({ ...TICK_LABEL_PROPS })}
        />
        <AxisBottom
          top={height - margin.bottom}
          left={margin.left}
          scale={xScale}
          tickValues={bottomTickValues}
          tickFormat={(v) => bottomTickFormat(Number(v))}
          hideAxisLine
          tickLength={AXIS_TICK_LENGTH}
          stroke={RS.axisTick}
          tickStroke={RS.axisTick}
          tickLabelProps={() => ({ ...TICK_LABEL_PROPS, textAnchor: 'middle' })}
        />
      </svg>
      {tooltipOpen && tooltipData && vy != null && Number.isFinite(vy) ? (
        <div
          className="pointer-events-none fixed z-[80] rounded-md border border-border bg-popover px-2 py-1.5 text-popover-foreground shadow-md"
          style={{
            left: tooltipLeft,
            top: tooltipTop,
            transform: 'translate(-50%, calc(-100% - 8px))',
            fontSize: 10,
            lineHeight: 1.4,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {label} {(vy * 100).toFixed(0)}%
        </div>
      ) : null}
    </>
  );
}

export type RunwaySparklineLayout = 'stack' | 'ledgerStrip';

export function RunwaySummaryLineDiagrams({
  className,
  viewMode,
  selectedDayYmd = null,
  activityLedger = null,
  tripleLensReceipt = false,
  sparklineLayout = 'stack',
}: {
  className?: string;
  viewMode: ViewModeId;
  selectedDayYmd?: string | null;
  /** Parsed-market ledger for attribution bands on sparklines. */
  activityLedger?: MarketActivityLedger | null;
  /** Triple-lens runway: tabbed mini charts (Technology / Restaurant / Deployment). */
  tripleLensReceipt?: boolean;
  /** `ledgerStrip`: two-column grid on large screens for the strip above the activity ledger. */
  sparklineLayout?: RunwaySparklineLayout;
}) {
  const riskSurface = useAtcStore((s) => s.riskSurface);
  const runwayLedgerExcludedEntryIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
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

  const [tripleLensTab, setTripleLensTab] = useState<'technology' | 'restaurant' | 'deployment'>('technology');

  const market = useMemo(() => {
    if (isRunwayMultiMarketStrip(country)) return gammaFocusMarket(country, configs, runwayMarketOrder);
    return country;
  }, [country, configs, runwayMarketOrder]);

  const heatmapVisibleRange = useMemo(() => {
    if (runwayFilterYear != null) {
      const { start, end } = runwayPickerLayoutBounds(runwayFilterYear, runwayFilterQuarter, runwayIncludeFollowingQuarter);
      return { start, end };
    }
    const dates = [...new Set(riskSurface.map((r) => r.date))].sort();
    if (dates.length === 0) return null;
    return { start: dates[0]!, end: dates[dates.length - 1]! };
  }, [riskSurface, runwayFilterYear, runwayFilterQuarter, runwayIncludeFollowingQuarter]);

  const inStoreShapeOptsForAuto = useMemo(
    () => lensHeatmapShapeOptsForAutoCalibrate({ lensTuning: riskHeatmapTuningByLens.in_store, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous }),
    [riskHeatmapTuningByLens.in_store, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous],
  );
  const marketRiskShapeOptsForAuto = useMemo(
    () => lensHeatmapShapeOptsForAutoCalibrate({ lensTuning: riskHeatmapTuningByLens.market_risk, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous }),
    [riskHeatmapTuningByLens.market_risk, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous],
  );

  const inStoreAutoPressureOffset = useMemo(() => {
    const raws = riskSurface.filter((r) => r.market === market).map((r) => inStoreHeatmapMetric(r));
    const t = riskHeatmapTuningByLens.in_store;
    const cfg = configs.find((c) => c.market === market);
    const yamlRaw = cfg?.riskHeatmapBusinessPressureOffset;
    const y = yamlRaw != null && Number.isFinite(yamlRaw) ? yamlRaw : 0;
    return computeRestaurantAutoPressureOffset({ rawMetrics: raws, shapeOpts: inStoreShapeOptsForAuto, globalPressureOffset: t.pressureOffset, yamlPressureDelta: y });
  }, [riskSurface, market, configs, riskHeatmapTuningByLens.in_store, inStoreShapeOptsForAuto]);

  const marketRiskAutoPressureOffset = useMemo(() => {
    const raws = riskSurface.filter((r) => r.market === market).map((r) => deploymentRiskHeatmapMetric(r));
    const t = riskHeatmapTuningByLens.market_risk;
    const cfg = configs.find((c) => c.market === market);
    const yamlRaw = cfg?.riskHeatmapMarketRiskPressureOffset;
    const y = yamlRaw != null && Number.isFinite(yamlRaw) ? yamlRaw : 0;
    return computeAutoHeatmapPressureOffset({ viewMode: 'market_risk', rawMetrics: raws, shapeOpts: marketRiskShapeOptsForAuto, globalPressureOffset: t.pressureOffset, yamlPressureDelta: y });
  }, [riskSurface, market, configs, riskHeatmapTuningByLens.market_risk, marketRiskShapeOptsForAuto]);

  const inStoreHeatmapColorOpts = useMemo((): HeatmapColorOpts => {
    const heatmapSpectrumMode: HeatmapSpectrumMode = heatmapSpectrumContinuous ? 'continuous' : 'discrete';
    const t = riskHeatmapTuningByLens.in_store;
    const base: HeatmapColorOpts = { riskHeatmapCurve: t.curve, riskHeatmapGamma: t.gamma, riskHeatmapTailPower: t.tailPower, businessHeatmapPressureOffset: t.pressureOffset, renderStyle: heatmapRenderStyle, monoColor: heatmapMonoColor, heatmapSpectrumMode };
    const cfg = configs.find((c) => c.market === market);
    return heatmapColorOptsWithMarketYaml('in_store', base, cfg, inStoreAutoPressureOffset, 0);
  }, [riskHeatmapTuningByLens, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous, configs, market, inStoreAutoPressureOffset]);

  const marketRiskHeatmapColorOpts = useMemo((): HeatmapColorOpts => {
    const heatmapSpectrumMode: HeatmapSpectrumMode = heatmapSpectrumContinuous ? 'continuous' : 'discrete';
    const t = riskHeatmapTuningByLens.market_risk;
    const base: HeatmapColorOpts = { riskHeatmapCurve: t.curve, riskHeatmapGamma: t.gamma, riskHeatmapTailPower: t.tailPower, businessHeatmapPressureOffset: t.pressureOffset, renderStyle: heatmapRenderStyle, monoColor: heatmapMonoColor, heatmapSpectrumMode };
    const cfg = configs.find((c) => c.market === market);
    return heatmapColorOptsWithMarketYaml('market_risk', base, cfg, 0, marketRiskAutoPressureOffset);
  }, [riskHeatmapTuningByLens, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous, configs, market, marketRiskAutoPressureOffset]);

  const seriesOpts = useMemo(
    () => heatmapVisibleRange ? { tuning: riskTuning, visibleDateRange: heatmapVisibleRange, inStoreHeatmapColorOpts, marketRiskHeatmapColorOpts } : null,
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

  const selectedDataIdx = useMemo(() => {
    if (!selectedDayYmd || !seriesOpts) return null;
    return miniChartDataIndexForDayYmd(selectedDayYmd, riskSurface, market, seriesOpts);
  }, [selectedDayYmd, riskSurface, market, seriesOpts]);

  const selectionLineIsToday = useMemo(
    () => Boolean(selectedDayYmd && selectedDayYmd === formatDateYmd(new Date())),
    [selectedDayYmd],
  );

  const ledgerActiveEntryIds = useMemo(() => {
    if (!activityLedger) return [] as string[];
    return activeLedgerEntryIds(activityLedger, runwayLedgerExcludedEntryIds);
  }, [activityLedger, runwayLedgerExcludedEntryIds]);

  const ledgerBandsByLens = useMemo(() => {
    const empty: LedgerMiniChartBand[] = [];
    if (!activityLedger || ledgerActiveEntryIds.length === 0 || viewMode === 'code') {
      return { combined: empty, in_store: empty, market_risk: empty };
    }
    const idx = (ymd: string) => miniChartDataIndexForDayYmd(ymd, riskSurface, market, seriesOpts ?? undefined);
    return {
      combined: ledgerBandsForMiniChart(activityLedger, ledgerActiveEntryIds, 'combined', idx),
      in_store: ledgerBandsForMiniChart(activityLedger, ledgerActiveEntryIds, 'in_store', idx),
      market_risk: ledgerBandsForMiniChart(activityLedger, ledgerActiveEntryIds, 'market_risk', idx),
    };
  }, [activityLedger, ledgerActiveEntryIds, viewMode, riskSurface, market, seriesOpts]);

  const bC = ledgerBandsByLens.combined;
  const bI = ledgerBandsByLens.in_store;
  const bR = ledgerBandsByLens.market_risk;

  const seriesMutedOpacity = runwayLedgerExcludedEntryIds.length > 0 ? 0.4 : 1;

  const timeAxisMarks = useMemo(() => {
    if (!heatmapVisibleRange) return null;
    return buildRunwayMiniTimeAxisMarks(heatmapVisibleRange.start, heatmapVisibleRange.end, CAP_LAY);
  }, [heatmapVisibleRange]);

  const n = series?.demand.length ?? 0;

  const capTickConfig = useMemo(() => buildTickConfig(timeAxisMarks, n, CAP_LAY), [timeAxisMarks, n]);

  const mixLineArrays = useMemo(() => {
    if (!series) return { bau: [] as number[], camp: [] as number[], proj: [] as number[] };
    if (techMixMonths && techMixRows?.length && techMixMonths.some((m) => m.hasData)) {
      return {
        bau: techMixMonths.map((m) => (!m.hasData ? 0 : Math.min(1, Math.max(0, m.bauShare)))),
        camp: techMixMonths.map((m) => (!m.hasData ? 0 : Math.min(1, Math.max(0, m.campaignShare)))),
        proj: techMixMonths.map((m) => (!m.hasData ? 0 : Math.min(1, Math.max(0, m.projectShare)))),
      };
    }
    return {
      bau: series.techWorkloadMix.bauShare,
      camp: series.techWorkloadMix.campaignShare,
      proj: series.techWorkloadMix.projectShare,
    };
  }, [series, techMixMonths, techMixRows]);

  /** Polyline smoothing needs ≥2 points; monthly mode can yield one bucket. */
  const mixChartSeries = useMemo(() => {
    const pad = (a: number[]) => (a.length >= 2 ? a : a.length === 1 ? [a[0]!, a[0]!] : a);
    return {
      bau: pad(mixLineArrays.bau),
      camp: pad(mixLineArrays.camp),
      proj: pad(mixLineArrays.proj),
    };
  }, [mixLineArrays]);

  const mixChartN = mixChartSeries.bau.length;

  const mixLineTickConfig = useMemo(
    () => buildTickConfig(timeAxisMarks, Math.max(2, mixChartN), CAP_LAY),
    [timeAxisMarks, mixChartN],
  );

  const mixSelectedDataIdx = useMemo(() => {
    if (!selectedDayYmd || !series) return null;
    if (techMixMonths && techMixRows?.length && techMixMonths.some((m) => m.hasData)) {
      const mk = selectedDayYmd.slice(0, 7);
      const i = techMixMonths.findIndex((m) => m.monthKey === mk);
      return i >= 0 ? i : null;
    }
    return selectedDataIdx;
  }, [selectedDayYmd, series, techMixMonths, techMixRows, selectedDataIdx]);

  if (viewMode === 'code') {
    return (
      <div className={cn('rounded-md bg-transparent px-0 py-2 text-[11px] leading-relaxed text-muted-foreground', className)}>
        Lens trend charts are hidden in Code view. Switch to Technology Teams, Restaurant Activity, or
        Deployment Risk to see the matching runway trace.
      </div>
    );
  }

  if (!series || n < 2) {
    return (
      <div className={cn('rounded-md bg-transparent px-0 py-2 text-[11px] text-muted-foreground', className)}>
        Diagrams appear when the runway has enough days modelled for this market.
      </div>
    );
  }

  const cardClass = cn('flex w-full flex-col gap-4 px-0 py-2 sm:px-0', className);
  const stripGrid = sparklineLayout === 'ledgerStrip';
  /** Wide 2×1 grid only when a day is pinned — otherwise stack capacity above load mix in one column. */
  const stripLedgerWideSplit =
    stripGrid && Boolean(selectedDayYmd && String(selectedDayYmd).trim());
  const stripLedgerChartsClass = stripLedgerWideSplit
    ? 'grid w-full grid-cols-1 gap-6 gap-y-8 lg:grid-cols-2 lg:gap-8 lg:items-start'
    : stripGrid
      ? 'flex w-full flex-col gap-6 lg:gap-8'
      : 'flex flex-col gap-6';

  const capacityBlock = (
    <MiniChartSection
      title="Capacity vs demand"
      legend={
        <MiniLegendRow>
          <MiniLegendItem label="Demand">
            <LegendStrokeLine />
          </MiniLegendItem>
          <MiniLegendItem label="Capacity">
            <LegendStrokeLine strokeDasharray="5 3" stroke={RS.capacityLine} />
          </MiniLegendItem>
          <MiniLegendItem label="Demand under capacity">
            <LegendFillChip fill={RS.legendUnder} />
          </MiniLegendItem>
          <MiniLegendItem label="Demand over capacity">
            <LegendFillChip fill="hsl(0 72% 52% / 0.42)" />
          </MiniLegendItem>
        </MiniLegendRow>
      }
      caption="Vertical line: selected runway day. Axis is 0–100% of modelled capacity."
    >
      <ParentSize className="block w-full" debounceTime={32}>
        {({ width }) => {
          if (width < 20) return null;
          const height = Math.max(64, Math.round(width * CAP_ASPECT));
          return (
            <div className="rounded-lg border border-border/35 bg-muted/10 px-2 py-2 shadow-sm dark:border-border/45 dark:bg-muted/20">
            <MiniRunwaySvg
              width={width}
              height={height}
              margin={CHART_MARGIN}
              n={n}
              bottomTickValues={capTickConfig.tickValues}
              bottomTickFormat={capTickConfig.tickFormat}
              selectedDataIdx={selectedDataIdx}
              selectionLineIsToday={selectionLineIsToday}
              attributionBands={bC}
              seriesMutedOpacity={seriesMutedOpacity}
              tooltipSeries={[
                { key: 'Capacity', values: series.capacity },
                { key: 'Demand', values: series.demand },
              ]}
              crosshair="both"
            >
              {(s) => <CapacityDemandOverlay demand={series.demand} capacity={series.capacity} s={s} />}
            </MiniRunwaySvg>
            </div>
          );
        }}
      </ParentSize>
    </MiniChartSection>
  );

  const techMixLineBlock = (
    <MiniChartSection
      title="Technology load mix"
      legend={
        <MiniLegendRow>
          <MiniLegendItem label="BAU">
            <LegendStrokeLine />
          </MiniLegendItem>
          <MiniLegendItem label="Campaign">
            <LegendStrokeLine strokeDasharray={MIX_LINE_STROKE_DOTTED} />
          </MiniLegendItem>
          <MiniLegendItem label="Programmes">
            <LegendStrokeLine strokeDasharray={MIX_LINE_STROKE_DASHED} />
          </MiniLegendItem>
        </MiniLegendRow>
      }
      caption="Each line is that slice’s share of technology load; the three shares sum to 100% in each period with data."
    >
      <ParentSize className="block w-full" debounceTime={32}>
        {({ width }) => {
          if (width < 20) return null;
          const height = Math.max(64, Math.round(width * MIX_ASPECT));
          return (
            <div className="rounded-lg border border-border/35 bg-muted/10 px-2 py-2 shadow-sm dark:border-border/45 dark:bg-muted/20">
            <MiniRunwaySvg
              width={width}
              height={height}
              margin={CHART_MARGIN}
              n={Math.max(2, mixChartN)}
              bottomTickValues={mixLineTickConfig.tickValues}
              bottomTickFormat={mixLineTickConfig.tickFormat}
              selectedDataIdx={mixSelectedDataIdx}
              selectionLineIsToday={selectionLineIsToday}
              attributionBands={bC}
              seriesMutedOpacity={seriesMutedOpacity}
              tooltipSeries={[
                { key: 'BAU', values: mixChartSeries.bau },
                { key: 'Campaign', values: mixChartSeries.camp },
                { key: 'Programmes', values: mixChartSeries.proj },
              ]}
              crosshair="both"
            >
              {(s) => (
                <>
                  <MixShareLinePath
                    vals={mixChartSeries.proj}
                    s={s}
                    strokeColor={RS.mixProj}
                    strokeDasharray={MIX_LINE_STROKE_DASHED}
                  />
                  <MixShareLinePath
                    vals={mixChartSeries.camp}
                    s={s}
                    strokeColor={RS.mixCamp}
                    strokeDasharray={MIX_LINE_STROKE_DOTTED}
                  />
                  <MixShareLinePath vals={mixChartSeries.bau} s={s} strokeColor={RS.mixBau} />
                </>
              )}
            </MiniRunwaySvg>
            </div>
          );
        }}
      </ParentSize>
    </MiniChartSection>
  );

  const deploymentBlock = (
    <MiniChartSection
      title="Deployment risk"
      legend={
        <MiniLegendRow>
          <MiniLegendItem label="Weekly risk">
            <LegendScalarSpark />
          </MiniLegendItem>
        </MiniLegendRow>
      }
      caption="Higher values mean more fragile release windows (weekly score)."
    >
      <ParentSize className="block w-full" debounceTime={32}>
        {({ width }) => {
          if (width < 20) return null;
          const height = Math.max(52, Math.round(width * DR_ASPECT));
          return (
            <div className="rounded-lg border border-border/35 bg-muted/10 px-2 py-2 shadow-sm dark:border-border/45 dark:bg-muted/20">
            <MiniRunwaySvgScalar
              width={width}
              height={height}
              margin={DR_CHART_MARGIN}
              n={n}
              bottomTickValues={capTickConfig.tickValues}
              bottomTickFormat={capTickConfig.tickFormat}
              selectedDataIdx={selectedDataIdx}
              selectionLineIsToday={selectionLineIsToday}
              attributionBands={bR}
              seriesMutedOpacity={seriesMutedOpacity}
              values={series.deploymentRisk}
              label="Risk"
            >
              {(s) => (
                <>
                  <ScalarAreaFill vals={series.deploymentRisk} s={s} />
                  <ScalarLinePath vals={series.deploymentRisk} s={s} />
                </>
              )}
            </MiniRunwaySvgScalar>
            </div>
          );
        }}
      </ParentSize>
    </MiniChartSection>
  );

  const storeBlock = (
    <MiniChartSection
      title="Store trading"
      legend={
        <MiniLegendRow>
          <MiniLegendItem label="Weekly trading">
            <LegendScalarSpark />
          </MiniLegendItem>
        </MiniLegendRow>
      }
      caption="Higher values mean busier restaurant trading (weekly score)."
    >
      <ParentSize className="block w-full" debounceTime={32}>
        {({ width }) => {
          if (width < 20) return null;
          const height = Math.max(52, Math.round(width * DR_ASPECT));
          return (
            <div className="rounded-lg border border-border/35 bg-muted/10 px-2 py-2 shadow-sm dark:border-border/45 dark:bg-muted/20">
            <MiniRunwaySvgScalar
              width={width}
              height={height}
              margin={DR_CHART_MARGIN}
              n={n}
              bottomTickValues={capTickConfig.tickValues}
              bottomTickFormat={capTickConfig.tickFormat}
              selectedDataIdx={selectedDataIdx}
              selectionLineIsToday={selectionLineIsToday}
              attributionBands={bI}
              seriesMutedOpacity={seriesMutedOpacity}
              values={series.storeTrading01}
              label="Trading"
            >
              {(s) => (
                <>
                  <ScalarAreaFill vals={series.storeTrading01} s={s} />
                  <ScalarLinePath vals={series.storeTrading01} s={s} />
                </>
              )}
            </MiniRunwaySvgScalar>
            </div>
          );
        }}
      </ParentSize>
    </MiniChartSection>
  );

  if (tripleLensReceipt) {
    const tabBtn = (id: typeof tripleLensTab, label: string) => {
      const active = tripleLensTab === id;
      return (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active}
          id={`runway-spark-tab-${id}`}
          tabIndex={active ? 0 : -1}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            active
              ? 'bg-muted/80 text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )}
          onClick={() => setTripleLensTab(id)}
        >
          {label}
        </button>
      );
    };

    return (
      <div className={cardClass}>
        <div
          role="tablist"
          aria-label="Runway lens trends"
          className="mb-4 flex flex-wrap gap-1 border-b border-border/25 pb-3 dark:border-border/30"
        >
          {tabBtn('technology', 'Technology')}
          {tabBtn('restaurant', 'Restaurant')}
          {tabBtn('deployment', 'Deployment risk')}
        </div>
        <div
          role="tabpanel"
          aria-labelledby={`runway-spark-tab-${tripleLensTab}`}
          className={cn(stripGrid ? stripLedgerChartsClass : 'flex flex-col gap-6')}
        >
          {tripleLensTab === 'technology' ? (
            <>
              {capacityBlock}
              {techMixLineBlock}
            </>
          ) : null}
          {tripleLensTab === 'restaurant' ? (
            stripGrid ? (
              <div className={cn('min-w-0', stripLedgerWideSplit && 'lg:col-span-2')}>{storeBlock}</div>
            ) : (
              storeBlock
            )
          ) : null}
          {tripleLensTab === 'deployment' ? (
            stripGrid ? (
              <div className={cn('min-w-0', stripLedgerWideSplit && 'lg:col-span-2')}>{deploymentBlock}</div>
            ) : (
              deploymentBlock
            )
          ) : null}
        </div>
      </div>
    );
  }

  if (viewMode === 'combined') {
    if (stripGrid) {
      return (
        <div className={cn('w-full px-0 py-2 sm:px-0', className)}>
          <div className={stripLedgerChartsClass}>
            {capacityBlock}
            {techMixLineBlock}
          </div>
        </div>
      );
    }
    return (
      <div className={cardClass}>
        {capacityBlock}
        {techMixLineBlock}
      </div>
    );
  }
  if (viewMode === 'market_risk') {
    if (stripGrid) {
      return <div className={cn('w-full px-0 py-2 sm:px-0', className)}>{deploymentBlock}</div>;
    }
    return <div className={cardClass}>{deploymentBlock}</div>;
  }
  if (viewMode === 'in_store') {
    if (stripGrid) {
      return <div className={cn('w-full px-0 py-2 sm:px-0', className)}>{storeBlock}</div>;
    }
    return <div className={cardClass}>{storeBlock}</div>;
  }

  return null;
}
