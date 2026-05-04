/**
 * Staged animation for programme Gantt marks: milestones → prep rails + phase tags →
 * live bars (width grow) → remaining labels & icons. Used in /app when `planBuildAnimation` is `staged`;
 * the homepage hero opts in via the same pref and skips heatmap organic sync.
 */

import { useEffect, useState } from 'react';

export type PlanBuildAnimationMode = 'off' | 'staged';

export type PlanBuildAnimPrefsSlice = {
  planBuildAnimation: PlanBuildAnimationMode;
  planBuildStaggerMs: number;
  planBuildCategoryGapMs: number;
  planBuildBarGrowMs: number;
};

export type PlanAnimPhase =
  | 'diamond_circle'
  | 'prep_rail'
  | 'run_bar'
  | 'bracket_tick_glyphs'
  | 'labels_icons';

export type PlanAnimScheduledItem = {
  key: string;
  phase: PlanAnimPhase;
  /** Start offset (ms) from timeline zero. */
  t0: number;
  /** End offset (ms); bar grow uses this − t0 as grow duration. */
  t1: number;
};

/** Human-readable stage markers for build UI (e.g. console). */
export type PlanBuildMilestone = { t0: number; label: string };

const EPS = 0.001;

function clamp01(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

/** Smoothstep for softer edges. */
export function planBuildEase(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function planBuildProgressAt(
  elapsedMs: number,
  item: PlanAnimScheduledItem,
  barGrowMs: number,
): number {
  const dur = Math.max(EPS, item.t1 - item.t0);
  if (item.phase === 'run_bar') {
    const grow = Math.max(EPS, barGrowMs);
    return planBuildEase((elapsedMs - item.t0) / grow);
  }
  return planBuildEase((elapsedMs - item.t0) / dur);
}

export function planBuildVisible(elapsedMs: number, item: PlanAnimScheduledItem): boolean {
  return elapsedMs >= item.t0 - EPS;
}

export type PlanScheduleMark =
  | { kind: 'dotted_span'; key: string; xMid: number }
  | { kind: 'run_bar'; key: string; xMid: number }
  | { kind: 'bracket_span'; key: string; xMid: number }
  | { kind: 'tick'; key: string; xMid: number }
  | { kind: 'diamond'; key: string; xMid: number };

export type PlanScheduleLaneRow = {
  laneId: string;
  marks: readonly PlanScheduleMark[];
};

function sortMarksByX(marks: readonly PlanScheduleMark[]): PlanScheduleMark[] {
  return [...marks].sort((a, b) => a.xMid - b.xMid);
}

/**
 * Build a deterministic schedule from placed marks. Phases run in order; **within** each phase every
 * mark shares the same window (parallel wave) so the strip reads as a few broad beats, not a long
 * per-element crawl. `planBuildStaggerMs` is kept in prefs for compatibility but not used here.
 */
export function buildPlanAnimationSchedule(
  laneRows: readonly PlanScheduleLaneRow[],
  prefs: PlanBuildAnimPrefsSlice,
): { items: PlanAnimScheduledItem[]; totalMs: number; milestones: PlanBuildMilestone[] } {
  const gap = Math.max(0, prefs.planBuildCategoryGapMs);
  const barGrow = Math.max(80, prefs.planBuildBarGrowMs);
  const labelHoldMs = 24;

  const items: PlanAnimScheduledItem[] = [];
  const milestones: PlanBuildMilestone[] = [];
  let cursor = 0;

  /** One timed beat: all keys animate together for `phaseMs` (or bar grow for run bars). */
  const pushPhaseParallel = (
    phase: PlanAnimPhase,
    keys: string[],
    phaseMs: number,
    stageLabel: string,
    useBarGrowForRunBar?: boolean,
  ) => {
    if (keys.length === 0) return;
    if (cursor > 0) cursor += gap;
    const phaseStart = cursor;
    milestones.push({ t0: phaseStart, label: stageLabel });
    const dur =
      phase === 'run_bar' && useBarGrowForRunBar
        ? barGrow
        : Math.max(phaseMs, labelHoldMs);
    const t1 = phaseStart + dur;
    for (const k of keys) {
      items.push({ key: k, phase, t0: phaseStart, t1 });
    }
    cursor = t1;
  };

  const diamondKeys: string[] = [];
  const prepLineKeys: string[] = [];
  const prepPhaseKeys: string[] = [];
  const barKeys: string[] = [];
  const bracketTickKeys: string[] = [];
  const labelKeys: string[] = [];

  for (const row of laneRows) {
    const sorted = sortMarksByX([...row.marks]);
    for (const m of sorted) {
      if (m.kind === 'diamond') diamondKeys.push(m.key);
      else if (m.kind === 'dotted_span') {
        prepLineKeys.push(`dotline:${m.key}`);
        prepPhaseKeys.push(`dotphase:${m.key}`);
      } else if (m.kind === 'run_bar') barKeys.push(m.key);
      else if (m.kind === 'bracket_span' || m.kind === 'tick') bracketTickKeys.push(m.key);
    }
  }

  for (const row of laneRows) {
    labelKeys.push(`lane:${row.laneId}`);
    const sorted = sortMarksByX([...row.marks]);
    for (const m of sorted) {
      if (m.kind === 'diamond') labelKeys.push(`dmtext:${m.key}`);
      if (m.kind === 'tick') labelKeys.push(`tktext:${m.key}`);
      if (m.kind === 'dotted_span') {
        labelKeys.push(`ico:${m.key}`);
      }
    }
  }

  /** Tuned for snappy “stage” beats; bar duration follows `planBuildBarGrowMs`. */
  pushPhaseParallel('diamond_circle', diamondKeys, 88, 'Milestones & gates (diamonds)');
  pushPhaseParallel('prep_rail', prepLineKeys, 72, 'Prep rails (dash / dot connectors)');
  pushPhaseParallel('prep_rail', prepPhaseKeys, 68, 'Phase captions (P1 …)');
  pushPhaseParallel('run_bar', barKeys, 0, 'Live programme bars (width)', true);
  pushPhaseParallel('bracket_tick_glyphs', bracketTickKeys, 78, 'Readiness brackets & ticks');
  pushPhaseParallel('labels_icons', labelKeys, 92, 'Lane captions, icons & labels');

  const totalMs = items.length ? Math.max(...items.map((i) => i.t1)) + 64 : 0;
  return { items, totalMs, milestones };
}

export function scheduleLookup(items: readonly PlanAnimScheduledItem[]): Map<string, PlanAnimScheduledItem> {
  const m = new Map<string, PlanAnimScheduledItem>();
  for (const it of items) m.set(it.key, it);
  return m;
}

/** Drives elapsed ms for staged plan build; resets when `resetKey` or `totalMs` changes. */
export function usePlanBuildElapsedMs(
  enabled: boolean,
  resetKey: string | number | undefined,
  totalMs: number,
  reduceMotion: boolean,
): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!enabled || totalMs <= 0 || reduceMotion) {
      setElapsed(Math.max(0, totalMs));
      return;
    }
    setElapsed(0);
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const e = Math.min(totalMs, now - start);
      setElapsed(e);
      if (e < totalMs) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled, totalMs, reduceMotion, resetKey]);

  if (!enabled || reduceMotion) return Math.max(0, totalMs);
  return elapsed;
}
