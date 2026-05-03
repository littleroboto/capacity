import type { PlacedRunwayCell } from '@/lib/calendarQuarterLayout';

export type ProgrammePlanVisibleYmdRange = {
  startYmd: string;
  endYmd: string;
};

/**
 * Map the programme Gantt viewport (pan + zoom in strip coordinates) to the inclusive ISO
 * date span that intersects the visible strip, using the same cell geometry as the runway.
 */
export function programmePlanVisibleYmdRangeFromViewport(args: {
  viewportWidthPx: number;
  panXPx: number;
  timelineZoom: number;
  stripWidthPx: number;
  placedCells: readonly PlacedRunwayCell[];
  cellPx: number;
}): ProgrammePlanVisibleYmdRange | null {
  const { viewportWidthPx: vw, panXPx, timelineZoom: z, stripWidthPx, placedCells, cellPx } = args;
  if (vw <= 0 || z <= 0) return null;
  const xLeftRaw = -panXPx / z;
  const xRightRaw = (vw - panXPx) / z;
  const visL = Math.max(0, Math.min(stripWidthPx, xLeftRaw));
  const visR = Math.max(0, Math.min(stripWidthPx, xRightRaw));
  if (!(visR > visL)) return null;

  let minY: string | null = null;
  let maxY: string | null = null;
  for (const c of placedCells) {
    if (typeof c.dateStr !== 'string') continue;
    const xL = c.x;
    const xR = c.x + cellPx;
    if (xR <= visL || xL >= visR) continue;
    const y = c.dateStr;
    if (!minY || y < minY) minY = y;
    if (!maxY || y > maxY) maxY = y;
  }
  if (!minY || !maxY) return null;
  return { startYmd: minY, endYmd: maxY };
}
