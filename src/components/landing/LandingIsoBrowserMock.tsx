import { memo, useMemo, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { runPipelineFromDsl } from '@/engine/pipeline';
import { DEFAULT_RISK_TUNING } from '@/engine/riskModelTuning';
import type { RiskRow } from '@/engine/riskModel';
import {
  buildVerticalMonthsRunwayLayout,
  flattenRunwayWeeksFromSections,
  skylineChronologyGroups,
  type RunwayCalendarCellValue,
} from '@/lib/calendarQuarterLayout';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import {
  heatmapSpectrumLegendGradientCss,
  transformedHeatmapMetric,
  type HeatmapColorOpts,
} from '@/lib/riskHeatmapColors';
import {
  deckAndColumnY,
  LANDING_ISO_SKYLINE_CELL_PX,
  LANDING_ISO_SKYLINE_GAP_PX,
  LANDING_ISO_SKYLINE_HEATMAP_OPTS,
  LANDING_ISO_SKYLINE_ROW_TOWER_PX,
  snapViewBoxDim,
} from '@/components/landing/landingIsoSkylineShared';
import { heatmapCellMetric, runwayHeatmapCellFillAndDim } from '@/lib/runwayViewMetrics';
import {
  computeSkylineBounds,
  isoCellTopLeft,
  isoGridSteps,
  isoGroundRightEdgeChronSpanCenter,
  isoWiForLayoutLi,
  SKYLINE_MONTH_ISO_GAP_STEPS,
} from '@/lib/runwayIsoSkylineLayout';
import {
  isoGroundLabelAnchorAtChronWeek,
  isoGroundMoMatrix,
  isoLabelBleedComp,
  isoLabelLaneDi,
} from '@/lib/runwayIsoGroundLabels';
import { LandingIsoControlsSidepanel } from '@/components/landing/LandingIsoControlsSidepanel';
import { MarketCircleFlag } from '@/components/MarketCircleFlag';
import {
  EMPTY_LEFT,
  EMPTY_RIGHT,
  EMPTY_TOP,
  IsoColumnAtOrigin,
  ISO_GROUND_LABEL_TEXT_PROPS,
  ISO_PAD_LEFT,
  ISO_PAD_RIGHT,
  ISO_PAD_TOP,
  calHeightFromMetric,
  contribPanelFill,
} from '@/components/RunwayIsoHeatCell';
import {
  Box,
  Calendar,
  ChevronDown,
  Download,
  LayoutGrid,
  Sparkles,
  ZoomIn,
} from 'lucide-react';

const MONTH_3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function enumerateYmd(startYmd: string, endYmd: string): string[] {
  const [sy, sm, sd] = startYmd.split('-').map(Number);
  const [ey, em, ed] = endYmd.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const out: string[] = [];
  while (cur <= end) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    );
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const LANDING_ISO_VIEW = 'combined' as const;
const LANDING_ISO_TECH_SCOPE = 'all' as const;

/**
 * Month-to-month “story” stress (0 = cool blues/greens, 1 = hot reds) for the marketing strip only.
 * Apr red-ish (moderate), Jun + Jul/Aug peak, Sep/Oct ease to yellow–green, Nov→Dec ramps up; **December stays red** (no blend into
 * cool Jan within Dec). **Jan 1–10** stays red-ish (year-end carry), then eases to normal January cool.
 */
const LANDING_ISO_SEASONAL_MID: readonly number[] = [
  0.2, 0.22, 0.26, 0.54, 0.58, 0.64, 0.84, 0.8, 0.38, 0.28, 0.5, 0.8,
];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Transformed 0–1 stress from real DE row (Technology lens), for blending. */
function landingRealDisplayStress(
  metric: number | undefined,
  opts: HeatmapColorOpts
): number {
  return transformedHeatmapMetric(LANDING_ISO_VIEW, metric, opts);
}

const LANDING_ISO_JAN_RED_TAIL_DAYS = 10;
/** Stress at start of January (carries December red). */
const LANDING_ISO_JAN_RED_START = 0.84;
/** Stress end of Jan 1–10 window (still warm before full cool-down). */
const LANDING_ISO_JAN_RED_END = 0.7;

/**
 * Smooth seasonal anchor in display-stress space (same 0–1 as after runway transfer).
 */
function landingSeasonalDisplayStress(ymd: string): number {
  const [y, mo, d] = ymd.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return 0.35;
  const dim = new Date(y, mo, 0).getDate();
  const f = smoothstep01((d - 0.5) / dim);

  if (mo === 1) {
    if (d <= LANDING_ISO_JAN_RED_TAIL_DAYS) {
      const u = smoothstep01((d - 0.5) / LANDING_ISO_JAN_RED_TAIL_DAYS);
      return clamp01(LANDING_ISO_JAN_RED_START + (LANDING_ISO_JAN_RED_END - LANDING_ISO_JAN_RED_START) * u);
    }
    const janCool = LANDING_ISO_SEASONAL_MID[0] ?? 0.2;
    const span = Math.max(1, dim - LANDING_ISO_JAN_RED_TAIL_DAYS);
    const u = smoothstep01((d - LANDING_ISO_JAN_RED_TAIL_DAYS - 0.5) / span);
    return clamp01(LANDING_ISO_JAN_RED_END + (janCool - LANDING_ISO_JAN_RED_END) * u);
  }

  if (mo === 12) {
    const nov = LANDING_ISO_SEASONAL_MID[10] ?? 0.5;
    const dec = LANDING_ISO_SEASONAL_MID[11] ?? 0.8;
    return clamp01(nov * (1 - f) + dec * f);
  }

  const i = mo - 1;
  const next = i + 1;
  const a = LANDING_ISO_SEASONAL_MID[i] ?? 0.35;
  const b = LANDING_ISO_SEASONAL_MID[next] ?? 0.35;
  return clamp01(a * (1 - f) + b * f);
}

/**
 * Light seasonal tint only — extrusion and colour are driven mainly by real DE pipeline rows so
 * campaign **prep (readiness / test)** vs **live (operational support)** show up in tower height.
 */
const LANDING_ISO_DECOR_SEASONAL_WEIGHT = 0.12;

/**
 * 0–1 display stress for **Technology** extrusion: when a campaign is in prep, readiness-tagged lab/team
 * load dominates tower height; in live, sustain-tagged (operational / hypercare) load dominates.
 * Matches {@link RiskRow.tech_readiness_pressure} / {@link RiskRow.tech_sustain_pressure} from the pipeline.
 */
function landingIsoTechnologyPhaseExtrusionStress(row: RiskRow): number {
  const prep = row.tech_readiness_pressure ?? 0;
  const sus = row.tech_sustain_pressure ?? 0;
  const headroom = heatmapCellMetric(
    row,
    LANDING_ISO_VIEW,
    DEFAULT_RISK_TUNING,
    LANDING_ISO_TECH_SCOPE
  );
  const combined = landingRealDisplayStress(headroom, LANDING_ISO_SKYLINE_HEATMAP_OPTS);

  if (row.holiday_flag) {
    return clamp01(combined * 0.78 + prep * 0.11 + sus * 0.11);
  }
  if (row.campaign_in_prep) {
    return clamp01(0.03 + prep * 0.86 + sus * 0.07 + combined * 0.06);
  }
  if (row.campaign_in_live) {
    return clamp01(0.03 + sus * 0.74 + prep * 0.12 + combined * 0.09);
  }
  return combined;
}

function IsoLegend() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 self-stretch pt-10 sm:pt-14">
      <span className="font-landing text-[7px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        High
      </span>
      <div
        className="min-h-[120px] w-2 flex-1 max-h-[220px] rounded-full border border-white/[0.08] shadow-inner shadow-black/40"
        style={{ background: heatmapSpectrumLegendGradientCss(LANDING_ISO_SKYLINE_HEATMAP_OPTS) }}
        aria-hidden
      />
      <span className="font-landing text-[7px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Low
      </span>
    </div>
  );
}

