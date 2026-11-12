import { useState } from "preact/hooks";
import { GROUP_SPACES, activePlayers, canGive, groupAt, priceOf, type Offer } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { cardTitle, money, spaceName, t } from "../i18n";
import { send } from "../store";
import { Btn, Countdown, SeatChip, seatName } from "./common";

/** The most a trade may ask of a team whose money is hidden. */
const HIDDEN_CAP = 99_990;

const offerText = (o: Offer) => {
  const parts = [...(o.cash ? [money(o.cash)] : []), ...o.deeds.map(spaceName), ...o.cards.map(cardTitle)];
  return parts.length ? parts.join(" + ") : t("nothing");
};

export function Trade({ v }: { v: RoomView }) {
  const g = v.game!;
  const mine = v.you.seats;
  const seat = mine[0];
  return (
    <div class="trade">
      <h3>{t("trades")}</h3>
      {g.trades.length === 0 && <p class="muted">{t("noOffers")}</p>}
      <ul class="offers">
        {g.trades.map((o) => {
          const incoming = mine.includes(o.to);
          const outgoing = mine.includes(o.from);
          return (
            <li key={o.id} class={incoming ? "incoming" : ""}>
              <p>
                {incoming ? t("offerFrom", { from: seatName(v, o.from) }) : outgoing ? t("offerTo", { to: seatName(v, o.to) }) : t("offerBetween", { from: seatName(v, o.from), to: seatName(v, o.to) })}{" "}
                <Countdown until={o.expiresAt} />
              </p>
              <p class="deal">
                <span>
                  <SeatChip v={v} seat={o.from} small /> {offerText(o.give)}
                </span>
                <span aria-hidden="true">⇄</span>
                <span>
                  <SeatChip v={v} seat={o.to} small /> {offerText(o.get)}
                </span>
              </p>
              {incoming && (
                <div class="choices">
                  <Btn kind="primary" onClick={() => send({ t: "offer-reply", id: o.id, accept: true })}>
                    {t("acceptDeal")}
                  </Btn>
                  <Btn onClick={() => send({ t: "offer-reply", id: o.id, accept: false })}>{t("decline")}</Btn>
                </div>
              )}
              {outgoing && <Btn onClick={() => send({ t: "offer-cancel", id: o.id })}>{t("cancel")}</Btn>}
            </li>
          );
        })}
      </ul>
      {seat !== undefined && !g.s.ps[seat].out && <Composer v={v} seat={seat} />}
    </div>
  );
}

const empty = (): Offer => ({ cash: 0, deeds: [], cards: [] });

function Composer({ v, seat }: { v: RoomView; seat: number }) {
  const s = v.game!.s;
  const others = activePlayers(s).filter((q) => q !== seat);
  const [to, setTo] = useState<number | null>(null);
  const [give, setGive] = useState<Offer>(empty());
  const [get, setGet] = useState<Offer>(empty());
  const tradeable = (p: number) =>
    s.deeds
      .map((d, at) => ({ d, at }))
      .filter(({ d, at }) => {
        if (!d || d.owner !== p) return false;
        const grp = groupAt(at);
        return grp === null || GROUP_SPACES[grp].every((x) => s.deeds[x]!.owner !== p || s.deeds[x]!.houses === 0);
      })
      .map((x) => x.at);
  const toggle = (o: Offer, set: (o: Offer) => void, at: number) =>
    set({ ...o, deeds: o.deeds.includes(at) ? o.deeds.filter((x) => x !== at) : [...o.deeds, at] });
  const toggleCard = (o: Offer, set: (o: Offer) => void, c: string) =>
    set({ ...o, cards: o.cards.includes(c) ? o.cards.filter((x) => x !== c) : [...o.cards, c] });
  const pd = s.pending;
  const inDebt = pd?.k === "debt" && (pd.who === seat || pd.who === to);
  // With the money hidden (更多规则) the other team's cash isn't known here (-1): ask for any amount,
  // and the server says whether they have it.
  const cashOf = (p: number) => (s.ps[p].cash < 0 ? HIDDEN_CAP : s.ps[p].cash);
  const known = (p: number) => (s.ps[p].cash < 0 ? { ...s, ps: s.ps.map((x, i) => (i === p ? { ...x, cash: HIDDEN_CAP } : x)) } : s);
  const ok =
    to !== null &&
    !inDebt &&
    canGive(s, seat, give) &&
    canGive(known(to), to, get) &&
    (give.cash || give.deeds.length || give.cards.length || get.cash || get.deeds.length || get.cards.length);
  const side = (p: number, o: Offer, set: (o: Offer) => void, title: string) => (
    <fieldset>
      <legend>{title}</legend>
      <label class="field">
        $
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={cashOf(p)}
          step={10}
          value={o.cash}
          onInput={(e) => set({ ...o, cash: Math.max(0, Math.min(cashOf(p), Math.floor(Number((e.target as HTMLInputElement).value) || 0))) })}
        />
      </label>
      {tradeable(p).map((at) => (
        <label key={at} class="check">
          <input type="checkbox" checked={o.deeds.includes(at)} onChange={() => toggle(o, set, at)} />
          {spaceName(at)} <span class="muted">{money(priceOf(s, at))}</span>
        </label>
      ))}
      {s.ps[p].keep.map((c) => (
        <label key={c} class="check">
          <input type="checkbox" checked={o.cards.includes(c)} onChange={() => toggleCard(o, set, c)} />
          {cardTitle(c)}
        </label>
      ))}
    </fieldset>
  );
  return (
    <div class="composer">
      <h3>{t("newOffer")}</h3>
      <div class="choices">
        <span class="muted">{t("tradeWith")}</span>
        {others.map((q) => (
          <Btn
            key={q}
            kind={to === q ? "primary" : undefined}
            onClick={() => {
              setTo(q);
              setGet(empty());
            }}
          >
            {seatName(v, q)}
          </Btn>
        ))}
      </div>
      {to !== null && (
        <>
          <div class="sides">
            {side(seat, give, setGive, t("youGive"))}
            {side(to, get, setGet, t("youGet"))}
          </div>
          <p class="hint">{inDebt ? t("noTradeInDebt") : t("tradeNoHouses")}</p>
          <Btn
            kind="primary"
            disabled={!ok}
            onClick={() => {
              send({ t: "offer", to, give, get, seat });
              setGive(empty());
              setGet(empty());
            }}
          >
            {t("sendOffer")}
          </Btn>
        </>
      )}
    </div>
  );
}
