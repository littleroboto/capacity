import type { DeploymentRiskBlackout } from '@/engine/types';

/**
 * Inclusive `start` / `end` (`YYYY-MM-DD`) windows — same rule as {@link computeDeploymentRisk01}.
 */
export function ymdInAnyDeploymentRiskBlackout(
  ymd: string,
  blackouts: readonly { start: string; end: string }[] | null | undefined,
): boolean {
  if (!blackouts?.length) return false;
  for (const b of blackouts) {
    if (ymd >= b.start && ymd <= b.end) return true;
  }
  return false;
}

/**
 * Blackouts whose YAML `[start, end]` window overlaps `[spanStart, spanEnd]` (all ISO inclusive).
 */
export function deploymentBlackoutsOverlappingIsoRangeInclusive(
  blackouts: readonly DeploymentRiskBlackout[] | null | undefined,
  spanStart: string,
  spanEnd: string,
): DeploymentRiskBlackout[] {
  if (!blackouts?.length) return [];
  return blackouts.filter((b) => spanStart <= b.end && spanEnd >= b.start);
}

/**
 * Union of overlapping YAML windows for a contiguous **drawn** span.
 *
 * Programme Gantt builds spans from layout-visible days only, so `spanStart`/`spanEnd` can be
 * clipped to the strip range; this returns the true config dates for copy and tooltips.
 */
export function deploymentBlackoutYamlEnvelopeForSpan(
  blackouts: readonly DeploymentRiskBlackout[] | null | undefined,
  spanStart: string,
  spanEnd: string,
): { start: string; end: string } | null {
  const hits = deploymentBlackoutsOverlappingIsoRangeInclusive(blackouts, spanStart, spanEnd);
  if (!hits.length) return null;
  let lo = hits[0]!.start;
  let hi = hits[0]!.end;
  for (const b of hits) {
    if (b.start < lo) lo = b.start;
    if (b.end > hi) hi = b.end;
  }
  return { start: lo, end: hi };
}

/** Inclusive ISO range for UI (single day if start === end). */
export function formatDeploymentBlackoutIsoRange(start: string, end: string): string {
  return start === end ? start : `${start}–${end}`;
}
