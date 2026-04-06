/** Must match {@link ../src/lib/collab/roomId.ts}. Workspace keys must not contain this separator. */
export const COLLAB_ROOM_SEP = '__';

export function parseCollabRoomId(
  roomId: string
): { workspaceKey: string; marketId: string } | null {
  const i = roomId.indexOf(COLLAB_ROOM_SEP);
  if (i <= 0 || i + COLLAB_ROOM_SEP.length >= roomId.length) return null;
  return {
    workspaceKey: roomId.slice(0, i),
    marketId: roomId.slice(i + COLLAB_ROOM_SEP.length),
  };
}
