import { useEffect, useRef, useState } from "preact/hooks";
import { BOARD, CITY_AT, type GameEvent } from "../../engine";
import type { FeedItem, RoomView } from "../../room/protocol";
import { Stamp } from "../art/stamps";
import { BUZZ, buzz } from "../controls";
import { colon, getLang, money, spaceName, t, tx } from "../i18n";
import { sfx } from "../sound";
import { getState, send, serverNow } from "../store";
import { Assets } from "./Assets";
import { Board, moodOf, reducedMotion, thisGame } from "./Board";
import { Btn, Countdown, Money, SeatChip, Sheet, TeamChip, hostOf, moneyOrHidden, seatName, teamOf, useCountdown } from "./common";
import { Decision, pendingSummary } from "./Decision";
import { feedText } from "./feedText";
import { ForfeitHold } from "./Forfeit";
import { FullscreenButton, FullscreenGuide } from "./Fullscreen";
import { CardFace, Cash, CoinFx, MiniDice, RollMoment, cardThisTurn, rollBefore, useFresh } from "./Moments";
import { NewsBanner } from "./News";
import { ArrivalLocal, LocalSong, NowPlaying } from "./Local";
import { ArrivalFrame } from "./Photo";
import { moveInPlay, planMove, rideEnd, rideLand, rideMode, rideReady, rideUrgent, useRide, type RidePlan } from "./ridePlan";
import { SettingsSheet } from "./Settings";
import { Touchdown } from "./Touchdown";
import { Trade } from "./Trade";
import { QuizPop, TriviaCard } from "./Trivia";
import { IdleNote, useIdleWarn } from "./TurnClock";
import { useWakeLock } from "../wake";
import { SpeedMeter } from "./SpeedMeter";
import { SambaLesson, useDanceClock } from "./Samba";
import { ReactBubbles, ReactButton } from "./Reactions";
import { WorldBanner, WorldCard } from "./World";

type Panel = "mine" | "trade" | "log";
/** The parts of the play window, in the order they stack (see `asks` in Game). */
type Part = "arrival" | "card" | "decision" | "news" | "world" | "trivia";

/**
 * A player's screen. The board is always there; what the team has to do comes up over it in a
 * window (the play window), and their cities, trades and the log open as sheets from the bar at the
 * bottom. Held sideways, the board fills the left of the screen and the window the right. A screen
 * wide enough for everything (a laptop) shows it all side by side.
 */
