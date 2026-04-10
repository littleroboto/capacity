import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { runPipelineFromDsl } from '@/engine/pipeline';
import { DEFAULT_RISK_TUNING } from '@/engine/riskModelTuning';
import { defaultDslForMarket } from '@/lib/marketDslSeeds';
import { cn } from '@/lib/utils';

/* ── constants ─────────────────────────────────────────── */

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const LANDING_MARKET = 'DE';
/** One vertex per ISO-ish week in the year view (smoother BAU than 12× monthly). */
const N_PTS = 52;
const VB_W = 520;
/** Bottom band: BAU month row + campaign + programmes + month labels. */
const VB_H = 216;
const PAD = { l: 12, r: 12, t: 22, b: 50 } as const;
const INNER_W = VB_W - PAD.l - PAD.r;
const INNER_H = VB_H - PAD.t - PAD.b;
const DENOM = N_PTS - 1;

/** Time between auto-advance steps when section enters view (faster than early landing drafts). */
const CYCLE_MS = 2000;
/** Per-stage curve / fill morph duration. */
const ANIM_MS = 480;
const N_STAGES = 4;

const GANTT_BAR_H = 5;
/** Fixed lane height for per-month BAU bars (bar height scales inside). */
const BAU_MONTH_LANE_H = 5;
const GANTT_LANE_GAP = 3;

/** Mean BAU (0–1) per calendar month from weekly points. */
function avgBauPerMonth(bau: number[]): number[] {
  const out: number[] = [];
  for (let mi = 0; mi < 12; mi++) {
    const i0 = Math.min(N_PTS - 1, Math.floor((mi * N_PTS) / 12));
    const i1 = Math.min(N_PTS, Math.floor(((mi + 1) * N_PTS) / 12));
    let s = 0;
    let n = 0;
    for (let i = i0; i < i1; i++) {
      s += bau[i] ?? 0;
      n++;
    }
    out.push(n > 0 ? s / n : 0);
  }
  return out;
}

function monthColumnRect(mi: number): { x1: number; w: number } {
  const x1 = PAD.l + (INNER_W * mi) / 12;
  const x2 = PAD.l + (INNER_W * (mi + 1)) / 12;
  return { x1: x1 + 0.4, w: Math.max(x2 - x1 - 0.8, 0.8) };
}

/** Stagger Gantt bar width growth as layer opacity ramps (master ∈ [0,1]). */
function ganttBarWidth(
  fullW: number,
  barIndex: number,
  master: number,
  stagger = 0.09,
  ramp = 0.38
): number {
  return fullW * clamp01((master - barIndex * stagger) / ramp);
}

/** Solid fill only where demand exceeds capacity (gap between the two curves). */
const GAP_FILL_OVER = 'rgba(239, 68, 68, 0.55)';

/* ── math helpers ──────────────────────────────────────── */

