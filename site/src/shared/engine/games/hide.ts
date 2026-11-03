import type { HideView } from "../../protocol";
import type { GameDef } from "../api";

type S = { code: string | null; at: number };

/**
 * 藏在人群里 · Hide in the Crowd runs on its own server, at changle.ca/hide (games/hide-crowd in the
 * changle-ca repository). At the table it is only the way in: the host's phone opens a room there
 * and hands its number to the table, and every phone and the big screen follow it there. When the
 * host takes everyone back, the host's phone ends it here, and everyone is back in the table's lobby.
 */
export const hide: GameDef<S> = {
  id: "hide",
  min: 2,
  init() {
    return { code: null, at: 0 };
  },
  act(s, pid, g, api) {
    // only the host, only once: a second room would split the table
    if (g.x !== "open" || !api.isHost(pid) || s.code) return;
    const code = String(g.code ?? "");
    if (!/^\d{4}$/.test(code)) return;
    s.code = code;
    s.at = api.now;
  },
  view(s): HideView {
    return { id: "hide", code: s.code, at: s.at };
  },
};
