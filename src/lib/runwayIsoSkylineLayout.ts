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

/** Extra iso “week” spacing inserted at each new calendar month (first-week indices, chronological). */
export const SKYLINE_MONTH_ISO_GAP_STEPS = 0.65;

export type SkylineMonthPackOpts = {
  monthGapSteps: number;
  /** First week index of each month in chronological order; omit 0 (model start). */
  monthStartChronWeeks: readonly number[];
};

function packedChronologicalWi(
  chronWeekIndex: number,
  monthGapSteps: number,
  monthStartChronWeeks: readonly number[]
): number {
  let b = 0;
  for (const s of monthStartChronWeeks) {
    if (s > 0 && s <= chronWeekIndex) b++;
  }
  return chronWeekIndex + monthGapSteps * b;
}

/**
 * Maps reversed layout week index (0 = latest chronologically) to iso row index with month gaps.
 * Contiguous in time except +{@link SkylineMonthPackOpts.monthGapSteps} across month boundaries.
 */
export function isoWiForLayoutLi(
  layoutLi: number,
  nWeeks: number,
  monthGapSteps: number,
  monthStartChronWeeks: readonly number[]
): number {
  if (nWeeks < 1) return 0;
  const cwi = nWeeks - 1 - layoutLi;
  const packLast = packedChronologicalWi(nWeeks - 1, monthGapSteps, monthStartChronWeeks);
  const packHere = packedChronologicalWi(cwi, monthGapSteps, monthStartChronWeeks);
  return packLast - packHere;
}

/** Layout row index for chronological week `chronWeekIndex` (0 = first week in model). */
export function layoutLiForChronWeek(chronWeekIndex: number, nWeeks: number): number {
  return Math.max(0, Math.min(nWeeks - 1, nWeeks - 1 - chronWeekIndex));
}

/**
 * Ground-plane point for month/quarter/year labels on the right edge (column `di`): chronological **centre** of weeks
 * `[chronW0, chronW1]` inclusive. Uses the middle week index and lerps packed `isoWi` when the centre falls between
 * two weeks — **not** `(isoWi(first)+isoWi(last))/2`, which skews toward the first week when month gaps expand `wi`.
 */
export function isoGroundRightEdgeChronSpanCenter(
  chronW0: number,
  chronW1: number,
  di: number,
  nWeeks: number,
  stepX: number,
  stepY: number,
  halfCell: number,
  minX: number,
  minY: number,
  canvasH: number,
  isoWiAtLayoutLi: (layoutLi: number) => number
): { tx: number; ty: number } {
  const w0c = Math.max(0, Math.min(nWeeks - 1, chronW0));
  const w1c = Math.max(0, Math.min(nWeeks - 1, chronW1));
  if (w1c < w0c) return { tx: 0, ty: 0 };
  const wCenter = (w0c + w1c) / 2;
  const wLo = Math.floor(wCenter);
  const wHi = Math.ceil(wCenter);
  const isoLo = isoWiAtLayoutLi(layoutLiForChronWeek(wLo, nWeeks));
  const isoHi = isoWiAtLayoutLi(layoutLiForChronWeek(wHi, nWeeks));
  const t = wCenter - wLo;
  const isoW = isoLo + t * (isoHi - isoLo);
  const { ax, ay } = isoCellTopLeft(isoW, di, stepX, stepY);
  return { tx: ax + halfCell - minX, ty: ay - minY + canvasH };
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
  /**
   * ViewBox Y of the lowest cell ground line (bottom of footprint); month axis should sit just below this,
   * not at vbH (which includes tall towers + top padding).
   */
  groundPlaneMaxYView: number;
};

const PAD = 14;

/**
 * Bounding box for one month’s isometric skyline SVG (all cells, including tower height).
 */
export function computeSkylineBounds(
  weeks: RunwayCalendarCellValue[][],
  cellPx: number,
  gap: number,
  rowTowerPx: number,
  monthPack?: SkylineMonthPackOpts | null
): SkylineBounds {
  const L = isoLayoutCore(cellPx, rowTowerPx);
  const { stepX, stepY } = isoGridSteps(cellPx, gap);
  const runwayBandH = Math.max(L.dyy * 2.35, 13);
  const n = weeks.length;
  const isoWi =
    monthPack != null
      ? (layoutLi: number) =>
          isoWiForLayoutLi(layoutLi, n, monthPack.monthGapSteps, monthPack.monthStartChronWeeks)
      : (layoutLi: number) => layoutLi;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxGroundAbs = -Infinity;

  const stubH = Math.max(2.5, L.dyy * 0.55);
  const deckY = L.canvasH - runwayBandH;

  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi]!;
    for (let di = 0; di < week.length; di++) {
      const cell = week[di]!;
      const { ax, ay } = isoCellTopLeft(isoWi(wi), di, stepX, stepY);
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
      const groundAbs = ay + L.canvasH;

      minX = Math.min(minX, ax, ax + cellPx);
      minY = Math.min(minY, topY, ay);
      maxX = Math.max(maxX, ax + cellPx, ax + 2 * L.dxx);
      maxY = Math.max(maxY, bottomY, groundAbs);
      maxGroundAbs = Math.max(maxGroundAbs, groundAbs);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = cellPx;
    maxY = L.canvasH;
    maxGroundAbs = L.canvasH;
  }

  /** Room for month axis under the lattice + iso column “feet” past the slot bottom (see RunwayIsoSkyline). */
  const SKYLINE_MONTH_AXIS_BAND =
    Math.max(20, Math.round(cellPx * 0.42)) + Math.round(L.dyy * 0.95);
  maxY += SKYLINE_MONTH_AXIS_BAND;

  minX -= PAD;
  minY -= PAD;
  maxX += PAD;
  maxY += PAD;

  const groundPlaneMaxYView = maxGroundAbs - minY;

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
    groundPlaneMaxYView,
  };
}

/** Month block body height (below weekday row) for vertical layout when using skyline 3D. */
export function skylineMonthBodyHeightPx(
  weeksLen: number,
  cellPx: number,
  gap: number,
  rowTowerPx: number,
  monthPack?: SkylineMonthPackOpts | null
): number {
  /** Conservative: assume every slot could be a full-height bar (layout / scroll height). */
  const dummy: RunwayCalendarCellValue[][] = Array.from({ length: weeksLen }, () =>
    Array.from({ length: 7 }, () => '2000-01-01' as RunwayCalendarCellValue)
  );
  const b = computeSkylineBounds(dummy, cellPx, gap, rowTowerPx, monthPack);
  return b.vbH;
}
