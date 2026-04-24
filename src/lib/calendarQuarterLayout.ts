import { parseDate } from '@/engine/calendar';
import {
  RUNWAY_CELL_GAP_PX,
  RUNWAY_DAY_COLUMNS,
  formatDateYmd,
  runwayDayStripWidth,
} from '@/lib/weekRunway';
import {
  SKYLINE_MONTH_ISO_GAP_STEPS,
  skylineMonthBodyHeightPx,
} from '@/lib/runwayIsoSkylineLayout';

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

/** Extra fields when {@link buildContributionStripRunwayLayout} is used (GitHub-style horizontal strip). */
export type ContributionStripLayoutMeta = {
  gridStartYmd: string;
  numWeeks: number;
  rangeStartYmd: string;
  rangeEndYmd: string;
};

export type RunwayVerticalCalendarLayout = {
  sections: VerticalYearSection[];
  contentWidth: number;
  contentHeight: number;
  placedCells: PlacedRunwayCell[];
  layoutKind?: 'default' | 'contribution_strip';
  contributionMeta?: ContributionStripLayoutMeta;
  /** One contribution strip’s width when `contentWidth` is expanded for triple-lens row total. */
  contributionColumnContentWidth?: number;
  /** Triple-lens stacked mode: SVG height for upper strips (grid only, no month/weekday axis). */
  contributionStripCompactHeight?: number;
  /** Triple-lens stacked mode: one strip’s height (weekday gutter + grid + month axis), not the stacked total in `contentHeight`. */
  contributionStripLayerHeight?: number;
};

/** Left gutter for Sun–Sat letters on the contribution strip. */
export const CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W = 22;
/** Gap between the bottom of day cells and the first axis tick row. */
export const CONTRIBUTION_STRIP_GRID_AXIS_GAP_PX = 6;
/** Reference height for tick mark span in the shared axis row (tier fractions scale from this). */
export const CONTRIBUTION_STRIP_AXIS_TICK_BAND_H = 9;
/** Shared tick span for all period boundaries (`0.94 ×` tick band ref). */
export const CONTRIBUTION_STRIP_AXIS_MONTH_TICK_LEN_PX = CONTRIBUTION_STRIP_AXIS_TICK_BAND_H * 0.94;
/** Stroke width (px) for all axis ticks. */
export const CONTRIBUTION_STRIP_AXIS_MONTH_TICK_STROKE_PX = 2.1;
/** Inset from the top of the tick row before ticks grow downward. */
export const CONTRIBUTION_STRIP_AXIS_TICK_ROW_TOP_INSET_PX = 1;
/** Single row of period-boundary ticks under the grid (above the three label rows). */
export const CONTRIBUTION_STRIP_AXIS_SINGLE_TICK_ROW_H =
  CONTRIBUTION_STRIP_AXIS_TICK_ROW_TOP_INSET_PX +
  Math.ceil(CONTRIBUTION_STRIP_AXIS_MONTH_TICK_LEN_PX);
/** Height reserved for each month / quarter / year label row under the shared tick row. */
export const CONTRIBUTION_STRIP_AXIS_LABEL_BAND_H = 14;
/** One combined band when ticks and labels share a row (legacy / max of tick vs label). */
export const CONTRIBUTION_STRIP_AXIS_COMBINED_ROW_H = Math.max(
  CONTRIBUTION_STRIP_AXIS_TICK_BAND_H,
  CONTRIBUTION_STRIP_AXIS_LABEL_BAND_H,
);
/** Vertical gap between axis tiers (tick row vs labels, and between label rows). */
export const CONTRIBUTION_STRIP_AXIS_TIER_GAP_PX = 4;
/**
 * Space under the cell grid: one shared tick row, then month / quarter / year labels.
 * Must match {@link layoutContributionStripRunwaySvg} band stacking.
 */
export const CONTRIBUTION_STRIP_MONTH_AXIS_H =
  CONTRIBUTION_STRIP_GRID_AXIS_GAP_PX +
  CONTRIBUTION_STRIP_AXIS_SINGLE_TICK_ROW_H +
  CONTRIBUTION_STRIP_AXIS_TIER_GAP_PX +
  3 * CONTRIBUTION_STRIP_AXIS_LABEL_BAND_H +
  2 * CONTRIBUTION_STRIP_AXIS_TIER_GAP_PX;
