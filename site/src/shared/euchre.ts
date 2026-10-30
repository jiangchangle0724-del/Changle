/**
 * Euchre rules and computer players, shared by the online table and the one-phone game.
 *
 * 24 cards (9 to Ace). Seats 0 and 2 are partners, as are 1 and 3. After the deal one card is
 * turned up; going round from the dealer's left, anyone can order it up as trump (the dealer
 * takes it and discards). If everyone passes, round two: name any other suit. The dealer must
 * name one if it comes back to them ("stick the dealer"). The jack of trump is the highest
 * card (right bower), then the other jack of the same color (left bower), then A K Q 10 9.
 * Follow suit if you can. The side that named trump needs 3 of 5 tricks: 1 point, 2 for all
 * five, 4 for all five played alone. If they fall short they are euchred: 2 to the defenders.
 */
import type { T } from "../i18n";
import type { EBid, ECard, EPlay, ESuit, EuchreSeatView, EuchreView } from "./protocol";

export const SUITS: ESuit[] = ["S", "H", "D", "C"];
export const RANKS = ["9", "10", "J", "Q", "K", "A"] as const;
export type ERank = (typeof RANKS)[number];
const ORDER: Record<ERank, number> = { "9": 0, "10": 1, J: 2, Q: 3, K: 4, A: 5 };

export const suitOf = (c: ECard) => c.slice(-1) as ESuit;
export const rankOf = (c: ECard) => c.slice(0, -1) as ERank;
export const sameColor = (s: ESuit): ESuit => ({ S: "C", C: "S", H: "D", D: "H" } as const)[s];
export const isRed = (s: ESuit) => s === "H" || s === "D";
export const team = (seat: number) => (seat % 2) as 0 | 1;
export const partnerOf = (seat: number) => (seat + 2) % 4;

