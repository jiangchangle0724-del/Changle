import { useEffect, useRef, useState } from "preact/hooks";
import { BOARD, CITY_AT, type GameEvent } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { CityPoster } from "../art/posters";
import { Stamp } from "../art/stamps";
import { BUZZ, buzz } from "../controls";
import { colon, getLang, money, spaceName, t, tx, type Key } from "../i18n";
import { sfx } from "../sound";
import { getState, send, toast } from "../store";
import { useWeather, weatherLabel } from "../weather";
import { Assets } from "./Assets";
import { Board, moodOf, reducedMotion, thisGame } from "./Board";
import { Btn, Countdown, Money, SeatChip, TeamChip, hostOf, seatName, teamOf, useCountdown } from "./common";
import { Decision, pendingSummary } from "./Decision";
import { dareText, feedText } from "./feedText";
import { CardFace, Cash, MiniDice, RollMoment, cardThisTurn, rollBefore } from "./Moments";
import { NewsBanner } from "./News";
import { SettingsSheet } from "./Settings";
import { Touchdown } from "./Touchdown";
import { Trade } from "./Trade";
import { Trivia } from "./Trivia";

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
  usePartyToasts(v);
  const myTeam = mySeat !== undefined ? teamOf(v, mySeat) : undefined;
  const wide = useWide();
  // Phones show one tab at a time, so the board, Mine and Log are only built while on screen (every
  // update from the server would otherwise redraw them unseen). Play and Trade always stay built:
  // a half-made choice or offer survives a look at the board.
  const shown = (t: Tab) => wide || tab === t;
  const tabs: [Tab, Key, number][] = [
    ["play", "tab_play", myMove ? 1 : 0],
    ["board", "tab_board", 0],
    ["mine", "tab_mine", 0],
    ["trade", "tab_trade", incoming],
    ["log", "tab_log", 0],
  ];
  const swipe = useSwipe(tabs.map(([id]) => id), tab, setTab, !wide);
  return (
    <div class={`game${myMove ? " my-move" : ""}`}>
      <header class="top">
        {me && myTeam ? (
          <>
            <TeamChip team={myTeam} />
            <span class="stat">
              <small>{t("cash")}</small>
              <Cash n={me.cash} />
            </span>
            <span class="stat worth">
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
      <div class="panes" data-tab={tab} {...swipe}>
        <section class="pane p-play">
          <Arrival v={v} />
          <TurnCard v={v} />
          <Decision v={v} />
          <NewsBanner v={v} />
          <Trivia v={v} />
          <Standings v={v} />
          {mySeat === undefined && <Bets v={v} />}
          <Feed v={v} n={5} />
        </section>
        <section class="pane p-board">
          {shown("board") && (
            <>
              <Board v={v} />
              <BoardNote v={v} />
            </>
          )}
        </section>
        <section class="pane p-mine">{shown("mine") && (mySeat !== undefined ? <Assets v={v} seat={mySeat} /> : <Bets v={v} />)}</section>
        <section class="pane p-trade">
          <Trade v={v} />
        </section>
        <section class="pane p-log">{shown("log") && <Feed v={v} />}</section>
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
      <RollMoment v={v} />
      <Touchdown v={v} />
    </div>
  );
}

/** The card your team drew this turn, until the turn passes (spectators see the team on turn's). */
function TurnCard({ v }: { v: RoomView }) {
  const card = cardThisTurn(v);
  if (!card || (v.you.seats.length > 0 && !v.you.seats.includes(card.x.p))) return null;
  return <CardFace v={v} card={card} />;
}

/** On a phone, a sideways swipe goes to the next or previous tab (the tab bar still works). */
function useSwipe(tabs: Tab[], tab: Tab, setTab: (t: Tab) => void, on: boolean) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  if (!on) return {};
  return {
    onTouchStart: (e: TouchEvent) => {
      const p = e.touches[0];
      const field = (e.target as Element | null)?.closest?.("input, select, textarea");
      start.current = e.touches.length === 1 && p && !field ? { x: p.clientX, y: p.clientY, t: performance.now() } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const from = start.current;
      start.current = null;
      const p = e.changedTouches[0];
      if (!from || !p) return;
      const dx = p.clientX - from.x;
      const dy = p.clientY - from.y;
      // Clearly sideways, far enough and quick: a flick, not a scroll that wandered.
      if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || performance.now() - from.t > 600) return;
      const next = tabs[tabs.indexOf(tab) + (dx < 0 ? 1 : -1)];
      if (next) setTab(next);
    },
  };
}

