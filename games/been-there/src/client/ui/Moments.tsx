// The moments of a turn, animated: dice landing, banknotes changing hands, a card coming off its deck,
// cash counting up or down. All of it is decoration over the game: it never takes a tap, and with
// reduced motion it isn't drawn (the numbers, the cards and the log still say everything).
import { useEffect, useRef, useState } from "preact/hooks";
import { BOARD, JOURNEY_CARDS, POSTCARDS, houseCostAt, priceOf, type GameEvent, type GameState } from "../../engine";
import type { FeedItem, RoomView } from "../../room/protocol";
import { Dice } from "../art/dice";
import { BUZZ, buzz } from "../controls";
import { money, t, tx } from "../i18n";
import { sfx } from "../sound";
import { serverNow } from "../store";
import { reducedMotion } from "./Board";
import { SeatChip } from "./common";
import { rideUrgent, type RidePlan } from "./ridePlan";
import { DoublesCall, Police, doublesKind } from "./Doubles";
import { notesFor } from "./notes";

interface Hit<T> {
  id: number;
  at: number;
  x: T;
}

type Roll = Extract<GameEvent, { t: "roll" }>;
type CardEvent = Extract<GameEvent, { t: "card" }>;

const asRoll = (f: FeedItem): Roll | null => (f.t === "game" && f.e.t === "roll" ? f.e : null);
/** On the big screen a card and the next throw take turns: whichever came last shows. */
const asRollOrCard = (f: FeedItem): Roll | CardEvent | null => (f.t === "game" && (f.e.t === "roll" || f.e.t === "card") ? f.e : null);

function latest<T>(v: RoomView, pick: (f: FeedItem) => T | null): Hit<T> | null {
  for (let i = v.feed.length - 1; i >= 0; i--) {
    const x = pick(v.feed[i]);
    if (x) return { id: v.feed[i].id, at: v.feed[i].at, x };
  }
  return null;
}

/** The newest feed item `pick` accepts while it's younger than `ms`; re-renders when it goes stale. */
export function useFresh<T>(v: RoomView, pick: (f: FeedItem) => T | null, ms: number): Hit<T> | null {
  const hit = latest(v, pick);
  const [, setTick] = useState(0);
  const left = hit ? ms - (serverNow() - hit.at) : 0;
  useEffect(() => {
    if (!hit || left <= 0) return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), left + 30);
    return () => clearTimeout(timer);
  }, [hit?.id, ms]);
  return hit && left > 0 && !reducedMotion() ? hit : null;
}

const sum = (dice: number[]) => dice.reduce((a, b) => a + b, 0);
/** What the dice say, and how far the token goes when that's different (a driving ban in Mexico City,
 * jet lag on the way out of Immigration): "7 → 0". */
const thrown = (roll: Roll) => (roll.steps === sum(roll.dice) ? `${roll.steps}` : `${sum(roll.dice)} → ${roll.steps}`);

/** Big screen: the dice land on the table in front of the team on turn (the bottom of the board).
 * They make way for what the middle of the board is showing: an auction, a quiz, the silence, a forfeit.
 * A throw that moved a token is played by the move (`played`: the big screen's latest), dice and all. */
export function TvDice({ v, played }: { v: RoomView; played?: RidePlan | null }) {
  const hit = useFresh(v, asRollOrCard, 2800);
  const g = v.game!;
  const busy = !!g.auction || !!g.quiz || (g.silenceUntil ?? 0) > serverNow() || !!g.forfeit;
  if (!hit || hit.x.t !== "roll" || busy) return null;
  if (played?.rolled && hit.at >= played.start - 50 && hit.at - played.start <= 1000) return null;
  const roll = hit.x;
  const dbl = doublesKind(roll);
  return (
    <div class={`tv-dice${dbl ? " knock" : ""}`} key={hit.id} aria-hidden="true">
      <Dice dice={roll.dice} seed={hit.id} size={70} />
      <p class="dice-sum num">{thrown(roll)}</p>
      {dbl && <DoublesCall kind={dbl} />}
      {dbl === "speeding" && <Police />}
    </div>
  );
}

/** Phone: the team that just rolled sees its own throw, big, for a moment (`short` when the move
 * plays first-person after it: the camera takes over as the dice settle). It never covers a decision
 * on a clock (an auction or a table vote can open the moment the token lands). */
