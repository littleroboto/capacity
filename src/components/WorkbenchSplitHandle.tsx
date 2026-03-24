import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

const HANDLE_PX = 6;

type WorkbenchSplitHandleProps = {
  /** Current right column width in px (min–max clamped by parent). */
  rightWidthPx: number;
  onWidthChange: (next: number) => void;
  /** Called once when the drag ends (persist width here). */
  onDragEnd?: (finalWidthPx: number) => void;
  /** Parent grid width for clamping (runway + handle + dsl). */
  containerRef: React.RefObject<HTMLElement | null>;
  minRightPx: number;
  /** Max fraction of container width for the right pane (excluding handle). */
  maxRightFrac?: number;
  className?: string;
};

export function WorkbenchSplitHandle({
  rightWidthPx,
  onWidthChange,
  onDragEnd,
  containerRef,
  minRightPx,
  maxRightFrac = 0.78,
  className,
}: WorkbenchSplitHandleProps) {
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const latestRef = useRef(rightWidthPx);
  useEffect(() => {
    latestRef.current = rightWidthPx;
  }, [rightWidthPx]);

  const clamp = useCallback(
    (w: number) => {
      const total = containerRef.current?.getBoundingClientRect().width ?? 0;
      if (total < minRightPx + HANDLE_PX + 80) return Math.max(minRightPx, w);
      const maxRight = Math.max(minRightPx, Math.floor(total * maxRightFrac) - HANDLE_PX);
      return Math.min(maxRight, Math.max(minRightPx, w));
    },
    [containerRef, minRightPx, maxRightFrac]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      // Use the *rendered* right column width. After window resize, grid can clamp the
      // column below `rightWidthPx` while React state is stale — using state alone makes
      // drag deltas feel inverted or laggy vs the handle under the cursor.
      const grid = containerRef.current;
      const rightEl = grid?.children[2] as HTMLElement | undefined;
      const measured = rightEl?.getBoundingClientRect().width;
      const startW =
        measured != null && Number.isFinite(measured) && measured >= 1
          ? clamp(Math.round(measured))
          : clamp(rightWidthPx);
      dragRef.current = { startX: e.clientX, startW };
      latestRef.current = startW;
      if (Math.abs(startW - rightWidthPx) > 1) {
        onWidthChange(startW);
      }
    },
    [rightWidthPx, containerRef, clamp, onWidthChange]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      // Follow-the-divider: moving the pointer right moves the boundary right on screen,
      // which *narrows* the right column (it grew from the left edge of that column).
      const next = clamp(dragRef.current.startW - delta);
      latestRef.current = next;
      onWidthChange(next);
    },
    [clamp, onWidthChange]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (dragRef.current) {
        onDragEnd?.(latestRef.current);
      }
      dragRef.current = null;
    },
    [onDragEnd]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize runway and controls"
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 32 : 12;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const next = clamp(rightWidthPx + step);
          latestRef.current = next;
          onWidthChange(next);
          onDragEnd?.(next);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          const next = clamp(rightWidthPx - step);
          latestRef.current = next;
          onWidthChange(next);
          onDragEnd?.(next);
        }
      }}
      className={cn(
        'group relative z-10 hidden shrink-0 cursor-col-resize touch-none select-none lg:block',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
      style={{ width: HANDLE_PX }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/50 group-active:bg-primary"
        aria-hidden
      />
    </div>
  );
}

export const WORKBENCH_SPLIT_HANDLE_PX = HANDLE_PX;