function clamp01(n: number) { return Math.min(1, Math.max(0, n)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Linear-interpolation resample of an arbitrary-length array to exactly n points. */
function resampleToN(arr: number[], n: number): number[] {
  if (arr.length === 0) return Array(n).fill(0) as number[];
  if (arr.length === n) return arr;
  return Array.from({ length: n }, (_, i) => {
    const src = (i / (n - 1)) * (arr.length - 1);
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, arr.length - 1);
    const f = src - lo;
    return arr[lo] * (1 - f) + arr[hi] * f;
  });
}

/** Emphasise week-to-week BAU deltas (no effect if the series is flat). */
function accentuateWeeklyBau(vals: number[], gain = 0.55): number[] {
  if (vals.length < 3) return vals.slice();
  const out = vals.slice();
  for (let i = 1; i < vals.length - 1; i++) {
    const smooth = (vals[i - 1] + vals[i + 1]) / 2;
    out[i] = Math.max(0, vals[i] + gain * (vals[i] - smooth));
  }
  return out;
}

/**
 * ~52 ripples/year on the BAU trace; pointwise `bau + change` is unchanged so stacks still match demand.
 */
function applyFiftyTwoWeekBauWiggle(bau: number[], change: number[], amp = 0.012) {
  const den = Math.max(bau.length - 1, 1);
  for (let i = 0; i < bau.length; i++) {
    let r = amp * Math.sin((52 * 2 * Math.PI * i) / den);
    if (r > 0) r = Math.min(r, change[i] * 0.92);
    else r = Math.max(r, -bau[i] * 0.92);
    bau[i] += r;
    change[i] -= r;
  }
}

/* ── synthetic profile data (states 1-3) ───────────────── */

function mkData(fn: (i: number, t: number) => number): number[] {
  return Array.from({ length: N_PTS }, (_, i) => clamp01(fn(i, i / DENOM)));
}

const BAU = mkData((i, t) =>
  0.30
  + 0.09 * Math.sin(i * 1.47 + 0.3)
  + 0.055 * Math.sin(i * 0.73 + 1.2)
  + 0.035 * Math.sin(t * Math.PI * 2 - 0.4)
  + 0.02 * Math.sin(i * 3.91 + 0.8),
);

const CAMPAIGN = mkData((i) => {
  const bell = Math.exp(-0.5 * ((i - 26) / 7.5) ** 2);
  const asym = i < 26 ? 0.84 : 0.94;
  return bell * 0.88 * asym + 0.015 * Math.sin(i * 2.7 + 1.4) + 0.03;
});

const PROGRAMME = mkData((i) => {
  const up = i <= 4 ? 0 : i <= 12 ? Math.sin(((i - 4) / 8) * Math.PI / 2) : 1;
  const dn = i >= 44 ? 0 : i >= 36 ? Math.sin(((44 - i) / 8) * Math.PI / 2) : 1;
  return Math.min(up, dn) * 0.64 + 0.025 * Math.sin(i * 0.9 + 0.6) + 0.04;
});

/** Synthetic fallback for the combined state if the pipeline fails. */
const COMBINED_FALLBACK = mkData((i) => {
  const b = 0.19 + 0.04 * Math.sin(i * 1.47) + 0.022 * Math.sin(i * 0.73 + 1.2) + 0.012 * Math.sin(i * 3.91);
  const c = Math.exp(-0.5 * ((i - 26) / 7.5) ** 2) * 0.32 + 0.01;
  const pUp = i <= 4 ? 0 : i <= 12 ? (i - 4) / 8 : 1;
  const pDn = i >= 44 ? 0 : i >= 36 ? (44 - i) / 8 : 1;
  const p = Math.min(pUp, pDn) * 0.24 + 0.015;
  return b + c + p;
});

const CAPACITY_FALLBACK = mkData((i) => {
  let cap = 0.62;
  cap -= 0.18 * Math.exp(-0.5 * ((i - 0.5) / 1.4) ** 2);
  cap -= 0.10 * Math.exp(-0.5 * ((i - 14) / 1.3) ** 2);
  cap -= 0.15 * Math.exp(-0.5 * ((i - 30) / 2.5) ** 2);
  cap -= 0.18 * Math.exp(-0.5 * ((i - 47) / 1.5) ** 2);
  return cap;
});

/* ── stacked series (shared scale) + stage copy ────────── */

interface StackSeries {
  bau: number[];
  campaign: number[];
  change: number[];
  /** Cumulative: BAU + campaign (for stage 3 top line before full demand). */
  bauPlusCampaign: number[];
  demand: number[];
  capacity: number[];
  campaignRuns: { start: number; end: number }[];
  changeRuns: { start: number; end: number }[];
}

function buildSynthStack(): StackSeries {
  const demand = [...COMBINED_FALLBACK];
  const capacity = [...CAPACITY_FALLBACK];
  const bau: number[] = [];
  const campaign: number[] = [];
  const change: number[] = [];
  for (let i = 0; i < N_PTS; i++) {
    const raw = BAU[i] + CAMPAIGN[i] + PROGRAMME[i] + 1e-9;
    const t = demand[i];
    bau.push((BAU[i] / raw) * t);
    campaign.push((CAMPAIGN[i] / raw) * t);
    change.push((PROGRAMME[i] / raw) * t);
  }
  const bauPlusCampaign = bau.map((b, i) => b + campaign[i]);
  return {
    bau,
    campaign,
    change,
    bauPlusCampaign,
    demand,
    capacity,
    campaignRuns: valueRuns(campaign, 0.08),
    changeRuns: valueRuns(change, 0.08),
  };
}

interface StageMeta {
  key: string;
  label: string;
  subtitle: string;
}

const STAGE_META: StageMeta[] = [
  {
    key: 'capacity',
    label: 'Capacity',
    subtitle: 'Available labs + tech teams through the year',
  },
  {
    key: 'bau',
    label: 'BAU support',
    subtitle: 'Operational rhythm on the same scale',
  },
  {
    key: 'campaign',
    label: 'Campaign load',
    subtitle: 'Live windows add on top of BAU',
  },
  {
    key: 'full',
    label: 'Full demand',
    subtitle: 'Programmes and change complete the stack vs capacity',
  },
];

type AnimState = {
  top: number[];
  capOp: number;
  bauFill: number;
  campFill: number;
  techFill: number;
  campReg: number;
  techReg: number;
};

function stageTargets(stage: number, series: StackSeries): AnimState {
  const z = Array.from({ length: N_PTS }, () => 0);
  if (stage <= 0) {
    return {
      top: z,
      capOp: 1,
      bauFill: 0,
      campFill: 0,
      techFill: 0,
      campReg: 0,
      techReg: 0,
    };
  }
  if (stage === 1) {
    return {
      top: [...series.bau],
      capOp: 1,
      bauFill: 1,
      campFill: 0,
      techFill: 0,
      campReg: 0,
      techReg: 0,
    };
  }
  if (stage === 2) {
    return {
      top: [...series.bauPlusCampaign],
      capOp: 1,
      bauFill: 1,
      campFill: 1,
      techFill: 0,
      campReg: 1,
      techReg: 0,
    };
  }
  return {
    top: [...series.demand],
    capOp: 1,
    bauFill: 1,
    campFill: 1,
    techFill: 1,
    campReg: 1,
    techReg: 1,
  };
}

function lerpAnim(a: AnimState, b: AnimState, t: number): AnimState {
  return {
    top: a.top.map((v, i) => lerp(v, b.top[i] ?? 0, t)),
    capOp: lerp(a.capOp, b.capOp, t),
    bauFill: lerp(a.bauFill, b.bauFill, t),
    campFill: lerp(a.campFill, b.campFill, t),
    techFill: lerp(a.techFill, b.techFill, t),
    campReg: lerp(a.campReg, b.campReg, t),
    techReg: lerp(a.techReg, b.techReg, t),
  };
}

/* ── SVG geometry ──────────────────────────────────────── */

type Pt = { x: number; y: number };

function toPoints(vals: number[]): Pt[] {
  return vals.map((v, i) => ({
    x: PAD.l + (INNER_W * i) / DENOM,
    y: PAD.t + (1 - clamp01(v)) * INNER_H,
  }));
}

/** Catmull-Rom → cubic Bezier smooth path through all points. */
function smoothLine(pts: Pt[]): string {
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

/** Closed path: smooth BAU curve down to chart baseline. */
function smoothArea(pts: Pt[]): string {
  const line = smoothLine(pts);
  if (!line) return '';
  const base = PAD.t + INNER_H;
  const f = (n: number) => n.toFixed(2);
  return `${line} L ${f(pts[pts.length - 1].x)} ${f(base)} L ${f(pts[0].x)} ${f(base)} Z`;
}

/** Horizontal index spans where `vals` is above a noise floor (for shaded calendar blocks). */
function valueRuns(vals: number[], minFrac = 0.06): { start: number; end: number }[] {
  const mx = Math.max(...vals, 1e-9);
  const eps = mx * minFrac;
  const runs: { start: number; end: number }[] = [];
  let s = -1;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] > eps) {
      if (s < 0) s = i;
    } else if (s >= 0) {
      runs.push({ start: s, end: i - 1 });
      s = -1;
    }
  }
  if (s >= 0) runs.push({ start: s, end: vals.length - 1 });
  return runs;
}