export function RollMoment({ v, short }: { v: RoomView; short?: boolean }) {
  const mine = (f: FeedItem) => {
    const e = asRoll(f);
    return e && v.you.seats.includes(e.p) ? e : null;
  };
  // (doubles stay up a second longer: the call comes up as the dice settle)
  const newest = latest(v, mine);
  const dbl = newest ? doublesKind(newest.x) : null;
  const ms = dbl ? 2700 : short ? 1350 : 1700;
  const roll = useFresh(v, mine, ms);
  if (!roll || rideUrgent(v)) return null;
  return (
    <div class={`roll-moment${dbl ? " knock" : ""}`} key={roll.id} aria-hidden="true" style={{ "--moment": `${ms}ms` }}>
      <Dice dice={roll.x.dice} seed={roll.id} size={76} />
      <p class="dice-sum num">{thrown(roll.x)}</p>
      {dbl && <DoublesCall kind={dbl} />}
    </div>
  );
}

/** The roll that brought `seat` to the landing with feed id `landId`, for the arrival card. */
export function rollBefore(v: RoomView, seat: number, landId: number): Hit<Roll> | null {
  for (let i = v.feed.length - 1; i >= 0; i--) {
    const f = v.feed[i];
    if (f.id >= landId) continue;
    if (f.t !== "game") continue;
    if (f.e.t === "land" && f.e.p === seat) return null;
    if (f.e.t === "roll" && f.e.p === seat) return { id: f.id, at: f.at, x: f.e };
  }
  return null;
}

/** Small dice for the arrival card: they tumble once when the card appears. */
export function MiniDice({ roll, size = 20 }: { roll: Hit<Roll>; size?: number }) {
  if (reducedMotion()) return <span class="num">{thrown(roll.x)}</span>;
  return (
    <span class="mini-dice">
      <Dice dice={roll.x.dice} seed={roll.id} size={size} />
      <b class="num">{thrown(roll.x)}</b>
    </span>
  );
}

/** The card the team on turn drew this turn, if any. */
export function cardThisTurn(v: RoomView): Hit<CardEvent> | null {
  const s = v.game!.s;
  for (let i = v.feed.length - 1; i >= 0; i--) {
    const f = v.feed[i];
    if (f.t !== "game") continue;
    if (f.e.t === "turn") return null;
    if (f.e.t === "card" && f.e.p === s.turn) return { id: f.id, at: f.at, x: f.e };
  }
  return null;
}

/** A drawn card, coming off the top of its deck face down and turning over as it appears. */
export function CardFace({ v, card, big }: { v: RoomView; card: Hit<CardEvent>; big?: boolean }) {
  const e = card.x;
  const c = (e.deck === "journey" ? JOURNEY_CARDS : POSTCARDS).find((x) => x.id === e.id);
  if (!c) return null;
  return (
    <div class={`drawn-card deck-${e.deck}${big ? " big" : ""}`} key={card.id}>
      {/* (the deck it's drawn from: the backs under it, which sink away once it's off: styles.css) */}
      <div class="card-deck" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div class="card-turn">
        <div class="card-back" aria-hidden="true">
          <span>{t(e.deck === "journey" ? "journey" : "postcard")}</span>
        </div>
        <div class="card-front">
          <p class="pass-strip">
            <span>{t(e.deck === "journey" ? "journey" : "postcard")}</span>
            <SeatChip v={v} seat={e.p} small />
          </p>
          <h3>{tx(c.title)}</h3>
          <p>{tx(c.text)}</p>
        </div>
      </div>
    </div>
  );
}

/** Big screen: the card in the middle of the board for a few seconds after it's drawn (until the
 * next throw). On a move it turns over when the token gets to it (`showAt`, server time), and stays
 * as long. */
export function useFreshCard(v: RoomView, showAt = 0): Hit<CardEvent> | null {
  const last = latest(v, asRollOrCard);
  const hold = last && showAt > last.at ? showAt - last.at : 0;
  const hit = useFresh(v, asRollOrCard, 6500 + hold);
  const wait = hit && showAt ? showAt - serverNow() : 0;
  const [, tick] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => tick((n) => n + 1), wait + 20);
    return () => clearTimeout(id);
  }, [hit?.id, showAt]);
  return hit && hit.x.t === "card" && wait <= 0 ? { id: hit.id, at: hit.at, x: hit.x } : null;
}

