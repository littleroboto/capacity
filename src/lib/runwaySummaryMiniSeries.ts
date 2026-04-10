import type { RiskRow } from '@/engine/riskModel';
import { DEFAULT_RISK_TUNING, type RiskModelTuning } from '@/engine/riskModelTuning';
import { transformedHeatmapMetric, type HeatmapColorOpts } from '@/lib/riskHeatmapColors';
import { inStoreHeatmapMetric } from '@/lib/runwayViewMetrics';

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

  const weeks: { d: number; c: number; dr: number; st: number }[] = [];
  for (let i = 0; i < sorted.length; i += 7) {
    const chunk = sorted.slice(i, Math.min(i + 7, sorted.length));
    if (chunk.length < 3) break;
    const n = chunk.length;
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

  return { demand, capacity, deploymentRisk, storeTrading01 };
}

/**
 * X coordinate in mini-chart viewBox space for a heatmap-selected ISO day (`YYYY-MM-DD`),
 * using the same weekly buckets and resampling span as {@link extractRunwayMiniSeries}.
 */
export function miniChartXForDayYmd(
  dayYmd: string,
  rows: RiskRow[],
  market: string,
  lay: { padL: number; padR: number; vbW: number },
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

  const innerW = lay.vbW - lay.padL - lay.padR;
  const denomW = Math.max(numWeeks - 1, 1);
  const denomJ = Math.max(targetPts - 1, 1);
  const jFloat = (weekIdx / denomW) * denomJ;
  const x = lay.padL + (innerW * jFloat) / denomJ;
  const xl = lay.padL;
  const xr = lay.vbW - lay.padR;
  return Math.min(xr, Math.max(xl, x));
}
