import { useCallback } from "react";
import { useRoom } from "../../online/RoomContext";
import { SHARED_BY } from "../../shared/dj/types";

/** The shared phone's name where a player's would be: the songs picked on the big screen itself. */
export const sharedName = (zh: boolean) => (zh ? "公用手机" : "Shared phone");

/**
 * Who did it, as the booth says it: the room's names, and the shared phone's for the songs picked
 * on the big screen itself (Steve on Nov 11: one phone everyone shares, its screen on the TV).
 */
export function useDjNames(zh: boolean) {
  const { nameOf } = useRoom();
  return useCallback((pid: string | null | undefined) => (pid === SHARED_BY ? sharedName(zh) : nameOf(pid)), [nameOf, zh]);
}
