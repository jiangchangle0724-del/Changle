// Turn feed items (game and room events) into one line of plain language.
import { BOARD, CITIES, TRASH_QUIZ, newsById, type GameEvent, type Offer } from "../../engine";
import { FORFEITS } from "../../room/party";
import type { FeedItem, RoomView } from "../../room/protocol";
import { cardById, cardTitle, money, spaceName, t, tx, type Key } from "../i18n";
import { seatName } from "./common";

const QUIZ = TRASH_QUIZ.flatMap((b, bin) => b.items.map((item) => ({ bin, item })));

function offerText(v: RoomView, o: Offer) {
  const parts = [...(o.cash ? [money(o.cash)] : []), ...o.deeds.map(spaceName), ...o.cards.map(cardTitle)];
  return parts.length ? parts.join(" + ") : t("nothing");
}

function who(v: RoomView, seat: number) {
  return seat >= 0 ? seatName(v, seat) : t("bank");
}

export function gameEventText(v: RoomView, e: GameEvent): string | null {
  const team = "p" in e ? seatName(v, e.p as number) : "";
  switch (e.t) {
    case "turn":
      return t("log_turn", { team });
    case "roll":
      if (e.steps === 0 && e.doubles && !e.jail) return t("log_speeding", { team });
      return t(e.jail ? "log_rollJail" : "log_roll", { team, dice: e.dice.join(" + ") });
    case "move":
      return e.salary ? t("log_salary", { team, amount: money(e.salary) }) : null;
    case "land": {
      const sp = BOARD[e.at];
      const city = sp.k === "city" ? CITIES.find((c) => c.id === sp.id) : undefined;
      const name = spaceName(e.at);
      return t("log_land", { team, space: city ? `${name} · ${city.greeting.text}${city.greeting.roman ? ` (${city.greeting.roman})` : ""}` : name });
    }
    case "stamp":
      return null;
    case "passport":
      return t("log_passport", { team, amount: money(e.amount) });
    case "buy":
      return t("log_buy", { team, space: spaceName(e.at), price: money(e.price) });
    case "auction":
      return e.winner === null
        ? t("log_auctionNone", { space: spaceName(e.at) })
        : t("log_auction", { team: seatName(v, e.winner), space: spaceName(e.at), price: money(e.price) });
    case "rent":
      return e.to >= 0
        ? t("log_rent", { team, to: who(v, e.to), amount: money(e.amount) })
        : t("log_rentBank", { team, amount: money(e.amount) });
    case "pay":
      return e.to >= 0 ? t("log_pay", { team, to: who(v, e.to), amount: money(e.amount) }) : t("log_payBank", { team, amount: money(e.amount) });
    case "debt":
      return t("log_debt", { team, amount: money(e.amount) });
    case "card": {
      const c = cardById(e.id);
      return t("log_card", { team, deck: t(e.deck === "journey" ? "journey" : "postcard"), title: c ? tx(c.title) : e.id, text: c ? tx(c.text) : "" });
    }
    case "jail":
      return t("log_jail", { team });
    case "manage":
      return t(`log_${e.k}` as Key, { team, space: spaceName(e.at) });
    case "trade":
      return t("log_trade", { a: seatName(v, e.a), b: seatName(v, e.b), give: offerText(v, e.give), get: offerText(v, e.get) });
    case "bankrupt":
      return t("log_bankrupt", { team });
    case "over":
      return e.winner === null ? t("log_overNobody") : t("log_over", { team: seatName(v, e.winner) });
    case "rule":
      return ruleText(v, e, team);
    case "bonus":
      return t("log_bonus", { team, amount: money(e.amount) });
    case "fine":
      return t("log_fine", { team, amount: money(e.amount) });
    case "news": {
      const n = newsById(e.id);
      if (!n) return null;
      return e.on ? t("log_news", { title: tx(n.title), text: tx(n.text) }) : t("log_newsEnd", { title: tx(n.title) });
    }
  }
}

