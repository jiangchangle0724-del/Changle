import type { TripView } from "../../protocol";
import type { GameDef } from "../api";

type S = { code: string | null; at: number };

/**
 * 到此一游 runs on its own server, at changle.ca/trip (games/been-there in the changle-ca
 * repository). At the table it is only the way in: the host's phone opens a room there and hands
 * its number to the table, and every phone and the big screen follow it there. When the trip is
 * over, the host's phone comes back and ends it here, and everyone is back in the table's lobby.
 */
export const trip: GameDef<S> = {
  id: "trip",
  min: 1,
  init() {
    return { code: null, at: 0 };
  },
  act(s, pid, g, api) {
    if (g.x !== "open" || !api.isHost(pid)) return;
    const code = String(g.code ?? "");
    if (!/^\d{4}$/.test(code)) return;
    s.code = code;
    s.at = api.now;
  },
  view(s): TripView {
    return { id: "trip", code: s.code, at: s.at };
  },
};