export function Game({ v }: { v: RoomView }) {
  const g = v.game!;
  const s = g.s;
  const [panel, setPanel] = useState<Panel | null>(null);
  const [menu, setMenu] = useState(false);
  const [fsGuide, setFsGuide] = useState(false);
  const mySeat = v.you.seats[0];
  const me = mySeat !== undefined ? s.ps[mySeat] : null;
  const myMove =
    v.you.seats.some((x) => g.mustAct.includes(x)) ||
    (!!g.auction && v.you.seats.length > 0) ||
    (!!g.quiz && v.you.seats.includes(g.quiz.visitor));
  // Something for this phone to answer in the play window: its move. (The waiting teams' quiz pops up
  // at the top of the screen by itself, QuizPop.)
  const needs = myMove;
  const incoming = g.trades.filter((o) => v.you.seats.includes(o.to)).length;
  // The team's own move plays on the board (ridePlan.ts): first-person, or flat. The decision window
  // and the money that changed hands come back with the stamp (sooner when the ride is skipped).
  const { plan: ride, done: rideDone } = useRide(v);
  const [readyKey, setReadyKey] = useState(0);
  const ready = !ride || readyKey === ride.key;
  const readyAt = ready ? 0 : rideReady(ride);
  useRerenderAt(readyAt);
  const riding = !!ride && !ready && serverNow() < readyAt;
  // (the arrival card, a poster, is drawn once the stamp is down: drawing it at the throw would hold
  // up the dice; the window it's in is put away until then anyway)
  const arriveAt = riding ? rideLand(ride) + 150 : 0;
  useRerenderAt(arriveAt);
  // Money changes hands with the decision window: this team's own ride's (sooner when it's skipped),
  // or with another team's, as its token lands here in step with the big screen.
  const playing = moveInPlay(v);
  const holdUntil = riding ? readyAt : playing && !v.you.seats.includes(playing.seat) ? playing.ready : 0;
  const myCash = useHeld(me?.cash ?? 0, holdUntil);
  const cashShown = useHeld(
    v.you.seats.reduce((a, x) => a + (s.ps[x]?.cash ?? 0), 0),
    holdUntil,
  );
  usePhoneSounds(v, myMove, cashShown, ride);
  useWakeLock(true);
  const myTeam = mySeat !== undefined ? teamOf(v, mySeat) : undefined;
  const wide = useWide();
  const play = usePlayWindow(needs, mySeat === undefined);
  // (on a ride the window steps aside, and comes back with whatever there is to answer: at once if
  // it's on a clock, while the ride gives way)
  const urgent = rideUrgent(v, ride);
  const open = wide || (play.open && (!riding || urgent));
  // Rio: the dancing team's phone shows the lesson full screen while it dances.
  const dance = useDanceClock(v);
  const dancingHere = !!dance && !dance.over && v.you.seats.includes(dance.seat);
  const toggle = (x: Panel) => setPanel((cur) => (cur === x ? null : x));
  // What this phone has to answer comes first in the window, above the arrival card and the turn's
  // card: on a phone the window is short, and a buy button under a poster is one nobody finds. Each
  // part is keyed, so it keeps its state (a half-made bid, a chosen option) as it moves. (The quiz here
  // is only the card for a phone it isn't for, to read: the one to answer pops up, QuizPop.)
  const parts: Record<Part, preact.JSX.Element> = {
    arrival: <Arrival key="arrival" v={v} after={arriveAt} />,
    card: <TurnCard key="card" v={v} />,
    decision: <Decision key="decision" v={v} />,
    news: <NewsBanner key="news" v={v} />,
    world: <WorldBanner key="world" v={v} />,
    trivia: <TriviaCard key="trivia" v={v} />,
  };
  const asks: Part[] = myMove ? ["decision", "arrival", "card", "world", "news", "trivia"] : ["arrival", "card", "decision", "world", "news", "trivia"];
  // A new question goes back to the top of the window, where it is (the player may have scrolled
  // down to read the arrival card during the last one).
  const playBody = useRef<HTMLDivElement>(null);
  const askKey = myMove ? `d${g.decision}` : "";
  useEffect(() => {
    if (askKey && playBody.current) playBody.current.scrollTop = 0;
  }, [askKey]);
  return (
    <div class={`game${myMove ? " my-move" : ""}${open ? " play-open" : ""}${ride ? " riding" : ""}`}>
      <header class="top">
        {me && myTeam ? (
          <>
            <TeamChip team={myTeam} />
            <span class="stat">
              <small>{t("cash")}</small>
              <Cash n={myCash} />
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
        <FullscreenButton onGuide={() => setFsGuide(true)} />
        <button type="button" class="menu-btn" onClick={() => setMenu(true)}>
          {t("menu")}
        </button>
      </header>
      <Banner v={v} onOpen={wide ? undefined : play.show} />
      <main class="stage" key="stage">
        <Board
          v={v}
          ride={ride}
          rideMode={rideMode(ride)}
          urgent={urgent}
          onRideReady={setReadyKey}
          onRideDone={rideDone}
          over={
            <>
              <JailFx v={v} ride={ride} />
              <ReactBubbles v={v} />
              <ReactButton v={v} hidden={!!ride} />
              <WorldCard v={v} />
            </>
          }
        />
        <BoardNote v={v} />
      </main>
      <aside class="side">
        <Standings v={v} until={holdUntil} />
        <Feed v={v} n={wide ? 12 : 3} />
      </aside>
      {/* Always built, open or not: a half-made choice survives a look at the board. */}
      <section class="playwin p-play" aria-label={t("tab_play")} data-open={open ? "1" : "0"} aria-hidden={open ? undefined : "true"}>
        {!wide && (
          <header class="playwin-head" {...play.drag}>
            <span class="playwin-grip" aria-hidden="true" />
            <b>{t("tab_play")}</b>
            <button type="button" class="playwin-x" aria-label={t("playHide")} onClick={play.hide}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </header>
        )}
        <div class="playwin-body" ref={playBody}>
          {asks.map((k) => parts[k])}
          {mySeat === undefined && <Bets v={v} />}
        </div>
      </section>
      {wide ? (
        <aside class="rail">
          {mySeat !== undefined ? <Assets v={v} seat={mySeat} /> : <Bets v={v} />}
          <Trade v={v} />
        </aside>
      ) : (
        <>
          <nav class="tabs">
            <button type="button" class="tab-play" aria-pressed={play.open} aria-expanded={play.open} onClick={play.toggle}>
              {t("tab_play")}
              {needs && !play.open && <i class="badge">1</i>}
            </button>
            <button type="button" aria-pressed={panel === "mine"} onClick={() => toggle("mine")}>
              {t("tab_mine")}
            </button>
            <button type="button" aria-pressed={panel === "trade"} onClick={() => toggle("trade")}>
              {t("tab_trade")}
              {incoming > 0 && <i class="badge">{incoming}</i>}
            </button>
            <button type="button" aria-pressed={panel === "log"} onClick={() => toggle("log")}>
              {t("tab_log")}
            </button>
          </nav>
          {panel === "mine" && (
            <Sheet title={t("tab_mine")} onClose={() => setPanel(null)}>
              <div class="p-mine">{mySeat !== undefined ? <Assets v={v} seat={mySeat} /> : <Bets v={v} />}</div>
            </Sheet>
          )}
          {/* (kept built while closed, like the play window: a half-made offer survives) */}
          <Sheet title={t("tab_trade")} onClose={() => setPanel(null)} hidden={panel !== "trade"}>
            <div class="p-trade">
              <Trade v={v} />
            </div>
          </Sheet>
          {panel === "log" && (
            <Sheet title={t("tab_log")} onClose={() => setPanel(null)}>
              <div class="p-log">
                <Feed v={v} />
              </div>
            </Sheet>
          )}
        </>
      )}
      {menu && <SettingsSheet v={v} onClose={() => setMenu(false)} />}
      {fsGuide && <FullscreenGuide onClose={() => setFsGuide(false)} />}
      {!ride && <RollMoment v={v} />}
      {dancingHere && <SambaLesson v={v} size="full" />}
      <CoinFx v={v} phone after={riding ? readyAt : 0} />
      <SpeedMeter />
      <TurnCall myMove={myMove} />
      <Touchdown v={v} after={rideEnd(ride)} />
      <LocalSong v={v} />
      <QuizPop v={v} />
      <ForfeitHold v={v} />
    </div>
  );
}

/**
 * A value as it was until `until` (server time), then as it is: a move's money shows with its
 * decision window. Re-renders at `until`.
 */
export function useHeld<T>(value: T, until: number): T {
  const before = useRef(value);
  const held = useRef<{ until: number; value: T } | null>(null);
  useRerenderAt(until);
  if (until > serverNow()) {
    if (held.current?.until !== until) held.current = { until, value: before.current };
  } else held.current = null;
  if (held.current) return held.current.value;
  before.current = value;
  return value;
}

/** Re-render at a server time (when a ride's decision window is due back, or its token lands). */
export function useRerenderAt(at: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const left = at - serverNow();
    if (left <= 0) return;
    const id = window.setTimeout(() => tick((x) => x + 1), left + 20);
    return () => clearTimeout(id);
  }, [at]);
}