/** A payment's flight: its banknotes, from where to where. */
interface Notes {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The bills that fly (notesFor). */
  bills: number[];
  amount: number;
  /** When it sets off after the others of its moment (ms). */
  delay: number;
  /** Which ends float the amount off: a phone's wallet counts its own (Cash). */
  outLabel: boolean;
  inLabel: boolean;
  /** How far down each end's amount is moved (px), off another one at the same spot (`stackLabels`). */
  outDy?: number;
  inDy?: number;
}

/**
 * Amounts that would float off one spot on top of one another (several teams paying this one at
 * once, their tokens all off one edge of a phone's map) stand one under another instead.
 */
function stackLabels(add: Notes[]) {
  const placed: [number, number][] = [];
  const place = (x: number, y: number) => {
    let dy = 0;
    while (placed.some(([px, py]) => Math.abs(px - x) < 72 && Math.abs(py - (y + dy)) < 30)) dy += 34;
    placed.push([x, y + dy]);
    return dy;
  };
  for (const c of add) {
    if (c.outLabel) c.outDy = place(c.x0, c.y0);
    if (c.inLabel) c.inDy = place(c.x1, c.y1);
  }
}

/**
 * A phone's wallet, its cash in the top bar: a batch for each moment its money moved (MoneyFx adds them),
 * with when its cash shows the change (`due`: the move's decision window, or now; performance.now()
 * ms), when the first of its notes touches the wallet (`at`: the first to land, or the first to leave),
 * and whether its money going out has a sound of its own already (`quiet`: a city bought, a building
 * put up). Cash counts as the batch its change comes with gets there: one each, as the computer's teams
 * move one after another.
 */
interface Batch {
  due: number;
  at: number;
  quiet: boolean;
}
const wallet: Batch[] = [];
/** How far apart a change of the cash and its batch's `due` can be and still be the same moment (ms). */
const SAME_MOMENT = 450;

/** The batches a change of the cash at `now` comes with (taken off the list), and those long past dropped. */
function batchesAt(now: number): Batch[] {
  const mine: Batch[] = [];
  for (let i = wallet.length - 1; i >= 0; i--) {
    const b = wallet[i];
    if (Math.abs(b.due - now) <= SAME_MOMENT) mine.push(...wallet.splice(i, 1));
    else if (b.due < now - 4000) wallet.splice(i, 1);
  }
  return mine;
}

/** The other end of a payment to or from a phone's own team: a team's token, a space, or the bank
 * (the middle of the board). */
type End = { seat: number } | { at: number } | { bank: true };

/** A payment to (`dir` 1) or from (-1) one of this phone's teams, where its other end is, and whether
 * its own sound plays elsewhere (`quiet`). */
interface WalletMove {
  dir: 1 | -1;
  end: End;
  amount: number;
  quiet: boolean;
}

/** The money a game event moves in or out of a phone's own teams (`mine`). */
function walletMoves(e: GameEvent, mine: (seat: number) => boolean, s: GameState): WalletMove[] {
  const out: WalletMove[] = [];
  const add = (dir: 1 | -1, end: End, amount: number, quiet = false) => {
    if (amount > 0) out.push({ dir, end, amount, quiet });
  };
  const party = (seat: number): End => (seat >= 0 ? { seat } : { bank: true });
  switch (e.t) {
    case "rent":
    case "pay":
      if (mine(e.p) && !mine(e.to)) add(-1, party(e.to), e.amount);
      else if (mine(e.to) && !mine(e.p)) add(1, party(e.p), e.amount);
      break;
    case "move":
      // (passing Departure: the salary comes from its corner)
      if (e.salary && mine(e.p)) add(1, { at: 0 }, e.salary);
      break;
    case "passport":
    case "bonus":
      if (mine(e.p)) add(1, { seat: e.p }, e.amount);
      break;
    case "fine":
      if (mine(e.p)) add(-1, { bank: true }, e.amount);
      break;
    case "buy":
      if (mine(e.p)) add(-1, { at: e.at }, e.price, true);
      break;
    case "auction":
      if (e.winner !== null && mine(e.winner)) add(-1, { at: e.at }, e.price, true);
      break;
    case "manage":
      if (!mine(e.p)) break;
      if (e.k === "build") add(-1, { at: e.at }, houseCostAt(s, e.at), true);
      else if (e.k === "sell") add(1, { at: e.at }, houseCostAt(s, e.at) / 2);
      else if (e.k === "mortgage") add(1, { at: e.at }, priceOf(s, e.at) / 2);
      else add(-1, { at: e.at }, priceOf(s, e.at) / 2);
      break;
    case "trade":
      for (const [me, them, give, get] of [
        [e.a, e.b, e.give, e.get],
        [e.b, e.a, e.get, e.give],
      ] as const) {
        if (!mine(me) || mine(them)) continue;
        add(-1, { seat: them }, give.cash);
        add(1, { seat: them }, get.cash);
      }
      break;
  }
  return out;
}

