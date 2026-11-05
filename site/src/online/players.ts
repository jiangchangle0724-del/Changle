import { useMemo } from "react";
import type { SeatView } from "../shared/protocol";
import { useRoom } from "./RoomContext";

/**
 * The seats in the game: everyone at the table except those just watching, in seat order. The
 * rooms server plays with exactly these (a game's `api.ids()`), so a ring, a list to pick or vote
 * from, a score list or a count built from them matches it. (`room.seats` has the watchers too:
 * fine for looking a seat up by id, for a name or a face.)
 */
export function playersOf(seats: readonly SeatView[] | null | undefined): SeatView[] {
  return (seats ?? []).filter((s) => !s.watch);
}

/** This table's players (see `playersOf`), the same list until the seats change. */
export function usePlayers(): SeatView[] {
  const seats = useRoom().room?.seats;
  return useMemo(() => playersOf(seats), [seats]);
}

/** This phone's seat is just watching: it sits the game out, so it gets nothing to play with (a big screen has no seat). */
export function useWatching(): boolean {
  const { room, me } = useRoom();
  return !!room?.seats.find((s) => s.id === me)?.watch;
}
