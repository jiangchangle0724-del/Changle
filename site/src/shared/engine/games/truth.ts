import { DARES, TRUTHS } from "../../../data/truthDare";
import type { TruthView } from "../../protocol";
import { intIn, num, range, type Api, type GameDef } from "../api";

type S = {
  heat: 1 | 2;
  phase: "spin" | "choose" | "card";
  spinner: string;
  chosen: string | null;
  revealAt: number;
  kind: "truth" | "dare" | null;
  prompt: number | null;
  tDeck: number[];
  dDeck: number[];
};

function deckFor(list: { heat: number }[], heat: number, api: Api) {
  return api.shuffle(range(list.length).filter((i) => list[i].heat <= heat));
}

function backToSpin(s: S, spinner: string) {
  s.spinner = spinner;
  s.phase = "spin";
  s.chosen = null;
  s.kind = null;
  s.prompt = null;
}

export const truth: GameDef<S> = {
  id: "truth",
  min: 2,
  init(api) {
    return {
      heat: 1,
      phase: "spin",
      spinner: api.ids()[0],
      chosen: null,
      revealAt: 0,
      kind: null,
      prompt: null,
      tDeck: deckFor(TRUTHS, 1, api),
      dDeck: deckFor(DARES, 1, api),
    };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    switch (g.x) {
      case "spin": {
        if (s.phase !== "spin" || (pid !== s.spinner && !host)) return;
        const ids = api.ids();
        const index = intIn(g.index, 0, ids.length - 1);
        const duration = num(g.duration, 0.3, 6.5);
        const delta = num(g.delta, -5000, 5000);
        if (index === null || duration === null || delta === null) return;
        s.chosen = ids[index];
        s.revealAt = api.now + duration * 1000;
        s.phase = "choose";
        api.spin("truth", pid, index, delta, duration);
        return;
      }
      case "pick": {
        if (s.phase !== "choose" || (pid !== s.chosen && !host)) return;
        if (api.now < s.revealAt - 400) return;
        const kind = g.kind === "dare" ? "dare" : "truth";
        const deckKey = kind === "truth" ? "tDeck" : "dDeck";
        if (!s[deckKey].length) s[deckKey] = deckFor(kind === "truth" ? TRUTHS : DARES, s.heat, api);
        s.prompt = s[deckKey].pop() ?? 0;
        s.kind = kind;
        s.phase = "card";
        api.fx("card", s.chosen ?? pid);
        return;
      }
      case "done": {
        if (s.phase !== "card" || (pid !== s.chosen && !host) || !s.chosen) return;
        backToSpin(s, s.chosen);
        return;
      }
      case "pass": {
        if (s.phase !== "card" || pid !== s.chosen) return;
        api.penalty([pid], "sip");
        backToSpin(s, pid);
        return;
      }
      case "heat": {
        if (!host) return;
        s.heat = g.heat === 2 ? 2 : 1;
        s.tDeck = deckFor(TRUTHS, s.heat, api);
        s.dDeck = deckFor(DARES, s.heat, api);
        return;
      }
      case "skip": {
        if (!host) return;
        backToSpin(s, s.phase === "spin" ? api.next(s.spinner) : s.chosen ?? s.spinner);
        return;
      }
    }
  },

  leave(s, pid, api) {
    if (s.spinner === pid) s.spinner = api.ids()[0] ?? "";
    if (s.chosen === pid) backToSpin(s, s.spinner);
  },

  view(s): TruthView {
    const list = s.kind === "dare" ? DARES : TRUTHS;
    const p = s.prompt !== null ? list[s.prompt] : null;
    return {
      id: "truth",
      heat: s.heat,
      phase: s.phase,
      spinner: s.spinner,
      chosen: s.chosen,
      revealAt: s.revealAt,
      kind: s.kind,
      prompt: p ? { zh: p.zh, en: p.en } : null,
    };
  },
};
