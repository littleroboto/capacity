import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import type { ReactNode, Ref } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ViewModeId } from '@/lib/constants';
import { parseDate } from '@/engine/calendar';
import type { RiskRow } from '@/engine/riskModel';
import type { RiskModelTuning } from '@/engine/riskModelTuning';
import {
  heatmapColorForViewMode,
  HEATMAP_RUNWAY_PAD_FILL,
  type HeatmapColorOpts,
  type RunwayNormRange,
} from '@/lib/riskHeatmapColors';
import { HeatmapLegend } from '@/components/HeatmapLegend';
import { buildRunwayTooltipPayload } from '@/lib/runwayTooltipBreakdown';
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
  buildQuarterGridRunwayLayout,
  buildVerticalMonthsRunwayLayout,
  calendarQuarterTitle,
  quarterCodeLabel,
  type CalendarMonthBlock,
  type PlacedRunwayCell,
  type QuarterLetters,
  type VerticalYearSection,
} from '@/lib/calendarQuarterLayout';
import { isRunwayAllMarkets } from '@/lib/markets';
import {
  RUNWAY_CELL_GAP_PX,
  WEEKDAY_HEADERS,
  formatDateYmd,
  runwayDayStripWidth,
  RUNWAY_DAY_COLUMNS,
} from '@/lib/weekRunway';
import { cn } from '@/lib/utils';
import { RunwayCellTooltip, type RunwayTipState } from '@/components/RunwayCellTooltip';
import { useAtcStore } from '@/store/useAtcStore';
import { SlotOverlay } from '@/components/SlotOverlay';
import type { MarketConfig } from '@/engine/types';
import { downloadRunwayHeatmapPng } from '@/lib/runwayPngExport';
import { percentileNormRange } from '@/lib/heatmapNormRange';
import { inStoreHeatmapMetric } from '@/lib/runwayViewMetrics';
import { Download, Loader2 } from 'lucide-react';

/** Default cell size (px) for runway heatmaps (single-market and LIOM compare). */
export const CELL_PX = 20;

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

const RUNWAY_DIM_PAST_DAYS_STORAGE_KEY = 'capacity:runway-dim-past-days';

