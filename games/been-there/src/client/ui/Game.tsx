import { useEffect, useRef, useState } from "preact/hooks";
import { BOARD, CITY_AT, type GameEvent } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { colon, money, spaceName, t, tx, type Key } from "../i18n";
import { sfx } from "../sound";
import { getState, send } from "../store";
import { Assets } from "./Assets";
import { Board } from "./Board";
import { Btn, Countdown, Money, SeatChip, TeamChip, seatName, teamOf, useCountdown } from "./common";
import { Decision, pendingSummary } from "./Decision";
import { feedText } from "./feedText";
import { SettingsSheet } from "./Settings";
import { Trade } from "./Trade";

type Tab = "play" | "board" | "mine" | "trade" | "log";

export function Game({ v }: { v: RoomView }) {
  const g = v.game!;
  const s = g.s;
  const [tab, setTab] = useState<Tab>("play");
  const [menu, setMenu] = useState(false);
  const mySeat = v.you.seats[0];
  const me = mySeat !== undefined ? s.ps[mySeat] : null;
  const myMove =
    v.you.seats.some((x) => g.mustAct.includes(x)) ||
    (!!g.auction && v.you.seats.length > 0) ||
    (!!g.quiz && v.you.seats.includes(g.quiz.visitor));
  const incoming = g.trades.filter((o) => v.you.seats.includes(o.to)).length;
  usePhoneSounds(v, myMove);
  const myTeam = mySeat !== undefined ? teamOf(v, mySeat) : undefined;
  const tabs: [Tab, Key, number][] = [
    ["play", "tab_play", myMove ? 1 : 0],
    ["board", "tab_board", 0],
    ["mine", "tab_mine", 0],
    ["trade", "tab_trade", incoming],
    ["log", "tab_log", 0],
  ];
  return (
    <div class={`game${myMove ? " my-move" : ""}`}>
      <header class="top">
        {me && myTeam ? (
          <>
            <TeamChip team={myTeam} />
            <span class="stat">
              <small>{t("cash")}</small>
              <Money n={me.cash} />
            </span>
            <span class="stat">
              <small>{t("worth")}</small>
              <Money n={g.worth[mySeat]} />
            </span>
          </>
        ) : (
          <b>{t("spectators")}</b>
        )}
        <Clock v={v} />
        <button type="button" class="menu-btn" onClick={() => setMenu(true)}>
          {t("menu")}
        </button>
      </header>
      <Banner v={v} />
      <div class="panes" data-tab={tab}>
        <section class="pane p-play">
          <Standings v={v} />
          <Decision v={v} />
          {mySeat === undefined && <Bets v={v} />}
          <Feed v={v} n={5} />
        </section>
        <section class="pane p-board">
          <Board v={v} center={<BoardCenter v={v} />} />
        </section>
        <section class="pane p-mine">{mySeat !== undefined ? <Assets v={v} seat={mySeat} /> : <Bets v={v} />}</section>
        <section class="pane p-trade">
          <Trade v={v} />
        </section>
        <section class="pane p-log">
          <Feed v={v} />
        </section>
      </div>
      <nav class="tabs">
        {tabs.map(([id, key, badge]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
            {t(key)}
            {badge > 0 && <i class="badge">{badge}</i>}
          </button>
        ))}
      </nav>
      {menu && <SettingsSheet v={v} onClose={() => setMenu(false)} />}
    </div>
  );
}

export function Clock({ v }: { v: RoomView }) {
  const g = v.game!;
  const left = useCountdown(g.endsAt);
  if (g.timeUp) return <span class="clock warn">{t("lastRound")}</span>;
  if (g.endsAt !== null && left !== null) {
    const m = Math.floor(left / 60);
    const sec = String(left % 60).padStart(2, "0");
    return <span class="clock num">{t("timeLeft", { time: `${m}:${sec}` })}</span>;
  }
  const end = g.s.cfg.end;
  return end.kind === "target" ? <span class="clock num">{t("target", { amount: money(end.amount) })}</span> : null;
}

