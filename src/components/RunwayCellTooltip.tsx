import type { Ref, RefObject } from 'react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import type { RunwayTipState } from '@/lib/runwayTooltipBreakdown';
import { RunwayDayDetailsPayloadBody } from '@/components/RunwayDayDetailsBody';
import { cn } from '@/lib/utils';

const TOOLTIP_POINTER_OFFSET_PX = 14;
const TOOLTIP_VIEWPORT_MARGIN_PX = 12;

/**
 * Keep the day-details popover near the click point but inside the viewport (flip above / left when needed).
 */
function clampTooltipInViewport(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
  offset = TOOLTIP_POINTER_OFFSET_PX,
  margin = TOOLTIP_VIEWPORT_MARGIN_PX
): { left: number; top: number } {
  const vv = window.visualViewport;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;

  let left = clientX + offset;
  let top = clientY + offset;

  if (left + width > vw - margin) {
    left = clientX - width - offset;
  }
  if (left < margin) left = margin;
  if (left + width > vw - margin) {
    left = Math.max(margin, vw - margin - width);
  }

  if (top + height > vh - margin) {
    top = clientY - height - offset;
  }
  if (top < margin) top = margin;
  if (top + height > vh - margin) {
    top = Math.max(margin, vh - margin - height);
  }

  return { left, top };
}

export type { RunwayTipState };

type RunwayCellTooltipProps = {
  tip: RunwayTipState | null;
  reducedMotion: boolean;
  onDismiss: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
};

function TooltipDismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      aria-label="Dismiss day details"
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
      className="absolute left-3 top-3 z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
    >
      <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
    </button>
  );
}

export function RunwayCellTooltip({
  tip,
  reducedMotion,
  onDismiss,
  rootRef,
}: RunwayCellTooltipProps) {
  const spring = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 28, mass: 0.45 };

  const baseStyle = {
    maxWidth: 'min(24rem, calc(100vw - 2rem))' as const,
    minWidth: 'min(18rem, calc(100vw - 2rem))' as const,
  };

  const presenceKey =
    tip && 'simple' in tip ? `simple:${tip.simple.slice(0, 48)}` : tip ? `full:${tip.payload.dateStr}:${tip.payload.market}` : 'none';

  const [clampedBox, setClampedBox] = useState<{
    left: number;
    top: number;
    anchorX: number;
    anchorY: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!tip) {
      setClampedBox(null);
      return;
    }

    const el = rootRef.current;
    if (!el) return;

    const apply = () => {
      const { width, height } = el.getBoundingClientRect();
      const { left, top } = clampTooltipInViewport(tip.x, tip.y, width, height);
      setClampedBox({ left, top, anchorX: tip.x, anchorY: tip.y });
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener('resize', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [tip, rootRef]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence mode="sync">
      {tip ? (
        <motion.div
          key={presenceKey}
          ref={rootRef as Ref<HTMLDivElement>}
          layout={false}
          initial={reducedMotion ? false : { opacity: 0, scale: 0.98, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, scale: 0.99, y: 4 }}
          transition={spring}
          className={
            'simple' in tip
              ? cn(
                  'pointer-events-auto fixed z-[200] max-h-[min(24rem,calc(100dvh-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-border bg-card px-3 py-2 pr-10 text-xs font-medium text-card-foreground shadow-lg [scrollbar-gutter:stable]'
                )
              : cn(
                  'pointer-events-auto fixed z-[200] box-border max-h-[calc(100dvh-1rem)] min-h-[17rem] min-w-[18rem] overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-border bg-card text-card-foreground shadow-lg [scrollbar-gutter:stable]'
                )
          }
          style={{
            ...baseStyle,
            left:
              clampedBox && clampedBox.anchorX === tip.x && clampedBox.anchorY === tip.y
                ? clampedBox.left
                : tip.x + TOOLTIP_POINTER_OFFSET_PX,
            top:
              clampedBox && clampedBox.anchorX === tip.x && clampedBox.anchorY === tip.y
                ? clampedBox.top
                : tip.y + TOOLTIP_POINTER_OFFSET_PX,
          }}
        >
          {!('simple' in tip) ? (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-1 rounded-t-lg"
              style={{ backgroundColor: tip.payload.cellFillHex }}
              aria-hidden
            />
          ) : null}
          <TooltipDismissButton onDismiss={onDismiss} />
          {'simple' in tip ? (
            <p className="relative z-[2] leading-snug text-card-foreground">{tip.simple}</p>
          ) : (
            <div className="relative z-[2] min-h-0">
              <RunwayDayDetailsPayloadBody p={tip.payload} presentation="popover" />
            </div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
