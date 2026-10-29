// The first-person move. On a phone, when the team throws the dice, its own move plays from behind its
// token: the board leans back into a camera that follows the token round the ring, the cities it
// passes come up one by one, and it lands with the city's name before the camera pulls back up.
// This file works the ride out from the feed (which moves, which way round, how long each part
// takes); Ride.tsx plays it on the board. With reduced motion, or the menu's setting off, there's no
// ride and the board moves as before.
import { useEffect, useRef, useState } from "preact/hooks";
import { BOARD, type GameEvent } from "../../engine";
import type { FeedItem, RoomView } from "../../room/protocol";
import { reducedMotion } from "../motion";
import { prefs } from "../prefs";
import { serverNow } from "../store";

const N = BOARD.length;

type Roll = Extract<GameEvent, { t: "roll" }>;
type Move = Extract<GameEvent, { t: "move" }>;

/** One stretch of the ride: a throw's move, or a card's that follows it. */
export interface Leg {
  from: number;
  to: number;
  /** 1 clockwise; -1 back (the table turned round in Sydney, a red-eye card). */
  dir: 1 | -1;
  steps: number;
  /** Paid for passing Departure on the way. */
  salary: number;
}

export interface RidePlan {
  /** Feed id of the throw (or of the first move) the ride is for: each one is ridden once. */
  key: number;
  seat: number;
  legs: Leg[];
  /** Sent to Immigration at the end (the Passport Expired corner, a card). */
  jail: boolean;
  /** A card drawn where the token lands, one that doesn't send it on (its sound comes on landing). */
  card: boolean;
  /** Server time the camera starts to move (the dice have had their moment by then). */
  start: number;
  t: RideTimes;
}

/** When each part happens, in ms after `start`. */
export interface RideTimes {
  /** The camera leans in for this long. */
  in: number;
  /** Each leg's start and the time for each of its steps. */
  legs: { at: number; step: number }[];
  /** The last step lands. */
  land: number;
  /** The camera starts to pull back… */
  out: number;
  /** …and the ride is over. */
  end: number;
}

/** The dice's moment first, then the camera; how long each part takes (ms). */
export const RIDE = { hold: 1150, in: 560, pause: 700, land: 900, out: 640, fresh: 9000 };

/** A short move walks, a long one runs: a leg never takes much more than 2.4 s. A card's move after
 * the throw's goes at twice the pace (it's a jump the card makes, not a walk). */
export const stepMs = (steps: number, then = false) =>
  then ? Math.max(80, Math.min(160, Math.round(1300 / Math.max(1, steps)))) : Math.max(110, Math.min(300, Math.round(2400 / Math.max(1, steps))));

export function timesFor(legs: Leg[], jail: boolean): RideTimes {
  let at = RIDE.in;
  const out: { at: number; step: number }[] = [];
  legs.forEach((l, i) => {
    if (i) at += RIDE.pause;
    const step = stepMs(l.steps, i > 0);
    out.push({ at, step });
    at += l.steps * step;
  });
  const land = at;
  const outAt = land + RIDE.land + (jail ? 500 : 0);
  return { in: RIDE.in, legs: out, land, out: outAt, end: outAt + RIDE.out };
}

const fwd = (from: number, to: number) => (((to - from) % N) + N) % N;

/** Which way a move went and how far. A throw says how many steps; a card's move goes forward to
 * where it sends the token, except the red-eye, which goes back three. */
function legOf(e: Move, roll: Roll | null): Leg {
  const salary = e.salary ?? 0;
  if (roll && roll.steps > 0) {
    if ((e.from + roll.steps) % N === e.to) return { from: e.from, to: e.to, dir: 1, steps: roll.steps, salary };
    if ((((e.from - roll.steps) % N) + N) % N === e.to) return { from: e.from, to: e.to, dir: -1, steps: roll.steps, salary };
  }
  const d = fwd(e.from, e.to);
  if (!salary && N - d === 3) return { from: e.from, to: e.to, dir: -1, steps: 3, salary };
  return { from: e.from, to: e.to, dir: 1, steps: d || N, salary };
}

/** Feed items this close together came out of one thing done on the server (a throw and all it led to). */
const SAME_STEP = 300;

