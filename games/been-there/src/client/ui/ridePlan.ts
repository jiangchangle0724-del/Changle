// A throw, worked out from the feed: which moves it made (the dice's, then any card's that sent the
// token on), when each beat of it plays, and how fast. The team that threw plays it first-person on
// its phone (Ride.tsx), the big screen plays it with a small push and a pan, and the other phones
// walk the token on the flat board: all of them from the server's moment of the throw, so every
// screen stamps the landing at the same time.
//
// The beats (ms from the throw), for the first three turns of a team:
//   0     the dice tumble (on the thrower's phone from the tap, before the server answers)
//   600   they settle and the number jumps out; the camera pushes in for 300 ms
//   900   the walk: 200 ms a space (a long move runs, 150 ms at the quickest), a flap of the
//         departures board on each space; a card's move after it pauses 300 ms, walks 150 ms a
//         space when it's short and cuts (a 500 ms fade) when it's far
//   land  the stamp comes down (80 ms), holds (120 ms) and lifts; Immigration's gate drops 400 ms
//   ready the decision window is back (stamp + 350 ms) while the camera pulls out for 500 ms
// Later turns go quicker (pace 0.85 from the 4th, 0.7 from the 11th; a second throw after doubles
// goes at 0.85 at most), but never quicker than 150 ms a space: the camera that follows the token
// would turn faster than 60 degrees a second.
import { useEffect, useRef, useState } from "preact/hooks";
import { BOARD, type GameEvent } from "../../engine";
import type { FeedItem, RoomView } from "../../room/protocol";
import { reducedMotion } from "../motion";
import { prefs } from "../prefs";
import { serverNow } from "../store";

const N = BOARD.length;

type Roll = Extract<GameEvent, { t: "roll" }>;
type Move = Extract<GameEvent, { t: "move" }>;

/** One stretch of a move: the dice's, or a card's or a city's that follows it. */
export interface Leg {
  from: number;
  to: number;
  /** 1 forward; -1 back (only the red-eye card goes back, three spaces). */
  dir: 1 | -1;
  /** Spaces walked: 0 when the throw leaves the token where it is (Mexico City's ban). */
  steps: number;
  /** Paid for passing Departure on the way. */
  salary: number;
  /** What moved it: the dice, a card (its id), or a city's rule. */
  by: "dice" | "card" | "rule";
  card?: string;
  /** A far move after the first: a quick fade to where it lands, not a walk all that way. */
  cut: boolean;
}

export interface RidePlan {
  /** Feed id of the throw: each one is played once. */
  key: number;
  seat: number;
  legs: Leg[];
  /** Sent to Immigration at the end (the Passport Expired corner, a card). */
  jail: boolean;
  /** A card drawn where the token lands, one that doesn't send it on. */
  card: boolean;
  /** The card that sent the token on, if one did. */
  cardId: string | null;
  /** The dice as thrown, and what they came to. */
  dice: number[];
  thrown: number;
  doubles: boolean;
  /** The throw was a team's way out of Immigration (doubles there: out free, and no second throw). */
  fromJail?: boolean;
  /** Whether the beat starts with the dice (not when the move waited for a decision: a car permit). */
  rolled: boolean;
  /** Server time the beat starts (the throw, or the move after a permit). */
  start: number;
  /** 1 for a team's first three turns, then 0.85, then 0.7. */
  pace: number;
  t: RideTimes;
}

/** When each beat happens, in ms after `start`. */
export interface RideTimes {
  /** The dice settle and the number jumps out; the camera pushes in from here… */
  dice: number;
  /** …to here, where the walk starts. */
  walk: number;
  /** Each leg's start, and the time for each of its spaces (`cut`: its fade instead). */
  legs: { at: number; per: number; cut?: number }[];
  /** The last step lands: the stamp comes down. */
  land: number;
  /** The decision window is back and the camera pulls out… */
  ready: number;
  /** …and the ride is over. */
  end: number;
}

export const BEAT = {
  dice: 600,
  push: 300,
  /** A space's walk: 200 ms, quicker on a long move, never under 150 ms (60 degrees a second). */
  slow: 200,
  quick: 150,
  /** A move's walk takes no more than this (until it's at its quickest). */
  walk: 1800,
  /** A card's move: a pause on the card's space, then 150 ms a space, or a fade cut past 6 spaces. */
  pause: 300,
  cardStep: 150,
  cutPast: 6,
  cut: 500,
  /** Staying put: one hop. */
  hop: 300,
  /** The stamp: down 80, held 120, lifted 150. */
  stamp: 350,
  gate: 400,
  pull: 500,
  /** A throw older than this is history, not a ride (a phone coming back to the page). */
  fresh: 9000,
};

