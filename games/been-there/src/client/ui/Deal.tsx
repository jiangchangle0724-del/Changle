// A deal done (a trade), as the original game makes a moment of it: "Deal!" comes up over the board
// with the two teams, and what changed hands under it, one thing after another: each city turning from
// its old owner's colour to its new one's (as its chip turns over on the board: art/RoundBoard.tsx
// `hand`), the money with who got it. Two hands clap and two notes go up: on the big screen, and on the
// phones of the two teams, with a buzz. Every phone sees it; only deals done while the screen is up.
// Decoration: the log says the same; with reduced motion the call simply shows.
import { useEffect, useRef, useState } from "preact/hooks";
import type { GameEvent } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { BUZZ, buzz } from "../controls";
import { cardTitle, money, spaceName, t } from "../i18n";
import { sfx } from "../sound";
import { TEAM_COLORS, seatName, teamOf } from "./common";

type TradeEvent = Extract<GameEvent, { t: "trade" }>;

/** How long a deal's call is up (ms: art in styles.css .deal-call). */
export const DEAL_MS = 2800;

/** The deals done since this screen started watching the game, each for DEAL_MS. */
function useNewDeals(v: RoomView): { id: number; e: TradeEvent }[] {
  const [deals, setDeals] = useState<{ id: number; e: TradeEvent }[]>([]);
  const seen = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const lastId = v.feed.length ? v.feed[v.feed.length - 1].id : 0;
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const from = seen.current;
    seen.current = Math.max(from ?? 0, lastId);
    if (from === null) return;
    const fresh = v.feed.flatMap((f) => (f.id > from && f.t === "game" && f.e.t === "trade" ? [{ id: f.id, e: f.e }] : []));
    if (!fresh.length) return;
    setDeals((x) => [...x, ...fresh]);
    timers.current.push(window.setTimeout(() => setDeals((x) => x.filter((d) => !fresh.includes(d))), DEAL_MS));
  }, [lastId]);
  return deals;
}

/** What changed hands in a deal, in the order it shows: from whom, to whom. */
function handed(v: RoomView, e: TradeEvent): { key: string; text: string; from: number; to: number }[] {
  const out: { key: string; text: string; from: number; to: number }[] = [];
  for (const [from, to, o] of [
    [e.a, e.b, e.give],
    [e.b, e.a, e.get],
  ] as const) {
    for (const at of o.deeds) out.push({ key: `d${at}`, text: spaceName(at), from, to });
    for (const c of o.cards) out.push({ key: `c${c}`, text: cardTitle(c), from, to });
    if (o.cash) out.push({ key: `m${from}`, text: t("dealCash", { amount: money(o.cash), team: seatName(v, to) }), from, to });
  }
  return out;
}

/** The call over the board for the newest deal just done (`big`: the big screen's), with its sound. */
export function DealCall({ v, big }: { v: RoomView; big?: boolean }) {
  const deals = useNewDeals(v);
  const played = useRef(new Set<number>());
  useEffect(() => {
    for (const d of deals) {
      if (played.current.has(d.id)) continue;
      played.current.add(d.id);
      const mine = v.you.seats.includes(d.e.a) || v.you.seats.includes(d.e.b);
      if (big || mine) sfx.deal();
      if (mine && !big) buzz(BUZZ.deal);
    }
  }, [deals.map((d) => d.id).join(",")]);
  const d = deals[deals.length - 1];
  if (!d) return null;
  const { a, b } = d.e;
  const color = (seat: number) => {
    const team = teamOf(v, seat);
    return team ? TEAM_COLORS[team.color] : "var(--active)";
  };
  const mine = v.you.seats.includes(a) || v.you.seats.includes(b);
  return (
    <div class={`deal-call${big ? " big" : ""}${mine ? " mine" : ""}`} key={d.id} aria-hidden="true">
      <b>{t("dealDone")}</b>
      <small>{t("dealBetween", { a: seatName(v, a), b: seatName(v, b) })}</small>
      <span class="deal-items">
        {handed(v, d.e).map((x, i) => (
          <i key={x.key} style={{ "--from": color(x.from), "--team": color(x.to), "--i": i }}>
            {x.text}
          </i>
        ))}
      </span>
    </div>
  );
}
