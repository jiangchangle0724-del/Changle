import { useRef } from "react";
import { useRoom } from "../../online/RoomContext";
import type { SeatView } from "../../shared/protocol";

/**
 * The table's seats, plus every seat this screen has seen since it opened: a winner who leaves
 * the table during the reveal keeps their name and face on it (the room has forgotten them, so
 * `nameOf()` and `SeatFace` would show "?"), and the ceremony still lists the awards they took.
 */
export function useSeatMemory() {
  const { room, nameOf } = useRoom();
  const seats = room?.seats ?? [];
  const seen = useRef(new Map<string, SeatView>());
  for (const s of seats) seen.current.set(s.id, s);
  const seat = (id: string): SeatView | undefined => seats.find((s) => s.id === id) ?? seen.current.get(id);
  return {
    seat,
    name: (id: string) => seat(id)?.name ?? nameOf(id),
    /** the ids among `ids` whose seat has gone, in the order given */
    gone: (ids: string[]) => ids.filter((id) => !seats.some((s) => s.id === id) && seen.current.has(id)),
  };
}
