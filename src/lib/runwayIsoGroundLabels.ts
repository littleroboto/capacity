import { isoCellTopLeft, layoutLiForChronWeek } from '@/lib/runwayIsoSkylineLayout';

/**
 * Chronology labels (month / quarter / year) sit on the **same isometric lattice** as heatmap cells:
 * `isoCellTopLeft(isoW, di, …)` with `di` past the last weekday column — like a virtual strip beside the grid,
 * analogous to spacing before the next “market” column in {@link RunwayIsoCityBlock}.
 */
export const ISO_LABEL_LANE_BASE_OFFSET = 0.8;

/** Extra `di` between stacked label rows (month → quarter → year). */
export const ISO_LABEL_ROW_STACK_GAP = 1.8;

/**
 * `di` for a label row on the ground plane: last weekday `maxDi`, then gap, then optional stacked rows.
 * @param maxDi — last day-column index (`nCols - 1` for skyline, or `marketDi(lastMarket, nCols-1)` in compare-all).
 * @param stackRowIndex — 0 = month row, 1 = quarter, 2 = year, …
 */
export function isoLabelLaneDi(maxDi: number, stackRowIndex: number): number {
  return maxDi + ISO_LABEL_LANE_BASE_OFFSET + stackRowIndex * ISO_LABEL_ROW_STACK_GAP;
}

/** Non-orthogonal baseline bleed for text lying on the iso ground (matches compare-all month labels). */
export function isoLabelBleedComp(stepX: number, stepY: number): number {
  const isoLen = Math.sqrt(stepX * stepX + stepY * stepY);
  const uDx = stepX / isoLen;
  const uDy = stepY / isoLen;
  return (uDx * uDx - uDy * uDy) * 0.35;
}

function isoUnit(stepX: number, stepY: number): { uDx: number; uDy: number } {
  const isoLen = Math.sqrt(stepX * stepX + stepY * stepY);
  return { uDx: stepX / isoLen, uDy: stepY / isoLen };
}

/** Month / quarter / year strings: read along −wi on the ground plane (right-edge strip). */
export function isoGroundMoMatrix(tx: number, ty: number, stepX: number, stepY: number): string {
  const { uDx, uDy } = isoUnit(stepX, stepY);
  return `matrix(${uDx.toFixed(4)}, ${(-uDy).toFixed(4)}, ${uDx.toFixed(4)}, ${uDy.toFixed(4)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`;
}

/** Market strip names: read along +di on the ground plane (back edge). */
export function isoGroundMktMatrix(tx: number, ty: number, stepX: number, stepY: number): string {
  const { uDx, uDy } = isoUnit(stepX, stepY);
  return `matrix(${uDx.toFixed(4)}, ${uDy.toFixed(4)}, ${(-uDx).toFixed(4)}, ${uDy.toFixed(4)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`;
}

/**
 * Ground anchor in SVG viewBox coords — same rule as cell bases: diamond centre at weekday column,
 * on the label lane `diLane`.
 */
export function isoGroundLabelAnchorAtChronWeek(
  chronWeek: number,
  diLane: number,
  nWeeks: number,
  stepX: number,
  stepY: number,
  halfCell: number,
  minX: number,
  minY: number,
  canvasH: number,
  isoWiAtLayoutLi: (layoutLi: number) => number
): { tx: number; ty: number } {
  const li = layoutLiForChronWeek(chronWeek, nWeeks);
  const isoW = isoWiAtLayoutLi(li);
  const { ax, ay } = isoCellTopLeft(isoW, diLane, stepX, stepY);
  return { tx: ax + halfCell - minX, ty: ay - minY + canvasH };
}
