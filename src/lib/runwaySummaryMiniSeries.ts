import type { RiskRow } from '@/engine/riskModel';
import { DEFAULT_RISK_TUNING, type RiskModelTuning } from '@/engine/riskModelTuning';
import { monthKeysOverlappingIsoRangeInclusive } from '@/lib/runwayDateFilter';
import { transformedHeatmapMetric, type HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { inStoreHeatmapMetric, technologyHeatmapMetricForSurfaces } from '@/lib/runwayViewMetrics';

const DEFAULT_PTS = 48;

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
   * Technology lens only: weekly mean of uncapped demand ratios by surface group, resampled, then renormalised
   * so the three shares sum to 1 at each point (BAU / campaign / programmes & coordination).
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
};

/**
 * Weekly-aggregated, resampled series for small runway summary charts (single market).
 */
export function extractRunwayMiniSeries(
  rows: RiskRow[],
  market: string,
  opts?: ExtractRunwayMiniSeriesOpts,
): RunwayMiniSeries | null {
  const targetPts = opts?.targetPts ?? DEFAULT_PTS;
  const tuning = opts?.tuning ?? DEFAULT_RISK_TUNING;
  const vr = opts?.visibleDateRange;
  const sorted = rows
    .filter((r) => {
      if (r.market !== market) return false;
      if (!vr) return true;
      return r.date >= vr.start && r.date <= vr.end;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 14) return null;

  const weeks: { d: number; c: number; dr: number; st: number; bau: number; camp: number; proj: number }[] = [];
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

  const peak = Math.max(...weeks.flatMap((w) => [w.d, w.c]), 1e-9);
  const s = (v: number) => (v / peak) * 0.92;

  const demand = resampleToN(
    weeks.map((w) => s(w.d)),
    targetPts,
  );
  const capacity = resampleToN(
    weeks.map((w) => s(w.c)),
    targetPts,
  );
  const deploymentRisk = resampleToN(
    weeks.map((w) => Math.min(1, Math.max(0, w.dr))),
    targetPts,
  );
  const storeTrading01 = resampleToN(
    weeks.map((w) => Math.min(1, Math.max(0, w.st))),
    targetPts,
  );

  const rsB = resampleToN(
    weeks.map((w) => w.bau),
    targetPts,
  );
  const rsC = resampleToN(
    weeks.map((w) => w.camp),
    targetPts,
  );
  const rsP = resampleToN(
    weeks.map((w) => w.proj),
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
 * Resampled data-space index (0 … targetPts-1) for the week bucket containing `dayYmd`.
 * Used by XYChart-based charts where the x scale maps data indices to pixels.
 */
export function miniChartDataIndexForDayYmd(
  dayYmd: string,
  rows: RiskRow[],
  market: string,
  opts?: ExtractRunwayMiniSeriesOpts,
): number | null {
  const targetPts = opts?.targetPts ?? DEFAULT_PTS;
  const vr = opts?.visibleDateRange;
  const sorted = rows
    .filter((r) => {
      if (r.market !== market) return false;
      if (!vr) return true;
      return r.date >= vr.start && r.date <= vr.end;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 14) return null;

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
  const denomJ = Math.max(targetPts - 1, 1);
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
  const targetPts = opts?.targetPts ?? DEFAULT_PTS;
  const innerW = lay.vbW - lay.padL - lay.padR;
  const denomJ = Math.max(targetPts - 1, 1);
  const x = lay.padL + (innerW * idx) / denomJ;
  const xl = lay.padL;
  const xr = lay.vbW - lay.padR;
  return Math.min(xr, Math.max(xl, x));
}