/**
 * Chronology-only stack (year → quarter → month → ticks) without the gap that sits under the cell grid.
 * Used for the mirrored time axis above the tech capacity sparkline.
 */
export const CONTRIBUTION_STRIP_TIME_AXIS_STACK_H =
  CONTRIBUTION_STRIP_MONTH_AXIS_H - CONTRIBUTION_STRIP_GRID_AXIS_GAP_PX;
export const CONTRIBUTION_STRIP_TOP_PAD = 4;

/**
 * Contribution strip SVG height when weekday + month axis labels are omitted (grid + small lower pad).
 * Must stay aligned with {@link buildContributionStripRunwayLayout} cell `y` geometry.
 */
export function contributionStripGridOnlyContentHeightPx(
  cellPx: number,
  cellGapPx: number = RUNWAY_CELL_GAP_PX,
): number {
  const stride = cellPx + cellGapPx;
  return CONTRIBUTION_STRIP_TOP_PAD + RUNWAY_DAY_COLUMNS * stride - cellGapPx + 2;
}

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
  /** Parent {@link VerticalYearSection}.year (for e.g. “Jan 2026” on the month axis). */
  sectionYear: number;
  /** 0–11 calendar month. */
  monthIndex: number;
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
        sectionYear: sec.year,
        monthIndex: mo.monthIndex,
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
  /** Gap between day cells in px (defaults to the shared runway cell gap constant). */
  cellGapPx?: number;
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

  const gap = opts?.cellGapPx ?? RUNWAY_CELL_GAP_PX;
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
    const gapIso = 0;
    const monthStartChronWeeks = skylineChronologyGroups(sections)
      .map((g) => g.weekIndex)
      .filter((w) => w > 0);
    const monthPack = {
      monthGapSteps: SKYLINE_MONTH_ISO_GAP_STEPS,
      monthStartChronWeeks,
    };
    const bodyH = skylineMonthBodyHeightPx(totalWeeks, cellPx, gapIso, rowTower, monthPack);
    const stripWIso = runwayDayStripWidth(cellPx, gapIso, RUNWAY_DAY_COLUMNS);
    const strideXIso = cellPx + gapIso;
    const strideYPlaced = bodyH / Math.max(1, totalWeeks);
    const x0 = 0;
    const cellY = 0;
    for (let wi = 0; wi < totalWeeks; wi++) {
      const week = flatWeeks[wi]!;
      for (let di = 0; di < RUNWAY_DAY_COLUMNS; di++) {
        placedCells.push({
          dateStr: week[di]!,
          x: x0 + di * strideXIso,
          y: cellY + wi * strideYPlaced,
          flatIndex: flatIndex++,
        });
      }
    }
    return {
      sections,
      contentWidth: stripWIso,
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

/**
 * Single-market **horizontal** strip: each column is one calendar week (Sun → Sat, top → bottom);
 * weeks run **left → right** in time. Padding weeks use `false` cells. Month/year filters use the same
 * `sortedDatesYmd` span as the quarter grid.
 */
export function buildContributionStripRunwayLayout(
  sortedDatesYmd: string[],
  cellPx: number,
  cellGapPx: number = RUNWAY_CELL_GAP_PX
): RunwayVerticalCalendarLayout | null {
  if (!sortedDatesYmd.length) return null;
  const sections = buildVerticalYearSectionsFromDates(sortedDatesYmd);
  if (!sections) return null;

  const rangeStartYmd = sortedDatesYmd[0]!;
  const rangeEndYmd = sortedDatesYmd[sortedDatesYmd.length - 1]!;
  const inLayout = new Set(sortedDatesYmd);

  const gap = cellGapPx;
  const stride = cellPx + gap;

  const startD = parseDate(rangeStartYmd);
  const endD = parseDate(rangeEndYmd);
  startD.setHours(0, 0, 0, 0);
  endD.setHours(0, 0, 0, 0);

  const gridStart = new Date(startD);
  {
    const dow = gridStart.getDay();
    gridStart.setDate(gridStart.getDate() - dow);
  }
  const gridEnd = new Date(endD);
  {
    const dow = gridEnd.getDay();
    gridEnd.setDate(gridEnd.getDate() + (6 - dow));
  }

  const msPerDay = 86400000;
  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / msPerDay) + 1;
  const numWeeks = totalDays / 7;
  if (!Number.isInteger(numWeeks) || numWeeks < 1) return null;

  const gridStartYmd = formatDateYmd(gridStart);

  const placedCells: PlacedRunwayCell[] = [];
  let flatIndex = 0;
  for (let w = 0; w < numWeeks; w++) {
    for (let dow = 0; dow < 7; dow++) {
      const dt = new Date(gridStart.getTime() + (w * 7 + dow) * msPerDay);
      const ymd = formatDateYmd(dt);
      let cell: RunwayCalendarCellValue;
      if (ymd < rangeStartYmd || ymd > rangeEndYmd) {
        cell = false;
      } else if (inLayout.has(ymd)) {
        cell = ymd;
      } else {
        cell = null;
      }
      const x = CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W + w * stride;
      const y = CONTRIBUTION_STRIP_TOP_PAD + dow * stride;
      placedCells.push({ dateStr: cell, x, y, flatIndex: flatIndex++ });
    }
  }

  const contentWidth =
    CONTRIBUTION_STRIP_WEEKDAY_GUTTER_W + numWeeks * stride - gap + 6;
  const contentHeight =
    CONTRIBUTION_STRIP_TOP_PAD +
    RUNWAY_DAY_COLUMNS * stride -
    gap +
    CONTRIBUTION_STRIP_MONTH_AXIS_H;

  return {
    sections,
    contentWidth,
    contentHeight,
    placedCells,
    layoutKind: 'contribution_strip',
    contributionMeta: {
      gridStartYmd,
      numWeeks,
      rangeStartYmd,
      rangeEndYmd,
    },
  };
}

