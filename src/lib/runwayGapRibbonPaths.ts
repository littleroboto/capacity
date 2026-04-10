/**
 * Build closed paths for the ribbon between two normalized 0–1 series (demand vs capacity),
 * as one quad per segment so adjacent segments share edges (no vertical gaps at crossings).
 */

export type GapRibbonLayout = {
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  vbW: number;
  vbH: number;
};

type Pt = { x: number; y: number };

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function toPoints(vals: number[], lay: GapRibbonLayout): Pt[] {
  const innerW = lay.vbW - lay.padL - lay.padR;
  const innerH = lay.vbH - lay.padT - lay.padB;
  const denom = Math.max(vals.length - 1, 1);
  return vals.map((v, i) => ({
    x: lay.padL + (innerW * i) / denom,
    y: lay.padT + (1 - clamp01(v)) * innerH,
  }));
}

function fmtPt(p: Pt): string {
  return `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
}

function quadPath(a: Pt, b: Pt, c: Pt, d: Pt): string {
  return `M ${fmtPt(a)} L ${fmtPt(b)} L ${fmtPt(c)} L ${fmtPt(d)} Z`;
}

function triPath(a: Pt, b: Pt, c: Pt): string {
  return `M ${fmtPt(a)} L ${fmtPt(b)} L ${fmtPt(c)} Z`;
}

function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
  const x3 = c.x, y3 = c.y, x4 = d.x, y4 = d.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
  const lo = -1e-4;
  const hi = 1 + 1e-4;
  if (t < lo || t > hi || u < lo || u > hi) return null;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

export function buildDemandCapacityGapPaths(
  demandVals: number[],
  capVals: number[],
  lay: GapRibbonLayout,
): { over: string; under: string } {
  const n = demandVals.length;
  if (n < 2 || capVals.length !== n) return { over: '', under: '' };
  const dPts = toPoints(demandVals, lay);
  const cPts = toPoints(capVals, lay);
  const eps = 1e-9;

  const sign = (i: number) => {
    const s = demandVals[i] - capVals[i];
    if (Math.abs(s) <= eps) return 0;
    return s > 0 ? 1 : -1;
  };

  const partsOver: string[] = [];
  const partsUnder: string[] = [];

  for (let i = 0; i < n - 1; i++) {
    const k0 = sign(i);
    const k1 = sign(i + 1);
    if (k0 === 0 && k1 === 0) continue;

    const d0 = dPts[i];
    const d1 = dPts[i + 1];
    const c0 = cPts[i];
    const c1 = cPts[i + 1];

    if (k0 >= 0 && k1 >= 0) {
      partsOver.push(quadPath(d0, d1, c1, c0));
    } else if (k0 <= 0 && k1 <= 0) {
      partsUnder.push(quadPath(c0, c1, d1, d0));
    } else {
      const P = segIntersect(d0, d1, c0, c1);
      if (P) {
        if (k0 > 0) {
          partsOver.push(triPath(d0, P, c0));
          partsUnder.push(triPath(d1, P, c1));
        } else {
          partsUnder.push(triPath(c0, P, d0));
          partsOver.push(triPath(d1, P, c1));
        }
      } else if (k0 > 0 || k1 > 0) {
        partsOver.push(quadPath(d0, d1, c1, c0));
      } else {
        partsUnder.push(quadPath(c0, c1, d1, d0));
      }
    }
  }

  return { over: partsOver.join(' '), under: partsUnder.join(' ') };
}

export function pointsForSeries(vals: number[], lay: GapRibbonLayout): Pt[] {
  return toPoints(vals, lay);
}

export function smoothLineThrough(pts: Pt[]): string {
  if (pts.length < 2) return '';
  const f = (n: number) => n.toFixed(2);
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${f(p1.x + (p2.x - p0.x) / 6)},${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)},${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

export function smoothAreaToBaseline(pts: Pt[], lay: GapRibbonLayout): string {
  const line = smoothLineThrough(pts);
  if (!line) return '';
  const base = lay.padT + (lay.vbH - lay.padT - lay.padB);
  const f = (n: number) => n.toFixed(2);
  return `${line} L ${f(pts[pts.length - 1].x)} ${f(base)} L ${f(pts[0].x)} ${f(base)} Z`;
}
