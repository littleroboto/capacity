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
  isoCellTopLeft,
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

  /**
   * Iso ground-plane matrix transform components.
   * Normalized so that font-size in local coords ≈ font-size in screen px.
   *
   * Ground-plane axes in screen space:
   *   di direction (front-right): (stepX, stepY)
   *   wi direction (back-left):   (-stepX, stepY)
   */
  const isoLen = Math.sqrt(stepX * stepX + stepY * stepY);
  const uDx = stepX / isoLen;
  const uDy = stepY / isoLen;

  /**
   * Iso ground-plane (non-orthogonal) matrices for label text.
   *
   * With a non-orthogonal matrix, dominantBaseline="central" causes a
   * reading-direction bleed: the y-axis baseline shift has a component along
   * the x-axis because the axes aren't perpendicular. We compensate by
   * shifting the text's local x by the exact bleed amount:
   *   bleedComp = (uDx² − uDy²) × 0.35   (≈ 0.175 for 30° iso)
   * mkt labels get x = −bleedComp × fs, mo labels get x = +bleedComp × fs.
   */
  const BLEED_COMP = (uDx * uDx - uDy * uDy) * 0.35;

  /** Market labels: text reads along +di, projected onto iso ground. */
  const mktMatrix = (tx: number, ty: number) =>
    `matrix(${uDx.toFixed(4)}, ${uDy.toFixed(4)}, ${(-uDx).toFixed(4)}, ${uDy.toFixed(4)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`;

  /** Month/date labels: text reads along -wi, projected onto iso ground. */
  const moMatrix = (tx: number, ty: number) =>
    `matrix(${uDx.toFixed(4)}, ${(-uDy).toFixed(4)}, ${uDx.toFixed(4)}, ${uDy.toFixed(4)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`;

  const maxIsoWi = nWeeks > 0 ? isoWiAt(nWeeks - 1) : 0;
  const maxDi = marketDi(nMarkets - 1, nCols - 1);

  /** Three-letter month codes. */
  const MONTH_3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

  /** Row spacing in iso-wi units between label rows on the right edge. */
  const ROW_GAP = 1.8;

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

  /**
   * Screen position at the visual centre of a chronological week span on the right edge.
   * Averages the iso positions of the first and last cells directly (no +0.5 fudge);
   * the +halfCell offset accounts for the diamond centre within the cell canvas.
   */
  const rightEdgeMidPos = (chronW0: number, chronW1: number, di: number) => {
    const li0 = Math.max(0, Math.min(nWeeks - 1, nWeeks - 1 - chronW0));
    const li1 = Math.max(0, Math.min(nWeeks - 1, nWeeks - 1 - chronW1));
    const isoMid = (isoWiAt(li0) + isoWiAt(li1)) / 2;
    const { ax, ay } = isoCellTopLeft(isoMid, di, stepX, stepY);
    return { tx: ax + halfCell - minX, ty: ay - minY + L.canvasH };
  };

  /** Row 1: two-letter month codes on the right edge. */
  const monthRow = useMemo(() => {
    if (chronGroups.length === 0) return [];
    const di = maxDi + 0.8;
    const out: DateLabel[] = [];
    for (let i = 0; i < chronGroups.length; i++) {
      const g = chronGroups[i]!;
      const w0 = g.weekIndex;
      const w1 = i + 1 < chronGroups.length ? chronGroups[i + 1]!.weekIndex - 1 : nWeeks - 1;
      if (w1 < w0) continue;
      const { tx, ty } = rightEdgeMidPos(w0, w1, di);
      out.push({ key: `mo-${g.sectionYear}-${g.monthIndex}`, tx, ty, text: MONTH_3[g.monthIndex] ?? '' });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chronGroups, nWeeks, monthStartChronWeeks, minX, minY, L, stepX, stepY, maxDi]);

  /** Row 2: quarter labels (Q1–Q4), bigger, centred across their 3-month span. */
  const quarterRow = useMemo(() => {
    if (chronGroups.length === 0) return [];
    const di = maxDi + 0.8 + ROW_GAP;
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
    const di = maxDi + 0.8 + ROW_GAP * 2;
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
        className="block h-full min-h-0 w-full flex-1 overflow-visible text-foreground"
        preserveAspectRatio="xMidYMin meet"
        aria-label="Multi-market isometric city block"
      >
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
          const base = isPad ? 'rgb(51, 65, 85)' : fill;
          const topC = contribPanelFill(base, 'top');
          const leftC = contribPanelFill(base, 'left');
          const rightC = contribPanelFill(base, 'right');
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
                x={-BLEED_COMP * mktFs}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                transform={mktMatrix(tx, ty)}
                className="fill-foreground font-bold tracking-tight"
                fontSize={mktFs}
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
              x={BLEED_COMP * moFs}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              transform={moMatrix(tx, ty)}
              className="fill-muted-foreground font-medium tabular-nums tracking-tight"
              fontSize={moFs}
            >
              {text}
            </text>
          ))}
          {quarterRow.map(({ key, tx, ty, text }) => (
            <text
              key={key}
              x={BLEED_COMP * qFs}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              transform={moMatrix(tx, ty)}
              className="fill-muted-foreground font-bold tabular-nums tracking-tight"
              fontSize={qFs}
            >
              {text}
            </text>
          ))}
          {yearRow.map(({ key, tx, ty, text }) => (
            <text
              key={key}
              x={BLEED_COMP * yrFs}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              transform={moMatrix(tx, ty)}
              className="fill-muted-foreground font-semibold tabular-nums tracking-tight"
              fontSize={yrFs}
            >
              {text}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
});