/**
 * How high a flight goes (px from the top of the screen): 110 px over its higher end, but never off
 * the top (a phone's wallet is right under it: its money would spend half its flight out of sight).
 */
const arcTop = (y0: number, y1: number) => Math.max(10, Math.min(y0, y1) - 110);
/** A note's flight, and when (into it) the first of a payment's notes lands (ms; styles.css .money-y). */
const FLY_MS = 900;
const LANDS_MS = 840;
/** A payment's notes set off this far apart (ms; styles.css), and a phone's payments in one moment this far. */
const NOTE_MS = 70;
const NEXT_MS = 280;

/** Who pays whom in a game event (-1 is the bank): none, one payment, or a deal's both ways. */
function moneyOf(e: GameEvent): { from: number; to: number; amount: number }[] {
  if ((e.t === "rent" || e.t === "pay") && e.amount > 0) return [{ from: e.p, to: e.to, amount: e.amount }];
  if (e.t === "move" && e.salary) return [{ from: -1, to: e.p, amount: e.salary }];
  if ((e.t === "passport" || e.t === "bonus") && e.amount > 0) return [{ from: -1, to: e.p, amount: e.amount }];
  if (e.t === "fine" && e.amount > 0) return [{ from: e.p, to: -1, amount: e.amount }];
  if (e.t === "trade")
    return [
      ...(e.give.cash ? [{ from: e.a, to: e.b, amount: e.give.cash }] : []),
      ...(e.get.cash ? [{ from: e.b, to: e.a, amount: e.get.cash }] : []),
    ];
  return [];
}

/** Banknotes fly from whoever pays to whoever is paid, token to token (the bank is the middle of the
 * board), once the token that moved has landed (`after`, server time: the move's stamp), in the bills
 * the sum is paid in (notesFor), fluttering as paper does, with a riffle: on the big screen, every
 * payment (a deal's both ways). On a phone (`phone`), the money in and out of its own team, the bank's too,
 * flies into its wallet (the cash in the top bar) or out of it, to or from the token, the space (a
 * city bought, a building, the salary's corner) or the middle of the board; the cash counts as the
 * notes get there (`wallet`, Cash). */
