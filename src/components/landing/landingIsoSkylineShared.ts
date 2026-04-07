import type { HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { heatmapColorForViewMode, transformedHeatmapMetric } from '@/lib/riskHeatmapColors';
import type { RunwayCalendarCellValue } from '@/lib/calendarQuarterLayout';
import { contribPanelFill, type IsoLayoutCore } from '@/components/RunwayIsoHeatCell';

/** Landing-page iso previews only — workbench runway keeps 3px gap in `weekRunway`. */
export const LANDING_ISO_SKYLINE_GAP_PX = 1;

/** Same footprint as the main DE landing mock so blocks read identically. */
export const LANDING_ISO_SKYLINE_CELL_PX = 11;

export const LANDING_ISO_SKYLINE_ROW_TOWER_PX = 34;

export const LANDING_ISO_SKYLINE_VIEW = 'combined' as const;

export const LANDING_ISO_SKYLINE_HEATMAP_OPTS: HeatmapColorOpts = {
  riskHeatmapCurve: 'power',
  riskHeatmapGamma: 1,
  riskHeatmapTailPower: 1,
  businessHeatmapPressureOffset: 0,
  renderStyle: 'spectrum',
  heatmapSpectrumMode: 'discrete',
};

export function snapViewBoxDim(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function deckAndColumnY(L: IsoLayoutCore, calH: number, runwayBandH: number): number {
  const deckY = L.canvasH - runwayBandH;
  return deckY - calH - L.dyy * 1.05;
}

/** Map 0–1 synthetic utilisation to the same Technology heat colours + extrusion as the landing DE strip. */
export function syntheticStressToIsoColumnStyle(stress: number): {
  topC: string;
  leftC: string;
  rightC: string;
  height01: number;
} {
  const s = Math.min(1, Math.max(0, stress));
  const fakeHeadroom = 1 - s;
  const height01 = transformedHeatmapMetric(
    LANDING_ISO_SKYLINE_VIEW,
    fakeHeadroom,
    LANDING_ISO_SKYLINE_HEATMAP_OPTS
  );
  const fill = heatmapColorForViewMode(
    LANDING_ISO_SKYLINE_VIEW,
    fakeHeadroom,
    LANDING_ISO_SKYLINE_HEATMAP_OPTS
  );
  return {
    topC: contribPanelFill(fill, 'top'),
    leftC: contribPanelFill(fill, 'left'),
    rightC: contribPanelFill(fill, 'right'),
    height01,
  };
}

export function buildConsecutiveMondayWeekRows(
  startMondayYmd: string,
  nWeeks: number
): RunwayCalendarCellValue[][] {
  const [y, m, d] = startMondayYmd.split('-').map(Number);
  const cur = new Date(y, m - 1, d);
  const rows: RunwayCalendarCellValue[][] = [];
  for (let w = 0; w < nWeeks; w++) {
    const row: RunwayCalendarCellValue[] = [];
    for (let di = 0; di < 7; di++) {
      row.push(
        `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      );
      cur.setDate(cur.getDate() + 1);
    }
    rows.push(row);
  }
  return rows;
}

/** First chron week index of each new calendar month (oldest-first rows); omits 0 — matches skyline month pack. */
export function computeMonthStartChronWeeks(
  chronWeeksOldestFirst: RunwayCalendarCellValue[][]
): number[] {
  const starts: number[] = [];
  let prevYm: string | null = null;
  for (let wi = 0; wi < chronWeeksOldestFirst.length; wi++) {
    const ymd = chronWeeksOldestFirst[wi]!.find((c): c is string => typeof c === 'string');
    if (!ymd) continue;
    const ym = ymd.slice(0, 7);
    if (prevYm != null && ym !== prevYm) starts.push(wi);
    prevYm = ym;
  }
  return starts.filter((w) => w > 0);
}

const MONTH_3_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Mid-week anchor per calendar month for iso ground labels (chronological week indices). */
export function monthAxisLabelsForChronWeeks(
  chronWeeksOldestFirst: RunwayCalendarCellValue[][]
): { chron: number; text: string }[] {
  const n = chronWeeksOldestFirst.length;
  if (n < 1) return [];
  const starts = computeMonthStartChronWeeks(chronWeeksOldestFirst);
  const boundaries = [0, ...starts, n];
  const out: { chron: number; text: string }[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const s = boundaries[i]!;
    const e = boundaries[i + 1]! - 1;
    if (s > e) continue;
    const mid = Math.floor((s + e) / 2);
    const ymd = chronWeeksOldestFirst[mid]!.find((c): c is string => typeof c === 'string');
    if (!ymd) continue;
    const mo = Number(ymd.split('-')[1]);
    if (!Number.isFinite(mo) || mo < 1 || mo > 12) continue;
    out.push({ chron: mid, text: MONTH_3_SHORT[mo - 1] ?? '' });
  }
  return out;
}