/** Before the first-person move there was a 1.7 s dice moment: the new beat may add at most 4 s to it. */
export const OLD_MOMENT = 1700;
export const MAX_EXTRA = 4000;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** How fast a team's moves go by now: its turn number this game, and whether this is a throw after doubles. */
export const paceOf = (turn: number, again: boolean) => Math.min(turn <= 3 ? 1 : turn <= 10 ? 0.85 : 0.7, again ? 0.85 : 1);

/** ms a space for a throw's own walk. */
export const perSpace = (steps: number, pace: number) => Math.max(BEAT.quick, clamp(BEAT.walk / Math.max(1, steps), BEAT.quick, BEAT.slow) * pace);

export function timesFor(legs: Leg[], jail: boolean, pace = 1, rolled = true): RideTimes {
  const dice = rolled ? BEAT.dice : 0;
  const walk = dice + BEAT.push * pace;
  let t = walk;
  const out: RideTimes["legs"] = [];
  legs.forEach((l, i) => {
    if (i) t += BEAT.pause * pace;
    if (!l.steps) {
      out.push({ at: t, per: BEAT.hop });
      t += BEAT.hop;
    } else if (l.cut) {
      out.push({ at: t, per: 0, cut: BEAT.cut });
      t += BEAT.cut;
    } else {
      const per = i ? BEAT.cardStep : perSpace(l.steps, pace);
      out.push({ at: t, per });
      t += l.steps * per;
    }
  });
  const ready = t + BEAT.stamp + (jail ? BEAT.gate : 0);
  return { dice, walk, legs: out, land: t, ready, end: ready + BEAT.pull };
}

const fwd = (from: number, to: number) => (((to - from) % N) + N) % N;

/** The most a throw can take a token forward: double six, and a car permit's one more. */
const MOST_THROWN = 13;

/** A move as a leg. The dice's goes forward as far as it went (what they came to, or a Singapore car
 * permit's one more or less); a card's goes forward to where it sends the token, except the
 * red-eye, which goes back three. */
function legOf(e: Move, roll: Roll | null, first: boolean, by: Leg["by"]): Leg {
  const salary = e.salary ?? 0;
  const base = { from: e.from, to: e.to, salary, by };
  const d = fwd(e.from, e.to);
  if (roll) {
    // (both dice banned by Mexico City: a move of no spaces; with a permit's one less, a space back)
    if (d === 0) return { ...base, dir: 1, steps: 0, cut: false };
    if (d > MOST_THROWN && !salary) return { ...base, dir: -1, steps: N - d, cut: false };
    return { ...base, dir: 1, steps: d, cut: !first && d > BEAT.cutPast };
  }
  if (!salary && N - d === 3) return { ...base, dir: -1, steps: 3, cut: false };
  const steps = d || N;
  return { ...base, dir: 1, steps, cut: !first && steps > BEAT.cutPast };
}

/** Feed items this close together came out of one thing done on the server (a throw and all it led to). */
const SAME_STEP = 300;

type GameItem = FeedItem & { t: "game" };
const isGame = (f: FeedItem): f is GameItem => f.t === "game";

/** The newest throw that moved `seats` (any seat when there are none), with the feed index of its roll. */
function latestRoll(feed: FeedItem[], seats: number[] | null): number {
  for (let i = feed.length - 1; i >= 0; i--) {
    const f = feed[i];
    if (isGame(f) && f.e.t === "roll" && (!seats || seats.includes(f.e.p))) return i;
  }
  return -1;
}

/**
 * The move for the newest throw by one of `seats` (by anyone, with null): the throw's moves and any
 * that came straight after it in the same moment (a card sending the token on, the hitch-hiking card
 * throwing again), up to the next turn or throw. Null if it's not fresh, or nothing moved.
 */