/** Your turn: the edge of the screen glows for a moment (on a phone that can't buzz, this is the call). */
function TurnCall({ myMove }: { myMove: boolean }) {
  const [k, setK] = useState(0);
  const was = useRef(myMove);
  useEffect(() => {
    if (myMove && !was.current) setK((n) => n + 1);
    was.current = myMove;
  }, [myMove]);
  useEffect(() => {
    if (!k) return;
    const id = window.setTimeout(() => setK(0), 2000);
    return () => clearTimeout(id);
  }, [k]);
  return k ? <div class="turn-call" key={k} aria-hidden="true" /> : null;
}

/** Sent to Immigration without a ride (three doubles; a ride shows it itself): bars over the board. */
function JailFx({ v, ride }: { v: RoomView; ride: RidePlan | null }) {
  const hit = useFresh(v, (f: FeedItem) => (f.t === "game" && f.e.t === "jail" && v.you.seats.includes(f.e.p) ? f.e : null), 2000);
  if (!hit || ride) return null;
  return (
    <div class="jail-fx" key={hit.id} aria-hidden="true">
      <svg viewBox="0 0 120 120" class="bars">
        {[14, 38, 62, 86, 110].map((x) => (
          <rect key={x} x={x - 4} y="0" width="8" height="120" rx="4" />
        ))}
        <rect x="0" y="16" width="120" height="8" rx="4" />
      </svg>
      <b>{t("sentToImmigration")}</b>
    </div>
  );
}

