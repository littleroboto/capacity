import { useCallback, useMemo, type ReactNode } from 'react';
import type { ViewModeId } from '@/lib/constants';
import { gammaFocusMarket, isRunwayMultiMarketStrip } from '@/lib/markets';
import {
  smoothLineThrough,
  type GapRibbonLayout,
} from '@/lib/runwayGapRibbonPaths';
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

const CHART_MARGIN = { top: 12, right: 6, bottom: 22, left: 28 };
const DR_CHART_MARGIN = { top: 12, right: 6, bottom: 22, left: 28 };

type MiniMargin = { top: number; right: number; bottom: number; left: number };

/* ── theme ── */
const ZINC_FG = 'var(--color-zinc-950)';
const ZINC_FG_DIM = 'hsl(var(--muted-foreground))';

const TICK_LABEL_PROPS = {
  fill: ZINC_FG_DIM,
  fontSize: 7.5,
  fontFamily: 'inherit',
  letterSpacing: '0.01em',
} as const;

const AXIS_TICK_LENGTH = 3;

/* ── style constants ── */
const SCALAR_AREA_FILL_CLASS = 'fill-zinc-400/40 dark:fill-zinc-600/32';
const TECH_MIX_PAT_BAU_CLASS = 'fill-zinc-400/40 dark:fill-zinc-600/32';
const TECH_MIX_PAT_CAMP_CLASS = 'fill-zinc-500/45 dark:fill-zinc-500/34';
const TECH_MIX_PAT_PROJ_CLASS = 'fill-zinc-600/50 dark:fill-zinc-400/36';
const TECH_MIX_SEG_OUTLINE_CLASS = 'stroke-zinc-600/75 dark:stroke-white/60';
const MINI_INK_STROKE = 'stroke-zinc-950 dark:stroke-white';
const MINI_INK_STROKE_DIM = 'stroke-zinc-600/85 dark:stroke-white/48';
const MINI_INK_STROKE_SOFT = 'stroke-zinc-500/75 dark:stroke-white/30';
const MINI_STROKE_W = 1.5;
const MINI_STROKE_VEC = { strokeWidth: MINI_STROKE_W, vectorEffect: 'non-scaling-stroke' as const };

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

function smoothAreaToBaselineScaled(pts: Pt[], baselineY: number): string {
  const line = smoothLineThrough(pts);
  if (!line) return '';
  const f = (n: number) => n.toFixed(2);
  return `${line} L ${f(pts[pts.length - 1]!.x)} ${f(baselineY)} L ${f(pts[0]!.x)} ${f(baselineY)} Z`;
}

