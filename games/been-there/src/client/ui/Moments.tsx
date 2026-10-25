// The moments of a turn, animated: dice landing, coins changing hands, a card turning over, cash
// counting up or down. All of it is decoration over the game: it never takes a tap, and with reduced
// motion it isn't drawn (the numbers, the cards and the log still say everything).
import { useEffect, useRef, useState } from "preact/hooks";
import { BOARD, JOURNEY_CARDS, POSTCARDS, type GameEvent } from "../../engine";
import type { FeedItem, RoomView } from "../../room/protocol";
import { Dice } from "../art/dice";
import { money, t, tx } from "../i18n";
import { serverNow } from "../store";
import { reducedMotion } from "./Board";
import { SeatChip } from "./common";
import { recentParty } from "./feedText";
import { onClock } from "./Touchdown";

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
function useFresh<T>(v: RoomView, pick: (f: FeedItem) => T | null, ms: number): Hit<T> | null {
  const hit = latest(v, pick);
  const [, setTick] = useState(0);
  const left = hit ? ms - (serverNow() - hit.at) : 0;
  useEffect(() => {
    if (!hit || left <= 0) return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), left + 30);
    return () => clearTimeout(timer);
  }, [hit?.id]);
  return hit && left > 0 && !reducedMotion() ? hit : null;
}

const sum = (dice: number[]) => dice.reduce((a, b) => a + b, 0);
/** What the dice say, and how far the token goes when that's different (a driving ban in Mexico City,
 * jet lag on the way out of Immigration): "7 → 0". */
const thrown = (roll: Roll) => (roll.steps === sum(roll.dice) ? `${roll.steps}` : `${sum(roll.dice)} → ${roll.steps}`);

/** Big screen: the dice land on the table in front of the team on turn (the bottom of the board).
 * They make way for what the middle of the board is showing: an auction, a quiz, the silence, a forfeit. */
export function TvDice({ v }: { v: RoomView }) {
  const hit = useFresh(v, asRollOrCard, 2800);
  const g = v.game!;
  const busy = !!g.auction || !!g.quiz || (g.silenceUntil ?? 0) > serverNow() || !!recentParty(v);
  if (!hit || hit.x.t !== "roll" || busy) return null;
  const roll = hit.x;
  return (
    <div class="tv-dice" key={hit.id} aria-hidden="true">
      <Dice dice={roll.dice} seed={hit.id} size={70} />
      <p class="dice-sum num">
        {thrown(roll)}
        {roll.doubles && <small>{t("doubles")}</small>}
      </p>
    </div>
  );
}

/** Phone: the team that just rolled sees its own throw, big, for a moment. It never covers a decision
 * on a clock (an auction or a table vote can open the moment the token lands). */
