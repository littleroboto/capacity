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