function ribbonScaled(vTop: Pt[], vBottom: Pt[]): string {
  const n = vTop.length;
  if (n < 2 || vBottom.length !== n) return '';
  const top = smoothLineThrough(vTop);
  if (!top) return '';
  const f = (p: Pt) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  let d = top;
  d += ` L ${f(vBottom[n - 1]!)}`;
  for (let i = n - 2; i >= 0; i--) d += ` L ${f(vBottom[i]!)}`;
  return d + ' Z';
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

const CROSSHAIR_STROKE = ZINC_FG_DIM;

function nearestIndexFromLocalX(localX: number, n: number, innerW: number): number {
  if (n <= 1) return 0;
  const t = Math.min(1, Math.max(0, localX / innerW));
  return Math.round(t * (n - 1));
}

function CapacityDemandOverlay({ demand, capacity, s }: { demand: number[]; capacity: number[]; s: MiniScales }) {
  const dPts = scalePoints(demand, s.xScale, s.yScale);
  const cPts = scalePoints(capacity, s.xScale, s.yScale);
  const gap = gapPathsScaled(demand, capacity, dPts, cPts);
  const demandLine = smoothLineThrough(dPts);
  const capacityLine = smoothLineThrough(cPts);
  return (
    <>
      {gap.under && <path d={gap.under} className={SCALAR_AREA_FILL_CLASS} stroke="none" pointerEvents="none" />}
      {gap.over && <path d={gap.over} className="fill-red-500/50 dark:fill-red-400/48" stroke="none" pointerEvents="none" />}
      <path
        d={capacityLine}
        fill="none"
        className={MINI_INK_STROKE}
        strokeOpacity={0.9}
        {...MINI_STROKE_VEC}
        strokeDasharray="5 3"
        strokeLinecap="round"
        pointerEvents="none"
      />
      <path
        d={demandLine}
        fill="none"
        className={MINI_INK_STROKE}
        {...MINI_STROKE_VEC}
        strokeLinejoin="round"
        strokeLinecap="round"
        pointerEvents="none"
      />
    </>
  );
}

function SelectedDayLine({ dataIndex, s }: { dataIndex: number | null; s: MiniScales }) {
  if (dataIndex == null) return null;
  const x = s.xScale(dataIndex);
  return (
    <line
      x1={x} x2={x} y1={0} y2={s.innerH}
      className={cn('pointer-events-none', MINI_INK_STROKE)}
      {...MINI_STROKE_VEC}
      strokeOpacity={0.78}
    />
  );
}

function ScalarAreaFill({ vals, fillClassName, s }: { vals: number[]; fillClassName: string; s: MiniScales }) {
  const pts = scalePoints(vals, s.xScale, s.yScale);
  const baselineY = s.yScale(0);
  const area = smoothAreaToBaselineScaled(pts, baselineY);
  if (!area) return null;
  return (
    <path d={area} className={cn(fillClassName, MINI_INK_STROKE_SOFT)} {...MINI_STROKE_VEC} paintOrder="fill stroke" pointerEvents="none" />
  );
}

function ScalarLinePath({ vals, s }: { vals: number[]; s: MiniScales }) {
  const pts = scalePoints(vals, s.xScale, s.yScale);
  const line = smoothLineThrough(pts);
  if (!line) return null;
  return (
    <path d={line} fill="none" className={MINI_INK_STROKE} {...MINI_STROKE_VEC} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
  );
}

function TechMixRibbonPaths({ bauShare, campaignShare, s }: { bauShare: number[]; campaignShare: number[]; s: MiniScales }) {
  const n = bauShare.length;
  if (n < 2) return null;
  const z = Array.from({ length: n }, () => 0);
  const one = Array.from({ length: n }, () => 1);
  const cumCampTop = bauShare.map((b, i) => b + campaignShare[i]!);

  const bauPts = scalePoints(bauShare, s.xScale, s.yScale);
  const zPts = scalePoints(z, s.xScale, s.yScale);
  const onePts = scalePoints(one, s.xScale, s.yScale);
  const campPts = scalePoints(cumCampTop, s.xScale, s.yScale);

  return (
    <>
      <path d={ribbonScaled(bauPts, zPts)} className={cn(TECH_MIX_PAT_BAU_CLASS, TECH_MIX_SEG_OUTLINE_CLASS)} {...MINI_STROKE_VEC} strokeLinejoin="round" paintOrder="fill stroke" pointerEvents="none" />
      <path d={ribbonScaled(campPts, bauPts)} className={cn(TECH_MIX_PAT_CAMP_CLASS, TECH_MIX_SEG_OUTLINE_CLASS)} {...MINI_STROKE_VEC} strokeLinejoin="round" paintOrder="fill stroke" pointerEvents="none" />
      <path d={ribbonScaled(onePts, campPts)} className={cn(TECH_MIX_PAT_PROJ_CLASS, TECH_MIX_SEG_OUTLINE_CLASS)} {...MINI_STROKE_VEC} strokeLinejoin="round" paintOrder="fill stroke" pointerEvents="none" />
      <path d={smoothLineThrough(bauPts)} fill="none" className={MINI_INK_STROKE} {...MINI_STROKE_VEC} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
      <path d={smoothLineThrough(campPts)} fill="none" className={MINI_INK_STROKE_DIM} {...MINI_STROKE_VEC} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
      <path d={smoothLineThrough(onePts)} fill="none" className={MINI_INK_STROKE_SOFT} {...MINI_STROKE_VEC} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
    </>
  );
}

function TechMixMonthlyStackedBars({ months, s }: { months: TechMixMonthBar[]; s: MiniScales }) {
  const { innerW: iW, innerH: iH } = s;
  const n = months.length;
  const gap = TECH_MIX_MINI_BAR_GAP_VB;
  const bw = (iW - (n - 1) * gap) / n;

  return (
    <g pointerEvents="none">
      {months.map((m, i) => {
        const barX = i * (bw + gap);
        if (!m.hasData) return null;
        const hB = Math.max(0, m.bauShare * iH);
        const hC = Math.max(0, m.campaignShare * iH);
        const hP = Math.max(0, m.projectShare * iH);
        let yCursor = iH;
        const segs: { h: number; cls: string }[] = [
          { h: hB, cls: TECH_MIX_PAT_BAU_CLASS },
          { h: hC, cls: TECH_MIX_PAT_CAMP_CLASS },
          { h: hP, cls: TECH_MIX_PAT_PROJ_CLASS },
        ];
        return (
          <g key={m.monthKey}>
            {segs.map((seg, j) => {
              if (seg.h < 1e-4) return null;
              yCursor -= seg.h;
              return (
                <rect key={j} x={barX} y={yCursor} width={bw} height={seg.h} rx={0.85} ry={0.85}
                  className={cn(seg.cls, TECH_MIX_SEG_OUTLINE_CLASS)}
                  {...MINI_STROKE_VEC} strokeLinejoin="round" paintOrder="fill stroke" />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function TechMixMonthlyScopeBars({
  rows, scope, fillClassName, s,
}: {
  rows: TechMixMonthlyRow[];
  scope: 'bau' | 'campaign' | 'project';
  fillClassName: string;
  s: MiniScales;
}) {
  const { innerW: iW, innerH: iH } = s;
  const n = rows.length;
  const gap = TECH_MIX_MINI_BAR_GAP_VB;
  const bw = (iW - (n - 1) * gap) / n;
  const val = (r: TechMixMonthlyRow) =>
    scope === 'bau' ? r.bauMean : scope === 'campaign' ? r.campMean : r.projectScopeMean;
  const vmax = Math.max(1e-9, ...rows.filter((r) => r.hasData).map(val));

  return (
    <g pointerEvents="none">
      {rows.map((r, i) => {
        const barX = i * (bw + gap);
        if (!r.hasData) return null;
        const v = val(r);
        const h = Math.max(0, (v / vmax) * iH);
        const yTop = iH - h;
        return (
          <rect key={r.monthKey} x={barX} y={yTop} width={bw} height={Math.max(h, 1e-4)} rx={0.85} ry={0.85}
            className={cn(fillClassName, TECH_MIX_SEG_OUTLINE_CLASS)}
            {...MINI_STROKE_VEC} strokeLinejoin="round" paintOrder="fill stroke" />
        );
      })}
    </g>
  );
}

function TechMixSelectedDayLine({
  months, selectedDayYmd, innerW, innerH,
}: {
  months: TechMixMonthlyRow[] | TechMixMonthBar[];
  selectedDayYmd: string;
  innerW: number;
  innerH: number;
}) {
  const n = months.length;
  if (n === 0) return null;
  const monthKey = selectedDayYmd.slice(0, 7);
  const idx = months.findIndex((m) => m.monthKey === monthKey);
  if (idx < 0) return null;
  const gap = TECH_MIX_MINI_BAR_GAP_VB;
  const bw = (innerW - (n - 1) * gap) / n;
  const x = idx * (bw + gap) + bw / 2;
  return (
    <line x1={x} x2={x} y1={0} y2={innerH}
      className={cn('pointer-events-none', MINI_INK_STROKE)}
      {...MINI_STROKE_VEC} strokeOpacity={0.78} />
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

function MiniChartSection({ title, caption, children }: { title: string; caption: ReactNode; children: ReactNode }) {
  return (
    <div className="w-full">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
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
      <svg width={width} height={height} className="block max-w-full touch-pan-y cursor-default" aria-label="Runway mini chart">
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            stroke={ZINC_FG_DIM}
            strokeWidth={0.4}
            strokeOpacity={0.5}
            strokeDasharray="3 4"
            numTicks={2}
            pointerEvents="none"
          />
          {children(s)}
          {tooltipOpen && tooltipData ? (
            <g pointerEvents="none">
              <line
                x1={snapX} x2={snapX} y1={0} y2={innerH}
                stroke={CROSSHAIR_STROKE}
                strokeWidth={0.75}
                strokeDasharray="4 3"
              />
              {crosshair === 'both' && horizY != null ? (
                <line
                  x1={0} x2={innerW} y1={horizY} y2={horizY}
                  stroke={CROSSHAIR_STROKE}
                  strokeWidth={0.75}
                  strokeDasharray="4 3"
                />
              ) : null}
              {tooltipSeries.map((ser) => {
                const v = ser.values[idx];
                if (v == null || !Number.isFinite(v)) return null;
                const cx = snapX;
                const cy = s.yScale(Math.min(1, Math.max(0, v)));
                return <circle key={ser.key} cx={cx} cy={cy} r={3} fill={ZINC_FG} strokeWidth={0} />;
              })}
            </g>
          ) : null}
          {selectedDataIdx != null ? <SelectedDayLine dataIndex={selectedDataIdx} s={s} /> : null}
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
          stroke={ZINC_FG_DIM}
          tickStroke={ZINC_FG_DIM}
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

/** Mix chart: vertical crosshair only; glyphs for both series at snapped x. */
function MiniRunwaySvgMix({
  width,
  height,
  margin,
  n,
  bottomTickValues,
  bottomTickFormat,
  selectedDataIdx,
  children,
  tooltipSeries,
}: Omit<MiniRunwaySvgProps, 'crosshair'>) {
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

  return (
    <>
      <svg width={width} height={height} className="block max-w-full touch-pan-y cursor-default" aria-label="Runway mini chart">
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            stroke={ZINC_FG_DIM}
            strokeWidth={0.4}
            strokeOpacity={0.5}
            strokeDasharray="3 4"
            numTicks={2}
            pointerEvents="none"
          />
          {children(s)}
          {tooltipOpen && tooltipData ? (
            <g pointerEvents="none">
              <line
                x1={snapX} x2={snapX} y1={0} y2={innerH}
                stroke={CROSSHAIR_STROKE}
                strokeWidth={0.75}
                strokeDasharray="4 3"
              />
              {tooltipSeries.map((ser) => {
                const v = ser.values[idx];
                if (v == null || !Number.isFinite(v)) return null;
                return <circle key={ser.key} cx={snapX} cy={s.yScale(Math.min(1, Math.max(0, v)))} r={3} fill={ZINC_FG} strokeWidth={0} />;
              })}
            </g>
          ) : null}
          {selectedDataIdx != null ? <SelectedDayLine dataIndex={selectedDataIdx} s={s} /> : null}
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
          stroke={ZINC_FG_DIM}
          tickStroke={ZINC_FG_DIM}
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
            minWidth: 88,
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
      <svg width={width} height={height} className="block max-w-full touch-pan-y cursor-default" aria-label="Runway mini chart">
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            stroke={ZINC_FG_DIM}
            strokeWidth={0.4}
            strokeOpacity={0.5}
            strokeDasharray="3 4"
            numTicks={2}
            pointerEvents="none"
          />
          {children(s)}
          {tooltipOpen && tooltipData && horizY != null ? (
            <g pointerEvents="none">
              <line
                x1={snapX} x2={snapX} y1={0} y2={innerH}
                stroke={CROSSHAIR_STROKE}
                strokeWidth={0.75}
                strokeDasharray="4 3"
              />
              <line
                x1={0} x2={innerW} y1={horizY} y2={horizY}
                stroke={CROSSHAIR_STROKE}
                strokeWidth={0.75}
                strokeDasharray="4 3"
              />
              <circle cx={snapX} cy={horizY} r={3} fill={ZINC_FG} strokeWidth={0} />
            </g>
          ) : null}
          {selectedDataIdx != null ? <SelectedDayLine dataIndex={selectedDataIdx} s={s} /> : null}
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
          stroke={ZINC_FG_DIM}
          tickStroke={ZINC_FG_DIM}
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

export function RunwaySummaryLineDiagrams({
  className,
  viewMode,
  selectedDayYmd = null,
}: {
  className?: string;
  viewMode: ViewModeId;
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

  const timeAxisMarks = useMemo(() => {
    if (!heatmapVisibleRange) return null;
    return buildRunwayMiniTimeAxisMarks(heatmapVisibleRange.start, heatmapVisibleRange.end, CAP_LAY);
  }, [heatmapVisibleRange]);

  const n = series?.demand.length ?? 0;

  const campY = useMemo(() => {
    if (!series) return [];
    return series.techWorkloadMix.bauShare.map((b, i) => b + series.techWorkloadMix.campaignShare[i]!);
  }, [series]);

  const capTickConfig = useMemo(() => buildTickConfig(timeAxisMarks, n, CAP_LAY), [timeAxisMarks, n]);

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
  const mixScope: TechWorkloadScope = techWorkloadScope;

  const capacityBlock = (
    <MiniChartSection
      title="Capacity vs demand"
      caption="Dashed line is capacity, solid is demand. Grey fill where demand is below capacity; red where it exceeds."
    >
      <ParentSize className="block w-full" debounceTime={32}>
        {({ width }) => {
          if (width < 20) return null;
          const height = Math.max(64, Math.round(width * CAP_ASPECT));
          return (
            <MiniRunwaySvg
              width={width}
              height={height}
              margin={CHART_MARGIN}
              n={n}
              bottomTickValues={capTickConfig.tickValues}
              bottomTickFormat={capTickConfig.tickFormat}
              selectedDataIdx={selectedDataIdx}
              tooltipSeries={[
                { key: 'Capacity', values: series.capacity },
                { key: 'Demand', values: series.demand },
              ]}
              crosshair="both"
            >
              {(s) => <CapacityDemandOverlay demand={series.demand} capacity={series.capacity} s={s} />}
            </MiniRunwaySvg>
          );
        }}
      </ParentSize>
    </MiniChartSection>
  );

  const techMixBlock = (
    <MiniChartSection
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
    >
      <ParentSize className="block w-full" debounceTime={32}>
        {({ width }) => {
          if (width < 20) return null;
          const height = Math.max(64, Math.round(width * MIX_ASPECT));
          const innerW = width - CHART_MARGIN.left - CHART_MARGIN.right;
          const innerH = height - CHART_MARGIN.top - CHART_MARGIN.bottom;
          return (
            <MiniRunwaySvgMix
              width={width}
              height={height}
              margin={CHART_MARGIN}
              n={n}
              bottomTickValues={capTickConfig.tickValues}
              bottomTickFormat={capTickConfig.tickFormat}
              selectedDataIdx={
                selectedDayYmd && techMixRows && techMixRows.length > 0 ? null : selectedDataIdx
              }
              tooltipSeries={[
                { key: 'BAU', values: series.techWorkloadMix.bauShare },
                { key: 'BAU + Campaign', values: campY },
              ]}
            >
              {(s) => (
                <>
                  {techMixRows && techMixRows.length > 0 && techMixMonths ? (
                    mixScope === 'all' ? (
                      <TechMixMonthlyStackedBars months={techMixMonths} s={s} />
                    ) : (
                      <TechMixMonthlyScopeBars
                        rows={techMixRows}
                        scope={mixScope}
                        fillClassName={
                          mixScope === 'bau' ? TECH_MIX_PAT_BAU_CLASS
                            : mixScope === 'campaign' ? TECH_MIX_PAT_CAMP_CLASS
                              : TECH_MIX_PAT_PROJ_CLASS
                        }
                        s={s}
                      />
                    )
                  ) : series.techWorkloadMix.bauShare.length >= 2 ? (
                    <TechMixRibbonPaths
                      bauShare={series.techWorkloadMix.bauShare}
                      campaignShare={series.techWorkloadMix.campaignShare}
                      s={s}
                    />
                  ) : null}
                  {selectedDayYmd && techMixRows && techMixRows.length > 0 ? (
                    <TechMixSelectedDayLine
                      months={techMixMonths ?? techMixRows}
                      selectedDayYmd={selectedDayYmd}
                      innerW={innerW}
                      innerH={innerH}
                    />
                  ) : null}
                </>
              )}
            </MiniRunwaySvgMix>
          );
        }}
      </ParentSize>
    </MiniChartSection>
  );

  const deploymentBlock = (
    <MiniChartSection
      title="Deployment risk"
      caption="Weekly deployment-risk score. Higher values mean more fragile release windows."
    >
      <ParentSize className="block w-full" debounceTime={32}>
        {({ width }) => {
          if (width < 20) return null;
          const height = Math.max(52, Math.round(width * DR_ASPECT));
          return (
            <MiniRunwaySvgScalar
              width={width}
              height={height}
              margin={DR_CHART_MARGIN}
              n={n}
              bottomTickValues={capTickConfig.tickValues}
              bottomTickFormat={capTickConfig.tickFormat}
              selectedDataIdx={selectedDataIdx}
              values={series.deploymentRisk}
              label="Risk"
            >
              {(s) => (
                <>
                  <ScalarAreaFill vals={series.deploymentRisk} fillClassName={SCALAR_AREA_FILL_CLASS} s={s} />
                  <ScalarLinePath vals={series.deploymentRisk} s={s} />
                </>
              )}
            </MiniRunwaySvgScalar>
          );
        }}
      </ParentSize>
    </MiniChartSection>
  );

  const storeBlock = (
    <MiniChartSection
      title="Store trading"
      caption="Weekly restaurant trading intensity. Higher values mean busier trading periods."
    >
      <ParentSize className="block w-full" debounceTime={32}>
        {({ width }) => {
          if (width < 20) return null;
          const height = Math.max(52, Math.round(width * DR_ASPECT));
          return (
            <MiniRunwaySvgScalar
              width={width}
              height={height}
              margin={DR_CHART_MARGIN}
              n={n}
              bottomTickValues={capTickConfig.tickValues}
              bottomTickFormat={capTickConfig.tickFormat}
              selectedDataIdx={selectedDataIdx}
              values={series.storeTrading01}
              label="Trading"
            >
              {(s) => (
                <>
                  <ScalarAreaFill vals={series.storeTrading01} fillClassName={SCALAR_AREA_FILL_CLASS} s={s} />
                  <ScalarLinePath vals={series.storeTrading01} s={s} />
                </>
              )}
            </MiniRunwaySvgScalar>
          );
        }}
      </ParentSize>
    </MiniChartSection>
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
