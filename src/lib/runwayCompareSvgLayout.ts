import { parseDate } from '@/engine/calendar';
import {
  CALENDAR_MONTH_HEADER_H,
  CALENDAR_MONTH_SIDE_LABEL_GAP_PX,
  CALENDAR_MONTH_SIDE_LABEL_W,
  CALENDAR_MONTH_STACK_GAP_PX,
  CALENDAR_QUARTER_BLOCK_GAP_PX,
  CALENDAR_QUARTER_GRID_COL_GAP_PX,
  CALENDAR_QUARTER_GRID_ROW_GAP_PX,
  CALENDAR_QUARTER_GUTTER_W,
  CALENDAR_WEEKDAY_HEADER_H,
  CALENDAR_YEAR_HEADER_H,
  CONTRIBUTION_STRIP_AXIS_LABEL_BAND_H,
  CONTRIBUTION_STRIP_AXIS_MONTH_TICK_LEN_PX,
  CONTRIBUTION_STRIP_AXIS_MONTH_TICK_STROKE_PX,
  CONTRIBUTION_STRIP_AXIS_SINGLE_TICK_ROW_H,
  CONTRIBUTION_STRIP_AXIS_TICK_ROW_TOP_INSET_PX,
  CONTRIBUTION_STRIP_AXIS_TIER_GAP_PX,
  CONTRIBUTION_STRIP_GRID_AXIS_GAP_PX,
  CONTRIBUTION_STRIP_TIME_AXIS_STACK_H,
  CONTRIBUTION_STRIP_TOP_PAD,
  CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W,
  QUARTER_LETTERS,
  calendarQuarterTitle,
  quarterCodeLabel,
  type CalendarMonthBlock,
  type ContributionStripLayoutMeta,
  type PlacedRunwayCell,
  type QuarterLetters,
  type RunwayCalendarCellValue,
  type VerticalYearSection,
} from '@/lib/calendarQuarterLayout';
import { RUNWAY_DAY_COLUMNS, WEEKDAY_HEADERS, formatDateYmd } from '@/lib/weekRunway';

/** Same abbreviations as `RunwayMonthMiniGrid` weekday row. */
const WEEKDAY_GRID_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

function monthsInCalendarQuarter(sec: VerticalYearSection, qRow: number): CalendarMonthBlock[] {
  const m0 = qRow * 3;
  return sec.months.filter((m) => m.monthIndex >= m0 && m.monthIndex <= m0 + 2);
}

export type CompareSvgLayoutCell = {
  x: number;
  y: number;
  w: number;
  h: number;
  weekdayCol: number;
  cell: RunwayCalendarCellValue;
};

export type CompareSvgMonthLabel = {
  x: number;
  y: number;
  text: string;
};

export type CompareSvgWeekdayLabel = {
  x: number;
  y: number;
  abbr: string;
  title: string;
};

export type SvgYearLabel = { x: number; y: number; text: string };

export type SvgQuarterLabel = {
  x: number;
  y: number;
  text: string;
  title: string;
  /**
   * Contribution strip only: x bounds (px) for dotted rails flanking the quarter label.
   * Omitted for quarter-grid gutter labels.
   */
  railLeft?: number;
  railRight?: number;
};

/** Horizontal clearance around quarter code for dotted rails (`Q1`, `Q2`, …). */
export const CONTRIBUTION_STRIP_QUARTER_RAIL_LABEL_HALO_PX = 13;
const QUARTER_RAIL_INSET_PX = 3;
/** Dotted rail stops this far from each interior quarter boundary tick (tick sits on the week column centre). */
const QUARTER_RAIL_TICK_PAD_PX = 3;
/** Half-height (px) of interior quarter-boundary ticks on the quarter label row. */
export const CONTRIBUTION_STRIP_QUARTER_RAIL_BOUNDARY_TICK_HALF_H_PX = 4;

/** Contribution-strip axis tick; optional `strokeWidth` for year-strong boundaries. */
export type SvgAxisTick = { x: number; y1: number; y2: number; strokeWidth?: number };

/** Tick grows downward from `yTop` (top-justified in the tick row). */
function axisTickTopJustified(yTop: number, lengthPx: number): { y1: number; y2: number } {
  const len = Math.max(0.5, lengthPx);
  return { y1: yTop, y2: yTop + len };
}

