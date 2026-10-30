import { applyMove, BOT_NAMES, botMove, collectTrick, newGame, nextHand, SUITS, team, viewOf, type EMove, type EState } from "../../euchre";
import type { ESuit, EuchreView } from "../../protocol";
import { t, type Api, type GameDef } from "../api";

/**
 * Euchre at the online table: up to four people sit in, computer players fill the empty
 * seats, everyone else watches. When someone's phone drops off, a computer player makes
 * their moves for them until they're back.
 */

export { BOT_NAMES };

type S = {
  /** pid in each seat, null for a computer player */
  seats: (string | null)[];
  st: EState | null;
  phase: "setup" | "game";
  /** points to win */
  target: number;
};

const BOT_MS = 900;
const TRICK_MS = 1400;
const HAND_MS = 7000;
const AWAY_MS = 15_000;
const SLOW_MS = 75_000;

function defaultSeats(ids: string[]): (string | null)[] {
  const h = ids.slice(0, 4);
  if (h.length === 1) return [h[0], null, null, null];
  if (h.length === 2) return [h[0], null, h[1], null];
  if (h.length === 3) return [h[0], h[1], h[2], null];
  return h;
}

function schedule(s: S, api: Api) {
  const st = s.st;
  api.clear("bot");
  api.clear("trick");
  api.clear("hand");
  if (!st) return;
  if (st.phase === "trick") return api.timer("trick", api.now + TRICK_MS);
  if (st.phase === "hand") return api.timer("hand", api.now + HAND_MS);
  if (st.phase === "end") return;
  const pid = s.seats[st.turn];
  if (!pid || !api.has(pid)) return api.timer("bot", api.now + BOT_MS + api.int(500));
  // a person: give them time, more if their phone is open
  api.timer("bot", api.now + (api.online(pid) ? SLOW_MS : AWAY_MS));
}

function play(s: S, seat: number, mv: EMove, api: Api) {
  const st = s.st!;
  const before = st.phase;
  if (!applyMove(st, seat, mv)) return false;
  if (mv.t === "play") api.fx("play", s.seats[seat] ?? undefined);
  if (mv.t === "order" || mv.t === "call") api.fx("called", s.seats[seat] ?? undefined);
  if (before === "bid1" && st.phase === "bid2") api.fx("shuffle");
  schedule(s, api);
  return true;
}

function humansOf(s: S, side: 0 | 1, api: Api) {
  return s.seats.filter((pid, i): pid is string => !!pid && team(i) === side && api.has(pid));
}

function afterTrick(s: S, api: Api) {
  const st = s.st!;
  collectTrick(st);
  if (st.lastTrick) api.fx("trick", s.seats[st.lastTrick.winner] ?? undefined, [st.lastTrick.winner]);
  if (st.phase === "hand" || st.phase === "end") {
    const r = st.result!;
    if (r.euchre) {
      const who = humansOf(s, r.makers, api);
      if (who.length) api.penalty(who, "sip", t("尤克牌：被尤克了", "Euchre: you got euchred"), { delay: 1500 });
    }
    if (st.phase === "end") {
      api.fx("win");
      const losers = humansOf(s, (1 - st.winner!) as 0 | 1, api);
      if (losers.length) api.penalty(losers, "two", t("尤克牌：输了这局", "Euchre: lost the game"), { delay: 2600 });
    }
  }
  schedule(s, api);
}