export function RollMoment({ v }: { v: RoomView }) {
  const roll = useFresh(v, (f) => {
    const e = asRoll(f);
    return e && v.you.seats.includes(e.p) ? e : null;
  }, 1700);
  if (!roll || onClock(v, true)) return null;
  return (
    <div class="roll-moment" key={roll.id} aria-hidden="true">
      <Dice dice={roll.x.dice} seed={roll.id} size={76} />
      <p class="dice-sum num">
        {thrown(roll.x)}
        {roll.x.doubles && <small>{t("doubles")}</small>}
      </p>
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

/** A drawn card, turning over from its back as it appears. */
export function CardFace({ v, card, big }: { v: RoomView; card: Hit<CardEvent>; big?: boolean }) {
  const e = card.x;
  const c = (e.deck === "journey" ? JOURNEY_CARDS : POSTCARDS).find((x) => x.id === e.id);
  if (!c) return null;
  return (
    <div class={`drawn-card deck-${e.deck}${big ? " big" : ""}`} key={card.id}>
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
 * next throw). */
export function useFreshCard(v: RoomView): Hit<CardEvent> | null {
  const hit = useFresh(v, asRollOrCard, 6500);
  return hit && hit.x.t === "card" ? { id: hit.id, at: hit.at, x: hit.x } : null;
}

interface Coins {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: number;
  amount: number;
}

/** Who pays whom in a game event (-1 is the bank), or null if no money moves. */
function moneyOf(e: GameEvent): { from: number; to: number; amount: number } | null {
  if ((e.t === "rent" || e.t === "pay") && e.amount > 0) return { from: e.p, to: e.to, amount: e.amount };
  if (e.t === "move" && e.salary) return { from: -1, to: e.p, amount: e.salary };
  if ((e.t === "passport" || e.t === "bonus") && e.amount > 0) return { from: -1, to: e.p, amount: e.amount };
  return null;
}

/** Big screen: coins fly from whoever pays to whoever is paid, token to token (the bank is the
 * middle of the board), once the token that moved has finished walking. */
export function CoinFx({ v }: { v: RoomView }) {
  const seen = useRef(v.feed[v.feed.length - 1]?.id ?? 0);
  const timers = useRef<number[]>([]);
  const [flights, setFlights] = useState<Coins[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const news = v.feed.filter((f) => f.id > seen.current);
    if (!news.length) return;
    seen.current = news[news.length - 1].id;
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
    const moves = fresh.flatMap((f) => {
      const m = f.t === "game" ? moneyOf(f.e) : null;
      return m ? [{ id: f.id, ...m }] : [];
    });
    if (!moves.length) return;
    timers.current.push(
      window.setTimeout(() => {
        const board = document.querySelector<SVGSVGElement>(".tv-board .roundboard");
        if (!board) return;
        const where = (seat: number) => {
          const el = seat >= 0 ? board.querySelector(`[data-seat="${seat}"]`) : null;
          const r = (el ?? board).getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2];
        };
        const add = moves.map((m) => {
          const [x0, y0] = where(m.from);
          const [x1, y1] = where(m.to);
          return { id: m.id, x0, y0, x1, y1, n: Math.min(9, 3 + Math.floor(m.amount / 60)), amount: m.amount };
        });
        setFlights((list) => [...list, ...add]);
        timers.current.push(window.setTimeout(() => setFlights((list) => list.filter((c) => !add.includes(c))), 2200));
      }, walk + 120),
    );
  }, [v.feed[v.feed.length - 1]?.id]);
  if (!flights.length) return null;
  return (
    <div class="coin-fx" aria-hidden="true">
      {flights.map((c) => (
        <div key={c.id}>
          {Array.from({ length: c.n }, (_, i) => (
            <span
              key={i}
              class="coin-x"
              style={{ left: `${c.x0}px`, top: `${c.y0}px`, "--dx": `${c.x1 - c.x0}px`, "--delay": `${i * 70}ms` }}
            >
              <span class="coin-y" style={{ "--dy": `${c.y1 - c.y0}px`, "--peak": `${Math.min(0, c.y1 - c.y0) - 110}px` }}>
                <i class="coin" />
              </span>
            </span>
          ))}
          <span class="coin-amount out num" style={{ left: `${c.x0}px`, top: `${c.y0}px` }}>
            −{money(c.amount)}
          </span>
          <span class="coin-amount in num" style={{ left: `${c.x1}px`, top: `${c.y1}px` }}>
            +{money(c.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Cash that counts to its new amount, with the change floating off ("+$200", "−$120"). */
export function Cash({ n }: { n: number }) {
  const [shown, setShown] = useState(n);
  // What's on screen right now (mid-count), and the last amount counted to.
  const now = useRef(n);
  const last = useRef(n);
  const [delta, setDelta] = useState<{ d: number; k: number } | null>(null);
  useEffect(() => {
    const from = now.current;
    const change = n - last.current;
    last.current = n;
    if (!change) return;
    if (reducedMotion()) {
      now.current = n;
      setShown(n);
      setDelta(null);
      return;
    }
    setDelta((x) => ({ d: change, k: (x?.k ?? 0) + 1 }));
    const t0 = performance.now();
    let raf = 0;
    const step = (time: number) => {
      const p = Math.min(1, Math.max(0, (time - t0) / 700));
      now.current = Math.round(from + (n - from) * (1 - Math.pow(1 - p, 3)));
      setShown(now.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  // The "+$200" floats off in 1.5 s; take it away then too, or it would stay if motion is turned off.
  useEffect(() => {
    if (!delta) return;
    const timer = window.setTimeout(() => setDelta(null), 1600);
    return () => clearTimeout(timer);
  }, [delta?.k]);
  return (
    <span class="cash-tick">
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
