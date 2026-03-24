import { useCallback, useRef, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import type { RiskRow } from '@/engine/riskModel';
import type { PlacedRunwayCell } from '@/lib/calendarQuarterLayout';
import type { SlotSelection } from '@/components/RunwayGrid';

type Box = { x0: number; y0: number; x1: number; y1: number };

type SlotOverlayProps = {
  outerRef: React.RefObject<HTMLDivElement | null>;
  cellSize: number;
  placedCells: PlacedRunwayCell[];
  scrollTopRef: React.MutableRefObject<number>;
  market: string;
  riskByDate: Map<string, RiskRow>;
  onSlotSelection: (s: SlotSelection | null) => void;
};

function pickDatesInRect(
  loX: number,
  loY: number,
  hiX: number,
  hiY: number,
  cellSize: number,
  placedCells: PlacedRunwayCell[]
): string[] {
  const a = Math.min(loX, hiX);
  const b = Math.max(loX, hiX);
  const c = Math.min(loY, hiY);
  const d = Math.max(loY, hiY);
  const picked: string[] = [];
  for (const p of placedCells) {
    if (typeof p.dateStr !== 'string') continue;
    const x2 = p.x + cellSize;
    const y2 = p.y + cellSize;
    if (p.x < b && x2 > a && p.y < d && y2 > c) picked.push(p.dateStr);
  }
  picked.sort();
  return picked;
}

export function SlotOverlay({
  outerRef,
  cellSize,
  placedCells,
  scrollTopRef,
  market,
  riskByDate,
  onSlotSelection,
}: SlotOverlayProps) {
  const [box, setBox] = useState<Box | null>(null);
  const activeRef = useRef(false);

  const finalize = useCallback(
    (b: Box | null) => {
      if (!b || !outerRef.current) {
        onSlotSelection(null);
        return;
      }
      const el = outerRef.current;
      const r = el.getBoundingClientRect();
      const x0 = Math.min(b.x0, b.x1) - r.left;
      const x1 = Math.max(b.x0, b.x1) - r.left;
      const st = scrollTopRef.current;
      const y0 = Math.min(b.y0, b.y1) - r.top + st;
      const y1 = Math.max(b.y0, b.y1) - r.top + st;
      const picked = pickDatesInRect(x0, y0, x1, y1, cellSize, placedCells);
      if (!picked.length) {
        onSlotSelection(null);
        return;
      }
      const dateStart = picked[0]!;
      const dateEnd = picked[picked.length - 1]!;
      let sum = 0;
      let n = 0;
      let maxR = 0;
      for (const d of picked) {
        const row = riskByDate.get(d);
        const rv = row?.risk_score ?? 0;
        sum += rv;
        n += 1;
        maxR = Math.max(maxR, rv);
      }
      onSlotSelection({
        dateStart,
        dateEnd,
        markets: [market],
        avgPressure: n ? sum / n : 0,
        maxPressure: maxR,
      });
    },
    [cellSize, market, onSlotSelection, outerRef, placedCells, riskByDate, scrollTopRef]
  );

  useDrag(
    ({ first, last, xy: [x, y], initial: [ix, iy], event }) => {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.closest('[data-no-drag]');
        if (tag) return;
      }
      if (first) {
        activeRef.current = true;
        setBox({ x0: ix, y0: iy, x1: ix, y1: iy });
        return;
      }
      if (activeRef.current) {
        setBox({ x0: ix, y0: iy, x1: x, y1: y });
      }
      if (last) {
        activeRef.current = false;
        const b = { x0: ix, y0: iy, x1: x, y1: y };
        const w = Math.abs(b.x1 - b.x0);
        const h = Math.abs(b.y1 - b.y0);
        if (w < 4 && h < 4) {
          setBox(null);
          onSlotSelection(null);
          return;
        }
        finalize(b);
        setBox(null);
      }
    },
    { target: outerRef, pointer: { capture: true } }
  );

  if (!box) return null;
  const l = Math.min(box.x0, box.x1);
  const t = Math.min(box.y0, box.y1);
  const w = Math.abs(box.x1 - box.x0);
  const h = Math.abs(box.y1 - box.y0);

  return (
    <div
      className="pointer-events-none fixed z-[60] border-2 border-amber-500/70 bg-amber-400/15"
      style={{ left: l, top: t, width: w, height: h }}
    />
  );
}
