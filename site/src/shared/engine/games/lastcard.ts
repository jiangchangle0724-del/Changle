import { canPlay, DECK_SIZE, drawOf, faceOf, isCard, isColor, isNumberCard, sortHand, type LcColor, type LcPending } from "../../lastcard/cards";
import { LC_NAME } from "../../lastcard/name";
import type { LastCardView, LcLog } from "../../protocol";
import { range, type Api, type GameDef } from "../api";

/**
 * 最后一张 · Last Card at an online table: a shedding game with 108 cards of our own (see
 * shared/lastcard/cards.ts). Seven cards each; match the pile's colour, number or symbol, or play a
 * wild; otherwise draw one, and play it if it fits. Skip, reverse (a skip with two), +2, wild, +4.
 * At one card you call 最后一张 before the next player moves, or anyone who catches you first makes
 * you draw 2. First to empty their hand wins the round; first to the host's target wins the match.
 *
 * Penalties (moderate): a sip for taking a +2, two for a +4 (or any stack of four or more), a sip
 * for being caught, and at each round's end whoever holds the most cards drinks a sip.
 *
 * Hands are secret: each phone's view carries only its own hand; nobody else's cards, and never the
 * draw pile, leave the server. A player's phone that is away on their turn draws one and passes after
 * 15 seconds, and the host can do the same for anyone (skip).
 */

const HAND = 7;
/** players in one round; anyone else at the table sits that round out */
export const LC_MAX = 10;
/** an away phone's turn moves on by itself after this long */
export const LC_AWAY_MS = 15_000;
/** the match targets the host can pick: rounds to win, 0 for none */
export const LC_TARGETS = [1, 3, 5, 0] as const;
const LOG_MAX = 8;

type S = {
  phase: "setup" | "play" | "round" | "end";
  stack: boolean;
  target: number;
  round: number;
  order: string[];
  hands: Record<string, number[]>;
  /** the draw pile, top card last */
  pile: number[];
  /** the discard pile, face-up card last */
  discard: number[];
  color: LcColor;
  turn: string;
  dir: 1 | -1;
  pending: number;
  pendingKind: LcPending;
  /** the card the player on turn just drew and may play */
  drawn: number | null;
  called: string[];
  open: string | null;
  tn: number;
  /** an away phone's turn: which turn its deadline belongs to, and when it falls */
  autoTn: number;
  autoAt: number;
  log: LcLog[];
  /** the last log entry's number */
  li: number;
  wins: Record<string, number>;
  winner: string | null;
  champ: string | null;
  most: string[];
};

/** A penalty's line: the game's name, then what happened (no line says drink: it's the stamp's word). */
const note = (zh: string, en: string) => ({ zh: `${LC_NAME.zh}：${zh}`, en: `${LC_NAME.en}: ${en}` });

type Without<X, K extends PropertyKey> = X extends unknown ? Omit<X, K> : never;
function log(s: S, e: Without<LcLog, "i">) {
  s.log.push({ ...e, i: ++s.li } as LcLog);
  if (s.log.length > LOG_MAX) s.log = s.log.slice(-LOG_MAX);
}

const count = (s: S, pid: string) => s.hands[pid]?.length ?? 0;
const topOf = (s: S) => s.discard[s.discard.length - 1] ?? null;

/** The player `by` places on from `from`, the way play is going. */
function step(s: S, from: string, by = 1): string {
  const n = s.order.length;
  const i = s.order.indexOf(from);
  if (!n) return "";
  if (i < 0) return s.order[0];
  return s.order[(((i + s.dir * by) % n) + n) % n];
}

/** One card off the draw pile; an empty pile is made again from the discards under the top card. */
function drawOne(s: S, api: Api): number | null {
  if (!s.pile.length && s.discard.length > 1) {
    const top = s.discard.pop()!;
    s.pile = api.shuffle(s.discard);
    s.discard = [top];
    log(s, { k: "shuffle" });
    api.fx("shuffle");
  }
  return s.pile.pop() ?? null;
}

/** Someone's hand grows: a call they made no longer counts, and they're no one's to catch. */
function grew(s: S, pid: string) {
  s.called = s.called.filter((p) => p !== pid);
  if (s.open === pid) s.open = null;
}

function give(s: S, pid: string, n: number, api: Api) {
  let got = 0;
  for (; got < n; got++) {
    const c = drawOne(s, api);
    if (c === null) break;
    s.hands[pid].push(c);
  }
  if (got) grew(s, pid);
  return got;
}

