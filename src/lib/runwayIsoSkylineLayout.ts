import {
  calHeightFromMetric,
  isoLayoutCore,
  type IsoLayoutCore,
} from '@/components/RunwayIsoHeatCell';
import type { RunwayCalendarCellValue } from '@/lib/calendarQuarterLayout';

/** Horizontal / vertical spacing between isometric grid anchors (screen space, y increases down). */
export function isoGridSteps(cellPx: number, gap: number): { stepX: number; stepY: number } {
  const stride = cellPx + gap;
  return {
    stepX: stride * 0.52,
    stepY: stride * 0.3,
  };
}

/** Top-left anchor for the virtual cell box (width cellPx, height L.canvasH) — same as stacking weeks horizontally then shearing. */
export function isoCellTopLeft(wi: number, di: number, stepX: number, stepY: number): { ax: number; ay: number } {
  return {
    ax: (di - wi) * stepX,
    ay: (di + wi) * stepY,
  };
}

export type SkylineBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  vbW: number;
  vbH: number;
  pad: number;
  L: IsoLayoutCore;
  runwayBandH: number;
};

const PAD = 14;

/**
 * Bounding box for one month’s isometric skyline SVG (all cells, including tower height).
 */
export function computeSkylineBounds(
  weeks: RunwayCalendarCellValue[][],
  cellPx: number,
  gap: number,
  rowTowerPx: number
): SkylineBounds {
  const L = isoLayoutCore(cellPx, rowTowerPx);
  const { stepX, stepY } = isoGridSteps(cellPx, gap);
  const runwayBandH = Math.max(L.dyy * 2.35, 13);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const stubH = Math.max(2.5, L.dyy * 0.55);
  const deckY = L.canvasH - runwayBandH;

  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi]!;
    for (let di = 0; di < week.length; di++) {
      const cell = week[di]!;
      const { ax, ay } = isoCellTopLeft(wi, di, stepX, stepY);
      const isPad = cell === null;
      const calH =
        cell === false
          ? stubH
          : isPad
            ? calHeightFromMetric(0, rowTowerPx, true)
            : calHeightFromMetric(1, rowTowerPx, false);
      const columnTy = deckY - calH - L.dyy * 1.05;
      const topY = ay + columnTy;
      const bottomY = ay + L.canvasH;

      minX = Math.min(minX, ax, ax + cellPx);
      minY = Math.min(minY, topY, ay);
      maxX = Math.max(maxX, ax + cellPx, ax + 2 * L.dxx);
      maxY = Math.max(maxY, bottomY, ay + L.canvasH);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = cellPx;
    maxY = L.canvasH;
  }

  minX -= PAD;
  minY -= PAD;
  maxX += PAD;
  maxY += PAD;

  return {
    minX,
    minY,
    maxX,
    maxY,
    vbW: maxX - minX,
    vbH: maxY - minY,
    pad: PAD,
    L,
    runwayBandH,
  };
}

/** Month block body height (below weekday row) for vertical layout when using skyline 3D. */
export function skylineMonthBodyHeightPx(
  weeksLen: number,
  cellPx: number,
  gap: number,
  rowTowerPx: number
): number {
  /** Conservative: assume every slot could be a full-height bar (layout / scroll height). */
  const dummy: RunwayCalendarCellValue[][] = Array.from({ length: weeksLen }, () =>
    Array.from({ length: 7 }, () => '2000-01-01' as RunwayCalendarCellValue)
  );
  const b = computeSkylineBounds(dummy, cellPx, gap, rowTowerPx);
  return b.vbH;
}
