import { parseDate } from '@/engine/calendar';
import {
  RUNWAY_CELL_GAP_PX,
  RUNWAY_DAY_COLUMNS,
  formatDateYmd,
  runwayDayStripWidth,
} from '@/lib/weekRunway';
import { skylineMonthBodyHeightPx } from '@/lib/runwayIsoSkylineLayout';

export const QUARTER_LETTERS = ['JFM', 'AMJ', 'JAS', 'OND'] as const;
export type QuarterLetters = (typeof QUARTER_LETTERS)[number];

/** Visible gutter label (Q1–Q4). */
export function quarterCodeLabel(letters: QuarterLetters): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const map: Record<QuarterLetters, 'Q1' | 'Q2' | 'Q3' | 'Q4'> = {
    JFM: 'Q1',
    AMJ: 'Q2',
    JAS: 'Q3',
    OND: 'Q4',
  };
  return map[letters];
}

/** Tooltip / aria: months in that calendar quarter. */
export function calendarQuarterTitle(letters: QuarterLetters): string {
  switch (letters) {
    case 'JFM':
      return 'Q1 — January through March';
    case 'AMJ':
      return 'Q2 — April through June';
    case 'JAS':
      return 'Q3 — July through September';
    case 'OND':
      return 'Q4 — October through December';
    default:
      return letters;
  }
}

/** Left gutter width for Q1–Q4 labels (`text-sm` extrabold, no pill) */
export const CALENDAR_QUARTER_GUTTER_W = 44;
/** Horizontal gap between adjacent month blocks */
export const CALENDAR_MONTH_GAP_PX = 14;
export const CALENDAR_MONTH_HEADER_H = 20;
/** Compare-all: month abbrev beside the day grid (not above). */
export const CALENDAR_MONTH_SIDE_LABEL_PADDING_END_PX = 4;
/** Outer width of label rail (includes `paddingRight` before flex gap). */
export const CALENDAR_MONTH_SIDE_LABEL_W = 18 + CALENDAR_MONTH_SIDE_LABEL_PADDING_END_PX;
export const CALENDAR_MONTH_SIDE_LABEL_GAP_PX = 2;
export const CALENDAR_WEEKDAY_HEADER_H = 18;
export const CALENDAR_YEAR_HEADER_H = 32;
/** Matches year title strip in `RunwayVerticalHeatmapBody`: `pt-1` + band + `pb-2.5`. */
export const CALENDAR_YEAR_STRIP_TOTAL_PX = 4 + CALENDAR_YEAR_HEADER_H + 10;
export const CALENDAR_QUARTER_BLOCK_GAP_PX = 12;

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * `string` = ISO day in the model; `null` = day in this month but empty / outside model (grey);
 * `false` = grid slot not part of this month (leading/trailing weekdays) or quarter height padding — no cell drawn.
 */
export type RunwayCalendarCellValue = string | null | false;

function monthMondayGrid(
  year: number,
  monthIndex: number,
  inModel: Set<string>,
  modelFirst: Date,
  modelLast: Date
): RunwayCalendarCellValue[][] {
  const dim = daysInMonth(year, monthIndex);
  const first = new Date(year, monthIndex, 1);
  const lead = (first.getDay() + 6) % 7;
  const flat: RunwayCalendarCellValue[] = [];
  for (let i = 0; i < lead; i++) flat.push(false);
  for (let d = 1; d <= dim; d++) {
    const dt = new Date(year, monthIndex, d);
    const t = dt.getTime();
    if (t < modelFirst.getTime() || t > modelLast.getTime()) {
      flat.push(null);
      continue;
    }
    const ymd = formatDateYmd(dt);
    flat.push(inModel.has(ymd) ? ymd : null);
  }
  while (flat.length % RUNWAY_DAY_COLUMNS !== 0) flat.push(false);
  const rows: RunwayCalendarCellValue[][] = [];
  for (let i = 0; i < flat.length; i += RUNWAY_DAY_COLUMNS) {
    rows.push(flat.slice(i, i + RUNWAY_DAY_COLUMNS));
  }
  return rows;
}

export type CalendarMonthBlock = {
  key: string;
  year: number;
  monthIndex: number;
  labelShort: string;
  weeks: RunwayCalendarCellValue[][];
};

export type PlacedRunwayCell = {
  dateStr: RunwayCalendarCellValue;
  x: number;
  y: number;
  flatIndex: number;
};

/** One calendar year: months stacked top-to-bottom (single Mon–Sun strip per month). */
export type VerticalYearSection = {
  year: number;
  months: CalendarMonthBlock[];
};

export type RunwayVerticalCalendarLayout = {
  sections: VerticalYearSection[];
  contentWidth: number;
  contentHeight: number;
  placedCells: PlacedRunwayCell[];
};

/** Gap between stacked month blocks (within a year). */
export const CALENDAR_MONTH_STACK_GAP_PX = 10;
/** Horizontal gap between month mini-calendars in the single-market quarter grid. */
export const CALENDAR_QUARTER_GRID_COL_GAP_PX = 12;
/** Vertical gap between quarter rows (three-month rows) in the quarter grid. */
export const CALENDAR_QUARTER_GRID_ROW_GAP_PX = 14;

