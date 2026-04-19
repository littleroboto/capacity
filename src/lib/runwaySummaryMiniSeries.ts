import { parseDate } from '@/engine/calendar';
import type { RiskRow } from '@/engine/riskModel';
import { DEFAULT_RISK_TUNING, type RiskModelTuning } from '@/engine/riskModelTuning';
import { monthKeysOverlappingIsoRangeInclusive } from '@/lib/runwayDateFilter';
import { formatDateYmd } from '@/lib/weekRunway';
import { transformedHeatmapMetric, type HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { inStoreHeatmapMetric, technologyHeatmapMetricForSurfaces } from '@/lib/runwayViewMetrics';

const DEFAULT_PTS = 48;

/** Cap for day-mode mini series length (performance / SVG path size). */
export const MAX_DAY_MINI_SERIES_PTS = 512;

/** `week`: rolling 7-day means (default). `day`: one sample per ISO row in the visible range. */
export type MiniSeriesAggregation = 'week' | 'day';

/** Point count after {@link extractRunwayMiniSeries}; day mode keeps one sample per visible row by default. */
export function effectiveMiniSeriesTargetPts(
  sortedLen: number,
  aggregation: MiniSeriesAggregation,
  opts?: ExtractRunwayMiniSeriesOpts,
): number {
  if (aggregation === 'day' && opts?.targetPts == null) {
    return Math.min(Math.max(sortedLen, 2), MAX_DAY_MINI_SERIES_PTS);
  }
  return opts?.targetPts ?? DEFAULT_PTS;
}

function sortedRiskRowsForMiniChart(
  rows: RiskRow[],
  market: string,
  opts?: ExtractRunwayMiniSeriesOpts,
): RiskRow[] | null {
  const vr = opts?.visibleDateRange;
  const sorted = rows
    .filter((r) => {
      if (r.market !== market) return false;
      if (!vr) return true;
      return r.date >= vr.start && r.date <= vr.end;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return sorted.length >= 14 ? sorted : null;
}

function resampleToN(arr: number[], n: number): number[] {
  if (arr.length === 0) return Array(n).fill(0) as number[];
  if (arr.length === n) return arr.slice();
  return Array.from({ length: n }, (_, i) => {
    const src = (i / Math.max(n - 1, 1)) * (arr.length - 1);
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, arr.length - 1);
    const f = src - lo;
    return arr[lo] * (1 - f) + arr[hi] * f;
  });
}

export type RunwayMiniSeries = {
  demand: number[];
  capacity: number[];
  deploymentRisk: number[];
  /** 0–1 after same display path as Restaurant Activity heatmap when {@link ExtractRunwayMiniSeriesOpts.inStoreHeatmapColorOpts} is set. */
  storeTrading01: number[];
  /**
   * Technology lens only: mean of uncapped demand ratios by surface group per bucket (week or day), resampled,
   * then renormalised so the three shares sum to 1 at each point (BAU / campaign / programmes & coordination).
   */
  techWorkloadMix: {
    bauShare: number[];
    campaignShare: number[];
    projectShare: number[];
  };
};

export type ExtractRunwayMiniSeriesOpts = {
  targetPts?: number;
  tuning?: RiskModelTuning;
  /**
   * Inclusive ISO bounds aligned with the runway heatmap’s visible date span (picker year/quarter + following quarter).
   * When omitted, uses all rows for the market (legacy behaviour).
   */
  visibleDateRange?: { start: string; end: string };
  /**
   * When set, each day’s store value uses {@link transformedHeatmapMetric} for `in_store` (pressure offset + transfer),
   * matching runway cell colour logic; weekly points are the mean of those displayed values.
   */
  inStoreHeatmapColorOpts?: HeatmapColorOpts;
  /**
   * When set, deployment-risk weekly values use {@link transformedHeatmapMetric} for `market_risk`, matching
   * Deployment Risk heatmap cells.
   */
  marketRiskHeatmapColorOpts?: HeatmapColorOpts;
  /** Default `week`. `day`: one sample per calendar row; when `targetPts` is omitted, output length follows visible days (capped). */
  miniSeriesAggregation?: MiniSeriesAggregation;
};

type MiniAggRow = { d: number; c: number; dr: number; st: number; bau: number; camp: number; proj: number };

function buildWeeklyBuckets(
  sorted: RiskRow[],
  tuning: RiskModelTuning,
  opts?: ExtractRunwayMiniSeriesOpts,
): MiniAggRow[] | null {
  const weeks: MiniAggRow[] = [];
  for (let i = 0; i < sorted.length; i += 7) {
    const chunk = sorted.slice(i, Math.min(i + 7, sorted.length));
    if (chunk.length < 3) break;
    const n = chunk.length;
    let bau = 0;
    let camp = 0;
    let proj = 0;
    for (const r of chunk) {
      bau += technologyHeatmapMetricForSurfaces(r, ['bau']);
      camp += technologyHeatmapMetricForSurfaces(r, ['campaign']);
      proj += technologyHeatmapMetricForSurfaces(r, ['change', 'coordination', 'carryover']);
    }
    bau /= n;
    camp /= n;
    proj /= n;
    weeks.push({
      d: chunk.reduce((s, r) => s + (r.lab_load ?? 0) + (r.team_load ?? 0), 0) / n,
      c:
        chunk.reduce(
          (s, r) => s + (r.labs_effective_cap ?? 0) + (r.teams_effective_cap ?? 0),
          0,
        ) / n,
      dr: chunk.reduce((s, r) => {
        const raw = Math.min(1, Math.max(0, r.deployment_risk_01 ?? 0));
        const v =
          opts?.marketRiskHeatmapColorOpts != null
            ? transformedHeatmapMetric('market_risk', raw, opts.marketRiskHeatmapColorOpts)
            : raw;
        return s + v;
      }, 0) / n,
      st: chunk.reduce((s, r) => {
        const raw = inStoreHeatmapMetric(r, tuning);
        const v =
          opts?.inStoreHeatmapColorOpts != null
            ? transformedHeatmapMetric('in_store', raw, opts.inStoreHeatmapColorOpts)
            : raw;
        return s + v;
      }, 0) / n,
      bau,
      camp,
      proj,
    });
  }
  if (weeks.length < 4) return null;
  return weeks;
}

function buildDailyBuckets(sorted: RiskRow[], tuning: RiskModelTuning, opts?: ExtractRunwayMiniSeriesOpts): MiniAggRow[] | null {
  const days: MiniAggRow[] = [];
  for (const r of sorted) {
    const bau = technologyHeatmapMetricForSurfaces(r, ['bau']);
    const camp = technologyHeatmapMetricForSurfaces(r, ['campaign']);
    const proj = technologyHeatmapMetricForSurfaces(r, ['change', 'coordination', 'carryover']);
    const rawDr = Math.min(1, Math.max(0, r.deployment_risk_01 ?? 0));
    const dr =
      opts?.marketRiskHeatmapColorOpts != null
        ? transformedHeatmapMetric('market_risk', rawDr, opts.marketRiskHeatmapColorOpts)
        : rawDr;
    const rawSt = inStoreHeatmapMetric(r, tuning);
    const st =
      opts?.inStoreHeatmapColorOpts != null
        ? transformedHeatmapMetric('in_store', rawSt, opts.inStoreHeatmapColorOpts)
        : rawSt;
    days.push({
      d: (r.lab_load ?? 0) + (r.team_load ?? 0),
      c: (r.labs_effective_cap ?? 0) + (r.teams_effective_cap ?? 0),
      dr: Math.min(1, Math.max(0, dr)),
      st: Math.min(1, Math.max(0, st)),
      bau,
      camp,
      proj,
    });
  }
  if (days.length < 4) return null;
  return days;
}

/**
 * Weekly- or daily-aggregated, resampled series for small runway summary charts (single market).
 */
export function extractRunwayMiniSeries(
  rows: RiskRow[],
  market: string,
  opts?: ExtractRunwayMiniSeriesOpts,
): RunwayMiniSeries | null {
  const tuning = opts?.tuning ?? DEFAULT_RISK_TUNING;
  const sorted = sortedRiskRowsForMiniChart(rows, market, opts);
  if (!sorted) return null;

  const aggregation = opts?.miniSeriesAggregation ?? 'week';
  const targetPts = effectiveMiniSeriesTargetPts(sorted.length, aggregation, opts);
  const buckets =
    aggregation === 'day' ? buildDailyBuckets(sorted, tuning, opts) : buildWeeklyBuckets(sorted, tuning, opts);
  if (!buckets) return null;

  const peak = Math.max(...buckets.flatMap((w) => [w.d, w.c]), 1e-9);
  const s = (v: number) => (v / peak) * 0.92;

  const demand = resampleToN(
    buckets.map((w) => s(w.d)),
    targetPts,
  );
  const capacity = resampleToN(
    buckets.map((w) => s(w.c)),
    targetPts,
  );
  const deploymentRisk = resampleToN(
    buckets.map((w) => Math.min(1, Math.max(0, w.dr))),
    targetPts,
  );
  const storeTrading01 = resampleToN(
    buckets.map((w) => Math.min(1, Math.max(0, w.st))),
    targetPts,
  );

  const rsB = resampleToN(
    buckets.map((w) => w.bau),
    targetPts,
  );
  const rsC = resampleToN(
    buckets.map((w) => w.camp),
    targetPts,
  );
  const rsP = resampleToN(
    buckets.map((w) => w.proj),
    targetPts,
  );
  const bauShare: number[] = [];
  const campaignShare: number[] = [];
  const projectShare: number[] = [];
  for (let i = 0; i < targetPts; i++) {
    const b = rsB[i]!;
    const c = rsC[i]!;
    const p = rsP[i]!;
    const sum = b + c + p;
    if (sum < 1e-12) {
      bauShare.push(1 / 3);
      campaignShare.push(1 / 3);
      projectShare.push(1 / 3);
    } else {
      bauShare.push(b / sum);
      campaignShare.push(c / sum);
      projectShare.push(p / sum);
    }
  }

  return {
    demand,
    capacity,
    deploymentRisk,
    storeTrading01,
    techWorkloadMix: { bauShare, campaignShare, projectShare },
  };
}

function addOneIsoDay(ymd: string): string {
  const d = parseDate(ymd);
  d.setDate(d.getDate() + 1);
  return formatDateYmd(d);
}

/** Exclusive calendar days between `rangeEndYmd` and `nextStartYmd` (each endpoint is an over-cap day). */
function exclusiveCalendarGapDays(rangeEndYmd: string, nextStartYmd: string): number {
  const a = parseDate(rangeEndYmd);
  const b = parseDate(nextStartYmd);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  const steps = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return Math.max(0, steps - 1);
}

/**
 * Join adjacent over-cap runs when the gap between them is only a few calendar days of at-or-under
 * capacity (so weekend-sized dips or short relief do not explode the list).
 */
function mergeDemandOverCapRangesBridgingShortGaps(
  ranges: DemandExceedsCapacityIsoRange[],
  maxExclusiveGapDays: number,
): DemandExceedsCapacityIsoRange[] {
  if (ranges.length <= 1) return ranges;
  const out = [ranges[0]!];
  for (let i = 1; i < ranges.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = ranges[i]!;
    const gap = exclusiveCalendarGapDays(prev.dateEnd, cur.dateStart);
    if (gap <= maxExclusiveGapDays) {
      out[out.length - 1] = { dateStart: prev.dateStart, dateEnd: cur.dateEnd };
    } else {
      out.push(cur);
    }
  }
  return out;
}

/** Inclusive ISO date span where daily lab+team load exceeds effective caps. */
export type DemandExceedsCapacityIsoRange = { dateStart: string; dateEnd: string };

/** Max calendar days strictly between two over-cap runs to still show them as one range in the UI list. */
export const DEMAND_OVER_CAP_LIST_MAX_EXCLUSIVE_GAP_DAYS = 10;

const FMT_DAY_MONTH = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const FMT_DAY_MONTH_YEAR = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** Human-readable span for overload list rows (locale-aware short dates). */
export function formatDemandOverCapRangeDisplay(r: DemandExceedsCapacityIsoRange): string {
  const a = parseDate(r.dateStart);
  const b = parseDate(r.dateEnd);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  if (r.dateStart === r.dateEnd) {
    return FMT_DAY_MONTH_YEAR.format(a);
  }
  const yA = a.getFullYear();
  const yB = b.getFullYear();
  const sameYear = yA === yB;
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  if (sameMonth) {
    return `${a.getDate()}–${b.getDate()} ${FMT_DAY_MONTH.format(a)} ${yA}`;
  }
  if (sameYear) {
    return `${FMT_DAY_MONTH.format(a)} – ${FMT_DAY_MONTH_YEAR.format(b)}`;
  }
  return `${FMT_DAY_MONTH_YEAR.format(a)} – ${FMT_DAY_MONTH_YEAR.format(b)}`;
}

/**
 * Merge consecutive calendar days where `(lab_load + team_load) > (labs_effective_cap + teams_effective_cap)`.
 * Matches the raw totals averaged into weekly demand/capacity in {@link extractRunwayMiniSeries} (before peak normalisation).
 *
 * After strict runs are built, adjacent runs separated by at most {@link DEMAND_OVER_CAP_LIST_MAX_EXCLUSIVE_GAP_DAYS}
 * calendar days are merged for a shorter summary list (gap days may be at or under capacity).
 */
export function demandExceedsCapacityIsoRanges(
  rows: RiskRow[],
  market: string,
  visibleDateRange: { start: string; end: string },
): DemandExceedsCapacityIsoRange[] {
  const sorted = rows
    .filter(
      (r) => r.market === market && r.date >= visibleDateRange.start && r.date <= visibleDateRange.end,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const over = sorted.filter((r) => {
    const demand = (r.lab_load ?? 0) + (r.team_load ?? 0);
    const cap = (r.labs_effective_cap ?? 0) + (r.teams_effective_cap ?? 0);
    return demand > cap;
  });

  if (over.length === 0) return [];

  const ranges: DemandExceedsCapacityIsoRange[] = [];
  let runStart = over[0]!.date;
  let runEnd = over[0]!.date;
  for (let i = 1; i < over.length; i++) {
    const ymd = over[i]!.date;
    if (ymd === addOneIsoDay(runEnd)) {
      runEnd = ymd;
    } else {
      ranges.push({ dateStart: runStart, dateEnd: runEnd });
      runStart = ymd;
      runEnd = ymd;
    }
  }
  ranges.push({ dateStart: runStart, dateEnd: runEnd });
  return mergeDemandOverCapRangesBridgingShortGaps(ranges, DEMAND_OVER_CAP_LIST_MAX_EXCLUSIVE_GAP_DAYS);
}

/**
 * X coordinate in mini-chart viewBox space for a heatmap-selected ISO day (`YYYY-MM-DD`),
 * using the same weekly buckets and resampling span as {@link extractRunwayMiniSeries}.
 */
/** One calendar month: mean daily demand/cap ratios per slice (uncapped), before mix renormalisation. */
export type TechMixMonthlyRow = {
  monthKey: string;
  /** False when no risk rows exist for this month inside the visible range (heatmap still shows the month). */
  hasData: boolean;
  bauMean: number;
  campMean: number;
  /** Mean load for the stacked top segment (change, coordination, carryover)—matches combined violet slice. */
  projMean: number;
  /**
   * Mean load for the **Project work** workload filter (includes campaign surface)—matches Technology heatmap when that
   * filter is active.
   */
  projectScopeMean: number;
};

/** One calendar month in the visible runway: mean tech loads renormalised to shares (sum ≈ 1). */
export type TechMixMonthBar = {
  monthKey: string;
  hasData: boolean;
  bauShare: number;
  campaignShare: number;
  projectShare: number;
};

/**
 * Monthly buckets of mean BAU / campaign / programme-style loads (same surfaces as {@link extractRunwayMiniSeries} mix).
 */
export function extractTechMixMonthlyRows(
  rows: RiskRow[],
  market: string,
  visibleDateRange: { start: string; end: string },
): TechMixMonthlyRow[] | null {
  const monthKeys = monthKeysOverlappingIsoRangeInclusive(
    visibleDateRange.start,
    visibleDateRange.end,
  );
  if (monthKeys.length === 0) return null;

  const sorted = rows
    .filter(
      (r) => r.market === market && r.date >= visibleDateRange.start && r.date <= visibleDateRange.end,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 1) {
    return monthKeys.map((monthKey) => ({
      monthKey,
      hasData: false,
      bauMean: 0,
      campMean: 0,
      projMean: 0,
      projectScopeMean: 0,
    }));
  }

  const byMonth = new Map<
    string,
    { bau: number; camp: number; proj: number; projScope: number; n: number }
  >();
  for (const r of sorted) {
    const mk = r.date.slice(0, 7);
    let g = byMonth.get(mk);
    if (!g) {
      g = { bau: 0, camp: 0, proj: 0, projScope: 0, n: 0 };
      byMonth.set(mk, g);
    }
    g.bau += technologyHeatmapMetricForSurfaces(r, ['bau']);
    g.camp += technologyHeatmapMetricForSurfaces(r, ['campaign']);
    g.proj += technologyHeatmapMetricForSurfaces(r, ['change', 'coordination', 'carryover']);
    g.projScope += technologyHeatmapMetricForSurfaces(r, [
      'change',
      'campaign',
      'coordination',
      'carryover',
    ]);
    g.n += 1;
  }

  return monthKeys.map((k) => {
    const g = byMonth.get(k);
    if (!g || g.n < 1) {
      return {
        monthKey: k,
        hasData: false,
        bauMean: 0,
        campMean: 0,
        projMean: 0,
        projectScopeMean: 0,
      };
    }
    return {
      monthKey: k,
      hasData: true,
      bauMean: g.bau / g.n,
      campMean: g.camp / g.n,
      projMean: g.proj / g.n,
      projectScopeMean: g.projScope / g.n,
    };
  });
}

export function techMixMonthlyRowsToShares(rows: TechMixMonthlyRow[]): TechMixMonthBar[] {
  return rows.map((r) => {
    if (!r.hasData) {
      return {
        monthKey: r.monthKey,
        hasData: false,
        bauShare: 0,
        campaignShare: 0,
        projectShare: 0,
      };
    }
    const sum = r.bauMean + r.campMean + r.projMean;
    if (sum < 1e-12) {
      return {
        monthKey: r.monthKey,
        hasData: true,
        bauShare: 1 / 3,
        campaignShare: 1 / 3,
        projectShare: 1 / 3,
      };
    }
    return {
      monthKey: r.monthKey,
      hasData: true,
      bauShare: r.bauMean / sum,
      campaignShare: r.campMean / sum,
      projectShare: r.projMean / sum,
    };
  });
}

/**
 * Monthly buckets of BAU / campaign / programme-style load shares for the Technology mix stacked bar chart.
 */
export function extractTechMixMonthlyShares(
  rows: RiskRow[],
  market: string,
  visibleDateRange: { start: string; end: string },
): TechMixMonthBar[] | null {
  const raw = extractTechMixMonthlyRows(rows, market, visibleDateRange);
  return raw ? techMixMonthlyRowsToShares(raw) : null;
}

/** Horizontal gap between month columns in mix bar mini-chart (viewBox units). */
export const TECH_MIX_MINI_BAR_GAP_VB = 0;

/** Horizontal centre of the month column that contains `dayYmd` (for selection marker on mix bar chart). */
export function miniChartMonthBarCenterX(
  dayYmd: string,
  rows: RiskRow[],
  market: string,
  lay: { padL: number; padR: number; vbW: number },
  visibleDateRange: { start: string; end: string },
): number | null {
  const months = extractTechMixMonthlyRows(rows, market, visibleDateRange);
  if (!months?.length) return null;
  const monthKey = dayYmd.slice(0, 7);
  const idx = months.findIndex((m) => m.monthKey === monthKey);
  if (idx < 0) return null;

  const innerW = lay.vbW - lay.padL - lay.padR;
  const n = months.length;
  const bw = (innerW - (n - 1) * TECH_MIX_MINI_BAR_GAP_VB) / n;
  const xl = lay.padL;
  const xr = lay.vbW - lay.padR;
  const xCenter = xl + idx * (bw + TECH_MIX_MINI_BAR_GAP_VB) + bw / 2;
  return Math.min(xr, Math.max(xl + bw / 2, xCenter));
}

/**
 * Resampled data-space index (0 … targetPts-1) for `dayYmd` (week bucket or calendar row, matching
 * {@link extractRunwayMiniSeries} aggregation).
 */
export function miniChartDataIndexForDayYmd(
  dayYmd: string,
  rows: RiskRow[],
  market: string,
  opts?: ExtractRunwayMiniSeriesOpts,
): number | null {
  const sorted = sortedRiskRowsForMiniChart(rows, market, opts);
  if (!sorted) return null;

  const aggregation = opts?.miniSeriesAggregation ?? 'week';
  const targetPts = effectiveMiniSeriesTargetPts(sorted.length, aggregation, opts);
  const denomJ = Math.max(targetPts - 1, 1);

  if (aggregation === 'day') {
    const dayIdx = sorted.findIndex((r) => r.date === dayYmd);
    if (dayIdx < 0) return null;
    const denomD = Math.max(sorted.length - 1, 1);
    return (dayIdx / denomD) * denomJ;
  }

  let weekIdx = -1;
  let numWeeks = 0;
  for (let i = 0; i < sorted.length; i += 7) {
    const chunk = sorted.slice(i, Math.min(i + 7, sorted.length));
    if (chunk.length < 3) break;
    if (chunk.some((r) => r.date === dayYmd)) weekIdx = numWeeks;
    numWeeks++;
  }
  if (weekIdx < 0 || numWeeks < 4) return null;

  const denomW = Math.max(numWeeks - 1, 1);
  return (weekIdx / denomW) * denomJ;
}

export function miniChartXForDayYmd(
  dayYmd: string,
  rows: RiskRow[],
  market: string,
  lay: { padL: number; padR: number; vbW: number },
  opts?: ExtractRunwayMiniSeriesOpts,
): number | null {
  const idx = miniChartDataIndexForDayYmd(dayYmd, rows, market, opts);
  if (idx == null) return null;
  const sorted = sortedRiskRowsForMiniChart(rows, market, opts);
  if (!sorted) return null;
  const aggregation = opts?.miniSeriesAggregation ?? 'week';
  const targetPts = effectiveMiniSeriesTargetPts(sorted.length, aggregation, opts);
  const innerW = lay.vbW - lay.padL - lay.padR;
  const denomJ = Math.max(targetPts - 1, 1);
  const x = lay.padL + (innerW * idx) / denomJ;
  const xl = lay.padL;
  const xr = lay.vbW - lay.padR;
  return Math.min(xr, Math.max(xl, x));
}
