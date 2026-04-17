import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import type { Dispatch, ReactNode, Ref, RefObject, SetStateAction } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  runwayHeatmapTitleForViewMode,
  runwayLensProductLabel,
  type ViewModeId,
} from '@/lib/constants';
import { heatmapTuningLensForViewMode } from '@/lib/heatmapTuningPerLens';
import {
  heatmapCellMetric,
  runwayHeatmapCellFillAndDim,
  technologyFillMetricHeadline,
  technologyFillMetricLabel,
  technologyRunwayTitleForWorkloadScope,
} from '@/lib/runwayViewMetrics';
import { parseDate } from '@/engine/calendar';
import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import {
  HEATMAP_RUNWAY_PAD_FILL,
  transformedHeatmapMetric,
  type HeatmapColorOpts,
  type HeatmapSpectrumMode,
} from '@/lib/riskHeatmapColors';
import { HeatmapLegend } from '@/components/HeatmapLegend';
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
  RUNWAY_COMPARE_FIT_CELL_PX_MIN,
  bestCellPxForCompareAllRunwayFit,
  bestCellPxForSingleMarketFit,
  bestCellPxForSingleMarketTripleColumnFit,
  buildQuarterGridRunwayLayout,
  buildVerticalMonthsRunwayLayout,
  compareAllRunwayTotalContentWidthPx,
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
import {
  autoMarketRiskPressureOffsetMapForSurface,
  autoRestaurantPressureOffsetMapForSurface,
  lensHeatmapShapeOptsForAutoCalibrate,
} from '@/lib/autoRestaurantHeatmapOffset';
import { heatmapColorOptsWithMarketYaml } from '@/lib/heatmapColorOptsMarketYaml';
import { cn } from '@/lib/utils';
import { RunwayCellTooltip } from '@/components/RunwayCellTooltip';
import { RunwayActivityLedgerTable, type RunwayLedgerDayRowFilter } from '@/components/RunwayActivityLedgerTable';
import { RunwayDaySummaryPanel } from '@/components/RunwayDaySummaryPanel';
import { RunwaySummaryLineDiagrams } from '@/components/RunwaySummaryLineDiagrams';
import { useAtcStore } from '@/store/useAtcStore';
import { SlotOverlay } from '@/components/SlotOverlay';
import type { MarketConfig } from '@/engine/types';
import {
  buildMarketActivityLedgerFromConfig,
  filterLedgerToVisibleDateRange,
  type MarketActivityLedger,
} from '@/lib/marketActivityLedger';
import {
  activeLedgerEntryIds,
  buildLedgerLensOverlapMap,
  effectiveLedgerFootprintOverlap,
  LEDGER_EMPTY_DAY_OPACITY_FACTOR,
  ledgerAttributionNeutralFillHex,
} from '@/lib/runwayLedgerAttribution';
import {
  clearRunwayPngScrollportStamps,
  downloadRunwayHeatmapPng,
  stampRunwayScrollportsForPngExport,
} from '@/lib/runwayPngExport';
import { RunwayIsoSkyline } from '@/components/RunwayIsoSkyline';
import { RunwayIsoCityBlock } from '@/components/RunwayIsoCityBlock';
import { RunwayCompareSvgColumn } from '@/components/RunwayCompareSvgColumn';
import {
  compareColumnDateRangeYBounds,
  compareStripColumnWidthPx,
  compareStripMarketColumnLeftPx,
} from '@/lib/runwayCompareSvgLayout';
import { RunwayQuarterGridSvg } from '@/components/RunwayQuarterGridSvg';
import {
  Box,
  CalendarDays,
  Cpu,
  Download,
  Grid2x2,
  Loader2,
  ShieldAlert,
  UtensilsCrossed,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { MarketCircleFlag } from '@/components/MarketCircleFlag';

/** Default cell size (px) for runway heatmaps (single-market and LIOM compare). */
export const CELL_PX = 20;

const RUNWAY_CELL_PX_MIN = 12;
const RUNWAY_CELL_PX_MAX = 28;
const RUNWAY_CELL_PX_STEP = 2;

/**
 * Isometric 3D runway (single-market skyline + LIOM city block). Hidden: toolbar + branches are gated off
 * until we ship this path again — set to `true` to restore.
 */
const RUNWAY_ISO_3D_ENABLED = false;

function snapRunwayCellPx(n: number): number {
  const s = Math.round(n / RUNWAY_CELL_PX_STEP) * RUNWAY_CELL_PX_STEP;
  return Math.min(RUNWAY_CELL_PX_MAX, Math.max(RUNWAY_CELL_PX_MIN, s));
}

/** Pointer anchor for the day-details popover (click or keyboard). */
type RunwayTipAnchor = { clientX: number; clientY: number };

/** Optional lens for day-details when a cell belongs to a stacked multi-lens band. */
type RunwayCellOpenOpts = { detailViewMode?: ViewModeId };
type OpenDayDetailsFromCellFn = (
  anchor: RunwayTipAnchor,
  dateStr: string | null,
  weekdayCol: number,
  opts?: RunwayCellOpenOpts
) => void;

/** Single-market vertical runway: tech, trading, and deployment-risk lenses stacked per month. */
const SINGLE_MARKET_STACK_LENS_IDS: readonly ViewModeId[] = ['combined', 'in_store', 'market_risk'];
/** Main page title when all three lenses are stacked (matches heatmap lens names). */
const SINGLE_MARKET_MULTI_LENS_HEADLINE = 'Tech Capacity, Trading Pressure, Deployment Risk';
/** One legend for the whole stack; ramp matches the first (Technology) lens colour tuning. */
const SINGLE_MARKET_STACK_SHARED_LEGEND_LENS: ViewModeId =
  SINGLE_MARKET_STACK_LENS_IDS[0] ?? 'combined';

/** Short column heading above each stacked lens (matches heatmap titles: tech / trading / risk). */
function lensStackRailLabel(mode: ViewModeId) {
  switch (mode) {
    case 'combined':
      return 'Tech';
    case 'in_store':
      return 'Trading';
    case 'market_risk':
      return 'Risk';
    default:
      return mode;
  }
}

const LENS_STACK_HEADING_ICON = {
  combined: Cpu,
  in_store: UtensilsCrossed,
  market_risk: ShieldAlert,
} as const;

function lensStackHeadingIcon(mode: ViewModeId) {
  if (mode === 'combined' || mode === 'in_store' || mode === 'market_risk') {
    return LENS_STACK_HEADING_ICON[mode];
  }
  return Cpu;
}

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
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-transparent text-muted-foreground',
  'transition-[color,background-color] duration-150 ease-out',
  'hover:bg-muted hover:text-foreground',
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
          'flex w-fit max-w-[min(100%,6rem)] shrink-0 flex-col gap-3 self-center lg:pr-3 lg:pl-1 lg:self-start',
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

function fillMetricHeadlineForView(mode: ViewModeId): string {
  switch (mode) {
    case 'combined':
      return technologyFillMetricHeadline('all');
    case 'in_store':
      return 'Trading pressure';
    case 'market_risk':
      return 'Deployment Risk';
    default:
      return 'Pressure';
  }
}

function fillMetricLabelForView(mode: ViewModeId): string {
  switch (mode) {
    case 'combined':
      return technologyFillMetricLabel('all');
    case 'in_store':
      return 'Restaurant trading intensity from the store curve—rhythm, holidays, and store boosts when live (or prep if YAML says so)';
    case 'market_risk':
      return 'Deployment risk score (0–1): deployment and calendar fragility from holidays, Q4 month ramp, store intensity, campaigns, and optional deployment events in YAML.';
    default:
      return 'Metric';
  }
}

function fillMetricLeadCompactForView(mode: ViewModeId): string {
  switch (mode) {
    case 'combined':
      return 'Combined share of lab and Market IT capacity consumed (0–1); backend not in this headline.';
    case 'in_store':
      return 'Store trading intensity from the curve—rhythm, holidays, and store boosts (0–1).';
    case 'market_risk':
      return 'Deployment risk: deployment/calendar fragility in the model (0–1); hotter = more fragile, not a ban.';
    default:
      return fillMetricLabelForView(mode);
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

/** Default heatmap selection: today if modelled, else latest modelled day on/before today, else first modelled day in layout. */
function pickLayoutDayForDefaultSelection(
  layoutDatesSorted: string[],
  riskByDate: Map<string, RiskRow>,
  todayYmd: string
): string | null {
  const has = (d: string) => layoutDatesSorted.includes(d) && riskByDate.has(d);
  if (has(todayYmd)) return todayYmd;
  for (let i = layoutDatesSorted.length - 1; i >= 0; i--) {
    const d = layoutDatesSorted[i]!;
    if (d <= todayYmd && riskByDate.has(d)) return d;
  }
  for (const d of layoutDatesSorted) {
    if (riskByDate.has(d)) return d;
  }
  return null;
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
  /** Side summary / programmatic selection (e.g. default to today on load). */
  isSelected?: boolean;
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
  openDayDetailsFromCell: OpenDayDetailsFromCellFn;
  /** When set, day-details / summary use this lens (stacked single-market heatmap). */
  cellDetailViewMode?: ViewModeId;
  /** When set, ledger footprint: `0` → neutral tile; `>0` → real heatmap fill (overlap count badge still applies). */
  ledgerOverlap?: number;
};

function LedgerOverlapCountBadge({ count }: { count: number }) {
  return (
    <span
      className="pointer-events-none absolute bottom-[1px] right-[1px] z-[3] flex min-h-[11px] min-w-[11px] items-center justify-center rounded-sm bg-black/55 px-[2px] text-[7px] font-bold tabular-nums leading-none text-white ring-1 ring-white/25"
      aria-label={`${count} overlapping activities on this day`}
    >
      {count}
    </span>
  );
}

function heatCellTipHandlers(
  openDayDetailsFromCell: OpenDayDetailsFromCellFn,
  dateStr: string | null,
  weekdayCol: number,
  detailViewMode?: ViewModeId
) {
  const openOpts = detailViewMode ? { detailViewMode } : undefined;
  return {
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      openDayDetailsFromCell({ clientX: e.clientX, clientY: e.clientY }, dateStr, weekdayCol, openOpts);
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
        weekdayCol,
        openOpts
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
  isSelected = false,
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
  cellDetailViewMode,
  ledgerOverlap,
}: HeatCellProps) {
  const tw = heatmapTwinkleParams(discoMode, shimmerBase, weekdayCol);
  const pulseOn = (shimmer || discoMode) && (!enableColorSweep || postSweep);

  const handlers = heatCellTipHandlers(openDayDetailsFromCell, dateStr, weekdayCol, cellDetailViewMode);

  const effFill =
    typeof ledgerOverlap === 'number'
      ? ledgerOverlap === 0
        ? ledgerAttributionNeutralFillHex()
        : fill
      : fill;
  const overlapBadge = typeof ledgerOverlap === 'number' && ledgerOverlap > 1 ? ledgerOverlap : undefined;
  const ledgerEmptyNonOverlap = typeof ledgerOverlap === 'number' && ledgerOverlap === 0;
  const heatDimOpacity = dimOpacity * (ledgerEmptyNonOverlap ? LEDGER_EMPTY_DAY_OPACITY_FACTOR : 1);

  const boxClass = cn(
    'relative shrink-0 cursor-pointer rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    isToday && 'z-[1]',
    isSelected && 'z-[2] ring-2 ring-inset ring-primary'
  );

  if (!enableColorSweep && !shimmer && !discoMode) {
    return (
      <HeatCellDimWrap pastDimmed={pastDimmed}>
        <HeatCutoffOpacityWrap dimOpacity={heatDimOpacity}>
          <div
            role="button"
            tabIndex={0}
            title="Click for day details"
            aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
            aria-pressed={isSelected}
            className={boxClass}
            style={{ width: CELL_PX, height: CELL_PX, backgroundColor: effFill }}
            {...handlers}
          >
            {overlapBadge ? <LedgerOverlapCountBadge count={overlapBadge} /> : null}
            {isToday ? <TodayDot /> : null}
          </div>
        </HeatCutoffOpacityWrap>
      </HeatCellDimWrap>
    );
  }

  if (!enableColorSweep && (shimmer || discoMode)) {
    return (
      <HeatCellDimWrap pastDimmed={pastDimmed}>
        <HeatCutoffOpacityWrap dimOpacity={heatDimOpacity}>
          <motion.div
            role="button"
            tabIndex={0}
            title="Click for day details"
            aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
            aria-pressed={isSelected}
            className={cn(boxClass, 'will-change-[opacity,filter]')}
            style={{ width: CELL_PX, height: CELL_PX, backgroundColor: effFill }}
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
            {overlapBadge ? <LedgerOverlapCountBadge count={overlapBadge} /> : null}
            {isToday ? <TodayDot /> : null}
          </motion.div>
        </HeatCutoffOpacityWrap>
      </HeatCellDimWrap>
    );
  }

  return (
    <HeatCellDimWrap pastDimmed={pastDimmed}>
    <HeatCutoffOpacityWrap dimOpacity={heatDimOpacity}>
    <div className="relative shrink-0" style={{ width: CELL_PX, height: CELL_PX }}>
      <div className="pointer-events-none absolute inset-0 rounded-[3px] bg-muted" aria-hidden />
      <motion.div
        key={colorLayerKey}
        className={cn(
          'absolute inset-0 cursor-pointer rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          isToday && 'z-[1]',
          isSelected && 'z-[2] ring-2 ring-inset ring-primary',
          'will-change-[opacity,filter]'
        )}
        role="button"
        tabIndex={0}
        title="Click for day details"
        aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
        aria-pressed={isSelected}
        style={{ backgroundColor: effFill }}
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
        {overlapBadge ? <LedgerOverlapCountBadge count={overlapBadge} /> : null}
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
  isSelected = false,
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
  cellDetailViewMode,
  ledgerOverlap,
}: HeatCellSizedProps) {
  const tw = heatmapTwinkleParams(discoMode, shimmerBase, weekdayCol);
  const pulseOn = (shimmer || discoMode) && (!enableColorSweep || postSweep);

  const handlers = heatCellTipHandlers(openDayDetailsFromCell, dateStr, weekdayCol, cellDetailViewMode);

  const effFill =
    typeof ledgerOverlap === 'number'
      ? ledgerOverlap === 0
        ? ledgerAttributionNeutralFillHex()
        : fill
      : fill;
  const overlapBadge = typeof ledgerOverlap === 'number' && ledgerOverlap > 1 ? ledgerOverlap : undefined;
  const ledgerEmptyNonOverlap = typeof ledgerOverlap === 'number' && ledgerOverlap === 0;
  const heatDimOpacity = dimOpacity * (ledgerEmptyNonOverlap ? LEDGER_EMPTY_DAY_OPACITY_FACTOR : 1);

  const boxClass = cn(
    'relative shrink-0 cursor-pointer rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    isToday && 'z-[1]',
    isSelected && 'z-[2] ring-2 ring-inset ring-primary'
  );

  if (!enableColorSweep && !shimmer && !discoMode) {
    return (
      <HeatCellDimWrap pastDimmed={pastDimmed}>
        <HeatCutoffOpacityWrap dimOpacity={heatDimOpacity}>
          <div
            role="button"
            tabIndex={0}
            title="Click for day details"
            aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
            aria-pressed={isSelected}
            className={boxClass}
            style={{ width: cellPx, height: cellPx, backgroundColor: effFill }}
            {...handlers}
          >
            {overlapBadge ? <LedgerOverlapCountBadge count={overlapBadge} /> : null}
            {isToday ? <TodayDot /> : null}
          </div>
        </HeatCutoffOpacityWrap>
      </HeatCellDimWrap>
    );
  }

  if (!enableColorSweep && (shimmer || discoMode)) {
    return (
      <HeatCellDimWrap pastDimmed={pastDimmed}>
        <HeatCutoffOpacityWrap dimOpacity={heatDimOpacity}>
          <motion.div
            role="button"
            tabIndex={0}
            title="Click for day details"
            aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
            aria-pressed={isSelected}
            className={cn(boxClass, 'will-change-[opacity,filter]')}
            style={{ width: cellPx, height: cellPx, backgroundColor: effFill }}
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
            {overlapBadge ? <LedgerOverlapCountBadge count={overlapBadge} /> : null}
            {isToday ? <TodayDot /> : null}
          </motion.div>
        </HeatCutoffOpacityWrap>
      </HeatCellDimWrap>
    );
  }

  return (
    <HeatCellDimWrap pastDimmed={pastDimmed}>
    <HeatCutoffOpacityWrap dimOpacity={heatDimOpacity}>
    <div className="relative shrink-0" style={{ width: cellPx, height: cellPx }}>
      <div className="pointer-events-none absolute inset-0 rounded-[2px] bg-muted" aria-hidden />
      <motion.div
        key={colorLayerKey}
        className={cn(
          'absolute inset-0 cursor-pointer rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          isToday && 'z-[1]',
          isSelected && 'z-[2] ring-2 ring-inset ring-primary',
          'will-change-[opacity,filter]'
        )}
        role="button"
        tabIndex={0}
        title="Click for day details"
        aria-label={dateStr ? `Day details for ${dateStr}` : 'Day cell'}
        aria-pressed={isSelected}
        style={{ backgroundColor: effFill }}
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
        {overlapBadge ? <LedgerOverlapCountBadge count={overlapBadge} /> : null}
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
  todayYmd: string;
  dimPastDays: boolean;
  shimmer: boolean;
  discoMode: boolean;
  enableColorSweep: boolean;
  postSweep: boolean;
  /** Extra delay (seconds) so multi-market columns swoosh in sequence left→right. */
  sweepMarketOffsetSec: number;
  openDayDetailsFromCell: OpenDayDetailsFromCellFn;
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
  /** Single-market: highlight cell for side-summary selection (e.g. default today). */
  selectedDayYmd?: string | null;
  /** Isometric 3D: restarts column grow-in from zero-height baseline when this key changes. */
  isoGrowResetKey?: string;
  /** Activity ledger selection → heatmap attribution for this lens column. */
  ledgerAttribution?: { overlapByDay: Map<string, number>; lens: Exclude<ViewModeId, 'code'> } | null;
  /**
   * When true, N=0 ledger overlap maps to one implicit baseline stratum for footprint coloring (see
   * {@link effectiveLedgerFootprintOverlap}).
   */
  ledgerImplicitBaselineFootprint?: boolean;
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
  todayYmd,
  shimmer,
  discoMode,
  enableColorSweep,
  postSweep,
  sweepMarketOffsetSec,
  openDayDetailsFromCell,
  dimPastDays,
  selectedDayYmd = null,
  showMonthLabel = true,
  showWeekdayRow = true,
  monthLabelPlacement = 'above',
  cellDetailViewMode,
  ledgerAttribution = null,
  ledgerImplicitBaselineFootprint = true,
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
  todayYmd: string;
  shimmer: boolean;
  discoMode: boolean;
  enableColorSweep: boolean;
  postSweep: boolean;
  sweepMarketOffsetSec: number;
  openDayDetailsFromCell: OpenDayDetailsFromCellFn;
  /** When true, calendar days strictly before today render at 25% opacity. */
  dimPastDays: boolean;
  /** Highlights the day matching side-summary selection (e.g. default “today”). */
  selectedDayYmd?: string | null;
  showMonthLabel?: boolean;
  showWeekdayRow?: boolean;
  monthLabelPlacement?: 'above' | 'side';
  /** When set, click opens day details for this lens (stacked heatmap). */
  cellDetailViewMode?: ViewModeId;
  /** Ledger row selection → per-day overlap counts for this lens (attribution mode). */
  ledgerAttribution?: { overlapByDay: Map<string, number>; lens: Exclude<ViewModeId, 'code'> } | null;
  ledgerImplicitBaselineFootprint?: boolean;
}) {
  const colorLayerKey = viewMode === 'combined' ? 'c-combined-tech' : viewMode;
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
              ? heatmapCellMetric(row, viewMode, riskTuning)
              : undefined;
            const { fill, dimOpacity } = !dateStr
              ? { fill: HEATMAP_RUNWAY_PAD_FILL, dimOpacity: 1 }
              : runwayHeatmapCellFillAndDim(viewMode, metric, heatmapOpts, row);
            const pastDimmed = dimPastDays && typeof dateStr === 'string' && dateStr < todayYmd;
            const isSelected = typeof dateStr === 'string' && dateStr === selectedDayYmd;
            const shimmerBase = ((secYear % 100) * 500 + mo.monthIndex * 40 + wi * 7 + di) % 900;
            const sweepDelaySec = sweepDelayForCell(sweepMarketOffsetSec, si, sweepMi, wi, di);
            const ledgerOverlap =
              ledgerAttribution && dateStr
                ? effectiveLedgerFootprintOverlap(
                    ledgerAttribution.overlapByDay.get(dateStr) ?? 0,
                    ledgerImplicitBaselineFootprint,
                  )
                : undefined;
            return cellPx === CELL_PX ? (
              <HeatCell
                key={`${mo.key}-${wi}-${di}`}
                fill={fill}
                dateStr={dateStr}
                isToday={typeof dateStr === 'string' && dateStr === todayYmd}
                isSelected={isSelected}
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
                cellDetailViewMode={cellDetailViewMode}
                ledgerOverlap={ledgerAttribution ? ledgerOverlap : undefined}
              />
            ) : (
              <HeatCellSized
                key={`${mo.key}-${wi}-${di}`}
                cellPx={cellPx}
                fill={fill}
                dateStr={dateStr}
                isToday={typeof dateStr === 'string' && dateStr === todayYmd}
                isSelected={isSelected}
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
                cellDetailViewMode={cellDetailViewMode}
                ledgerOverlap={ledgerAttribution ? ledgerOverlap : undefined}
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
  selectedDayYmd = null,
  isoGrowResetKey = 'iso',
  ledgerAttribution = null,
  ledgerImplicitBaselineFootprint = true,
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
          growResetKey={isoGrowResetKey}
          weeks={skylineWeeks}
          sections={sections}
          cellPx={cellPx}
          gap={0}
          rowTowerPx={rowTowerPx}
          riskByDate={riskByDate}
          heatmapOpts={heatmapOpts}
          riskTuning={riskTuning}
          viewMode={viewMode}
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
                        todayYmd={todayYmd}
                        shimmer={shimmer}
                        discoMode={discoMode}
                        enableColorSweep={enableColorSweep}
                        postSweep={postSweep}
                        sweepMarketOffsetSec={sweepMarketOffsetSec}
                        openDayDetailsFromCell={openDayDetailsFromCell}
                        dimPastDays={dimPastDays}
                        selectedDayYmd={selectedDayYmd}
                        ledgerAttribution={ledgerAttribution}
                        ledgerImplicitBaselineFootprint={ledgerImplicitBaselineFootprint}
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
                          todayYmd={todayYmd}
                          shimmer={shimmer}
                          discoMode={discoMode}
                          enableColorSweep={enableColorSweep}
                          postSweep={postSweep}
                          sweepMarketOffsetSec={sweepMarketOffsetSec}
                          openDayDetailsFromCell={openDayDetailsFromCell}
                          dimPastDays={dimPastDays}
                          selectedDayYmd={selectedDayYmd}
                          showWeekdayRow={showWeekdayRowForMonth(mo)}
                          monthLabelPlacement={compareStripLabels ? 'side' : 'above'}
                          ledgerAttribution={ledgerAttribution}
                          ledgerImplicitBaselineFootprint={ledgerImplicitBaselineFootprint}
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
  /** Compare strip: market header stickers do not navigate into a single market (e.g. landing demo). */
  disableCompareColumnNavigation?: boolean;
  /** Hide range/focus picks and heatmap toolbar; keep title + grid (e.g. landing demo). */
  landingMinimalChrome?: boolean;
  /** Cap auto-fitted compare-strip cell size (px) — keeps landing / embeds from growing too tall. */
  landingCompareMaxCellPx?: number;
  /** Compare strip: fixed column order (only with {@link landingMinimalChrome} + LIOM). */
  landingCompareMarketOrder?: readonly string[];
  /** Compare strip: clip overflow instead of scrollbars (fit sizing should keep content inside). */
  landingCompareNoScroll?: boolean;
  /** Compare strip: no cell click / tooltip (e.g. landing preview). */
  landingCompareDisableCellDetails?: boolean;
  /** Compare strip: smooth scroll pan once after layout (e.g. landing “find slack” motion). */
  landingCompareSmoothPan?: boolean;
  /** Compare strip: soft pulse on day cells in an inclusive date range for one market (e.g. landing AU). */
  landingCompareColumnHighlight?: { market: string; ymdStart: string; ymdEnd: string };
};

export function RunwayGrid({
  riskSurface,
  viewMode,
  onSlotSelection,
  disableCompareColumnNavigation = false,
  landingMinimalChrome = false,
  landingCompareMaxCellPx,
  landingCompareMarketOrder,
  landingCompareNoScroll = false,
  landingCompareDisableCellDetails = false,
  landingCompareSmoothPan = false,
  landingCompareColumnHighlight,
}: RunwayGridProps) {
  const country = useAtcStore((s) => s.country);
  const setCountry = useAtcStore((s) => s.setCountry);
  const selectCompareMarket = useCallback(
    (marketId: string) => {
      onSlotSelection(null);
      setCountry(marketId, { returnPickerForBack: country });
    },
    [onSlotSelection, setCountry, country]
  );
  const noopCompareDayOpen = useCallback(
    (_a: RunwayTipAnchor, _d: string | null, _w: number, _o?: RunwayCellOpenOpts) => {},
    []
  );
  const configs = useAtcStore((s) => s.configs);
  const compareAllMarkets = isRunwayMultiMarketStrip(country);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const riskHeatmapTuningByLens = useAtcStore((s) => s.riskHeatmapTuningByLens);
  const heatmapRenderStyle = useAtcStore((s) => s.heatmapRenderStyle);
  const heatmapMonoColor = useAtcStore((s) => s.heatmapMonoColor);
  const heatmapSpectrumContinuous = useAtcStore((s) => s.heatmapSpectrumContinuous);
  const reduceMotion = useReducedMotion();
  const shimmer = !reduceMotion;
  const theme = useAtcStore((s) => s.theme);
  const discoModePref = useAtcStore((s) => s.discoMode);
  const discoMode = discoModePref && !reduceMotion && theme === 'dark';
  const runway3dHeatmap = useAtcStore((s) => s.runway3dHeatmap);
  const setRunway3dHeatmap = useAtcStore((s) => s.setRunway3dHeatmap);
  const storeIso3dOn = RUNWAY_ISO_3D_ENABLED && runway3dHeatmap;
  /** Single-market isometric column only (not LIOM compare). */
  const showIso3dSingleMarket = !compareAllMarkets && storeIso3dOn;
  /** Single-market flat: vertical months + Technology / Restaurant / Risk stacked (no quarter wall calendar). */
  const singleMarketMultiLens = !compareAllMarkets && !showIso3dSingleMarket;
  const runwayTitleWithMarket = singleMarketMultiLens
    ? `${runwayFocusStripLabel(country)}: ${SINGLE_MARKET_MULTI_LENS_HEADLINE}`
    : `${
        viewMode === 'combined'
          ? technologyRunwayTitleForWorkloadScope('all')
          : runwayHeatmapTitleForViewMode(viewMode)
      }: ${runwayFocusStripLabel(country)}`;
  /** LIOM city block: honour 3D toggle in workbench, but never on landing/embed minimal chrome. */
  const showCompareIsoCityBlock =
    compareAllMarkets && storeIso3dOn && !landingMinimalChrome;
  const runwaySvgHeatmapPref = useAtcStore((s) => s.runwaySvgHeatmap);
  const setRunwaySvgHeatmap = useAtcStore((s) => s.setRunwaySvgHeatmap);
  /** SVG columns when pref is on (compare strip, single-market quarter grid, and triple-lens stack). */
  const useSvgHeatmap =
    runwaySvgHeatmapPref && (compareAllMarkets || !showIso3dSingleMarket);
  const runwayFilterYear = useAtcStore((s) => s.runwayFilterYear);
  const runwayFilterQuarter = useAtcStore((s) => s.runwayFilterQuarter);
  const runwayIncludeFollowingQuarter = useAtcStore((s) => s.runwayIncludeFollowingQuarter);
  const runwaySelectedDayYmd = useAtcStore((s) => s.runwaySelectedDayYmd);
  const setRunwaySelectedDayYmd = useAtcStore((s) => s.setRunwaySelectedDayYmd);

  const [displayedCountry, setDisplayedCountry] = useState(country);
  const [countrySwitchLoading, setCountrySwitchLoading] = useState(false);

  const scrollTopRef = useRef(0);
  const [tip, setTip] = useState<RunwayTipState | null>(null);
  const tipRef = useRef<RunwayTipState | null>(null);
  tipRef.current = tip;
  /** Prevents re-applying default “today” selection when layout deps are unchanged (e.g. after Strict Mode double mount). */
  const heatmapAutoDayAppliedKeyRef = useRef<string>('');
  const heatmapInteractionRef = useRef<HTMLDivElement>(null);
  const tooltipRootRef = useRef<HTMLDivElement>(null);
  const summaryPanelRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const heatmapCaptureRef = useRef<HTMLDivElement>(null);
  /** LIOM compare: horizontal scrollport — measured to pick a cell size that fits the main heatmap column. */
  const compareScrollRef = useRef<HTMLDivElement>(null);
  const landingComparePanPlayedRef = useRef(false);
  /** Single-market: measured to auto-fit cell size to available space. */
  const singleMarketFitRef = useRef<HTMLDivElement>(null);
  const [pngExporting, setPngExporting] = useState(false);
  const [dimPastDays, setDimPastDays] = useState(false);

  const [runwayCellPx, setRunwayCellPx] = useState(CELL_PX);

  const cellPx = runwayCellPx;

  const runway3dRowTowerPx = useMemo(
    () => (showIso3dSingleMarket ? Math.round(cellPx * 1.38) : 0),
    [showIso3dSingleMarket, cellPx]
  );

  const useSideSummary = !compareAllMarkets && !showIso3dSingleMarket;

  const marketsOrdered = useMemo(() => {
    const fromCfg = configs.map((c) => c.market);
    const base = fromCfg.length ? fromCfg : [...new Set(riskSurface.map((r) => r.market))].sort();
    if (!isRunwayMultiMarketStrip(country)) return base;
    const present = new Set(base);
    if (
      landingMinimalChrome &&
      landingCompareMarketOrder &&
      landingCompareMarketOrder.length > 0
    ) {
      return landingCompareMarketOrder.filter((id) => present.has(id));
    }
    return runwayCompareMarketIds(country, base).filter((id) => present.has(id));
  }, [configs, riskSurface, country, landingMinimalChrome, landingCompareMarketOrder]);

  const isoGrowResetKey = useMemo(
    () =>
      `${country}\u0001${viewMode}\u0001${riskSurface.length}\u0001${
        compareAllMarkets ? marketsOrdered.join(',') : 'single'
      }`,
    [country, viewMode, riskSurface.length, compareAllMarkets, marketsOrdered]
  );

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

  const layoutDateRangeBounds = useMemo(() => {
    if (!layoutDatesSorted.length) return null;
    return { start: layoutDatesSorted[0]!, end: layoutDatesSorted[layoutDatesSorted.length - 1]! };
  }, [layoutDatesSorted]);

  const activityLedger = useMemo(() => {
    if (!marketConfig) return null;
    const full = buildMarketActivityLedgerFromConfig(marketConfig);
    if (!layoutDateRangeBounds) return full;
    return filterLedgerToVisibleDateRange(full, layoutDateRangeBounds.start, layoutDateRangeBounds.end);
  }, [marketConfig, layoutDateRangeBounds]);

  const pruneRunwayLedgerExclusionsToAllowedEntryIds = useAtcStore(
    (s) => s.pruneRunwayLedgerExclusionsToAllowedEntryIds,
  );
  useEffect(() => {
    if (!activityLedger) return;
    pruneRunwayLedgerExclusionsToAllowedEntryIds(new Set(activityLedger.entries.map((e) => e.entryId)));
  }, [activityLedger, pruneRunwayLedgerExclusionsToAllowedEntryIds]);

  const restrictRunwayLedgerToDayContributors = useAtcStore((s) => s.restrictRunwayLedgerToDayContributors);
  useEffect(() => {
    if (compareAllMarkets) return;
    if (!activityLedger) return;
    if (!tip || !('payload' in tip)) return;
    if (tip.payload.market !== country) return;
    const vm = tip.payload.viewMode;
    if (vm === 'code') return;
    restrictRunwayLedgerToDayContributors(activityLedger, tip.payload.dateStr, vm);
  }, [tip, activityLedger, country, compareAllMarkets, restrictRunwayLedgerToDayContributors]);

  const focusMarketRiskByDate = useMemo(() => {
    if (isRunwayMultiMarketStrip(country)) return null;
    return riskByDateForMarket(riskSurface, country);
  }, [riskSurface, country]);

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
    if (showCompareIsoCityBlock) return;
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
      let next = bestCellPxForCompareAllRunwayFit(
        w,
        h,
        marketsOrdered.length,
        layoutDatesSorted
      );
      if (landingCompareMaxCellPx != null) {
        next = snapRunwayCellPx(Math.min(next, landingCompareMaxCellPx));
      }
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
    showCompareIsoCityBlock,
    landingCompareMaxCellPx,
  ]);

  useLayoutEffect(() => {
    if (compareAllMarkets || countrySwitchLoading) return;
    if (showIso3dSingleMarket) return;
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
      const next = singleMarketMultiLens
        ? bestCellPxForSingleMarketTripleColumnFit(w, h, layoutDatesSorted)
        : bestCellPxForSingleMarketFit(w, h, layoutDatesSorted);
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
  }, [compareAllMarkets, compareDatesFitKey, countrySwitchLoading, showIso3dSingleMarket, singleMarketMultiLens]);

  const dismissTip = useCallback(() => {
    setTip(null);
    if (!compareAllMarkets) setRunwaySelectedDayYmd(null);
  }, [compareAllMarkets, setRunwaySelectedDayYmd]);

  const calendarLayout = useMemo(() => {
    if (compareAllMarkets) return buildVerticalMonthsRunwayLayout(layoutDatesSorted, cellPx);
    if (showIso3dSingleMarket) {
      return buildVerticalMonthsRunwayLayout(layoutDatesSorted, cellPx, {
        rowTowerPx: runway3dRowTowerPx,
      });
    }
    if (singleMarketMultiLens) {
      const base = buildVerticalMonthsRunwayLayout(layoutDatesSorted, cellPx);
      if (!base) return null;
      return {
        ...base,
        contentWidth: compareAllRunwayTotalContentWidthPx(cellPx, SINGLE_MARKET_STACK_LENS_IDS.length),
      };
    }
    return buildQuarterGridRunwayLayout(layoutDatesSorted, cellPx);
  }, [
    layoutDatesSorted,
    cellPx,
    compareAllMarkets,
    showIso3dSingleMarket,
    runway3dRowTowerPx,
    singleMarketMultiLens,
  ]);

  const compareStripFirstCalendarMonthKey = useMemo(
    () =>
      (compareAllMarkets || singleMarketMultiLens) && calendarLayout
        ? firstCalendarMonthKeyFromSections(calendarLayout.sections)
        : null,
    [compareAllMarkets, singleMarketMultiLens, calendarLayout]
  );

  const heatmapOptsBase: HeatmapColorOpts = useMemo(() => {
    const heatmapSpectrumMode: HeatmapSpectrumMode = heatmapSpectrumContinuous
      ? 'continuous'
      : 'discrete';
    const t = riskHeatmapTuningByLens[heatmapTuningLensForViewMode(viewMode)];
    return {
      riskHeatmapCurve: t.curve,
      riskHeatmapGamma: t.gamma,
      riskHeatmapTailPower: t.tailPower,
      businessHeatmapPressureOffset: t.pressureOffset,
      renderStyle: heatmapRenderStyle,
      monoColor: heatmapMonoColor,
      heatmapSpectrumMode,
    };
  }, [
    viewMode,
    riskHeatmapTuningByLens,
    heatmapRenderStyle,
    heatmapMonoColor,
    heatmapSpectrumContinuous,
  ]);

  const inStoreShapeOptsForAuto = useMemo(
    () =>
      lensHeatmapShapeOptsForAutoCalibrate({
        lensTuning: riskHeatmapTuningByLens.in_store,
        heatmapRenderStyle,
        heatmapMonoColor,
        heatmapSpectrumContinuous,
      }),
    [riskHeatmapTuningByLens.in_store, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous]
  );

  const marketRiskShapeOptsForAuto = useMemo(
    () =>
      lensHeatmapShapeOptsForAutoCalibrate({
        lensTuning: riskHeatmapTuningByLens.market_risk,
        heatmapRenderStyle,
        heatmapMonoColor,
        heatmapSpectrumContinuous,
      }),
    [riskHeatmapTuningByLens.market_risk, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous]
  );

  const autoRestaurantPressureByMarket = useMemo(
    () =>
      autoRestaurantPressureOffsetMapForSurface({
        riskSurface,
        configs,
        inStoreShapeOpts: inStoreShapeOptsForAuto,
        globalInStorePressureOffset: riskHeatmapTuningByLens.in_store.pressureOffset,
      }),
    [riskSurface, configs, inStoreShapeOptsForAuto, riskHeatmapTuningByLens.in_store.pressureOffset]
  );

  const autoMarketRiskPressureByMarket = useMemo(
    () =>
      autoMarketRiskPressureOffsetMapForSurface({
        riskSurface,
        configs,
        marketRiskShapeOpts: marketRiskShapeOptsForAuto,
        globalMarketRiskPressureOffset: riskHeatmapTuningByLens.market_risk.pressureOffset,
      }),
    [
      riskSurface,
      configs,
      marketRiskShapeOptsForAuto,
      riskHeatmapTuningByLens.market_risk.pressureOffset,
    ]
  );

  const heatmapOptsForMarket = useCallback(
    (marketId: string) =>
      heatmapColorOptsWithMarketYaml(
        viewMode,
        heatmapOptsBase,
        configs.find((c) => c.market === marketId),
        viewMode === 'in_store' ? (autoRestaurantPressureByMarket.get(marketId) ?? 0) : 0,
        viewMode === 'market_risk' ? (autoMarketRiskPressureByMarket.get(marketId) ?? 0) : 0
      ),
    [
      viewMode,
      heatmapOptsBase,
      configs,
      autoRestaurantPressureByMarket,
      autoMarketRiskPressureByMarket,
    ]
  );

  const heatmapOptsForViewMode = useMemo(() => {
    const spectrumMode: HeatmapSpectrumMode = heatmapSpectrumContinuous ? 'continuous' : 'discrete';
    return (mode: ViewModeId) => {
      if (mode === 'code') {
        return heatmapOptsBase;
      }
      const t = riskHeatmapTuningByLens[heatmapTuningLensForViewMode(mode)];
      return {
        riskHeatmapCurve: t.curve,
        riskHeatmapGamma: t.gamma,
        riskHeatmapTailPower: t.tailPower,
        businessHeatmapPressureOffset: t.pressureOffset,
        renderStyle: heatmapRenderStyle,
        monoColor: heatmapMonoColor,
        heatmapSpectrumMode: spectrumMode,
      };
    };
  }, [riskHeatmapTuningByLens, heatmapRenderStyle, heatmapMonoColor, heatmapSpectrumContinuous, heatmapOptsBase]);

  const heatmapOptsForMarketLens = useCallback(
    (marketId: string, mode: ViewModeId) =>
      heatmapColorOptsWithMarketYaml(
        mode,
        heatmapOptsForViewMode(mode),
        configs.find((c) => c.market === marketId),
        mode === 'in_store' ? (autoRestaurantPressureByMarket.get(marketId) ?? 0) : 0,
        mode === 'market_risk' ? (autoMarketRiskPressureByMarket.get(marketId) ?? 0) : 0
      ),
    [
      heatmapOptsForViewMode,
      configs,
      autoRestaurantPressureByMarket,
      autoMarketRiskPressureByMarket,
    ]
  );

  const buildPayloadTipState = useCallback(
    (
      market: string,
      dateStr: string,
      anchor: RunwayTipAnchor,
      payloadViewMode: ViewModeId = viewMode
    ): RunwayTipState | null => {
      if (payloadViewMode === 'code') return null;
      const riskByDate = riskByDateForMarket(riskSurface, market);
      const row = riskByDate.get(dateStr);
      if (!row) return null;
      const config = configs.find((c) => c.market === market);
      const wd = weekdayShortFromYmd(dateStr);
      const fillMetricValue = heatmapCellMetric(row, payloadViewMode, riskTuning);
      const optsM = heatmapOptsForMarketLens(market, payloadViewMode);
      const fillMetricDisplayValue =
        payloadViewMode === 'in_store' || payloadViewMode === 'market_risk'
          ? transformedHeatmapMetric(payloadViewMode, fillMetricValue, optsM)
          : fillMetricValue;
      const { fill: cellFillHex } = runwayHeatmapCellFillAndDim(
        payloadViewMode,
        fillMetricValue,
        optsM,
        row
      );
      const payload = buildRunwayTooltipPayload({
        dateStr,
        weekdayShort: wd,
        market,
        viewMode: payloadViewMode,
        row,
        config,
        tuning: riskTuning,
        fillMetricHeadline: fillMetricHeadlineForView(payloadViewMode),
        fillMetricLabel: fillMetricLabelForView(payloadViewMode),
        fillMetricLeadCompact: fillMetricLeadCompactForView(payloadViewMode),
        fillMetricValue,
        fillMetricDisplayValue,
        cellFillHex,
      });
      return { x: anchor.clientX, y: anchor.clientY, payload };
    },
    [riskSurface, configs, viewMode, riskTuning, heatmapOptsForMarketLens]
  );

  const makeShowTip = useCallback(
    (market: string, riskByDate: Map<string, RiskRow>, _config: MarketConfig | undefined) =>
      (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number, opts?: RunwayCellOpenOpts) => {
        const wd = dateStr ? weekdayShortFromYmd(dateStr) : WEEKDAY_HEADERS[weekdayCol];
        const prev = tipRef.current;
        const { clientX, clientY } = anchor;
        const payloadMode = opts?.detailViewMode ?? viewMode;

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
        if (
          prev &&
          'payload' in prev &&
          prev.payload.dateStr === dateStr &&
          prev.payload.market === market &&
          prev.payload.viewMode === payloadMode
        ) {
          setTip(null);
          return;
        }
        const next = buildPayloadTipState(market, dateStr, anchor, payloadMode);
        if (next) setTip(next);
      },
    [buildPayloadTipState, viewMode]
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

  useEffect(() => {
    if (compareAllMarkets) return;
    const t = tip;
    if (t && 'payload' in t && t.payload.market === country) {
      setRunwaySelectedDayYmd(t.payload.dateStr);
    }
  }, [tip, country, compareAllMarkets, setRunwaySelectedDayYmd]);

  const todayYmd = formatDateYmd(new Date());

  useEffect(() => {
    if (landingMinimalChrome) return;
    if (!useSideSummary) return;
    if (viewMode === 'code') return;
    if (countrySwitchLoading) return;
    if (!focusMarketRiskByDate || focusMarketRiskByDate.size === 0) return;
    if (!layoutDatesSorted.length) return;

    const key = [
      country,
      viewMode,
      String(runwayFilterYear ?? ''),
      String(runwayFilterQuarter ?? ''),
      String(runwayIncludeFollowingQuarter),
      layoutDatesSorted[0] ?? '',
      layoutDatesSorted[layoutDatesSorted.length - 1] ?? '',
      String(riskSurface.length),
    ].join('|');

    if (heatmapAutoDayAppliedKeyRef.current === key) return;

    const todayStr = formatDateYmd(new Date());
    const persisted =
      runwaySelectedDayYmd &&
      layoutDatesSorted.includes(runwaySelectedDayYmd) &&
      focusMarketRiskByDate.has(runwaySelectedDayYmd)
        ? runwaySelectedDayYmd
        : null;
    const pick =
      persisted ?? pickLayoutDayForDefaultSelection(layoutDatesSorted, focusMarketRiskByDate, todayStr);
    if (!pick) return;

    heatmapAutoDayAppliedKeyRef.current = key;
    const next = buildPayloadTipState(country, pick, { clientX: 0, clientY: 0 });
    if (next) setTip(next);
  }, [
    landingMinimalChrome,
    useSideSummary,
    viewMode,
    countrySwitchLoading,
    focusMarketRiskByDate,
    layoutDatesSorted,
    runwayFilterYear,
    runwayFilterQuarter,
    runwayIncludeFollowingQuarter,
    riskSurface.length,
    country,
    runwaySelectedDayYmd,
    buildPayloadTipState,
  ]);

  const gap = RUNWAY_CELL_GAP_PX;
  const monthStripW = runwayDayStripWidth(cellPx, gap, RUNWAY_DAY_COLUMNS);

  /** Sticker row (`h-[32px]`) + `mb-1.5` before the compare SVG. */
  const RUNWAY_COMPARE_STICKER_STACK_PX = 32 + 6;

  useEffect(() => {
    if (!landingCompareSmoothPan || landingCompareNoScroll || reduceMotion) return;
    if (!compareAllMarkets || showCompareIsoCityBlock) return;
    if (!calendarLayout) return;
    if (landingComparePanPlayedRef.current) return;

    const el = compareScrollRef.current;
    if (!el) return;

    let raf = 0;
    let panScheduleTimer: number | null = null;
    let compareStripInView = false;
    let ioPanScheduled = false;
    let resizeKickOnce = false;
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const scheduleTryPan = (delayMs: number) => {
      if (landingComparePanPlayedRef.current) return;
      if (panScheduleTimer != null) window.clearTimeout(panScheduleTimer);
      panScheduleTimer = window.setTimeout(() => {
        panScheduleTimer = null;
        requestAnimationFrame(() => requestAnimationFrame(tryPan));
      }, delayMs);
    };

    const tryPan = () => {
      if (landingComparePanPlayedRef.current) return;
      if (el.scrollHeight < 24) return;
      const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
      const maxX = Math.max(0, el.scrollWidth - el.clientWidth);
      if (maxY < 4 && maxX < 4) {
        landingComparePanPlayedRef.current = true;
        return;
      }

      landingComparePanPlayedRef.current = true;
      el.scrollTop = 0;
      el.scrollLeft = 0;

      let targetY = maxY * 0.4;
      let targetX = maxX * 0.2;

      const hl = landingCompareColumnHighlight;
      if (hl) {
        const idx = marketsOrdered.indexOf(hl.market);
        const yb = compareColumnDateRangeYBounds(
          calendarLayout.sections,
          cellPx,
          gap,
          monthStripW,
          compareStripFirstCalendarMonthKey,
          hl.ymdStart,
          hl.ymdEnd
        );
        if (idx >= 0) {
          const colLeft = compareStripMarketColumnLeftPx({
            marketIndex: idx,
            monthStripW,
            gutterInnerWidthPx: CALENDAR_QUARTER_GUTTER_W,
            columnGapPx: CALENDAR_QUARTER_GRID_COL_GAP_PX,
            rowPadLeftPx: 2,
          });
          const colW = compareStripColumnWidthPx(monthStripW);
          const colMid = colLeft + colW / 2;
          targetX = Math.min(maxX, Math.max(0, colMid - el.clientWidth / 2));
        }
        if (yb) {
          const bandMid = RUNWAY_COMPARE_STICKER_STACK_PX + (yb.minY + yb.maxY) / 2;
          targetY = Math.min(maxY, Math.max(0, bandMid - el.clientHeight / 2));
        }
      }

      const clampX = (x: number) => Math.min(maxX, Math.max(0, x));
      const clampY = (y: number) => Math.min(maxY, Math.max(0, y));

      /** Piecewise path: horizontal zig-zag while y=0, then hold AU column x while scrolling y to the pulse band. */
      type PanSeg = { u0: number; u1: number; x0: number; x1: number; y0: number; y1: number };
      const xSweep = maxX * 0.88;
      const xBack = maxX * 0.08;
      const xMid = maxX * 0.5;
      const segments: PanSeg[] =
        maxX > 8
          ? [
              { u0: 0, u1: 0.22, x0: 0, x1: xSweep, y0: 0, y1: 0 },
              { u0: 0.22, u1: 0.38, x0: xSweep, x1: xBack, y0: 0, y1: 0 },
              { u0: 0.38, u1: 0.54, x0: xBack, x1: xMid, y0: 0, y1: 0 },
              { u0: 0.54, u1: 0.68, x0: xMid, x1: xSweep, y0: 0, y1: 0 },
              { u0: 0.68, u1: 0.8, x0: xSweep, x1: targetX, y0: 0, y1: 0 },
              { u0: 0.8, u1: 1, x0: targetX, x1: targetX, y0: 0, y1: targetY },
            ]
          : [
              { u0: 0, u1: 0.35, x0: 0, x1: targetX, y0: 0, y1: 0 },
              { u0: 0.35, u1: 1, x0: targetX, x1: targetX, y0: 0, y1: targetY },
            ];

      const durationMs = maxX > 8 ? 5200 : 3200;
      const t0 = performance.now();

      const scrollAt = (u: number) => {
        const seg = segments.find((s) => u >= s.u0 && u <= s.u1) ?? segments[segments.length - 1]!;
        const span = Math.max(1e-6, seg.u1 - seg.u0);
        const lu = Math.min(1, Math.max(0, (u - seg.u0) / span));
        const e = easeInOutCubic(lu);
        return {
          scrollLeft: clampX(seg.x0 + (seg.x1 - seg.x0) * e),
          scrollTop: clampY(seg.y0 + (seg.y1 - seg.y0) * e),
        };
      };

      const tick = (now: number) => {
        const u = Math.min(1, (now - t0) / durationMs);
        const { scrollLeft, scrollTop } = scrollAt(u);
        el.scrollLeft = scrollLeft;
        el.scrollTop = scrollTop;
        if (u < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some(
          (e) => e.isIntersecting && e.intersectionRatio >= 0.14
        );
        if (hit) {
          compareStripInView = true;
          if (!ioPanScheduled) {
            ioPanScheduled = true;
            scheduleTryPan(780);
          }
        }
      },
      { root: null, rootMargin: '0px 0px -12% 0px', threshold: [0, 0.08, 0.14, 0.22, 0.35] }
    );
    io.observe(el);

    const ro = new ResizeObserver(() => {
      if (landingComparePanPlayedRef.current) return;
      if (!compareStripInView) return;
      if (resizeKickOnce) return;
      resizeKickOnce = true;
      scheduleTryPan(780);
    });
    ro.observe(el);

    return () => {
      if (panScheduleTimer != null) window.clearTimeout(panScheduleTimer);
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [
    landingCompareSmoothPan,
    landingCompareNoScroll,
    reduceMotion,
    compareAllMarkets,
    showCompareIsoCityBlock,
    compareDatesFitKey,
    marketsFitKey,
    cellPx,
    calendarLayout,
    gap,
    monthStripW,
    marketsOrdered,
    landingCompareColumnHighlight,
    compareStripFirstCalendarMonthKey,
  ]);

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
    const stamped = stampRunwayScrollportsForPngExport([
      compareScrollRef.current,
      singleMarketFitRef.current,
    ]);
    try {
      await downloadRunwayHeatmapPng(el, { filename: `${pngFilenameBase}.png` });
    } catch (e) {
      console.error(e);
    } finally {
      clearRunwayPngScrollportStamps(stamped);
      setPngExporting(false);
    }
  }, [calendarLayout, countrySwitchLoading, pngFilenameBase]);

  const runwayViewToolbarEl = useMemo(() => {
    if (landingMinimalChrome) return null;
    return (
      <RunwayViewActionsToolbar
        countrySwitchLoading={countrySwitchLoading}
        runwaySvgHeatmapPref={runwaySvgHeatmapPref}
        setRunwaySvgHeatmap={setRunwaySvgHeatmap}
        showIso3dSingleMarket={showIso3dSingleMarket}
        compareAllMarkets={compareAllMarkets}
        runway3dHeatmap={runway3dHeatmap}
        setRunway3dHeatmap={setRunway3dHeatmap}
        dimPastDays={dimPastDays}
        setDimPastDays={setDimPastDays}
        runwayCellPx={runwayCellPx}
        setRunwayCellPx={setRunwayCellPx}
        calendarLayoutPresent={!!calendarLayout}
        pngExporting={pngExporting}
        handleDownloadPng={handleDownloadPng}
        layoutDatesSortedEmpty={layoutDatesSorted.length === 0}
      />
    );
  }, [
    landingMinimalChrome,
    countrySwitchLoading,
    runwaySvgHeatmapPref,
    setRunwaySvgHeatmap,
    showIso3dSingleMarket,
    compareAllMarkets,
    runway3dHeatmap,
    setRunway3dHeatmap,
    dimPastDays,
    setDimPastDays,
    runwayCellPx,
    setRunwayCellPx,
    calendarLayout,
    pngExporting,
    handleDownloadPng,
    layoutDatesSorted.length,
  ]);

  if (!countrySwitchLoading && !calendarLayout) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-2 bg-transparent px-8 py-12 text-center">
        <div className="flex flex-row flex-wrap items-center justify-center gap-2.5">
          {!compareAllMarkets ? <MarketCircleFlag marketId={country} size={26} className="shrink-0" /> : null}
          <h2 className="min-w-0 text-lg font-bold tracking-tight text-foreground sm:text-xl">
            {runwayTitleWithMarket}
          </h2>
        </div>
        <p className="text-sm font-medium text-foreground">No runway data</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Apply valid multi-market YAML in the editor.
        </p>
      </div>
    );
  }

  /** Flat LIOM compare (not isometric city block): fill flex height so compare scrollport gets a real clientHeight and cell auto-fit can use the viewport. */
  const compareStripViewportFill = compareAllMarkets && !showCompareIsoCityBlock;
  /** LIOM compare strip only: bounded-height chain so the compare scrollport gets a real clientHeight for cell auto-fit. */
  const runwayStackViewportFill = compareStripViewportFill;

  return (
    <div
      className={cn(
        'relative flex w-full flex-col overflow-visible bg-transparent',
        runwayStackViewportFill ? 'min-h-0 flex-1 flex-col' : 'shrink-0'
      )}
    >
      <div
        key={`${viewMode}-${country}`}
        className={cn(
          'mx-auto w-full max-w-full bg-transparent px-4 pb-3 pt-3 sm:px-5 sm:pb-4 sm:pt-3.5',
          runwayStackViewportFill && 'flex min-h-0 min-w-0 flex-1 flex-col'
        )}
      >
        <div className="mb-3 flex flex-col gap-3 sm:mb-4">
          <div className="flex min-w-0 flex-row flex-wrap items-center justify-center gap-2.5 min-[480px]:justify-start">
            {!compareAllMarkets ? (
              <MarketCircleFlag marketId={country} size={26} className="shrink-0" />
            ) : null}
            <h2 className="min-w-0 text-center text-lg font-bold leading-snug tracking-tight text-foreground min-[480px]:text-left sm:text-xl">
              {runwayTitleWithMarket}
            </h2>
          </div>
        </div>

        <div
          className={cn(
            'relative w-full max-w-full',
            runwayStackViewportFill && 'flex min-h-0 min-w-0 flex-1 flex-col'
          )}
        >
            <AnimatePresence mode="wait">
            {countrySwitchLoading ? (
              <motion.div
                key={`sk-${country}`}
                className="flex w-full flex-col items-stretch gap-3"
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
                {runwayViewToolbarEl ? (
                  <div className="flex w-full justify-center">
                    {runwayViewToolbarEl}
                  </div>
                ) : null}
              </motion.div>
            ) : calendarLayout ? (
              <motion.div
                key={`grid-${country}-${compareAllMarkets ? 'compare' : 'single'}-${
                  showIso3dSingleMarket || showCompareIsoCityBlock ? '3d' : 'flat'
                }-${singleMarketMultiLens ? 'multilens' : '1l'}-${useSvgHeatmap ? 'svg' : 'html'}`}
                className={cn('w-full', runwayStackViewportFill && 'flex min-h-0 min-w-0 flex-1 flex-col')}
                initial={reduceMotion ? false : { y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: motionEase }}
              >
                <RunwayGridBody
                  compareScrollRef={compareScrollRef}
                  singleMarketFitRef={singleMarketFitRef}
                  compareAllMarkets={compareAllMarkets}
                  landingCompareNoScroll={landingCompareNoScroll}
                  compareCellDetailsDisabled={landingCompareDisableCellDetails}
                  noopCompareDayOpen={noopCompareDayOpen}
                  landingCompareStackFill={compareStripViewportFill}
                  compareColumnDateHighlight={landingCompareColumnHighlight}
                  marketsOrdered={marketsOrdered}
                  riskSurface={riskSurface}
                  configs={configs}
                  sections={calendarLayout.sections}
                  contentWidth={calendarLayout.contentWidth}
                  placedCells={calendarLayout.placedCells}
                  cellPx={cellPx}
                  gap={gap}
                  monthStripW={monthStripW}
                  heatmapOptsBase={heatmapOptsBase}
                  heatmapOptsForMarket={heatmapOptsForMarket}
                  riskTuning={riskTuning}
                  viewMode={viewMode}
                  todayYmd={todayYmd}
                  dimPastDays={dimPastDays}
                  shimmer={shimmer}
                  discoMode={discoMode}
                  country={country}
                  marketConfig={marketConfig}
                  activityLedger={activityLedger}
                  heatmap3d={showIso3dSingleMarket}
                  runway3dHeatmap={showCompareIsoCityBlock}
                  rowTowerPx={runway3dRowTowerPx}
                  runwaySvgHeatmap={useSvgHeatmap}
                  makeShowTip={makeShowTip}
                  heatmapInteractionRef={heatmapInteractionRef}
                  outerRef={outerRef}
                  heatmapCaptureRef={heatmapCaptureRef}
                  scrollTopRef={scrollTopRef}
                  onSlotSelection={onSlotSelection}
                  onCompareMarketSelect={
                    compareAllMarkets && !disableCompareColumnNavigation ? selectCompareMarket : undefined
                  }
                  reduceMotion={!!reduceMotion}
                  useSideSummary={useSideSummary}
                  tip={tip}
                  summaryPanelRef={summaryPanelRef}
                  onClearDaySummary={dismissTip}
                  runwayViewToolbar={runwayViewToolbarEl}
                  isoGrowResetKey={isoGrowResetKey}
                  singleMarketMultiLens={singleMarketMultiLens}
                  heatmapOptsForMarketLens={heatmapOptsForMarketLens}
                />
              </motion.div>
            ) : null}
            </AnimatePresence>
        </div>
      </div>

      <RunwayCellTooltip
        tip={
          useSideSummary || (landingCompareDisableCellDetails && compareAllMarkets) ? null : tip
        }
        reducedMotion={!!reduceMotion}
        onDismiss={dismissTip}
        rootRef={tooltipRootRef}
      />
    </div>
  );
}

type RunwayViewActionsToolbarProps = {
  countrySwitchLoading: boolean;
  runwaySvgHeatmapPref: boolean;
  setRunwaySvgHeatmap: (next: boolean) => void;
  showIso3dSingleMarket: boolean;
  compareAllMarkets: boolean;
  runway3dHeatmap: boolean;
  setRunway3dHeatmap: (next: boolean) => void;
  dimPastDays: boolean;
  setDimPastDays: Dispatch<SetStateAction<boolean>>;
  runwayCellPx: number;
  setRunwayCellPx: Dispatch<SetStateAction<number>>;
  calendarLayoutPresent: boolean;
  pngExporting: boolean;
  handleDownloadPng: () => void | Promise<void>;
  layoutDatesSortedEmpty: boolean;
};

function RunwayViewActionsToolbar({
  countrySwitchLoading,
  runwaySvgHeatmapPref,
  setRunwaySvgHeatmap,
  showIso3dSingleMarket,
  compareAllMarkets,
  runway3dHeatmap,
  setRunway3dHeatmap,
  dimPastDays,
  setDimPastDays,
  runwayCellPx,
  setRunwayCellPx,
  calendarLayoutPresent,
  pngExporting,
  handleDownloadPng,
  layoutDatesSortedEmpty,
}: RunwayViewActionsToolbarProps) {
  return (
    <div
      className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-center gap-0.5"
      role="toolbar"
      aria-label="Runway view actions"
    >
      <button
        type="button"
        disabled={countrySwitchLoading}
        aria-pressed={runwaySvgHeatmapPref}
        title={
          showIso3dSingleMarket
            ? '3D single-market view is on — turn 3D off to use flat SVG cells'
            : runwaySvgHeatmapPref
              ? 'SVG runway on (compare, quarter grid, triple Tech/Trading/Risk). Off for HTML cells and swoosh.'
              : 'SVG runway off — HTML cells with swoosh; turn on for lighter vector heatmaps'
        }
        aria-label={
          runwaySvgHeatmapPref ? 'Turn off SVG runway heatmap' : 'Turn on SVG runway heatmap'
        }
        onClick={() => setRunwaySvgHeatmap(!runwaySvgHeatmapPref)}
        className={cn(
          RUNWAY_TOOLBAR_ICON_BTN,
          runwaySvgHeatmapPref && 'bg-primary/15 text-foreground'
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
            runway3dHeatmap && 'bg-primary/15 text-foreground'
          )}
        >
          <Box className="h-3.5 w-3.5 opacity-90" aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        disabled={countrySwitchLoading}
        aria-pressed={dimPastDays}
        title={dimPastDays ? 'Past days: dimmed (click for full strength)' : 'Dim calendar days before today'}
        aria-label={dimPastDays ? 'Show past days at full strength' : 'Dim past days'}
        onClick={() => setDimPastDays((v) => !v)}
        className={cn(
          RUNWAY_TOOLBAR_ICON_BTN,
          dimPastDays && 'bg-primary/15 text-foreground'
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
          !calendarLayoutPresent || countrySwitchLoading || pngExporting || layoutDatesSortedEmpty
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
  );
}

type RunwayGridBodyProps = {
  compareScrollRef: RefObject<HTMLDivElement | null>;
  singleMarketFitRef: RefObject<HTMLDivElement | null>;
  compareAllMarkets: boolean;
  landingCompareNoScroll?: boolean;
  compareCellDetailsDisabled?: boolean;
  noopCompareDayOpen: OpenDayDetailsFromCellFn;
  /** Landing compare preview: fill parent height so the scrollport can measure and pan. */
  landingCompareStackFill?: boolean;
  compareColumnDateHighlight?: { market: string; ymdStart: string; ymdEnd: string };
  marketsOrdered: string[];
  riskSurface: RiskRow[];
  configs: MarketConfig[];
  sections: VerticalYearSection[];
  contentWidth: number;
  placedCells: PlacedRunwayCell[];
  cellPx: number;
  gap: number;
  monthStripW: number;
  heatmapOptsBase: HeatmapColorOpts;
  heatmapOptsForMarket: (marketId: string) => HeatmapColorOpts;
  riskTuning: RiskModelTuning;
  viewMode: ViewModeId;
  todayYmd: string;
  dimPastDays: boolean;
  shimmer: boolean;
  discoMode: boolean;
  country: string;
  marketConfig: MarketConfig | undefined;
  /** Parsed-market activity ledger for receipt + attribution (single-market). */
  activityLedger: MarketActivityLedger | null;
  makeShowTip: (
    market: string,
    riskByDate: Map<string, RiskRow>,
    config: MarketConfig | undefined
  ) => OpenDayDetailsFromCellFn;
  singleMarketMultiLens: boolean;
  /** Per market + lens — includes YAML pressure shaping (required for stacked triple runways). */
  heatmapOptsForMarketLens: (marketId: string, mode: ViewModeId) => HeatmapColorOpts;
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
  /** Flat heatmaps: quarter grid, compare columns, or triple-lens strip as SVG when pref is on. */
  runwaySvgHeatmap: boolean;
  /** Single-market flat: heatmap + side summary instead of popover. */
  useSideSummary: boolean;
  tip: RunwayTipState | null;
  summaryPanelRef: Ref<HTMLDivElement | null>;
  onClearDaySummary: () => void;
  /** Flat/tooling row rendered under the heatmap column (SVG/HTML/3D/compare). */
  runwayViewToolbar: ReactNode;
  /** 3D iso views: restarts column grow-in when this key changes. */
  isoGrowResetKey: string;
};

function RunwayGridBody({
  compareScrollRef,
  singleMarketFitRef,
  compareAllMarkets,
  landingCompareNoScroll = false,
  compareCellDetailsDisabled = false,
  noopCompareDayOpen,
  landingCompareStackFill = false,
  compareColumnDateHighlight,
  marketsOrdered,
  riskSurface,
  configs,
  sections,
  contentWidth,
  placedCells,
  cellPx,
  gap,
  monthStripW,
  heatmapOptsBase,
  heatmapOptsForMarket,
  riskTuning,
  viewMode,
  todayYmd,
  dimPastDays,
  shimmer,
  discoMode,
  country,
  marketConfig,
  activityLedger,
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
  runwayViewToolbar,
  isoGrowResetKey,
  singleMarketMultiLens,
  heatmapOptsForMarketLens,
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
  }, [reduceMotion, viewMode]);

  const firstCompareCalendarMonthKey = useMemo(
    () => firstCalendarMonthKeyFromSections(sections),
    [sections]
  );

  const singleRiskByDate = useMemo(
    () => (compareAllMarkets ? null : riskByDateForMarket(riskSurface, country)),
    [compareAllMarkets, riskSurface, country]
  );

  const runwayLedgerExcludedEntryIds = useAtcStore((s) => s.runwayLedgerExcludedEntryIds);
  const runwayLedgerImplicitBaselineFootprint = useAtcStore((s) => s.runwayLedgerImplicitBaselineFootprint);

  const ledgerOverlapByLens = useMemo(() => {
    if (!activityLedger) return null;
    const activeIds = activeLedgerEntryIds(activityLedger, runwayLedgerExcludedEntryIds);
    if (activeIds.length === 0 && !runwayLedgerImplicitBaselineFootprint) return null;
    return {
      combined: buildLedgerLensOverlapMap(activityLedger, activeIds, 'combined'),
      in_store: buildLedgerLensOverlapMap(activityLedger, activeIds, 'in_store'),
      market_risk: buildLedgerLensOverlapMap(activityLedger, activeIds, 'market_risk'),
    };
  }, [activityLedger, runwayLedgerExcludedEntryIds, runwayLedgerImplicitBaselineFootprint]);

  const ledgerAttrForLens = useCallback(
    (lens: ViewModeId): { overlapByDay: Map<string, number>; lens: Exclude<ViewModeId, 'code'> } | null => {
      if (!ledgerOverlapByLens || lens === 'code') return null;
      const overlapByDay = ledgerOverlapByLens[lens as keyof typeof ledgerOverlapByLens];
      return { overlapByDay, lens: lens as Exclude<ViewModeId, 'code'> };
    },
    [ledgerOverlapByLens],
  );

  const singleMarketSelectedDayYmd =
    !compareAllMarkets && tip && 'payload' in tip ? tip.payload.dateStr : null;

  const diagramViewModeForSummary: ViewModeId =
    singleMarketMultiLens && tip && 'payload' in tip
      ? tip.payload.viewMode
      : singleMarketMultiLens
        ? 'combined'
        : viewMode;

  const ledgerDayRowFilter: RunwayLedgerDayRowFilter | null =
    !compareAllMarkets &&
    tip &&
    'payload' in tip &&
    tip.payload.market === country &&
    tip.payload.viewMode !== 'code'
      ? { dayYmd: tip.payload.dateStr, lensView: tip.payload.viewMode as Exclude<ViewModeId, 'code'> }
      : null;

  const runwayToolbarSlot = runwayViewToolbar ? (
    <div className="mt-2 flex w-full min-w-0 shrink-0 justify-center pt-1">
      {runwayViewToolbar}
    </div>
  ) : null;

  return (
    <div
      className={cn(
        'flex w-full min-w-0 max-w-full justify-start pl-0.5 sm:pl-1',
        landingCompareStackFill && 'min-h-0 min-w-0 flex-1 flex-col'
      )}
    >
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
          'lg:pr-2.5 lg:pl-0.5',
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
          viewMode={singleMarketMultiLens ? SINGLE_MARKET_STACK_SHARED_LEGEND_LENS : viewMode}
          heatmapOpts={
            singleMarketMultiLens
              ? heatmapOptsForMarketLens(country, SINGLE_MARKET_STACK_SHARED_LEGEND_LENS)
              : heatmapOptsBase
          }
          cellSizePx={
            singleMarketMultiLens ? Math.max(RUNWAY_COMPARE_FIT_CELL_PX_MIN, cellPx - 2) : cellPx
          }
          cellGapPx={gap}
        />
      </div>
      <div
        ref={heatmapInteractionRef as Ref<HTMLDivElement>}
        className={cn(
          'flex min-w-0 flex-1 flex-col bg-transparent p-0 shadow-none',
          heatmap3d
            ? 'min-h-0 justify-stretch'
            : compareAllMarkets
              ? landingCompareStackFill
                ? 'min-h-0 min-w-0 flex-1 justify-stretch'
                : 'min-h-0 justify-stretch'
              : useSideSummary
                ? 'min-w-0 flex-1 justify-start'
                : 'justify-center',
          !compareAllMarkets && useSideSummary && 'flex flex-col gap-8 lg:gap-10'
        )}
      >
        {compareAllMarkets ? (
          runway3dHeatmap ? (
            <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
              <RunwayIsoCityBlock
                growResetKey={isoGrowResetKey}
                sections={sections}
                markets={marketsOrdered}
                riskSurface={riskSurface}
                cellPx={Math.max(cellPx, 18)}
                heatmapOptsForMarket={heatmapOptsForMarket}
                riskTuning={riskTuning}
                viewMode={viewMode}
                todayYmd={todayYmd}
                dimPastDays={dimPastDays}
              />
              {runwayToolbarSlot}
            </div>
          ) : (
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
          <div
            ref={compareScrollRef as Ref<HTMLDivElement>}
            className={cn(
              'min-h-0 w-full flex-1 pb-1',
              landingCompareNoScroll
                ? 'overflow-hidden'
                : 'overflow-x-auto overflow-y-auto [scrollbar-gutter:stable]'
            )}
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
                          heatmapOpts={heatmapOptsForMarket(m)}
                          riskTuning={riskTuning}
                          viewMode={viewMode}
                          todayYmd={todayYmd}
                          dimPastDays={dimPastDays}
                          firstCalendarMonthKey={firstCompareCalendarMonthKey}
                          openDayDetailsFromCell={
                            compareCellDetailsDisabled ? noopCompareDayOpen : makeShowTip(m, map, cfg)
                          }
                          interactionDisabled={compareCellDetailsDisabled}
                          pulseDateRange={
                            compareColumnDateHighlight &&
                            compareColumnDateHighlight.market === m
                              ? {
                                  ymdStart: compareColumnDateHighlight.ymdStart,
                                  ymdEnd: compareColumnDateHighlight.ymdEnd,
                                }
                              : undefined
                          }
                          preferReducedMotion={reduceMotion}
                          emergeResetKey={`${isoGrowResetKey}-${m}`}
                          emergeStaggerMs={colIdx * 52}
                        />
                      ) : (
                        <RunwayVerticalHeatmapBody
                          sections={sections}
                          cellPx={cellPx}
                          gap={gap}
                          monthStripW={monthStripW}
                          riskByDate={map}
                          heatmapOpts={heatmapOptsForMarket(m)}
                          riskTuning={riskTuning}
                          viewMode={viewMode}
                          todayYmd={todayYmd}
                          dimPastDays={dimPastDays}
                          shimmer={shimmer}
                          discoMode={discoMode}
                          enableColorSweep={enableColorSweep}
                          postSweep={postSweep}
                          sweepMarketOffsetSec={colIdx * SWOOSH_MARKET_COLUMN_GAP_SEC}
                          openDayDetailsFromCell={
                            compareCellDetailsDisabled ? noopCompareDayOpen : makeShowTip(m, map, cfg)
                          }
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
          {runwayToolbarSlot}
          </div>
          )
        ) : (
          (() => {
            const singleMarketHeatmapColumn = (
              <div
                className={cn(
                  'flex min-w-0 w-full flex-1 flex-col',
                  useSideSummary && 'lg:min-w-0 lg:flex-1 lg:basis-0',
                )}
              >
                <div
                  ref={singleMarketFitRef as Ref<HTMLDivElement>}
                  className={cn(
                    'flex w-full pb-1',
                    heatmap3d
                      ? 'min-h-[min(88dvh,calc(100dvh-6rem))] flex-1 flex-col overflow-x-auto overflow-y-auto'
                      : useSideSummary
                        ? 'min-w-0 w-full shrink-0 justify-start overflow-visible lg:flex-col lg:items-stretch lg:justify-start lg:px-3'
                        : 'justify-center overflow-x-auto overflow-y-visible',
                  )}
                >
                  <div
                    ref={outerRef}
                    className={cn(
                      'relative overflow-visible bg-transparent',
                      heatmap3d ? 'flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col' : 'w-full min-w-0 shrink-0',
                    )}
                    style={
                      heatmap3d
                        ? { width: '100%', minWidth: 0 }
                        : useSideSummary
                          ? { width: '100%', minWidth: contentWidth }
                          : { width: contentWidth }
                    }
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
                      riskTuning={riskTuning}
                      onSlotSelection={onSlotSelection}
                      disabled={heatmap3d || singleMarketMultiLens}
                    />
                    {singleMarketMultiLens ? (
                      <div
                        className="flex w-max max-w-none flex-row items-start justify-start px-0.5"
                        style={{ gap: CALENDAR_QUARTER_GRID_COL_GAP_PX }}
                      >
                        <div className="flex shrink-0 flex-col items-end">
                          <div
                            className="invisible relative z-20 mb-1.5 flex min-h-[34px] items-center justify-center"
                            aria-hidden
                          >
                            <span className="rounded-full border px-2.5 py-1 text-[11px]">Spacer</span>
                          </div>
                          <div
                            className="relative z-0 shrink-0 overflow-visible bg-transparent"
                            style={{ width: CALENDAR_QUARTER_GUTTER_W }}
                          >
                            <RunwayCompareQuarterGutter sections={sections} cellPx={cellPx} gap={gap} />
                          </div>
                        </div>
                        {SINGLE_MARKET_STACK_LENS_IDS.map((lensMode, colIdx) => {
                          const LensIcon = lensStackHeadingIcon(lensMode);
                          return (
                            <div key={lensMode} className="flex shrink-0 flex-col items-center">
                              <div className="relative z-20 mb-1.5 flex min-h-[34px] items-center justify-center px-0.5">
                                <div
                                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/55 bg-muted/40 px-2.5 py-1 text-center shadow-sm ring-1 ring-black/[0.04] backdrop-blur-sm dark:bg-muted/25 dark:ring-white/[0.06]"
                                  title={runwayLensProductLabel(lensMode)}
                                >
                                  <LensIcon
                                    className="h-3.5 w-3.5 shrink-0 text-primary/85"
                                    strokeWidth={2.25}
                                    aria-hidden
                                  />
                                  <span className="text-[11px] font-semibold leading-none tracking-tight text-foreground">
                                    {lensStackRailLabel(lensMode)}
                                  </span>
                                </div>
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
                                    marketKey={`${country}-${lensMode}`}
                                    sections={sections}
                                    cellPx={cellPx}
                                    gap={gap}
                                    monthStripW={monthStripW}
                                    riskByDate={singleRiskByDate!}
                                    heatmapOpts={heatmapOptsForMarketLens(country, lensMode)}
                                    riskTuning={riskTuning}
                                    viewMode={lensMode}
                                    todayYmd={todayYmd}
                                    dimPastDays={dimPastDays}
                                    firstCalendarMonthKey={firstCompareCalendarMonthKey}
                                    openDayDetailsFromCell={(anchor, ds, wc) =>
                                      makeShowTip(country, singleRiskByDate!, marketConfig)(anchor, ds, wc, {
                                        detailViewMode: lensMode,
                                      })
                                    }
                                    preferReducedMotion={reduceMotion}
                                    emergeResetKey={`${isoGrowResetKey}-${lensMode}`}
                                    emergeStaggerMs={colIdx * 52}
                                    ledgerAttribution={ledgerAttrForLens(lensMode)}
                                    ledgerImplicitBaselineFootprint={runwayLedgerImplicitBaselineFootprint}
                                  />
                                ) : (
                                  <RunwayVerticalHeatmapBody
                                    sections={sections}
                                    cellPx={cellPx}
                                    gap={gap}
                                    monthStripW={monthStripW}
                                    riskByDate={singleRiskByDate!}
                                    heatmapOpts={heatmapOptsForMarketLens(country, lensMode)}
                                    riskTuning={riskTuning}
                                    viewMode={lensMode}
                                    todayYmd={todayYmd}
                                    dimPastDays={dimPastDays}
                                    shimmer={shimmer}
                                    discoMode={discoMode}
                                    enableColorSweep={enableColorSweep}
                                    postSweep={postSweep}
                                    sweepMarketOffsetSec={colIdx * SWOOSH_MARKET_COLUMN_GAP_SEC}
                                    openDayDetailsFromCell={(anchor, ds, wc, o) =>
                                      makeShowTip(country, singleRiskByDate!, marketConfig)(anchor, ds, wc, {
                                        ...o,
                                        detailViewMode: lensMode,
                                      })
                                    }
                                    layout="vertical_strip"
                                    showQuarterGutter={false}
                                    compareStripLabels
                                    firstCalendarMonthKey={firstCompareCalendarMonthKey}
                                    heatmap3d={false}
                                    rowTowerPx={0}
                                    selectedDayYmd={singleMarketSelectedDayYmd}
                                    isoGrowResetKey={isoGrowResetKey}
                                    ledgerAttribution={ledgerAttrForLens(lensMode)}
                                    ledgerImplicitBaselineFootprint={runwayLedgerImplicitBaselineFootprint}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : runwaySvgHeatmap ? (
                      <RunwayQuarterGridSvg
                        marketKey={country}
                        sections={sections}
                        cellPx={cellPx}
                        gap={gap}
                        monthStripW={monthStripW}
                        riskByDate={singleRiskByDate!}
                        heatmapOpts={heatmapOptsForMarket(country)}
                        riskTuning={riskTuning}
                        viewMode={viewMode}
                        todayYmd={todayYmd}
                        dimPastDays={dimPastDays}
                        selectedDayYmd={singleMarketSelectedDayYmd}
                        openDayDetailsFromCell={makeShowTip(country, singleRiskByDate!, marketConfig)}
                        emergeResetKey={isoGrowResetKey}
                      />
                    ) : (
                      <RunwayVerticalHeatmapBody
                        sections={sections}
                        cellPx={cellPx}
                        gap={gap}
                        monthStripW={monthStripW}
                        riskByDate={singleRiskByDate!}
                        heatmapOpts={heatmapOptsForMarket(country)}
                        riskTuning={riskTuning}
                        viewMode={viewMode}
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
                        selectedDayYmd={singleMarketSelectedDayYmd}
                        isoGrowResetKey={isoGrowResetKey}
                        ledgerAttribution={ledgerAttrForLens(viewMode)}
                        ledgerImplicitBaselineFootprint={runwayLedgerImplicitBaselineFootprint}
                      />
                    )}
                  </div>
                </div>
                {runwayToolbarSlot}
              </div>
            );

            if (!useSideSummary) return singleMarketHeatmapColumn;

            return (
              <>
                <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                  {singleMarketHeatmapColumn}
                  <div className="mt-4 flex w-full min-w-0 shrink-0 flex-col gap-6 lg:mt-0 lg:min-w-0 lg:flex-1 lg:max-w-none">
                    <RunwayDaySummaryPanel
                      tip={tip}
                      onClear={onClearDaySummary}
                      panelRef={summaryPanelRef}
                    />
                    {activityLedger && !singleMarketSelectedDayYmd ? (
                      <div className="w-full min-w-0 shrink-0 border-b border-border/25 pb-6 dark:border-border/30 lg:pb-7">
                        <RunwaySummaryLineDiagrams
                          viewMode={diagramViewModeForSummary}
                          className="w-full min-w-0 shrink-0 border-0 bg-transparent px-0 py-0 pt-0 shadow-none"
                          selectedDayYmd={singleMarketSelectedDayYmd}
                          activityLedger={activityLedger}
                          tripleLensReceipt={singleMarketMultiLens}
                          sparklineLayout="ledgerStrip"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                {activityLedger && singleMarketSelectedDayYmd ? (
                  <div className="mt-6 w-full min-w-0 shrink-0 border-b border-border/25 pb-8 pt-1 dark:border-border/30 lg:mt-8">
                    <RunwaySummaryLineDiagrams
                      viewMode={diagramViewModeForSummary}
                      className="w-full min-w-0 shrink-0 border-0 bg-transparent px-0 py-2 sm:px-0 shadow-none"
                      selectedDayYmd={singleMarketSelectedDayYmd}
                      activityLedger={activityLedger}
                      tripleLensReceipt={singleMarketMultiLens}
                      sparklineLayout="ledgerStrip"
                    />
                  </div>
                ) : null}
                {activityLedger ? (
                  <RunwayActivityLedgerTable
                    ledger={activityLedger}
                    className="w-full max-w-none"
                    dayRowFilter={ledgerDayRowFilter}
                  />
                ) : null}
              </>
            );
          })()
        )}
      </div>
      </div>
    </div>
  );
}
