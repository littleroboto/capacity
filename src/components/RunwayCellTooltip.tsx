import type { ReactNode, Ref, RefObject } from 'react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import type { ViewModeId } from '@/lib/constants';
import type { RunwayTooltipPayload } from '@/lib/runwayTooltipBreakdown';

const TOOLTIP_POINTER_OFFSET_PX = 14;
const TOOLTIP_VIEWPORT_MARGIN_PX = 12;

/**
 * Keep a fixed tooltip near the pointer but inside the viewport (flip above / left when needed).
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

function blendSectionTitle(viewMode: ViewModeId, riskBand: string): string {
  switch (viewMode) {
    case 'technology':
      return 'Tech effort vs combined blend';
    case 'in_store':
      return 'Business activity (components)';
    default:
      return `What moves combined risk (${riskBand})`;
  }
}

export type RunwayTipState =
  | { x: number; y: number; payload: RunwayTooltipPayload }
  | { x: number; y: number; simple: string };

type RunwayCellTooltipProps = {
  tip: RunwayTipState | null;
  reducedMotion: boolean;
  onDismiss: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
  /** Cancel delayed hide when pointer moves from heatmap onto the tooltip (fixed overlay). */
  onTooltipPointerEnter: () => void;
  /** Restart delayed hide when pointer leaves the tooltip. */
  onTooltipPointerLeave: () => void;
};

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-2.5 mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground dark:text-zinc-500">
      {children}
    </h4>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2.5 text-[13px] leading-[1.5] text-foreground/90 dark:text-zinc-300">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5">
          <span
            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/35 dark:bg-zinc-500"
            aria-hidden
          />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function TooltipDismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      aria-label="Dismiss day details"
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
      className="absolute right-2 top-2 z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card dark:border-zinc-600/55 dark:bg-zinc-700/70 dark:text-zinc-400 dark:hover:bg-zinc-600/75 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-500/30 dark:focus-visible:ring-offset-zinc-800"
    >
      <X className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