/** Tick grows upward from `yBottom` (bottom-justified in the tick row — mirrored axis above a chart). */
function axisTickBottomJustified(yBottom: number, lengthPx: number): { y1: number; y2: number } {
  const len = Math.max(0.5, lengthPx);
  return { y1: yBottom - len, y2: yBottom };
}

function monthBlockHeightGrid(weeksLen: number, stride: number, gap: number): number {
  return CALENDAR_MONTH_HEADER_H + CALENDAR_WEEKDAY_HEADER_H + weeksLen * stride - gap;
}

/**
 * Geometry for one compare-all market column: same traversal as
 * {@link RunwayVerticalHeatmapBody} vertical strip + side month labels (compare strip).
 */
export function layoutCompareMarketColumnSvg(
  sections: VerticalYearSection[],
  cellPx: number,
  gap: number,
  monthStripW: number,
  /** Compare-all: only this month block shows Mo–Su (matches HTML `compareStripLabels`). */
  firstCalendarMonthKey: string | null
): { width: number; height: number; cells: CompareSvgLayoutCell[]; monthLabels: CompareSvgMonthLabel[]; weekdayLabels: CompareSvgWeekdayLabel[] } {
  const labelW = CALENDAR_MONTH_SIDE_LABEL_W;
  const sideGap = CALENDAR_MONTH_SIDE_LABEL_GAP_PX;
  const gridLeft = labelW + sideGap;
  const stride = cellPx + gap;
  const width = monthStripW + labelW + sideGap;

  const cells: CompareSvgLayoutCell[] = [];
  const monthLabels: CompareSvgMonthLabel[] = [];
  const weekdayLabels: CompareSvgWeekdayLabel[] = [];
  let y = 0;

  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si]!;
    y += CALENDAR_YEAR_HEADER_H;

    for (let qRow = 0; qRow < 4; qRow++) {
      const inQuarter = monthsInCalendarQuarter(sec, qRow);
      if (!inQuarter.length) continue;

      for (let qmi = 0; qmi < inQuarter.length; qmi++) {
        const mo = inQuarter[qmi]!;
        const moTop = y;
        const bodyStart = moTop + CALENDAR_WEEKDAY_HEADER_H;

        if (firstCalendarMonthKey != null && mo.key === firstCalendarMonthKey) {
          const labelY = moTop + CALENDAR_WEEKDAY_HEADER_H - 3;
          for (let di = 0; di < 7; di++) {
            weekdayLabels.push({
              x: gridLeft + di * stride + cellPx / 2,
              y: labelY,
              abbr: WEEKDAY_GRID_LABELS[di]!,
              title: WEEKDAY_HEADERS[di]!,
            });
          }
        }

        for (let wi = 0; wi < mo.weeks.length; wi++) {
          const week = mo.weeks[wi]!;
          const rowY = bodyStart + wi * stride;
          for (let di = 0; di < week.length; di++) {
            const cell = week[di]!;
            if (cell === false) continue;
            cells.push({
              x: gridLeft + di * stride,
              y: rowY,
              w: cellPx,
              h: cellPx,
              weekdayCol: di,
              cell,
            });
          }
        }

        const moH = CALENDAR_WEEKDAY_HEADER_H + mo.weeks.length * stride - gap;
        monthLabels.push({
          x: labelW / 2,
          y: moTop + moH / 2 + 3,
          text: mo.labelShort,
        });
        y = moTop + moH;
        if (qmi < inQuarter.length - 1) y += CALENDAR_MONTH_STACK_GAP_PX;
      }

      if (qRow < 3) y += CALENDAR_MONTH_STACK_GAP_PX;
    }

    if (si < sections.length - 1) y += CALENDAR_QUARTER_BLOCK_GAP_PX;
  }

  return { width, height: y, cells, monthLabels, weekdayLabels };
}

/** Width of one compare strip market column (SVG + side month labels). */
export function compareStripColumnWidthPx(monthStripW: number): number {
  return monthStripW + CALENDAR_MONTH_SIDE_LABEL_W + CALENDAR_MONTH_SIDE_LABEL_GAP_PX;
}

/**
 * Vertical span in SVG coordinates for day cells in `[ymdStart, ymdEnd]` (compare column layout).
 */
