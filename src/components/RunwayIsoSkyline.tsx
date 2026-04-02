import { memo, useMemo } from 'react';
import type { ViewModeId } from '@/lib/constants';
import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import type { HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { HEATMAP_RUNWAY_PAD_FILL } from '@/lib/riskHeatmapColors';
import { transformedHeatmapMetric } from '@/lib/riskHeatmapColors';
import { heatmapCellMetric, runwayHeatmapCellFillAndDim, type TechWorkloadScope } from '@/lib/runwayViewMetrics';
import {
  skylineChronologyGroups,
  type RunwayCalendarCellValue,
  type SkylineChronologyGroup,
  type VerticalYearSection,
} from '@/lib/calendarQuarterLayout';
import { computeSkylineBounds, isoCellTopLeft, isoGridSteps } from '@/lib/runwayIsoSkylineLayout';
import {
  IsoColumnAtOrigin,
  calHeightFromMetric,
  contribPanelFill,
  EMPTY_LEFT,
  EMPTY_RIGHT,
  EMPTY_TOP,
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
  const { stepX, stepY } = useMemo(() => isoGridSteps(cellPx, gap), [cellPx, gap]);

  const bounds = useMemo(
    () => computeSkylineBounds(weeks, cellPx, gap, rowTowerPx),
    [weeks, cellPx, gap, rowTowerPx]
  );
  const { minX, minY, vbW, vbH, L, runwayBandH } = bounds;

  const chronologyAll = useMemo(
    () => (sections?.length ? skylineChronologyGroups(sections) : []),
    [sections]
  );
  const chronologyMajor = useMemo(
    () => chronologyAll.filter(isMajorChronologyMarker),
    [chronologyAll]
  );

  /** Center of each calendar month along the ground plane (between Sun–Sat for a mid-week row). */
  const monthGroundLabels = useMemo(() => {
    if (!chronologyAll.length || !weeks.length) return [];
    const gp = (wi: number, di: number) => {
      const { ax, ay } = isoCellTopLeft(wi, di, stepX, stepY);
      return { x: ax - minX, y: ay - minY + L.canvasH };
    };
    return chronologyAll.map((g, i) => {
      const next = chronologyAll[i + 1];
      const endWi = next ? next.weekIndex : weeks.length;
      const span = Math.max(1, endWi - g.weekIndex);
      const midWi = Math.min(g.weekIndex + Math.floor(span / 2), weeks.length - 1);
      const a = gp(midWi, 0);
      const b = gp(midWi, 6);
      const x = (a.x + b.x) / 2;
      const y = Math.max(a.y, b.y) + 10;
      const primary =
        (g.quarterLabel ? `${g.quarterLabel} · ` : '') +
        g.monthLabel +
        (g.yearLabel ? ` ${g.yearLabel}` : '');
      return {
        key: `${g.weekIndex}-${g.monthLabel}`,
        x,
        y,
        primary,
      };
    });
  }, [chronologyAll, weeks.length, minX, minY, stepX, stepY, L.canvasH]);

  const cells = useMemo(() => {
    const out: { wi: number; di: number; cell: RunwayCalendarCellValue; depth: number }[] = [];
    for (let wi = 0; wi < weeks.length; wi++) {
      const week = weeks[wi]!;
      for (let di = 0; di < week.length; di++) {
        const cell = week[di]!;
        out.push({ wi, di, cell, depth: wi + di });
      }
    }
    out.sort((a, b) => a.depth - b.depth);
    return out;
  }, [weeks]);

  const stubH = Math.max(2.5, L.dyy * 0.55);

  const groundPoint = (wi: number, di: number) => {
    const { ax, ay } = isoCellTopLeft(wi, di, stepX, stepY);
    return { x: ax - minX, y: ay - minY + L.canvasH };
  };

  return (
    <div
      className="relative flex h-[min(86dvh,calc(100dvh-6.5rem))] min-h-0 w-full max-w-full flex-1 flex-col overflow-visible bg-background"
      data-runway-iso-skyline
    >
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        className="block h-full min-h-0 w-full flex-1 overflow-visible text-foreground"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Isometric pressure skyline"
      >
        {chronologyMajor.length > 0 && (
          <g className="pointer-events-none" aria-hidden>
            {chronologyMajor.map((g) => {
              const style = chronologyLineStyleMajor(g);
              if (!style) return null;
              const wi = g.weekIndex;
              const a = groundPoint(wi - 1, 6);
              const b = groundPoint(wi, 0);
              return (
                <line
                  key={`chrono-line-${g.weekIndex}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="stroke-border"
                  strokeWidth={style.width}
                  opacity={style.opacity}
                />
              );
            })}
          </g>
        )}
        {cells.map(({ wi, di, cell }) => {
          const { ax, ay } = isoCellTopLeft(wi, di, stepX, stepY);
          const gx = ax - minX;
          const gy = ay - minY;

          if (cell === false) {
            const calH = stubH;
            const columnTy = deckAndColumnY(L, calH, runwayBandH);
            return (
              <g
                key={`${moKey}-${wi}-${di}-empty`}
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
          const base = isPad ? 'rgb(51, 65, 85)' : fill;
          const topC = contribPanelFill(base, 'top');
          const leftC = contribPanelFill(base, 'left');
          const rightC = contribPanelFill(base, 'right');
          const dot =
            !isPad && typeof dateStr === 'string' && dateStr === todayYmd
              ? { x: L.dxx * 0.48, y: L.dyy * 0.42 }
              : null;

          const handlers = isoHandlers(openDayDetailsFromCell, dateStr, di);
          const gOpacity = pastDimmed ? 0.25 : dimOpacity < 0.999 ? dimOpacity : 1;

          return (
            <g
              key={`${moKey}-${wi}-${di}`}
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
        {monthGroundLabels.length > 0 && (
          <g className="pointer-events-none select-none" aria-hidden>
            {monthGroundLabels.map((m) => (
              <text
                key={m.key}
                x={m.x}
                y={m.y}
                textAnchor="middle"
                dominantBaseline="hanging"
                className="fill-muted-foreground stroke-background"
                strokeWidth={4}
                paintOrder="stroke fill"
                style={{
                  fontSize: 8.75,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}
              >
                {m.primary}
              </text>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
});