/** A +2, a +4 or a whole stack lands on someone: they draw it, and drink for it. */
function hit(s: S, pid: string, n: number, api: Api) {
  give(s, pid, n, api);
  log(s, { k: "take", p: pid, n });
  api.fx("card", pid);
  api.penalty([pid], n >= 4 ? "two" : "sip", note(`吃下 +${n}`, `hit with +${n}`), { delay: 700 });
}

/** The player on turn moves (or is moved for): whoever was down to one card uncalled is safe now. */
function moved(s: S, pid: string) {
  if (s.open && s.open !== pid) s.open = null;
}

/**
 * A phone that's away on its turn doesn't hold the table up for long; an open one waits for its
 * player (the host can skip). With nobody else at the table either, the game simply waits. The
 * deadline is kept for the turn, so other phones coming and going don't push it back.
 */
function schedule(s: S, api: Api) {
  api.clear("auto");
  const waits = s.phase === "play" && !!s.turn && !api.online(s.turn) && s.order.some((p) => p !== s.turn && api.online(p));
  if (!waits) {
    s.autoTn = -1;
    return;
  }
  if (s.autoTn !== s.tn) {
    s.autoTn = s.tn;
    s.autoAt = api.now + LC_AWAY_MS;
  }
  api.timer("auto", s.autoAt, { tn: s.tn });
}

function setTurn(s: S, pid: string, api: Api) {
  s.turn = pid;
  s.tn += 1;
  s.drawn = null;
  schedule(s, api);
}

/** Whoever's turn it is draws one and passes (or takes the stack waiting on them): an away phone, or the host's skip. */
function autoMove(s: S, api: Api) {
  const pid = s.turn;
  moved(s, pid);
  if (s.pending) {
    const n = s.pending;
    s.pending = 0;
    s.pendingKind = null;
    hit(s, pid, n, api);
  } else if (s.drawn === null) {
    const c = drawOne(s, api);
    if (c !== null) {
      s.hands[pid].push(c);
      grew(s, pid);
      api.fx("card", pid);
    }
  }
  log(s, { k: "auto", p: pid });
  setTurn(s, step(s, pid), api);
}

function startRound(s: S, api: Api) {
  const players = api.ids().slice(0, LC_MAX);
  if (players.length < 2) return;
  s.order = players;
  s.round += 1;
  const deck = api.shuffle(range(DECK_SIZE));
  s.hands = {};
  for (const p of players) s.hands[p] = [];
  for (let i = 0; i < HAND; i++) for (const p of players) s.hands[p].push(deck.pop()!);
  // turn up a number card to start: anything else goes back under the pile
  let first = deck.pop()!;
  for (let guard = 0; !isNumberCard(first) && guard < DECK_SIZE; guard++) {
    deck.unshift(first);
    first = deck.pop()!;
  }
  s.pile = deck;
  s.discard = [first];
  s.color = faceOf(first).c ?? "r";
  s.dir = 1;
  s.pending = 0;
  s.pendingKind = null;
  s.called = [];
  s.open = null;
  s.winner = null;
  s.champ = null;
  s.most = [];
  s.log = [];
  s.phase = "play";
  log(s, { k: "deal", n: s.round });
  api.fx("shuffle");
  // the first move goes round the table, a round each
  setTurn(s, players[(s.round - 1) % players.length], api);
}

function endRound(s: S, winner: string, api: Api) {
  api.clear("auto");
  s.winner = winner;
  s.wins[winner] = (s.wins[winner] ?? 0) + 1;
  s.pending = 0;
  s.pendingKind = null;
  s.drawn = null;
  s.open = null;
  s.tn += 1;
  const others = s.order.filter((p) => p !== winner);
  const most = Math.max(0, ...others.map((p) => count(s, p)));
  s.most = most > 0 ? others.filter((p) => count(s, p) === most) : [];
  log(s, { k: "win", p: winner });
  api.fx("win", winner);
  if (s.most.length) api.penalty(s.most, "sip", note("这一轮剩的牌最多", "most cards left this round"), { delay: 1800 });
  if (s.target > 0 && s.wins[winner] >= s.target) {
    s.phase = "end";
    s.champ = winner;
  } else s.phase = "round";
}

