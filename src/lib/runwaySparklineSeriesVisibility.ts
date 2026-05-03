const STORAGE_KEY = 'cpm.runway.sparklineTripleSeriesVisible.v1';

export type SparklineTripleSeriesKey = 'tech' | 'trading' | 'risk';

export type SparklineTripleSeriesVisibility = Record<SparklineTripleSeriesKey, boolean>;

export const SPARKLINE_TRIPLE_SERIES_VISIBILITY_DEFAULT: SparklineTripleSeriesVisibility = {
  tech: true,
  trading: true,
  risk: true,
};

export function loadSparklineTripleSeriesVisibility(): SparklineTripleSeriesVisibility {
  const d = SPARKLINE_TRIPLE_SERIES_VISIBILITY_DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...d };
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      tech: typeof p.tech === 'boolean' ? p.tech : d.tech,
      trading: typeof p.trading === 'boolean' ? p.trading : d.trading,
      risk: typeof p.risk === 'boolean' ? p.risk : d.risk,
    };
  } catch {
    return { ...d };
  }
}

export function saveSparklineTripleSeriesVisibility(next: SparklineTripleSeriesVisibility): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}