/** Must match `RunwayGrid` runway zoom bounds. */
export const RUNWAY_COMPARE_FIT_CELL_PX_MIN = 12;
const RUNWAY_COMPARE_FIT_CELL_PX_MAX = 28;
const RUNWAY_COMPARE_FIT_CELL_PX_STEP = 2;

/**
 * Horizontal span of the LIOM compare row: shared gutter column, each market strip + side labels,
 * flex gaps (`CALENDAR_QUARTER_GRID_COL_GAP_PX`), and inner `px-0.5` on the flex row in `RunwayGridBody`.
 */
export function compareAllRunwayTotalContentWidthPx(
  cellPx: number,
  marketCount: number,
  cellGapPx: number = RUNWAY_CELL_GAP_PX
): number {
  if (marketCount < 1) return 0;
  const monthStripW = runwayDayStripWidth(cellPx, cellGapPx, RUNWAY_DAY_COLUMNS);
  const colW = monthStripW + CALENDAR_MONTH_SIDE_LABEL_W + CALENDAR_MONTH_SIDE_LABEL_GAP_PX;
  const innerHorizontalPad = 4;
  return (
    innerHorizontalPad +
    CALENDAR_QUARTER_GUTTER_W +
    marketCount * colW +
    marketCount * CALENDAR_QUARTER_GRID_COL_GAP_PX
  );
}

/**
 * Triple-lens **stacked** contribution strips: one full-width strip column + gutter (same horizontal
 * accounting as a single compare column, `RunwayGridBody` `px-0.5`).
 */
/** Lens label rail to the left of each stacked strip (compact stacked heading + icon). */
export const SINGLE_MARKET_TRIPLE_LENS_LEFT_RAIL_W_PX = 28;

/** Left padding on single-market contribution strip flex rows in `RunwayGrid` (`px-0.5` → 2px). */
export const RUNWAY_CONTRIBUTION_STRIP_FLEX_ROW_PAD_LEFT_PX = 2;

/** `gap-1.5` between triple-lens rail caption and contribution strip SVG (`RunwayGrid`). */
export const RUNWAY_TRIPLE_LENS_RAIL_TO_STRIP_GAP_PX = 6;

/**
 * Horizontal offset from the triple-lens strip-row flex start to the contribution SVG’s left edge
 * (must stay in sync with `RunwayGridBody` gutter + `gap` + rail + `gap-1.5`).
 */