/** Compare-all column header: market code. */
function RunwayMarketCodeSticker({ code }: { code: string }) {
  return (
    <span
      title={`Market ${code}`}
      className="shrink-0 text-sm font-bold tabular-nums tracking-tight text-foreground"
    >
      {code}
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
      <div className="inline-flex max-w-full min-w-0 flex-col-reverse items-stretch gap-6 lg:flex-row lg:items-start lg:gap-0">
      <div
        className={cn(
          'flex w-[min(100%,14rem)] shrink-0 flex-col gap-3 self-center lg:border-r lg:border-border/50 lg:pr-6 lg:pl-2 lg:self-start',
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
          className="h-36 w-full max-w-[12rem] rounded-md bg-muted/45"
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

function fillMetricLabelForView(mode: ViewModeId): string {
  switch (mode) {
    case 'combined':
      return 'Technology (blended pressure score)';
    case 'in_store':
      return 'Business blend (trading · marketing · holidays — weights from pressure model)';
    default:
      return 'Metric';
  }
}

function cellMetric(row: RiskRow | undefined, mode: ViewModeId, tuning: RiskModelTuning): number {
  if (!row) return 0;
  switch (mode) {
    case 'combined':
      return row.risk_score;
    case 'in_store':
      return inStoreHeatmapMetric(row, tuning);
    default:
      return row.risk_score;
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
  /** Remounts the colour layer so the grey→fill sweep replays when the view mode changes. */
  viewMode: ViewModeId;
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
  viewMode,
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
      </HeatCellDimWrap>
    );
  }

  if (!enableColorSweep && (shimmer || discoMode)) {
    return (
      <HeatCellDimWrap pastDimmed={pastDimmed}>
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
      </HeatCellDimWrap>
    );
  }

  return (
    <HeatCellDimWrap pastDimmed={pastDimmed}>
    <div className="relative shrink-0" style={{ width: CELL_PX, height: CELL_PX }}>
      <div className="pointer-events-none absolute inset-0 rounded-[3px] bg-muted" aria-hidden />
      <motion.div
        key={viewMode}
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
  viewMode,
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
      </HeatCellDimWrap>
    );
  }

  if (!enableColorSweep && (shimmer || discoMode)) {
    return (
      <HeatCellDimWrap pastDimmed={pastDimmed}>
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
      </HeatCellDimWrap>
    );
  }

  return (
    <HeatCellDimWrap pastDimmed={pastDimmed}>
    <div className="relative shrink-0" style={{ width: cellPx, height: cellPx }}>
      <div className="pointer-events-none absolute inset-0 rounded-[2px] bg-muted" aria-hidden />
      <motion.div
        key={viewMode}
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
  norm: RunwayNormRange | undefined;
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
  openDayDetailsFromCell: (anchor: RunwayTipAnchor, dateStr: string | null, weekdayCol: number) => void;
  layout: RunwayHeatmapLayout;
  /** When `vertical_strip`, hide left quarter gutter (compare-all uses a shared gutter column). */
  showQuarterGutter?: boolean;
  /** Compare-all: month abbrev beside each mini-grid; one shared Mo–Su row (first model month only). */
  compareStripLabels?: boolean;
  firstCalendarMonthKey?: string | null;
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
  norm,
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
  norm: RunwayNormRange | undefined;
  heatmapOpts: HeatmapColorOpts;
  riskTuning: RiskModelTuning;
  viewMode: ViewModeId;
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

  const weeksGrid = (
    <div data-runway-weeks-grid data-no-drag className="flex flex-col" style={{ gap }}>
      {mo.weeks.map((week, wi) => (
        <div key={wi} className="flex shrink-0" style={{ gap }}>
          {week.map((cell, di) => {
            if (cell === false) {
              return (
                <div
                  key={`${mo.key}-${wi}-${di}`}
                  className="shrink-0"
                  style={{ width: cellPx, height: cellPx }}
                  aria-hidden
                />
              );
            }
            const dateStr = cell;
            const row = dateStr ? riskByDate.get(dateStr) : undefined;
            const fill = !dateStr
              ? HEATMAP_RUNWAY_PAD_FILL
              : heatmapColorForViewMode(
                  viewMode,
                  row ? cellMetric(row, viewMode, riskTuning) : undefined,
                  norm,
                  heatmapOpts
                );
            const shimmerBase = ((secYear % 100) * 500 + mo.monthIndex * 40 + wi * 7 + di) % 900;
            const sweepDelaySec = sweepDelayForCell(sweepMarketOffsetSec, si, sweepMi, wi, di);
            const pastDimmed = dimPastDays && typeof dateStr === 'string' && dateStr < todayYmd;
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
                viewMode={viewMode}
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
                viewMode={viewMode}
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
  norm,
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
}: RunwayVerticalHeatmapBodyProps) {
  const compactStripLabels = compareStripLabels;
  const showWeekdayRowForMonth = (mo: CalendarMonthBlock) =>
    !compactStripLabels || mo.key === firstCalendarMonthKey;

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
                        norm={norm}
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
                          norm={norm}
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
  const configs = useAtcStore((s) => s.configs);
  const compareAllMarkets = isRunwayAllMarkets(country);
  const riskTuning = useAtcStore((s) => s.riskTuning);
  const riskHeatmapGamma = useAtcStore((s) => s.riskHeatmapGamma);
  const riskHeatmapCurve = useAtcStore((s) => s.riskHeatmapCurve);
  const reduceMotion = useReducedMotion();
  const shimmer = !reduceMotion;
  const theme = useAtcStore((s) => s.theme);
  const discoModePref = useAtcStore((s) => s.discoMode);
  const discoMode = discoModePref && !reduceMotion && theme === 'dark';

  const [displayedCountry, setDisplayedCountry] = useState(country);
  const [countrySwitchLoading, setCountrySwitchLoading] = useState(false);

  const scrollTopRef = useRef(0);
  const [tip, setTip] = useState<RunwayTipState | null>(null);
  const tipRef = useRef<RunwayTipState | null>(null);
  tipRef.current = tip;
  const heatmapInteractionRef = useRef<HTMLDivElement>(null);
  const tooltipRootRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const heatmapCaptureRef = useRef<HTMLDivElement>(null);
  const [pngExporting, setPngExporting] = useState(false);
  const [dimPastDays, setDimPastDays] = useState(() => {
    try {
      return (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(RUNWAY_DIM_PAST_DAYS_STORAGE_KEY) === '1'
      );
    } catch {
      return false;
    }
  });

  const cellPx = CELL_PX;

  const marketsOrdered = useMemo(() => {
    const fromCfg = configs.map((c) => c.market);
    if (fromCfg.length) return fromCfg;
    return [...new Set(riskSurface.map((r) => r.market))].sort();
  }, [configs, riskSurface]);

  const singleMarketId = compareAllMarkets ? '' : country;
  const marketConfig = useMemo(
    () => (singleMarketId ? configs.find((c) => c.market === singleMarketId) : undefined),
    [configs, singleMarketId]
  );

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

  useEffect(() => {
    try {
      localStorage.setItem(RUNWAY_DIM_PAST_DAYS_STORAGE_KEY, dimPastDays ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [dimPastDays]);

  const dismissTip = useCallback(() => {
    setTip(null);
  }, []);

  useEffect(() => {
    if (!tip) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissTip();
    };
    const onPointerDownCapture = (e: PointerEvent) => {
      const n = e.target as Node | null;
      if (!n) return;
      if (heatmapInteractionRef.current?.contains(n)) return;
      if (tooltipRootRef.current?.contains(n)) return;
      dismissTip();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
    };
  }, [tip, dismissTip]);

  const allDatesSorted = useMemo(() => [...new Set(riskSurface.map((r) => r.date))].sort(), [riskSurface]);

  const { calendarLayout, normInStore } = useMemo(() => {
    const calendarLayout = compareAllMarkets
      ? buildVerticalMonthsRunwayLayout(allDatesSorted, cellPx)
      : buildQuarterGridRunwayLayout(allDatesSorted, cellPx);
    let normInStore: RunwayNormRange | undefined;
    if (riskSurface.length) {
      const inStore = riskSurface.map((r) => inStoreHeatmapMetric(r, riskTuning));
      normInStore = percentileNormRange(inStore, { minSpan: 0.14, clamp01: true });
    }
    return {
      calendarLayout,
      normInStore,
    };
  }, [allDatesSorted, cellPx, riskSurface, compareAllMarkets, riskTuning]);

  const heatmapOpts: HeatmapColorOpts = { riskHeatmapGamma, riskHeatmapCurve };

  const norm = viewMode === 'in_store' ? normInStore : undefined;

  const makeShowTip = useCallback(
    (market: string, riskByDate: Map<string, RiskRow>, config: MarketConfig | undefined) =>
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
        const payload = buildRunwayTooltipPayload({
          dateStr,
          weekdayShort: wd,
          market,
          viewMode,
          row,
          config,
          tuning: riskTuning,
          fillMetricLabel: fillMetricLabelForView(viewMode),
          fillMetricValue: cellMetric(row, viewMode, riskTuning),
        });
        setTip({ x: clientX, y: clientY, payload });
      },
    [viewMode, riskTuning]
  );

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
        <p className="text-sm font-medium text-foreground">No runway data</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Apply valid multi-market YAML in the editor.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex w-full shrink-0 flex-col items-center overflow-visible bg-transparent">
      <div className="flex w-full max-w-full flex-col items-center bg-transparent">
        <div className="flex w-full max-w-full flex-col items-center bg-transparent">
          <div className="relative w-full max-w-full">
            <div className="absolute left-1 top-0 z-20 flex max-w-[min(100%,calc(100%-3.5rem))] flex-col gap-0.5 py-1 pr-2 text-[11px] font-medium text-muted-foreground">
              <label className="flex cursor-pointer items-center gap-2 rounded-md hover:text-foreground">
                <input
                  type="checkbox"
                  checked={dimPastDays}
                  onChange={(e) => setDimPastDays(e.target.checked)}
                  className="h-3.5 w-3.5 shrink-0 rounded border border-border/80 bg-background text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
                <span className="select-none leading-tight">Dim past days</span>
              </label>
            </div>
            <button
              type="button"
              disabled={!calendarLayout || countrySwitchLoading || pngExporting || !riskSurface.length}
              onClick={() => void handleDownloadPng()}
              title={pngExporting ? 'Exporting…' : 'Download runway as PNG'}
              aria-label={pngExporting ? 'Exporting runway image' : 'Download runway heatmap as PNG'}
              className={cn(
                'absolute right-1 top-0 z-20 flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-card/95 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors',
                'hover:border-border hover:bg-muted/90 hover:text-foreground',
                'disabled:pointer-events-none disabled:opacity-35',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              )}
            >
              {pngExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/80" aria-hidden />
              ) : (
                <Download className="h-3.5 w-3.5 opacity-90" aria-hidden />
              )}
            </button>

            <AnimatePresence mode="wait">
            {countrySwitchLoading ? (
              <motion.div
                key={`sk-${country}`}
                className="w-full pt-8"
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
                key={`grid-${country}-${compareAllMarkets ? 'compare' : 'single'}`}
                className="w-full pt-8"
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                transition={{ duration: reduceMotion ? 0.1 : 0.28, ease: motionEase }}
              >
                <RunwayGridBody
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
                  norm={norm}
                  heatmapOpts={heatmapOpts}
                  riskTuning={riskTuning}
                  viewMode={viewMode}
                  todayYmd={todayYmd}
                  dimPastDays={dimPastDays}
                  shimmer={shimmer}
                  discoMode={discoMode}
                  country={country}
                  marketConfig={marketConfig}
                  makeShowTip={makeShowTip}
                  heatmapInteractionRef={heatmapInteractionRef}
                  outerRef={outerRef}
                  heatmapCaptureRef={heatmapCaptureRef}
                  scrollTopRef={scrollTopRef}
                  onSlotSelection={onSlotSelection}
                  reduceMotion={!!reduceMotion}
                />
              </motion.div>
            ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <RunwayCellTooltip
        tip={tip}
        reducedMotion={!!reduceMotion}
        onDismiss={dismissTip}
        rootRef={tooltipRootRef}
      />
    </div>
  );
}

type RunwayGridBodyProps = {
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
  norm: RunwayNormRange | undefined;
  heatmapOpts: HeatmapColorOpts;
  riskTuning: RiskModelTuning;
  viewMode: ViewModeId;
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
  reduceMotion: boolean;
};

function RunwayGridBody({
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
  norm,
  heatmapOpts,
  riskTuning,
  viewMode,
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
  reduceMotion,
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

  return (
    <div className="flex w-full max-w-full justify-center">
      <div className="inline-flex max-w-full min-w-0 flex-col-reverse items-stretch gap-6 lg:flex-row lg:items-start lg:gap-0">
      <div
        className={cn(
          'flex shrink-0 items-start justify-start self-center lg:border-r lg:border-border/50 lg:pr-6 lg:pl-2 lg:self-start',
          compareAllMarkets ? 'pt-1' : 'pt-1 lg:pt-[var(--runway-year-strip)]'
        )}
        style={
          !compareAllMarkets
            ? ({ ['--runway-year-strip' as string]: `${CALENDAR_YEAR_STRIP_TOTAL_PX}px` } as React.CSSProperties)
            : undefined
        }
      >
        <HeatmapLegend
          className="w-fit min-w-0 max-w-[min(100%,14rem)] text-left"
          viewMode={viewMode}
          cellSizePx={cellPx}
          cellGapPx={gap}
        />
      </div>
      <div
        ref={heatmapInteractionRef as Ref<HTMLDivElement>}
        className="flex min-w-0 flex-1 flex-col justify-center bg-transparent p-0 shadow-none"
      >
        {compareAllMarkets ? (
          <div className="w-full overflow-x-auto overflow-y-visible pb-1">
            <div
              ref={heatmapCaptureRef}
              className="flex w-max max-w-none flex-row items-start justify-start px-0.5"
              style={{ gap: CALENDAR_QUARTER_GRID_COL_GAP_PX }}
            >
              <div className="flex shrink-0 flex-col items-end">
                <div className="invisible mb-1.5 flex h-[32px] items-center justify-center" aria-hidden>
                  <RunwayMarketCodeSticker code="UK" />
                </div>
                <div className="relative shrink-0 overflow-visible bg-transparent" style={{ width: CALENDAR_QUARTER_GUTTER_W }}>
                  <RunwayCompareQuarterGutter sections={sections} cellPx={cellPx} gap={gap} />
                </div>
              </div>
              {marketsOrdered.map((m, colIdx) => {
                const map = riskByDateForMarket(riskSurface, m);
                const cfg = configs.find((c) => c.market === m);
                return (
                  <div key={m} className="flex shrink-0 flex-col items-center">
                    <div className="mb-1.5 flex h-[32px] items-center justify-center">
                      <RunwayMarketCodeSticker code={m} />
                    </div>
                    <div
                      className="relative shrink-0 overflow-visible bg-transparent"
                      style={{
                        width:
                          monthStripW +
                          CALENDAR_MONTH_SIDE_LABEL_W +
                          CALENDAR_MONTH_SIDE_LABEL_GAP_PX,
                      }}
                    >
                      <RunwayVerticalHeatmapBody
                        sections={sections}
                        cellPx={cellPx}
                        gap={gap}
                        monthStripW={monthStripW}
                        riskByDate={map}
                        norm={norm}
                        heatmapOpts={heatmapOpts}
                        riskTuning={riskTuning}
                        viewMode={viewMode}
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
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex w-full justify-center overflow-x-auto overflow-y-visible pb-1">
            <div
              ref={(el) => {
                heatmapCaptureRef.current = el;
                (outerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              }}
              className="relative shrink-0 overflow-visible bg-transparent"
              style={{ width: contentWidth }}
            >
              <SlotOverlay
                outerRef={outerRef}
                cellSize={cellPx}
                placedCells={placedCells}
                scrollTopRef={scrollTopRef}
                market={country}
                riskByDate={riskByDateForMarket(riskSurface, country)}
                onSlotSelection={onSlotSelection}
              />
              <RunwayVerticalHeatmapBody
                sections={sections}
                cellPx={cellPx}
                gap={gap}
                monthStripW={monthStripW}
                riskByDate={riskByDateForMarket(riskSurface, country)}
                norm={norm}
                heatmapOpts={heatmapOpts}
                riskTuning={riskTuning}
                viewMode={viewMode}
                todayYmd={todayYmd}
                dimPastDays={dimPastDays}
                shimmer={shimmer}
                discoMode={discoMode}
                enableColorSweep={enableColorSweep}
                postSweep={postSweep}
                sweepMarketOffsetSec={0}
                openDayDetailsFromCell={makeShowTip(country, riskByDateForMarket(riskSurface, country), marketConfig)}
                layout="quarter_grid"
              />
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