function ruleText(v: RoomView, e: Extract<GameEvent, { t: "rule" }>, team: string): string | null {
  const d = e as Record<string, unknown>;
  switch (e.city) {
    case "capetown":
      return t("rule_capetown", { n: (d.users as number[]).length, result: t(d.dayZero ? "dayZero" : "notDayZero") });
    case "buenosaires":
      return t("rule_buenosaires", { team, partner: seatName(v, d.partner as number), result: t(d.accepted ? "tangoYes" : "tangoNo") });
    case "mexicocity":
      return t("rule_mexicocity", { team, lo: d.lo as number, hi: d.hi as number });
    case "rio":
      return t("rule_rio", { team, total: d.total as number, scores: (d.scores as number[]).join("/"), amount: money(d.amount as number) });
    case "mumbai":
      return t("rule_mumbai", { team, from: spaceName(d.from as number), to: spaceName(d.to as number) });
    case "dubai":
      return t("rule_dubai", { team });
    case "lasvegas":
      return t("rule_lasvegas", { team, bet: money(d.bet as number), dice: (d.dice as number[]).join(" + "), result: t(d.won ? "betWon" : "betLost") });
    case "newyork":
      return t("rule_newyork", { yes: d.yes as number, result: t(d.frozen ? "frozen" : "notFrozen") });
    case "tokyo":
      return t("rule_tokyo", { team, pushed: seatName(v, d.pushed as number) });
    case "beijing":
      return t("rule_beijing", { team });
    case "shanghai":
      return null; // the quiz item says it better
    case "bangkok":
      return t("rule_bangkok", { winners: (d.winners as number[]).map((w) => seatName(v, w)).join("、") });
    case "sydney":
      return t("rule_sydney", { team });
    case "singapore":
      if ("permit" in d) return t("rule_singaporePermit", { team });
      return d.winner === null
        ? t("rule_singaporeNone")
        : t("rule_singapore", { winner: seatName(v, d.winner as number), price: money(d.price as number) });
    case "venice":
      if ("raised" in d) return t("rule_veniceGates", { owner: team, result: t(d.raised ? "gatesUp" : "gatesDown") });
      return t("rule_venice", { team, die: d.die as number, result: t(d.tide ? "tideIn" : "tideOut") });
    case "paris":
      return t("rule_paris", { team });
    case "london":
      return t("rule_london", { team });
    case "seoul":
      return t("rule_seoul", { result: (d.sound as number) >= 0 ? t("soundBy", { team: seatName(v, d.sound as number) }) : t("silenceKept") });
    case "hongkong":
      return t("rule_hongkong", { team, dice: (d.dice as number[]).join(" + "), result: t(d.signal ? "signal8" : "noSignal") });
    case "":
      return typeof d.card === "string" ? t("rule_card", { team, title: cardTitle(d.card) }) : null;
  }
  return null;
}

export function feedText(v: RoomView, f: FeedItem): string | null {
  switch (f.t) {
    case "game":
      return gameEventText(v, f.e);
    case "joined":
      return t("log_joined", { name: f.name });
    case "left":
      return t("log_left", { name: f.name });
    case "autoplay": {
      const team = seatName(v, f.seat);
      if (f.why === "away") return t(f.on ? "log_autoplayAway" : "log_autoplayBack", { team });
      return t(f.on ? "log_autoplayOn" : "log_autoplayOff", { team });
    }
    case "timeup":
      return t("log_timeup");
    case "paused":
      return t("log_paused");
    case "resumed":
      return t("log_resumed");
    case "offer":
      return t("log_offer", { from: seatName(v, f.from), to: seatName(v, f.to), give: offerText(v, f.give), get: offerText(v, f.get) });
    case "offer-done": {
      const vars = { from: seatName(v, f.from), to: seatName(v, f.to) };
      if (f.accepted) return t("log_offerYes", vars);
      if (f.why === "invalid") return t("log_offerGone", vars);
      if (f.why === "expired") return t("log_offerExpired", vars);
      if (f.why === "cancelled") return t("log_offerCancelled", vars);
      return t("log_offerNo", vars);
    }
    case "bets":
      return t("log_bets", { team: seatName(v, f.seat), paid: t(f.paidRent ? "paidRent" : "noRent"), right: f.right, wrong: f.wrong });
    case "party":
      return t("log_party", { team: seatName(v, f.seat), why: t(`party_${f.why}` as Key), dare: dareText(f) });
    case "party-done":
      return t(f.how === "skip" ? "log_partySkipped" : "log_partyDone", { team: seatName(v, f.seat) });
    case "idle":
      return t("log_idle", { team: seatName(v, f.seat) });
    case "quiz": {
      const q = QUIZ[f.item];
      const bin = (i: number) => tx(TRASH_QUIZ[i].bin);
      return t("log_quiz", {
        team: seatName(v, f.seat),
        item: tx(q.item),
        choice: f.choice === null ? t("noAnswer") : bin(f.choice),
        result: f.right ? t("right") : t("wrong", { bin: bin(f.bin) }),
      });
    }
  }
}

export const quizItemText = (i: number) => tx(QUIZ[i].item);

/** The forfeit itself (rooms from before step 6 didn't pick one: the table decides). */
export const dareText = (f: Extract<FeedItem, { t: "party" }>) => {
  const d = f.dare === undefined ? undefined : FORFEITS[f.dare];
  return d ? tx(d.text) : t("partyOwnRules");
};