export const RUNWAY_TRIPLE_LENS_CONTRIBUTION_SVG_LEADING_OFFSET_PX =
  RUNWAY_CONTRIBUTION_STRIP_FLEX_ROW_PAD_LEFT_PX +
  CALENDAR_QUARTER_GUTTER_W +
  CALENDAR_QUARTER_GRID_COL_GAP_PX +
  SINGLE_MARKET_TRIPLE_LENS_LEFT_RAIL_W_PX +
  RUNWAY_TRIPLE_LENS_RAIL_TO_STRIP_GAP_PX;

/** Vertical gap between stacked triple-lens contribution rows (labels sit beside strips, not above). */
export const SINGLE_MARKET_TRIPLE_LENS_VERTICAL_GAP_PX = 8;

/**
 * Tech capacity balance histogram (must match `RunwayTechCapacityDemandSparkline` SVG `viewBox` height).
 * Taller plot so deficit/surplus bars read clearly above the Technology strip.
 */
export const RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_CHART_PX = 96;
/**
 * Legacy reserved height for a controls row above the sparkline SVG (removed). Kept at 0 so
 * `RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_TOTAL_BLOCK_PX` still documents chart-only stack height.
 */
export const RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_CONTROLS_PX = 0;
/** Chart SVG height (must match `RunwayTechCapacityDemandSparkline` chart SVG only). */
export const RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_TOTAL_BLOCK_PX =
  RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_CONTROLS_PX + RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_CHART_PX;
/** `gap-1` between histogram block and Tech strip in `RunwayGrid`. */
export const RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_TO_STRIP_GAP_PX = 4;

/**
 * Tech sparkline column: mirrored time axis + gap + chart (matches `RunwayTechCapacityDemandSparkline` wrapper).
 */
export const RUNWAY_TECH_SPARKLINE_STACK_PX =
  CONTRIBUTION_STRIP_TIME_AXIS_STACK_H +
  CONTRIBUTION_STRIP_GRID_AXIS_GAP_PX +
  RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_TOTAL_BLOCK_PX;

/** Total vertical stack for sparkline column + gap before the Tech contribution strip. */
export const SINGLE_MARKET_TRIPLE_LENS_TECH_SPARK_ABOVE_PX =
  RUNWAY_TECH_SPARKLINE_STACK_PX + RUNWAY_TECH_CONTRIBUTION_HISTOGRAM_TO_STRIP_GAP_PX;

export function tripleLensStackedContributionTotalContentWidthPx(contributionStripContentWidth: number): number {
  const innerHorizontalPad = 4;
  return (
    innerHorizontalPad +
    CALENDAR_QUARTER_GUTTER_W +
    SINGLE_MARKET_TRIPLE_LENS_LEFT_RAIL_W_PX +
    contributionStripContentWidth +
    CALENDAR_QUARTER_GRID_COL_GAP_PX
  );
}

/**
 * Horizontal offset from the start of the triple-lens **inner** column (the flex stack under the quarter
 * gutter) to the left edge of the contribution strip / programme Gantt SVG — rail + `gap-1.5`.
 * Keep in sync with `RunwayGrid` + `RunwayProgrammeGanttBlock` rail + strip rows.
 */
export const RUNWAY_TRIPLE_LENS_INNER_COL_TO_STRIP_LEFT_PX =
  SINGLE_MARKET_TRIPLE_LENS_LEFT_RAIL_W_PX + RUNWAY_TRIPLE_LENS_RAIL_TO_STRIP_GAP_PX;

/**
 * Compare column: `mb-1.5` (6px) + market sticker row `h-[32px]` above each strip (`RunwayGridBody`).
 */
export const RUNWAY_COMPARE_MARKET_STICKER_STACK_PX = 6 + 32;

/** Total vertical pixel height of one LIOM compare column (sticker + calendar stack) for a given cell size. */
export function compareAllRunwayTotalContentHeightPx(
  cellPx: number,
  sortedDatesYmd: string[],
  cellGapPx: number = RUNWAY_CELL_GAP_PX
): number {
  const layout = buildVerticalMonthsRunwayLayout(sortedDatesYmd, cellPx, { cellGapPx });
  if (!layout) return RUNWAY_COMPARE_MARKET_STICKER_STACK_PX;
  return RUNWAY_COMPARE_MARKET_STICKER_STACK_PX + layout.contentHeight;
}

