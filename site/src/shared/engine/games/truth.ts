import { DARES, LIMITS, limitsOf, promptText, SECRETS, TRUTHS, type Limit, type Prompt } from "../../../data/truthDare";
import { TRUTH_FLIP_MS, type TruthTally, type TruthView } from "../../protocol";
import { clean, intIn, num, range, type Api, type GameDef } from "../api";

type Kind = "truth" | "dare" | "secret";
/** A card the table wrote, dropped in anonymously; dealt before the built-in ones. */
type Slip = { id: string; k: "truth" | "dare"; text: string; by: string };

/** The most cards of their own a table can have waiting, and the longest one. */
export const SLIP_MAX = 40;
export const SLIP_TEXT = 60;
/** 悄悄话: how long the coin spins before everyone sees how it landed (ms). */
export const FLIP_MS = TRUTH_FLIP_MS;

const LISTS: Record<Kind, Prompt[]> = { truth: TRUTHS, dare: DARES, secret: SECRETS };

type S = {
  heat: 1 | 2;
  phase: "spin" | "choose" | "card";
  spinner: string;
  chosen: string | null;
  revealAt: number;
  kind: Kind | null;
  /** the card on the table, a place in its kind's list */
  prompt: number | null;
  /** the card on the table is one the table wrote: its words, as written */
  own: string | null;
  /** 听天由命: truth or dare was left to chance */
  rand: boolean;
  /** cards still to come, by kind and heat ("truth1", "dare2", "secret1"…), dealt from the end */
  decks: Record<string, number[]>;
  /** how often the bottle has picked each player this game (the spinning phone evens it out) */
  picked: Record<string, number>;
  /** who has used their one free swap this game */
  swapped: string[];
  /** the table's own cards still to come */
  slips: Slip[];
  slipN: number;
  /** 悄悄话: whom the one picked named, and the coin (open: everyone hears the question) */
  named: string | null;
  coin: "open" | "hidden" | null;
  flipAt: number;
  /** each player's own limits (每人底线): cards they'd rather skip */
  limits: Record<string, Limit[]>;
  /** this game so far, for the recap: truths answered, dares done, whispers, passes, named */
  tally: Record<string, TruthTally>;
  /** before decks by kind (a room started earlier): the current heat's truths and dares */
  tDeck?: number[];
  dDeck?: number[];
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
  s.named ??= null;
  s.coin ??= null;
  s.flipAt ??= 0;
  s.limits ??= {};
  s.tally ??= {};
  if (!s.decks) {
    s.decks = {};
    if (s.tDeck) s.decks[`truth${s.heat}`] = s.tDeck;
    if (s.dDeck) s.decks[`dare${s.heat}`] = s.dDeck;
    delete s.tDeck;
    delete s.dDeck;
  }
}

const count = (s: S, pid: string, key: keyof TruthTally) => {
  const t = (s.tally[pid] ??= {});
  t[key] = (t[key] ?? 0) + 1;
};

function backToSpin(s: S, spinner: string) {
  s.spinner = spinner;
  s.phase = "spin";
  s.chosen = null;
  s.kind = null;
  s.prompt = null;
  s.own = null;
  s.rand = false;
  s.named = null;
  s.coin = null;
}

const clear = (tags: Limit[], limits: Limit[]) => !tags.some((t) => limits.includes(t));

/**
 * The next card of a kind for `to`: one the table wrote first (never their own), then the deck. A
 * player's limits skip the cards they'd rather not get, and `mild` deals them mild ones at a spicy
 * table; when nothing at all fits, the limits give way rather than the game stopping.
 */