function play(s: S, pid: string, card: number, picked: unknown, api: Api) {
  const hand = s.hands[pid];
  if (!hand || !hand.includes(card)) return;
  // after a draw, only the card drawn may go down
  if (s.drawn !== null && card !== s.drawn) return;
  if (!canPlay(card, topOf(s), s.color, s.pendingKind)) return;
  const f = faceOf(card);
  let color: LcColor;
  if (f.c === null) {
    if (!isColor(picked)) return;
    color = picked;
  } else color = f.c;

  hand.splice(hand.indexOf(card), 1);
  s.discard.push(card);
  s.color = color;
  s.drawn = null;
  moved(s, pid);
  log(s, f.c === null ? { k: "play", p: pid, c: card, col: color } : { k: "play", p: pid, c: card });
  api.fx("play", pid);
  // one card left: safe if they called it, someone to catch if they didn't
  if (hand.length === 1) {
    if (!s.called.includes(pid)) s.open = pid;
  } else s.called = s.called.filter((p) => p !== pid);
  const out = hand.length === 0;

  const n = s.order.length;
  if (f.k === "skip" || (f.k === "rev" && n === 2)) {
    // (with two players a reverse is a skip: the same player goes again)
    log(s, { k: "skip", p: step(s, pid) });
    if (out) return endRound(s, pid, api);
    return setTurn(s, step(s, pid, 2), api);
  }
  if (f.k === "rev") {
    s.dir = s.dir === 1 ? -1 : 1;
    log(s, { k: "rev", d: s.dir });
    if (out) return endRound(s, pid, api);
    return setTurn(s, step(s, pid), api);
  }
  const add = drawOf(f.k);
  if (add) {
    if (s.stack && !out) {
      // stacking: the next player answers with the same kind, or takes the lot
      s.pending += add;
      s.pendingKind = f.k as LcPending;
      return setTurn(s, step(s, pid), api);
    }
    const total = s.pending + add;
    s.pending = 0;
    s.pendingKind = null;
    hit(s, step(s, pid), total, api);
    if (out) return endRound(s, pid, api);
    return setTurn(s, step(s, pid, 2), api);
  }
  if (out) return endRound(s, pid, api);
  setTurn(s, step(s, pid), api);
}