/** Minimum scrollport height before we apply vertical fitting (avoid tiny viewports over-shrinking cells). */
const RUNWAY_COMPARE_FIT_MIN_VIEWPORT_H = 120;

/**
 * Largest stepped cell size so the full LIOM compare row fits `availableWidth` and, when `availableHeight` is
 * large enough, the full calendar stack fits vertically without scrolling inside the compare scrollport.
 */
export function bestCellPxForCompareAllRunwayFit(
  availableWidth: number,
  availableHeight: number,
  marketCount: number,
  sortedDatesYmd: string[],
  cellGapPx: number = RUNWAY_CELL_GAP_PX
): number {
  if (marketCount < 1 || !Number.isFinite(availableWidth) || availableWidth <= 0) {
    return RUNWAY_COMPARE_FIT_CELL_PX_MIN;
  }
  const useHeight =
    Number.isFinite(availableHeight) && availableHeight >= RUNWAY_COMPARE_FIT_MIN_VIEWPORT_H;
  let best = RUNWAY_COMPARE_FIT_CELL_PX_MIN;
  for (
    let px = RUNWAY_COMPARE_FIT_CELL_PX_MIN;
    px <= RUNWAY_COMPARE_FIT_CELL_PX_MAX;
    px += RUNWAY_COMPARE_FIT_CELL_PX_STEP
  ) {
    if (compareAllRunwayTotalContentWidthPx(px, marketCount, cellGapPx) > availableWidth) continue;
    if (
      useHeight &&
      compareAllRunwayTotalContentHeightPx(px, sortedDatesYmd, cellGapPx) > availableHeight
    ) {
      continue;
    }
    best = px;
  }
  return best;
}

/**
 * Largest stepped cell size so a single-market **horizontal contribution strip** fits within
 * `availableWidth` x `availableHeight`.
 */
export function bestCellPxForSingleMarketFit(
  availableWidth: number,
  availableHeight: number,
  sortedDatesYmd: string[],
  cellGapPx: number = RUNWAY_CELL_GAP_PX
): number {
  if (!sortedDatesYmd.length || !Number.isFinite(availableWidth) || availableWidth <= 0) {
    return RUNWAY_COMPARE_FIT_CELL_PX_MIN;
  }
  const useHeight =
    Number.isFinite(availableHeight) && availableHeight >= RUNWAY_COMPARE_FIT_MIN_VIEWPORT_H;
  let best = RUNWAY_COMPARE_FIT_CELL_PX_MIN;
  for (
    let px = RUNWAY_COMPARE_FIT_CELL_PX_MIN;
    px <= RUNWAY_COMPARE_FIT_CELL_PX_MAX;
    px += RUNWAY_COMPARE_FIT_CELL_PX_STEP
  ) {
    const layout = buildContributionStripRunwayLayout(sortedDatesYmd, px, cellGapPx);
    if (!layout) continue;
    if (layout.contentWidth > availableWidth) continue;
    if (useHeight && layout.contentHeight > availableHeight) continue;
    best = px;
  }
  return best;
}

/** Number of single-market triple-lens strips (Technology, Trading, Risk) — stacked vertically in contribution mode. */
export const SINGLE_MARKET_TRIPLE_LENS_COLUMN_COUNT = 3;

/**
 * Label row above each lens column: matches compare strip `mb-1.5` + `h-[28px]` (tighter than market stickers).
 */
export const SINGLE_MARKET_TRIPLE_LENS_HEADER_STACK_PX = 6 + 28;

/**
 * Triple-lens stacked mode: vertical span of the left lens **label rail** (heatmap cell rows), not the full
 * contribution strip row (which includes weekday gutter + axis on the bottom lens).
 */
export const SINGLE_MARKET_TRIPLE_LENS_RAIL_CELL_ROWS = 7;

export function tripleLensStackRailHeightPx(
  cellPx: number,
  cellGapPx: number = RUNWAY_CELL_GAP_PX,
): number {
  const stride = cellPx + cellGapPx;
  return SINGLE_MARKET_TRIPLE_LENS_RAIL_CELL_ROWS * stride - cellGapPx;
}

/**
 * Triple-lens stacked contribution strips: tech weekly sparkline, two compact grid-only strips, one full strip
 * (with month axis), and small vertical gaps. Lens titles sit in a short left rail (see
 * {@link tripleLensStackRailHeightPx}), not full strip height.
 */
