import { memo, useCallback, useMemo } from 'react';
import type { ViewModeId } from '@/lib/constants';
import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import type { HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { HEATMAP_RUNWAY_PAD_FILL, transformedHeatmapMetric } from '@/lib/riskHeatmapColors';
import { heatmapCellMetric, runwayHeatmapCellFillAndDim, type TechWorkloadScope } from '@/lib/runwayViewMetrics';
import {
  skylineChronologyGroups,
  type RunwayCalendarCellValue,
  type SkylineChronologyGroup,
  type VerticalYearSection,
} from '@/lib/calendarQuarterLayout';
import {
  isoGroundLabelAnchorAtChronWeek,
  isoGroundMoMatrix,
  isoLabelBleedComp,
  isoLabelLaneDi,
} from '@/lib/runwayIsoGroundLabels';
import {
  computeSkylineBounds,
  isoCellTopLeft,
  isoGroundRightEdgeChronSpanCenter,
  isoGridSteps,
  isoWiForLayoutLi,
  SKYLINE_MONTH_ISO_GAP_STEPS,
} from '@/lib/runwayIsoSkylineLayout';
import {
  IsoColumnAtOrigin,
  calHeightFromMetric,
  contribPanelFill,
  EMPTY_LEFT,
  EMPTY_RIGHT,
  EMPTY_TOP,
  ISO_GROUND_LABEL_TEXT_PROPS,
  ISO_PAD_LEFT,
  ISO_PAD_RIGHT,
  ISO_PAD_TOP,
  isoHandlers,
  type IsoLayoutCore,
} from '@/components/RunwayIsoHeatCell';

type RunwayTipAnchor = { clientX: number; clientY: number };

export type RunwayIsoSkylineProps = {
  moKey: string;
  weeks: RunwayCalendarCellValue[][];
  /** When set, major week boundaries draw faint seams on the ground plane (3D runway). */
  sections?: VerticalYearSection[];
  cellPx: number;
  gap: number;
  rowTowerPx: number;
  riskByDate: Map<string, RiskRow>;
  heatmapOpts: HeatmapColorOpts;
  riskTuning: RiskModelTuning;
  viewMode: ViewModeId;
  techWorkloadScope: TechWorkloadScope;
  todayYmd: string;
  dimPastDays: boolean;
  openDayDetailsFromCell: (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => void;
};

function deckAndColumnY(L: IsoLayoutCore, calH: number, runwayBandH: number): number {
  const deckY = L.canvasH - runwayBandH;
  return deckY - calH - L.dyy * 1.05;
}

/** Quarter starts + year-section starts only — keeps the runway readable. */
function isMajorChronologyMarker(g: SkylineChronologyGroup): boolean {
  return g.yearLabel != null || g.quarterLabel != null;
}

function chronologyLineStyleMajor(g: SkylineChronologyGroup): { width: number; opacity: number } | null {
  if (g.weekIndex === 0) return null;
  if (g.yearLabel) return { width: 1.4, opacity: 0.38 };
  if (g.quarterLabel) return { width: 0.95, opacity: 0.28 };
  return null;
}

/** Week-boundary seam: use the same weekday column on both weeks so the segment follows iso “week” steps (−stepX,+stepY), not a diagonal across the row. */
function groundSeamWeekdayCol(nDayCols: number): number {
  return Math.max(0, Math.min(nDayCols - 1, Math.floor((nDayCols - 1) / 2)));
}

export const RunwayIsoSkyline = memo(function RunwayIsoSkyline({
  moKey,
  weeks,
  sections,
  cellPx,
  gap,
  rowTowerPx,
  riskByDate,
  heatmapOpts,
  riskTuning,
  viewMode,
  techWorkloadScope,
  todayYmd,
  dimPastDays,
  openDayDetailsFromCell,
}: RunwayIsoSkylineProps) {
  /** Earliest model dates sit nearest (front); latest recede — reverse chronological week order for layout. */
  const layoutWeeks = useMemo(() => [...weeks].reverse(), [weeks]);
  const nWeeks = layoutWeeks.length;

  const { stepX, stepY } = useMemo(() => isoGridSteps(cellPx, gap), [cellPx, gap]);

  const chronologyAll = useMemo(
    () => (sections?.length ? skylineChronologyGroups(sections) : []),
    [sections]
  );
  const monthStartChronWeeks = useMemo(
    () => chronologyAll.map((g) => g.weekIndex).filter((w) => w > 0),
    [chronologyAll]
  );

  const monthPack = useMemo(
    () => ({ monthGapSteps: SKYLINE_MONTH_ISO_GAP_STEPS, monthStartChronWeeks }),
    [monthStartChronWeeks]
  );

  const bounds = useMemo(
    () => computeSkylineBounds(layoutWeeks, cellPx, gap, rowTowerPx, monthPack),
    [layoutWeeks, cellPx, gap, rowTowerPx, monthPack]
  );
  const { minX, minY, vbW, vbH, L, runwayBandH } = bounds;

  /** Chronological flat index → layout week index (after reverse). */
  const chronToLayoutWi = (chronWeekIndex: number) => nWeeks - 1 - chronWeekIndex;

  const chronologyMajor = useMemo(
    () => chronologyAll.filter(isMajorChronologyMarker),
    [chronologyAll]
  );

  const layoutToIsoWi = (layoutLi: number) =>
    isoWiForLayoutLi(layoutLi, nWeeks, SKYLINE_MONTH_ISO_GAP_STEPS, monthStartChronWeeks);

  const groundPoint = useCallback(
    (layoutLi: number, di: number) => {
      const isoW = isoWiForLayoutLi(layoutLi, nWeeks, SKYLINE_MONTH_ISO_GAP_STEPS, monthStartChronWeeks);
      const { ax, ay } = isoCellTopLeft(isoW, di, stepX, stepY);
      return { x: ax - minX, y: ay - minY + L.canvasH };
    },
    [nWeeks, monthStartChronWeeks, stepX, stepY, minX, minY, L.canvasH]
  );

  /* ── Iso ground-plane date labels (right edge) ─────────────────────── */

  const nCols = layoutWeeks[0]?.length ?? 7;
  const maxDi = nCols - 1;
  const halfCell = cellPx / 2;
  const labelBleed = isoLabelBleedComp(stepX, stepY);

  const MONTH_3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

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

  const monthRow = useMemo(() => {
    if (chronologyAll.length === 0) return [];
    const diLane = isoLabelLaneDi(maxDi, 0);
    const out: DateLabel[] = [];
    for (let i = 0; i < chronologyAll.length; i++) {
      const g = chronologyAll[i]!;
      const w0 = g.weekIndex;
      const w1 = i + 1 < chronologyAll.length ? chronologyAll[i + 1]!.weekIndex - 1 : nWeeks - 1;
      if (w1 < w0) continue;
      /** ~⅔ through the month’s weeks (clamped) — pure midpoint still read early on the iso strip. */
      const wMonthLabel = Math.min(w1, Math.max(w0, w0 + Math.round((w1 - w0) * (2 / 3))));
      const { tx, ty } = isoGroundLabelAnchorAtChronWeek(
        wMonthLabel,
        diLane,
        nWeeks,
        stepX,
        stepY,
        halfCell,
        minX,
        minY,
        L.canvasH,
        (li) => layoutToIsoWi(li)
      );
      out.push({ key: `mo-${g.sectionYear}-${g.monthIndex}`, tx, ty, text: MONTH_3[g.monthIndex] ?? '' });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chronologyAll, nWeeks, monthStartChronWeeks, minX, minY, L, stepX, stepY, maxDi, cellPx]);

  const quarterRow = useMemo(() => {
    if (chronologyAll.length === 0) return [];
    const di = isoLabelLaneDi(maxDi, 1);
    const out: DateLabel[] = [];
    let i = 0;
    while (i < chronologyAll.length) {
      const g = chronologyAll[i]!;
      if (!g.quarterLabel) { i++; continue; }
      const qStart = g.weekIndex;
      let qEnd = nWeeks - 1;
      for (let j = i + 1; j < chronologyAll.length; j++) {
        if (chronologyAll[j]!.quarterLabel) { qEnd = chronologyAll[j]!.weekIndex - 1; break; }
      }
      const { tx, ty } = rightEdgeMidPos(qStart, qEnd, di);
      out.push({ key: `q-${g.sectionYear}-${g.quarterLabel}`, tx, ty, text: g.quarterLabel });
      i++;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chronologyAll, nWeeks, monthStartChronWeeks, minX, minY, L, stepX, stepY, maxDi, cellPx]);

  const yearRow = useMemo(() => {
    if (chronologyAll.length === 0) return [];
    const di = isoLabelLaneDi(maxDi, 2);
    const out: DateLabel[] = [];
    let i = 0;
    while (i < chronologyAll.length) {
      const g = chronologyAll[i]!;
      if (!g.yearLabel) { i++; continue; }
      const yStart = g.weekIndex;
      let yEnd = nWeeks - 1;
      for (let j = i + 1; j < chronologyAll.length; j++) {
        if (chronologyAll[j]!.yearLabel) { yEnd = chronologyAll[j]!.weekIndex - 1; break; }
      }
      const { tx, ty } = rightEdgeMidPos(yStart, yEnd, di);
      out.push({ key: `yr-${g.sectionYear}`, tx, ty, text: g.yearLabel });
      i++;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chronologyAll, nWeeks, monthStartChronWeeks, minX, minY, L, stepX, stepY, maxDi, cellPx]);

  const moFs = Math.max(8, stepX * 1.5);
  const qFs = Math.max(10, stepX * 1.9);
  const yrFs = Math.max(9, stepX * 1.7);

  const labelPadRight = stepX * 3 + 20;
  const labelPadBottom = stepY * 3 + 20;
  const adjVbW = vbW + labelPadRight;
  const adjVbH = vbH + labelPadBottom;

  const cells = useMemo(() => {
    const out: { li: number; di: number; cell: RunwayCalendarCellValue; depth: number }[] = [];
    for (let li = 0; li < layoutWeeks.length; li++) {
      const week = layoutWeeks[li]!;
      const isoW = isoWiForLayoutLi(li, nWeeks, SKYLINE_MONTH_ISO_GAP_STEPS, monthStartChronWeeks);
      for (let di = 0; di < week.length; di++) {
        const cell = week[di]!;
        out.push({ li, di, cell, depth: isoW + di });
      }
    }
    out.sort((a, b) => a.depth - b.depth);
    return out;
  }, [layoutWeeks, nWeeks, monthStartChronWeeks]);

  const stubH = Math.max(2.5, L.dyy * 0.55);

  return (
    <div
      className="relative flex h-[min(86dvh,calc(100dvh-6.5rem))] min-h-0 w-full max-w-full flex-1 flex-col overflow-visible bg-background"
      data-runway-iso-skyline
    >
      <svg
        viewBox={`0 0 ${adjVbW} ${adjVbH}`}
        width="100%"
        height="100%"
        className="block h-full min-h-0 w-full flex-1 overflow-visible text-foreground [shape-rendering:geometricPrecision]"
        preserveAspectRatio="xMidYMin meet"
        aria-label="Isometric pressure skyline"
      >
        {chronologyMajor.length > 0 && (
          <g className="pointer-events-none text-muted-foreground" aria-hidden>
            {chronologyMajor.map((g) => {
              const style = chronologyLineStyleMajor(g);
              if (!style) return null;
              const cPrev = g.weekIndex - 1;
              const cCurr = g.weekIndex;
              const diSeam = groundSeamWeekdayCol(nCols);
              const a = groundPoint(chronToLayoutWi(cPrev), diSeam);
              const b = groundPoint(chronToLayoutWi(cCurr), diSeam);
              return (
                <line
                  key={`chrono-line-${g.weekIndex}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="currentColor"
                  strokeWidth={style.width}
                  strokeLinecap="round"
                  opacity={Math.min(1, style.opacity * 1.2)}
                />
              );
            })}
          </g>
        )}
        {cells.map(({ li, di, cell }) => {
          const { ax, ay } = isoCellTopLeft(layoutToIsoWi(li), di, stepX, stepY);
          const gx = ax - minX;
          const gy = ay - minY;

          if (cell === false) {
            const calH = stubH;
            const columnTy = deckAndColumnY(L, calH, runwayBandH);
            return (
              <g
                key={`${moKey}-${li}-${di}-empty`}
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
          const row = dateStr ? riskByDate.get(dateStr) : undefined;
          const metric = row ? heatmapCellMetric(row, viewMode, riskTuning, techWorkloadScope) : undefined;
          const { fill, dimOpacity } = !dateStr
            ? { fill: HEATMAP_RUNWAY_PAD_FILL, dimOpacity: 1 }
            : runwayHeatmapCellFillAndDim(viewMode, techWorkloadScope, metric, heatmapOpts, row);
          const pastDimmed = dimPastDays && typeof dateStr === 'string' && dateStr < todayYmd;
          const isPad = !dateStr;
          const height01 = transformedHeatmapMetric(viewMode, metric, heatmapOpts);
          const calH = calHeightFromMetric(height01, rowTowerPx, isPad);
          const columnTy = deckAndColumnY(L, calH, runwayBandH);
          const topC = isPad ? ISO_PAD_TOP : contribPanelFill(fill, 'top');
          const leftC = isPad ? ISO_PAD_LEFT : contribPanelFill(fill, 'left');
          const rightC = isPad ? ISO_PAD_RIGHT : contribPanelFill(fill, 'right');
          const dot =
            !isPad && typeof dateStr === 'string' && dateStr === todayYmd
              ? { x: L.dxx * 0.48, y: L.dyy * 0.42 }
              : null;

          const handlers = isoHandlers(openDayDetailsFromCell, dateStr, di);
          const gOpacity = pastDimmed ? 0.25 : dimOpacity < 0.999 ? dimOpacity : 1;

          return (
            <g
              key={`${moKey}-${li}-${di}`}
              transform={`translate(${gx.toFixed(2)} ${gy.toFixed(2)})`}
              style={{ opacity: gOpacity }}
            >
              <g transform={`translate(${L.tx.toFixed(2)} ${columnTy.toFixed(2)})`}>
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
                  {...handlers}
                >
                  <IsoColumnAtOrigin L={L} calH={calH} topC={topC} leftC={leftC} rightC={rightC} dot={dot} />
                </g>
              </g>
            </g>
          );
        })}
        {/* Date labels — iso ground plane, right edge: months → quarters → years */}
        <g className="pointer-events-none" aria-hidden>
          {monthRow.map(({ key, tx, ty, text }) => (
            <text
              key={key}
              x={labelBleed * moFs}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              transform={isoGroundMoMatrix(tx, ty, stepX, stepY)}
              className="fill-muted-foreground font-medium tabular-nums tracking-tight"
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
              className="fill-muted-foreground font-bold tabular-nums tracking-tight"
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
              className="fill-muted-foreground font-semibold tabular-nums tracking-tight"
              fontSize={yrFs}
              {...ISO_GROUND_LABEL_TEXT_PROPS}
            >
              {text}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
});
