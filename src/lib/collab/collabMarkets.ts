import type { CapacityAccess } from '@/lib/capacityAccess';

/** Markets in runway order the user may open a collab Yjs room for. */
export function collabMarketsForAccess(
  access: CapacityAccess,
  runwayMarketOrder: readonly string[]
): string[] {
  if (!access.canEditYaml && !access.admin) return [];
  if (access.legacyFullAccess || access.admin) return [...runwayMarketOrder];
  const allow = new Set(access.allowedMarketIds);
  return runwayMarketOrder.filter((id) => allow.has(id));
}
