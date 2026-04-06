import { memo, useMemo } from 'react';
import type { ViewModeId } from '@/lib/constants';
import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import {
  HEATMAP_RUNWAY_PAD_FILL,
  transformedHeatmapMetric,
  type HeatmapColorOpts,
} from '@/lib/riskHeatmapColors';
import {
  heatmapCellMetric,
  runwayHeatmapCellFillAndDim,
  type TechWorkloadScope,
} from '@/lib/runwayViewMetrics';
import type { RunwayCalendarCellValue, VerticalYearSection } from '@/lib/calendarQuarterLayout';
import {
  flattenRunwayWeeksFromSections,
  skylineChronologyGroups,
} from '@/lib/calendarQuarterLayout';
import {
  isoGroundLabelAnchorAtChronWeek,
  isoGroundMktMatrix,
  isoGroundMoMatrix,
  isoLabelBleedComp,
  isoLabelLaneDi,
} from '@/lib/runwayIsoGroundLabels';
import {
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
  isoLayoutCore,
  EMPTY_TOP,
  EMPTY_LEFT,
  EMPTY_RIGHT,
  ISO_GROUND_LABEL_TEXT_PROPS,
  ISO_PAD_LEFT,
  ISO_PAD_RIGHT,
  ISO_PAD_TOP,
  type IsoLayoutCore,
} from '@/components/RunwayIsoHeatCell';

export type RunwayIsoCityBlockProps = {
  sections: VerticalYearSection[];
  markets: string[];
  riskSurface: RiskRow[];
  cellPx: number;
  heatmapOpts: HeatmapColorOpts;
  riskTuning: RiskModelTuning;
  viewMode: ViewModeId;
  techWorkloadScope: TechWorkloadScope;
  todayYmd: string;
  dimPastDays: boolean;
};

/** Fractional iso-di gap between adjacent market strips. */
const MARKET_GAP_STEPS = 0.7;
const ISO_GAP = 0;

function deckAndColumnY(L: IsoLayoutCore, calH: number, runwayBandH: number): number {
  const deckY = L.canvasH - runwayBandH;
  return deckY - calH - L.dyy * 1.05;
}