function runToRect(run: { start: number; end: number }) {
  const x1 = PAD.l + (INNER_W * run.start) / DENOM;
  const x2 = PAD.l + (INNER_W * run.end) / DENOM;
  return { x1, x2, w: Math.max(x2 - x1, 1) };
}

/** Closed path: smooth top (`upper`), straight return along `lower` (bottom edge). */
function bandArea(lowerPts: Pt[], upperPts: Pt[]): string {
  if (lowerPts.length < 2 || upperPts.length < 2) return '';
  const up = smoothLine(upperPts);
  if (!up) return '';
  const f = (n: number) => n.toFixed(2);
  let d = up;
  d += ` L ${f(lowerPts[lowerPts.length - 1].x)} ${f(lowerPts[lowerPts.length - 1].y)}`;
  for (let i = lowerPts.length - 2; i >= 0; i--) {
    d += ` L ${f(lowerPts[i].x)} ${f(lowerPts[i].y)}`;
  }
  d += ' Z';
  return d;
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

/** Interior intersection of segments ab and cd (inclusive endpoints with small slack for numerics). */
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

/**
 * Red fill only where demand > capacity: one quad per week segment, split at crossings.
 * Headroom (demand < capacity) is left unfilled.
 */
function buildOverCapacityGapPath(demandVals: number[], capVals: number[]): string {
  const n = demandVals.length;
  if (n < 2 || capVals.length !== n) return '';
  const dPts = toPoints(demandVals);
  const cPts = toPoints(capVals);
  const eps = 1e-9;

  const sign = (i: number) => {
    const s = demandVals[i] - capVals[i];
    if (Math.abs(s) <= eps) return 0;
    return s > 0 ? 1 : -1;
  };

  const partsOver: string[] = [];

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
      continue;
    } else {
      const P = segIntersect(d0, d1, c0, c1);
      if (P) {
        if (k0 > 0) {
          partsOver.push(triPath(d0, P, c0));
        } else {
          partsOver.push(triPath(d1, P, c1));
        }
      } else if (k0 > 0 || k1 > 0) {
        partsOver.push(quadPath(d0, d1, c1, c0));
      }
    }
  }

  return partsOver.join(' ');
}