export function planMove(v: RoomView, seats: number[] | null, now = serverNow()): Omit<RidePlan, "t"> | null {
  if (!v.game || (seats && !seats.length)) return null;
  const feed = v.feed;
  let i = latestRoll(feed, seats);
  if (i < 0) return null;
  // The throw to play is the one that began the moment of this one. The hitch-hiking card throws
  // again in it (the move is the first throw's); on the big screen, a token Tokyo pushed onto that
  // card throws too, in the thrower's moment; and a car permit's move, which waited for its
  // decision, begins a moment of its own (the throw that made it came before).
  const mine = (feed[i] as GameItem & { e: Roll }).e.p;
  let first = -1;
  for (let k = i - 1; k >= 0; k--) {
    const f = feed[k];
    if (feed[i].at - f.at > SAME_STEP) break;
    if (!isGame(f)) continue;
    if (f.e.t === "turn") break;
    if ((f.e.t === "move" || f.e.t === "roll") && (!seats || f.e.p === mine)) first = k;
  }
  if (first >= 0) {
    const e = (feed[first] as GameItem).e as Roll | Move;
    if (e.t === "roll") i = first;
    else
      for (let r = first - 1; r >= 0; r--) {
        const g = feed[r];
        if (!isGame(g)) continue;
        if (g.e.t === "turn") break;
        if (g.e.t === "roll" && g.e.p === e.p) {
          i = r;
          break;
        }
      }
  }
  const rollItem = feed[i] as GameItem & { e: Roll };
  const seat = rollItem.e.p;
  // (a move that waited for a decision, a car permit, can come a while after its throw)
  if (now - rollItem.at > BEAT.fresh + 60_000) return null;
  const legs: Leg[] = [];
  let roll: Roll | null = rollItem.e;
  let jail = false;
  let cardAt = -1;
  let cardId: string | null = null;
  let pendingCard: string | null = null;
  let pushed = false;
  let firstAt = -1;
  for (let j = i + 1; j < feed.length; j++) {
    const f = feed[j];
    if (!isGame(f)) continue;
    const e = f.e;
    if (e.t === "turn") break;
    // Only what happened in the step of the first move (a decision later on is its own moment).
    if (firstAt >= 0 && f.at - firstAt > SAME_STEP) break;
    // (a later throw, after doubles, is a move of its own: it's past the moment, above)
    if (e.t === "roll" && e.p === seat) roll = e;
    if (e.t === "card" && e.p === seat) {
      cardAt = legs.length;
      pendingCard = e.id;
    }
    if (e.t === "rule" && (e as { pushed?: number }).pushed === seat) pushed = true;
    if (e.t === "move" && e.p === seat) {
      if (firstAt < 0) firstAt = f.at;
      // (a card that moved it, even one that threw the dice again: the hitch-hiker)
      const by: Leg["by"] = legs.length && pendingCard ? "card" : roll ? "dice" : pushed ? "rule" : "card";
      if (pendingCard && legs.length) cardId = pendingCard;
      legs.push({ ...legOf(e, roll, !legs.length, by), ...(by === "card" && pendingCard ? { card: pendingCard } : {}) });
      roll = null;
      pendingCard = null;
      pushed = false;
    }
    if (e.t === "jail" && e.p === seat) jail = true;
  }
  if (!legs.length) return null;
  const rolled = firstAt - rollItem.at <= SAME_STEP;
  const start = rolled ? rollItem.at : firstAt;
  if (now - start > BEAT.fresh) return null;
  const s = v.game.s;
  const turn = (s.ps[seat]?.turns ?? 0) + (s.turn === seat ? 1 : 0);
  const pace = paceOf(Math.max(1, turn), throwAgain(feed, i, seat));
  const dice = rollItem.e.dice;
  return {
    key: rollItem.id,
    seat,
    legs,
    jail,
    card: cardAt === legs.length,
    cardId,
    dice,
    thrown: rollItem.e.steps,
    doubles: !!rollItem.e.doubles,
    fromJail: !!rollItem.e.jail,
    rolled,
    start,
    pace,
  };
}

/** Whether the throw at feed index `i` is a second (or third) throw of the turn, after doubles. */
function throwAgain(feed: FeedItem[], i: number, seat: number): boolean {
  for (let k = i - 1; k >= 0; k--) {
    const f = feed[k];
    if (!isGame(f)) continue;
    if (f.e.t === "turn") return false;
    if (f.e.t === "roll" && f.e.p === seat && feed[i].at - f.at > SAME_STEP) return true;
  }
  return false;
}

export const withTimes = (p: Omit<RidePlan, "t">): RidePlan => ({ ...p, t: timesFor(p.legs, p.jail, p.pace, p.rolled) });

/** This phone's latest throw, for its first-person ride. */
export const planRide = (v: RoomView, now = serverNow()) => planMove(v, v.you.seats, now);

/** Whether this phone plays its moves first-person: on unless turned off, and not with reduced motion
 * (which plays the same beats on the flat board). */
export const ridesOn = () => prefs.ride && !reducedMotion();

/** How this phone shows its own throws: first-person, or on the flat board. */
export const rideMode = (plan: RidePlan | null): "fp" | "flat" => (plan && plan.legs.some((l) => l.steps) && ridesOn() ? "fp" : "flat");

