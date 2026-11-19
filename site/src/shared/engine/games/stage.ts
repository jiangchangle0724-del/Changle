import type { DanceView, HangOnView } from "../../protocol";
import type { GameDef } from "../api";

type S = { code: string | null; phone: boolean; at: number };

/** Both games' room codes: 4 of their alphabet (no I, O, 0 or 1), the same shape at /party and /hang-on. */
const CODE = /^[A-HJ-NP-Z2-9]{4}$/;

/**
 * 一起跳 · Dance Along (changle.ca/party) and 抓紧了 · Hang On (changle.ca/hang-on) each run on their own
 * server, like 到此一游 and 藏在人群里. At the table each is only the way in: the host's phone opens a
 * room there and hands its code to the table, every phone follows, and the big screen (or a phone
 * that only watches) opens the game's own stage. When it's over, the host ends it here and everyone
 * is back in the table's lobby.
 */
const stage: Pick<GameDef<S>, "min" | "init" | "act"> = {
  min: 1,
  init() {
    return { code: null, phone: false, at: 0 };
  },
  act(s, pid, g, api) {
    // only the host, only once: a second room would split the table
    if (g.x !== "open" || !api.isHost(pid) || s.code) return;
    const code = String(g.code ?? "");
    if (!CODE.test(code)) return;
    s.code = code;
    // a phones-only room (抓紧了 with no big screen at the table): the host's phone is its stage
    s.phone = g.phone === true;
    s.at = api.now;
  },
};

export const dance: GameDef<S> = {
  id: "dance",
  ...stage,
  view(s): DanceView {
    return { id: "dance", code: s.code, at: s.at };
  },
};

export const hangon: GameDef<S> = {
  id: "hangon",
  ...stage,
  view(s): HangOnView {
    return { id: "hangon", code: s.code, phone: s.phone, at: s.at };
  },
};
