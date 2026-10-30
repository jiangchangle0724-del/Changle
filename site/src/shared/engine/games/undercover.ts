import { WORD_PAIRS } from "../../../data/undercover";
import type { UcRole, UndercoverView } from "../../protocol";
import { clean, intIn, t, type Api, type GameDef } from "../api";

type Phase = UndercoverView["phase"];
type S = {
  phase: Phase;
  uc: number;
  blank: boolean;
  round: number;
  pair: number | null;
  flip: boolean;
  roles: Record<string, UcRole>;
  alive: string[];
  ready: string[];
  order: string[];
  speaker: number;
  endsAt: number;
  desc: Record<string, string>;
  votes: Record<string, string>;
  lastVotes: Record<string, string> | null;
  out: { pid: string; role: UcRole } | null;
  tie: boolean;
  winner: "civ" | "uc" | null;
};

const TALK_MS = 40_000;
const VOTE_MS = 60_000;

/** How many players may sit on the undercover side for a table of n. */
function maxSide(n: number) {
  return Math.max(1, Math.floor((n - 1) / 3));
}

function fit(s: S, n: number) {
  const side = maxSide(n);
  s.uc = Math.max(1, Math.min(3, s.uc, side));
  if (s.blank && s.uc + 1 > side) s.blank = false;
}

function startTalk(s: S, api: Api) {
  const start = api.int(Math.max(1, s.alive.length));
  s.order = [...s.alive.slice(start), ...s.alive.slice(0, start)];
  s.speaker = 0;
  s.desc = {};
  s.endsAt = api.now + TALK_MS;
  s.phase = "talk";
  api.timer("talk", s.endsAt);
}

function startVote(s: S, api: Api) {
  s.phase = "vote";
  s.votes = {};
  s.endsAt = api.now + VOTE_MS;
  api.clear("talk");
  api.timer("vote", s.endsAt);
}

function advanceSpeaker(s: S, api: Api) {
  s.speaker += 1;
  while (s.speaker < s.order.length && !s.alive.includes(s.order[s.speaker])) s.speaker += 1;
  if (s.speaker >= s.order.length) {
    startVote(s, api);
    return;
  }
  s.endsAt = api.now + TALK_MS;
  api.timer("talk", s.endsAt);
}

function checkWinner(s: S) {
  const side = s.alive.filter((id) => s.roles[id] && s.roles[id] !== "civ").length;
  const civ = s.alive.filter((id) => s.roles[id] === "civ").length;
  if (side === 0) s.winner = "civ";
  else if (side >= civ) s.winner = "uc";
}

