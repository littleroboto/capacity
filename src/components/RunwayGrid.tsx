import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import type { ReactNode, Ref, RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { runwayHeatmapTitleForViewMode, type ViewModeId } from '@/lib/constants';
import {
  heatmapCellMetric,
  runwayHeatmapCellFillAndDim,
  technologyFillMetricHeadline,
  technologyFillMetricLabel,
  technologyRunwayTitleForWorkloadScope,
  type TechWorkloadScope,
} from '@/lib/runwayViewMetrics';
import { parseDate } from '@/engine/calendar';
import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import {
  HEATMAP_RUNWAY_PAD_FILL,
  type HeatmapColorOpts,
  type HeatmapSpectrumMode,
} from '@/lib/riskHeatmapColors';
import { HeatmapLegend } from '@/components/HeatmapLegend';
import { RunwayFocusSelect } from '@/components/RunwayFocusSelect';
import { RunwayRangeSelect } from '@/components/RunwayRangeSelect';
import { enumerateIsoDatesInclusive, runwayPickerLayoutBounds } from '@/lib/runwayDateFilter';
import { buildRunwayTooltipPayload, type RunwayTipState } from '@/lib/runwayTooltipBreakdown';
import {
  CALENDAR_MONTH_HEADER_H,
  CALENDAR_MONTH_SIDE_LABEL_GAP_PX,
  CALENDAR_MONTH_SIDE_LABEL_PADDING_END_PX,
  CALENDAR_MONTH_SIDE_LABEL_W,
  CALENDAR_MONTH_STACK_GAP_PX,
  CALENDAR_QUARTER_BLOCK_GAP_PX,
  CALENDAR_QUARTER_GUTTER_W,
  CALENDAR_WEEKDAY_HEADER_H,
  CALENDAR_QUARTER_GRID_COL_GAP_PX,
  CALENDAR_QUARTER_GRID_ROW_GAP_PX,
  CALENDAR_YEAR_HEADER_H,
  CALENDAR_YEAR_STRIP_TOTAL_PX,
  QUARTER_LETTERS,
  bestCellPxForCompareAllRunwayFit,
  bestCellPxForSingleMarketFit,
  buildQuarterGridRunwayLayout,
  buildVerticalMonthsRunwayLayout,
  flattenRunwayWeeksFromSections,
  calendarQuarterTitle,
  quarterCodeLabel,
  type CalendarMonthBlock,
  type PlacedRunwayCell,
  type QuarterLetters,
  type VerticalYearSection,
} from '@/lib/calendarQuarterLayout';
import {
  isRunwayMultiMarketStrip,
  runwayCompareMarketIds,
  runwayFocusStripLabel,
} from '@/lib/markets';
import {
  RUNWAY_CELL_GAP_PX,
  WEEKDAY_HEADERS,
  formatDateYmd,
  runwayDayStripWidth,
  RUNWAY_DAY_COLUMNS,
} from '@/lib/weekRunway';
import { cn } from '@/lib/utils';
import { RunwayCellTooltip } from '@/components/RunwayCellTooltip';
import { RunwayDaySummaryPanel } from '@/components/RunwayDaySummaryPanel';
import { useAtcStore } from '@/store/useAtcStore';
import { SlotOverlay } from '@/components/SlotOverlay';
import type { MarketConfig } from '@/engine/types';
import { downloadRunwayHeatmapPng } from '@/lib/runwayPngExport';
import { RunwayIsoSkyline } from '@/components/RunwayIsoSkyline';
import { RunwayIsoCityBlock } from '@/components/RunwayIsoCityBlock';
import { RunwayCompareSvgColumn } from '@/components/RunwayCompareSvgColumn';
import { RunwayQuarterGridSvg } from '@/components/RunwayQuarterGridSvg';
import { Box, CalendarDays, Download, Grid2x2, Loader2, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { MarketCircleFlag } from '@/components/MarketCircleFlag';

/** Default cell size (px) for runway heatmaps (single-market and LIOM compare). */
export const CELL_PX = 20;

const RUNWAY_CELL_PX_MIN = 12;
const RUNWAY_CELL_PX_MAX = 28;
const RUNWAY_CELL_PX_STEP = 2;

/** Isometric 3D runway (skyline + all-markets city block) — off until re-enabled. */
const RUNWAY_ISO_3D_ENABLED = true;

function snapRunwayCellPx(n: number): number {
  const s = Math.round(n / RUNWAY_CELL_PX_STEP) * RUNWAY_CELL_PX_STEP;
  return Math.min(RUNWAY_CELL_PX_MAX, Math.max(RUNWAY_CELL_PX_MIN, s));
}

/** Pointer anchor for the day-details popover (click or keyboard). */
type RunwayTipAnchor = { clientX: number; clientY: number };

export { RUNWAY_CELL_GAP_PX };

const COUNTRY_SWITCH_MIN_MS = 260;

/** Heatmap colour “swoosh”: grey underlay, then staggered reveal + optional post-reveal shimmer. */
/** Extra delay per market column so the wave travels left→right across LIOM compare columns. */
const SWOOSH_MARKET_COLUMN_GAP_SEC = 0.1;
const SWOOSH_MAX_STAGGER_SEC = 1.38;
const SWOOSH_DURATION_SEC = 0.42;
const SWOOSH_POST_MS = Math.ceil((SWOOSH_MAX_STAGGER_SEC + SWOOSH_DURATION_SEC) * 1000) + 120;
const SWOOSH_EASE = [0.2, 0.88, 0.22, 1] as const;


/** Title-bar icon buttons: same surface language as `Button` outline / ghost (`accent` hover, `ring` focus). */
const RUNWAY_TOOLBAR_ICON_BTN = cn(
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm',
  'transition-[color,background-color,border-color,box-shadow] duration-150 ease-out',
  'hover:border-border hover:bg-accent hover:text-foreground hover:shadow-sm',
  'disabled:pointer-events-none disabled:opacity-35',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
);

/** Compare-all column header: market code; optional YAML `title` in native tooltip. */
function RunwayMarketCodeSticker({
  code,
  subtitle,
  onSelect,
}: {
  code: string;
  subtitle?: string;
  /** When set, renders a control that switches the workbench to single-market view for this code. */
  onSelect?: () => void;
}) {
  const tip =
    subtitle && subtitle.trim() && subtitle.trim() !== code
      ? `${code} — ${subtitle.trim()}`
      : `Market ${code}`;
  const codeClass = 'shrink-0 text-sm font-bold tabular-nums tracking-tight text-foreground';
  /** Flag SVGs must not inherit `color` from the control (can flatten fills to a gray disc in dark UI). */
  const label = (
    <>
      <span className={codeClass}>{code}</span>
      <MarketCircleFlag marketId={code} size={20} className="max-sm:scale-95" />
    </>
  );
  if (onSelect) {
    const aria = `${tip}. Open single-market runway for ${code}.`;
    return (
      <button
        type="button"
        title={aria}
        aria-label={aria}
        onClick={onSelect}
        className={cn(
          'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-transparent px-1 py-0.5 -mx-1 -my-0.5 font-bold tabular-nums tracking-tight',
          'transition-[color,background-color,border-color] duration-150',
          'hover:border-border/50 hover:bg-accent/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
        )}
      >
        {label}
      </button>
    );
  }
  return (
    <span title={tip} className="inline-flex shrink-0 items-center gap-2">
      {label}
    </span>
  );
}

function sweepDelayForCell(
  sweepMarketOffsetSec: number,
  si: number,
  mi: number,
  wi: number,
  di: number
): number {
  // Stronger weight on `di` so colour sweeps left → right across each week-row (“swoosh”).
  const raw =
    sweepMarketOffsetSec + (si * 0.1 + mi * 0.016 + wi * 0.0055 + di * 0.088);
  return Math.min(raw, SWOOSH_MAX_STAGGER_SEC);
}

function RunwaySkeleton({
  compareAll,
  reduceMotion,
  compareColumnCount,
}: {
  compareAll: boolean;
  reduceMotion: boolean;
  /** Compare-all heatmap columns; falls back to 1 if order not loaded yet. */
  compareColumnCount: number;
}) {
  const columns = compareAll ? Math.max(1, compareColumnCount) : 1;
  return (
    <div
      className="flex w-full max-w-full justify-center"
      role="status"
      aria-live="polite"
      aria-label="Loading runway for selected market"
    >
      <div
        className={cn(
          'flex w-full min-w-0 max-w-full flex-col-reverse items-stretch gap-6 lg:flex-row lg:gap-0',
          compareAll && 'lg:min-h-0 lg:items-stretch'
        )}
      >
      <div
        className={cn(
          'flex w-fit max-w-[min(100%,6rem)] shrink-0 flex-col gap-3 self-center lg:border-r lg:border-border/50 lg:pr-3 lg:pl-1 lg:self-start',
          compareAll ? 'pt-1' : 'pt-1 lg:pt-[var(--runway-year-strip)]'
        )}
        style={
          !compareAll
            ? ({ ['--runway-year-strip' as string]: `${CALENDAR_YEAR_STRIP_TOTAL_PX}px` } as React.CSSProperties)
            : undefined
        }
      >
        <div className="h-3 w-24 rounded-md bg-muted/70" />
        <motion.div
          className="h-36 w-full max-w-[4.5rem] rounded-md bg-muted/45"
          animate={reduceMotion ? {} : { opacity: [0.4, 0.72, 0.4] }}
          transition={
            reduceMotion ? {} : { duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: 0.12 }
          }
        />
      </div>
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col justify-center',
          compareAll ? 'overflow-x-auto overflow-y-visible pb-1' : ''
        )}
      >
        <div
          className={cn(
            'flex items-start px-0.5',
            compareAll ? 'flex-row justify-start' : 'flex-row justify-center gap-5'
          )}
          style={compareAll ? { gap: CALENDAR_QUARTER_GRID_COL_GAP_PX } : undefined}
        >
          {Array.from({ length: columns }, (_, i) => (
            <motion.div
              key={i}
              className="flex shrink-0 flex-col items-center gap-2"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={reduceMotion ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="h-5 w-8 shrink-0 rounded-sm bg-muted/60" aria-hidden />
              <motion.div
                className="min-h-[min(52vh,420px)] w-[182px] rounded-lg bg-muted/55 sm:w-[194px]"
                animate={
                  reduceMotion
                    ? {}
                    : { opacity: [0.42, 0.78, 0.42] }
                }
                transition={
                  reduceMotion
                    ? {}
                    : { duration: 1.35, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }
                }
              />
            </motion.div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

/** Two-letter weekday keys for Mon–Sun columns (fits narrow cells; avoids duplicate “T”). */
const WEEKDAY_GRID_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

function fillMetricHeadlineForView(mode: ViewModeId, techWorkloadScope: TechWorkloadScope): string {
  switch (mode) {
    case 'combined':
      return technologyFillMetricHeadline(techWorkloadScope);
    case 'in_store':
      return 'Trading pressure';
    case 'market_risk':
      return 'Deployment Risk';
    default:
      return 'Pressure';
  }
}

function fillMetricLabelForView(mode: ViewModeId, techWorkloadScope: TechWorkloadScope): string {
  switch (mode) {
    case 'combined':
      return technologyFillMetricLabel(techWorkloadScope);
    case 'in_store':
      return 'Restaurant trading intensity from the store curve—rhythm, holidays, and store boosts when live (or prep if YAML says so)';
    case 'market_risk':
      return 'Deployment risk score (0–1): deployment and calendar fragility from holidays, Q4 month ramp, store intensity, campaigns, and optional deployment events in YAML.';
    default:
      return 'Metric';
  }
}

function fillMetricLeadCompactForView(mode: ViewModeId, techWorkloadScope: TechWorkloadScope): string {
  switch (mode) {
    case 'combined':
      switch (techWorkloadScope) {
        case 'bau':
          return 'BAU-only headroom on lab and Market IT (0–1); backend not in this headline.';
        case 'project':
          return 'Project-work headroom on lab and Market IT (0–1); backend not in this headline.';
        default:
          return 'Combined headroom on lab and Market IT (0–1); backend not in this headline.';
      }
    case 'in_store':
      return 'Store trading intensity from the curve—rhythm, holidays, and store boosts (0–1).';
    case 'market_risk':
      return 'Deployment risk: deployment/calendar fragility in the model (0–1); hotter = more fragile, not a ban.';
    default:
      return fillMetricLabelForView(mode, techWorkloadScope);
  }
}

function weekdayShortFromYmd(ymd: string): string {
  const d = parseDate(ymd);
  return WEEKDAY_HEADERS[(d.getDay() + 6) % 7]!;
}

function riskByDateForMarket(surface: RiskRow[], market: string): Map<string, RiskRow> {
  const m = new Map<string, RiskRow>();
  for (const r of surface) {
    if (r.market === market) m.set(r.date, r);
  }
  return m;
}

/** Avoid stealing ←/→ when typing or using form controls elsewhere on the page. */
function isHeatmapKeyNavSuppressed(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (el.closest?.('input, textarea, select, [contenteditable="true"]')) return true;
  return false;
}

function TodayDot() {
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-1/2 block h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
      aria-hidden
    />
  );
}

/** Per-cell timing + keyframes: disco = faster, brighter twinkle; default = subtle post-swoosh shimmer. */
function heatmapTwinkleParams(discoMode: boolean, shimmerBase: number, weekdayCol: number) {
  if (discoMode) {
    return {
      duration: 0.68 + (shimmerBase % 9) * 0.085,
      delay: (shimmerBase * 0.029) % 1.45,
      opacity: [0.55, 1, 0.55] as const,
      filter: [
        'brightness(1) saturate(1)',
        'brightness(1.32) saturate(1.4)',
        'brightness(1) saturate(1)',
      ] as const,
    };
  }
  return {
    duration: 3.4 + (weekdayCol % 4) * 0.2,
    delay: (shimmerBase * 0.07) % 2.8,
    opacity: [0.88, 1, 0.88] as const,
    filter: ['brightness(1)', 'brightness(1.07)', 'brightness(1)'] as const,
  };
}

type HeatCellProps = {
  fill: string;
  dateStr: string | null;
  isToday: boolean;
  /** When true, cell is wrapped at 25% opacity (past calendar days). */
  pastDimmed: boolean;
  weekdayCol: number;
  shimmerBase: number;
  /** Shimmer pulse (after swoosh when `enableColorSweep`). */
  shimmer: boolean;
  /** Stronger staggered twinkle on every cell (off when reduced-motion). */
  discoMode: boolean;
  enableColorSweep: boolean;
  /** When false during color sweep, only the grey→colour reveal runs. */
  postSweep: boolean;
  sweepDelaySec: number;
  /** Remounts the colour layer so the grey→fill sweep replays when the lens or tech workload scope changes. */
  colorLayerKey: string;
  /** &lt;1 when score is below heatmap dim cutoff (after curve + γ). */
  dimOpacity?: number;
  openDayDetailsFromCell: (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => void;
};

function heatCellTipHandlers(
  openDayDetailsFromCell: HeatCellProps['openDayDetailsFromCell'],
  dateStr: string | null,
  weekdayCol: number
) {
  return {
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      openDayDetailsFromCell({ clientX: e.clientX, clientY: e.clientY }, dateStr, weekdayCol);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      openDayDetailsFromCell(
        { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 },
        dateStr,
        weekdayCol
      );
    },
  };
}

function HeatCellDimWrap({ pastDimmed, children }: { pastDimmed: boolean; children: ReactNode }) {
  return <div className={cn('shrink-0', pastDimmed && 'opacity-25')}>{children}</div>;
}

/** Low-score dimming (multiplies with inner motion opacity when shimmer is on). */
function HeatCutoffOpacityWrap({ dimOpacity, children }: { dimOpacity: number; children: ReactNode }) {
  // Stable DOM: same wrapper at opacity 1 or dimmed so flex gaps do not jump with the slider.
  return (
    <div className="shrink-0" style={{ opacity: dimOpacity }}>
      {children}
    </div>
  );
}

const HeatCell = memo(function HeatCell({
  fill,
  dateStr,
  isToday,
  pastDimmed,
  weekdayCol,
  shimmerBase,
  shimmer,
  discoMode,
  enableColorSweep,
  postSweep,
  sweepDelaySec,
  colorLayerKey,
  dimOpacity = 1,
  openDayDetailsFromCell,
}: HeatCellProps) {
  const tw = heatmapTwinkleParams(discoMode, shimmerBase, weekdayCol);
  const pulseOn = (shimmer || discoMode) && (!enableColorSweep || postSweep);

  const handlers = heatCellTipHandlers(openDayDetailsFromCell, dateStr, weekdayCol);

  const boxClass = cn(
    'relative shrink-0 cursor-pointer rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    isToday && 'z-[1]'
  );

  if (!enableColorSweep && !shimmer && !discoMode) {
    return (
      <HeatCellDimWrap pastDimmed={pastDimmed}>
        <HeatCutoffOpacityWrap dimOpacity={dimOpacity}>
          <div
            role="button"
            tabIndex={0}
            title="Click for day details"
            aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
            className={boxClass}
            style={{ width: CELL_PX, height: CELL_PX, backgroundColor: fill }}
            {...handlers}
          >
            {isToday ? <TodayDot /> : null}
          </div>
        </HeatCutoffOpacityWrap>
      </HeatCellDimWrap>
    );
  }

  if (!enableColorSweep && (shimmer || discoMode)) {
    return (
      <HeatCellDimWrap pastDimmed={pastDimmed}>
        <HeatCutoffOpacityWrap dimOpacity={dimOpacity}>
          <motion.div
            role="button"
            tabIndex={0}
            title="Click for day details"
            aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
            className={cn(boxClass, 'will-change-[opacity,filter]')}
            style={{ width: CELL_PX, height: CELL_PX, backgroundColor: fill }}
            initial={false}
            animate={{
              opacity: [...tw.opacity],
              filter: [...tw.filter],
            }}
            transition={{
              duration: tw.duration,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: tw.delay,
            }}
            {...handlers}
          >
            {isToday ? <TodayDot /> : null}
          </motion.div>
        </HeatCutoffOpacityWrap>
      </HeatCellDimWrap>
    );
  }

  return (
    <HeatCellDimWrap pastDimmed={pastDimmed}>
    <HeatCutoffOpacityWrap dimOpacity={dimOpacity}>
    <div className="relative shrink-0" style={{ width: CELL_PX, height: CELL_PX }}>
      <div className="pointer-events-none absolute inset-0 rounded-[3px] bg-muted" aria-hidden />
      <motion.div
        key={colorLayerKey}
        className={cn(
          'absolute inset-0 cursor-pointer rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          isToday && 'z-[1]',
          'will-change-[opacity,filter]'
        )}
        role="button"
        tabIndex={0}
        title="Click for day details"
        aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
        style={{ backgroundColor: fill }}
        initial={{ opacity: 0, filter: 'brightness(0.92) saturate(0.85)' }}
        animate={
          pulseOn
            ? {
                opacity: [...tw.opacity],
                filter: [...tw.filter],
              }
            : { opacity: 1, filter: 'brightness(1)' }
        }
        transition={
          pulseOn
            ? {
                opacity: {
                  duration: tw.duration,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: tw.delay,
                },
                filter: {
                  duration: tw.duration,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: tw.delay,
                },
              }
            : {
                opacity: { delay: sweepDelaySec, duration: SWOOSH_DURATION_SEC, ease: SWOOSH_EASE },
                filter: { delay: sweepDelaySec, duration: SWOOSH_DURATION_SEC * 0.92, ease: SWOOSH_EASE },
              }
        }
        {...handlers}
      >
        {isToday ? <TodayDot /> : null}
      </motion.div>
    </div>
    </HeatCutoffOpacityWrap>
    </HeatCellDimWrap>
  );
});

type HeatCellSizedProps = HeatCellProps & { cellPx: number };

const HeatCellSized = memo(function HeatCellSized({
  cellPx,
  fill,
  dateStr,
  isToday,
  pastDimmed,
  weekdayCol,
  shimmerBase,
  shimmer,
  discoMode,
  enableColorSweep,
  postSweep,
  sweepDelaySec,
  colorLayerKey,
  dimOpacity = 1,
  openDayDetailsFromCell,
}: HeatCellSizedProps) {
  const tw = heatmapTwinkleParams(discoMode, shimmerBase, weekdayCol);
  const pulseOn = (shimmer || discoMode) && (!enableColorSweep || postSweep);

  const handlers = heatCellTipHandlers(openDayDetailsFromCell, dateStr, weekdayCol);

  const boxClass = cn(
    'relative shrink-0 cursor-pointer rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    isToday && 'z-[1]'
  );

  if (!enableColorSweep && !shimmer && !discoMode) {
    return (
      <HeatCellDimWrap pastDimmed={pastDimmed}>
        <HeatCutoffOpacityWrap dimOpacity={dimOpacity}>
          <div
            role="button"
            tabIndex={0}
            title="Click for day details"
            aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
            className={boxClass}
            style={{ width: cellPx, height: cellPx, backgroundColor: fill }}
            {...handlers}
          >
            {isToday ? <TodayDot /> : null}
          </div>
        </HeatCutoffOpacityWrap>
      </HeatCellDimWrap>
    );
  }

  if (!enableColorSweep && (shimmer || discoMode)) {
    return (
      <HeatCellDimWrap pastDimmed={pastDimmed}>
        <HeatCutoffOpacityWrap dimOpacity={dimOpacity}>
          <motion.div
            role="button"
            tabIndex={0}
            title="Click for day details"
            aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
            className={cn(boxClass, 'will-change-[opacity,filter]')}
            style={{ width: cellPx, height: cellPx, backgroundColor: fill }}
            initial={false}
            animate={{
              opacity: [...tw.opacity],
              filter: [...tw.filter],
            }}
            transition={{
              duration: tw.duration,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: tw.delay,
            }}
            {...handlers}
          >
            {isToday ? <TodayDot /> : null}
          </motion.div>
        </HeatCutoffOpacityWrap>
      </HeatCellDimWrap>
    );
  }

  return (
    <HeatCellDimWrap pastDimmed={pastDimmed}>
    <HeatCutoffOpacityWrap dimOpacity={dimOpacity}>
    <div className="relative shrink-0" style={{ width: cellPx, height: cellPx }}>
      <div className="pointer-events-none absolute inset-0 rounded-[2px] bg-muted" aria-hidden />
      <motion.div
        key={colorLayerKey}
        className={cn(
          'absolute inset-0 cursor-pointer rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          isToday && 'z-[1]',
          'will-change-[opacity,filter]'
        )}
        role="button"
        tabIndex={0}
        title="Click for day details"
        aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
        style={{ backgroundColor: fill }}
        initial={{ opacity: 0, filter: 'brightness(0.92) saturate(0.85)' }}
        animate={
          pulseOn
            ? {
                opacity: [...tw.opacity],
                filter: [...tw.filter],
              }
            : { opacity: 1, filter: 'brightness(1)' }
        }
        transition={
          pulseOn
            ? {
                opacity: {
                  duration: tw.duration,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: tw.delay,
                },
                filter: {
                  duration: tw.duration,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: tw.delay,
                },
              }
            : {
                opacity: { delay: sweepDelaySec, duration: SWOOSH_DURATION_SEC, ease: SWOOSH_EASE },
                filter: { delay: sweepDelaySec, duration: SWOOSH_DURATION_SEC * 0.92, ease: SWOOSH_EASE },
              }
        }
        {...handlers}
      >
        {isToday ? <TodayDot /> : null}
      </motion.div>
    </div>
    </HeatCutoffOpacityWrap>
    </HeatCellDimWrap>
  );
});

type RunwayHeatmapLayout = 'vertical_strip' | 'quarter_grid';

type RunwayVerticalHeatmapBodyProps = {
  sections: VerticalYearSection[];
  cellPx: number;
  gap: number;
  monthStripW: number;
  riskByDate: Map<string, RiskRow>;
  heatmapOpts: HeatmapColorOpts;
  riskTuning: RiskModelTuning;
  viewMode: ViewModeId;
  techWorkloadScope: TechWorkloadScope;
  todayYmd: string;
  dimPastDays: boolean;
  shimmer: boolean;
  discoMode: boolean;
  enableColorSweep: boolean;
  postSweep: boolean;
  /** Extra delay (seconds) so multi-market columns swoosh in sequence left→right. */
  sweepMarketOffsetSec: number;
  openDayDetailsFromCell: (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => void;
  layout: RunwayHeatmapLayout;
  /** When `vertical_strip`, hide left quarter gutter (compare-all uses a shared gutter column). */
  showQuarterGutter?: boolean;
  /** Compare-all: month abbrev beside each mini-grid; one shared Mo–Su row (first model month only). */
  compareStripLabels?: boolean;
  firstCalendarMonthKey?: string | null;
  /** Single-market isometric skyline (lattice + extruded columns). */
  heatmap3d?: boolean;
  /** Tower height (px) for 3D column extrusion. */
  rowTowerPx?: number;
};

function monthBlockMinHeight(
  weeksLen: number,
  cellPx: number,
  gap: number,
  opts?: { omitTopMonthHeader?: boolean }
): number {
  const stride = cellPx + gap;
  const top = opts?.omitTopMonthHeader ? 0 : CALENDAR_MONTH_HEADER_H;
  return top + CALENDAR_WEEKDAY_HEADER_H + weeksLen * stride - gap;
}

/** Months in sec that fall in calendar quarter `qRow` (0=JFM … 3=OND). */
function monthsInCalendarQuarter(sec: VerticalYearSection, qRow: number): CalendarMonthBlock[] {
  const m0 = qRow * 3;
  return sec.months.filter((m) => m.monthIndex >= m0 && m.monthIndex <= m0 + 2);
}

/** First calendar month in runway order (same traversal as vertical strip). */
function firstCalendarMonthKeyFromSections(sections: VerticalYearSection[]): string | null {
  for (const sec of sections) {
    for (let qRow = 0; qRow < 4; qRow++) {
      const inQ = monthsInCalendarQuarter(sec, qRow);
      if (inQ.length) return inQ[0]!.key;
    }
  }
  return null;
}

function verticalQuarterBlockHeight(
  months: CalendarMonthBlock[],
  cellPx: number,
  gap: number,
  opts?: { omitTopMonthHeader?: boolean }
): number {
  if (!months.length) return 0;
  let h = 0;
  for (let i = 0; i < months.length; i++) {
    h += monthBlockMinHeight(months[i]!.weeks.length, cellPx, gap, opts);
    if (i < months.length - 1) h += CALENDAR_MONTH_STACK_GAP_PX;
  }
  return h;
}

function QuarterLabelText({ qLetters }: { qLetters: QuarterLetters }) {
  return (
    <span
      className="text-sm font-extrabold tabular-nums tracking-tight text-muted-foreground"
      title={calendarQuarterTitle(qLetters)}
      aria-label={calendarQuarterTitle(qLetters)}
    >
      {quarterCodeLabel(qLetters)}
    </span>
  );
}

/** Shared Q1–Q4 + year strip for compare-all; widths/heights match heatmap columns (no cells). */
function RunwayCompareQuarterGutter({
  sections,
  cellPx,
  gap,
}: {
  sections: VerticalYearSection[];
  cellPx: number;
  gap: number;
}) {
  return (
    <div className="flex flex-col">
      {sections.map((sec, si) => (
        <div
          key={sec.year}
          style={{
            marginBottom: si < sections.length - 1 ? CALENDAR_QUARTER_BLOCK_GAP_PX : 0,
          }}
        >
          <div
            className="flex items-end justify-center border-b-0 pb-2.5 pt-1"
            style={{ minHeight: CALENDAR_YEAR_HEADER_H }}
          >
            <span className="text-lg font-bold tabular-nums tracking-tight text-foreground">{sec.year}</span>
          </div>
          <div className="flex flex-col">
            {[0, 1, 2, 3].map((qRow) => {
              const inQuarter = monthsInCalendarQuarter(sec, qRow);
              if (!inQuarter.length) return null;
              const qLetters = QUARTER_LETTERS[qRow]!;
              const blockH = verticalQuarterBlockHeight(inQuarter, cellPx, gap, {
                omitTopMonthHeader: true,
              });
              const isLastQuarterInYear = qRow === 3;
              return (
                <div
                  key={`${sec.year}-qg-${qRow}`}
                  className="flex flex-row items-stretch"
                  style={{
                    marginBottom: !isLastQuarterInYear ? CALENDAR_MONTH_STACK_GAP_PX : 0,
                  }}
                >
                  <div
                    className="flex shrink-0 items-center justify-end pr-3 pl-0.5"
                    style={{ width: CALENDAR_QUARTER_GUTTER_W, minHeight: blockH }}
                  >
                    <QuarterLabelText qLetters={qLetters} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RunwayMonthMiniGrid({
  mo,
  secYear,
  si,
  sweepMi,
  cellPx,
  gap,
  monthStripW,
  riskByDate,
  heatmapOpts,
  riskTuning,
  viewMode,
  techWorkloadScope,
  todayYmd,
  shimmer,
  discoMode,
  enableColorSweep,
  postSweep,
  sweepMarketOffsetSec,
  openDayDetailsFromCell,
  dimPastDays,
  showMonthLabel = true,
  showWeekdayRow = true,
  monthLabelPlacement = 'above',
}: {
  mo: CalendarMonthBlock;
  secYear: number;
  si: number;
  sweepMi: number;
  cellPx: number;
  gap: number;
  monthStripW: number;
  riskByDate: Map<string, RiskRow>;
  heatmapOpts: HeatmapColorOpts;
  riskTuning: RiskModelTuning;
  viewMode: ViewModeId;
  techWorkloadScope: TechWorkloadScope;
  todayYmd: string;
  shimmer: boolean;
  discoMode: boolean;
  enableColorSweep: boolean;
  postSweep: boolean;
  sweepMarketOffsetSec: number;
  openDayDetailsFromCell: (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => void;
  /** When true, calendar days strictly before today render at 25% opacity. */
  dimPastDays: boolean;
  showMonthLabel?: boolean;
  showWeekdayRow?: boolean;
  monthLabelPlacement?: 'above' | 'side';
}) {
  const colorLayerKey = viewMode === 'combined' ? `c-${techWorkloadScope}` : viewMode;
  const weekdayRow = showWeekdayRow ? (
    <div className="flex shrink-0 items-end" style={{ height: CALENDAR_WEEKDAY_HEADER_H, gap }}>
      {WEEKDAY_GRID_LABELS.map((abbr, di) => (
        <div
          key={abbr}
          className="flex shrink-0 flex-col items-center justify-end pb-1"
          style={{ width: cellPx }}
        >
          <span
            title={WEEKDAY_HEADERS[di]}
            className="w-full text-center text-[9px] font-semibold leading-none tracking-tight text-muted-foreground/80"
          >
            {abbr}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <div className="shrink-0" style={{ height: CALENDAR_WEEKDAY_HEADER_H }} aria-hidden />
  );

  const weekRowMinH = cellPx;

  const weeksGrid = (
    <div data-runway-weeks-grid data-no-drag className="flex flex-col" style={{ gap }}>
      {mo.weeks.map((week, wi) => (
        <div key={wi} className="flex shrink-0 items-end" style={{ gap, minHeight: weekRowMinH }}>
          {week.map((cell, di) => {
            if (cell === false) {
              return (
                <div
                  key={`${mo.key}-${wi}-${di}`}
                  className="shrink-0"
                  style={{ width: cellPx, minHeight: weekRowMinH }}
                  aria-hidden
                />
              );
            }
            const dateStr = cell;
            const row = dateStr ? riskByDate.get(dateStr) : undefined;
            const metric = row
              ? heatmapCellMetric(row, viewMode, riskTuning, techWorkloadScope)
              : undefined;
            const { fill, dimOpacity } = !dateStr
              ? { fill: HEATMAP_RUNWAY_PAD_FILL, dimOpacity: 1 }
              : runwayHeatmapCellFillAndDim(viewMode, techWorkloadScope, metric, heatmapOpts, row);
            const pastDimmed = dimPastDays && typeof dateStr === 'string' && dateStr < todayYmd;
            const shimmerBase = ((secYear % 100) * 500 + mo.monthIndex * 40 + wi * 7 + di) % 900;
            const sweepDelaySec = sweepDelayForCell(sweepMarketOffsetSec, si, sweepMi, wi, di);
            return cellPx === CELL_PX ? (
              <HeatCell
                key={`${mo.key}-${wi}-${di}`}
                fill={fill}
                dateStr={dateStr}
                isToday={typeof dateStr === 'string' && dateStr === todayYmd}
                pastDimmed={pastDimmed}
                weekdayCol={di}
                shimmerBase={shimmerBase}
                shimmer={shimmer}
                discoMode={discoMode}
                enableColorSweep={enableColorSweep}
                postSweep={postSweep}
                sweepDelaySec={sweepDelaySec}
                colorLayerKey={colorLayerKey}
                dimOpacity={dimOpacity}
                openDayDetailsFromCell={openDayDetailsFromCell}
              />
            ) : (
              <HeatCellSized
                key={`${mo.key}-${wi}-${di}`}
                cellPx={cellPx}
                fill={fill}
                dateStr={dateStr}
                isToday={typeof dateStr === 'string' && dateStr === todayYmd}
                pastDimmed={pastDimmed}
                weekdayCol={di}
                shimmerBase={shimmerBase}
                shimmer={shimmer}
                discoMode={discoMode}
                enableColorSweep={enableColorSweep}
                postSweep={postSweep}
                sweepDelaySec={sweepDelaySec}
                colorLayerKey={colorLayerKey}
                dimOpacity={dimOpacity}
                openDayDetailsFromCell={openDayDetailsFromCell}
              />
            );
          })}
        </div>
      ))}
    </div>
  );

  if (monthLabelPlacement === 'side') {
    const sideTotalW =
      monthStripW + CALENDAR_MONTH_SIDE_LABEL_W + CALENDAR_MONTH_SIDE_LABEL_GAP_PX;
    return (
      <div
        className="flex shrink-0 flex-row items-stretch"
        style={{ width: sideTotalW, gap: CALENDAR_MONTH_SIDE_LABEL_GAP_PX }}
      >
        <div
          className="box-border flex shrink-0 items-center justify-end self-stretch whitespace-nowrap text-right text-[11px] font-semibold capitalize leading-none tracking-tighter text-foreground"
          style={{
            width: CALENDAR_MONTH_SIDE_LABEL_W,
            paddingRight: CALENDAR_MONTH_SIDE_LABEL_PADDING_END_PX,
          }}
        >
          {showMonthLabel ? mo.labelShort : null}
        </div>
        <div className="flex min-w-0 shrink-0 flex-col" style={{ width: monthStripW }}>
          {weekdayRow}
          {weeksGrid}
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col" style={{ width: monthStripW }}>
      {showMonthLabel ? (
        <div
          className="flex items-center justify-center text-center text-[12px] font-semibold capitalize leading-none tracking-tight text-foreground"
          style={{ height: CALENDAR_MONTH_HEADER_H }}
        >
          {mo.labelShort}
        </div>
      ) : (
        <div className="shrink-0" style={{ height: CALENDAR_MONTH_HEADER_H }} aria-hidden />
      )}
      {weekdayRow}
      {weeksGrid}
    </div>
  );
}

function RunwayVerticalHeatmapBody({
  sections,
  cellPx,
  gap,
  monthStripW,
  riskByDate,
  heatmapOpts,
  riskTuning,
  viewMode,
  techWorkloadScope,
  todayYmd,
  dimPastDays,
  shimmer,
  discoMode,
  enableColorSweep,
  postSweep,
  sweepMarketOffsetSec,
  openDayDetailsFromCell,
  layout,
  showQuarterGutter = true,
  compareStripLabels = false,
  firstCalendarMonthKey = null,
  heatmap3d = false,
  rowTowerPx = 0,
}: RunwayVerticalHeatmapBodyProps) {
  const compactStripLabels = compareStripLabels;
  const showWeekdayRowForMonth = (mo: CalendarMonthBlock) =>
    !compactStripLabels || mo.key === firstCalendarMonthKey;

  const skylineWeeks = useMemo(() => flattenRunwayWeeksFromSections(sections), [sections]);

  if (heatmap3d && layout === 'vertical_strip' && !compareStripLabels) {
    return (
      <div className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-visible">
        <RunwayIsoSkyline
          moKey="runway-all"
          weeks={skylineWeeks}
          sections={sections}
          cellPx={cellPx}
          gap={0}
          rowTowerPx={rowTowerPx}
          riskByDate={riskByDate}
          heatmapOpts={heatmapOpts}
          riskTuning={riskTuning}
          viewMode={viewMode}
          techWorkloadScope={techWorkloadScope}
          todayYmd={todayYmd}
          dimPastDays={dimPastDays}
          openDayDetailsFromCell={openDayDetailsFromCell}
        />
      </div>
    );
  }

  if (layout === 'quarter_grid') {
    return (
      <div className="flex flex-col">
        {sections.map((sec, si) => {
          const byMonthIndex = new Map<number, CalendarMonthBlock>();
          for (const mo of sec.months) {
            byMonthIndex.set(mo.monthIndex, mo);
          }
          const quarterRows = [0, 1, 2, 3].flatMap((qRow) => {
            const m0 = qRow * 3;
            const slots: (CalendarMonthBlock | undefined)[] = [
              byMonthIndex.get(m0),
              byMonthIndex.get(m0 + 1),
              byMonthIndex.get(m0 + 2),
            ];
            if (!slots[0] && !slots[1] && !slots[2]) return [];

            let rowHeight = 0;
            for (const mo of slots) {
              if (mo) {
                rowHeight = Math.max(rowHeight, monthBlockMinHeight(mo.weeks.length, cellPx, gap));
              }
            }
            if (rowHeight === 0) {
              rowHeight = CALENDAR_MONTH_HEADER_H + CALENDAR_WEEKDAY_HEADER_H;
            }

            const qLetters: QuarterLetters = QUARTER_LETTERS[qRow]!;

            return [
              <div
                key={`${sec.year}-q${qRow}`}
                className="flex flex-row items-stretch"
              >
                <div
                  className="flex shrink-0 items-center justify-end pr-3 pl-0.5"
                  style={{ width: CALENDAR_QUARTER_GUTTER_W, minHeight: rowHeight }}
                >
                  <QuarterLabelText qLetters={qLetters} />
                </div>
                <div
                  className="flex flex-1 flex-row items-start"
                  style={{ gap: CALENDAR_QUARTER_GRID_COL_GAP_PX }}
                >
                  {slots.map((mo, colIdx) => {
                    if (!mo) {
                      return (
                        <div
                          key={`empty-${sec.year}-${qRow}-${colIdx}`}
                          className="shrink-0"
                          style={{ width: monthStripW, minHeight: rowHeight }}
                          aria-hidden
                        />
                      );
                    }
                    const sweepMi = si * 16 + mo.monthIndex;
                    return (
                      <RunwayMonthMiniGrid
                        key={mo.key}
                        mo={mo}
                        secYear={sec.year}
                        si={si}
                        sweepMi={sweepMi}
                        cellPx={cellPx}
                        gap={gap}
                        monthStripW={monthStripW}
                        riskByDate={riskByDate}
                        heatmapOpts={heatmapOpts}
                        riskTuning={riskTuning}
                        viewMode={viewMode}
                        techWorkloadScope={techWorkloadScope}
                        todayYmd={todayYmd}
                        shimmer={shimmer}
                        discoMode={discoMode}
                        enableColorSweep={enableColorSweep}
                        postSweep={postSweep}
                        sweepMarketOffsetSec={sweepMarketOffsetSec}
                        openDayDetailsFromCell={openDayDetailsFromCell}
                        dimPastDays={dimPastDays}
                      />
                    );
                  })}
                </div>
              </div>,
            ];
          });

          return (
            <div
              key={sec.year}
              style={{
                marginBottom: si < sections.length - 1 ? CALENDAR_QUARTER_BLOCK_GAP_PX : 0,
              }}
            >
              <div
                className="flex items-end justify-center border-b-0 pb-2.5 pt-1"
                style={{ minHeight: CALENDAR_YEAR_HEADER_H }}
              >
                <span className="text-lg font-bold tabular-nums tracking-tight text-foreground">
                  {sec.year}
                </span>
              </div>
              <div
                className="flex flex-col"
                style={{ gap: CALENDAR_QUARTER_GRID_ROW_GAP_PX }}
              >
                {quarterRows}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {sections.map((sec, si) => (
        <div
          key={sec.year}
          style={{
            marginBottom: si < sections.length - 1 ? CALENDAR_QUARTER_BLOCK_GAP_PX : 0,
          }}
        >
          {showQuarterGutter ? (
            <div
              className="flex items-end justify-center border-b-0 pb-2.5 pt-1"
              style={{ minHeight: CALENDAR_YEAR_HEADER_H }}
            >
              <span className="text-lg font-bold tabular-nums tracking-tight text-foreground">{sec.year}</span>
            </div>
          ) : (
            <div
              className="shrink-0 border-b-0 pb-2.5 pt-1"
              style={{ minHeight: CALENDAR_YEAR_HEADER_H }}
              aria-hidden
            />
          )}
          <div className="flex flex-col">
            {[0, 1, 2, 3].map((qRow) => {
              const inQuarter = monthsInCalendarQuarter(sec, qRow);
              if (!inQuarter.length) return null;
              const qLetters: QuarterLetters = QUARTER_LETTERS[qRow]!;
              const isLastQuarterInYear = qRow === 3;
              return (
                <div
                  key={`${sec.year}-q${qRow}`}
                  className="flex flex-row items-stretch"
                  style={{
                    marginBottom: !isLastQuarterInYear ? CALENDAR_MONTH_STACK_GAP_PX : 0,
                  }}
                >
                  {showQuarterGutter ? (
                    <div
                      className="flex shrink-0 items-center justify-end pr-3 pl-0.5"
                      style={{ width: CALENDAR_QUARTER_GUTTER_W }}
                    >
                      <QuarterLabelText qLetters={qLetters} />
                    </div>
                  ) : null}
                  <div className="flex min-w-0 flex-col">
                    {inQuarter.map((mo, qmi) => (
                      <div
                        key={mo.key}
                        style={{
                          marginBottom: qmi < inQuarter.length - 1 ? CALENDAR_MONTH_STACK_GAP_PX : 0,
                        }}
                      >
                        <RunwayMonthMiniGrid
                          mo={mo}
                          secYear={sec.year}
                          si={si}
                          sweepMi={sec.months.indexOf(mo)}
                          cellPx={cellPx}
                          gap={gap}
                          monthStripW={monthStripW}
                          riskByDate={riskByDate}
                          heatmapOpts={heatmapOpts}
                          riskTuning={riskTuning}
                          viewMode={viewMode}
                          techWorkloadScope={techWorkloadScope}
                          todayYmd={todayYmd}
                          shimmer={shimmer}
                          discoMode={discoMode}
                          enableColorSweep={enableColorSweep}
                          postSweep={postSweep}
                          sweepMarketOffsetSec={sweepMarketOffsetSec}
                          openDayDetailsFromCell={openDayDetailsFromCell}
                          dimPastDays={dimPastDays}
                          showWeekdayRow={showWeekdayRowForMonth(mo)}
                          monthLabelPlacement={compareStripLabels ? 'side' : 'above'}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export type SlotSelection = {
  dateStart: string;
  dateEnd: string;
  markets: string[];
  avgPressure: number;
  maxPressure: number;
};

type RunwayGridProps = {
  riskSurface: RiskRow[];
  viewMode: ViewModeId;
  onSlotSelection: (s: SlotSelection | null) => void;
};

export function RunwayGrid({ riskSurface, viewMode, onSlotSelection }: RunwayGridProps) {
  const country = useAtcStore((s) => s.country);
  const setCountry = useAtcStore((s) => s.setCountry);
  const selectCompareMarket = useCallback(
    (marketId: string) => {
      onSlotSelection(null);
      setCountry(marketId, { returnPickerForBack: country });
    },
    [onSlotSelection, setCountry, country]
  );
  const configs = useAtcStore((s) => s.configs);
  const techWorkloadScope = useAtcStore((s) => s.techWorkloadScope);
  const compareAllMarkets = isRunwayMultiMarketStrip(country);
  const runwayTitleWithMarket = `${
    viewMode === 'combined'
      ? technologyRunwayTitleForWorkloadScope(techWorkloadScope)
      : runwayHeatmapTitleForViewMode(viewMode)
  }: ${runwayFocusStripLabel(country)}`;
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const riskHeatmapGamma = useAtcStore((s) => s.riskHeatmapGamma);
  const riskHeatmapGammaTech = useAtcStore((s) => s.riskHeatmapGammaTech);
  const riskHeatmapGammaBusiness = useAtcStore((s) => s.riskHeatmapGammaBusiness);
  const riskHeatmapTailPower = useAtcStore((s) => s.riskHeatmapTailPower);
  const riskHeatmapBusinessPressureOffset = useAtcStore((s) => s.riskHeatmapBusinessPressureOffset);
  const riskHeatmapCurve = useAtcStore((s) => s.riskHeatmapCurve);
  const heatmapRenderStyle = useAtcStore((s) => s.heatmapRenderStyle);
  const heatmapMonoColor = useAtcStore((s) => s.heatmapMonoColor);
  const heatmapSpectrumContinuous = useAtcStore((s) => s.heatmapSpectrumContinuous);
  const reduceMotion = useReducedMotion();
  const shimmer = !reduceMotion;
  const theme = useAtcStore((s) => s.theme);
  const discoModePref = useAtcStore((s) => s.discoMode);
  const setDiscoMode = useAtcStore((s) => s.setDiscoMode);
  const discoMode = discoModePref && !reduceMotion && theme === 'dark';
  const runway3dHeatmap = useAtcStore((s) => s.runway3dHeatmap);
  const setRunway3dHeatmap = useAtcStore((s) => s.setRunway3dHeatmap);
  const showIso3d = RUNWAY_ISO_3D_ENABLED && runway3dHeatmap;
  const runwaySvgHeatmapPref = useAtcStore((s) => s.runwaySvgHeatmap);
  const setRunwaySvgHeatmap = useAtcStore((s) => s.setRunwaySvgHeatmap);
  const useSvgHeatmap = runwaySvgHeatmapPref && (compareAllMarkets || !showIso3d);
  const runwayFilterYear = useAtcStore((s) => s.runwayFilterYear);
  const runwayFilterQuarter = useAtcStore((s) => s.runwayFilterQuarter);
  const runwayIncludeFollowingQuarter = useAtcStore((s) => s.runwayIncludeFollowingQuarter);

  const [displayedCountry, setDisplayedCountry] = useState(country);
  const [countrySwitchLoading, setCountrySwitchLoading] = useState(false);

  const scrollTopRef = useRef(0);
  const [tip, setTip] = useState<RunwayTipState | null>(null);
  const tipRef = useRef<RunwayTipState | null>(null);
  tipRef.current = tip;
  const heatmapInteractionRef = useRef<HTMLDivElement>(null);
  const tooltipRootRef = useRef<HTMLDivElement>(null);
  const summaryPanelRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const heatmapCaptureRef = useRef<HTMLDivElement>(null);
  /** LIOM compare: horizontal scrollport — measured to pick a cell size that fits the main heatmap column. */
  const compareScrollRef = useRef<HTMLDivElement>(null);
  /** Single-market: measured to auto-fit cell size to available space. */
  const singleMarketFitRef = useRef<HTMLDivElement>(null);
  const [pngExporting, setPngExporting] = useState(false);
  const [dimPastDays, setDimPastDays] = useState(false);

  const [runwayCellPx, setRunwayCellPx] = useState(CELL_PX);

  const cellPx = runwayCellPx;

  const runway3dRowTowerPx = useMemo(
    () => (!compareAllMarkets && showIso3d ? Math.round(cellPx * 1.38) : 0),
    [compareAllMarkets, showIso3d, cellPx]
  );

  const useSideSummary = !compareAllMarkets && !showIso3d;

  const marketsOrdered = useMemo(() => {
    const fromCfg = configs.map((c) => c.market);
    const base = fromCfg.length ? fromCfg : [...new Set(riskSurface.map((r) => r.market))].sort();
    if (!isRunwayMultiMarketStrip(country)) return base;
    const present = new Set(base);
    return runwayCompareMarketIds(country, base).filter((id) => present.has(id));
  }, [configs, riskSurface, country]);

  const singleMarketId = compareAllMarkets ? '' : country;
  const marketConfig = useMemo(
    () => (singleMarketId ? configs.find((c) => c.market === singleMarketId) : undefined),
    [configs, singleMarketId]
  );

  /** Dates shown in the calendar: full picker span when year is set (every calendar day), else model dates only. */
  const layoutDatesSorted = useMemo(() => {
    if (runwayFilterYear != null) {
      const { start, end } = runwayPickerLayoutBounds(
        runwayFilterYear,
        runwayFilterQuarter,
        runwayIncludeFollowingQuarter
      );
      return enumerateIsoDatesInclusive(start, end);
    }
    return [...new Set(riskSurface.map((r) => r.date))].sort();
  }, [riskSurface, runwayFilterYear, runwayFilterQuarter, runwayIncludeFollowingQuarter]);

  useLayoutEffect(() => {
    setTip(null);
  }, [country]);

  useLayoutEffect(() => {
    if (reduceMotion) {
      if (country !== displayedCountry) {
        setDisplayedCountry(country);
      }
      setCountrySwitchLoading(false);
      return;
    }
    /** Single ↔ all-markets changes layout root (flat columns vs city block / strip). A delayed handoff + multi `set()` in `setCountry` re-schedules the timer every render and can starve the 260ms timeout — skeleton never clears until full reload. */
    const crossCompareBoundary =
      isRunwayMultiMarketStrip(country) !== isRunwayMultiMarketStrip(displayedCountry);
    if (crossCompareBoundary) {
      if (country !== displayedCountry) setDisplayedCountry(country);
      setCountrySwitchLoading(false);
      return;
    }
    if (country === displayedCountry) {
      setCountrySwitchLoading(false);
      return;
    }
    setCountrySwitchLoading(true);
  }, [country, displayedCountry, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || !countrySwitchLoading) return;
    if (country === displayedCountry) return;
    const h = window.setTimeout(() => {
      setDisplayedCountry(country);
      setCountrySwitchLoading(false);
    }, COUNTRY_SWITCH_MIN_MS);
    return () => clearTimeout(h);
  }, [countrySwitchLoading, country, displayedCountry, reduceMotion]);

  useEffect(() => {
    if (compareAllMarkets) onSlotSelection(null);
  }, [compareAllMarkets, onSlotSelection]);

  const marketsFitKey = useMemo(() => marketsOrdered.join(','), [marketsOrdered]);
  const compareDatesFitKey = useMemo(() => layoutDatesSorted.join(','), [layoutDatesSorted]);

  useLayoutEffect(() => {
    if (!compareAllMarkets || marketsOrdered.length === 0 || countrySwitchLoading) return;
    if (showIso3d) return;
    const el = compareScrollRef.current;
    if (!el) return;

    const applyFit = () => {
      const w = el.clientWidth;
      if (w < 48) return;
      const top = el.getBoundingClientRect().top;
      const viewportBelow = Math.max(
        80,
        (typeof window !== 'undefined' ? window.innerHeight : 640) - top - 16
      );
      const measuredH = el.clientHeight;
      const h =
        measuredH > 48 ? Math.min(measuredH, viewportBelow) : viewportBelow;
      const next = bestCellPxForCompareAllRunwayFit(
        w,
        h,
        marketsOrdered.length,
        layoutDatesSorted
      );
      setRunwayCellPx((prev) => (prev === next ? prev : next));
    };

    applyFit();
    const ro = new ResizeObserver(() => applyFit());
    ro.observe(el);
    window.addEventListener('resize', applyFit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', applyFit);
    };
  }, [
    compareAllMarkets,
    compareDatesFitKey,
    marketsFitKey,
    marketsOrdered.length,
    countrySwitchLoading,
    showIso3d,
  ]);

  useLayoutEffect(() => {
    if (compareAllMarkets || countrySwitchLoading) return;
    if (showIso3d) return;
    const el = singleMarketFitRef.current;
    if (!el) return;

    const applyFit = () => {
      const w = el.clientWidth;
      if (w < 48) return;
      const top = el.getBoundingClientRect().top;
      const viewportBelow = Math.max(
        80,
        (typeof window !== 'undefined' ? window.innerHeight : 640) - top - 16
      );
      const measuredH = el.clientHeight;
      const h =
        measuredH > 48 ? Math.min(measuredH, viewportBelow) : viewportBelow;
      const next = bestCellPxForSingleMarketFit(w, h, layoutDatesSorted);
      setRunwayCellPx((prev) => (prev === next ? prev : next));
    };

    applyFit();
    const ro = new ResizeObserver(() => applyFit());
    ro.observe(el);
    window.addEventListener('resize', applyFit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', applyFit);
    };
  }, [compareAllMarkets, compareDatesFitKey, countrySwitchLoading, showIso3d]);

  const dismissTip = useCallback(() => {
    setTip(null);
  }, []);

  const calendarLayout = useMemo(() => {
    if (compareAllMarkets) return buildVerticalMonthsRunwayLayout(layoutDatesSorted, cellPx);
    if (showIso3d) {
      return buildVerticalMonthsRunwayLayout(layoutDatesSorted, cellPx, {
        rowTowerPx: runway3dRowTowerPx,
      });
    }
    return buildQuarterGridRunwayLayout(layoutDatesSorted, cellPx);
  }, [layoutDatesSorted, cellPx, compareAllMarkets, showIso3d, runway3dRowTowerPx]);

  const heatmapOpts: HeatmapColorOpts = useMemo(() => {
    const heatmapSpectrumMode: HeatmapSpectrumMode = heatmapSpectrumContinuous
      ? 'continuous'
      : 'discrete';
    const gamma =
      viewMode === 'combined'
        ? riskHeatmapGammaTech
        : viewMode === 'in_store'
          ? riskHeatmapGammaBusiness
          : viewMode === 'market_risk'
            ? riskHeatmapGammaTech
            : riskHeatmapGamma;
    const tailPower = viewMode === 'in_store' ? 1 : riskHeatmapTailPower;
    return {
      riskHeatmapCurve,
      riskHeatmapGamma: gamma,
      riskHeatmapTailPower: tailPower,
      businessHeatmapPressureOffset: riskHeatmapBusinessPressureOffset,
      renderStyle: heatmapRenderStyle,
      monoColor: heatmapMonoColor,
      heatmapSpectrumMode,
    };
  }, [
    viewMode,
    riskHeatmapBusinessPressureOffset,
    riskHeatmapCurve,
    riskHeatmapGamma,
    riskHeatmapGammaTech,
    riskHeatmapGammaBusiness,
    riskHeatmapTailPower,
    heatmapRenderStyle,
    heatmapMonoColor,
    heatmapSpectrumContinuous,
  ]);

  const buildPayloadTipState = useCallback(
    (market: string, dateStr: string, anchor: RunwayTipAnchor): RunwayTipState | null => {
      const riskByDate = riskByDateForMarket(riskSurface, market);
      const row = riskByDate.get(dateStr);
      if (!row) return null;
      const config = configs.find((c) => c.market === market);
      const wd = weekdayShortFromYmd(dateStr);
      const fillMetricValue = heatmapCellMetric(row, viewMode, riskTuning, techWorkloadScope);
      const { fill: cellFillHex } = runwayHeatmapCellFillAndDim(
        viewMode,
        techWorkloadScope,
        fillMetricValue,
        heatmapOpts,
        row
      );
      const payload = buildRunwayTooltipPayload({
        dateStr,
        weekdayShort: wd,
        market,
        viewMode,
        row,
        config,
        tuning: riskTuning,
        fillMetricHeadline: fillMetricHeadlineForView(viewMode, techWorkloadScope),
        fillMetricLabel: fillMetricLabelForView(viewMode, techWorkloadScope),
        fillMetricLeadCompact: fillMetricLeadCompactForView(viewMode, techWorkloadScope),
        fillMetricValue,
        cellFillHex,
        techWorkloadScope,
      });
      return { x: anchor.clientX, y: anchor.clientY, payload };
    },
    [riskSurface, configs, viewMode, riskTuning, heatmapOpts, techWorkloadScope]
  );

  const makeShowTip = useCallback(
    (market: string, riskByDate: Map<string, RiskRow>, _config: MarketConfig | undefined) =>
      (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => {
        const wd = dateStr ? weekdayShortFromYmd(dateStr) : WEEKDAY_HEADERS[weekdayCol];
        const prev = tipRef.current;
        const { clientX, clientY } = anchor;

        if (!dateStr) {
          const simple = `${wd} — outside model range`;
          if (prev && 'simple' in prev && prev.simple === simple) {
            setTip(null);
            return;
          }
          setTip({ x: clientX, y: clientY, simple });
          return;
        }
        const row = riskByDate.get(dateStr);
        if (!row) {
          const simple = `${dateStr} · ${market} — no data`;
          if (prev && 'simple' in prev && prev.simple === simple) {
            setTip(null);
            return;
          }
          setTip({ x: clientX, y: clientY, simple });
          return;
        }
        if (prev && 'payload' in prev && prev.payload.dateStr === dateStr && prev.payload.market === market) {
          setTip(null);
          return;
        }
        const next = buildPayloadTipState(market, dateStr, anchor);
        if (next) setTip(next);
      },
    [buildPayloadTipState]
  );

  useEffect(() => {
    if (!tip) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissTip();
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (isHeatmapKeyNavSuppressed(e.target)) return;
      const cur = tipRef.current;
      if (!cur || !('payload' in cur)) return;
      const { dateStr, market } = cur.payload;
      const idx = layoutDatesSorted.indexOf(dateStr);
      if (idx < 0) return;
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      const anchor = { clientX: cur.x, clientY: cur.y };
      let nextIdx = idx + delta;
      while (nextIdx >= 0 && nextIdx < layoutDatesSorted.length) {
        const nextDate = layoutDatesSorted[nextIdx]!;
        const nextTip = buildPayloadTipState(market, nextDate, anchor);
        if (nextTip) {
          e.preventDefault();
          setTip(nextTip);
          return;
        }
        nextIdx += delta;
      }
    };
    const onPointerDownCapture = (e: PointerEvent) => {
      const n = e.target as Node | null;
      if (!n) return;
      const el = n as HTMLElement;
      if (el.closest?.('[data-atc-definition-popover]')) return;
      if (heatmapInteractionRef.current?.contains(n)) return;
      if (tooltipRootRef.current?.contains(n)) return;
      if (summaryPanelRef.current?.contains(n)) return;
      dismissTip();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
    };
  }, [tip, dismissTip, layoutDatesSorted, buildPayloadTipState]);

  const todayYmd = formatDateYmd(new Date());
  const gap = RUNWAY_CELL_GAP_PX;
  const monthStripW = runwayDayStripWidth(cellPx, gap, RUNWAY_DAY_COLUMNS);

  const motionEase = [0.22, 1, 0.36, 1] as const;

  const pngFilenameBase = useMemo(() => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const mode = viewMode.replace(/_/g, '-');
    return compareAllMarkets ? `runway-all-markets_${mode}_${stamp}` : `runway-${country}_${mode}_${stamp}`;
  }, [compareAllMarkets, country, viewMode]);

  const handleDownloadPng = useCallback(async () => {
    const el = heatmapCaptureRef.current;
    if (!el || !calendarLayout || countrySwitchLoading) return;
    setPngExporting(true);
    try {
      await downloadRunwayHeatmapPng(el, { filename: `${pngFilenameBase}.png` });
    } catch (e) {
      console.error(e);
    } finally {
      setPngExporting(false);
    }
  }, [calendarLayout, countrySwitchLoading, pngFilenameBase]);

  if (!countrySwitchLoading && !calendarLayout) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-2 bg-transparent px-8 py-12 text-center">
        <div className="flex flex-row flex-wrap items-center justify-center gap-2.5">
          <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
            {runwayTitleWithMarket}
          </h2>
          {!compareAllMarkets ? <MarketCircleFlag marketId={country} size={26} /> : null}
        </div>
        <p className="text-sm font-medium text-foreground">No runway data</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Apply valid multi-market YAML in the editor.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex w-full shrink-0 flex-col overflow-visible bg-transparent">
      <div
        key={`${viewMode}-${country}`}
        className="mx-auto w-full max-w-full rounded-xl border border-border/45 bg-card/35 px-4 pb-3 pt-3 shadow-sm dark:bg-card/20 sm:px-5 sm:pb-4 sm:pt-3.5"
      >
        <div className="mb-3 flex flex-col gap-3 sm:mb-4">
          <div className="flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-start min-[480px]:justify-between min-[480px]:gap-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3 gap-y-2">
              <RunwayFocusSelect className="min-w-0" />
              <RunwayRangeSelect className="min-w-0" />
            </div>
            <div
              className="flex shrink-0 flex-wrap items-center justify-center gap-0.5 min-[480px]:justify-end"
              role="toolbar"
              aria-label="Runway view actions"
            >
            <button
              type="button"
              disabled={countrySwitchLoading}
              aria-pressed={runwaySvgHeatmapPref}
              title={
                showIso3d && !compareAllMarkets
                  ? '3D single-market view is on — turn 3D off to use flat SVG cells'
                  : runwaySvgHeatmapPref
                    ? 'SVG runway cells on (flat heatmap). Off for HTML cells, colour swoosh, disco twinkle.'
                    : 'SVG runway cells off — HTML cells; enables swoosh / disco on flat view'
              }
              aria-label={
                runwaySvgHeatmapPref ? 'Turn off SVG runway heatmap' : 'Turn on SVG runway heatmap'
              }
              onClick={() => setRunwaySvgHeatmap(!runwaySvgHeatmapPref)}
              className={cn(
                RUNWAY_TOOLBAR_ICON_BTN,
                runwaySvgHeatmapPref && 'border-primary/40 bg-primary/10 text-foreground'
              )}
            >
              <Grid2x2 className="h-3.5 w-3.5 opacity-90" aria-hidden />
            </button>
            {RUNWAY_ISO_3D_ENABLED ? (
              <button
                type="button"
                disabled={countrySwitchLoading}
                aria-pressed={runway3dHeatmap}
                title={
                  compareAllMarkets
                    ? 'Isometric 3D city block: all markets on one surface'
                    : 'Isometric 3D pressure blocks in one vertical column'
                }
                aria-label={runway3dHeatmap ? 'Turn off 3D runway' : 'Turn on 3D runway'}
                onClick={() => setRunway3dHeatmap(!runway3dHeatmap)}
                className={cn(
                  RUNWAY_TOOLBAR_ICON_BTN,
                  runway3dHeatmap && 'border-primary/40 bg-primary/10 text-foreground'
                )}
              >
                <Box className="h-3.5 w-3.5 opacity-90" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              disabled={countrySwitchLoading}
              aria-pressed={discoModePref}
              title={
                reduceMotion
                  ? 'Disco twinkle: twinkle every runway cell. Off while reduced motion is preferred.'
                  : theme !== 'dark'
                    ? 'Disco twinkle (applies in dark theme)'
                    : 'Twinkle every runway cell'
              }
              aria-label={discoModePref ? 'Turn off disco twinkle' : 'Turn on disco twinkle'}
              onClick={() => setDiscoMode(!discoModePref)}
              className={cn(
                RUNWAY_TOOLBAR_ICON_BTN,
                discoModePref && 'border-primary/40 bg-primary/10 text-foreground'
              )}
            >
              <Sparkles className="h-3.5 w-3.5 opacity-90" aria-hidden />
            </button>
            <span
              className="mx-0.5 hidden h-4 w-px shrink-0 self-center bg-border/60 sm:block"
              aria-hidden
            />
            <button
              type="button"
              disabled={countrySwitchLoading}
              aria-pressed={dimPastDays}
              title={dimPastDays ? 'Past days: dimmed (click for full strength)' : 'Dim calendar days before today'}
              aria-label={dimPastDays ? 'Show past days at full strength' : 'Dim past days'}
              onClick={() => setDimPastDays((v) => !v)}
              className={cn(
                RUNWAY_TOOLBAR_ICON_BTN,
                dimPastDays && 'border-primary/40 bg-primary/10 text-foreground'
              )}
            >
              <CalendarDays className="h-3.5 w-3.5 opacity-90" aria-hidden />
            </button>
            <button
              type="button"
              disabled={runwayCellPx <= RUNWAY_CELL_PX_MIN || countrySwitchLoading}
              onClick={() => setRunwayCellPx((p) => snapRunwayCellPx(p - RUNWAY_CELL_PX_STEP))}
              title="Zoom out"
              aria-label="Zoom out runway heatmap"
              className={RUNWAY_TOOLBAR_ICON_BTN}
            >
              <ZoomOut className="h-3.5 w-3.5 opacity-90" aria-hidden />
            </button>
            <button
              type="button"
              disabled={runwayCellPx >= RUNWAY_CELL_PX_MAX || countrySwitchLoading}
              onClick={() => setRunwayCellPx((p) => snapRunwayCellPx(p + RUNWAY_CELL_PX_STEP))}
              title="Zoom in"
              aria-label="Zoom in runway heatmap"
              className={RUNWAY_TOOLBAR_ICON_BTN}
            >
              <ZoomIn className="h-3.5 w-3.5 opacity-90" aria-hidden />
            </button>
            <button
              type="button"
              disabled={
                !calendarLayout || countrySwitchLoading || pngExporting || !layoutDatesSorted.length
              }
              onClick={() => void handleDownloadPng()}
              title={pngExporting ? 'Exporting…' : 'Download PNG'}
              aria-label={pngExporting ? 'Exporting runway image' : 'Download runway heatmap as PNG'}
              className={RUNWAY_TOOLBAR_ICON_BTN}
            >
              {pngExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/80" aria-hidden />
              ) : (
                <Download className="h-3.5 w-3.5 opacity-90" aria-hidden />
              )}
            </button>
            </div>
          </div>
          <div className="flex min-w-0 flex-row flex-wrap items-center justify-center gap-2.5 min-[480px]:justify-start">
            <h2 className="min-w-0 text-center text-lg font-bold leading-snug tracking-tight text-foreground min-[480px]:text-left sm:text-xl">
              {runwayTitleWithMarket}
            </h2>
            {!compareAllMarkets ? (
              <MarketCircleFlag marketId={country} size={26} className="max-sm:shrink-0" />
            ) : null}
          </div>
        </div>

        <div className="relative w-full max-w-full">
            <AnimatePresence mode="wait">
            {countrySwitchLoading ? (
              <motion.div
                key={`sk-${country}`}
                className="w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.14 }}
              >
                <RunwaySkeleton
                  compareAll={compareAllMarkets}
                  reduceMotion={!!reduceMotion}
                  compareColumnCount={marketsOrdered.length}
                />
              </motion.div>
            ) : calendarLayout ? (
              <motion.div
                key={`grid-${country}-${compareAllMarkets ? 'compare' : 'single'}-${showIso3d ? '3d' : 'flat'}-${useSvgHeatmap ? 'svg' : 'html'}`}
                className="w-full"
                initial={reduceMotion ? false : { y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: motionEase }}
              >
                <RunwayGridBody
                  compareScrollRef={compareScrollRef}
                  singleMarketFitRef={singleMarketFitRef}
                  compareAllMarkets={compareAllMarkets}
                  marketsOrdered={marketsOrdered}
                  riskSurface={riskSurface}
                  configs={configs}
                  sections={calendarLayout.sections}
                  contentWidth={calendarLayout.contentWidth}
                  placedCells={calendarLayout.placedCells}
                  cellPx={cellPx}
                  gap={gap}
                  monthStripW={monthStripW}
                  heatmapOpts={heatmapOpts}
                  riskTuning={riskTuning}
                  viewMode={viewMode}
                  techWorkloadScope={techWorkloadScope}
                  todayYmd={todayYmd}
                  dimPastDays={dimPastDays}
                  shimmer={shimmer}
                  discoMode={discoMode}
                  country={country}
                  marketConfig={marketConfig}
                  heatmap3d={!compareAllMarkets && showIso3d}
                  runway3dHeatmap={showIso3d}
                  rowTowerPx={runway3dRowTowerPx}
                  runwaySvgHeatmap={useSvgHeatmap}
                  makeShowTip={makeShowTip}
                  heatmapInteractionRef={heatmapInteractionRef}
                  outerRef={outerRef}
                  heatmapCaptureRef={heatmapCaptureRef}
                  scrollTopRef={scrollTopRef}
                  onSlotSelection={onSlotSelection}
                  onCompareMarketSelect={compareAllMarkets ? selectCompareMarket : undefined}
                  reduceMotion={!!reduceMotion}
                  useSideSummary={useSideSummary}
                  tip={tip}
                  summaryPanelRef={summaryPanelRef}
                  onClearDaySummary={dismissTip}
                />
              </motion.div>
            ) : null}
            </AnimatePresence>
        </div>
      </div>

      <RunwayCellTooltip
        tip={useSideSummary ? null : tip}
        reducedMotion={!!reduceMotion}
        onDismiss={dismissTip}
        rootRef={tooltipRootRef}
      />
    </div>
  );
}

type RunwayGridBodyProps = {
  compareScrollRef: RefObject<HTMLDivElement | null>;
  singleMarketFitRef: RefObject<HTMLDivElement | null>;
  compareAllMarkets: boolean;
  marketsOrdered: string[];
  riskSurface: RiskRow[];
  configs: MarketConfig[];
  sections: VerticalYearSection[];
  contentWidth: number;
  placedCells: PlacedRunwayCell[];
  cellPx: number;
  gap: number;
  monthStripW: number;
  heatmapOpts: HeatmapColorOpts;
  riskTuning: RiskModelTuning;
  viewMode: ViewModeId;
  techWorkloadScope: TechWorkloadScope;
  todayYmd: string;
  dimPastDays: boolean;
  shimmer: boolean;
  discoMode: boolean;
  country: string;
  marketConfig: MarketConfig | undefined;
  makeShowTip: (
    market: string,
    riskByDate: Map<string, RiskRow>,
    config: MarketConfig | undefined
  ) => (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => void;
  heatmapInteractionRef: React.RefObject<HTMLDivElement | null>;
  outerRef: React.MutableRefObject<HTMLDivElement | null>;
  heatmapCaptureRef: React.MutableRefObject<HTMLDivElement | null>;
  scrollTopRef: React.MutableRefObject<number>;
  onSlotSelection: (s: SlotSelection | null) => void;
  /** LIOM compare columns: clicking a market code switches picker to that single market. */
  onCompareMarketSelect?: (marketId: string) => void;
  reduceMotion: boolean;
  heatmap3d: boolean;
  /** Raw 3D toggle — used by the city block path when compareAllMarkets is on. */
  runway3dHeatmap: boolean;
  rowTowerPx: number;
  /** Flat heatmaps: quarter grid (single) or compare columns as SVG when on. */
  runwaySvgHeatmap: boolean;
  /** Single-market flat: heatmap + side summary instead of popover. */
  useSideSummary: boolean;
  tip: RunwayTipState | null;
  summaryPanelRef: Ref<HTMLDivElement | null>;
  onClearDaySummary: () => void;
};

function RunwayGridBody({
  compareScrollRef,
  singleMarketFitRef,
  compareAllMarkets,
  marketsOrdered,
  riskSurface,
  configs,
  sections,
  contentWidth,
  placedCells,
  cellPx,
  gap,
  monthStripW,
  heatmapOpts,
  riskTuning,
  viewMode,
  techWorkloadScope,
  todayYmd,
  dimPastDays,
  shimmer,
  discoMode,
  country,
  marketConfig,
  makeShowTip,
  heatmapInteractionRef,
  outerRef,
  heatmapCaptureRef,
  scrollTopRef,
  onSlotSelection,
  onCompareMarketSelect,
  reduceMotion,
  heatmap3d,
  runway3dHeatmap,
  rowTowerPx,
  runwaySvgHeatmap,
  useSideSummary,
  tip,
  summaryPanelRef,
  onClearDaySummary,
}: RunwayGridBodyProps) {
  const enableColorSweep = !reduceMotion;
  const [postSweep, setPostSweep] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) {
      setPostSweep(true);
      return;
    }
    setPostSweep(false);
    const t = window.setTimeout(() => setPostSweep(true), SWOOSH_POST_MS);
    return () => clearTimeout(t);
  }, [reduceMotion, viewMode, techWorkloadScope]);

  const firstCompareCalendarMonthKey = useMemo(
    () => firstCalendarMonthKeyFromSections(sections),
    [sections]
  );

  const singleRiskByDate = useMemo(
    () => (compareAllMarkets ? null : riskByDateForMarket(riskSurface, country)),
    [compareAllMarkets, riskSurface, country]
  );

  return (
    <div className="flex w-full min-w-0 max-w-full justify-start pl-0.5 sm:pl-1">
      <div
        ref={heatmapCaptureRef}
        className={cn(
          'flex w-full min-w-0 max-w-full flex-col-reverse items-stretch gap-4 lg:flex-row lg:gap-4',
          heatmap3d || compareAllMarkets ? 'lg:min-h-0 lg:items-stretch' : 'lg:items-start'
        )}
      >
      <div
        className={cn(
          // Swatch-only legend: hug content; cap so large cell zoom still fits without eating the runway.
          'box-border flex w-fit max-w-[min(100%,6.5rem)] shrink-0 grow-0 flex-col',
          'mx-auto lg:mx-0 lg:self-start',
          'lg:border-r lg:border-border/40 lg:pr-2.5 lg:pl-0.5',
          compareAllMarkets ? 'pt-0.5' : 'pt-0.5',
          !compareAllMarkets && !heatmap3d && 'lg:pt-[var(--runway-year-strip)]'
        )}
        style={
          !compareAllMarkets
            ? ({ ['--runway-year-strip' as string]: `${CALENDAR_YEAR_STRIP_TOTAL_PX}px` } as React.CSSProperties)
            : undefined
        }
      >
        <HeatmapLegend
          className="w-fit max-w-full min-w-0 text-left"
          viewMode={viewMode}
          heatmapOpts={heatmapOpts}
          cellSizePx={cellPx}
          cellGapPx={gap}
        />
      </div>
      <div
        ref={heatmapInteractionRef as Ref<HTMLDivElement>}
        className={cn(
          'flex min-w-0 flex-1 flex-col bg-transparent p-0 shadow-none',
          heatmap3d ? 'min-h-0 justify-stretch' : compareAllMarkets ? 'min-h-0 justify-stretch' : 'justify-center',
          !compareAllMarkets && useSideSummary && 'lg:flex-row lg:items-start'
        )}
      >
        {compareAllMarkets ? (
          runway3dHeatmap ? (
            <RunwayIsoCityBlock
              sections={sections}
              markets={marketsOrdered}
              riskSurface={riskSurface}
              cellPx={Math.max(cellPx, 18)}
              heatmapOpts={heatmapOpts}
              riskTuning={riskTuning}
              viewMode={viewMode}
              techWorkloadScope={techWorkloadScope}
              todayYmd={todayYmd}
              dimPastDays={dimPastDays}
            />
          ) : (
          <div
            ref={compareScrollRef as Ref<HTMLDivElement>}
            className="min-h-0 w-full flex-1 overflow-x-auto overflow-y-auto pb-1"
          >
            <div
              className="flex w-max max-w-none flex-row items-start justify-start px-0.5"
              style={{ gap: CALENDAR_QUARTER_GRID_COL_GAP_PX }}
            >
              <div className="flex shrink-0 flex-col items-end">
                <div className="invisible relative z-20 mb-1.5 flex h-[32px] items-center justify-center" aria-hidden>
                  <RunwayMarketCodeSticker code="UK" />
                </div>
                <div className="relative z-0 shrink-0 overflow-visible bg-transparent" style={{ width: CALENDAR_QUARTER_GUTTER_W }}>
                  <RunwayCompareQuarterGutter sections={sections} cellPx={cellPx} gap={gap} />
                </div>
              </div>
              {marketsOrdered.map((m, colIdx) => {
                const map = riskByDateForMarket(riskSurface, m);
                const cfg = configs.find((c) => c.market === m);
                return (
                  <div key={m} className="flex shrink-0 flex-col items-center">
                    <div className="relative z-20 mb-1.5 flex h-[32px] items-center justify-center">
                      <RunwayMarketCodeSticker
                        code={m}
                        subtitle={cfg?.title}
                        onSelect={
                          onCompareMarketSelect ? () => onCompareMarketSelect(m) : undefined
                        }
                      />
                    </div>
                    <div
                      className="relative z-0 shrink-0 overflow-visible bg-transparent"
                      style={{
                        width:
                          monthStripW +
                          CALENDAR_MONTH_SIDE_LABEL_W +
                          CALENDAR_MONTH_SIDE_LABEL_GAP_PX,
                      }}
                    >
                      {runwaySvgHeatmap ? (
                        <RunwayCompareSvgColumn
                          marketKey={m}
                          sections={sections}
                          cellPx={cellPx}
                          gap={gap}
                          monthStripW={monthStripW}
                          riskByDate={map}
                          heatmapOpts={heatmapOpts}
                          riskTuning={riskTuning}
                          viewMode={viewMode}
                          techWorkloadScope={techWorkloadScope}
                          todayYmd={todayYmd}
                          dimPastDays={dimPastDays}
                          firstCalendarMonthKey={firstCompareCalendarMonthKey}
                          openDayDetailsFromCell={makeShowTip(m, map, cfg)}
                        />
                      ) : (
                        <RunwayVerticalHeatmapBody
                          sections={sections}
                          cellPx={cellPx}
                          gap={gap}
                          monthStripW={monthStripW}
                          riskByDate={map}
                          heatmapOpts={heatmapOpts}
                          riskTuning={riskTuning}
                          viewMode={viewMode}
                          techWorkloadScope={techWorkloadScope}
                          todayYmd={todayYmd}
                          dimPastDays={dimPastDays}
                          shimmer={shimmer}
                          discoMode={discoMode}
                          enableColorSweep={enableColorSweep}
                          postSweep={postSweep}
                          sweepMarketOffsetSec={colIdx * SWOOSH_MARKET_COLUMN_GAP_SEC}
                          openDayDetailsFromCell={makeShowTip(m, map, cfg)}
                          layout="vertical_strip"
                          showQuarterGutter={false}
                          compareStripLabels
                          firstCalendarMonthKey={firstCompareCalendarMonthKey}
                          heatmap3d={false}
                          rowTowerPx={0}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )
        ) : (
          <>
            <div
              ref={singleMarketFitRef as Ref<HTMLDivElement>}
              className={cn(
                'flex w-full pb-1',
                heatmap3d
                  ? 'min-h-[min(88dvh,calc(100dvh-6rem))] flex-1 flex-col overflow-x-auto overflow-y-auto'
                  : useSideSummary
                    ? 'min-w-0 flex-1 justify-center overflow-x-auto overflow-y-visible lg:basis-0 lg:flex-col lg:items-center lg:justify-start lg:overflow-x-auto lg:overflow-y-auto lg:px-3'
                    : 'justify-center overflow-x-auto overflow-y-visible'
              )}
            >
              <div
                ref={outerRef}
                className={cn(
                  'relative overflow-visible bg-transparent',
                  heatmap3d ? 'flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col' : 'shrink-0',
                  useSideSummary && 'lg:mx-auto'
                )}
                style={heatmap3d ? { width: '100%', minWidth: 0 } : { width: contentWidth }}
              >
                <SlotOverlay
                  outerRef={outerRef}
                  cellSize={cellPx}
                  cellHitHeightPx={rowTowerPx > 0 ? cellPx + rowTowerPx : undefined}
                  placedCells={placedCells}
                  scrollTopRef={scrollTopRef}
                  market={country}
                  riskByDate={singleRiskByDate!}
                  viewMode={viewMode}
                  techWorkloadScope={techWorkloadScope}
                  riskTuning={riskTuning}
                  onSlotSelection={onSlotSelection}
                  disabled={heatmap3d}
                />
                {runwaySvgHeatmap ? (
                  <RunwayQuarterGridSvg
                    marketKey={country}
                    sections={sections}
                    cellPx={cellPx}
                    gap={gap}
                    monthStripW={monthStripW}
                    riskByDate={singleRiskByDate!}
                    heatmapOpts={heatmapOpts}
                    riskTuning={riskTuning}
                    viewMode={viewMode}
                    techWorkloadScope={techWorkloadScope}
                    todayYmd={todayYmd}
                    dimPastDays={dimPastDays}
                    openDayDetailsFromCell={makeShowTip(country, singleRiskByDate!, marketConfig)}
                  />
                ) : (
                  <RunwayVerticalHeatmapBody
                    sections={sections}
                    cellPx={cellPx}
                    gap={gap}
                    monthStripW={monthStripW}
                    riskByDate={singleRiskByDate!}
                    heatmapOpts={heatmapOpts}
                    riskTuning={riskTuning}
                    viewMode={viewMode}
                    techWorkloadScope={techWorkloadScope}
                    todayYmd={todayYmd}
                    dimPastDays={dimPastDays}
                    shimmer={shimmer}
                    discoMode={discoMode}
                    enableColorSweep={enableColorSweep}
                    postSweep={postSweep}
                    sweepMarketOffsetSec={0}
                    openDayDetailsFromCell={makeShowTip(country, singleRiskByDate!, marketConfig)}
                    layout={heatmap3d ? 'vertical_strip' : 'quarter_grid'}
                    heatmap3d={heatmap3d}
                    rowTowerPx={rowTowerPx}
                  />
                )}
              </div>
            </div>
            {useSideSummary ? (
              <RunwayDaySummaryPanel
                tip={tip}
                onClear={onClearDaySummary}
                panelRef={summaryPanelRef}
              />
            ) : null}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