/** The card your team drew this turn, until the turn passes (spectators see the team on turn's). */
function TurnCard({ v }: { v: RoomView }) {
  const card = cardThisTurn(v);
  if (!card || (v.you.seats.length > 0 && !v.you.seats.includes(card.x.p))) return null;
  return <CardFace v={v} card={card} />;
}

/**
 * The play window on a phone. It comes up by itself when there's something to answer, and goes away
 * again by itself a moment after the answer (unless the player opened it themselves, to watch).
 * The bar's Play button, the banner and a downward flick on its header open and close it.
 */
function usePlayWindow(needs: boolean, watching: boolean) {
  const [open, setOpen] = useState(needs || watching);
  const auto = useRef(needs);
  const was = useRef(needs);
  useEffect(() => {
    const before = was.current;
    was.current = needs;
    if (needs && !before) {
      auto.current = true;
      setOpen(true);
    } else if (!needs && before && auto.current) {
      // (a beat, so the next question of the same turn doesn't close and reopen it)
      const id = setTimeout(() => {
        auto.current = false;
        setOpen(false);
      }, 1800);
      return () => clearTimeout(id);
    }
  }, [needs]);
  const set = (x: boolean) => {
    auto.current = false;
    setOpen(x);
  };
  const start = useRef<{ y: number; t: number } | null>(null);
  return {
    open,
    show: () => set(true),
    hide: () => set(false),
    toggle: () => set(!open),
    drag: {
      onTouchStart: (e: TouchEvent) => {
        const p = e.touches[0];
        start.current = e.touches.length === 1 && p ? { y: p.clientY, t: performance.now() } : null;
      },
      onTouchEnd: (e: TouchEvent) => {
        const from = start.current;
        start.current = null;
        const p = e.changedTouches[0];
        if (from && p && p.clientY - from.y > 48 && performance.now() - from.t < 700) set(false);
      },
    },
  };
}

/**
 * True on screens with room for every part side by side (the laptop layout in styles.css). A phone
 * held sideways is wide but short, and keeps the board-and-window layout.
 */
