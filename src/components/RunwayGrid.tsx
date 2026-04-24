import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import type { CSSProperties, Dispatch, LegacyRef, ReactNode, Ref, RefObject, SetStateAction } from 'react';
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
import {
  defaultRunwayCalendarYearFromRiskSurface,
  endYmdAfterFollowingQuarter,
  enumerateIsoDatesInclusive,
  runwayPickerLayoutBounds,
} from '@/lib/runwayDateFilter';
import { isRunwayCustomRangeActive } from '@/lib/runwayPipelineCalendarRange';
import {
  buildRunwayTooltipPayload,
  type RunwayTipState,
  type RunwayTooltipPayload,
} from '@/lib/runwayTooltipBreakdown';
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
  buildContributionStripRunwayLayout,
  buildVerticalMonthsRunwayLayout,
  contributionStripGridOnlyContentHeightPx,
  RUNWAY_CONTRIBUTION_STRIP_FLEX_ROW_PAD_LEFT_PX,
  RUNWAY_TRIPLE_LENS_CONTRIBUTION_SVG_LEADING_OFFSET_PX,
  SINGLE_MARKET_TRIPLE_LENS_LEFT_RAIL_W_PX,
  SINGLE_MARKET_TRIPLE_LENS_VERTICAL_GAP_PX,
  tripleLensStackRailHeightPx,
  tripleLensStackedContributionTotalContentHeightPx,
  tripleLensStackedContributionTotalContentWidthPx,
  flattenRunwayWeeksFromSections,
  calendarQuarterTitle,
  quarterCodeLabel,
  type CalendarMonthBlock,
  type ContributionStripLayoutMeta,
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
  RUNWAY_HEATMAP_CELL_PX_MAX,
  RUNWAY_HEATMAP_CELL_PX_MIN,
  RUNWAY_HEATMAP_CELL_PX_STEP,
  RUNWAY_HEATMAP_CELL_GAP_MAX,
  RUNWAY_HEATMAP_CELL_GAP_MIN,
  RUNWAY_HEATMAP_CELL_RADIUS_MAX,
  RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX,
  RUNWAY_HEATMAP_LAYOUT_DEFAULTS,
  snapRunwayHeatmapCellPx,
} from '@/lib/runwayHeatmapLayoutPrefs';
import {
  autoMarketRiskPressureOffsetMapForSurface,
  autoRestaurantPressureOffsetMapForSurface,
  lensHeatmapShapeOptsForAutoCalibrate,
} from '@/lib/autoRestaurantHeatmapOffset';
import { heatmapColorOptsWithMarketYaml } from '@/lib/heatmapColorOptsMarketYaml';
import { cn } from '@/lib/utils';
import { RunwayCellTooltip } from '@/components/RunwayCellTooltip';
import { RunwayActivityLedgerTable, type RunwayLedgerDayContributionPin } from '@/components/RunwayActivityLedgerTable';
import { RunwayDaySummaryPanel } from '@/components/RunwayDaySummaryPanel';
import { RunwaySummaryLineDiagrams } from '@/components/RunwaySummaryLineDiagrams';
import { RunwayTechCapacityDemandSparkline } from '@/components/RunwayTechCapacityDemandSparkline';
import { useAtcStore } from '@/store/useAtcStore';
import { SlotOverlay } from '@/components/SlotOverlay';
import type { DeploymentRiskBlackout, MarketConfig } from '@/engine/types';
import { ymdInAnyDeploymentRiskBlackout } from '@/lib/deploymentRiskBlackoutCalendar';
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
  ledgerAttributionHeatmapMetric,
  ledgerAttributionNeutralFillHex,
  maxRawLedgerOverlapInMap,
} from '@/lib/runwayLedgerAttribution';
import {
  clearRunwayPngScrollportStamps,
  collectOverflowScrollAncestors,
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
import { RunwayContributionStripSvg } from '@/components/RunwayContributionStripSvg';
import { RunwayHeatmapCellStylePopover } from '@/components/RunwayHeatmapCellStylePopover';
import { RunwayQuarterGridSvg } from '@/components/RunwayQuarterGridSvg';
import { Box, CalendarDays, Download, Grid2x2, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { MarketCircleFlag } from '@/components/MarketCircleFlag';

/** @deprecated Use {@link RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX} / layout prefs; kept for external imports. */
export const CELL_PX = RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX;

const RUNWAY_CELL_PX_MIN = RUNWAY_HEATMAP_CELL_PX_MIN;
const RUNWAY_CELL_PX_MAX = RUNWAY_HEATMAP_CELL_PX_MAX;
const RUNWAY_CELL_PX_STEP = RUNWAY_HEATMAP_CELL_PX_STEP;
const RUNWAY_CELL_GAP_ADJ_MIN = RUNWAY_HEATMAP_CELL_GAP_MIN;
const RUNWAY_CELL_GAP_ADJ_MAX = RUNWAY_HEATMAP_CELL_GAP_MAX;

/**
 * Isometric 3D runway (single-market skyline + LIOM city block). Hidden: toolbar + branches are gated off
 * until we ship this path again — set to `true` to restore.
 */
const RUNWAY_ISO_3D_ENABLED = false;

/** Stable empty list for landing minimal-chrome heatmap (no ledger row exclusions). */
const LANDING_LEDGER_NO_EXCLUDED_IDS: readonly string[] = [];

const snapRunwayCellPx = snapRunwayHeatmapCellPx;

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
/** Landing preview: extra delay per stacked lens so heatmap colour emerges Tech → Trading → Risk. */
const LANDING_TRIPLE_LENS_HEATMAP_EMERGE_STAGGER_MS = 300;
/** Main page title when all three lenses are stacked (matches heatmap lens names). */
const SINGLE_MARKET_MULTI_LENS_HEADLINE = 'Tech Capacity, Trading Pressure, Deployment Risk';
/** One legend for the whole stack; ramp matches the first (Technology) lens colour tuning. */
const SINGLE_MARKET_STACK_SHARED_LEGEND_LENS: ViewModeId =
  SINGLE_MARKET_STACK_LENS_IDS[0] ?? 'combined';

/** Two-line heading in the slim triple-lens rail (no icons); JSX applies −90° (90° CCW) so it reads along the strip. */
function lensStackRailLines(mode: ViewModeId): readonly [string, string] {
  switch (mode) {
    case 'combined':
      return ['TECH', 'CAPACITY'];
    case 'in_store':
      return ['RESTAURANT', 'TRADING'];
    case 'market_risk':
      return ['DEPLOYMENT', 'RISK'];
    default:
      return [String(mode), ''];
  }
}

/** Neutral rail surface (no lens tint — strip carries colour). */
const LENS_STACK_RAIL_SURFACE = cn(
  'border border-border/60 bg-muted/35 shadow-sm dark:border-border/55 dark:bg-muted/20',
);

/**
 * Slim triple-lens rail: two uppercase lines in a fixed “sheet” (`sheetW` × `sheetH`), centred in the
 * rail, then rotated −90° about the sheet centre. `sheetW` matches the rail’s long edge (minus pad) so
 * the run of text lines up with the strip axis; `sheetH` is the rail width so the pre-rotate stack fits
 * the narrow column — same layout contract as the original stacked-strip rail (see comment on
 * {@link lensStackRailLines}).
 */
function TripleLensStackRailCaption({ lensMode, railH }: { lensMode: ViewModeId; railH: number }) {
  const lines = lensStackRailLines(lensMode);
  const railW = SINGLE_MARKET_TRIPLE_LENS_LEFT_RAIL_W_PX;
  const sheetW = Math.max(32, railH - 8);
  const sheetH = railW;

  return (
    <div
      className={cn('relative flex shrink-0 overflow-visible rounded-sm', LENS_STACK_RAIL_SURFACE)}
      style={{ width: railW, height: railH, minHeight: railH, maxHeight: railH }}
      title={runwayLensProductLabel(lensMode)}
      aria-label={lines.filter(Boolean).join(' ')}
    >
      <div className="flex h-full min-h-0 w-full items-center justify-center">
        <div
          className="flex origin-center -rotate-90 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-center text-[8px] font-semibold uppercase leading-none tracking-tight text-foreground/90 antialiased sm:text-[9px]"
          style={{ width: sheetW, height: sheetH }}
        >
          {lines.map((line, li) =>
            line ? (
              <span key={`${lensMode}-${li}`}>{line}</span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
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
  /** When set, ledger footprint: `0` → neutral tile; `>0` → heat from {@link ledgerAttributionHeatmapMetric}. */
  ledgerOverlap?: number;
  /** Deployment Risk only: day falls in a YAML change-freeze / blackout window. */
  deployFreezeDiagonal?: boolean;
};

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

/** Deployment Risk lens: diagonal across cell for YAML `deployment_risk_blackouts` (change-freeze windows). */
function HeatCellDeployFreezeOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full text-foreground/55"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <line
        x1="0"
        y1="100"
        x2="100"
        y2="0"
        stroke="currentColor"
        strokeWidth={8}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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
  deployFreezeDiagonal = false,
}: HeatCellProps) {
  const tw = heatmapTwinkleParams(discoMode, shimmerBase, weekdayCol);
  const pulseOn = (shimmer || discoMode) && (!enableColorSweep || postSweep);

  const handlers = heatCellTipHandlers(openDayDetailsFromCell, dateStr, weekdayCol, cellDetailViewMode);

  const effFill = fill;
  const ledgerEmptyNonOverlap = typeof ledgerOverlap === 'number' && ledgerOverlap === 0;
  const heatDimOpacity = dimOpacity * (ledgerEmptyNonOverlap ? LEDGER_EMPTY_DAY_OPACITY_FACTOR : 1);

  const dayAria =
    dateStr != null
      ? `Day details for ${dateStr}${deployFreezeDiagonal ? '; change-freeze window' : ''}`
      : 'Day cell';
  const dayTitle = deployFreezeDiagonal ? 'Click for day details (change-freeze window)' : 'Click for day details';

  const boxClass = cn(
    'relative shrink-0 cursor-pointer rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    deployFreezeDiagonal && 'overflow-hidden',
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
            title={dayTitle}
            aria-label={dayAria}
            aria-pressed={isSelected}
            className={boxClass}
            style={{
              width: RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX,
              height: RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX,
              backgroundColor: effFill,
            }}
            {...handlers}
          >
            {deployFreezeDiagonal ? <HeatCellDeployFreezeOverlay /> : null}
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
            title={dayTitle}
            aria-label={dayAria}
            aria-pressed={isSelected}
            className={cn(boxClass, 'will-change-[opacity,filter]')}
            style={{
              width: RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX,
              height: RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX,
              backgroundColor: effFill,
            }}
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
            {deployFreezeDiagonal ? <HeatCellDeployFreezeOverlay /> : null}
            {isToday ? <TodayDot /> : null}
          </motion.div>
        </HeatCutoffOpacityWrap>
      </HeatCellDimWrap>
    );
  }

  return (
    <HeatCellDimWrap pastDimmed={pastDimmed}>
    <HeatCutoffOpacityWrap dimOpacity={heatDimOpacity}>
    <div
      className="relative shrink-0"
      style={{ width: RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX, height: RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[3px] bg-muted" aria-hidden />
      <motion.div
        key={colorLayerKey}
        className={cn(
          'absolute inset-0 cursor-pointer rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          deployFreezeDiagonal && 'overflow-hidden',
          isToday && 'z-[1]',
          isSelected && 'z-[2] ring-2 ring-inset ring-primary',
          'will-change-[opacity,filter]'
        )}
        role="button"
        tabIndex={0}
        title={dayTitle}
        aria-label={dayAria}
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
        {deployFreezeDiagonal ? <HeatCellDeployFreezeOverlay /> : null}
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
  deployFreezeDiagonal = false,
}: HeatCellSizedProps) {
  const tw = heatmapTwinkleParams(discoMode, shimmerBase, weekdayCol);
  const pulseOn = (shimmer || discoMode) && (!enableColorSweep || postSweep);

  const handlers = heatCellTipHandlers(openDayDetailsFromCell, dateStr, weekdayCol, cellDetailViewMode);

  const effFill = fill;
  const ledgerEmptyNonOverlap = typeof ledgerOverlap === 'number' && ledgerOverlap === 0;
  const heatDimOpacity = dimOpacity * (ledgerEmptyNonOverlap ? LEDGER_EMPTY_DAY_OPACITY_FACTOR : 1);

  const dayAria =
    dateStr != null
      ? `Day details for ${dateStr}${deployFreezeDiagonal ? '; change-freeze window' : ''}`
      : 'Day cell';
  const dayTitle = deployFreezeDiagonal ? 'Click for day details (change-freeze window)' : 'Click for day details';

  const boxClass = cn(
    'relative shrink-0 cursor-pointer rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    deployFreezeDiagonal && 'overflow-hidden',
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
            title={dayTitle}
            aria-label={dayAria}
            aria-pressed={isSelected}
            className={boxClass}
            style={{ width: cellPx, height: cellPx, backgroundColor: effFill }}
            {...handlers}
          >
            {deployFreezeDiagonal ? <HeatCellDeployFreezeOverlay /> : null}
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
            title={dayTitle}
            aria-label={dayAria}
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
            {deployFreezeDiagonal ? <HeatCellDeployFreezeOverlay /> : null}
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
          deployFreezeDiagonal && 'overflow-hidden',
          isToday && 'z-[1]',
          isSelected && 'z-[2] ring-2 ring-inset ring-primary',
          'will-change-[opacity,filter]'
        )}
        role="button"
        tabIndex={0}
        title={dayTitle}
        aria-label={dayAria}
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
        {deployFreezeDiagonal ? <HeatCellDeployFreezeOverlay /> : null}
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
  /** Deployment Risk lens: YAML change-freeze windows → diagonal mark on HTML cells. */
  deploymentRiskBlackouts?: readonly DeploymentRiskBlackout[] | null;
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
  deploymentRiskBlackouts = null,
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
  deploymentRiskBlackouts?: readonly DeploymentRiskBlackout[] | null;
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

  const ledgerRawOverlapMax = useMemo(() => {
    if (!ledgerAttribution) return 1;
    return maxRawLedgerOverlapInMap(ledgerAttribution.overlapByDay);
  }, [ledgerAttribution]);

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
            const rawLedger =
              ledgerAttribution && dateStr ? (ledgerAttribution.overlapByDay.get(dateStr) ?? 0) : undefined;
            const ledgerOverlap =
              ledgerAttribution && dateStr
                ? effectiveLedgerFootprintOverlap(
                    rawLedger ?? 0,
                    ledgerImplicitBaselineFootprint,
                  )
                : undefined;
            let fill: string;
            let dimOpacity: number;
            if (!dateStr) {
              fill = HEATMAP_RUNWAY_PAD_FILL;
              dimOpacity = 1;
            } else if (
              ledgerAttribution &&
              typeof rawLedger === 'number' &&
              typeof ledgerOverlap === 'number'
            ) {
              const lm = ledgerAttributionHeatmapMetric(
                metric,
                rawLedger,
                ledgerOverlap,
                ledgerRawOverlapMax,
              );
              if (lm === null) {
                fill = ledgerAttributionNeutralFillHex();
                dimOpacity = 1;
              } else {
                const heat = runwayHeatmapCellFillAndDim(viewMode, lm, heatmapOpts, row);
                fill = heat.fill;
                dimOpacity = heat.dimOpacity;
              }
            } else {
              const heat = runwayHeatmapCellFillAndDim(viewMode, metric, heatmapOpts, row);
              fill = heat.fill;
              dimOpacity = heat.dimOpacity;
            }
            const pastDimmed = dimPastDays && typeof dateStr === 'string' && dateStr < todayYmd;
            const isSelected = typeof dateStr === 'string' && dateStr === selectedDayYmd;
            const shimmerBase = ((secYear % 100) * 500 + mo.monthIndex * 40 + wi * 7 + di) % 900;
            const sweepDelaySec = sweepDelayForCell(sweepMarketOffsetSec, si, sweepMi, wi, di);
            const deployFreezeDiagonal =
              viewMode === 'market_risk' &&
              typeof dateStr === 'string' &&
              ymdInAnyDeploymentRiskBlackout(dateStr, deploymentRiskBlackouts);
            return cellPx === RUNWAY_HEATMAP_DEFAULT_SNAPPED_CELL_PX ? (
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
                deployFreezeDiagonal={deployFreezeDiagonal}
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
                deployFreezeDiagonal={deployFreezeDiagonal}
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
  deploymentRiskBlackouts = null,
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
                        deploymentRiskBlackouts={deploymentRiskBlackouts}
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
                          deploymentRiskBlackouts={deploymentRiskBlackouts}
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
  /** Landing hero single-market strip: sweep the tech sparkline along the time axis (loops). */
  landingTechSparklineSweep?: boolean;
  /** Landing hero: rose fill for high-but-not-overload utilization on the tech sparkline. */
  landingTechSparklineTightFill?: boolean;
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
  landingTechSparklineSweep = false,
  landingTechSparklineTightFill = false,
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
  const runwayCustomRangeStartYmd = useAtcStore((s) => s.runwayCustomRangeStartYmd);
  const runwayCustomRangeEndYmd = useAtcStore((s) => s.runwayCustomRangeEndYmd);
  const runwaySelectedDayYmd = useAtcStore((s) => s.runwaySelectedDayYmd);
  const setRunwaySelectedDayYmd = useAtcStore((s) => s.setRunwaySelectedDayYmd);
  const setRunwayFilterYear = useAtcStore((s) => s.setRunwayFilterYear);

  const [displayedCountry, setDisplayedCountry] = useState(country);
  const [countrySwitchLoading, setCountrySwitchLoading] = useState(false);

  const scrollTopRef = useRef(0);
  const [tip, setTip] = useState<RunwayTipState | null>(null);
  const tipRef = useRef<RunwayTipState | null>(null);
  tipRef.current = tip;
  /** Prevents re-applying persisted-day tip when layout deps are unchanged (e.g. after Strict Mode double mount). */
  const heatmapAutoDayAppliedKeyRef = useRef<string>('');
  /**
   * When `runwayFilterYear` is null on a single-market focus, we pick a default full calendar year once
   * per market session; clearing to “all years” sets year null and sets this ref equal to `country` so we
   * do not fight the user.
   */
  const singleMarketDefaultYearAppliedRef = useRef<string | null>(null);
  const heatmapInteractionRef = useRef<HTMLDivElement>(null);
  const tooltipRootRef = useRef<HTMLDivElement>(null);
  /** Single-market side column: day summary + sparklines + activity ledger (exclude from document dismiss). */
  const summaryPanelRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  /** Title row + runway body: full workbench “main” column for PNG export (not only the heatmap subtree). */
  const runwayMainContentCaptureRef = useRef<HTMLDivElement>(null);
  /** LIOM compare: horizontal scrollport — measured to pick a cell size that fits the main heatmap column. */
  const compareScrollRef = useRef<HTMLDivElement>(null);
  const landingComparePanPlayedRef = useRef(false);
  /** Single-market: measured to auto-fit cell size to available space. */
  const singleMarketFitRef = useRef<HTMLDivElement>(null);
  const [pngExporting, setPngExporting] = useState(false);
  const [dimPastDays, setDimPastDays] = useState(false);

  const runwayHeatmapUserCellPx = useAtcStore((s) => s.runwayHeatmapCellPx);
  const setRunwayHeatmapCellPx = useAtcStore((s) => s.setRunwayHeatmapCellPx);
  const runwayCellGapPx = useAtcStore((s) => s.runwayHeatmapCellGapPx);
  const setRunwayCellGapPx = useAtcStore((s) => s.setRunwayHeatmapCellGapPx);
  const runwayHeatmapCellRadiusPx = useAtcStore((s) => s.runwayHeatmapCellRadiusPx);
  const setRunwayHeatmapCellRadiusPx = useAtcStore((s) => s.setRunwayHeatmapCellRadiusPx);

  /** Largest cell size (px) that fits the current scrollport; {@link runwayHeatmapUserCellPx} may be larger. */
  const [runwayHeatmapFitCapPx, setRunwayHeatmapFitCapPx] = useState(RUNWAY_HEATMAP_CELL_PX_MAX);

  const cellPx = useMemo(
    () => snapRunwayHeatmapCellPx(Math.min(runwayHeatmapUserCellPx, runwayHeatmapFitCapPx)),
    [runwayHeatmapUserCellPx, runwayHeatmapFitCapPx],
  );
  const gap = runwayCellGapPx;

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

  const runwayCalendarSlice = useMemo(
    () => ({
      runwayCustomRangeStartYmd,
      runwayCustomRangeEndYmd,
      runwayFilterYear,
      runwayFilterQuarter,
      runwayIncludeFollowingQuarter,
    }),
    [
      runwayCustomRangeStartYmd,
      runwayCustomRangeEndYmd,
      runwayFilterYear,
      runwayFilterQuarter,
      runwayIncludeFollowingQuarter,
    ]
  );

  /** Dates shown in the calendar: custom ISO window, else year/quarter picker span, else all model dates. */
  const layoutDatesSorted = useMemo(() => {
    if (isRunwayCustomRangeActive(runwayCalendarSlice)) {
      let end = runwayCustomRangeEndYmd!;
      if (runwayIncludeFollowingQuarter) {
        end = endYmdAfterFollowingQuarter(end);
      }
      return enumerateIsoDatesInclusive(runwayCustomRangeStartYmd!, end);
    }
    if (runwayFilterYear != null) {
      const { start, end } = runwayPickerLayoutBounds(
        runwayFilterYear,
        runwayFilterQuarter,
        runwayIncludeFollowingQuarter
      );
      return enumerateIsoDatesInclusive(start, end);
    }
    return [...new Set(riskSurface.map((r) => r.date))].sort();
  }, [
    riskSurface,
    runwayCustomRangeStartYmd,
    runwayCustomRangeEndYmd,
    runwayFilterYear,
    runwayFilterQuarter,
    runwayIncludeFollowingQuarter,
  ]);

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

  /** LIOM compare: same exclusion + BAU semantics as single-market, one ledger per column market. */
  const activityLedgersByMarket = useMemo(() => {
    if (!compareAllMarkets || !layoutDateRangeBounds) return null;
    const out = new Map<string, MarketActivityLedger>();
    for (const cfg of configs) {
      const full = buildMarketActivityLedgerFromConfig(cfg);
      out.set(
        cfg.market,
        filterLedgerToVisibleDateRange(full, layoutDateRangeBounds.start, layoutDateRangeBounds.end),
      );
    }
    return out;
  }, [compareAllMarkets, layoutDateRangeBounds, configs]);

  const pruneRunwayLedgerExclusionsToAllowedEntryIds = useAtcStore(
    (s) => s.pruneRunwayLedgerExclusionsToAllowedEntryIds,
  );
  useEffect(() => {
    if (compareAllMarkets && activityLedgersByMarket) {
      const allowed = new Set<string>();
      for (const ledger of activityLedgersByMarket.values()) {
        for (const e of ledger.entries) allowed.add(e.entryId);
      }
      pruneRunwayLedgerExclusionsToAllowedEntryIds(allowed);
      return;
    }
    if (!activityLedger) return;
    pruneRunwayLedgerExclusionsToAllowedEntryIds(new Set(activityLedger.entries.map((e) => e.entryId)));
  }, [
    compareAllMarkets,
    activityLedgersByMarket,
    activityLedger,
    pruneRunwayLedgerExclusionsToAllowedEntryIds,
  ]);

  const focusMarketRiskByDate = useMemo(() => {
    if (isRunwayMultiMarketStrip(country)) return null;
    return riskByDateForMarket(riskSurface, country);
  }, [riskSurface, country]);

  /** Clear persisted / URL-backed day when it falls outside the visible layout or has no risk row (invalid share links). */
  useEffect(() => {
    if (compareAllMarkets) return;
    const y = runwaySelectedDayYmd;
    if (!y) return;
    if (!layoutDatesSorted.length) return;
    if (!focusMarketRiskByDate || focusMarketRiskByDate.size === 0) return;
    if (layoutDatesSorted.includes(y) && focusMarketRiskByDate.has(y)) return;
    setRunwaySelectedDayYmd(null);
  }, [
    compareAllMarkets,
    runwaySelectedDayYmd,
    layoutDatesSorted,
    focusMarketRiskByDate,
    setRunwaySelectedDayYmd,
  ]);

  useEffect(() => {
    singleMarketDefaultYearAppliedRef.current = null;
  }, [country]);

  /** Single-market: use full calendar year when no year is chosen, once per focus market (honours explicit “all years”). */
  useEffect(() => {
    if (compareAllMarkets) return;
    if (!riskSurface.length) return;
    if (runwayFilterYear != null) return;
    if (isRunwayCustomRangeActive(runwayCalendarSlice)) return;
    if (singleMarketDefaultYearAppliedRef.current === country) return;
    const y = defaultRunwayCalendarYearFromRiskSurface(riskSurface);
    if (y == null) return;
    singleMarketDefaultYearAppliedRef.current = country;
    setRunwayFilterYear(y);
  }, [
    compareAllMarkets,
    riskSurface,
    runwayFilterYear,
    country,
    setRunwayFilterYear,
    runwayCalendarSlice,
  ]);

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
        layoutDatesSorted,
        gap
      );
      if (landingCompareMaxCellPx != null) {
        next = snapRunwayCellPx(Math.min(next, landingCompareMaxCellPx));
      }
      setRunwayHeatmapFitCapPx((prev) => (prev === next ? prev : next));
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
    gap,
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
        ? bestCellPxForSingleMarketTripleColumnFit(w, h, layoutDatesSorted, gap)
        : bestCellPxForSingleMarketFit(w, h, layoutDatesSorted, gap);
      setRunwayHeatmapFitCapPx((prev) => (prev === next ? prev : next));
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
    countrySwitchLoading,
    showIso3dSingleMarket,
    singleMarketMultiLens,
    gap,
  ]);

  const dismissTip = useCallback(() => {
    setTip(null);
    if (!compareAllMarkets) setRunwaySelectedDayYmd(null);
  }, [compareAllMarkets, setRunwaySelectedDayYmd]);

  const calendarLayout = useMemo(() => {
    if (compareAllMarkets) {
      return buildVerticalMonthsRunwayLayout(layoutDatesSorted, cellPx, { cellGapPx: gap });
    }
    if (showIso3dSingleMarket) {
      return buildVerticalMonthsRunwayLayout(layoutDatesSorted, cellPx, {
        rowTowerPx: runway3dRowTowerPx,
        cellGapPx: gap,
      });
    }
    if (singleMarketMultiLens) {
      const strip = buildContributionStripRunwayLayout(layoutDatesSorted, cellPx, gap);
      if (!strip) return null;
      const colW = strip.contentWidth;
      const compactH = contributionStripGridOnlyContentHeightPx(cellPx, gap);
      const layerH = strip.contentHeight;
      return {
        ...strip,
        contributionColumnContentWidth: colW,
        contributionStripCompactHeight: compactH,
        contributionStripLayerHeight: layerH,
        contentWidth: tripleLensStackedContributionTotalContentWidthPx(colW),
        contentHeight: tripleLensStackedContributionTotalContentHeightPx(layerH, cellPx, gap),
      };
    }
    return buildContributionStripRunwayLayout(layoutDatesSorted, cellPx, gap);
  }, [
    layoutDatesSorted,
    cellPx,
    gap,
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

      const buildForMode = (mode: ViewModeId): RunwayTooltipPayload => {
        const fillMetricValue = heatmapCellMetric(row, mode, riskTuning);
        const optsM = heatmapOptsForMarketLens(market, mode);
        const fillMetricDisplayValue =
          mode === 'in_store' || mode === 'market_risk'
            ? transformedHeatmapMetric(mode, fillMetricValue, optsM)
            : fillMetricValue;
        const { fill: cellFillHex } = runwayHeatmapCellFillAndDim(mode, fillMetricValue, optsM, row);
        return buildRunwayTooltipPayload({
          dateStr,
          weekdayShort: wd,
          market,
          viewMode: mode,
          row,
          config,
          tuning: riskTuning,
          fillMetricHeadline: fillMetricHeadlineForView(mode),
          fillMetricLabel: fillMetricLabelForView(mode),
          fillMetricLeadCompact: fillMetricLeadCompactForView(mode),
          fillMetricValue,
          fillMetricDisplayValue,
          cellFillHex,
        });
      };

      const payload = buildForMode(payloadViewMode);

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
        const nextTip = buildPayloadTipState(market, nextDate, anchor, cur.payload.viewMode);
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
      runwayCustomRangeStartYmd ?? '',
      runwayCustomRangeEndYmd ?? '',
      layoutDatesSorted[0] ?? '',
      layoutDatesSorted[layoutDatesSorted.length - 1] ?? '',
      String(riskSurface.length),
    ].join('|');

    if (heatmapAutoDayAppliedKeyRef.current === key) return;

    heatmapAutoDayAppliedKeyRef.current = key;

    const persisted =
      runwaySelectedDayYmd &&
      layoutDatesSorted.includes(runwaySelectedDayYmd) &&
      focusMarketRiskByDate.has(runwaySelectedDayYmd)
        ? runwaySelectedDayYmd
        : null;

    if (persisted) {
      const next = buildPayloadTipState(country, persisted, { clientX: 0, clientY: 0 });
      if (next) setTip(next);
      return;
    }

    setTip(null);
    if (runwaySelectedDayYmd != null) {
      setRunwaySelectedDayYmd(null);
    }
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
    runwayCustomRangeStartYmd,
    runwayCustomRangeEndYmd,
    riskSurface.length,
    country,
    runwaySelectedDayYmd,
    buildPayloadTipState,
  ]);

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
    /** Title + toolbar + heatmap (+ side summary when present); excludes workbench chrome and app header. */
    const el = runwayMainContentCaptureRef.current;
    if (!el || !calendarLayout || countrySwitchLoading) return;
    setPngExporting(true);
    const stamped = stampRunwayScrollportsForPngExport([
      el,
      ...collectOverflowScrollAncestors(el),
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
        runwayCellPx={runwayHeatmapUserCellPx}
        setRunwayCellPx={setRunwayHeatmapCellPx}
        runwayCellGapPx={runwayCellGapPx}
        setRunwayCellGapPx={setRunwayCellGapPx}
        runwayHeatmapCellRadiusPx={runwayHeatmapCellRadiusPx}
        setRunwayHeatmapCellRadiusPx={setRunwayHeatmapCellRadiusPx}
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
    runwayHeatmapUserCellPx,
    setRunwayHeatmapCellPx,
    runwayCellGapPx,
    setRunwayCellGapPx,
    runwayHeatmapCellRadiusPx,
    setRunwayHeatmapCellRadiusPx,
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
        ref={runwayMainContentCaptureRef}
        key={`${viewMode}-${country}`}
        className={cn(
          'mx-auto w-full max-w-full bg-transparent px-4 pb-3 pt-3 sm:px-5 sm:pb-4 sm:pt-3.5',
          runwayStackViewportFill && 'flex min-h-0 min-w-0 flex-1 flex-col'
        )}
      >
        <div className="mb-3 flex flex-col gap-3 sm:mb-4">
          <div className="flex min-w-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 flex-row flex-wrap items-center justify-center gap-2.5 min-[480px]:justify-start">
              {!compareAllMarkets ? (
                <MarketCircleFlag marketId={country} size={26} className="shrink-0" />
              ) : null}
              <h2 className="min-w-0 text-center text-lg font-bold leading-snug tracking-tight text-foreground min-[480px]:text-left sm:text-xl">
                {runwayTitleWithMarket}
              </h2>
            </div>
            {runwayViewToolbarEl ? (
              <div className="flex w-full min-w-0 shrink-0 justify-end min-[480px]:w-auto">
                {runwayViewToolbarEl}
              </div>
            ) : null}
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
              </motion.div>
            ) : calendarLayout ? (
              <motion.div
                key={`grid-${country}-${compareAllMarkets ? 'compare' : 'single'}-${
                  showIso3dSingleMarket || showCompareIsoCityBlock ? '3d' : 'flat'
                }-${singleMarketMultiLens ? 'multilens' : '1l'}-${useSvgHeatmap ? 'svg' : 'html'}-${
                  calendarLayout.layoutKind === 'contribution_strip' ? 'contrib' : 'cal'
                }`}
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
                  contentHeight={calendarLayout.contentHeight}
                  placedCells={calendarLayout.placedCells}
                  layoutKind={calendarLayout.layoutKind}
                  contributionMeta={calendarLayout.contributionMeta}
                  contributionColumnContentWidth={calendarLayout.contributionColumnContentWidth}
                  contributionStripCompactHeight={calendarLayout.contributionStripCompactHeight}
                  contributionStripLayerHeight={calendarLayout.contributionStripLayerHeight}
                  cellPx={cellPx}
                  gap={gap}
                  heatmapCellRadiusPx={runwayHeatmapCellRadiusPx}
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
                  activityLedgersByMarket={activityLedgersByMarket}
                  heatmap3d={showIso3dSingleMarket}
                  runway3dHeatmap={showCompareIsoCityBlock}
                  rowTowerPx={runway3dRowTowerPx}
                  runwaySvgHeatmap={useSvgHeatmap}
                  makeShowTip={makeShowTip}
                  heatmapInteractionRef={heatmapInteractionRef}
                  outerRef={outerRef}
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
                  isoGrowResetKey={isoGrowResetKey}
                  singleMarketMultiLens={singleMarketMultiLens}
                  heatmapOptsForMarketLens={heatmapOptsForMarketLens}
                  landingMinimalChrome={landingMinimalChrome}
                  landingTechSparklineSweep={landingTechSparklineSweep}
                  landingTechSparklineTightFill={landingTechSparklineTightFill}
                  landingStaggerCellPulse={landingMinimalChrome && !reduceMotion}
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
  runwayCellGapPx: number;
  setRunwayCellGapPx: Dispatch<SetStateAction<number>>;
  runwayHeatmapCellRadiusPx: number;
  setRunwayHeatmapCellRadiusPx: Dispatch<SetStateAction<number>>;
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
  runwayCellGapPx,
  setRunwayCellGapPx,
  runwayHeatmapCellRadiusPx,
  setRunwayHeatmapCellRadiusPx,
  calendarLayoutPresent,
  pngExporting,
  handleDownloadPng,
  layoutDatesSortedEmpty,
}: RunwayViewActionsToolbarProps) {
  return (
    <div
      className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-0.5"
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
      <RunwayHeatmapCellStylePopover
        disabled={countrySwitchLoading}
        iconButtonClassName={RUNWAY_TOOLBAR_ICON_BTN}
        cellPx={runwayCellPx}
        setCellPx={setRunwayCellPx}
        cellPxMin={RUNWAY_CELL_PX_MIN}
        cellPxMax={RUNWAY_CELL_PX_MAX}
        cellPxStep={RUNWAY_CELL_PX_STEP}
        snapCellPx={snapRunwayCellPx}
        gapPx={runwayCellGapPx}
        setGapPx={setRunwayCellGapPx}
        gapPxMin={RUNWAY_CELL_GAP_ADJ_MIN}
        gapPxMax={RUNWAY_CELL_GAP_ADJ_MAX}
        radiusPx={runwayHeatmapCellRadiusPx}
        setRadiusPx={setRunwayHeatmapCellRadiusPx}
        radiusPxMax={RUNWAY_HEATMAP_CELL_RADIUS_MAX}
        defaultCellPx={RUNWAY_HEATMAP_LAYOUT_DEFAULTS.cellPx}
        defaultGapPx={RUNWAY_HEATMAP_LAYOUT_DEFAULTS.gapPx}
        defaultRadiusPx={RUNWAY_HEATMAP_LAYOUT_DEFAULTS.radiusPx}
      />
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
  contentHeight: number;
  placedCells: PlacedRunwayCell[];
  layoutKind?: 'default' | 'contribution_strip';
  contributionMeta?: ContributionStripLayoutMeta;
  contributionColumnContentWidth?: number;
  contributionStripCompactHeight?: number;
  contributionStripLayerHeight?: number;
  cellPx: number;
  gap: number;
  heatmapCellRadiusPx: number;
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
  /** Compare-all: per-market ledgers for column heatmaps (BAU + row exclusions). */
  activityLedgersByMarket: Map<string, MarketActivityLedger> | null;
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
  /** 3D iso views: restarts column grow-in when this key changes. */
  isoGrowResetKey: string;
  landingMinimalChrome: boolean;
  landingTechSparklineSweep: boolean;
  landingTechSparklineTightFill: boolean;
  /** Landing: per-cell heatmap pulse + smooth fill (no vertical clip flicker). */
  landingStaggerCellPulse: boolean;
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
  contentHeight,
  placedCells,
  layoutKind,
  contributionMeta,
  contributionColumnContentWidth,
  contributionStripCompactHeight,
  contributionStripLayerHeight,
  cellPx,
  gap,
  heatmapCellRadiusPx,
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
  activityLedgersByMarket,
  makeShowTip,
  heatmapInteractionRef,
  outerRef,
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
  isoGrowResetKey,
  singleMarketMultiLens,
  heatmapOptsForMarketLens,
  landingMinimalChrome,
  landingTechSparklineSweep,
  landingTechSparklineTightFill,
  landingStaggerCellPulse,
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
  const restrictRunwayLedgerToDayContributors = useAtcStore((s) => s.restrictRunwayLedgerToDayContributors);

  /** Landing hero: ledger checkboxes are decorative; heatmap always uses every row + BAU on. */
  const ledgerExcludedForHeatmap = landingMinimalChrome
    ? LANDING_LEDGER_NO_EXCLUDED_IDS
    : runwayLedgerExcludedEntryIds;

  const runwayLedgerActiveEntryIds = useMemo(
    () => (activityLedger ? activeLedgerEntryIds(activityLedger, ledgerExcludedForHeatmap) : []),
    [activityLedger, ledgerExcludedForHeatmap],
  );

  /**
   * BAU baseline (store): days with no included ledger row on this lens still count one stratum so cells
   * show full model heat. With BAU off and no row touching a day, attribution paints neutral (empty grid).
   */
  const ledgerImplicitBaselineFootprintForHeatmap = landingMinimalChrome
    ? true
    : runwayLedgerImplicitBaselineFootprint;

  /** Match empty heatmap: no named rows and BAU baseline off → hide modeled tech trace above the strip. */
  const techStripModelTraceSuppressed = useMemo(
    () =>
      Boolean(
        activityLedger &&
          runwayLedgerActiveEntryIds.length === 0 &&
          !ledgerImplicitBaselineFootprintForHeatmap
      ),
    [activityLedger, runwayLedgerActiveEntryIds.length, ledgerImplicitBaselineFootprintForHeatmap],
  );

  /**
   * When a ledger exists, drive cells through attribution: no included overlap + BAU off → neutral; + BAU on →
   * baseline stratum (full model fill). Compare columns use `ledgerAttrForCompareMarket` instead.
   */
  const ledgerOverlapByLens = useMemo(() => {
    if (!activityLedger) return null;
    return {
      combined: buildLedgerLensOverlapMap(activityLedger, runwayLedgerActiveEntryIds, 'combined'),
      in_store: buildLedgerLensOverlapMap(activityLedger, runwayLedgerActiveEntryIds, 'in_store'),
      market_risk: buildLedgerLensOverlapMap(activityLedger, runwayLedgerActiveEntryIds, 'market_risk'),
    };
  }, [activityLedger, runwayLedgerActiveEntryIds]);

  const ledgerAttrForLens = useCallback(
    (lens: ViewModeId): { overlapByDay: Map<string, number>; lens: Exclude<ViewModeId, 'code'> } | null => {
      if (!ledgerOverlapByLens || lens === 'code') return null;
      const overlapByDay = ledgerOverlapByLens[lens as keyof typeof ledgerOverlapByLens];
      return { overlapByDay, lens: lens as Exclude<ViewModeId, 'code'> };
    },
    [ledgerOverlapByLens],
  );

  /** Compare strip: footprint map for `market` at the current `viewMode` lens (same rules as single-market). */
  const ledgerAttrForCompareMarket = useCallback(
    (market: string): { overlapByDay: Map<string, number>; lens: Exclude<ViewModeId, 'code'> } | null => {
      if (!activityLedgersByMarket || viewMode === 'code') return null;
      const ledger = activityLedgersByMarket.get(market);
      if (!ledger) return null;
      const activeIds = activeLedgerEntryIds(ledger, ledgerExcludedForHeatmap);
      return {
        overlapByDay: buildLedgerLensOverlapMap(ledger, activeIds, viewMode as Exclude<ViewModeId, 'code'>),
        lens: viewMode as Exclude<ViewModeId, 'code'>,
      };
    },
    [activityLedgersByMarket, viewMode, ledgerExcludedForHeatmap],
  );

  const singleMarketSelectedDayYmd =
    !compareAllMarkets && tip && 'payload' in tip ? tip.payload.dateStr : null;

  const dayContributionPin: RunwayLedgerDayContributionPin | null =
    !compareAllMarkets &&
    tip &&
    'payload' in tip &&
    tip.payload.market === country &&
    tip.payload.viewMode !== 'code'
      ? { dayYmd: tip.payload.dateStr, riskRow: tip.payload.row, tuning: riskTuning }
      : null;

  /** Triple-lens: left label rail is a fixed 7 cell-row span (not the full strip / axis row height). */
  const tripleLensRailIdealPx = tripleLensStackRailHeightPx(cellPx, gap);

  const heatmapLegendEl = (
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
  );

  /** Legend sits beside the contribution strip(s); avoid duplicating it in the row below. */
  const heatmapLegendBesideContributionStrip =
    Boolean(contributionMeta) &&
    (singleMarketMultiLens || (layoutKind === 'contribution_strip' && !singleMarketMultiLens));

  /** Align side summary / ledger with the contribution SVG column (same x + width as the strip). */
  const sideSummaryRunwayTrackStyle = useMemo((): CSSProperties => {
    const stripW = contributionColumnContentWidth ?? contentWidth;
    if (singleMarketMultiLens) {
      return {
        marginLeft: RUNWAY_TRIPLE_LENS_CONTRIBUTION_SVG_LEADING_OFFSET_PX,
        width: stripW,
        maxWidth: stripW,
      };
    }
    if (layoutKind === 'contribution_strip' && contributionMeta) {
      return {
        marginLeft: RUNWAY_CONTRIBUTION_STRIP_FLEX_ROW_PAD_LEFT_PX,
        width: stripW,
        maxWidth: stripW,
      };
    }
    return { maxWidth: contentWidth };
  }, [
    singleMarketMultiLens,
    layoutKind,
    contributionMeta,
    contributionColumnContentWidth,
    contentWidth,
  ]);

  return (
    <div
      className={cn(
        'flex w-full min-w-0 max-w-full justify-start pl-0.5 sm:pl-1',
        landingCompareStackFill && 'min-h-0 min-w-0 flex-1 flex-col'
      )}
    >
      <div
        className={cn(
          'flex w-full min-w-0 max-w-full flex-col items-stretch',
          heatmap3d || compareAllMarkets ? 'lg:min-h-0' : ''
        )}
      >
      <div
        ref={heatmapInteractionRef as Ref<HTMLDivElement>}
        className={cn(
          'flex min-w-0 w-full flex-1 flex-col bg-transparent p-0 shadow-none',
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
              <div className="flex w-full shrink-0 justify-start px-0.5 pt-2">{heatmapLegendEl}</div>
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
                          cellRadiusPx={heatmapCellRadiusPx}
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
                          ledgerAttribution={ledgerAttrForCompareMarket(m)}
                          ledgerImplicitBaselineFootprint={ledgerImplicitBaselineFootprintForHeatmap}
                          deploymentRiskBlackouts={
                            viewMode === 'market_risk' ? cfg?.deployment_risk_blackouts ?? null : null
                          }
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
                          ledgerAttribution={ledgerAttrForCompareMarket(m)}
                          ledgerImplicitBaselineFootprint={ledgerImplicitBaselineFootprintForHeatmap}
                          deploymentRiskBlackouts={
                            viewMode === 'market_risk' ? cfg?.deployment_risk_blackouts ?? null : null
                          }
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex w-full shrink-0 justify-start px-0.5 pt-2">{heatmapLegendEl}</div>
          </div>
          )
        ) : (
          (() => {
            const singleMarketHeatmapColumn = (
              <div
                className={cn(
                  'flex min-w-0 w-full flex-col',
                  // Side summary stacks under the heatmap (full-width ledger); no side-by-side flex row on lg.
                  useSideSummary ? 'shrink-0' : 'flex-1',
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
                    {singleMarketMultiLens && contributionMeta ? (
                      <div
                        className="flex w-max max-w-none flex-row items-stretch justify-start px-0.5"
                        style={{ gap: CALENDAR_QUARTER_GRID_COL_GAP_PX }}
                      >
                        <div
                          className="shrink-0 self-stretch bg-transparent"
                          style={{ width: CALENDAR_QUARTER_GUTTER_W }}
                          aria-hidden
                        />
                        <div
                          className="flex min-w-0 max-w-none shrink-0 flex-col items-stretch"
                          style={{ gap: SINGLE_MARKET_TRIPLE_LENS_VERTICAL_GAP_PX }}
                        >
                          {SINGLE_MARKET_STACK_LENS_IDS.map((lensMode, rowIdx) => {
                            const stripW = contributionColumnContentWidth ?? contentWidth;
                            const isBottomRow = rowIdx === SINGLE_MARKET_STACK_LENS_IDS.length - 1;
                            const stripH = isBottomRow
                              ? contributionStripLayerHeight ?? contentHeight
                              : contributionStripCompactHeight ?? contentHeight;
                            const railH = Math.min(tripleLensRailIdealPx, stripH);
                            const stripRow = (
                              <div
                                className="flex min-h-0 shrink-0 flex-row items-start gap-1.5"
                                style={{ height: stripH }}
                              >
                                <TripleLensStackRailCaption lensMode={lensMode} railH={railH} />
                                <div
                                  className="relative z-0 min-w-0 shrink-0 self-stretch overflow-visible bg-transparent"
                                  style={{ width: stripW, height: stripH, minHeight: stripH, maxHeight: stripH }}
                                >
                                  <RunwayContributionStripSvg
                                    marketKey={`${country}-${lensMode}`}
                                    placedCells={placedCells}
                                    contributionMeta={contributionMeta}
                                    cellPx={cellPx}
                                    gap={gap}
                                    cellRadiusPx={heatmapCellRadiusPx}
                                    width={stripW}
                                    height={stripH}
                                    riskByDate={singleRiskByDate!}
                                    heatmapOpts={heatmapOptsForMarketLens(country, lensMode)}
                                    riskTuning={riskTuning}
                                    viewMode={lensMode}
                                    todayYmd={todayYmd}
                                    dimPastDays={dimPastDays}
                                    selectedDayYmd={singleMarketSelectedDayYmd}
                                    openDayDetailsFromCell={(anchor, ds, wc) =>
                                      makeShowTip(country, singleRiskByDate!, marketConfig)(anchor, ds, wc, {
                                        detailViewMode: lensMode,
                                      })
                                    }
                                    emergeResetKey={`${isoGrowResetKey}-${lensMode}`}
                                    emergeStaggerMs={
                                      landingMinimalChrome
                                        ? rowIdx * LANDING_TRIPLE_LENS_HEATMAP_EMERGE_STAGGER_MS
                                        : 0
                                    }
                                    showAxisLabels={isBottomRow}
                                    ledgerAttribution={ledgerAttrForLens(lensMode)}
                                    ledgerImplicitBaselineFootprint={ledgerImplicitBaselineFootprintForHeatmap}
                                    deploymentRiskBlackouts={
                                      lensMode === 'market_risk'
                                        ? marketConfig?.deployment_risk_blackouts ?? null
                                        : null
                                    }
                                    landingStaggerCellPulse={landingStaggerCellPulse}
                                  />
                                </div>
                              </div>
                            );
                            return (
                              <div
                                key={lensMode}
                                className={cn(
                                  'flex min-h-0 shrink-0 flex-col',
                                  rowIdx === 0 ? 'gap-1' : '',
                                )}
                              >
                                {rowIdx === 0 ? (
                                  <div className="flex min-h-0 flex-row items-end gap-1.5">
                                    <div
                                      className="shrink-0"
                                      style={{ width: SINGLE_MARKET_TRIPLE_LENS_LEFT_RAIL_W_PX }}
                                      aria-hidden
                                    />
                                    <RunwayTechCapacityDemandSparkline
                                      contributionMeta={contributionMeta}
                                      cellPx={cellPx}
                                      gap={gap}
                                      riskByDate={singleRiskByDate!}
                                      width={stripW}
                                      selectedDayYmd={singleMarketSelectedDayYmd}
                                      className="min-w-0"
                                      modelTraceSuppressed={techStripModelTraceSuppressed}
                                      landingMarketingSweepReveal={
                                        landingMinimalChrome && landingTechSparklineSweep && !reduceMotion
                                      }
                                      landingMarketingTightCapacityFill={
                                        landingMinimalChrome && landingTechSparklineTightFill
                                      }
                                    />
                                  </div>
                                ) : null}
                                {stripRow}
                              </div>
                            );
                          })}
                        </div>
                        <div className="relative z-[4] ml-[25px] flex shrink-0 self-end">
                          {heatmapLegendEl}
                        </div>
                      </div>
                    ) : layoutKind === 'contribution_strip' && contributionMeta ? (
                      <div
                        className="flex w-max max-w-none flex-row items-stretch justify-start px-0.5"
                        style={{ gap: CALENDAR_QUARTER_GRID_COL_GAP_PX }}
                      >
                        <RunwayContributionStripSvg
                          marketKey={country}
                          placedCells={placedCells}
                          contributionMeta={contributionMeta}
                          cellPx={cellPx}
                          gap={gap}
                          cellRadiusPx={heatmapCellRadiusPx}
                          width={contentWidth}
                          height={contentHeight}
                          riskByDate={singleRiskByDate!}
                          heatmapOpts={heatmapOptsForMarket(country)}
                          riskTuning={riskTuning}
                          viewMode={viewMode}
                          todayYmd={todayYmd}
                          dimPastDays={dimPastDays}
                          selectedDayYmd={singleMarketSelectedDayYmd}
                          openDayDetailsFromCell={makeShowTip(country, singleRiskByDate!, marketConfig)}
                          emergeResetKey={isoGrowResetKey}
                          ledgerAttribution={ledgerAttrForLens(viewMode)}
                          ledgerImplicitBaselineFootprint={ledgerImplicitBaselineFootprintForHeatmap}
                          deploymentRiskBlackouts={
                            viewMode === 'market_risk'
                              ? marketConfig?.deployment_risk_blackouts ?? null
                              : null
                          }
                          landingStaggerCellPulse={landingStaggerCellPulse}
                        />
                        <div className="relative z-[4] ml-[25px] flex shrink-0 self-end">
                          {heatmapLegendEl}
                        </div>
                      </div>
                    ) : runwaySvgHeatmap ? (
                      <RunwayQuarterGridSvg
                        marketKey={country}
                        sections={sections}
                        cellPx={cellPx}
                        gap={gap}
                        cellRadiusPx={heatmapCellRadiusPx}
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
                        ledgerAttribution={ledgerAttrForLens(viewMode)}
                        ledgerImplicitBaselineFootprint={ledgerImplicitBaselineFootprintForHeatmap}
                        deploymentRiskBlackouts={
                          viewMode === 'market_risk'
                            ? marketConfig?.deployment_risk_blackouts ?? null
                            : null
                        }
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
                        ledgerImplicitBaselineFootprint={ledgerImplicitBaselineFootprintForHeatmap}
                        deploymentRiskBlackouts={
                          viewMode === 'market_risk'
                            ? marketConfig?.deployment_risk_blackouts ?? null
                            : null
                        }
                      />
                    )}
                    {!heatmapLegendBesideContributionStrip ? (
                      <div className="relative z-[4] mt-2 flex w-full shrink-0 justify-start self-start">
                        {heatmapLegendEl}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );

            if (!useSideSummary) return singleMarketHeatmapColumn;

            return (
              <>
                <div className="flex w-full min-w-0 min-h-0 flex-col gap-4 lg:gap-6">
                  {singleMarketHeatmapColumn}
                  <div
                    ref={summaryPanelRef as LegacyRef<HTMLDivElement>}
                    className="mt-4 flex w-full min-w-0 min-h-0 shrink-0 flex-col gap-6 lg:mt-0 lg:px-3"
                  >
                    {/* Same `lg:px-3` as the heatmap `singleMarketFitRef` wrapper; strip-aligned width + inset. */}
                    <div
                      className="flex w-full min-w-0 max-w-full flex-col gap-6"
                      style={sideSummaryRunwayTrackStyle}
                    >
                      <RunwayDaySummaryPanel
                        tip={tip}
                        onClear={onClearDaySummary}
                        onScopeHeatmapToThisDay={
                          activityLedger &&
                          tip &&
                          'payload' in tip &&
                          tip.payload.viewMode !== 'code'
                            ? () => restrictRunwayLedgerToDayContributors(activityLedger, tip.payload.dateStr)
                            : undefined
                        }
                      />
                      {activityLedger ? (
                        <>
                          {!singleMarketMultiLens ? (
                            <div className="w-full min-w-0 shrink-0 border-b border-border/25 pb-6 dark:border-border/30 lg:pb-7">
                              <RunwaySummaryLineDiagrams
                                viewMode={viewMode}
                                className="w-full min-w-0 shrink-0 border-0 bg-transparent px-0 py-0 pt-0 shadow-none"
                                selectedDayYmd={singleMarketSelectedDayYmd}
                                activityLedger={activityLedger}
                                sparklineLayout="ledgerStrip"
                              />
                            </div>
                          ) : null}
                          <RunwayActivityLedgerTable
                            ledger={activityLedger}
                            className="w-full min-w-0"
                            dayContributionPin={dayContributionPin}
                            staticLedgerPreview={landingMinimalChrome}
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            );
          })()
        )}
      </div>
      </div>
    </div>
  );
}