function FakeSelect({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-black/40 px-2 py-1">
      <span className="font-landing text-[7px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="flex items-center gap-1 font-landing text-[10px] font-medium text-zinc-200">
        {children}
        <span className="max-w-[120px] truncate sm:max-w-none">{value}</span>
      </span>
      <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500 opacity-70" aria-hidden />
    </div>
  );
}

function ToolbarIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03] text-zinc-400">
      {children}
    </span>
  );
}

export const LandingIsoBrowserMock = memo(function LandingIsoBrowserMock() {
  const reducedMotion = useReducedMotion();

  const { svgInner } = useMemo(() => {
    const cellPx = LANDING_ISO_SKYLINE_CELL_PX;
    const rowTowerPx = LANDING_ISO_SKYLINE_ROW_TOWER_PX;
    const gap = LANDING_ISO_SKYLINE_GAP_PX;

    const { riskSurface, parseError } = runPipelineFromDsl(
      defaultDslForMarket('DE'),
      DEFAULT_RISK_TUNING
    );
    const riskByDate = new Map<string, RiskRow>();
    if (!parseError) {
      for (const r of riskSurface) {
        if (r.market === 'DE') riskByDate.set(r.date, r);
      }
    }

    const sorted = enumerateYmd('2026-01-01', '2027-03-31');
    const runwayLayout = buildVerticalMonthsRunwayLayout(sorted, cellPx, { rowTowerPx });
    if (!runwayLayout) {
      return { svgInner: null as ReactNode };
    }

    const { sections } = runwayLayout;
    const flatWeeksChron = flattenRunwayWeeksFromSections(sections);
    const layoutWeeks = [...flatWeeksChron].reverse();
    const nWeeks = layoutWeeks.length;
    const chronologyAll = skylineChronologyGroups(sections);
    const monthStartChronWeeks = chronologyAll.map((g) => g.weekIndex).filter((w) => w > 0);
    const monthPack = {
      monthGapSteps: SKYLINE_MONTH_ISO_GAP_STEPS,
      monthStartChronWeeks,
    };

    const { minX, minY, vbW, vbH, L, runwayBandH } = computeSkylineBounds(
      layoutWeeks,
      cellPx,
      gap,
      rowTowerPx,
      monthPack
    );
    const { stepX, stepY } = isoGridSteps(cellPx, gap);

    const layoutToIsoWi = (layoutLi: number) =>
      isoWiForLayoutLi(layoutLi, nWeeks, SKYLINE_MONTH_ISO_GAP_STEPS, monthStartChronWeeks);

    const stubH = Math.max(2.5, L.dyy * 0.55);
    const nCols = layoutWeeks[0]?.length ?? 7;
    const maxDi = nCols - 1;
    const halfCell = cellPx / 2;
    const labelBleed = isoLabelBleedComp(stepX, stepY);

    const rightEdgeMidPos = (chronW0: number, chronW1: number, di: number) =>
      isoGroundRightEdgeChronSpanCenter(
        chronW0,
        chronW1,
        di,
        nWeeks,
        stepX,
        stepY,
        halfCell,
        minX,
        minY,
        L.canvasH,
        (li) => layoutToIsoWi(li)
      );

    type DateLabel = { key: string; tx: number; ty: number; text: string };

    const monthRow: DateLabel[] = [];
    const diLaneMo = isoLabelLaneDi(maxDi, 0);
    for (let i = 0; i < chronologyAll.length; i++) {
      const g = chronologyAll[i]!;
      const w0 = g.weekIndex;
      const w1 = i + 1 < chronologyAll.length ? chronologyAll[i + 1]!.weekIndex - 1 : nWeeks - 1;
      if (w1 < w0) continue;
      const wMonthLabel = Math.min(w1, Math.max(w0, w0 + Math.round((w1 - w0) * (2 / 3))));
      const { tx, ty } = isoGroundLabelAnchorAtChronWeek(
        wMonthLabel,
        diLaneMo,
        nWeeks,
        stepX,
        stepY,
        halfCell,
        minX,
        minY,
        L.canvasH,
        (li) => layoutToIsoWi(li)
      );
      monthRow.push({
        key: `mo-${g.sectionYear}-${g.monthIndex}`,
        tx,
        ty,
        text: MONTH_3[g.monthIndex] ?? '',
      });
    }

    const quarterRow: DateLabel[] = [];
    const diLaneQ = isoLabelLaneDi(maxDi, 1);
    let qi = 0;
    while (qi < chronologyAll.length) {
      const g = chronologyAll[qi]!;
      if (!g.quarterLabel) {
        qi++;
        continue;
      }
      const qStart = g.weekIndex;
      let qEnd = nWeeks - 1;
      for (let j = qi + 1; j < chronologyAll.length; j++) {
        if (chronologyAll[j]!.quarterLabel) {
          qEnd = chronologyAll[j]!.weekIndex - 1;
          break;
        }
      }
      const { tx, ty } = rightEdgeMidPos(qStart, qEnd, diLaneQ);
      quarterRow.push({ key: `q-${g.sectionYear}-${g.quarterLabel}`, tx, ty, text: g.quarterLabel });
      qi++;
    }

    const yearRow: DateLabel[] = [];
    const diLaneY = isoLabelLaneDi(maxDi, 2);
    let yi = 0;
    while (yi < chronologyAll.length) {
      const g = chronologyAll[yi]!;
      if (!g.yearLabel) {
        yi++;
        continue;
      }
      const yStart = g.weekIndex;
      let yEnd = nWeeks - 1;
      for (let j = yi + 1; j < chronologyAll.length; j++) {
        if (chronologyAll[j]!.yearLabel) {
          yEnd = chronologyAll[j]!.weekIndex - 1;
          break;
        }
      }
      const { tx, ty } = rightEdgeMidPos(yStart, yEnd, diLaneY);
      yearRow.push({ key: `yr-${g.sectionYear}`, tx, ty, text: g.yearLabel });
      yi++;
    }

    const moFs = Math.max(7.5, stepX * 1.45);
    const qFs = Math.max(9, stepX * 1.85);
    const yrFs = Math.max(8.5, stepX * 1.65);

    const labelPadRight = stepX * 3 + 28;
    const labelPadBottom = stepY * 3 + 24;
    const adjW = vbW + labelPadRight;
    const adjH = vbH + labelPadBottom;

    const cells: { li: number; di: number; cell: RunwayCalendarCellValue; depth: number }[] = [];
    for (let li = 0; li < layoutWeeks.length; li++) {
      const week = layoutWeeks[li]!;
      const isoW = layoutToIsoWi(li);
      for (let di = 0; di < week.length; di++) {
        const cell = week[di]!;
        cells.push({ li, di, cell, depth: isoW + di });
      }
    }
    cells.sort((a, b) => a.depth - b.depth);

    const inner = (
      <svg
        viewBox={`0 0 ${snapViewBoxDim(adjW)} ${snapViewBoxDim(adjH)}`}
        width="100%"
        height="100%"
        className="block h-full max-h-[min(52vh,420px)] min-h-[200px] w-full text-foreground"
        preserveAspectRatio="xMidYMin meet"
        aria-label="Technology lens 3D runway for Germany (DE.yaml): tower height reflects readiness load in campaign prep and operational support load in campaign live, from the same pipeline as the workbench"
      >
        {cells.map(({ li, di, cell }) => {
          const { ax, ay } = isoCellTopLeft(layoutToIsoWi(li), di, stepX, stepY);
          const gx = ax - minX;
          const gy = ay - minY;

          if (cell === false) {
            const calH = stubH;
            const columnTy = deckAndColumnY(L, calH, runwayBandH);
            return (
              <g
                key={`iso-${li}-${di}-x`}
                transform={`translate(${gx.toFixed(2)} ${gy.toFixed(2)})`}
                aria-hidden
              >
                <g transform={`translate(${L.tx.toFixed(2)} ${columnTy.toFixed(2)})`}>
                  <IsoColumnAtOrigin
                    L={L}
                    calH={calH}
                    topC={EMPTY_TOP}
                    leftC={EMPTY_LEFT}
                    rightC={EMPTY_RIGHT}
                  />
                </g>
              </g>
            );
          }

          const dateStr = cell;
          const isPad = !dateStr;
          let topC: string;
          let leftC: string;
          let rightC: string;
          let height01 = 0;
          let metricPad = isPad;
          let gOpacity = 1;

          if (isPad) {
            topC = ISO_PAD_TOP;
            leftC = ISO_PAD_LEFT;
            rightC = ISO_PAD_RIGHT;
          } else {
            const row = typeof dateStr === 'string' ? riskByDate.get(dateStr) : undefined;
            if (!row) {
              topC = ISO_PAD_TOP;
              leftC = ISO_PAD_LEFT;
              rightC = ISO_PAD_RIGHT;
              metricPad = true;
            } else {
              const seasonal = landingSeasonalDisplayStress(dateStr);
              const phaseStress = landingIsoTechnologyPhaseExtrusionStress(row);
              const blendedStress = clamp01(
                seasonal * LANDING_ISO_DECOR_SEASONAL_WEIGHT +
                  phaseStress * (1 - LANDING_ISO_DECOR_SEASONAL_WEIGHT)
              );
              const fakeHeadroom = clamp01(1 - blendedStress);
              const { fill, dimOpacity } = runwayHeatmapCellFillAndDim(
                LANDING_ISO_VIEW,
                LANDING_ISO_TECH_SCOPE,
                fakeHeadroom,
                LANDING_ISO_SKYLINE_HEATMAP_OPTS,
                row
              );
              height01 = transformedHeatmapMetric(
                LANDING_ISO_VIEW,
                fakeHeadroom,
                LANDING_ISO_SKYLINE_HEATMAP_OPTS
              );
              topC = contribPanelFill(fill, 'top');
              leftC = contribPanelFill(fill, 'left');
              rightC = contribPanelFill(fill, 'right');
              gOpacity = dimOpacity;
            }
          }

          const calH = calHeightFromMetric(metricPad ? 0 : height01, rowTowerPx, metricPad);
          const columnTy = deckAndColumnY(L, calH, runwayBandH);

          return (
            <g
              key={`iso-${li}-${di}`}
              transform={`translate(${gx.toFixed(2)} ${gy.toFixed(2)})`}
              style={gOpacity < 0.999 ? { opacity: gOpacity } : undefined}
            >
              <g transform={`translate(${L.tx.toFixed(2)} ${columnTy.toFixed(2)})`}>
                <IsoColumnAtOrigin L={L} calH={calH} topC={topC} leftC={leftC} rightC={rightC} />
              </g>
            </g>
          );
        })}
        <g className="pointer-events-none" aria-hidden>
          {monthRow.map(({ key, tx, ty, text }) => (
            <text
              key={key}
              x={labelBleed * moFs}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              transform={isoGroundMoMatrix(tx, ty, stepX, stepY)}
              className="fill-zinc-500 font-medium tabular-nums tracking-tight"
              fontSize={moFs}
              {...ISO_GROUND_LABEL_TEXT_PROPS}
            >
              {text}
            </text>
          ))}
          {quarterRow.map(({ key, tx, ty, text }) => (
            <text
              key={key}
              x={labelBleed * qFs}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              transform={isoGroundMoMatrix(tx, ty, stepX, stepY)}
              className="fill-zinc-400 font-semibold tabular-nums"
              fontSize={qFs}
              {...ISO_GROUND_LABEL_TEXT_PROPS}
            >
              {text}
            </text>
          ))}
          {yearRow.map(({ key, tx, ty, text }) => (
            <text
              key={key}
              x={labelBleed * yrFs}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              transform={isoGroundMoMatrix(tx, ty, stepX, stepY)}
              className="fill-zinc-300 font-bold tabular-nums"
              fontSize={yrFs}
              {...ISO_GROUND_LABEL_TEXT_PROPS}
            >
              {text}
            </text>
          ))}
        </g>
      </svg>
    );

    return { svgInner: inner };
  }, []);

  return (
    <motion.section
      className="relative mx-auto w-full max-w-6xl"
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="iso-mock-heading"
    >
      <div className="mb-6 max-w-2xl">
        <p className="font-landing mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-500/80">
          Familiar inputs
        </p>
        <h2 id="iso-mock-heading" className="font-landing text-2xl font-semibold text-white">
          Familiar Data, new depth
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Same <span className="text-zinc-300">DE.yaml</span> pipeline as the workbench — not a separate toy graphic.
          During campaign <strong className="font-medium text-violet-200/90">prep</strong>, tower height tracks
          readiness-tagged lab and Market IT load (build, test, integration). In{' '}
          <strong className="font-medium text-cyan-200/90">live</strong>, extrusion follows operational / sustain support
          — usually shorter than prep, just like <code className="rounded bg-white/[0.06] px-1 font-mono text-[11px] text-zinc-400">campaign_support</code> vs{' '}
          <code className="rounded bg-white/[0.06] px-1 font-mono text-[11px] text-zinc-400">live_campaign_support</code>{' '}
          in your file.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0f] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.85)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(ellipse 70% 50% at 60% 40%, rgba(6, 182, 212, 0.16), transparent 60%), radial-gradient(ellipse 50% 40% at 20% 80%, rgba(248, 113, 113, 0.12), transparent 55%)',
          }}
          aria-hidden
        />
        <div className="relative z-10 flex items-center gap-3 border-b border-white/[0.06] bg-[#111114] px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]/90" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]/90" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]/90" />
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-600">https://</span>
            <span className="text-zinc-400">capacity</span>
            <span className="text-zinc-600">.app</span>
            <span className="text-emerald-500/75"> / runway</span>
            <span className="text-zinc-600"> · 3D</span>
          </div>
        </div>

        <div className="relative z-10 border-b border-white/[0.06] bg-[#0e0e12] px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <FakeSelect label="Focus" value="DE — Germany">
              <MarketCircleFlag marketId="DE" size={14} className="ring-white/15" />
            </FakeSelect>
            <FakeSelect label="Year" value="2026" />
            <FakeSelect label="Quarter" value="Full year" />
            <label className="flex cursor-default items-center gap-1.5 rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 font-landing text-[9px] text-cyan-200/90">
              <span
                className="flex h-3 w-3 items-center justify-center rounded border border-cyan-400/60 bg-cyan-400/25 text-[8px] font-bold text-cyan-100"
                aria-hidden
              >
                ✓
              </span>
              + following quarter
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-0.5">
              <ToolbarIcon>
                <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
              </ToolbarIcon>
              <ToolbarIcon>
                <Box className="h-3.5 w-3.5" strokeWidth={1.75} />
              </ToolbarIcon>
              <ToolbarIcon>
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
              </ToolbarIcon>
              <ToolbarIcon>
                <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} />
              </ToolbarIcon>
              <ToolbarIcon>
                <ZoomIn className="h-3.5 w-3.5" strokeWidth={1.75} />
              </ToolbarIcon>
              <ToolbarIcon>
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
              </ToolbarIcon>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-start gap-2 border-b border-white/[0.05] bg-[#0a0a0c] px-3 py-2.5 sm:px-4">
          <h3 className="font-landing text-sm font-semibold tracking-tight text-white sm:text-base">
            Technology runway · prep vs live · DE
          </h3>
          <MarketCircleFlag marketId="DE" size={20} className="ring-white/15" />
        </div>

        <div className="relative z-10 flex flex-col gap-2 p-2 sm:gap-3 sm:p-4 lg:flex-row lg:items-stretch">
          <IsoLegend />
          <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-stretch">
            <div className="min-h-[200px] min-w-0 flex-1 overflow-x-auto rounded-lg border border-white/[0.05] bg-[#060607] p-1 sm:min-h-[min(52vh,420px)] sm:p-2">
              {svgInner ?? (
                <div className="flex min-h-[200px] items-center justify-center font-landing text-xs text-zinc-500">
                  Preview unavailable.
                </div>
              )}
            </div>
            <div className="w-full shrink-0 lg:w-[min(292px,32vw)] lg:max-w-[300px]">
              <LandingIsoControlsSidepanel />
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
});
