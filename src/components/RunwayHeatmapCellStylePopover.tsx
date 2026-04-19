import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

type RunwayHeatmapCellStylePopoverProps = {
  disabled?: boolean;
  iconButtonClassName: string;
  cellPx: number;
  setCellPx: Dispatch<SetStateAction<number>>;
  cellPxMin: number;
  cellPxMax: number;
  cellPxStep: number;
  snapCellPx: (n: number) => number;
  gapPx: number;
  setGapPx: Dispatch<SetStateAction<number>>;
  gapPxMin: number;
  gapPxMax: number;
  radiusPx: number;
  setRadiusPx: Dispatch<SetStateAction<number>>;
  radiusPxMax: number;
  defaultCellPx: number;
  defaultGapPx: number;
  defaultRadiusPx: number;
};

export function RunwayHeatmapCellStylePopover({
  disabled = false,
  iconButtonClassName,
  cellPx,
  setCellPx,
  cellPxMin,
  cellPxMax,
  cellPxStep,
  snapCellPx,
  gapPx,
  setGapPx,
  gapPxMin,
  gapPxMax,
  radiusPx,
  setRadiusPx,
  radiusPxMax,
  defaultCellPx,
  defaultGapPx,
  defaultRadiusPx,
}: RunwayHeatmapCellStylePopoverProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const reset = useCallback(() => {
    setCellPx(defaultCellPx);
    setGapPx(defaultGapPx);
    setRadiusPx(defaultRadiusPx);
  }, [defaultCellPx, defaultGapPx, defaultRadiusPx, setCellPx, setGapPx, setRadiusPx]);

  const isDefault =
    snapCellPx(cellPx) === snapCellPx(defaultCellPx) &&
    gapPx === defaultGapPx &&
    radiusPx === defaultRadiusPx;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        title="Cell size, spacing, and corner radius"
        aria-label="Adjust runway heatmap cell style"
        onClick={() => setOpen((v) => !v)}
        className={cn(iconButtonClassName, open && 'bg-primary/15 text-foreground')}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 opacity-90" aria-hidden />
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Heatmap cell style"
          className="absolute right-0 z-50 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
        >
          <div className="mb-2 text-xs font-semibold tracking-tight text-foreground">Heatmap cells</div>
          <div className="flex flex-col gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Size ({cellPx}px)</span>
              <input
                type="range"
                min={cellPxMin}
                max={cellPxMax}
                step={cellPxStep}
                value={snapCellPx(cellPx)}
                disabled={disabled}
                onChange={(e) => setCellPx(snapCellPx(Number(e.target.value)))}
                className="w-full accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Spacing ({gapPx}px gap)</span>
              <input
                type="range"
                min={gapPxMin}
                max={gapPxMax}
                step={1}
                value={gapPx}
                disabled={disabled}
                onChange={(e) =>
                  setGapPx(Math.min(gapPxMax, Math.max(gapPxMin, Math.round(Number(e.target.value)))))
                }
                className="w-full accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Corner radius ({radiusPx}px)</span>
              <input
                type="range"
                min={0}
                max={radiusPxMax}
                step={1}
                value={radiusPx}
                disabled={disabled}
                onChange={(e) =>
                  setRadiusPx(
                    Math.min(radiusPxMax, Math.max(0, Math.round(Number(e.target.value))))
                  )
                }
                className="w-full accent-primary"
              />
            </label>
            <button
              type="button"
              disabled={disabled || isDefault}
              onClick={reset}
              className="mt-0.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