function deal(s: S, kind: Kind, to: string, api: Api) {
  const limits = s.limits[to] ?? [];
  s.kind = kind;
  if (kind !== "secret") {
    const slips = s.slips.filter((x) => x.k === kind && x.by !== to && clear(limitsOf(x.text, kind), limits));
    if (slips.length) {
      const slip = slips[api.int(slips.length)];
      s.slips = s.slips.filter((x) => x.id !== slip.id);
      s.own = slip.text;
      s.prompt = null;
      return;
    }
  }
  const list = LISTS[kind];
  const fits = (i: number) => clear(limitsOf(list[i].zh, kind), limits);
  const take = (heat: number, fresh: boolean) => {
    const key = `${kind}${heat}`;
    if (fresh || !s.decks[key]) s.decks[key] = deckFor(list, heat, api);
    const deck = s.decks[key];
    for (let at = deck.length - 1; at >= 0; at--) if (fits(deck[at])) return deck.splice(at, 1)[0];
    return null;
  };
  // this heat's deck, then the same reshuffled, then the mild ones; at worst the limits give way
  const heat = limits.includes("mild") ? 1 : s.heat;
  let card = take(heat, false) ?? take(heat, true) ?? (heat === 2 ? (take(1, false) ?? take(1, true)) : null);
  if (card === null) {
    const deck = (s.decks[`${kind}${heat}`] ??= deckFor(list, heat, api));
    card = deck.pop() ?? 0;
  }
  s.prompt = card;
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
      decks: { truth1: deckFor(TRUTHS, 1, api), dare1: deckFor(DARES, 1, api) },
      picked: {},
      swapped: [],
      slips: [],
      slipN: 0,
      named: null,
      coin: null,
      flipAt: 0,
      limits: {},
      tally: {},
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
        const kind: Kind = s.rand ? (api.int(2) ? "dare" : "truth") : g.kind === "dare" ? "dare" : g.kind === "secret" ? "secret" : "truth";
        deal(s, kind, to, api);
        s.named = null;
        s.coin = null;
        s.phase = "card";
        api.fx("card", to);
        return;
      }
      case "swap": {
        // one free swap per player per game, for a card they'd rather not (a whisper: before naming anyone)
        if (s.phase !== "card" || pid !== s.chosen || !s.kind || s.named || s.swapped.includes(pid)) return;
        s.swapped.push(pid);
        deal(s, s.kind, pid, api);
        api.fx("card", pid);
        return;
      }
      case "name": {
        // 悄悄话: the one picked answers with a name, out loud; then the coin
        if (s.phase !== "card" || s.kind !== "secret" || s.named || (pid !== s.chosen && !host) || !s.chosen) return;
        const who = typeof g.who === "string" && api.has(g.who) ? g.who : null;
        if (!who) return;
        s.named = who;
        s.coin = api.int(2) ? "open" : "hidden";
        s.flipAt = api.now + FLIP_MS;
        count(s, s.chosen, "s");
        count(s, who, "n");
        return;
      }
      case "peek": {
        // tails: the one named can take a penalty to hear the question (and so does everyone)
        if (s.phase !== "card" || s.kind !== "secret" || s.coin !== "hidden" || pid !== s.named) return;
        if (api.now < s.flipAt - 400) return;
        api.penalty([pid], "sip");
        count(s, pid, "p");
        s.coin = "open";
        return;
      }
      case "done": {
        if (s.phase !== "card" || !s.chosen) return;
        if (!host && (pid !== s.chosen || (s.kind === "secret" && !s.named))) return;
        if (s.kind === "truth" || s.kind === "dare") count(s, s.chosen, s.kind === "truth" ? "t" : "d");
        backToSpin(s, s.chosen);
        return;
      }
      case "pass": {
        if (s.phase !== "card" || pid !== s.chosen || s.named) return;
        api.penalty([pid], "sip");
        count(s, pid, "p");
        backToSpin(s, pid);
        return;
      }
      case "add": {
        // anyone at the table can drop in a card; nobody sees who wrote it
        const text = clean(g.text, SLIP_TEXT);
        const k = g.kind === "dare" ? "dare" : "truth";
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
      case "limits": {
        // a player's own limits, from their own phone; nobody else sees them
        const list = Array.isArray(g.list) ? g.list : [];
        s.limits[pid] = LIMITS.filter((l) => list.includes(l));
        return;
      }
      case "heat": {
        if (!host) return;
        s.heat = g.heat === 2 ? 2 : 1;
        s.decks[`truth${s.heat}`] = deckFor(TRUTHS, s.heat, api);
        s.decks[`dare${s.heat}`] = deckFor(DARES, s.heat, api);
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
    const p = s.prompt !== null && s.kind ? LISTS[s.kind][s.prompt] : null;
    // a whisper is read by the one picked only, until the coin opens it to everyone
    const unheard = s.kind === "secret" && pid !== s.chosen && s.coin !== "open";
    return {
      id: "truth",
      heat: s.heat,
      phase: s.phase,
      spinner: s.spinner,
      chosen: s.chosen,
      revealAt: s.revealAt,
      kind: s.kind,
      prompt: unheard ? null : s.own !== null ? { zh: s.own, en: s.own } : p ? promptText(p, api.customPenalty) : null,
      picked: s.picked,
      rand: s.rand,
      own: s.own !== null,
      slips: {
        truth: s.slips.filter((x) => x.k === "truth").length,
        dare: s.slips.filter((x) => x.k === "dare").length,
        mine: s.slips.filter((x) => x.by === pid).length,
      },
      swapLeft: !s.swapped.includes(pid),
      named: s.named,
      coin: s.coin,
      flipAt: s.flipAt,
      limits: s.limits[pid] ?? [],
      tally: s.tally,
    };
  },
};