export const euchre: GameDef<S> = {
  id: "euchre",
  min: 2,
  init(api) {
    return { seats: defaultSeats(api.ids()), st: null, phase: "setup", target: 10 };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "seats": {
        // partners or rivals, or a reshuffle of who sits where
        if (!host || s.phase !== "setup") return;
        const humans = s.seats.filter((p): p is string => !!p);
        if (g.mode === "rivals" && humans.length === 2) s.seats = [humans[0], humans[1], null, null];
        else if (g.mode === "partners" && humans.length === 2) s.seats = [humans[0], null, humans[1], null];
        else if (g.mode === "shuffle") {
          const order = api.shuffle([0, 1, 2, 3]);
          const next: (string | null)[] = [null, null, null, null];
          s.seats.forEach((p, i) => (next[order[i]] = p));
          s.seats = next;
        }
        return;
      }
      case "target": {
        const n = Number(g.n);
        if (host && s.phase === "setup" && (n === 5 || n === 10)) s.target = n;
        return;
      }
      case "sit": {
        // take a computer player's seat before the game starts (or move to it)
        const seat = Number(g.seat);
        if (s.phase !== "setup" || !Number.isInteger(seat) || seat < 0 || seat > 3 || s.seats[seat]) return;
        const was = s.seats.indexOf(pid);
        if (was >= 0) s.seats[was] = null;
        s.seats[seat] = pid;
        return;
      }
      case "stand": {
        if (s.phase !== "setup") return;
        const i = s.seats.indexOf(pid);
        if (i >= 0 && s.seats.filter(Boolean).length > 1) s.seats[i] = null;
        return;
      }
      case "start": {
        if (!host || s.phase !== "setup" || !s.seats.some((p) => p && api.has(p))) return;
        s.st = newGame(() => api.rand(), api.int(4), s.target);
        s.phase = "game";
        api.fx("shuffle");
        schedule(s, api);
        return;
      }
      case "move": {
        const seat = s.seats.indexOf(pid);
        if (s.phase !== "game" || !s.st || seat < 0 || seat !== s.st.turn) return;
        const mv = parseMove(g.mv);
        if (mv) play(s, seat, mv, api);
        return;
      }
      case "next": {
        if (!host || !s.st || s.st.phase !== "hand") return;
        nextHand(s.st, () => api.rand());
        api.fx("shuffle");
        schedule(s, api);
        return;
      }
      case "again": {
        if (!host || !s.st || s.st.phase !== "end") return;
        s.st = null;
        s.phase = "setup";
        s.seats = s.seats.map((p) => (p && api.has(p) ? p : null));
        return;
      }
    }
  },

  timer(s, key, _data, api) {
    const st = s.st;
    if (!st) return;
    if (key === "trick" && st.phase === "trick") afterTrick(s, api);
    else if (key === "hand" && st.phase === "hand") {
      nextHand(st, () => api.rand());
      api.fx("shuffle");
      schedule(s, api);
    } else if (key === "bot" && st.phase !== "trick" && st.phase !== "hand" && st.phase !== "end") {
      play(s, st.turn, botMove(st, st.turn), api);
    }
  },

  join(s, pid) {
    // someone new at the table takes an empty seat if the game hasn't started; otherwise they watch
    if (s.phase === "setup" && !s.seats.includes(pid)) {
      const free = s.seats.indexOf(null);
      if (free >= 0) s.seats[free] = pid;
    }
  },

  leave(s, pid, api) {
    // whoever leaves the table for good hands their seat to a computer player
    const i = s.seats.indexOf(pid);
    if (i < 0) return;
    s.seats[i] = null;
    if (s.st && s.st.turn === i) schedule(s, api);
  },

  view(s, pid, api): EuchreView {
    const mySeat = s.seats.indexOf(pid);
    const seats = s.seats.map((p, i) => ({ pid: p && api.has(p) ? p : null, bot: p && api.has(p) ? null : BOT_NAMES[i] }));
    return viewOf(s.st, mySeat >= 0 ? mySeat : null, seats, s.target);
  },
};

function parseMove(raw: unknown): EMove | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const card = typeof m.card === "string" && /^(9|10|J|Q|K|A)[SHDC]$/.test(m.card) ? m.card : null;
  switch (m.t) {
    case "pass":
      return { t: "pass" };
    case "order":
      return { t: "order", alone: !!m.alone };
    case "call":
      return SUITS.includes(m.suit as ESuit) ? { t: "call", suit: m.suit as ESuit, alone: !!m.alone } : null;
    case "discard":
      return card ? { t: "discard", card } : null;
    case "play":
      return card ? { t: "play", card } : null;
    default:
      return null;
  }
}
