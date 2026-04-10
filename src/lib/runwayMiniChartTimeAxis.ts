import { parseDate } from '@/engine/calendar';
import type { GapRibbonLayout } from '@/lib/runwayGapRibbonPaths';

export type MiniTimeAxisMark = {
  x: number;
  text: string;
  /** Nearer the plot baseline (smaller y in SVG = higher on screen for labels below axis). */
  tier: 'year' | 'quarter';
};

type RunwayQ = 1 | 2 | 3 | 4;

function ymdFrom(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseYmd(ymd: string): { y: number; m: number } {
  const [y, m] = ymd.split('-').map(Number);
  return { y, m };
}

function quarterStartYmd(year: number, q: RunwayQ): string {
  const month = (q - 1) * 3 + 1;
  return ymdFrom(year, month, 1);
}

/** First calendar quarter start (Jan / Apr / Jul / Oct) on or after `startYmd`. */
function firstQuarterStartOnOrAfter(startYmd: string): { ymd: string; q: number } {
  const { y, m } = parseYmd(startYmd);
  let q = (Math.floor((m - 1) / 3) + 1) as RunwayQ;
  let year = y;
  let ymd = quarterStartYmd(year, q);
  if (ymd < startYmd) {
    let nq = q + 1;
    let ny = year;
    if (nq > 4) {
      nq = 1;
      ny += 1;
    }
    q = nq as RunwayQ;
    year = ny;
    ymd = quarterStartYmd(year, q);
  }
  return { ymd, q };
}

function timeFrac(ymd: string, startYmd: string, endYmd: string): number {
  const t = parseDate(ymd).getTime();
  const t0 = parseDate(startYmd).getTime();
  const t1 = parseDate(endYmd).getTime();
  if (t1 <= t0) return 0.5;
  return Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
}

function xForYmd(
  ymd: string,
  startYmd: string,
  endYmd: string,
  lay: GapRibbonLayout,
): number {
  const innerW = lay.vbW - lay.padL - lay.padR;
  return lay.padL + timeFrac(ymd, startYmd, endYmd) * innerW;
}

/** Drop marks that crowd each other horizontally (keep earlier; prefer year over quarter when replacing). */
function filterMinGap(marks: MiniTimeAxisMark[], minGap: number): MiniTimeAxisMark[] {
  const sorted = [...marks].sort((a, b) => a.x - b.x);
  const out: MiniTimeAxisMark[] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(m.x - last.x) < minGap) {
      if (m.tier === 'year' && last.tier === 'quarter') {
        out[out.length - 1] = m;
      }
      continue;
    }
    out.push(m);
  }
  return out;
}

/**
 * X-axis time marks for runway mini charts: quarters (Q1–Q4) and Jan 1 years as two-digit `'YY`.
 * Positions match linear calendar mapping over [startYmd, endYmd] (heatmap span).
 */
export function buildRunwayMiniTimeAxisMarks(
  startYmd: string,
  endYmd: string,
  lay: GapRibbonLayout,
): { years: MiniTimeAxisMark[]; quarters: MiniTimeAxisMark[] } {
  const quarterMarks: MiniTimeAxisMark[] = [];
  let cur = firstQuarterStartOnOrAfter(startYmd);
  while (cur.ymd <= endYmd) {
    quarterMarks.push({
      x: xForYmd(cur.ymd, startYmd, endYmd, lay),
      text: `Q${cur.q}`,
      tier: 'quarter',
    });
    const { y } = parseYmd(cur.ymd);
    let nq = cur.q + 1;
    let ny = y;
    if (nq > 4) {
      nq = 1;
      ny += 1;
    }
    cur = { ymd: quarterStartYmd(ny, nq as RunwayQ), q: nq };
  }

  const yearMarks: MiniTimeAxisMark[] = [];
  const y0 = parseYmd(startYmd).y;
  const y1 = parseYmd(endYmd).y;
  for (let year = y0; year <= y1; year++) {
    const jan = `${year}-01-01`;
    if (jan >= startYmd && jan <= endYmd) {
      yearMarks.push({
        x: xForYmd(jan, startYmd, endYmd, lay),
        text: `'${String(year).slice(-2)}`,
        tier: 'year',
      });
    }
  }

  const minGap = Math.max(12, (lay.vbW - lay.padL - lay.padR) * 0.06);
  return {
    years: filterMinGap(yearMarks, minGap),
    quarters: filterMinGap(quarterMarks, minGap),
  };
}

export function textAnchorForMiniAxisX(
  x: number,
  lay: GapRibbonLayout,
): 'start' | 'middle' | 'end' {
  const margin = 18;
  if (x < lay.padL + margin) return 'start';
  if (x > lay.vbW - lay.padR - margin) return 'end';
  return 'middle';
}
