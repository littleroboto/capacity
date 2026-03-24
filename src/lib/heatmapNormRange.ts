import type { RunwayNormRange } from '@/lib/riskHeatmapColors';

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  const t = pos - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

/**
 * Robust min/max for runway heatmaps so a ceiling at 1.0 (or a few outliers) does not collapse the palette.
 */
export function percentileNormRange(
  values: number[],
  opts?: { lo?: number; hi?: number; minSpan?: number; clamp01?: boolean }
): RunwayNormRange {
  const lo = opts?.lo ?? 0.05;
  const hi = opts?.hi ?? 0.95;
  const minSpan = opts?.minSpan ?? 0.14;
  const clamp01 = opts?.clamp01 ?? false;

  if (values.length === 0) return { min: 0, max: 1 };
  const sorted = [...values].sort((a, b) => a - b);
  let min = quantile(sorted, lo);
  let max = quantile(sorted, hi);

  if (max <= min + 1e-6) {
    min = sorted[0]!;
    max = sorted[sorted.length - 1]!;
  }
  if (max <= min + 1e-6) {
    return { min: 0, max: 1 };
  }

  let span = max - min;
  if (span < minSpan) {
    const mid = (min + max) / 2;
    const half = minSpan / 2;
    min = mid - half;
    max = mid + half;
    if (clamp01) {
      min = Math.max(0, min);
      max = Math.min(1, max);
      if (max <= min + 1e-6) return { min: 0, max: 1 };
    } else {
      min = Math.max(0, min);
    }
  }

  return { min, max };
}
