/** Effective horizontal density of one runway day cell on screen (SVG cell width × CSS zoom). */
export type ProgrammeGanttDisclosureTier = 0 | 1 | 2 | 3;

function upThreshold(from: ProgrammeGanttDisclosureTier): number | null {
  switch (from) {
    case 0:
      return 3.6;
    case 1:
      return 6.2;
    case 2:
      return 10.2;
    default:
      return null;
  }
}

function downThreshold(from: 1 | 2 | 3): number {
  switch (from) {
    case 1:
      return 3.0;
    case 2:
      return 5.4;
    case 3:
      return 8.8;
  }
}

/**
 * Hysteresis keeps tier stable when zoom oscillates on a boundary (avoids label/icon flicker).
 */
export function nextProgrammeGanttDisclosureTier(
  prev: ProgrammeGanttDisclosureTier,
  effectiveCellPx: number,
): ProgrammeGanttDisclosureTier {
  let t = prev;
  while (t < 3) {
    const up = upThreshold(t);
    if (up != null && effectiveCellPx >= up) t = (t + 1) as ProgrammeGanttDisclosureTier;
    else break;
  }
  while (t > 0) {
    const down = downThreshold(t as 1 | 2 | 3);
    if (effectiveCellPx < down) t = (t - 1) as ProgrammeGanttDisclosureTier;
    else break;
  }
  return t;
}
