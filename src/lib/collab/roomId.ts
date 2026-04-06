/** Must match `party/collabRoomId.ts`. Workspace keys must not contain this separator. */
export const COLLAB_ROOM_SEP = '__';

export function collabRoomId(workspaceKey: string, marketId: string): string {
  const w = workspaceKey.trim();
  const m = marketId.trim().toUpperCase();
  return `${w}${COLLAB_ROOM_SEP}${m}`;
}