export function compareColumnDateRangeYBounds(
  sections: VerticalYearSection[],
  cellPx: number,
  gap: number,
  monthStripW: number,
  firstCalendarMonthKey: string | null,
  ymdStart: string,
  ymdEnd: string
): { minY: number; maxY: number } | null {
  const { cells } = layoutCompareMarketColumnSvg(
    sections,
    cellPx,
    gap,
    monthStripW,
    firstCalendarMonthKey
  );
  let minY = Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const c of cells) {
    if (c.cell === false) continue;
    const d = c.cell;
    if (!d || d < ymdStart || d > ymdEnd) continue;
    any = true;
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y + c.h);
  }
  return any ? { minY, maxY } : null;
}

/**
 * Left edge of market column `marketIndex` (0 = first market) in the compare scroll row content,
 * matching {@link RunwayGrid} `px-0.5` + gutter + gaps.
 */
export function compareStripMarketColumnLeftPx(args: {
  marketIndex: number;
  monthStripW: number;
  gutterInnerWidthPx: number;
  columnGapPx: number;
  /** Flex row `pl-0.5` inside the scrollport (px). */
  rowPadLeftPx: number;
}): number {
  const colW = compareStripColumnWidthPx(args.monthStripW);
  return (
    args.rowPadLeftPx +
    args.gutterInnerWidthPx +
    args.columnGapPx +
    args.marketIndex * (colW + args.columnGapPx)
  );
}

/**
 * Single-market quarter grid (wall-calendar layout): matches {@link buildQuarterGridRunwayLayout} placement.
 */
export function layoutQuarterGridRunwaySvg(
  sections: VerticalYearSection[],
  cellPx: number,
  gap: number,
  monthStripW: number
): {
  width: number;
  height: number;
  cells: CompareSvgLayoutCell[];
  monthLabels: CompareSvgMonthLabel[];
  weekdayLabels: CompareSvgWeekdayLabel[];
  yearLabels: SvgYearLabel[];
  quarterLabels: SvgQuarterLabel[];
} {
  const stride = cellPx + gap;
  const stripW = monthStripW;
  const width =
    CALENDAR_QUARTER_GUTTER_W + 3 * stripW + 2 * CALENDAR_QUARTER_GRID_COL_GAP_PX;

  const cells: CompareSvgLayoutCell[] = [];
  const monthLabels: CompareSvgMonthLabel[] = [];
  const weekdayLabels: CompareSvgWeekdayLabel[] = [];
  const yearLabels: SvgYearLabel[] = [];
  const quarterLabels: SvgQuarterLabel[] = [];

  let yPos = 0;

  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si]!;
    const yearYStart = yPos;
    yPos += CALENDAR_YEAR_HEADER_H;
    yearLabels.push({
      x: width / 2,
      y: yearYStart + CALENDAR_YEAR_HEADER_H * 0.62,
      text: String(sec.year),
    });

    const byMonthIndex = new Map<number, CalendarMonthBlock>();
    for (const mo of sec.months) {
      byMonthIndex.set(mo.monthIndex, mo);
    }

    for (let qRow = 0; qRow < 4; qRow++) {
      const m0 = qRow * 3;
      const slots: (CalendarMonthBlock | undefined)[] = [
        byMonthIndex.get(m0),
        byMonthIndex.get(m0 + 1),
        byMonthIndex.get(m0 + 2),
      ];
      if (!slots[0] && !slots[1] && !slots[2]) continue;

      const rowTop = yPos;
      let rowHeight = 0;
      for (let col = 0; col < 3; col++) {
        const mo = slots[col];
        if (mo) {
          rowHeight = Math.max(rowHeight, monthBlockHeightGrid(mo.weeks.length, stride, gap));
        }
      }
      if (rowHeight === 0) {
        rowHeight = CALENDAR_MONTH_HEADER_H + CALENDAR_WEEKDAY_HEADER_H;
      }

      const qLetters: QuarterLetters = QUARTER_LETTERS[qRow]!;
      quarterLabels.push({
        x: CALENDAR_QUARTER_GUTTER_W / 2,
        y: rowTop + rowHeight / 2 + 4,
        text: quarterCodeLabel(qLetters),
        title: calendarQuarterTitle(qLetters),
      });

      for (let col = 0; col < 3; col++) {
        const mo = slots[col];
        if (!mo) continue;
        const x0 = CALENDAR_QUARTER_GUTTER_W + col * (stripW + CALENDAR_QUARTER_GRID_COL_GAP_PX);
        const moTop = rowTop;

        monthLabels.push({
          x: x0 + stripW / 2,
          y: moTop + 14,
          text: mo.labelShort,
        });

        const wdY = moTop + CALENDAR_MONTH_HEADER_H + CALENDAR_WEEKDAY_HEADER_H - 3;
        for (let di = 0; di < 7; di++) {
          weekdayLabels.push({
            x: x0 + di * stride + cellPx / 2,
            y: wdY,
            abbr: WEEKDAY_GRID_LABELS[di]!,
            title: WEEKDAY_HEADERS[di]!,
          });
        }

        const bodyStart = moTop + CALENDAR_MONTH_HEADER_H + CALENDAR_WEEKDAY_HEADER_H;
        for (let wi = 0; wi < mo.weeks.length; wi++) {
          const week = mo.weeks[wi]!;
          const rowY = bodyStart + wi * stride;
          for (let di = 0; di < week.length; di++) {
            const cell = week[di]!;
            if (cell === false) continue;
            cells.push({
              x: x0 + di * stride,
              y: rowY,
              w: cellPx,
              h: cellPx,
              weekdayCol: di,
              cell,
            });
          }
        }
      }

      yPos = rowTop + rowHeight + CALENDAR_QUARTER_GRID_ROW_GAP_PX;
    }

    yPos += CALENDAR_QUARTER_BLOCK_GAP_PX;
  }

  return { width, height: yPos, cells, monthLabels, weekdayLabels, yearLabels, quarterLabels };
}

