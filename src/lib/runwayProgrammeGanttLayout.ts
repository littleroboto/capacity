import type { PlacedRunwayCell } from '@/lib/calendarQuarterLayout';
import { enumerateIsoDatesInclusive } from '@/lib/runwayDateFilter';

export type ProgrammeGanttCellX = { x: number; cellPx: number };

/** Map each visible ISO day to the heatmap cell’s left edge and width (same as contribution strip). */
export function contributionStripYmdToCellLayout(
  placedCells: readonly PlacedRunwayCell[],
  cellPx: number,
): Map<string, ProgrammeGanttCellX> {
  const m = new Map<string, ProgrammeGanttCellX>();
  for (const p of placedCells) {
    if (typeof p.dateStr === 'string') {
      m.set(p.dateStr, { x: p.x, cellPx });
    }
  }
  return m;
}

/**
 * Horizontal span in SVG coords for [startYmd, endYmdInclusive] clipped to
 * [clipStartYmd, clipEndYmd], using only days that exist in `layout`.
 */
export function xSpanForInclusiveYmdRangeClipped(
  startYmd: string,
  endYmdInclusive: string,
  layout: ReadonlyMap<string, ProgrammeGanttCellX>,
  clipStartYmd: string,
  clipEndYmd: string,
): { x0: number; x1: number } | null {
  const a = startYmd > clipStartYmd ? startYmd : clipStartYmd;
  const b = endYmdInclusive < clipEndYmd ? endYmdInclusive : clipEndYmd;
  if (a > b) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const ymd of enumerateIsoDatesInclusive(a, b)) {
    const c = layout.get(ymd);
    if (!c) continue;
    x0 = Math.min(x0, c.x);
    x1 = Math.max(x1, c.x + c.cellPx);
  }
  if (!Number.isFinite(x0) || !Number.isFinite(x1) || x1 <= x0) return null;
  return { x0, x1 };
}