export function tripleLensStackedContributionTotalContentHeightPx(
  fullStripContentHeight: number,
  cellPx: number,
  cellGapPx: number = RUNWAY_CELL_GAP_PX,
  rowGapPx: number = SINGLE_MARKET_TRIPLE_LENS_VERTICAL_GAP_PX,
): number {
  const n = SINGLE_MARKET_TRIPLE_LENS_COLUMN_COUNT;
  const compact = contributionStripGridOnlyContentHeightPx(cellPx, cellGapPx);
  return (
    SINGLE_MARKET_TRIPLE_LENS_TECH_SPARK_ABOVE_PX +
    (n - 1) * compact +
    fullStripContentHeight +
    (n - 1) * rowGapPx
  );
}

/**
 * Largest stepped cell size so three single-market lens columns (compare-style width) plus shared gutter
 * fit `availableWidth`, and one vertical month stack fits `availableHeight` with the lens header row.
 */
export const SINGLE_MARKET_STACKED_STRIP_GAP_PX = 24;

/**
 * Largest cell size so **one** lens column + gutter fits the width, and **three** stacked strips
 * (headers + vertical month layout + gaps) fit the available height.
 */
export function bestCellPxForSingleMarketStackedLensFit(
  availableWidth: number,
  availableHeight: number,
  sortedDatesYmd: string[],
): number {
  if (!sortedDatesYmd.length || !Number.isFinite(availableWidth) || availableWidth <= 0) {
    return RUNWAY_COMPARE_FIT_CELL_PX_MIN;
  }
  const useHeight =
    Number.isFinite(availableHeight) && availableHeight >= RUNWAY_COMPARE_FIT_MIN_VIEWPORT_H;
  const stripCount = SINGLE_MARKET_TRIPLE_LENS_COLUMN_COUNT;
  const perHeader = SINGLE_MARKET_TRIPLE_LENS_HEADER_STACK_PX + 6;
  let best = RUNWAY_COMPARE_FIT_CELL_PX_MIN;
  for (
    let px = RUNWAY_COMPARE_FIT_CELL_PX_MIN;
    px <= RUNWAY_COMPARE_FIT_CELL_PX_MAX;
    px += RUNWAY_COMPARE_FIT_CELL_PX_STEP
  ) {
    if (compareAllRunwayTotalContentWidthPx(px, 1) > availableWidth) continue;
    if (useHeight) {
      const layout = buildVerticalMonthsRunwayLayout(sortedDatesYmd, px);
      if (!layout) continue;
      const stackH =
        stripCount * (perHeader + layout.contentHeight) + (stripCount - 1) * SINGLE_MARKET_STACKED_STRIP_GAP_PX;
      if (stackH > availableHeight) continue;
    }
    best = px;
  }
  return best;
}

export function bestCellPxForSingleMarketTripleColumnFit(
  availableWidth: number,
  availableHeight: number,
  sortedDatesYmd: string[],
  cellGapPx: number = RUNWAY_CELL_GAP_PX
): number {
  if (!sortedDatesYmd.length || !Number.isFinite(availableWidth) || availableWidth <= 0) {
    return RUNWAY_COMPARE_FIT_CELL_PX_MIN;
  }
  const useHeight =
    Number.isFinite(availableHeight) && availableHeight >= RUNWAY_COMPARE_FIT_MIN_VIEWPORT_H;
  let best = RUNWAY_COMPARE_FIT_CELL_PX_MIN;
  for (
    let px = RUNWAY_COMPARE_FIT_CELL_PX_MIN;
    px <= RUNWAY_COMPARE_FIT_CELL_PX_MAX;
    px += RUNWAY_COMPARE_FIT_CELL_PX_STEP
  ) {
    const strip = buildContributionStripRunwayLayout(sortedDatesYmd, px, cellGapPx);
    if (!strip) continue;
    if (tripleLensStackedContributionTotalContentWidthPx(strip.contentWidth) > availableWidth) {
      continue;
    }
    if (useHeight) {
      const totalH = tripleLensStackedContributionTotalContentHeightPx(
        strip.contentHeight,
        px,
        cellGapPx
      );
      if (totalH > availableHeight) continue;
    }
    best = px;
  }
  return best;
}