function useWide() {
  const query = typeof matchMedia === "function" ? matchMedia("(min-width: 960px) and (min-height: 601px)") : null;
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

/** Top-of-screen line: whose turn, pause, the computer covering for us, connection trouble. On a
    phone, "your turn" is also the way into the play window. */
function Banner({ v, onOpen }: { v: RoomView; onOpen?: () => void }) {
  const g = v.game!;
  const st = getState();
  const idle = useIdleWarn(v);
  const myTeam = v.teams.find((x) => x.id === v.you.team);
  if (st.status === "reconnecting" || st.status === "connecting") return <p class="banner warn">{t("reconnecting")}</p>;
  if (g.paused) return <p class="banner">{t("paused")}</p>;
  if (myTeam && (myTeam.autoplay || myTeam.covered) && !v.settings.hotseat)
    return (
      <button type="button" class="banner warn" onClick={() => send({ t: "autoplay", on: false })}>
        {t("autoplayOn")}
      </button>
    );
  // The turn clock's last 15 seconds, for everyone.
  if (idle) return <IdleNote v={v} warn={idle} banner />;
  const mine = v.you.seats.includes(g.s.turn);
  // Another team's dice are rolling and its token is on the way.
  const move = mine ? null : planMove(v, [g.s.turn]);
  if (move && serverNow() < move.start + 3200) return <p class="banner">{t("rolling", { team: seatName(v, g.s.turn) })}</p>;
  if (mine && onOpen)
    return (
      <button type="button" class="banner me" onClick={onOpen}>
        {t("yourTurn")}
      </button>
    );
  return <p class={`banner${mine ? " me" : ""}`}>{mine ? t("yourTurn") : t("turnOf", { team: seatName(v, g.s.turn) })}</p>;
}

export function Standings({ v, big, until }: { v: RoomView; big?: boolean; until?: number }) {
  const g = v.game!;
  const s = g.s;
  // (what a move did to the teams shows with its decision window, while its token is on the way)
  const hold = until ?? moveInPlay(v)?.ready ?? 0;
  const ps = useHeld(s.ps, hold);
  const worth = useHeld(g.worth, hold);
  const list = (
    <ul class={`standings${big ? " big" : ""}`}>
      {ps.map((p, seat) => {
        const team = teamOf(v, seat);
        return (
          <li key={seat} class={`${seat === s.turn ? "turn" : ""}${p.out ? " out" : ""}`}>
            <TeamChip team={team} small={!big} mood={moodOf(v, seat)} />
            {!big && <span class="name">{seatName(v, seat)}</span>}
            <span class="num">{moneyOrHidden(worth[seat])}</span>
            {big && (
              <small class="muted num cash">
                {t("cash")} {moneyOrHidden(p.cash)}
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
  if (!v.settings.hideCash || s.over) return list;
  return (
    <>
      {list}
      <p class="hint cash-note">{t("cashHiddenNote")}</p>
    </>
  );
}

export function Feed({ v, n }: { v: RoomView; n?: number }) {
  // A move's lines wait for its token to land: where it lands is the stamp's to tell.
  const playing = moveInPlay(v);
  useRerenderAt(playing?.land ?? 0);
  const held = playing && serverNow() < playing.land ? playing.key : Infinity;
  // Newest first, and only as many lines as are shown.
  const lines: { id: number; text: string; party: boolean }[] = [];
  const ours = thisGame(v);
  for (let i = v.feed.length - 1; i >= 0 && lines.length < (n ?? 60); i--) {
    const f = v.feed[i];
    if (f.id >= held) continue;
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

/** Under the phone board: the last dice and what the table is waiting for (while a token is on the
 * way, the dice once they settle, and the rest once it lands). */
function BoardNote({ v }: { v: RoomView }) {
  const s = v.game!.s;
  const playing = moveInPlay(v);
  const now = serverNow();
  const settled = !playing || now >= playing.dice;
  const landed = !playing || now >= playing.land;
  useRerenderAt(playing ? (settled ? playing.land : playing.dice) : 0);
  return (
    <p class="boardnote">
      {s.dice[0] && settled ? <span class="dice num">{`${die(s.dice[0])} ${die(s.dice[1])}`}</span> : null}
      <span>{landed ? pendingSummary(v) : ""}</span>
    </p>
  );
}

/** "You've arrived": the city the player whose turn it is has just reached (on the big screen, once
 * its token has: `after`, server time). */
export function Arrival({ v, big, after = 0 }: { v: RoomView; big?: boolean; after?: number }) {
  const g = v.game!;
  const s = g.s;
  const seat = s.turn;
  const pos = s.ps[seat]?.pos ?? -1;
  const city = CITY_AT[pos];
  if (!city || after > serverNow()) return null;
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
      <ArrivalFrame id={city.id} big={big} />
      <div class="arrival-text">
        <p class="arrival-who">
          <SeatChip v={v} seat={seat} small /> {roll && <MiniDice roll={roll} size={big ? 30 : 20} />} {t("arrivedIn")}
        </p>
        <h3>
          {tx(city.name)} <small>{lang === "zh" ? city.name.en : city.name.zh}</small>
        </h3>
        <ArrivalLocal v={v} city={city.id} land={landId} seat={seat} big={big} />
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
      {/* (on the big screen it has a place of its own: TvNowPlaying) */}
      {!big && <NowPlaying v={v} land={landId} />}
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

/** Id of the newest feed item (0 if none). */
export const lastId = (v: RoomView) => (v.feed.length ? v.feed[v.feed.length - 1].id : 0);

/**
 * Sounds and buzzes on a phone: my turn, the dice, money in and out (when it shows: a ride's money when
 * the token lands), and the big moments for my team: a city bought, a card drawn, sent to
 * Immigration, an auction, a trade offer, going broke. A phone that can't vibrate (an iPhone) gets
 * the sounds and what's on screen.
 */
function usePhoneSounds(v: RoomView, myMove: boolean, cash: number, ride: RidePlan | null) {
  const g = v.game!;
  const ask = g.trivia?.open && g.trivia.answerFor !== null ? g.trivia.id : 0;
  const offers = g.trades.filter((o) => v.you.seats.includes(o.to)).length;
  const prev = useRef({ myMove, feed: lastId(v), cash, ask, offers, auction: !!g.auction });
  useEffect(() => {
    const p = prev.current;
    const mine = (seat: number | null) => seat !== null && v.you.seats.includes(seat);
    if (myMove && !p.myMove) {
      sfx.turn();
      buzz(g.auction && !p.auction ? BUZZ.auction : BUZZ.turn);
    } else if (ask && ask !== p.ask) {
      sfx.ask();
      buzz(BUZZ.tap);
    }
    const ev = v.feed.filter((f) => f.id > p.feed).flatMap((f) => (f.t === "game" ? [f.e] : []));
    // (our own throw clacks and lands in the ride; another team's rattles here)
    const myRoll = ev.some((e) => e.t === "roll" && mine(e.p));
    if (ev.some((e) => e.t === "roll") && !(myRoll && ride)) sfx.dice();
    if (ev.some((e) => e.t === "news" && e.on)) sfx.news();
    // (with motion on, the touchdown plays the stamp in time with its own)
    if (reducedMotion() && ev.some((e) => e.t === "stamp" && mine(e.p))) sfx.stamp();
    const bought = ev.some((e) => (e.t === "buy" && mine(e.p)) || (e.t === "auction" && mine(e.winner)));
    if (bought) {
      sfx.stamp();
      buzz(BUZZ.buy);
    }
    // (on a ride these come as the token gets there)
    if (!ride && ev.some((e) => e.t === "card" && mine(e.p))) {
      sfx.card();
      buzz(BUZZ.card);
    }
    if (!ride && ev.some((e) => e.t === "jail" && mine(e.p))) {
      sfx.jail();
      buzz(BUZZ.jail);
    }
    if (ev.some((e) => e.t === "bankrupt" && mine(e.p))) buzz(BUZZ.alarm);
    if (offers > p.offers) {
      sfx.ask();
      buzz(BUZZ.offer);
    }
    const delta = cash - p.cash;
    if (delta > 0) {
      sfx.coin();
      buzz(BUZZ.paid);
    } else if (delta < 0 && !bought) {
      sfx.pay();
      buzz(BUZZ.pay);
    }
    prev.current = { myMove, feed: lastId(v) || p.feed, cash, ask, offers, auction: !!g.auction };
  });
}

export { Countdown };