/* ── component ─────────────────────────────────────────── */

export function LandingCapacityProfilesMock() {
  const reducedMotion = useReducedMotion();
  const hatchUid = useId().replace(/:/g, '');

  /* ── real pipeline data (state 4) ── */

  const realYear = useMemo(() => {
    try {
      const { riskSurface, parseError } = runPipelineFromDsl(
        defaultDslForMarket(LANDING_MARKET),
        DEFAULT_RISK_TUNING,
      );
      if (parseError || !riskSurface.length) return null;

      const rows = riskSurface
        .filter((r) => r.market === LANDING_MARKET)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (rows.length < 60) return null;

      const sliceDemand = (s?: {
        lab_readiness: number; lab_sustain: number;
        team_readiness: number; team_sustain: number;
      }) => s ? s.lab_readiness + s.lab_sustain + s.team_readiness + s.team_sustain : 0;

      type WeekBucket = {
        bau: number; campaign: number; change: number;
        demand: number; capacity: number;
      };
      const weeks: WeekBucket[] = [];
      for (let i = 0; i < rows.length; i += 7) {
        const chunk = rows.slice(i, Math.min(i + 7, rows.length));
        if (chunk.length < 3) break;
        const n = chunk.length;
        weeks.push({
          bau: chunk.reduce((s, r) => s + sliceDemand(r.surfaceTotals?.bau), 0) / n,
          campaign: chunk.reduce((s, r) => s + sliceDemand(r.surfaceTotals?.campaign), 0) / n,
          change: chunk.reduce((s, r) => s + sliceDemand(r.surfaceTotals?.change), 0) / n,
          demand: chunk.reduce((s, r) => s + (r.lab_load ?? 0) + (r.team_load ?? 0), 0) / n,
          capacity: chunk.reduce(
            (s, r) => s + (r.labs_effective_cap ?? 0) + (r.teams_effective_cap ?? 0), 0,
          ) / n,
        });
      }
      if (weeks.length < 20) return null;

      const allVals = weeks.flatMap((w) => [
        w.demand, w.capacity, w.bau + w.campaign + w.change,
      ]);
      const peak = Math.max(...allVals, 1e-9);
      const s = (v: number) => (v / peak) * 0.92;

      let bauN = resampleToN(weeks.map((w) => s(w.bau)), N_PTS);
      const campaignN = resampleToN(weeks.map((w) => s(w.campaign)), N_PTS);
      let changeN = resampleToN(weeks.map((w) => s(w.change)), N_PTS);
      const demandN = resampleToN(weeks.map((w) => s(w.demand)), N_PTS);
      const capacityN = resampleToN(weeks.map((w) => s(w.capacity)), N_PTS);

      bauN = accentuateWeeklyBau(bauN, 0.5);
      const bauW = [...bauN];
      const changeW = [...changeN];
      applyFiftyTwoWeekBauWiggle(bauW, changeW, 0.012);
      bauN = bauW;
      changeN = changeW;

      const startDate = new Date(rows[0].date);
      const months = Array.from({ length: 12 }, (_, mi) => {
        const d = new Date(startDate.getFullYear(), startDate.getMonth() + mi, 1);
        return MONTH_NAMES[d.getMonth()];
      });

      const bauPlusCampaign = bauN.map((b, i) => b + campaignN[i]);

      return {
        bau: bauN,
        campaign: campaignN,
        change: changeN,
        bauPlusCampaign,
        demand: demandN,
        capacity: capacityN,
        campaignRuns: valueRuns(campaignN, 0.06),
        changeRuns: valueRuns(changeN, 0.06),
        months,
      };
    } catch {
      return null;
    }
  }, []);

  const stack = useMemo<StackSeries>(() => {
    if (realYear) {
      const { months: _m, ...rest } = realYear;
      return rest;
    }
    return buildSynthStack();
  }, [realYear]);

  const bauMonthAvgs = useMemo(() => avgBauPerMonth(stack.bau), [stack.bau]);
  const maxBauMonth = useMemo(() => Math.max(...bauMonthAvgs, 1e-6), [bauMonthAvgs]);

  const capacityData = stack.capacity;
  const capPts = useMemo(() => toPoints(capacityData), [capacityData]);
  const capLineD = useMemo(() => smoothLine(capPts), [capPts]);

  const monthLabels = realYear?.months ?? [...MONTH_NAMES];

  const bandPaths = useMemo(() => {
    const ptsBau = toPoints(stack.bau);
    const ptsBauCamp = toPoints(stack.bauPlusCampaign);
    const ptsDemand = toPoints(stack.demand);
    return {
      areaBau: smoothArea(ptsBau),
      bandCamp: bandArea(ptsBau, ptsBauCamp),
      bandTech: bandArea(ptsBauCamp, ptsDemand),
    };
  }, [stack]);

  const stackRef = useRef(stack);
  stackRef.current = stack;

  /* ── animation state ── */

  const [activeIdx, setActiveIdx] = useState(0);
  const [, setTick] = useState(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useInView(sectionRef, { once: true, margin: '-60px', amount: 0.2 });
  /** Reset in effect cleanup so React Strict Mode can reschedule after the dev-only unmount. */
  const introScheduleStarted = useRef(false);

  const curAnim = useRef<AnimState>({
    top: Array.from({ length: N_PTS }, () => 0),
    capOp: 0,
    bauFill: 0,
    campFill: 0,
    techFill: 0,
    campReg: 0,
    techReg: 0,
  });
  const fromAnim = useRef<AnimState>({
    top: Array.from({ length: N_PTS }, () => 0),
    capOp: 0,
    bauFill: 0,
    campFill: 0,
    techFill: 0,
    campReg: 0,
    techReg: 0,
  });
  const toAnim = useRef<AnimState>(stageTargets(0, stack));
  const t0 = useRef(0);
  const raf = useRef(0);

  const animateTo = useCallback(
    (idx: number) => {
      const series = stackRef.current;
      fromAnim.current = {
        ...curAnim.current,
        top: [...curAnim.current.top],
      };
      toAnim.current = stageTargets(idx, series);
      t0.current = performance.now();
      cancelAnimationFrame(raf.current);

      const dur = reducedMotion ? 0 : ANIM_MS;
      if (!dur) {
        curAnim.current = {
          ...toAnim.current,
          top: [...toAnim.current.top],
        };
        setTick((n) => n + 1);
        return;
      }

      const step = (now: number) => {
        const p = Math.min(1, (now - t0.current) / dur);
        const e = easeInOutCubic(p);
        curAnim.current = lerpAnim(fromAnim.current, toAnim.current, e);
        setTick((n) => n + 1);
        if (p < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [reducedMotion],
  );

  useEffect(() => { animateTo(activeIdx); }, [activeIdx, animateTo]);

  /** One play-through 0→1→2→3 when the section enters view; toggles stay manual after that. */
  useEffect(() => {
    if (!inView || introScheduleStarted.current) return;
    introScheduleStarted.current = true;
    if (reducedMotion) {
      setActiveIdx(N_STAGES - 1);
      return () => {
        introScheduleStarted.current = false;
      };
    }
    const t1 = window.setTimeout(() => setActiveIdx(1), CYCLE_MS);
    const t2 = window.setTimeout(() => setActiveIdx(2), 2 * CYCLE_MS);
    const t3 = window.setTimeout(() => setActiveIdx(3), 3 * CYCLE_MS);
    return () => {
      introScheduleStarted.current = false;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [inView, reducedMotion]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const handleTab = useCallback((i: number) => {
    if (i !== activeIdx) setActiveIdx(i);
  }, [activeIdx]);

  /* ── derived render state ── */

  const a = curAnim.current;
  const pts = toPoints(a.top);
  const lineD = smoothLine(pts);
  const baseY = PAD.t + INNER_H;
  /** BAU lane first, then campaign, then programmes — padding band below curve. */
  const bauMonthY = baseY + 4;
  const ganttY0 = bauMonthY + BAU_MONTH_LANE_H + GANTT_LANE_GAP;
  const ganttY1 = ganttY0 + GANTT_BAR_H + GANTT_LANE_GAP;
  const monthLabelY = VB_H - 9;
  const profile = STAGE_META[activeIdx];
  const capOp = a.capOp;
  const demandLineOp = Math.max(...a.top, 0) > 0.004 ? 1 : 0;
  /** Demand vs capacity gap hatching (final stack only). */
  const gapOverPath = buildOverCapacityGapPath(a.top, capacityData);
  const gapRibbonOp = capOp * a.techFill * demandLineOp;

  return (
    <motion.section
      ref={sectionRef}
      initial={reducedMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* ── section heading ── */}
      <div className="mb-6 sm:mb-8">
        <p className="mb-2 font-landing text-xs font-semibold uppercase tracking-[0.14em] text-[#FFC72C]/90">
          Capacity profiles
        </p>
        <h2 className="font-landing text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Not all demand looks the same
        </h2>
        <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
          BAU support, campaign waves, and technology programmes each draw on your teams
          differently. The runway shows all three on one calendar—so&nbsp;you see where the
          pressure really stacks.
        </p>
      </div>

      {/* ── browser chrome ── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0f] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#111114] px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]/90" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]/90" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]/90" />
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-600">https://</span>
            <span className="text-zinc-400">capacity</span>
            <span className="text-zinc-600">.app</span>
            <span className="text-cyan-500/80"> / profiles</span>
          </div>
        </div>

        <div className="px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
          {/* active profile label */}
          <div className="mb-4 flex min-h-[1.75rem] items-baseline gap-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={profile.key}
                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.14 }}
                className="flex items-baseline gap-2"
              >
                <span className="font-landing text-sm font-semibold text-zinc-200 sm:text-base">
                  {profile.label}
                </span>
                <span className="font-landing text-xs text-zinc-500 sm:text-sm">
                  {profile.subtitle}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── sparkline chart ── */}
          <div className="rounded-xl border border-white/[0.06] bg-[#070708] p-3 sm:p-4">
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              className="block w-full"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Capacity profile: ${profile.label}`}
            >
              <defs>
                {/* Subtle hatch + whisper tint (replaces flat fills on stacked areas). */}
                <pattern
                  id={`hatch-bau-${hatchUid}`}
                  width="7"
                  height="7"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(42)"
                >
                  <rect width="7" height="7" fill="rgba(16, 185, 129, 0.06)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="7"
                    stroke="rgba(110, 231, 183, 0.18)"
                    strokeWidth="0.45"
                  />
                </pattern>
                <pattern
                  id={`hatch-camp-${hatchUid}`}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(-38)"
                >
                  <rect width="6" height="6" fill="rgba(167, 139, 250, 0.05)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="rgba(196, 181, 253, 0.2)"
                    strokeWidth="0.4"
                  />
                </pattern>
                <pattern
                  id={`hatch-tech-${hatchUid}`}
                  width="8"
                  height="8"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(36)"
                >
                  <rect width="8" height="8" fill="rgba(34, 211, 238, 0.045)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="8"
                    stroke="rgba(103, 232, 249, 0.18)"
                    strokeWidth="0.4"
                  />
                </pattern>
              </defs>

              {/* horizontal grid */}
              {[0.25, 0.5, 0.75].map((t) => (
                <line
                  key={t}
                  x1={PAD.l}
                  y1={PAD.t + (1 - t) * INNER_H}
                  x2={PAD.l + INNER_W}
                  y2={PAD.t + (1 - t) * INNER_H}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth={0.5}
                  strokeDasharray="4 4"
                />
              ))}
              <line
                x1={PAD.l} y1={baseY}
                x2={PAD.l + INNER_W} y2={baseY}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={0.5}
              />

              {/* vertical month separators */}
              {Array.from({ length: 11 }, (_, m) => {
                const x = PAD.l + (INNER_W * (m + 1)) / 12;
                return (
                  <line
                    key={m}
                    x1={x} y1={PAD.t} x2={x} y2={baseY}
                    stroke="rgba(255,255,255,0.03)"
                    strokeWidth={0.5}
                  />
                );
              })}

              {/* BAU load — hatched band under the operational curve */}
              {bandPaths.areaBau && (
                <path
                  d={bandPaths.areaBau}
                  fill={`url(#hatch-bau-${hatchUid})`}
                  className="pointer-events-none"
                  opacity={a.bauFill}
                />
              )}

              {/* One BAU bar per calendar month (mean weekly BAU in that slice) */}
              <g
                opacity={a.bauFill > 0.02 ? 1 : 0}
                style={{ pointerEvents: 'none' as const }}
              >
                {bauMonthAvgs.map((avg, mi) => {
                  const { x1, w } = monthColumnRect(mi);
                  const bw = ganttBarWidth(w, mi, a.bauFill, 0.055, 0.32);
                  if (bw < 0.5) return null;
                  const rel = avg / maxBauMonth;
                  const bh = Math.max(2.2, BAU_MONTH_LANE_H * (0.4 + 0.6 * rel));
                  const by = bauMonthY + (BAU_MONTH_LANE_H - bh) / 2;
                  return (
                    <rect
                      key={`bau-mo-${mi}`}
                      x={x1}
                      y={by}
                      width={bw}
                      height={bh}
                      fill="rgba(16, 185, 129, 0.42)"
                      stroke="rgba(110, 231, 183, 0.55)"
                      strokeWidth={0.4}
                      rx={1.5}
                    />
                  );
                })}
              </g>

              {/* Campaign Gantt bars (horizontal lanes — same runs as former full-height blocks) */}
              <g
                opacity={a.campReg > 0.02 ? 1 : 0}
                style={{ pointerEvents: 'none' as const }}
              >
                {stack.campaignRuns.map((run, ri) => {
                  const { x1, w } = runToRect(run);
                  const bw = ganttBarWidth(w, ri, a.campReg);
                  if (bw < 0.5) return null;
                  return (
                    <rect
                      key={`camp-gantt-${ri}`}
                      x={x1}
                      y={ganttY0}
                      width={bw}
                      height={GANTT_BAR_H}
                      fill="rgba(167,139,250,0.55)"
                      stroke="rgba(196,181,253,0.35)"
                      strokeWidth={0.45}
                      rx={2}
                    />
                  );
                })}
              </g>

              {/* Programme / change Gantt bars */}
              <g
                opacity={a.techReg > 0.02 ? 1 : 0}
                style={{ pointerEvents: 'none' as const }}
              >
                {stack.changeRuns.map((run, ri) => {
                  const { x1, w } = runToRect(run);
                  const bw = ganttBarWidth(w, ri, a.techReg);
                  if (bw < 0.5) return null;
                  return (
                    <rect
                      key={`chg-gantt-${ri}`}
                      x={x1}
                      y={ganttY1}
                      width={bw}
                      height={GANTT_BAR_H}
                      fill="rgba(34,211,238,0.5)"
                      stroke="rgba(103,232,249,0.4)"
                      strokeWidth={0.45}
                      rx={2}
                    />
                  );
                })}
              </g>

              {/* Campaign increment (between BAU and BAU+campaign) */}
              {bandPaths.bandCamp && (
                <path
                  d={bandPaths.bandCamp}
                  fill={`url(#hatch-camp-${hatchUid})`}
                  className="pointer-events-none"
                  opacity={a.campFill}
                />
              )}

              {/* Tech / change increment (to full demand envelope) */}
              {bandPaths.bandTech && (
                <path
                  d={bandPaths.bandTech}
                  fill={`url(#hatch-tech-${hatchUid})`}
                  className="pointer-events-none"
                  opacity={a.techFill}
                />
              )}

              {/* demand > capacity gap only (final stage) */}
              {gapRibbonOp > 0.01 && gapOverPath && (
                <path
                  d={gapOverPath}
                  fill={GAP_FILL_OVER}
                  stroke={GAP_FILL_OVER}
                  strokeWidth={1}
                  strokeLinejoin="miter"
                  strokeLinecap="butt"
                  paintOrder="stroke fill"
                  opacity={gapRibbonOp}
                  className="pointer-events-none"
                />
              )}

              {/* capacity line — above stacked fills + over-cap gap; under demand for legible crossings */}
              {capOp > 0.01 && capLineD && (
                <g className="pointer-events-none" style={{ opacity: capOp }}>
                  <path
                    d={capLineD}
                    fill="none"
                    stroke="#070708"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.88}
                  />
                  <path
                    d={capLineD}
                    fill="none"
                    stroke="#FFC72C"
                    strokeWidth={1.25}
                    strokeDasharray="6 3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: 'drop-shadow(0 0 3px rgba(255,199,44,0.35))' }}
                  />
                </g>
              )}

              {/* month labels */}
              {monthLabels.map((m, mi) => (
                <text
                  key={`m-${mi}`}
                  x={PAD.l + INNER_W * (mi + 0.5) / 12}
                  y={monthLabelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(161,161,170,0.55)"
                  fontSize={9}
                  fontFamily="Outfit, system-ui, sans-serif"
                >
                  {m}
                </text>
              ))}

              {/* cumulative demand — painted last so it sits above fills + over-cap gap */}
              {demandLineOp > 0.01 && lineD && (
                <g className="pointer-events-none" style={{ opacity: demandLineOp }}>
                  <path
                    d={lineD}
                    fill="none"
                    stroke="#070708"
                    strokeWidth={4}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={0.88}
                  />
                  <path
                    d={lineD}
                    fill="none"
                    stroke="rgb(255,255,255)"
                    strokeWidth={1.6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.2))' }}
                  />
                </g>
              )}

              {/* data-point dots (every 4th week) — above demand stroke */}
              {pts.map((p, i) =>
                i % 4 === 0 ? (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={2}
                    opacity={demandLineOp}
                    fill={
                      capOp > 0.9 && a.top[i] > capacityData[i]
                        ? '#FFC72C'
                        : 'rgb(255,255,255)'
                    }
                    className="pointer-events-none"
                  />
                ) : null,
              )}
            </svg>
          </div>

          {/* legend */}
          {capOp > 0.01 && (
            <div
              className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-landing text-[10px] sm:gap-x-5"
              style={{ opacity: capOp }}
            >
              <span className="flex items-center gap-1.5">
                <svg width="16" height="3" className="shrink-0" aria-hidden>
                  <line
                    x1="0" y1="1.5" x2="16" y2="1.5"
                    stroke="#FFC72C" strokeWidth="1.2"
                    strokeDasharray="4 2" strokeLinecap="round" opacity="0.7"
                  />
                </svg>
                <span className="text-[#FFC72C]/70">Capacity</span>
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="14" height="6" className="shrink-0" aria-hidden>
                  <rect
                    x="0"
                    y="1"
                    width="14"
                    height="4"
                    rx="1.5"
                    fill="rgba(16, 185, 129, 0.42)"
                    stroke="rgba(110, 231, 183, 0.55)"
                    strokeWidth="0.4"
                  />
                </svg>
                <span className="text-emerald-300/75">BAU</span>
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="14" height="6" className="shrink-0" aria-hidden>
                  <rect x="0" y="1" width="14" height="4" rx="1.5" fill="rgba(167,139,250,0.55)" stroke="rgba(196,181,253,0.35)" strokeWidth="0.4" />
                </svg>
                <span className="text-violet-300/70">Campaign</span>
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="14" height="6" className="shrink-0" aria-hidden>
                  <rect x="0" y="1" width="14" height="4" rx="1.5" fill="rgba(34,211,238,0.5)" stroke="rgba(103,232,249,0.4)" strokeWidth="0.4" />
                </svg>
                <span className="text-cyan-300/70">Programmes</span>
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="16" height="3" className="shrink-0" aria-hidden>
                  <line
                    x1="0" y1="1.5" x2="16" y2="1.5"
                    stroke="rgb(255,255,255)" strokeWidth="1.5"
                    strokeLinecap="round" opacity="0.85"
                  />
                </svg>
                <span className="text-zinc-400">Demand</span>
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="12" height="10" className="shrink-0" aria-hidden>
                  <rect width="12" height="10" rx="1" fill={GAP_FILL_OVER} stroke="rgba(254,202,202,0.55)" strokeWidth="0.5" />
                </svg>
                <span className="text-red-300/90">Past capacity</span>
              </span>
            </div>
          )}

          {/* stage selector */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {STAGE_META.map((p, i) => (
              <button
                key={p.key}
                type="button"
                onClick={() => handleTab(i)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1.5 font-landing text-xs font-medium transition-all duration-200',
                  i === activeIdx
                    ? 'bg-white/[0.1] text-zinc-200 ring-1 ring-white/[0.15]'
                    : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full transition-all duration-200',
                    i === activeIdx
                      ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)]'
                      : 'bg-zinc-600',
                  )}
                />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