/**
 * The ride for this phone's latest throw, if it's fresh: the throw's move and any move that came
 * straight after it (a card sending the token on), up to the next turn or throw. The hitch-hiking
 * card throws the dice again in the same moment: that's one ride, from the first throw.
 */
export function planRide(v: RoomView): Omit<RidePlan, "start" | "t"> & { at: number } | null {
  const mine = v.you.seats;
  if (!mine.length || !v.game) return null;
  const feed = v.feed;
  let i = feed.length - 1;
  for (; i >= 0; i--) {
    const f = feed[i];
    if (f.t === "game" && f.e.t === "roll" && mine.includes(f.e.p)) break;
  }
  if (i < 0) return null;
  const seat = (feed[i] as FeedItem & { t: "game"; e: Roll }).e.p;
  const latest = feed[i].at;
  for (let k = i - 1; k >= 0; k--) {
    const f = feed[k];
    if (latest - f.at > SAME_STEP || (f.t === "game" && f.e.t === "turn")) break;
    if (f.t === "game" && f.e.t === "roll" && f.e.p === seat) i = k;
  }
  const rollItem = feed[i] as FeedItem & { t: "game"; e: Roll };
  if (serverNow() - rollItem.at > RIDE.fresh) return null;
  const legs: Leg[] = [];
  let roll: Roll | null = rollItem.e;
  let jail = false;
  let cardAt = -1;
  for (let j = i + 1; j < feed.length; j++) {
    const f = feed[j];
    if (f.t !== "game") continue;
    const e = f.e;
    if (e.t === "turn") break;
    if (e.t === "roll" && e.p === seat) {
      // (a later throw is a ride of its own: doubles, say)
      if (f.at - rollItem.at > SAME_STEP) break;
      roll = e;
    }
    if (e.t === "move" && e.p === seat) {
      legs.push(legOf(e, roll));
      roll = null;
    }
    if (e.t === "card" && e.p === seat) cardAt = legs.length;
    if (e.t === "jail" && e.p === seat) jail = true;
  }
  if (!legs.length) return null;
  return { key: rollItem.id, seat, legs, jail, card: cardAt === legs.length, at: rollItem.at };
}

/** Whether this phone plays first-person moves: on unless turned off, never with reduced motion. */
export const ridesOn = () => prefs.ride && !reducedMotion();

const ridden = new Set<number>();

/**
 * This phone's ride, while it's on (from the throw until the camera is back up), or null. `done`
 * ends it early: the ride cut short for a question on a clock, or played out.
 */
export function useRide(v: RoomView): { plan: RidePlan | null; done: (key: number) => void } {
  const raw = ridesOn() ? planRide(v) : null;
  const cache = useRef<RidePlan | null>(null);
  if (raw && cache.current?.key !== raw.key) {
    const t = timesFor(raw.legs, raw.jail);
    cache.current = { key: raw.key, seat: raw.seat, legs: raw.legs, jail: raw.jail, card: raw.card, start: raw.at + RIDE.hold, t };
    // Something on a clock is already up when the throw comes in (Shanghai's quiz, say): no ride. The
    // token walks the board as before and the question comes straight up.
    if (rideUrgent(v, cache.current)) ridden.add(raw.key);
  }
  const plan = raw && cache.current?.key === raw.key ? cache.current : null;
  const [, tick] = useState(0);
  const done = (key: number) => {
    if (ridden.has(key)) return;
    ridden.add(key);
    tick((n) => n + 1);
  };
  // Over by the clock even if the board never played it (a phone that slept through it).
  useEffect(() => {
    if (!plan) return;
    const left = plan.start + plan.t.end - serverNow();
    const id = window.setTimeout(() => done(plan.key), Math.max(0, left) + 60);
    return () => clearTimeout(id);
  }, [plan?.key]);
  if (!plan || ridden.has(plan.key) || serverNow() > plan.start + plan.t.end + 60) return { plan: null, done };
  return { plan, done };
}

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

/** Server time this phone's ride is over (a touchdown and the city's sound wait for it), or 0. */
export const rideEnd = (plan: RidePlan | null) => (plan ? plan.start + plan.t.end : 0);

/** Server time the ride's token lands (money changes hands then), or 0. */
export const rideLand = (plan: RidePlan | null) => (plan ? plan.start + plan.t.land : 0);
