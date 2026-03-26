import type { ReactNode, Ref, RefObject } from 'react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import type { RunwayTooltipPayload } from '@/lib/runwayTooltipBreakdown';
import { cn } from '@/lib/utils';

const TOOLTIP_POINTER_OFFSET_PX = 14;
const TOOLTIP_VIEWPORT_MARGIN_PX = 12;

function parseRgbHex6(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parseRgbaCss(css: string): [number, number, number, number] | null {
  const m =
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(css.trim()) ??
    /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(css.trim());
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = m[4] != null ? Math.min(1, Math.max(0, Number(m[4]))) : 1;
  if (![r, g, b].every((x) => Number.isFinite(x))) return null;
  return [r, g, b, a];
}

function relativeLuminanceFromSrgb(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** Readable text on arbitrary heatmap cell fills (relative luminance; blends rgba on white). */
function foregroundOnHeatmapFill(cssColor: string): string {
  const rgba = parseRgbaCss(cssColor);
  if (rgba) {
    const [r, g, b, a] = rgba;
    const br = Math.round(r * a + 255 * (1 - a));
    const bg = Math.round(g * a + 255 * (1 - a));
    const bb = Math.round(b * a + 255 * (1 - a));
    const L = relativeLuminanceFromSrgb(br, bg, bb);
    return L > 0.52 ? 'rgb(15 23 42)' : 'rgb(255 252 250)';
  }
  const rgb = parseRgbHex6(cssColor);
  if (!rgb) return 'rgb(15 23 42)';
  const L = relativeLuminanceFromSrgb(rgb[0], rgb[1], rgb[2]);
  return L > 0.52 ? 'rgb(15 23 42)' : 'rgb(255 252 250)';
}

function clampList<T>(items: T[], max: number): { shown: T[]; more: number } {
  if (items.length <= max) return { shown: items, more: 0 };
  return { shown: items.slice(0, max), more: items.length - max };
}

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

export type RunwayTipState =
  | { x: number; y: number; payload: RunwayTooltipPayload }
  | { x: number; y: number; simple: string };

type RunwayCellTooltipProps = {
  tip: RunwayTipState | null;
  reducedMotion: boolean;
  onDismiss: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
};

function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h4
      className={cn(
        'mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
        className
      )}
    >
      {children}
    </h4>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5 text-xs leading-snug text-foreground">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
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
      className="absolute left-3 top-3 z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
    >
      <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
    </button>
  );
}

function contributorShortLabel(label: string): string {
  return label.replace(/\s*\(heatmap\)\s*/i, '').replace(/\s*\(live campaigns[^)]*\)\s*/i, '').trim();
}

