import { DARES, promptText, TRUTHS } from "../../../data/truthDare";
import type { TruthView } from "../../protocol";
import { clean, intIn, num, range, type Api, type GameDef } from "../api";

type Kind = "truth" | "dare";
/** A card the table wrote, dropped in anonymously; dealt before the built-in ones. */
type Slip = { id: string; k: Kind; text: string; by: string };

/** The most cards of their own a table can have waiting, and the longest one. */
export const SLIP_MAX = 40;
export const SLIP_TEXT = 60;

type S = {
  heat: 1 | 2;
  phase: "spin" | "choose" | "card";
  spinner: string;
  chosen: string | null;
  revealAt: number;
  kind: Kind | null;
  prompt: number | null;
  /** the card on the table is one the table wrote: its words, as written */
  own: string | null;
  /** 听天由命: truth or dare was left to chance */
  rand: boolean;
  tDeck: number[];
  dDeck: number[];
  /** how often the bottle has picked each player this game (the spinning phone evens it out) */
  picked: Record<string, number>;
  /** who has used their one free swap this game */
  swapped: string[];
  /** the table's own cards still to come */
  slips: Slip[];
  slipN: number;
};

/** Mild deals only the mild cards, spicy only the spicy ones. */
function deckFor(list: { heat: number }[], heat: number, api: Api) {
  return api.shuffle(range(list.length).filter((i) => list[i].heat === heat));
}

/** A room started before these were kept gets them now. */
function fill(s: S) {
  s.picked ??= {};
  s.swapped ??= [];
  s.slips ??= [];
  s.slipN ??= 0;
  s.own ??= null;
  s.rand ??= false;
}

function backToSpin(s: S, spinner: string) {
  s.spinner = spinner;
  s.phase = "spin";
  s.chosen = null;
  s.kind = null;
  s.prompt = null;
  s.own = null;
  s.rand = false;
}

/** The next card of a kind for `to`: one the table wrote first (never their own), then the deck. */
function deal(s: S, kind: Kind, to: string, api: Api) {
  const slips = s.slips.filter((x) => x.k === kind && x.by !== to);
  s.kind = kind;
  if (slips.length) {
    const slip = slips[api.int(slips.length)];
    s.slips = s.slips.filter((x) => x.id !== slip.id);
    s.own = slip.text;
    s.prompt = null;
    return;
  }
  const deckKey = kind === "truth" ? "tDeck" : "dDeck";
  if (!s[deckKey].length) s[deckKey] = deckFor(kind === "truth" ? TRUTHS : DARES, s.heat, api);
  s.prompt = s[deckKey].pop() ?? 0;
  s.own = null;
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
      own: null,
      rand: false,
      tDeck: deckFor(TRUTHS, 1, api),
      dDeck: deckFor(DARES, 1, api),
      picked: {},
      swapped: [],
      slips: [],
      slipN: 0,
    };
  },
  act(s, pid, g, api) {
    fill(s);
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
        s.picked[s.chosen] = (s.picked[s.chosen] ?? 0) + 1;
        s.revealAt = api.now + duration * 1000;
        s.phase = "choose";
        api.spin("truth", pid, index, delta, duration);
        return;
      }
      case "pick": {
        if (s.phase !== "choose" || (pid !== s.chosen && !host)) return;
        if (api.now < s.revealAt - 400) return;
        const to = s.chosen ?? pid;
        s.rand = g.kind === "random";
        deal(s, s.rand ? (api.int(2) ? "dare" : "truth") : g.kind === "dare" ? "dare" : "truth", to, api);
        s.phase = "card";
        api.fx("card", to);
        return;
      }
      case "swap": {
        // one free swap per player per game, for a card they'd rather not
        if (s.phase !== "card" || pid !== s.chosen || !s.kind || s.swapped.includes(pid)) return;
        s.swapped.push(pid);
        deal(s, s.kind, pid, api);
        api.fx("card", pid);
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
      case "add": {
        // anyone at the table can drop in a card; nobody sees who wrote it
        const text = clean(g.text, SLIP_TEXT);
        const k: Kind = g.kind === "dare" ? "dare" : "truth";
        if (!text || s.slips.length >= SLIP_MAX || s.slips.some((x) => x.k === k && x.text === text)) return;
        s.slipN += 1;
        s.slips.push({ id: `o${s.slipN}`, k, text, by: pid });
        return;
      }
      case "clearOwn": {
        if (!host) return;
        s.slips = [];
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
        if (!host || (g.at !== undefined && g.at !== `${s.phase}:${s.phase === "spin" ? s.spinner : s.chosen}`)) return;
        backToSpin(s, s.phase === "spin" ? api.next(s.spinner) : (s.chosen ?? s.spinner));
        return;
      }
    }
  },
  leave(s, pid, api) {
    fill(s);
    if (s.spinner === pid) s.spinner = api.ids()[0] ?? "";
    if (s.chosen === pid) backToSpin(s, s.spinner);
  },
  view(s, pid, api): TruthView {
    fill(s);
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
      prompt: s.own !== null ? { zh: s.own, en: s.own } : p ? promptText(p, api.customPenalty) : null,
      picked: s.picked,
      rand: s.rand,
      own: s.own !== null,
      slips: {
        truth: s.slips.filter((x) => x.k === "truth").length,
        dare: s.slips.filter((x) => x.k === "dare").length,
        mine: s.slips.filter((x) => x.by === pid).length,
      },
      swapLeft: !s.swapped.includes(pid),
    };
  },
};
