import type { PlanBuildMilestone } from '@/lib/runwayProgrammeGanttBuildAnimation';

export type ProgrammeGanttBuildLogLine = { atMs: number; text: string };

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function jitterMs(seed: string, i: number): number {
  return 6 + (hash32(`${seed}:${i}`) % 16);
}

/**
 * Deterministic “compiler” log lines for the staged Gantt build. Timestamps are absolute ms on the
 * same clock as {@link usePlanBuildElapsedMs}; reveal is sped up in the UI for a busier stream.
 */
export function buildProgrammeGanttBuildLogLines(opts: {
  marketKey: string;
  milestones: readonly PlanBuildMilestone[];
  totalMs: number;
  clipStart: string;
  clipEnd: string;
  laneCount: number;
  cellCount: number;
  stripWidth: number;
  cellPx: number;
  counts: {
    diamond: number;
    dottedSpan: number;
    runBar: number;
    bracket: number;
    tick: number;
  };
}): ProgrammeGanttBuildLogLine[] {
  const {
    marketKey,
    milestones,
    totalMs,
    clipStart,
    clipEnd,
    laneCount,
    cellCount,
    stripWidth,
    cellPx,
    counts,
  } = opts;
  const seed = `${marketKey}|${clipStart}|${clipEnd}`;
  const lines: ProgrammeGanttBuildLogLine[] = [];

  const script: string[] = [
    '[cpm] hydrate programme workspace',
    `[yaml] resolve chronicle → market "${marketKey}"`,
    '[parse] scan lanes · marks · footprints · phase labels',
    '[dsl] chronicle marks → placement model (campaign / tech_programme)',
    `[calendar] clip ISO window ${clipStart} … ${clipEnd}`,
    `[grid] ${cellCount} trading cells in view`,
    `[layout] cell ${cellPx.toFixed(2)}px → strip ${Math.round(stripWidth)}px`,
    '[risk] join deployment blackouts + school flags (overlay map)',
    `[model] ${laneCount} programme lane${laneCount === 1 ? '' : 's'} queued`,
    `[marks] ◆ ${counts.diamond} · prep ${counts.dottedSpan} · bars ${counts.runBar} · ⌙ ${counts.bracket} · | ${counts.tick}`,
    '[svg] defs: clipPath · quarter guides · bar hatch pattern',
    '[geom] xSpanForInclusiveYmdRangeClipped (per mark)',
    '[sort] stable order: lane (top→bottom) · day (L→R)',
    '[alloc] milestone layer · prep rail layer · bar layer · glyph layer',
    '[ease] smoothstep visibility envelopes',
    '[hatch] 45° tile overlay bind to live rects',
    '[labels] trailing captions + icon foreignObject mounts',
    '[strip] contribution strip weekday gutter aligned',
    '[verify] non-overlap lane captions (labelX sweep)',
    '[anim] staged envelope · parallel beats per layer',
    '[done] commit scene graph',
  ];

  let t = 0;
  for (let i = 0; i < script.length; i += 1) {
    lines.push({ atMs: t, text: script[i]! });
    t += jitterMs(seed, i);
    if (t > totalMs * 0.42) break;
  }

  for (const m of milestones) {
    lines.push({ atMs: Math.max(0, m.t0), text: `▸ stage · ${m.label}` });
  }

  const tail = [
    `[bench] schedule span 0…${Math.round(totalMs)}ms`,
    '[render] requestAnimationFrame driver · reduce-motion aware',
    '[ok] programme strip ready',
  ];
  let tailT = Math.max(0, totalMs * 0.58);
  for (let j = 0; j < tail.length; j += 1) {
    lines.push({ atMs: tailT, text: tail[j]! });
    tailT += jitterMs(`${seed}:tail`, j);
  }

  lines.sort((a, b) => a.atMs - b.atMs);
  for (let k = 1; k < lines.length; k += 1) {
    if (lines[k]!.atMs <= lines[k - 1]!.atMs) {
      lines[k]!.atMs = lines[k - 1]!.atMs + 0.5;
    }
  }
  return lines;
}