function ContributorsBlock({ p }: { p: RunwayTooltipPayload }) {
  const terms = [...p.riskTerms].sort((a, b) => b.contribution - a.contribution);
  const blendSum = terms.reduce((acc, t) => acc + t.contribution, 0);
  const denom = blendSum > 1e-9 ? blendSum : 1;
  const techLens = p.viewMode === 'combined';
  const techPct = techLens && terms[0] ? Math.round(Math.min(1, Math.max(0, terms[0].factor)) * 100) : null;

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/25 px-3 py-3">
      <SectionTitle className="mt-0 text-foreground">What drives this score</SectionTitle>

      {techLens ? (
        <>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-foreground">{p.techExplanation}</p>
          {techPct != null ? (
            <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
              Utilisation vs capacity (cell): ~{techPct}%
            </p>
          ) : null}
          {p.techReadinessSustainLine ? (
            <p className="mt-3 border-t border-border pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {p.techReadinessSustainLine}
            </p>
          ) : null}
          {p.pressureSurfaceLines.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
              {p.pressureSurfaceLines.slice(0, 4).map((line, i) => (
                <li key={i} className="pl-2">
                  <span className="text-muted-foreground/70" aria-hidden>
                    ·{' '}
                  </span>
                  {line.replace(/\s*\(max of lab\/team\/backend blend\)\s*$/, '')}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <>
          <ul className="mt-2 space-y-2.5">
            {terms.map((t) => {
              const share = (t.contribution / denom) * 100;
              const levelPct = Math.round(Math.min(1, Math.max(0, t.factor)) * 100);
              const isHolidayDial = t.key === 'holiday';
              return (
                <li key={t.key} className="text-xs leading-snug">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-semibold text-foreground">{contributorShortLabel(t.label)}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {isHolidayDial
                        ? t.factor >= 0.5
                          ? 'On'
                          : '—'
                        : `${Math.round(share)}% of blend`}
                    </span>
                  </div>
                  {!isHolidayDial ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Intensity ~{levelPct}%
                      {t.weight < 0.999 ? ` · weight ${(t.weight * 100).toFixed(0)}%` : null}
                    </p>
                  ) : t.factor >= 0.5 ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Holiday pressure dial active</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {p.storeTradingLine ? (
            <p className="mt-3 border-t border-border pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {p.storeTradingLine}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function TooltipPayloadBody({ p }: { p: RunwayTooltipPayload }) {
  const pct = Math.round(Math.min(1, Math.max(0, p.fillMetricValue)) * 100);
  const fg = foregroundOnHeatmapFill(p.cellFillHex);
  const camps = clampList(p.activeCampaigns, 4);
  const wins = clampList(p.operatingWindows, 3);
  const bau = clampList(p.bauToday, 3);

  return (
    <div
      key={p.dateStr + p.market + p.viewMode}
      className="min-h-0 font-sans antialiased [font-feature-settings:'tnum','lnum']"
    >
      <header className="relative border-b border-border bg-muted/15 px-4 pb-4 pt-11">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {p.fillMetricHeadline}
            </p>
            <p className="mt-1.5 text-xl font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-2xl">
              {p.dateStr}
            </p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {p.market} · {p.weekdayShort}
            </p>
          </div>
          <div
            className="shrink-0 rounded-lg border border-border/80 px-3 py-2 shadow-sm ring-1 ring-border/50"
            style={{ backgroundColor: p.cellFillHex, color: fg }}
            aria-label={`${pct} percent`}
          >
            <span className="block text-center text-2xl font-bold tabular-nums leading-none tracking-tight sm:text-[1.75rem]">
              {pct}
              <span className="align-top text-base font-bold">%</span>
            </span>
          </div>
        </div>
        <p className="mt-3 text-[11px] font-medium leading-snug text-muted-foreground">
          <span className="font-semibold text-foreground">{p.riskBand}</span>
          <span className="mx-1.5 text-muted-foreground/50">·</span>
          {p.fillMetricLabel}
        </p>
      </header>

      <div className="px-4 pb-4 pt-3">
        <ContributorsBlock p={p} />

        {camps.shown.length > 0 ? (
          <>
            <SectionTitle>Active campaigns</SectionTitle>
            <BulletList items={camps.shown} />
            {camps.more > 0 ? (
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">+{camps.more} more</p>
            ) : null}
          </>
        ) : null}

        {wins.shown.length > 0 ? (
          <>
            <SectionTitle>Operating windows</SectionTitle>
            <BulletList items={wins.shown} />
            {wins.more > 0 ? (
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">+{wins.more} more</p>
            ) : null}
          </>
        ) : null}

        {bau.shown.length > 0 ? (
          <>
            <SectionTitle>Scheduled BAU</SectionTitle>
            <BulletList items={bau.shown} />
            {bau.more > 0 ? (
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">+{bau.more} more</p>
            ) : null}
          </>
        ) : null}

        {p.row.public_holiday_flag ? (
          <div className="mt-4 rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-2.5 dark:border-sky-400/30 dark:bg-sky-400/10">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-950 dark:text-sky-200">
              Public holiday
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
              {p.publicHolidayName ?? 'Stub calendar'}
            </p>
          </div>
        ) : null}

        {p.row.school_holiday_flag ? (
          <p className="mt-3 text-[11px] font-medium leading-relaxed text-muted-foreground">
            School break — stress / capacity multipliers may apply.
          </p>
        ) : null}
      </div>
    </div>
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
              <TooltipPayloadBody p={tip.payload} />
            </div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