/** Top-of-screen line: whose turn, pause, the computer covering for us, connection trouble. */
function Banner({ v }: { v: RoomView }) {
  const g = v.game!;
  const st = getState();
  const myTeam = v.teams.find((x) => x.id === v.you.team);
  if (st.status === "reconnecting" || st.status === "connecting") return <p class="banner warn">{t("reconnecting")}</p>;
  if (g.paused) return <p class="banner">{t("paused")}</p>;
  if (myTeam && (myTeam.autoplay || myTeam.covered) && !v.settings.hotseat)
    return (
      <button type="button" class="banner warn" onClick={() => send({ t: "autoplay", on: false })}>
        {t("autoplayOn")}
      </button>
    );
  const mine = v.you.seats.includes(g.s.turn);
  return <p class={`banner${mine ? " me" : ""}`}>{mine ? t("yourTurn") : t("turnOf", { team: seatName(v, g.s.turn) })}</p>;
}

export function Standings({ v, big }: { v: RoomView; big?: boolean }) {
  const g = v.game!;
  const s = g.s;
  return (
    <ul class={`standings${big ? " big" : ""}`}>
      {s.ps.map((p, seat) => {
        const team = teamOf(v, seat);
        return (
          <li key={seat} class={`${seat === s.turn ? "turn" : ""}${p.out ? " out" : ""}`}>
            <TeamChip team={team} small={!big} />
            {!big && <span class="name">{seatName(v, seat)}</span>}
            <span class="num">{money(g.worth[seat])}</span>
            {big && (
              <small class="muted num">
                {t("cash")} {money(p.cash)}
              </small>
            )}
            {p.jail && <small class="tag">{t("inJail")}</small>}
            {p.out && <small class="tag">{t("out")}</small>}
            {team?.covered && <small class="tag">{t("covered")}</small>}
            {big && team && !team.bot && (
              <small class="muted">
                {team.members
                  .map((id) => v.members.find((m) => m.id === id))
                  .filter(Boolean)
                  .map((m) => `${m!.name}${m!.online ? "" : "·" + t("away")}`)
                  .join("、")}
              </small>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Feed({ v, n }: { v: RoomView; n?: number }) {
  const lines = v.feed
    .map((f) => ({ id: f.id, text: feedText(v, f), party: f.t === "party" }))
    .filter((x) => x.text)
    .reverse()
    .slice(0, n ?? 60);
  return (
    <ol class="feed" aria-live={n ? "polite" : undefined}>
      {lines.map((x) => (
        <li key={x.id} class={x.party ? "party" : ""}>
          {x.text}
        </li>
      ))}
    </ol>
  );
}

/** The middle of the board: last dice, and the city just reached with its greeting and currency. */
export function BoardCenter({ v, big }: { v: RoomView; big?: boolean }) {
  const g = v.game!;
  const s = g.s;
  const lastLand = [...v.feed].reverse().find((f) => f.t === "game" && f.e.t === "land") as { e: Extract<GameEvent, { t: "land" }> } | undefined;
  const city = lastLand ? CITY_AT[lastLand.e.at] : null;
  return (
    <div class={`boardcenter${big ? " big" : ""}`}>
      <p class="dice num" aria-label="dice">
        {s.dice[0] ? `${die(s.dice[0])} ${die(s.dice[1])}` : ""}
      </p>
      {lastLand && (
        <div class="arrived" key={lastLand.e.at}>
          <SeatChip v={v} seat={lastLand.e.p} small />
          <b>{spaceName(lastLand.e.at)}</b>
          {city && (
            <>
              <span lang="und">
                {city.greeting.text}
                {city.greeting.roman ? ` · ${city.greeting.roman}` : ""}
              </span>
              <small class="muted">{tx(city.currency)}</small>
              {big && <small class="muted">{tx(city.rule.title)}{colon()}{tx(city.rule.text)}</small>}
            </>
          )}
          {!city && BOARD[lastLand.e.at].k !== "city" && null}
        </div>
      )}
      {big && <p class="pending">{pendingSummary(v)}</p>}
    </div>
  );
}

const die = (n: number) => "⚀⚁⚂⚃⚄⚅"[n - 1] ?? "";

export function Bets({ v }: { v: RoomView }) {
  const g = v.game!;
  const b = g.bets;
  const me = v.members.find((m) => m.id === v.you.id);
  if (!b) return null;
  return (
    <div class="bets">
      <h3>{t("bets")}</h3>
      <p>{t("betQuestion", { team: seatName(v, b.seat) })}</p>
      {b.mine !== null ? (
        <p class="muted">{t("betPlaced", { choice: t(b.mine ? "betYes" : "betNo") })}</p>
      ) : b.open ? (
        <div class="choices">
          <Btn onClick={() => send({ t: "bet", yes: true })}>{t("betYes")}</Btn>
          <Btn onClick={() => send({ t: "bet", yes: false })}>{t("betNo")}</Btn>
        </div>
      ) : (
        <p class="muted">{t("betClosed")}</p>
      )}
      <p class="muted">
        {t("betOdds", { yes: b.yes, no: b.no })} · {me ? t("score", { n: me.score }) : ""}
      </p>
    </div>
  );
}

/** Id of the newest feed item (0 if none). */
export const lastId = (v: RoomView) => (v.feed.length ? v.feed[v.feed.length - 1].id : 0);

/** Sounds on a phone: my turn, dice, money in and out. */
function usePhoneSounds(v: RoomView, myMove: boolean) {
  const g = v.game!;
  const prev = useRef({ myMove, feed: lastId(v), cash: v.you.seats.map((x) => g.s.ps[x]?.cash ?? 0) });
  useEffect(() => {
    const p = prev.current;
    if (myMove && !p.myMove) sfx.turn();
    const fresh = v.feed.filter((f) => f.id > p.feed);
    if (fresh.some((f) => f.t === "game" && f.e.t === "roll")) sfx.dice();
    if (fresh.some((f) => f.t === "game" && f.e.t === "stamp" && v.you.seats.includes(f.e.p))) sfx.stamp();
    const cash = v.you.seats.map((x) => g.s.ps[x]?.cash ?? 0);
    const delta = cash.reduce((a, b) => a + b, 0) - p.cash.reduce((a, b) => a + b, 0);
    if (delta > 0) sfx.coin();
    else if (delta < 0) sfx.pay();
    prev.current = { myMove, feed: lastId(v) || p.feed, cash };
  });
}

export function Over({ v }: { v: RoomView }) {
  const g = v.game!;
  const s = g.s;
  const order = s.ps.map((_, seat) => seat).sort((a, b) => (b === s.winner ? 1 : 0) - (a === s.winner ? 1 : 0) || g.worth[b] - g.worth[a]);
  useEffect(() => sfx.win(), []);
  return (
    <main class="over">
      <h1>{t("gameOver")}</h1>
      {s.winner !== null && (
        <p class="big">
          {t("winner", { team: seatName(v, s.winner) })} <span class="muted">{t(`reason_${s.reason}` as Key)}</span>
        </p>
      )}
      <ol class="results">
        {order.map((seat) => (
          <li key={seat}>
            <SeatChip v={v} seat={seat} />
            <span class="num">{money(g.worth[seat])}</span>
            <small class="muted">{t("rentCollected", { amount: money(s.stats.rentByOwner[seat] ?? 0) })}</small>
          </li>
        ))}
      </ol>
      {v.you.host && (
        <Btn kind="primary" onClick={() => send({ t: "again" })}>
          {t("again")}
        </Btn>
      )}
      <Feed v={v} n={12} />
    </main>
  );
}

export { Countdown };