function TooltipPayloadBody({ p }: { p: RunwayTooltipPayload }) {
  const sortedBlend = [...p.riskTerms].sort((a, b) => b.contribution - a.contribution);
  return (
    <div
      key={p.dateStr + p.market + p.viewMode}
      className="min-h-0 pr-11 pb-4 font-sans text-foreground antialiased [font-feature-settings:'tnum','lnum'] dark:text-zinc-200"
    >
      <header className="border-b border-border/60 pb-4 dark:border-zinc-600/40">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground dark:text-zinc-500">
          System pressure
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-xl font-semibold leading-tight tracking-tight text-foreground dark:text-zinc-100 sm:text-2xl">
            {p.dateStr}
          </span>
          <span className="text-base font-medium text-muted-foreground dark:text-zinc-500">·</span>
          <span className="rounded-md bg-muted/80 px-2 py-0.5 text-sm font-semibold tabular-nums text-foreground dark:bg-zinc-700/55 dark:text-zinc-100">
            {p.market}
          </span>
          <span className="text-base font-medium text-muted-foreground dark:text-zinc-500">{p.weekdayShort}</span>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground dark:text-zinc-400">
          Cell shows{' '}
          <span className="font-semibold text-foreground dark:text-zinc-100">{p.fillMetricLabel}</span>
          <span className="mx-1 font-mono text-[13px] font-semibold tabular-nums text-foreground dark:text-zinc-100">
            {p.fillMetricValue.toFixed(2)}
          </span>
        </p>
        {p.viewMode === 'in_store' ? (
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground dark:text-zinc-400">
            Business view uses max(restaurant trading, marketing impact) plus a small lift on public/school holidays.
            Public vs school called out below.
          </p>
        ) : null}
      </header>

      <SectionTitle>{blendSectionTitle(p.viewMode, p.riskBand)}</SectionTitle>
      <p className="text-[13px] leading-[1.55] text-foreground/90 dark:text-zinc-300">{p.techExplanation}</p>
      {p.techReadinessSustainLine ? (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground dark:text-zinc-400">
          {p.techReadinessSustainLine}
        </p>
      ) : null}
      {p.headroomLine ? (
        <p className="mt-2 text-[13px] font-semibold tabular-nums text-foreground dark:text-zinc-100">{p.headroomLine}</p>
      ) : null}
      {p.pressureSurfaceLines.length > 0 ? (
        <>
          <SectionTitle>Pressure surfaces (tech)</SectionTitle>
          <BulletList items={p.pressureSurfaceLines} />
        </>
      ) : null}
      {p.storeTradingLine ? (
        <p className="mt-2 text-[13px] leading-relaxed text-foreground/85 dark:text-zinc-300">{p.storeTradingLine}</p>
      ) : null}

      <div className="mt-4 space-y-2.5 rounded-xl border border-border/50 bg-muted/35 px-3.5 py-3.5 dark:border-zinc-600/35 dark:bg-zinc-700/25">
        {sortedBlend.map((t) => (
          <div
            key={t.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 text-[13px] leading-snug"
          >
            <span className="font-medium text-foreground/90 dark:text-zinc-200">{t.label}</span>
            <span className="shrink-0 text-right font-mono text-[12px] tabular-nums tracking-tight text-muted-foreground dark:text-zinc-500 sm:text-[13px]">
              <span className="text-foreground/80 dark:text-zinc-300">{t.factor.toFixed(2)}</span>
              <span className="mx-1 text-muted-foreground/70 dark:text-zinc-500">×</span>
              <span>{(t.weight * 100).toFixed(0)}%</span>
              <span className="mx-1.5 text-border dark:text-zinc-600">→</span>
              <span className="font-semibold text-foreground dark:text-zinc-100">{t.contribution.toFixed(3)}</span>
            </span>
          </div>
        ))}
        <div className="mt-2 flex items-baseline justify-between border-t border-border/50 pt-3 text-sm font-bold tabular-nums text-foreground dark:border-zinc-600/35 dark:text-zinc-100">
          <span>Combined</span>
          <span className="font-mono text-base">{p.row.risk_score.toFixed(2)}</span>
        </div>
      </div>

      {p.activeCampaigns.length > 0 ? (
        <>
          <SectionTitle>Active campaigns</SectionTitle>
          <BulletList items={p.activeCampaigns} />
        </>
      ) : null}

      {p.operatingWindows.length > 0 ? (
        <>
          <SectionTitle>Operating windows</SectionTitle>
          <BulletList items={p.operatingWindows} />
        </>
      ) : null}

      {p.bauToday.length > 0 ? (
        <>
          <SectionTitle>Scheduled BAU</SectionTitle>
          <BulletList items={p.bauToday} />
        </>
      ) : null}

      {p.row.public_holiday_flag ? (
        <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/[0.08] px-3.5 py-3 dark:border-sky-400/30 dark:bg-sky-950/25">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-800 dark:text-sky-400">
            Public holiday
          </p>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground dark:text-zinc-100">
            {p.publicHolidayName ?? 'Listed in stub calendar (no display name for this date yet)'}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground dark:text-zinc-400">
            Capacity scaling may apply on this day.
          </p>
        </div>
      ) : null}

      {p.row.school_holiday_flag ? (
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground dark:text-zinc-400">
          School break — trading stress / cap multipliers may apply.
        </p>
      ) : null}
    </div>
  );
}

export function RunwayCellTooltip({
  tip,
  reducedMotion,
  onDismiss,
  rootRef,
  onTooltipPointerEnter,
  onTooltipPointerLeave,
}: RunwayCellTooltipProps) {
  const spring = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 28, mass: 0.45 };

  const baseStyle = {
    maxWidth: 'min(28rem, calc(100vw - 2rem))' as const,
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
          onPointerEnter={onTooltipPointerEnter}
          onPointerLeave={onTooltipPointerLeave}
          initial={reducedMotion ? false : { opacity: 0, scale: 0.98, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, scale: 0.99, y: 4 }}
          transition={spring}
          className={
            'simple' in tip
              ? 'pointer-events-auto fixed z-[200] max-h-[min(24rem,calc(100dvh-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-border/80 bg-card/95 px-3 py-2 pr-10 text-xs text-muted-foreground shadow-lg backdrop-blur-md [scrollbar-gutter:stable] dark:border-zinc-600/45 dark:bg-zinc-800/92 dark:text-zinc-400 dark:shadow-xl dark:shadow-black/20'
              : 'pointer-events-auto fixed z-[200] box-border max-h-[calc(100dvh-1rem)] min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl border border-border/70 bg-card/95 px-5 py-4 pb-8 pr-12 text-foreground shadow-xl shadow-black/[0.08] ring-1 ring-black/[0.04] backdrop-blur-md [scrollbar-gutter:stable] dark:border-zinc-600/45 dark:bg-zinc-800/92 dark:shadow-xl dark:shadow-black/25 dark:ring-zinc-400/[0.08]'
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
          <TooltipDismissButton onDismiss={onDismiss} />
          {'simple' in tip ? (
            <p className="leading-snug dark:text-zinc-300">{tip.simple}</p>
          ) : (
            <TooltipPayloadBody p={tip.payload} />
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