/** True on screens wide enough to show every pane side by side (see the 960px layout in styles.css). */
function useWide() {
  const query = typeof matchMedia === "function" ? matchMedia("(min-width: 960px)") : null;
  const [wide, setWide] = useState(!!query?.matches);
  useEffect(() => {
    if (!query) return;
    const change = () => setWide(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return wide;
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
            <TeamChip team={team} small={!big} mood={moodOf(v, seat)} />
            {!big && <span class="name">{seatName(v, seat)}</span>}
            <span class="num">{money(g.worth[seat])}</span>
            {big && (
              <small class="muted num cash">
                {t("cash")} {money(p.cash)}
              </small>
            )}
            {p.jail && <small class="tag">{t("inJail")}</small>}
            {p.out && <small class="tag">{t("out")}</small>}
            {team?.covered && <small class="tag">{t("covered")}</small>}
            {big && team && !team.bot && (
              <small class="muted members">
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
  // Newest first, and only as many lines as are shown.
  const lines: { id: number; text: string; party: boolean }[] = [];
  const ours = thisGame(v);
  for (let i = v.feed.length - 1; i >= 0 && lines.length < (n ?? 60); i--) {
    const f = v.feed[i];
    if (!ours(f)) break;
    const text = feedText(v, f);
    if (text) lines.push({ id: f.id, text, party: f.t === "party" });
  }
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

const die = (n: number) => "⚀⚁⚂⚃⚄⚅"[n - 1] ?? "";

/** Under the phone board: the last dice and what the table is waiting for. */
function BoardNote({ v }: { v: RoomView }) {
  const s = v.game!.s;
  return (
    <p class="boardnote">
      {s.dice[0] ? <span class="dice num">{`${die(s.dice[0])} ${die(s.dice[1])}`}</span> : null}
      <span>{pendingSummary(v)}</span>
    </p>
  );
}

/** "You've arrived": the city the player whose turn it is has just reached. */
export function Arrival({ v, big }: { v: RoomView; big?: boolean }) {
  const g = v.game!;
  const s = g.s;
  const seat = s.turn;
  const pos = s.ps[seat]?.pos ?? -1;
  const city = CITY_AT[pos];
  const wx = useWeather(city?.id);
  if (!city) return null;
  let land: { id: number; at: number } | null = null;
  for (let i = v.feed.length - 1; i >= 0 && !land; i--) {
    const f = v.feed[i];
    if (f.t === "game" && f.e.t === "land" && f.e.p === seat) land = { id: f.id, at: f.e.at };
  }
  if (!land || land.at !== pos) return null;
  const landId = land.id;
  const stamped = v.feed.some((f) => f.id >= landId && f.t === "game" && f.e.t === "stamp" && f.e.p === seat);
  const roll = rollBefore(v, seat, landId);
  const lang = getLang();
  return (
    <article class={`arrival${big ? " big" : ""}`} key={landId}>
      <div class="poster arrival-poster">
        <CityPoster id={city.id} />
      </div>
      <div class="arrival-text">
        <p class="arrival-who">
          <SeatChip v={v} seat={seat} small /> {roll && <MiniDice roll={roll} size={big ? 30 : 20} />} {t("arrivedIn")}
        </p>
        <h3>
          {tx(city.name)} <small>{lang === "zh" ? city.name.en : city.name.zh}</small>
        </h3>
        <p class="arrival-hello">
          <span lang="und">{city.greeting.text}</span>
          {city.greeting.roman && <i>{city.greeting.roman}</i>} · {tx(city.currency)}
          {wx && <span class="arrival-wx"> · {t("wxNow", { wx: weatherLabel(wx) })}</span>}
        </p>
        <p class="arrival-rule">
          <b>{tx(city.rule.title)}</b>
          {colon()}
          {tx(city.rule.text)}
        </p>
        {/* The real fact behind the rule, for the room to read. Not while the quiz is asking about this very city. */}
        {big && !(g.trivia?.open && g.trivia.city === city.id) && (
          <p class="arrival-fact">
            <b>{t("realBasis")}</b>
            {colon()}
            {tx(city.basis)} <small>{hostOf(city.source)}</small>
          </p>
        )}
      </div>
      {stamped && (
        <div class="arrival-stamp">
          <Stamp id={city.id} size={big ? 120 : 64} turn={-10} lang={lang} fresh />
        </div>
      )}
    </article>
  );
}

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

/** A party forfeit pops up on every phone for a few seconds (the toast never blocks a tap). */
function usePartyToasts(v: RoomView) {
  const last = useRef(lastId(v));
  useEffect(() => {
    for (const f of v.feed) {
      if (f.id <= last.current || f.t !== "party") continue;
      toast(`${t("partyTitle")} · ${seatName(v, f.seat)}${colon()}${dareText(f)}`, 9000);
      if (v.you.seats.includes(f.seat)) sfx.alert();
    }
    last.current = lastId(v) || last.current;
  });
}

/** Id of the newest feed item (0 if none). */
export const lastId = (v: RoomView) => (v.feed.length ? v.feed[v.feed.length - 1].id : 0);

/** Sounds on a phone: my turn, dice, money in and out. */
function usePhoneSounds(v: RoomView, myMove: boolean) {
  const g = v.game!;
  const ask = g.trivia?.open && g.trivia.answerFor !== null ? g.trivia.id : 0;
  const prev = useRef({ myMove, feed: lastId(v), cash: v.you.seats.map((x) => g.s.ps[x]?.cash ?? 0), ask });
  useEffect(() => {
    const p = prev.current;
    if (myMove && !p.myMove) {
      sfx.turn();
      buzz(BUZZ.turn);
    } else if (ask && ask !== p.ask) sfx.ask();
    const fresh = v.feed.filter((f) => f.id > p.feed);
    if (fresh.some((f) => f.t === "game" && f.e.t === "roll")) sfx.dice();
    if (fresh.some((f) => f.t === "game" && f.e.t === "roll" && v.you.seats.includes(f.e.p))) buzz(BUZZ.dice);
    if (fresh.some((f) => f.t === "game" && f.e.t === "news" && f.e.on)) sfx.news();
    // (with motion on, the touchdown plays the stamp in time with its own)
    if (reducedMotion() && fresh.some((f) => f.t === "game" && f.e.t === "stamp" && v.you.seats.includes(f.e.p))) sfx.stamp();
    const cash = v.you.seats.map((x) => g.s.ps[x]?.cash ?? 0);
    const delta = cash.reduce((a, b) => a + b, 0) - p.cash.reduce((a, b) => a + b, 0);
    if (delta > 0) {
      sfx.coin();
      buzz(BUZZ.paid);
    } else if (delta < 0) {
      sfx.pay();
      buzz(BUZZ.pay);
    }
    prev.current = { myMove, feed: lastId(v) || p.feed, cash, ask };
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