export function MoneyFx({ v, phone, after }: { v: RoomView; phone?: boolean; after?: number }) {
  const seen = useRef(v.feed[v.feed.length - 1]?.id ?? 0);
  const timers = useRef<number[]>([]);
  const [flights, setFlights] = useState<Notes[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const news = v.feed.filter((f) => f.id > seen.current);
    if (!news.length) return;
    seen.current = news[news.length - 1].id;
    const mine = (seat: number) => v.you.seats.includes(seat);
    const gs = v.game?.s;
    // A phone's own money, the bank's too: into its wallet or out of it.
    const purse = phone && gs ? news.flatMap((f) => (f.t === "game" && serverNow() - f.at < 4000 ? walletMoves(f.e, mine, gs) : [])) : [];
    // (when the cash shows it: with the move's decision window, or now)
    const due = performance.now() + Math.max(0, (after ?? 0) - serverNow());
    const batch: Batch | null = purse.length ? { due, at: due, quiet: purse.every((m) => m.dir > 0 || m.quiet) } : null;
    if (batch) wallet.push(batch);
    if (reducedMotion()) return;
    // Back from a dropped connection, the payments missed meanwhile don't all fly at once.
    const fresh = news.filter((f) => serverNow() - f.at < 4000);
    // Wait for the token to walk the short way round (RoundBoard: 220 ms + 120 ms a space, at most 1.8 s).
    let walk = 0;
    for (const f of fresh) {
      if (f.t !== "game" || f.e.t !== "move") continue;
      const n = BOARD.length;
      const d = (((f.e.to - f.e.from) % n) + n) % n;
      walk = Math.max(walk, Math.min(1800, 220 + 120 * Math.min(d, n - d)));
    }
    const moves = phone
      ? []
      : fresh.flatMap((f) => (f.t === "game" ? moneyOf(f.e).map((m, i) => ({ id: f.id * 4 + i, ...m })) : []));
    const wallet0 = document.querySelector(".top .cash-tick");
    const purseOn = phone && purse.length > 0 && !!wallet0;
    if (!moves.length && !purseOn) return;
    const wait = after && after > serverNow() ? after - serverNow() + 180 : walk + 120;
    // (the wallet counts as the first notes land in it, or the first leave it)
    if (purseOn && batch) batch.at = performance.now() + wait + Math.min(...purse.map((m, i) => i * NEXT_MS + (m.dir > 0 ? LANDS_MS : 0)));
    timers.current.push(
      window.setTimeout(() => {
        const board = document.querySelector<SVGSVGElement>(phone ? ".stage .roundboard" : ".tv-board .roundboard");
        if (!board) return;
        const mid = (el: Element | null | undefined): [number, number] | null => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return r.width || r.height ? [r.left + r.width / 2, r.top + r.height / 2] : null;
        };
        // (on screen: an end off the edge, a token the map has scrolled away, comes in from the edge)
        const inView = ([x, y]: [number, number]): [number, number] => [Math.min(innerWidth - 18, Math.max(18, x)), Math.min(innerHeight - 18, Math.max(18, y))];
        // (a team gone broke: where its token lies, fallen over: art/RoundBoard.tsx)
        const where = (seat: number) =>
          mid(seat >= 0 ? (board.querySelector(`[data-seat="${seat}"]`) ?? board.querySelector(`[data-fallen="${seat}"]`)) : null) ?? mid(board.querySelector(".rim")) ?? mid(board)!;
        const endOf = (end: End): [number, number] => {
          if ("seat" in end) return inView(where(end.seat));
          if ("bank" in end) return inView(where(-1));
          // (a city of the phone's own in its open 我的 list: its row; otherwise its space on the board)
          const lot = document.querySelector(`.p-mine .lot[data-at="${end.at}"]`);
          return inView(mid(lot) ?? mid(board.querySelector(`.sp[data-at="${end.at}"] .wedge`)) ?? where(-1));
        };
        const add: Notes[] = moves.map((m) => {
          const [x0, y0] = where(m.from);
          const [x1, y1] = where(m.to);
          return { id: m.id, x0, y0, x1, y1, bills: notesFor(m.amount), amount: m.amount, delay: 0, outLabel: true, inLabel: true };
        });
        const purse0 = purseOn ? mid(document.querySelector(".top .cash-tick")) : null;
        if (purse0)
          purse.forEach((m, i) => {
            const [bx, by] = endOf(m.end);
            const team = "seat" in m.end;
            const [x0, y0, x1, y1] = m.dir > 0 ? [bx, by, ...purse0] : [...purse0, bx, by];
            add.push({ id: Date.now() * 10 + i, x0, y0, x1, y1, bills: notesFor(m.amount), amount: m.amount, delay: i * NEXT_MS, outLabel: m.dir > 0 && team, inLabel: m.dir < 0 && team });
          });
        if (!add.length) return;
        stackLabels(add);
        setFlights((list) => [...list, ...add]);
        // (a riffle as each payment's notes leave the hand)
        for (const c of add) timers.current.push(window.setTimeout(() => sfx.riffle(c.bills.length), c.delay));
        const longest = Math.max(...add.map((c) => c.delay + (c.bills.length - 1) * NOTE_MS + FLY_MS));
        timers.current.push(window.setTimeout(() => setFlights((list) => list.filter((c) => !add.includes(c))), longest + 1400));
      }, wait),
    );
  }, [v.feed[v.feed.length - 1]?.id]);
  if (!flights.length) return null;
  return (
    <div class="money-fx" aria-hidden="true">
      {flights.map((c) => (
        <div key={c.id}>
          {c.bills.map((bill, i) => (
            <span
              key={i}
              class="money-x"
              style={{ left: `${c.x0}px`, top: `${c.y0}px`, "--dx": `${c.x1 - c.x0}px`, "--delay": `${c.delay + i * NOTE_MS}ms` }}
            >
              <span class="money-y" style={{ "--dy": `${c.y1 - c.y0}px`, "--peak": `${arcTop(c.y0, c.y1) - c.y0}px` }}>
                {/* (each at its own slant, as notes leave a hand) */}
                <i class="note" data-bill={bill} style={{ "--tilt": `${((c.id + i * 47) % 37) - 18}deg` }}>
                  <b>{bill}</b>
                </i>
              </span>
            </span>
          ))}
          {c.outLabel && (
            <span class="money-amount out num" style={{ left: `${c.x0}px`, top: `${c.y0 + (c.outDy ?? 0)}px`, animationDelay: `${c.delay}ms` }}>
              −{money(c.amount)}
            </span>
          )}
          {c.inLabel && (
            <span class="money-amount in num" style={{ left: `${c.x1}px`, top: `${c.y1 + (c.inDy ?? 0)}px`, animationDelay: `${c.delay + 750}ms` }}>
              +{money(c.amount)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** A phone's cash in its top bar (its wallet): it counts to its new amount as the notes get there
 * (MoneyFx: the first to land in it, or the first to leave), with the change floating off ("+$200",
 * "−$120"), a bump as money comes in and a dip as it goes, and the till or the pay sound. */
export function Cash({ n }: { n: number }) {
  const [shown, setShown] = useState(n);
  // What's on screen right now (mid-count).
  const now = useRef(n);
  const [delta, setDelta] = useState<{ d: number; k: number } | null>(null);
  useEffect(() => {
    if (n === now.current) return;
    let raf = 0;
    let timer = 0;
    let quiet = false;
    const run = () => {
      const from = now.current;
      const change = n - from;
      if (change > 0) {
        sfx.coin();
        buzz(BUZZ.paid);
      } else if (change < 0 && !quiet) {
        sfx.pay();
        buzz(BUZZ.pay);
      }
      if (reducedMotion()) {
        now.current = n;
        setShown(n);
        setDelta(null);
        return;
      }
      setDelta((x) => ({ d: change, k: (x?.k ?? 0) + 1 }));
      const t0 = performance.now();
      const step = (time: number) => {
        const p = Math.min(1, Math.max(0, (time - t0) / 700));
        now.current = Math.round(from + (n - from) * (1 - Math.pow(1 - p, 3)));
        setShown(now.current);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    // (decided a moment later, once this update's notes are on their way: MoneyFx runs after this)
    timer = window.setTimeout(() => {
      const t = performance.now();
      const mine = batchesAt(t);
      quiet = mine.length > 0 && mine.every((b) => b.quiet);
      const wait = mine.length ? Math.min(...mine.map((b) => b.at)) - t : 0;
      if (wait > 0 && wait < 6000) timer = window.setTimeout(run, wait);
      else run();
    }, 0);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [n]);
  // The "+$200" floats off in 1.5 s; take it away then too, or it would stay if motion is turned off.
  useEffect(() => {
    if (!delta) return;
    const timer = window.setTimeout(() => setDelta(null), 1600);
    return () => clearTimeout(timer);
  }, [delta?.k]);
  return (
    <span class={`cash-tick${delta ? (delta.d > 0 ? " gain" : " spend") : ""}`} key={delta ? `k${delta.k}` : "still"}>
      <span class="num">{money(shown)}</span>
      {delta && (
        <i key={delta.k} class={`cash-delta num ${delta.d > 0 ? "up" : "down"}`} aria-hidden="true">
          {delta.d > 0 ? "+" : "−"}
          {money(Math.abs(delta.d))}
        </i>
      )}
    </span>
  );
}