export const RunwayIsoCityBlock = memo(function RunwayIsoCityBlock({
  sections,
  markets,
  riskSurface,
  cellPx,
  heatmapOpts,
  riskTuning,
  viewMode,
  techWorkloadScope,
  todayYmd,
  dimPastDays,
}: RunwayIsoCityBlockProps) {
  const towerPx = Math.round(cellPx * 1.4);

  const flatWeeks = useMemo(
    () => flattenRunwayWeeksFromSections(sections),
    [sections]
  );

  const layoutWeeks = useMemo(() => [...flatWeeks].reverse(), [flatWeeks]);
  const nWeeks = layoutWeeks.length;
  const nMarkets = markets.length;
  const nCols = layoutWeeks[0]?.length ?? 7;

  const { stepX, stepY } = useMemo(
    () => isoGridSteps(cellPx, ISO_GAP),
    [cellPx]
  );
  const L = useMemo(() => isoLayoutCore(cellPx, towerPx), [cellPx, towerPx]);

  const chronGroups = useMemo(() => skylineChronologyGroups(sections), [sections]);
  const monthStartChronWeeks = useMemo(
    () => chronGroups.map((g) => g.weekIndex).filter((w) => w > 0),
    [chronGroups]
  );

  const isoWiAt = (li: number) =>
    isoWiForLayoutLi(li, nWeeks, SKYLINE_MONTH_ISO_GAP_STEPS, monthStartChronWeeks);

  /** Map di for a given market index and weekday column. */
  const marketDi = (mi: number, dayCol: number) =>
    mi * (nCols + MARKET_GAP_STEPS) + dayCol;

  const riskByMarket = useMemo(() => {
    const map = new Map<string, Map<string, RiskRow>>();
    for (const m of markets) map.set(m, new Map());
    for (const row of riskSurface) {
      map.get(row.market)?.set(row.date, row);
    }
    return map;
  }, [markets, riskSurface]);

  /** All cells sorted by depth for painter-order rendering. */
  const cells = useMemo(() => {
    const out: {
      li: number;
      mi: number;
      di: number;
      dayCol: number;
      cell: RunwayCalendarCellValue;
      isoW: number;
      depth: number;
    }[] = [];
    for (let li = 0; li < nWeeks; li++) {
      const week = layoutWeeks[li]!;
      const isoW = isoWiAt(li);
      for (let mi = 0; mi < nMarkets; mi++) {
        for (let dc = 0; dc < week.length; dc++) {
          const di = marketDi(mi, dc);
          out.push({ li, mi, di, dayCol: dc, cell: week[dc]!, isoW, depth: isoW + di });
        }
      }
    }
    out.sort((a, b) => a.depth - b.depth);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutWeeks, nWeeks, nMarkets, monthStartChronWeeks]);

  const runwayBandH = Math.max(L.dyy * 2.35, 13);
  const stubH = Math.max(2.5, L.dyy * 0.55);

  /** SVG bounds. */
  const bounds = useMemo(() => {
    const pad = 14;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxGroundAbs = -Infinity;

    const deckY = L.canvasH - runwayBandH;

    for (const { isoW, di, cell } of cells) {
      const { ax, ay } = isoCellTopLeft(isoW, di, stepX, stepY);
      const isPad = cell === null;
      const calH =
        cell === false
          ? stubH
          : isPad
            ? calHeightFromMetric(0, towerPx, true)
            : calHeightFromMetric(1, towerPx, false);
      const columnTy = deckY - calH - L.dyy * 1.05;
      const topY = ay + columnTy;
      const bottomY = ay + L.canvasH;

      minX = Math.min(minX, ax);
      minY = Math.min(minY, topY, ay);
      maxX = Math.max(maxX, ax + 2 * L.dxx);
      maxY = Math.max(maxY, bottomY);
      maxGroundAbs = Math.max(maxGroundAbs, ay + L.canvasH);
    }

    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = cellPx;
      maxY = L.canvasH;
      maxGroundAbs = L.canvasH;
    }

    const labelPad = stepY * 3 + 20;
    maxY += labelPad;
    maxX += stepX * 3;
    minX -= stepX * 2;
    minY -= stepY * 2;

    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    return { minX, minY, vbW: maxX - minX, vbH: maxY - minY };
  }, [cells, cellPx, L, stepX, stepY, towerPx, runwayBandH, stubH]);

  const { minX, minY, vbW, vbH } = bounds;

  /** Faint ground seams between market strips (compare-all 3D); middle of fractional inter-market gap in `di`. */
  const marketStripSeams = useMemo(() => {
    if (nMarkets < 2 || nWeeks < 1) return [];
    const G = MARKET_GAP_STEPS;
    const out: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let mi = 0; mi < nMarkets - 1; mi++) {
      const di = mi * (nCols + G) + (nCols - 1) + G / 2;
      const isoW0 = isoWiAt(0);
      const isoW1 = isoWiAt(nWeeks - 1);
      const p0 = isoCellTopLeft(isoW0, di, stepX, stepY);
      const p1 = isoCellTopLeft(isoW1, di, stepX, stepY);
      out.push({
        key: `mkt-seam-${mi}`,
        x1: p0.ax - minX,
        y1: p0.ay - minY + L.canvasH,
        x2: p1.ax - minX,
        y2: p1.ay - minY + L.canvasH,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nMarkets, nWeeks, nCols, monthStartChronWeeks, minX, minY, L.canvasH, stepX, stepY]);

  const maxIsoWi = nWeeks > 0 ? isoWiAt(nWeeks - 1) : 0;
  const maxDi = marketDi(nMarkets - 1, nCols - 1);
  const labelBleed = isoLabelBleedComp(stepX, stepY);

  /** Three-letter month codes. */
  const MONTH_3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

  /**
   * Ground-plane anchor at the visual centre of a span of iso cells.
   *
   * isoCellTopLeft returns the top-left of the cell canvas; the rendered
   * column diamond is centred at +cellPx/2 in screen-x within that canvas.
   * To centre a label on a group of columns we average the diamond-centre
   * positions of the first and last cell, which equals:
   *   isoCellTopLeft( avg(isoW), di ) + cellPx/2   in screen-x
   *   isoCellTopLeft( avg(isoW), di ) + canvasH     in screen-y (ground level)
   */
  const halfCell = cellPx / 2;

  /** Market labels at the back edge, centred on each strip's midpoint. */
  const marketLabels = useMemo(() => {
    const out: { key: string; tx: number; ty: number; label: string }[] = [];
    const labelWi = maxIsoWi + 1.5;
    const midDayCol = (nCols - 1) / 2;
    for (let mi = 0; mi < nMarkets; mi++) {
      const midDi = marketDi(mi, midDayCol);
      const { ax, ay } = isoCellTopLeft(labelWi, midDi, stepX, stepY);
      out.push({
        key: `mkt-${mi}`,
        tx: ax + halfCell - minX,
        ty: ay - minY + L.canvasH,
        label: markets[mi]!,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nMarkets, nCols, markets, stepX, stepY, minX, minY, L, maxIsoWi, cellPx]);


  type DateLabel = { key: string; tx: number; ty: number; text: string };

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
      (li) => isoWiAt(li)
    );

  /** Row 1: month codes on the label lane (same lattice as cells; see {@link isoLabelLaneDi}). */
  const monthRow = useMemo(() => {
    if (chronGroups.length === 0) return [];
    const diLane = isoLabelLaneDi(maxDi, 0);
    const out: DateLabel[] = [];
    for (let i = 0; i < chronGroups.length; i++) {
      const g = chronGroups[i]!;
      const w0 = g.weekIndex;
      const w1 = i + 1 < chronGroups.length ? chronGroups[i + 1]!.weekIndex - 1 : nWeeks - 1;
      if (w1 < w0) continue;
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
        (li) => isoWiAt(li)
      );
      out.push({ key: `mo-${g.sectionYear}-${g.monthIndex}`, tx, ty, text: MONTH_3[g.monthIndex] ?? '' });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chronGroups, nWeeks, monthStartChronWeeks, minX, minY, L, stepX, stepY, maxDi, cellPx]);

  /** Row 2: quarter labels (Q1–Q4), bigger, centred across their 3-month span. */
  const quarterRow = useMemo(() => {
    if (chronGroups.length === 0) return [];
    const di = isoLabelLaneDi(maxDi, 1);
    const out: DateLabel[] = [];
    let i = 0;
    while (i < chronGroups.length) {
      const g = chronGroups[i]!;
      if (!g.quarterLabel) { i++; continue; }
      const qStart = g.weekIndex;
      let qEnd = nWeeks - 1;
      for (let j = i + 1; j < chronGroups.length; j++) {
        if (chronGroups[j]!.quarterLabel) { qEnd = chronGroups[j]!.weekIndex - 1; break; }
      }
      const { tx, ty } = rightEdgeMidPos(qStart, qEnd, di);
      out.push({ key: `q-${g.sectionYear}-${g.quarterLabel}`, tx, ty, text: g.quarterLabel });
      i++;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chronGroups, nWeeks, monthStartChronWeeks, minX, minY, L, stepX, stepY, maxDi]);

  /** Row 3: year labels, centred across all months in that year section. */
  const yearRow = useMemo(() => {
    if (chronGroups.length === 0) return [];
    const di = isoLabelLaneDi(maxDi, 2);
    const out: DateLabel[] = [];
    let i = 0;
    while (i < chronGroups.length) {
      const g = chronGroups[i]!;
      if (!g.yearLabel) { i++; continue; }
      const yStart = g.weekIndex;
      let yEnd = nWeeks - 1;
      for (let j = i + 1; j < chronGroups.length; j++) {
        if (chronGroups[j]!.yearLabel) { yEnd = chronGroups[j]!.weekIndex - 1; break; }
      }
      const { tx, ty } = rightEdgeMidPos(yStart, yEnd, di);
      out.push({ key: `yr-${g.sectionYear}`, tx, ty, text: g.yearLabel });
      i++;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chronGroups, nWeeks, monthStartChronWeeks, minX, minY, L, stepX, stepY, maxDi]);

  const mktFs = Math.max(10, stepX * 2.8);
  const moFs = Math.max(8, stepX * 1.5);
  const qFs = Math.max(10, stepX * 1.9);
  const yrFs = Math.max(9, stepX * 1.7);

  return (
    <div
      className="relative flex h-[min(86dvh,calc(100dvh-6.5rem))] min-h-0 w-full max-w-full flex-1 flex-col overflow-visible bg-background"
      data-runway-iso-city-block
    >
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        className="block h-full min-h-0 w-full flex-1 overflow-visible text-foreground [shape-rendering:geometricPrecision]"
        preserveAspectRatio="xMidYMin meet"
        aria-label="Multi-market isometric city block"
      >
        {marketStripSeams.length > 0 ? (
          <g
            className="pointer-events-none text-muted-foreground opacity-[0.2] dark:opacity-[0.34]"
            aria-hidden
          >
            {marketStripSeams.map(({ key, x1, y1, x2, y2 }) => (
              <line
                key={key}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth={1}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        ) : null}
        {cells.map(({ li, mi, di, dayCol, cell, isoW }) => {
          const { ax, ay } = isoCellTopLeft(isoW, di, stepX, stepY);
          const gx = ax - minX;
          const gy = ay - minY;

          if (cell === false) {
            const calH = stubH;
            const columnTy = deckAndColumnY(L, calH, runwayBandH);
            return (
              <g
                key={`cb-${li}-${mi}-${dayCol}-e`}
                transform={`translate(${gx.toFixed(2)} ${gy.toFixed(2)})`}
                aria-hidden
              >
                <g transform={`translate(${L.tx.toFixed(2)} ${columnTy.toFixed(2)})`}>
                  <IsoColumnAtOrigin L={L} calH={calH} topC={EMPTY_TOP} leftC={EMPTY_LEFT} rightC={EMPTY_RIGHT} />
                </g>
              </g>
            );
          }

          const dateStr = cell;
          const riskByDate = riskByMarket.get(markets[mi]!)!;
          const row = dateStr ? riskByDate.get(dateStr) : undefined;
          const metric = row ? heatmapCellMetric(row, viewMode, riskTuning, techWorkloadScope) : undefined;
          const { fill, dimOpacity } = !dateStr
            ? { fill: HEATMAP_RUNWAY_PAD_FILL, dimOpacity: 1 }
            : runwayHeatmapCellFillAndDim(viewMode, techWorkloadScope, metric, heatmapOpts, row);
          const pastDimmed = dimPastDays && typeof dateStr === 'string' && dateStr < todayYmd;
          const isPad = !dateStr;
          const height01 = transformedHeatmapMetric(viewMode, metric, heatmapOpts);
          const calH = calHeightFromMetric(height01, towerPx, isPad);
          const columnTy = deckAndColumnY(L, calH, runwayBandH);
          const topC = isPad ? ISO_PAD_TOP : contribPanelFill(fill, 'top');
          const leftC = isPad ? ISO_PAD_LEFT : contribPanelFill(fill, 'left');
          const rightC = isPad ? ISO_PAD_RIGHT : contribPanelFill(fill, 'right');
          const dot =
            !isPad && typeof dateStr === 'string' && dateStr === todayYmd && mi === 0
              ? { x: L.dxx * 0.48, y: L.dyy * 0.42 }
              : null;
          const gOpacity = pastDimmed ? 0.25 : dimOpacity < 0.999 ? dimOpacity : 1;

          return (
            <g
              key={`cb-${li}-${mi}-${dayCol}`}
              transform={`translate(${gx.toFixed(2)} ${gy.toFixed(2)})`}
              style={gOpacity < 1 ? { opacity: gOpacity } : undefined}
            >
              <g transform={`translate(${L.tx.toFixed(2)} ${columnTy.toFixed(2)})`}>
                <IsoColumnAtOrigin L={L} calH={calH} topC={topC} leftC={leftC} rightC={rightC} dot={dot} />
              </g>
            </g>
          );
        })}

        {/* Market labels — iso ground plane, back edge */}
        <g className="pointer-events-none" aria-hidden>
          {marketLabels.map(({ key, tx, ty, label }) => (
              <text
                key={key}
                x={-labelBleed * mktFs}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                transform={isoGroundMktMatrix(tx, ty, stepX, stepY)}
                className="fill-foreground font-bold tracking-tight"
                fontSize={mktFs}
                {...ISO_GROUND_LABEL_TEXT_PROPS}
              >
                {label}
              </text>
          ))}
        </g>

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
