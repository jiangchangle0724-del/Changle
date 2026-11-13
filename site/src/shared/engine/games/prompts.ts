import { LIKELY, NEVER } from "../../../data/prompts";
import type { PromptsView } from "../../protocol";
import { range, type Api, type GameDef } from "../api";

type Mode = "never" | "likely";
type S = {
  mode: Mode;
  phase: "draw" | "answer" | "reveal";
  reader: string;
  card: number | null;
  endsAt: number;
  ans: Record<string, boolean>;
  votes: Record<string, string>;
  result: PromptsView["result"];
  decks: Record<Mode, number[]>;
};

const ANSWER_MS = 30_000;
const list = (m: Mode) => (m === "never" ? NEVER : LIKELY);

function noteFor(s: S) {
  if (s.card === null) return undefined;
  const c = list(s.mode)[s.card];
  return s.mode === "never"
    ? { zh: `我曾经${c.zh}`, en: `Never have I ever ${c.en}` }
    : { zh: `在座谁最有可能${c.zh}`, en: `Most likely to ${c.en}` };
}

function reveal(s: S, api: Api) {
  if (s.phase !== "answer") return;
  api.clear("answer");
  s.phase = "reveal";
  if (s.mode === "never") {
    const yes = api.ids().filter((id) => s.ans[id] === true);
    s.result = { yes, counts: null, votes: null, top: null };
    if (yes.length) api.penalty(yes, "sip", noteFor(s), { delay: 1400 });
  } else {
    const counts: Record<string, number> = {};
    for (const [voter, target] of Object.entries(s.votes)) if (api.has(voter) && api.has(target)) counts[target] = (counts[target] ?? 0) + 1;
    const max = Math.max(0, ...Object.values(counts));
    const top = max > 0 ? Object.keys(counts).filter((id) => counts[id] === max) : [];
    s.result = { yes: null, counts, votes: { ...s.votes }, top };
    if (top.length) api.penalty(top, "sip", noteFor(s), { delay: 1600 });
  }
  api.fx("reveal");
}

function everyoneIn(s: S, api: Api) {
  const ids = api.ids();
  return s.mode === "never" ? ids.every((id) => s.ans[id] !== undefined) : ids.every((id) => s.votes[id] !== undefined);
}

export const prompts: GameDef<S> = {
  id: "prompts",
  min: 2,
  init(api) {
    return {
      mode: "never",
      phase: "draw",
      reader: api.ids()[0],
      card: null,
      endsAt: 0,
      ans: {},
      votes: {},
      result: null,
      decks: { never: api.shuffle(range(NEVER.length)), likely: api.shuffle(range(LIKELY.length)) },
    };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "draw": {
        if (s.phase !== "draw" || (pid !== s.reader && !host)) return;
        if (!s.decks[s.mode].length) s.decks[s.mode] = api.shuffle(range(list(s.mode).length));
        s.card = s.decks[s.mode].pop() ?? 0;
        s.ans = {};
        s.votes = {};
        s.result = null;
        s.phase = "answer";
        s.endsAt = api.now + ANSWER_MS;
        api.timer("answer", s.endsAt);
        api.fx("card", pid);
        return;
      }
      case "ans": {
        // (players only: someone just watching, host or not, doesn't answer)
        if (s.phase !== "answer" || s.mode !== "never" || typeof g.yes !== "boolean" || !api.has(pid)) return;
        s.ans[pid] = g.yes;
        if (everyoneIn(s, api)) reveal(s, api);
        return;
      }
      case "vote": {
        const target = String(g.target ?? "");
        if (s.phase !== "answer" || s.mode !== "likely" || !api.has(target) || target === pid || !api.has(pid)) return;
        s.votes[pid] = target;
        if (everyoneIn(s, api)) reveal(s, api);
        return;
      }
      case "force": {
        if (!host) return;
        reveal(s, api);
        return;
      }
      case "next": {
        if (s.phase !== "reveal" || (pid !== s.reader && !host)) return;
        s.reader = api.next(s.reader);
        s.phase = "draw";
        s.card = null;
        s.result = null;
        return;
      }
      case "mode": {
        if (!host) return;
        const m: Mode = g.mode === "likely" ? "likely" : "never";
        if (m === s.mode && s.phase === "draw") return;
        s.mode = m;
        s.phase = "draw";
        s.card = null;
        s.result = null;
        api.clear("answer");
        return;
      }
    }
  },

  timer(s, key, _d, api) {
    if (key === "answer") reveal(s, api);
  },

  leave(s, pid, api) {
    delete s.ans[pid];
    delete s.votes[pid];
    if (s.reader === pid) s.reader = api.ids()[0] ?? "";
    if (s.phase === "answer" && everyoneIn(s, api)) reveal(s, api);
  },

  view(s, pid): PromptsView {
    const c = s.card !== null ? list(s.mode)[s.card] : null;
    return {
      id: "prompts",
      mode: s.mode,
      phase: s.phase,
      reader: s.reader,
      card: c ? { zh: c.zh, en: c.en } : null,
      endsAt: s.endsAt,
      answered: s.mode === "never" ? Object.keys(s.ans) : Object.keys(s.votes),
      mine: s.mode === "never" ? s.ans[pid] ?? null : s.votes[pid] ?? null,
      result: s.phase === "reveal" ? s.result : null,
      left: s.decks[s.mode].length,
    };
  },
};