function tally(s: S, api: Api) {
  api.clear("vote");
  const counts: Record<string, number> = {};
  for (const [voter, target] of Object.entries(s.votes)) if (s.alive.includes(voter) && s.alive.includes(target)) counts[target] = (counts[target] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((id) => counts[id] === max);
  s.lastVotes = { ...s.votes };
  s.tie = max === 0 || top.length !== 1;
  s.out = null;
  if (!s.tie) {
    const pid = top[0];
    s.out = { pid, role: s.roles[pid] ?? "civ" };
    s.alive = s.alive.filter((id) => id !== pid);
    checkWinner(s);
  }
  s.phase = "reveal";
  api.fx("reveal", s.out?.pid);
}

function words(s: S) {
  if (s.pair === null) return null;
  const p = WORD_PAIRS[s.pair];
  return s.flip ? { civ: p.b, uc: p.a } : { civ: p.a, uc: p.b };
}

const WIN_CIV = t("谁是卧底：卧底被揪出来了", "Undercover: the undercover was caught");
const WIN_UC = t("谁是卧底：卧底赢了", "Undercover: the undercover side wins");

export const undercover: GameDef<S> = {
  id: "undercover",
  min: 4,
  init(api) {
    const n = api.ids().length;
    const s: S = {
      phase: "setup",
      uc: n >= 10 ? 3 : n >= 7 ? 2 : 1,
      blank: false,
      round: 0,
      pair: null,
      flip: false,
      roles: {},
      alive: [],
      ready: [],
      order: [],
      speaker: 0,
      endsAt: 0,
      desc: {},
      votes: {},
      lastVotes: null,
      out: null,
      tie: false,
      winner: null,
    };
    fit(s, n);
    return s;
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    const n = api.ids().length;
    switch (g.x) {
      case "config": {
        if (!host || s.phase !== "setup") return;
        const uc = intIn(g.uc, 1, 3);
        if (uc !== null) s.uc = uc;
        if (typeof g.blank === "boolean") s.blank = g.blank;
        fit(s, n);
        return;
      }
      case "deal": {
        if (!host || (s.phase !== "setup" && s.phase !== "end") || n < 4) return;
        fit(s, n);
        const ids = api.shuffle(api.ids());
        s.roles = {};
        ids.forEach((id, i) => {
          s.roles[id] = i < s.uc ? "uc" : i < s.uc + (s.blank ? 1 : 0) ? "blank" : "civ";
        });
        s.pair = api.int(WORD_PAIRS.length);
        s.flip = api.rand() < 0.5;
        s.alive = api.ids();
        s.ready = [];
        s.round = 1;
        s.votes = {};
        s.lastVotes = null;
        s.out = null;
        s.tie = false;
        s.winner = null;
        s.desc = {};
        s.phase = "word";
        api.fx("card");
        return;
      }
      case "ready": {
        if (s.phase !== "word" || !s.alive.includes(pid) || s.ready.includes(pid)) return;
        s.ready.push(pid);
        if (s.alive.every((id) => s.ready.includes(id))) startTalk(s, api);
        return;
      }
      case "force": {
        if (!host) return;
        if (s.phase === "word") startTalk(s, api);
        else if (s.phase === "talk") startVote(s, api);
        else if (s.phase === "vote") tally(s, api);
        return;
      }
      case "desc": {
        if (s.phase !== "talk" || s.order[s.speaker] !== pid) return;
        const text = clean(g.text, 30);
        if (text) s.desc[pid] = text;
        return;
      }
      case "done": {
        if (s.phase !== "talk" || (s.order[s.speaker] !== pid && !host)) return;
        advanceSpeaker(s, api);
        return;
      }
      case "vote": {
        const target = String(g.target ?? "");
        if (s.phase !== "vote" || !s.alive.includes(pid) || !s.alive.includes(target) || target === pid) return;
        s.votes[pid] = target;
        if (s.alive.every((id) => s.votes[id])) tally(s, api);
        return;
      }
      case "next": {
        if (!host || s.phase !== "reveal") return;
        if (s.winner) {
          s.phase = "end";
          const losers = Object.keys(s.roles).filter((id) => (s.winner === "civ" ? s.roles[id] !== "civ" : s.roles[id] === "civ"));
          api.penalty(losers, "sip", s.winner === "civ" ? WIN_CIV : WIN_UC);
          api.fx("win");
          return;
        }
        s.round += 1;
        startTalk(s, api);
        return;
      }
      case "again": {
        if (!host || s.phase !== "end") return;
        s.phase = "setup";
        fit(s, n);
        return;
      }
    }
  },

  timer(s, key, _d, api) {
    if (key === "talk" && s.phase === "talk") advanceSpeaker(s, api);
    if (key === "vote" && s.phase === "vote") tally(s, api);
  },

  leave(s, pid, api) {
    s.alive = s.alive.filter((id) => id !== pid);
    s.ready = s.ready.filter((id) => id !== pid);
    delete s.votes[pid];
    for (const [v, target] of Object.entries(s.votes)) if (target === pid) delete s.votes[v];
    if (s.phase === "talk" && s.order[s.speaker] === pid) advanceSpeaker(s, api);
    if (s.phase === "word" && s.alive.length && s.alive.every((id) => s.ready.includes(id))) startTalk(s, api);
    if (s.phase === "vote" && s.alive.length && s.alive.every((id) => s.votes[id])) tally(s, api);
    if (s.phase !== "setup" && s.phase !== "end" && !s.winner) checkWinner(s);
  },

  view(s, pid, api): UndercoverView {
    const w = words(s);
    const role = s.roles[pid];
    const inPlay = s.phase !== "setup" && !!role;
    const ended = s.phase === "end";
    const revealing = s.phase === "reveal" || ended;
    return {
      id: "undercover",
      phase: s.phase,
      uc: s.uc,
      blank: s.blank,
      maxSide: maxSide(api.ids().length),
      round: s.round,
      inGame: Object.keys(s.roles),
      alive: s.alive,
      ready: s.ready,
      order: s.order,
      speaker: s.speaker,
      endsAt: s.endsAt,
      desc: s.desc,
      voted: Object.keys(s.votes),
      myVote: s.votes[pid] ?? null,
      votes: revealing ? s.lastVotes : null,
      out: revealing ? s.out : null,
      tie: s.tie,
      winner: revealing ? s.winner : null,
      myWord: inPlay && w && role !== "blank" ? (role === "uc" ? w.uc : w.civ) : null,
      isBlank: inPlay && role === "blank",
      roles: ended ? s.roles : null,
      pair: ended ? w : null,
    };
  },
};
