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
  QUARTER_LETTERS,
  calendarQuarterTitle,
  quarterCodeLabel,
  type CalendarMonthBlock,
  type QuarterLetters,
  type RunwayCalendarCellValue,
  type VerticalYearSection,
} from '@/lib/calendarQuarterLayout';
import { WEEKDAY_HEADERS } from '@/lib/weekRunway';

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

export type SvgQuarterLabel = { x: number; y: number; text: string; title: string };

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
