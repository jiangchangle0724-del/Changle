import { useCallback } from "react";
import { SeatFace } from "../../../online/People";
import type { SeatView } from "../../../shared/protocol";
import type { Who } from "./Stage";

/** Names and faces for the show, from the seats at the table. */
export function useWho(seats: SeatView[]): Who {
  return useCallback(
    (pid: string) => {
      const seat = seats.find((s) => s.id === pid);
      return { name: seat?.name ?? "?", face: (size: number) => <SeatFace seat={seat} size={size} /> };
    },
    [seats],
  );
}