export const lastcard: GameDef<S> = {
  id: "lastcard",
  min: 2,
  init() {
    return {
      phase: "setup",
      stack: false,
      target: 3,
      round: 0,
      order: [],
      hands: {},
      pile: [],
      discard: [],
      color: "r",
      turn: "",
      dir: 1,
      pending: 0,
      pendingKind: null,
      drawn: null,
      called: [],
      open: null,
      tn: 0,
      autoTn: -1,
      autoAt: 0,
      log: [],
      li: 0,
      wins: {},
      winner: null,
      champ: null,
      most: [],
    };
  },

  act(s, pid, g, api) {
    const host = api.isHost(pid);
    // a move on the turn names the turn it was made on: a doubled tap, or one from a phone that
    // hasn't caught up yet, lands nowhere
    const onTurn = s.phase === "play" && g.at === s.tn;
    switch (g.x) {
      /* ---- before the deal: the host's house rules ---- */
      case "stack":
        if (host && s.phase === "setup") s.stack = !!g.on;
        return;
      case "target": {
        const n = Number(g.n);
        if (host && s.phase === "setup" && (LC_TARGETS as readonly number[]).includes(n)) s.target = n;
        return;
      }
      case "deal":
        if (host && s.phase === "setup") startRound(s, api);
        return;

      /* ---- the player on turn ---- */
      case "play": {
        if (!onTurn || pid !== s.turn || !isCard(g.card)) return;
        play(s, pid, g.card, g.color, api);
        return;
      }
      case "draw": {
        if (!onTurn || pid !== s.turn) return;
        moved(s, pid);
        if (s.pending) {
          const n = s.pending;
          s.pending = 0;
          s.pendingKind = null;
          hit(s, pid, n, api);
          return setTurn(s, step(s, pid), api);
        }
        if (s.drawn !== null) return;
        const c = drawOne(s, api);
        if (c === null) {
          // not a card left anywhere: on to the next player
          log(s, { k: "pass", p: pid });
          return setTurn(s, step(s, pid), api);
        }
        s.hands[pid].push(c);
        grew(s, pid);
        log(s, { k: "draw", p: pid });
        api.fx("card", pid);
        if (canPlay(c, topOf(s), s.color, null)) {
          // it fits: play it, or keep it
          s.drawn = c;
          s.tn += 1;
          return schedule(s, api);
        }
        return setTurn(s, step(s, pid), api);
      }
      case "keep": {
        if (!onTurn || pid !== s.turn || s.drawn === null) return;
        log(s, { k: "keep", p: pid });
        return setTurn(s, step(s, pid), api);
      }

      /* ---- anyone in the round, any time ---- */
      case "call": {
        if (s.phase !== "play" || !s.order.includes(pid) || s.called.includes(pid)) return;
        // at one card, or at two on your own turn, just before the card that takes you down to one
        const n = count(s, pid);
        if (n !== 1 && !(n === 2 && s.turn === pid)) return;
        s.called.push(pid);
        if (s.open === pid) s.open = null;
        log(s, { k: "call", p: pid });
        api.fx("called", pid);
        return;
      }
      case "catch": {
        const who = String(g.pid ?? "");
        if (s.phase !== "play" || !s.open || s.open !== who || who === pid || !s.order.includes(pid)) return;
        s.open = null;
        give(s, who, 2, api);
        log(s, { k: "catch", p: who, by: pid });
        api.fx("wrong", who);
        api.penalty([who], "sip", note("剩一张没喊，被抓到了", "caught on one card without calling it"), { delay: 500 });
        return;
      }

      /* ---- the host ---- */
      case "skip":
        // the player on turn draws one and passes (a phone left on the table, someone gone to the bar)
        if (host && onTurn) autoMove(s, api);
        return;
      case "next":
        if (host && s.phase === "round") startRound(s, api);
        return;
      case "again":
        // a new match with the same house rules (the turn count runs on, so no old tap fits a new turn)
        if (!host || s.phase !== "end") return;
        Object.assign(s, { ...lastcard.init(api), stack: s.stack, target: s.target, tn: s.tn + 1, li: s.li });
        return;
    }
  },

  timer(s, key, data, api) {
    if (key !== "auto" || s.phase !== "play" || (data as { tn?: number } | undefined)?.tn !== s.tn) return;
    if (!api.online(s.turn)) autoMove(s, api);
  },

  presence(s, _pid, _on, api) {
    // the player on turn dropped off (their 15 seconds start) or came back (no hurry again), or the
    // first of an empty table came back to a turn that was waiting
    if (s.phase === "play") schedule(s, api);
  },

  leave(s, pid, api) {
    // whoever leaves the table, or sits down to watch, is out of the round: their cards go back
    // under the draw pile, and if it was their turn, play moves on
    const i = s.order.indexOf(pid);
    if (i < 0) return;
    const hand = s.hands[pid] ?? [];
    delete s.hands[pid];
    if (s.phase !== "play") {
      s.order.splice(i, 1);
      return;
    }
    s.pile = [...api.shuffle(hand), ...s.pile];
    s.called = s.called.filter((p) => p !== pid);
    if (s.open === pid) s.open = null;
    const wasTurn = s.turn === pid;
    const next = step(s, pid);
    s.order.splice(i, 1);
    if (s.order.length < 2) {
      // nobody left to play against: back to the deal, the rounds won kept
      api.clear("auto");
      Object.assign(s, { phase: "setup", order: [], hands: {}, pile: [], discard: [], turn: "", pending: 0, pendingKind: null, drawn: null, called: [], open: null, most: [], winner: null });
      s.tn += 1;
      return;
    }
    if (wasTurn) {
      // (a stack meant for them goes with them)
      s.pending = 0;
      s.pendingKind = null;
      setTurn(s, next, api);
    }
  },

  view(s, pid, api): LastCardView {
    const dealt = s.phase !== "setup";
    const inRound = dealt && s.order.includes(pid);
    const hand = inRound ? sortHand(s.hands[pid] ?? []) : [];
    const myTurn = s.phase === "play" && s.turn === pid && inRound;
    const top = topOf(s);
    const legal = !myTurn ? [] : s.drawn !== null ? (canPlay(s.drawn, top, s.color, s.pendingKind) ? [s.drawn] : []) : hand.filter((c) => canPlay(c, top, s.color, s.pendingKind));
    return {
      id: "lastcard",
      phase: s.phase,
      stack: s.stack,
      target: s.target,
      round: s.round,
      order: dealt ? s.order.slice() : api.ids().slice(0, LC_MAX),
      counts: dealt ? Object.fromEntries(s.order.map((p) => [p, count(s, p)])) : {},
      hand,
      legal,
      drawn: myTurn ? s.drawn : null,
      top: dealt ? top : null,
      color: dealt ? s.color : null,
      turn: s.phase === "play" ? s.turn : null,
      dir: s.dir,
      pile: s.pile.length,
      under: s.discard.length,
      pending: s.pending,
      pendingKind: s.pendingKind,
      called: s.called.slice(),
      open: s.open,
      tn: s.tn,
      log: s.log.slice(),
      wins: { ...s.wins },
      winner: s.winner,
      champ: s.champ,
      most: s.most.slice(),
    };
  },
};