export function fullDeck(): ECard[] {
  return SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`));
}

const isRight = (c: ECard, trump: ESuit) => rankOf(c) === "J" && suitOf(c) === trump;
const isLeft = (c: ECard, trump: ESuit) => rankOf(c) === "J" && suitOf(c) === sameColor(trump);

/** The suit a card plays as (the left bower belongs to trump). */
export function effSuit(c: ECard, trump: ESuit | null): ESuit {
  return trump && isLeft(c, trump) ? trump : suitOf(c);
}
export const isTrump = (c: ECard, trump: ESuit | null) => !!trump && effSuit(c, trump) === trump;

/** How strong a card is in a trick with this trump and this led suit (0 = can't win). */
export function power(c: ECard, trump: ESuit, led: ESuit): number {
  if (isRight(c, trump)) return 200;
  if (isLeft(c, trump)) return 190;
  if (suitOf(c) === trump) return 100 + ORDER[rankOf(c)] * 10;
  if (suitOf(c) === led) return 10 + ORDER[rankOf(c)];
  return 0;
}

export function trickWinner(trick: EPlay[], trump: ESuit): number {
  const led = effSuit(trick[0].card, trump);
  let best = trick[0];
  for (const p of trick) if (power(p.card, trump, led) > power(best.card, trump, led)) best = p;
  return best.seat;
}

export function legalPlays(hand: ECard[], trick: EPlay[], trump: ESuit | null): ECard[] {
  if (!trick.length || !trump) return hand.slice();
  const led = effSuit(trick[0].card, trump);
  const follow = hand.filter((c) => effSuit(c, trump) === led);
  return follow.length ? follow : hand.slice();
}

/** Trump first, then the other suits alternating colors; strongest first within a suit. */
export function sortHand(hand: ECard[], trump: ESuit | null): ECard[] {
  const lead = trump ?? "S";
  const order: ESuit[] = isRed(lead) ? [lead, "S", sameColor(lead), "C"] : [lead, "H", sameColor(lead), "D"];
  const rank = (c: ECard) => {
    const s = effSuit(c, trump);
    const within = trump && s === trump ? power(c, trump, trump) : ORDER[rankOf(c)];
    return order.indexOf(s) * 1000 - within;
  };
  return hand.slice().sort((a, b) => rank(a) - rank(b));
}

/* ------------------------------------------------------------------ state */

export type EResult = { team: 0 | 1; points: number; makers: 0 | 1; euchre: boolean; march: boolean; alone: boolean };

export type EState = {
  phase: "bid1" | "bid2" | "discard" | "play" | "trick" | "hand" | "end";
  dealer: number;
  hands: ECard[][];
  kitty: ECard[];
  upcard: ECard | null;
  turn: number;
  trump: ESuit | null;
  maker: number | null;
  alone: boolean;
  sitter: number | null;
  bids: EBid[];
  trick: EPlay[];
  lastTrick: { plays: EPlay[]; winner: number } | null;
  tricks: [number, number];
  score: [number, number];
  result: EResult | null;
  winner: 0 | 1 | null;
  handNo: number;
  target: number;
};

export type EMove = { t: "pass" } | { t: "order"; alone?: boolean } | { t: "call"; suit: ESuit; alone?: boolean } | { t: "discard"; card: ECard } | { t: "play"; card: ECard };

export function newGame(rand: () => number, dealer: number, target = 10): EState {
  const st: EState = {
    phase: "bid1",
    dealer: (dealer + 3) % 4,
    hands: [[], [], [], []],
    kitty: [],
    upcard: null,
    turn: 0,
    trump: null,
    maker: null,
    alone: false,
    sitter: null,
    bids: [],
    trick: [],
    lastTrick: null,
    tricks: [0, 0],
    score: [0, 0],
    result: null,
    winner: null,
    handNo: 0,
    target,
  };
  nextHand(st, rand);
  return st;
}

function shuffled(rand: () => number): ECard[] {
  const d = fullDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Pass the deal to the left and deal five each. */
export function nextHand(st: EState, rand: () => number) {
  st.dealer = (st.dealer + 1) % 4;
  const d = shuffled(rand);
  st.hands = [0, 1, 2, 3].map((i) => d.slice(i * 5, i * 5 + 5));
  st.upcard = d[20];
  st.kitty = d.slice(21);
  st.phase = "bid1";
  st.turn = (st.dealer + 1) % 4;
  st.trump = null;
  st.maker = null;
  st.alone = false;
  st.sitter = null;
  st.bids = [];
  st.trick = [];
  st.lastTrick = null;
  st.tricks = [0, 0];
  st.result = null;
  st.handNo += 1;
}

const nextSeat = (st: EState, seat: number) => {
  let s = (seat + 1) % 4;
  if (s === st.sitter) s = (s + 1) % 4;
  return s;
};

function startPlay(st: EState) {
  st.phase = "play";
  st.trick = [];
  st.turn = nextSeat(st, st.dealer);
}

/** Apply a move for a seat. Returns false (and changes nothing) if it isn't allowed. */
export function applyMove(st: EState, seat: number, mv: EMove): boolean {
  if (seat !== st.turn) return false;
  switch (st.phase) {
    case "bid1": {
      if (mv.t === "pass") {
        st.bids.push({ seat, act: "pass" });
        if (seat === st.dealer) {
          st.phase = "bid2";
          st.turn = (st.dealer + 1) % 4;
        } else st.turn = (seat + 1) % 4;
        return true;
      }
      if (mv.t !== "order" || !st.upcard) return false;
      st.trump = suitOf(st.upcard);
      st.maker = seat;
      st.alone = !!mv.alone;
      st.sitter = mv.alone ? partnerOf(seat) : null;
      st.bids.push({ seat, act: "order", suit: st.trump, alone: st.alone });
      if (st.sitter === st.dealer) {
        // the dealer sits this hand out, so the turned card stays where it is
        startPlay(st);
      } else {
        st.hands[st.dealer].push(st.upcard);
        st.phase = "discard";
        st.turn = st.dealer;
      }
      return true;
    }
    case "bid2": {
      if (mv.t === "pass") {
        if (seat === st.dealer) return false; // stick the dealer
        st.bids.push({ seat, act: "pass" });
        st.turn = (seat + 1) % 4;
        return true;
      }
      if (mv.t !== "call" || !st.upcard || mv.suit === suitOf(st.upcard) || !SUITS.includes(mv.suit)) return false;
      st.trump = mv.suit;
      st.maker = seat;
      st.alone = !!mv.alone;
      st.sitter = mv.alone ? partnerOf(seat) : null;
      st.bids.push({ seat, act: "call", suit: mv.suit, alone: st.alone });
      startPlay(st);
      return true;
    }
    case "discard": {
      if (mv.t !== "discard") return false;
      const i = st.hands[seat].indexOf(mv.card);
      if (i < 0) return false;
      st.hands[seat].splice(i, 1);
      st.kitty.push(mv.card);
      startPlay(st);
      return true;
    }
    case "play": {
      if (mv.t !== "play") return false;
      const hand = st.hands[seat];
      if (!legalPlays(hand, st.trick, st.trump).includes(mv.card)) return false;
      hand.splice(hand.indexOf(mv.card), 1);
      st.trick.push({ seat, card: mv.card });
      const active = st.sitter === null ? 4 : 3;
      if (st.trick.length === active) st.phase = "trick";
      else st.turn = nextSeat(st, seat);
      return true;
    }
    default:
      return false;
  }
}

/** After a full trick has been on the table for a moment: score it, then lead again or end the hand. */
export function collectTrick(st: EState) {
  if (st.phase !== "trick" || !st.trump) return;
  const w = trickWinner(st.trick, st.trump);
  st.tricks[team(w)] += 1;
  st.lastTrick = { plays: st.trick, winner: w };
  st.trick = [];
  if (st.tricks[0] + st.tricks[1] < 5) {
    st.phase = "play";
    st.turn = w;
    return;
  }
  const makers = team(st.maker ?? 0);
  const won = st.tricks[makers];
  const res: EResult =
    won >= 3
      ? { team: makers, points: won === 5 ? (st.alone ? 4 : 2) : 1, makers, euchre: false, march: won === 5, alone: st.alone }
      : { team: (1 - makers) as 0 | 1, points: 2, makers, euchre: true, march: false, alone: st.alone };
  st.score[res.team] += res.points;
  st.result = res;
  if (st.score[res.team] >= st.target) {
    st.phase = "end";
    st.winner = res.team;
  } else st.phase = "hand";
}

/* ------------------------------------------------------------------ computer players */

/** Rough value of a hand if `trump` were trump. 7 or so is worth calling. */
export function strength(hand: ECard[], trump: ESuit): number {
  let v = 0;
  let trumps = 0;
  for (const c of hand) {
    if (isRight(c, trump)) v += 3.2;
    else if (isLeft(c, trump)) v += 2.6;
    else if (suitOf(c) === trump) v += [1.0, 1.1, 0, 1.4, 1.6, 2.0][ORDER[rankOf(c)]];
    else if (rankOf(c) === "A") v += 0.9;
    else if (rankOf(c) === "K") v += 0.3;
    if (isTrump(c, trump)) trumps++;
  }
  if (trumps >= 2) {
    const offSuits = new Set(hand.filter((c) => !isTrump(c, trump)).map((c) => suitOf(c)));
    v += (3 - offSuits.size) * 0.4;
  }
  return v;
}

const trumpCount = (hand: ECard[], trump: ESuit) => hand.filter((c) => isTrump(c, trump)).length;
const hasRight = (hand: ECard[], trump: ESuit) => hand.some((c) => isRight(c, trump));

/** The card a dealer throws away after picking up. */
export function worstCard(hand: ECard[], trump: ESuit): ECard {
  const off = hand.filter((c) => !isTrump(c, trump));
  if (!off.length) return hand.slice().sort((a, b) => power(a, trump, trump) - power(b, trump, trump))[0];
  // throw a lone low card to make a void; otherwise the lowest off-suit card
  const bySuit = new Map<ESuit, ECard[]>();
  for (const c of off) bySuit.set(suitOf(c), [...(bySuit.get(suitOf(c)) ?? []), c]);
  const singles = [...bySuit.values()].filter((cs) => cs.length === 1 && rankOf(cs[0]) !== "A").map((cs) => cs[0]);
  const pool = singles.length ? singles : off;
  return pool.slice().sort((a, b) => ORDER[rankOf(a)] - ORDER[rankOf(b)])[0];
}

function withUpcard(hand: ECard[], up: ECard, trump: ESuit) {
  const h = [...hand, up];
  h.splice(h.indexOf(worstCard(h, trump)), 1);
  return h;
}

/** What a computer player does now. */
export function botMove(st: EState, seat: number): EMove {
  const hand = st.hands[seat];
  if (st.phase === "bid1" && st.upcard) {
    const trump = suitOf(st.upcard);
    const dealerTeam = team(st.dealer) === team(seat);
    let v = seat === st.dealer ? strength(withUpcard(hand, st.upcard, trump), trump) : strength(hand, trump);
    if (seat !== st.dealer) v += dealerTeam ? 0.7 : -0.7;
    if (v >= 7.4) {
      const h = seat === st.dealer ? withUpcard(hand, st.upcard, trump) : hand;
      const alone = v >= 9.6 && hasRight(h, trump) && trumpCount(h, trump) >= 3;
      return { t: "order", alone };
    }
    return { t: "pass" };
  }
  if (st.phase === "bid2" && st.upcard) {
    const turned = suitOf(st.upcard);
    const options = SUITS.filter((s) => s !== turned).map((s) => ({ s, v: strength(hand, s) }));
    options.sort((a, b) => b.v - a.v);
    const best = options[0];
    if (best.v >= 7 || seat === st.dealer) return { t: "call", suit: best.s, alone: best.v >= 9.8 && hasRight(hand, best.s) && trumpCount(hand, best.s) >= 3 };
    return { t: "pass" };
  }
  if (st.phase === "discard" && st.trump) return { t: "discard", card: worstCard(hand, st.trump) };
  if (st.phase === "play" && st.trump) return { t: "play", card: botCard(st, seat) };
  return { t: "pass" };
}

function botCard(st: EState, seat: number): ECard {
  const trump = st.trump!;
  const hand = st.hands[seat];
  const legal = legalPlays(hand, st.trick, trump);
  if (legal.length === 1) return legal[0];
  const low = (cs: ECard[], led: ESuit) =>
    cs.slice().sort((a, b) => {
      // throw off-suit low cards before trump, and short suits before long ones
      const ta = isTrump(a, trump) ? 1000 : 0;
      const tb = isTrump(b, trump) ? 1000 : 0;
      return ta + power(a, trump, led) + ORDER[rankOf(a)] - (tb + power(b, trump, led) + ORDER[rankOf(b)]);
    })[0];

  if (!st.trick.length) {
    const makers = st.maker !== null && team(st.maker) === team(seat);
    const trumps = legal.filter((c) => isTrump(c, trump)).sort((a, b) => power(b, trump, trump) - power(a, trump, trump));
    const aces = legal.filter((c) => !isTrump(c, trump) && rankOf(c) === "A");
    if (makers && trumps.length && (isRight(trumps[0], trump) || trumps.length >= 3)) return trumps[0];
    if (aces.length) return aces[0];
    if (makers && trumps.length >= 2) return trumps[0];
    const off = legal.filter((c) => !isTrump(c, trump));
    if (off.length) {
      // lead from the shortest side suit, lowest first, hoping to trump it later
      const count = (s: ESuit) => off.filter((c) => suitOf(c) === s).length;
      return off.slice().sort((a, b) => count(suitOf(a)) - count(suitOf(b)) || ORDER[rankOf(a)] - ORDER[rankOf(b)])[0];
    }
    return trumps[trumps.length - 1];
  }

  const led = effSuit(st.trick[0].card, trump);
  const winner = trickWinner(st.trick, trump);
  const best = st.trick.find((p) => p.seat === winner)!.card;
  const bestPower = power(best, trump, led);
  // partner already has it: keep the good cards for later
  if (team(winner) === team(seat)) return low(legal, led);
  // otherwise win as cheaply as possible, or throw the least useful card
  const beats = legal.filter((c) => power(c, trump, led) > bestPower).sort((a, b) => power(a, trump, led) - power(b, trump, led));
  return beats.length ? beats[0] : low(legal, led);
}

/* ------------------------------------------------------------------ what one seat sees */

/** Names for the computer players, by seat. */
export const BOT_NAMES: T[] = [
  { zh: "电脑 小A", en: "Bot Ava" },
  { zh: "电脑 小B", en: "Bot Ben" },
  { zh: "电脑 小C", en: "Bot Cal" },
  { zh: "电脑 小D", en: "Bot Dee" },
];

/** The table as one seat sees it: their own hand, everyone else's card count. */
export function viewOf(st: EState | null, mySeat: number | null, seats: EuchreSeatView[], target = 10): EuchreView {
  const mine = mySeat !== null && mySeat >= 0 ? mySeat : null;
  if (!st)
    return {
      id: "euchre",
      phase: "setup",
      seats,
      mySeat: mine,
      hand: [],
      counts: [0, 0, 0, 0],
      dealer: 0,
      turn: 0,
      upcard: null,
      trump: null,
      maker: null,
      alone: false,
      sitter: null,
      bids: [],
      trick: [],
      lastTrick: null,
      tricks: [0, 0],
      score: [0, 0],
      legal: [],
      result: null,
      winner: null,
      handNo: 0,
      target,
    };
  const bidding = st.phase === "bid1" || st.phase === "bid2" || st.phase === "discard";
  const sortBy = st.trump ?? (st.phase === "bid1" && st.upcard ? suitOf(st.upcard) : null);
  return {
    id: "euchre",
    phase: st.phase,
    seats,
    mySeat: mine,
    hand: mine !== null ? sortHand(st.hands[mine], sortBy) : [],
    counts: st.hands.map((h) => h.length),
    dealer: st.dealer,
    turn: st.turn,
    upcard: bidding ? st.upcard : null,
    trump: st.trump,
    maker: st.maker,
    alone: st.alone,
    sitter: st.sitter,
    bids: st.bids,
    trick: st.trick,
    lastTrick: st.lastTrick,
    tricks: st.tricks,
    score: st.score,
    legal: mine !== null && st.phase === "play" && st.turn === mine ? legalPlays(st.hands[mine], st.trick, st.trump) : [],
    result: st.result,
    winner: st.winner,
    handNo: st.handNo,
    target: st.target,
  };
}