function monthBlockHeight(weeksLen: number, stride: number, gap: number): number {
  return CALENDAR_MONTH_HEADER_H + CALENDAR_WEEKDAY_HEADER_H + weeksLen * stride - gap;
}

/**
 * Shared: build year sections and month mini-grids from sorted model dates (no placement).
 */
function buildVerticalYearSectionsFromDates(sortedDatesYmd: string[]): VerticalYearSection[] | null {
  if (!sortedDatesYmd.length) return null;

  const inModel = new Set(sortedDatesYmd);
  const modelFirst = parseDate(sortedDatesYmd[0]!);
  const modelLast = parseDate(sortedDatesYmd[sortedDatesYmd.length - 1]!);
  modelFirst.setHours(0, 0, 0, 0);
  modelLast.setHours(0, 0, 0, 0);

  const monthPairs: { year: number; monthIndex: number }[] = [];
  let cy = modelFirst.getFullYear();
  let cm = modelFirst.getMonth();
  const endY = modelLast.getFullYear();
  const endM = modelLast.getMonth();
  while (cy < endY || (cy === endY && cm <= endM)) {
    monthPairs.push({ year: cy, monthIndex: cm });
    cm += 1;
    if (cm > 11) {
      cm = 0;
      cy += 1;
    }
  }

  if (!monthPairs.length) return null;

  const sections: VerticalYearSection[] = [];
  for (const p of monthPairs) {
    let sec = sections[sections.length - 1];
    if (!sec || sec.year !== p.year) {
      sec = { year: p.year, months: [] };
      sections.push(sec);
    }
    const weeksRaw = monthMondayGrid(p.year, p.monthIndex, inModel, modelFirst, modelLast);
    const d = new Date(p.year, p.monthIndex, 1);
    const labelShort = d.toLocaleDateString(undefined, { month: 'short' });
    sec.months.push({
      key: `${p.year}-${String(p.monthIndex + 1).padStart(2, '0')}`,
      year: p.year,
      monthIndex: p.monthIndex,
      labelShort,
      weeks: weeksRaw,
    });
  }

  return sections;
}

/** All week rows in calendar order (for one continuous isometric skyline). */
export function flattenRunwayWeeksFromSections(sections: VerticalYearSection[]): RunwayCalendarCellValue[][] {
  const out: RunwayCalendarCellValue[][] = [];
  for (const sec of sections) {
    for (const mo of sec.months) {
      for (const w of mo.weeks) {
        out.push(w);
      }
    }
  }
  return out;
}

/** One label stack at the first week of a calendar month (isometric skyline). */
export type SkylineChronologyGroup = {
  weekIndex: number;
  /** First week of a year section (model year strip). */
  yearLabel?: string;
  /** Present when month starts a calendar quarter (Jan, Apr, Jul, Oct). */
  quarterLabel?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  monthLabel: string;
};

function quarterLabelFromMonthIndex(monthIndex: number): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  return [`Q1`, `Q2`, `Q3`, `Q4`][Math.floor(monthIndex / 3)]! as 'Q1' | 'Q2' | 'Q3' | 'Q4';
}

/**
 * Labels for the continuous isometric skyline: year (section start), quarter (quarter months),
 * and every month — aligned to flattened week indices.
 */
export function skylineChronologyGroups(sections: VerticalYearSection[]): SkylineChronologyGroup[] {
  const out: SkylineChronologyGroup[] = [];
  let weekIndex = 0;
  for (const sec of sections) {
    for (let mi = 0; mi < sec.months.length; mi++) {
      const mo = sec.months[mi]!;
      const yearLabel = mi === 0 ? String(sec.year) : undefined;
      const quarterLabel = mo.monthIndex % 3 === 0 ? quarterLabelFromMonthIndex(mo.monthIndex) : undefined;
      out.push({
        weekIndex,
        yearLabel,
        quarterLabel,
        monthLabel: mo.labelShort,
      });
      weekIndex += mo.weeks.length;
    }
  }
  return out;
}

/** Optional vertical runway layout (single-column months). */
export type VerticalMonthsRunwayLayoutOpts = {
  /**
   * Extra px for 3D isometric skyline columns (tower height in local cell space).
   * When set, month block height follows the isometric lattice SVG instead of flat week rows.
   */
  rowTowerPx?: number;
};

/**
 * Runway layout: each month is one Monday-start mini-grid; months stack vertically in one column.
 * Left gutter shows Q1–Q4 once per calendar quarter, vertically centered on that quarter’s stacked months.
 * Compare-all view uses one shared gutter column; per-market columns omit the gutter.
 *
 * When `rowTowerPx` is set (3D skyline), layout is a **single** strip: no gutter, height = one skyline
 * for all weeks concatenated in order (matches the continuous isometric block UI).
 */