const CONTRIBUTION_SUN_FIRST_ABBR = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const CONTRIBUTION_SUN_FIRST_TITLE = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function ymdStartOfMonthFromDate(d: Date): string {
  return formatDateYmd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function ymdEndOfMonthFromDate(d: Date): string {
  return formatDateYmd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function ymdStartOfQuarterFromDate(d: Date): string {
  const q = Math.floor(d.getMonth() / 3);
  return formatDateYmd(new Date(d.getFullYear(), q * 3, 1));
}

function ymdEndOfQuarterFromDate(d: Date): string {
  const q = Math.floor(d.getMonth() / 3);
  return formatDateYmd(new Date(d.getFullYear(), q * 3 + 3, 0));
}

function ymdStartOfYear(y: number): string {
  return formatDateYmd(new Date(y, 0, 1));
}

function ymdEndOfYear(y: number): string {
  return formatDateYmd(new Date(y, 11, 31));
}

/**
 * Horizontal contribution strip: matches {@link buildContributionStripRunwayLayout} cell placement.
 */
export function layoutContributionStripRunwaySvg(args: {
  placedCells: PlacedRunwayCell[];
  cellPx: number;
  gap: number;
  width: number;
  height: number;
  meta: ContributionStripLayoutMeta;
}): {
  width: number;
  height: number;
  cells: CompareSvgLayoutCell[];
  monthLabels: CompareSvgMonthLabel[];
  weekdayLabels: CompareSvgWeekdayLabel[];
  yearLabels: SvgYearLabel[];
  quarterLabels: SvgQuarterLabel[];
  /** Vertical ticks at week boundaries where calendar quarter changes (quarter label row). */
  quarterRailBoundaryTicks: { x: number; y: number }[];
  /** Single row of ticks; length and stroke encode month vs quarter vs year boundaries. */
  axisTicks: SvgAxisTick[];
} {
  const { placedCells, cellPx, gap, width, height, meta } = args;
  const stride = cellPx + gap;
  const gutter = CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W;
  const top = CONTRIBUTION_STRIP_TOP_PAD;
  const grid0 = parseDate(meta.gridStartYmd);
  grid0.setHours(0, 0, 0, 0);
  const msPerDay = 86400000;
  const numWeeks = meta.numWeeks;
  const tickRowH = CONTRIBUTION_STRIP_AXIS_SINGLE_TICK_ROW_H;
  const labelRowH = CONTRIBUTION_STRIP_AXIS_LABEL_BAND_H;
  const tierGap = CONTRIBUTION_STRIP_AXIS_TIER_GAP_PX;

  const cells: CompareSvgLayoutCell[] = [];
  for (const p of placedCells) {
    if (p.dateStr === false) continue;
    const dow = Math.round((p.y - top) / stride);
    cells.push({
      x: p.x,
      y: p.y,
      w: cellPx,
      h: cellPx,
      weekdayCol: dow,
      cell: p.dateStr,
    });
  }

  const weekdayLabels: CompareSvgWeekdayLabel[] = [];
  for (let dow = 0; dow < 7; dow++) {
    weekdayLabels.push({
      x: gutter / 2,
      y: top + dow * stride + cellPx / 2 + 3,
      abbr: CONTRIBUTION_SUN_FIRST_ABBR[dow]!,
      title: CONTRIBUTION_SUN_FIRST_TITLE[dow]!,
    });
  }

  const gridBottomY = top + (RUNWAY_DAY_COLUMNS - 1) * stride + cellPx;
  /** Horizontal centre of the week column `weekIdx` (aligns ticks with cells, not column gaps). */
  const columnCenterX = (weekIdx: number) => gutter + weekIdx * stride + cellPx / 2;
  const sundayYmd = (weekIdx: number) =>
    formatDateYmd(new Date(grid0.getTime() + weekIdx * 7 * msPerDay));
  const ymKey = (weekIdx: number) => sundayYmd(weekIdx).slice(0, 7);
  const quarterIdx0 = (weekIdx: number) => Math.floor(parseDate(sundayYmd(weekIdx)).getMonth() / 3);
  const yearNum = (weekIdx: number) => parseDate(sundayYmd(weekIdx)).getFullYear();

  const pushBoundaryWeeks = (changed: (w: number) => boolean): number[] => {
    const out: number[] = [0];
    for (let w = 1; w < numWeeks; w++) {
      if (changed(w)) out.push(w);
    }
    out.push(numWeeks);
    return out;
  };

  const monthBounds = pushBoundaryWeeks((w) => ymKey(w) !== ymKey(w - 1));
  const quarterBounds = pushBoundaryWeeks((w) => quarterIdx0(w) !== quarterIdx0(w - 1));
  const yearBounds = pushBoundaryWeeks((w) => yearNum(w) !== yearNum(w - 1));

  /** Unique tick x positions at column centres for each segment edge (labels sit midway between ticks). */
  const tickCentersFromBounds = (boundaryWeeks: number[]): number[] => {
    const s = new Set<number>();
    for (let i = 0; i < boundaryWeeks.length - 1; i++) {
      const w0 = boundaryWeeks[i]!;
      const w1 = boundaryWeeks[i + 1]!;
      s.add(columnCenterX(w0));
      s.add(w1 >= numWeeks ? columnCenterX(numWeeks - 1) : columnCenterX(w1));
    }
    return [...s].sort((a, b) => a - b);
  };

  const firstWeekColumnCenterX = columnCenterX(0);
  /** Strip-leading tick at week 0 column centre is redundant with the grid edge when more ticks follow. */
  const axisTicksOmitLeadingStripEdge = (xs: number[]): number[] => {
    if (xs.length <= 1) return xs;
    if (Math.abs(xs[0]! - firstWeekColumnCenterX) < 1e-6) return xs.slice(1);
    return xs;
  };

  const monthTickXs = axisTicksOmitLeadingStripEdge(tickCentersFromBounds(monthBounds));
  const quarterTickXs = axisTicksOmitLeadingStripEdge(tickCentersFromBounds(quarterBounds));
  const yearTickXs = axisTicksOmitLeadingStripEdge(tickCentersFromBounds(yearBounds));

  /** Horizontal centre of month/quarter/year labels: midway between adjacent boundary ticks (column centres). */
  const segmentCenterX = (w0: number, w1: number): number => {
    const left = columnCenterX(w0);
    const right = w1 >= numWeeks ? columnCenterX(numWeeks - 1) : columnCenterX(w1);
    return (left + right) / 2;
  };

  /** Dotted rail span for each quarter row label; interior ends align to week column centres (not column gaps). */
  const segmentQuarterRailBounds = (w0: number, w1: number): { railLeft: number; railRight: number } => {
    let railLeft: number;
    if (w0 <= 0) {
      railLeft = columnCenterX(0) + QUARTER_RAIL_INSET_PX;
    } else {
      railLeft = columnCenterX(w0) + QUARTER_RAIL_TICK_PAD_PX;
    }
    let railRight: number;
    if (w1 >= numWeeks) {
      railRight = columnCenterX(numWeeks - 1) - QUARTER_RAIL_INSET_PX;
    } else {
      railRight = columnCenterX(w1) - QUARTER_RAIL_TICK_PAD_PX;
    }
    if (railRight - railLeft < 10) {
      const cx = segmentCenterX(w0, w1);
      return { railLeft: cx - 24, railRight: cx + 24 };
    }
    return { railLeft, railRight };
  };

  let y = gridBottomY + CONTRIBUTION_STRIP_GRID_AXIS_GAP_PX;
  const tickBandTop = y;
  y += tickRowH;
  y += tierGap;
  const monthLabelY = y + labelRowH / 2;
  y += labelRowH;
  y += tierGap;
  const quarterLabelY = y + labelRowH / 2;
  y += labelRowH;
  y += tierGap;
  const yearLabelY = y + labelRowH / 2;
  y += labelRowH;

  const rs = meta.rangeStartYmd;
  const re = meta.rangeEndYmd;

  const monthLabels: CompareSvgMonthLabel[] = [];
  const nMonthSeg = monthBounds.length - 1;
  for (let i = 0; i < nMonthSeg; i++) {
    const w0 = monthBounds[i]!;
    const w1 = monthBounds[i + 1]!;
    const d0 = parseDate(sundayYmd(w0));
    const pStart = ymdStartOfMonthFromDate(d0);
    const pEnd = ymdEndOfMonthFromDate(d0);
    if ((i === 0 && rs > pStart) || (i === nMonthSeg - 1 && re < pEnd)) continue;
    monthLabels.push({
      x: segmentCenterX(w0, w1),
      y: monthLabelY,
      text: d0.toLocaleDateString(undefined, { month: 'short' }),
    });
  }

  const quarterLabels: SvgQuarterLabel[] = [];
  const nQSeg = quarterBounds.length - 1;
  for (let i = 0; i < nQSeg; i++) {
    const w0 = quarterBounds[i]!;
    const w1 = quarterBounds[i + 1]!;
    const d0 = parseDate(sundayYmd(w0));
    const pStart = ymdStartOfQuarterFromDate(d0);
    const pEnd = ymdEndOfQuarterFromDate(d0);
    if ((i === 0 && rs > pStart) || (i === nQSeg - 1 && re < pEnd)) continue;
    const m0 = d0.getMonth();
    const letters: QuarterLetters = QUARTER_LETTERS[Math.floor(m0 / 3)]!;
    const { railLeft, railRight } = segmentQuarterRailBounds(w0, w1);
    quarterLabels.push({
      x: segmentCenterX(w0, w1),
      y: quarterLabelY,
      text: quarterCodeLabel(letters),
      title: calendarQuarterTitle(letters),
      railLeft,
      railRight,
    });
  }

  const yearLabels: SvgYearLabel[] = [];
  const nYSeg = yearBounds.length - 1;
  for (let i = 0; i < nYSeg; i++) {
    const w0 = yearBounds[i]!;
    const w1 = yearBounds[i + 1]!;
    const y0 = yearNum(w0);
    const pStart = ymdStartOfYear(y0);
    const pEnd = ymdEndOfYear(y0);
    if ((i === 0 && rs > pStart) || (i === nYSeg - 1 && re < pEnd)) continue;
    yearLabels.push({
      x: segmentCenterX(w0, w1),
      y: yearLabelY,
      text: String(y0),
    });
  }

  const quarterRailBoundaryTicks: { x: number; y: number }[] = [];
  for (let w = 1; w < numWeeks; w++) {
    if (quarterIdx0(w) !== quarterIdx0(w - 1)) {
      quarterRailBoundaryTicks.push({
        /** First Sunday column of the new quarter — same x as heat-map cells for that week. */
        x: columnCenterX(w),
        y: quarterLabelY,
      });
    }
  }

  const mergedTickXs = axisTicksOmitLeadingStripEdge(
    [...new Set([...monthTickXs, ...quarterTickXs, ...yearTickXs])].sort((a, b) => a - b)
  );

  const tickLineTop = tickBandTop + CONTRIBUTION_STRIP_AXIS_TICK_ROW_TOP_INSET_PX;
  const axisTicks: SvgAxisTick[] = mergedTickXs.map((x) => {
    const { y1, y2 } = axisTickTopJustified(tickLineTop, CONTRIBUTION_STRIP_AXIS_MONTH_TICK_LEN_PX);
    return { x, y1, y2, strokeWidth: CONTRIBUTION_STRIP_AXIS_MONTH_TICK_STROKE_PX };
  });

  return {
    width,
    height,
    cells,
    monthLabels,
    weekdayLabels,
    yearLabels,
    quarterLabels,
    quarterRailBoundaryTicks,
    axisTicks,
  };
}

/**
 * Chronology axis **above** the tech capacity sparkline: same x as {@link layoutContributionStripRunwaySvg}
 * under the grid, with tiers reversed — year at the top, then quarter, month, then ticks growing upward
 * toward the chart so column centres line up with the bottom scale.
 */
export function layoutContributionStripRunwayTimeAxisAbove(args: {
  cellPx: number;
  gap: number;
  width: number;
  meta: ContributionStripLayoutMeta;
}): {
  width: number;
  height: number;
  monthLabels: CompareSvgMonthLabel[];
  yearLabels: SvgYearLabel[];
  quarterLabels: SvgQuarterLabel[];
  quarterRailBoundaryTicks: { x: number; y: number }[];
  axisTicks: SvgAxisTick[];
} {
  const { cellPx, gap, width, meta } = args;
  const stride = cellPx + gap;
  const gutter = CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W;
  const grid0 = parseDate(meta.gridStartYmd);
  grid0.setHours(0, 0, 0, 0);
  const msPerDay = 86400000;
  const numWeeks = meta.numWeeks;
  const tickRowH = CONTRIBUTION_STRIP_AXIS_SINGLE_TICK_ROW_H;
  const labelRowH = CONTRIBUTION_STRIP_AXIS_LABEL_BAND_H;
  const tierGap = CONTRIBUTION_STRIP_AXIS_TIER_GAP_PX;

  const columnCenterX = (weekIdx: number) => gutter + weekIdx * stride + cellPx / 2;
  const sundayYmd = (weekIdx: number) =>
    formatDateYmd(new Date(grid0.getTime() + weekIdx * 7 * msPerDay));
  const ymKey = (weekIdx: number) => sundayYmd(weekIdx).slice(0, 7);
  const quarterIdx0 = (weekIdx: number) => Math.floor(parseDate(sundayYmd(weekIdx)).getMonth() / 3);
  const yearNum = (weekIdx: number) => parseDate(sundayYmd(weekIdx)).getFullYear();

  const pushBoundaryWeeks = (changed: (w: number) => boolean): number[] => {
    const out: number[] = [0];
    for (let w = 1; w < numWeeks; w++) {
      if (changed(w)) out.push(w);
    }
    out.push(numWeeks);
    return out;
  };

  const monthBounds = pushBoundaryWeeks((w) => ymKey(w) !== ymKey(w - 1));
  const quarterBounds = pushBoundaryWeeks((w) => quarterIdx0(w) !== quarterIdx0(w - 1));
  const yearBounds = pushBoundaryWeeks((w) => yearNum(w) !== yearNum(w - 1));

  const firstWeekColumnCenterX = columnCenterX(0);
  const axisTicksOmitLeadingStripEdge = (xs: number[]): number[] => {
    if (xs.length <= 1) return xs;
    if (Math.abs(xs[0]! - firstWeekColumnCenterX) < 1e-6) return xs.slice(1);
    return xs;
  };

  const tickCentersFromBounds = (boundaryWeeks: number[]): number[] => {
    const s = new Set<number>();
    for (let i = 0; i < boundaryWeeks.length - 1; i++) {
      const w0 = boundaryWeeks[i]!;
      const w1 = boundaryWeeks[i + 1]!;
      s.add(columnCenterX(w0));
      s.add(w1 >= numWeeks ? columnCenterX(numWeeks - 1) : columnCenterX(w1));
    }
    return [...s].sort((a, b) => a - b);
  };

  const monthTickXs = axisTicksOmitLeadingStripEdge(tickCentersFromBounds(monthBounds));
  const quarterTickXs = axisTicksOmitLeadingStripEdge(tickCentersFromBounds(quarterBounds));
  const yearTickXs = axisTicksOmitLeadingStripEdge(tickCentersFromBounds(yearBounds));

  const segmentCenterX = (w0: number, w1: number): number => {
    const left = columnCenterX(w0);
    const right = w1 >= numWeeks ? columnCenterX(numWeeks - 1) : columnCenterX(w1);
    return (left + right) / 2;
  };

  const segmentQuarterRailBounds = (w0: number, w1: number): { railLeft: number; railRight: number } => {
    let railLeft: number;
    if (w0 <= 0) {
      railLeft = columnCenterX(0) + QUARTER_RAIL_INSET_PX;
    } else {
      railLeft = columnCenterX(w0) + QUARTER_RAIL_TICK_PAD_PX;
    }
    let railRight: number;
    if (w1 >= numWeeks) {
      railRight = columnCenterX(numWeeks - 1) - QUARTER_RAIL_INSET_PX;
    } else {
      railRight = columnCenterX(w1) - QUARTER_RAIL_TICK_PAD_PX;
    }
    if (railRight - railLeft < 10) {
      const cx = segmentCenterX(w0, w1);
      return { railLeft: cx - 24, railRight: cx + 24 };
    }
    return { railLeft, railRight };
  };

  let y = 0;
  const yearLabelY = y + labelRowH / 2;
  y += labelRowH + tierGap;
  const quarterLabelY = y + labelRowH / 2;
  y += labelRowH + tierGap;
  const monthLabelY = y + labelRowH / 2;
  y += labelRowH + tierGap;
  const tickBandTop = y;
  const tickLineBottom = tickBandTop + tickRowH - CONTRIBUTION_STRIP_AXIS_TICK_ROW_TOP_INSET_PX;
  y += tickRowH;
  const height = CONTRIBUTION_STRIP_TIME_AXIS_STACK_H;

  const rs = meta.rangeStartYmd;
  const re = meta.rangeEndYmd;

  const monthLabels: CompareSvgMonthLabel[] = [];
  const nMonthSeg = monthBounds.length - 1;
  for (let i = 0; i < nMonthSeg; i++) {
    const w0 = monthBounds[i]!;
    const w1 = monthBounds[i + 1]!;
    const d0 = parseDate(sundayYmd(w0));
    const pStart = ymdStartOfMonthFromDate(d0);
    const pEnd = ymdEndOfMonthFromDate(d0);
    if ((i === 0 && rs > pStart) || (i === nMonthSeg - 1 && re < pEnd)) continue;
    monthLabels.push({
      x: segmentCenterX(w0, w1),
      y: monthLabelY,
      text: d0.toLocaleDateString(undefined, { month: 'short' }),
    });
  }

  const quarterLabels: SvgQuarterLabel[] = [];
  const nQSeg = quarterBounds.length - 1;
  for (let i = 0; i < nQSeg; i++) {
    const w0 = quarterBounds[i]!;
    const w1 = quarterBounds[i + 1]!;
    const d0 = parseDate(sundayYmd(w0));
    const pStart = ymdStartOfQuarterFromDate(d0);
    const pEnd = ymdEndOfQuarterFromDate(d0);
    if ((i === 0 && rs > pStart) || (i === nQSeg - 1 && re < pEnd)) continue;
    const m0 = d0.getMonth();
    const letters: QuarterLetters = QUARTER_LETTERS[Math.floor(m0 / 3)]!;
    const { railLeft, railRight } = segmentQuarterRailBounds(w0, w1);
    quarterLabels.push({
      x: segmentCenterX(w0, w1),
      y: quarterLabelY,
      text: quarterCodeLabel(letters),
      title: calendarQuarterTitle(letters),
      railLeft,
      railRight,
    });
  }

  const yearLabels: SvgYearLabel[] = [];
  const nYSeg = yearBounds.length - 1;
  for (let i = 0; i < nYSeg; i++) {
    const w0 = yearBounds[i]!;
    const w1 = yearBounds[i + 1]!;
    const y0 = yearNum(w0);
    const pStart = ymdStartOfYear(y0);
    const pEnd = ymdEndOfYear(y0);
    if ((i === 0 && rs > pStart) || (i === nYSeg - 1 && re < pEnd)) continue;
    yearLabels.push({
      x: segmentCenterX(w0, w1),
      y: yearLabelY,
      text: String(y0),
    });
  }

  const quarterRailBoundaryTicks: { x: number; y: number }[] = [];
  for (let w = 1; w < numWeeks; w++) {
    if (quarterIdx0(w) !== quarterIdx0(w - 1)) {
      quarterRailBoundaryTicks.push({
        x: columnCenterX(w),
        y: quarterLabelY,
      });
    }
  }

  const mergedTickXs = axisTicksOmitLeadingStripEdge(
    [...new Set([...monthTickXs, ...quarterTickXs, ...yearTickXs])].sort((a, b) => a - b)
  );

  const axisTicks: SvgAxisTick[] = mergedTickXs.map((x) => {
    const { y1, y2 } = axisTickBottomJustified(tickLineBottom, CONTRIBUTION_STRIP_AXIS_MONTH_TICK_LEN_PX);
    return { x, y1, y2, strokeWidth: CONTRIBUTION_STRIP_AXIS_MONTH_TICK_STROKE_PX };
  });

  return {
    width,
    height,
    monthLabels,
    yearLabels,
    quarterLabels,
    quarterRailBoundaryTicks,
    axisTicks,
  };
}