const played = new Set<number>();

/**
 * A move to play now (from the throw until the ride is over), or null. `done` ends it early: cut
 * short for a question on a clock, or played out. Cached per throw, so its clock never changes.
 */
function useMovePlan(v: RoomView, seats: number[] | null, urgentCheck: boolean): { plan: RidePlan | null; done: (key: number) => void } {
  const raw = planMove(v, seats);
  const cache = useRef<RidePlan | null>(null);
  if (raw && cache.current?.key !== raw.key) {
    cache.current = withTimes(raw);
    // Something on a clock is already up when the throw comes in (Shanghai's quiz, say): no ride. The
    // token walks the board as before and the question comes straight up.
    if (urgentCheck && rideUrgent(v, cache.current)) played.add(raw.key);
  }
  const plan = raw && cache.current?.key === raw.key ? cache.current : null;
  const [, tick] = useState(0);
  const done = (key: number) => {
    if (played.has(key)) return;
    played.add(key);
    tick((n) => n + 1);
  };
  // Over by the clock even if the board never played it (a phone that slept through it).
  useEffect(() => {
    if (!plan) return;
    const left = plan.start + plan.t.end - serverNow();
    const id = window.setTimeout(() => done(plan.key), Math.max(0, left) + 60);
    return () => clearTimeout(id);
  }, [plan?.key]);
  if (!plan || played.has(plan.key) || serverNow() > plan.start + plan.t.end + 60) return { plan: null, done };
  return { plan, done };
}

/** This phone's own move (first-person, or flat with reduced motion or the setting off). */
export const useRide = (v: RoomView) => useMovePlan(v, v.you.seats, true);

/** The big screen: every team's move. */
export const useTableMove = (v: RoomView) => useMovePlan(v, null, false);

/** A table vote gives 25 s: a ride plays first if this long is still left to answer after it. */
const ANSWER_TIME = 15_000;

/**
 * Something on a clock this phone's team has to answer now, which a ride mustn't keep it from: an
 * auction, Shanghai's quiz for the team that landed there (5 s), a table vote that wouldn't leave
 * time to answer after the ride (`plan`: the ride, if one is on). (The waiting teams' question is for
 * the others; Seoul's silence is the table's, and the ride is quiet anyway.)
 */
export function rideUrgent(v: RoomView, plan: RidePlan | null = null): boolean {
  const g = v.game;
  if (!g) return false;
  if (g.auction || (g.quiz && v.you.seats.includes(g.quiz.visitor))) return true;
  const left = (g.deadline ?? 0) - serverNow();
  return left > 0 && left - Math.max(0, rideEnd(plan) - serverNow()) < ANSWER_TIME;
}

/**
 * The newest move on the table, from its throw until money changes hands (server times): on every
 * screen what came of it waits for its beats. The dice under the board show when they settle; the
 * feed's lines from the throw on (`key`) and what the table waits for, when the token lands, which is
 * the stamp's to tell; money, with the decision window. Null when no move is playing.
 */
export function moveInPlay(v: RoomView, now = serverNow()): { key: number; seat: number; dice: number; land: number; ready: number } | null {
  const raw = planMove(v, null, now);
  if (!raw) return null;
  const t = timesFor(raw.legs, raw.jail, raw.pace, raw.rolled);
  const ready = raw.start + t.ready;
  return now < ready ? { key: raw.key, seat: raw.seat, dice: raw.start + t.dice, land: raw.start + t.land, ready } : null;
}

/** Server time this ride is over (a touchdown and the city's sound wait for it), or 0. */
export const rideEnd = (plan: RidePlan | null) => (plan ? plan.start + plan.t.end : 0);

/** Server time the token lands and the stamp comes down, or 0. */
export const rideLand = (plan: RidePlan | null) => (plan ? plan.start + plan.t.land : 0);

/** Server time the decision window is back and money changes hands on screen, or 0. */
export const rideReady = (plan: RidePlan | null) => (plan ? plan.start + plan.t.ready : 0);

/**
 * The other teams' moves on this phone: when each token starts walking on the flat board and how
 * long a space takes, so it walks in step with the thrower's ride and lands with its stamp.
 */
export function walkOf(v: RoomView, seat: number, now = serverNow()): { start: number; per: number; land: number; to: number } | null {
  const raw = planMove(v, [seat], now);
  if (!raw) return null;
  const p = withTimes(raw);
  const leg = p.t.legs[0];
  return { start: p.start + p.t.walk, per: leg.per || BEAT.cardStep, land: p.start + p.t.land, to: p.legs[p.legs.length - 1].to };
}