export function buildVerticalMonthsRunwayLayout(
  sortedDatesYmd: string[],
  cellPx: number,
  opts?: VerticalMonthsRunwayLayoutOpts
): RunwayVerticalCalendarLayout | null {
  const sections = buildVerticalYearSectionsFromDates(sortedDatesYmd);
  if (!sections) return null;

  const gap = RUNWAY_CELL_GAP_PX;
  const stripW = runwayDayStripWidth(cellPx, gap, RUNWAY_DAY_COLUMNS);
  const strideX = cellPx + gap;
  const rowTower = Math.max(0, Math.round(opts?.rowTowerPx ?? 0));
  const strideY = cellPx + gap + rowTower;

  const placedCells: PlacedRunwayCell[] = [];
  let flatIndex = 0;

  /** One isometric block: no year/month/weekday headers or quarter gutter in layout coordinates. */
  if (rowTower > 0) {
    const flatWeeks = flattenRunwayWeeksFromSections(sections);
    const totalWeeks = flatWeeks.length;
    const bodyH = skylineMonthBodyHeightPx(totalWeeks, cellPx, gap, rowTower);
    const strideYPlaced = bodyH / Math.max(1, totalWeeks);
    const x0 = 0;
    const cellY = 0;
    for (let wi = 0; wi < totalWeeks; wi++) {
      const week = flatWeeks[wi]!;
      for (let di = 0; di < RUNWAY_DAY_COLUMNS; di++) {
        placedCells.push({
          dateStr: week[di]!,
          x: x0 + di * strideX,
          y: cellY + wi * strideYPlaced,
          flatIndex: flatIndex++,
        });
      }
    }
    return {
      sections,
      contentWidth: stripW,
      contentHeight: bodyH,
      placedCells,
    };
  }

  const contentWidth = CALENDAR_QUARTER_GUTTER_W + stripW;

  let yPos = 0;

  for (const sec of sections) {
    yPos += CALENDAR_YEAR_HEADER_H;
    for (const mo of sec.months) {
      const rowTop = yPos;
      const cellY = rowTop + CALENDAR_MONTH_HEADER_H + CALENDAR_WEEKDAY_HEADER_H;
      const x0 = CALENDAR_QUARTER_GUTTER_W;
      const wLen = mo.weeks.length;
      for (let wi = 0; wi < wLen; wi++) {
        const week = mo.weeks[wi]!;
        for (let di = 0; di < RUNWAY_DAY_COLUMNS; di++) {
          placedCells.push({
            dateStr: week[di]!,
            x: x0 + di * strideX,
            y: cellY + wi * strideY,
            flatIndex: flatIndex++,
          });
        }
      }
      const blockH = monthBlockHeight(wLen, strideY, gap);
      yPos = rowTop + blockH + CALENDAR_MONTH_STACK_GAP_PX;
    }
    yPos += CALENDAR_QUARTER_BLOCK_GAP_PX;
  }

  return { sections, contentWidth, contentHeight: yPos, placedCells };
}

/**
 * Single-market layout: within each year, calendar months in a 3×N grid (three months per row = calendar quarters).
 * More like a wall calendar; wider than the compare-all vertical strip.
 */
export function buildQuarterGridRunwayLayout(
  sortedDatesYmd: string[],
  cellPx: number
): RunwayVerticalCalendarLayout | null {
  const sections = buildVerticalYearSectionsFromDates(sortedDatesYmd);
  if (!sections) return null;

  const gap = RUNWAY_CELL_GAP_PX;
  const stripW = runwayDayStripWidth(cellPx, gap, RUNWAY_DAY_COLUMNS);
  const stride = cellPx + gap;
  const contentWidth =
    CALENDAR_QUARTER_GUTTER_W + 3 * stripW + 2 * CALENDAR_QUARTER_GRID_COL_GAP_PX;

  const placedCells: PlacedRunwayCell[] = [];
  let yPos = 0;
  let flatIndex = 0;

  for (const sec of sections) {
    yPos += CALENDAR_YEAR_HEADER_H;

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
          rowHeight = Math.max(rowHeight, monthBlockHeight(mo.weeks.length, stride, gap));
        }
      }
      if (rowHeight === 0) {
        rowHeight = CALENDAR_MONTH_HEADER_H + CALENDAR_WEEKDAY_HEADER_H;
      }

      for (let col = 0; col < 3; col++) {
        const mo = slots[col];
        if (!mo) continue;
        const x0 =
          CALENDAR_QUARTER_GUTTER_W + col * (stripW + CALENDAR_QUARTER_GRID_COL_GAP_PX);
        const cellY = rowTop + CALENDAR_MONTH_HEADER_H + CALENDAR_WEEKDAY_HEADER_H;
        for (let wi = 0; wi < mo.weeks.length; wi++) {
          const week = mo.weeks[wi]!;
          for (let di = 0; di < RUNWAY_DAY_COLUMNS; di++) {
            placedCells.push({
              dateStr: week[di]!,
              x: x0 + di * stride,
              y: cellY + wi * stride,
              flatIndex: flatIndex++,
            });
          }
        }
      }

      yPos = rowTop + rowHeight + CALENDAR_QUARTER_GRID_ROW_GAP_PX;
    }

    yPos += CALENDAR_QUARTER_BLOCK_GAP_PX;
  }

  return { sections, contentWidth, contentHeight: yPos, placedCells };
}
