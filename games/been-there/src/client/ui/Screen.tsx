// The big screen (TV or laptop): the board, everyone's standing, and how to join. No controls.
// Every team's move plays here too, in step with the thrower's phone (ridePlan.ts): the dice, a
// small push in after the token, the departures board flipping up the cities it passes, the stamp.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { RoomView } from "../../room/protocol";
import { money, spaceName, t, type Key } from "../i18n";
import { audioReady, isMuted, sfx } from "../sound";
import { serverNow } from "../store";
import { useWakeLock } from "../wake";
import { Board, latestFlight, reducedMotion } from "./Board";
import { CityPoster } from "../art/posters";
import { Countdown, GameTitle, SeatChip, TEAM_COLORS, TEAM_LETTERS, TeamFace, seatName, teamLabel } from "./common";
import { Departures } from "./Departures";
import { dareText, quizItemText, recentParty } from "./feedText";
import { Over } from "./Finale";
import { Arrival, Clock, Feed, Standings, lastId, useRerenderAt } from "./Game";
import { joinUrl, tableFrom } from "../base";
import { Qr } from "./Lobby";
import { CardFace, CoinFx, TvDice, useFreshCard } from "./Moments";
import { NewsBanner } from "./News";
import { rowsOf } from "./Ride";
import { rideEnd, rideLand, rideReady, useTableMove, type RidePlan } from "./ridePlan";
import { SambaLesson, useDanceClock } from "./Samba";
import { Touchdown } from "./Touchdown";
import { Trivia } from "./Trivia";

export function Screen({ v }: { v: RoomView }) {
  // (a TV left on the board shouldn't go dark between turns)
  useWakeLock(true);
  const table = tableFrom(v);
  if (v.phase === "lobby")
    return (
      <main class="screen lobby-tv">
        <div class="tv-posters" aria-hidden="true">
          {["venice", "tokyo", "rio", "capetown", "hongkong"].map((id) => (
            <div key={id} class="poster">
              <CityPoster id={id} />
            </div>
          ))}
        </div>
        <GameTitle />
        <div class="join-tv">
          <Qr text={joinUrl(v.code, table)} size={260} />
          <div>
            <p class="muted">{table ? t("tableCode") : t("room")}</p>
            <p class={table ? "code tablecode" : "code num"}>{table ?? v.code}</p>
            <p>{t(table ? "scanToJoinTable" : "scanToJoin", { host: location.host })}</p>
          </div>
        </div>
        <ul class="teams tv">
          {v.teams.map((team) => (
            <li key={team.id} style={{ "--team": TEAM_COLORS[team.color] }}>
              <TeamFace color={team.color} size={56} mood="happy" />
              <span class="letter">{TEAM_LETTERS[team.color]}</span>
              <b>{teamLabel(team)}</b>
              <small class="muted">
                {team.members
                  .map((id) => v.members.find((m) => m.id === id)?.name)
                  .filter(Boolean)
                  .join("、")}
              </small>
            </li>
          ))}
        </ul>
        <SoundHint />
      </main>
    );
  if (v.phase === "over") return <Over v={v} big />;
  return <TvGame v={v} />;
}

/** When a move's card turns over (server time): on the space where the token waits for it to send it
 * on, or where it lands. 0 if the move drew none. */
function cardShowAt(m: RidePlan | null): number {
  if (!m) return 0;
  if (m.cardId) return m.start + (rowsOf(m).find((r) => r.kind === "card")?.at ?? m.t.land);
  return m.card ? m.start + m.t.land : 0;
}

function TvGame({ v }: { v: RoomView }) {
  const g = v.game!;
  const table = tableFrom(v);
  const { plan: move, done } = useTableMove(v);
  // (the latest move, played or playing: its dice, card and sounds aren't shown twice)
  const lastMove = useRef<RidePlan | null>(null);
  if (move) lastMove.current = move;
  useScreenSounds(v, move);
  const card = useFreshCard(v, cardShowAt(lastMove.current));
  // The arrival card comes up when the token lands.
  const landAt = move ? rideLand(move) : 0;
  useRerenderAt(landAt);
  const dance = useDanceClock(v);
  return (
    <main class="screen">
      <div class="tv-board">
        <Board
          v={v}
          big
          globe
          center={TvCenter({ v, card })}
          over={<TvDice v={v} played={lastMove.current} />}
          ride={move}
          rideMode="tv"
          onRideDone={done}
        />
        {dance && <SambaLesson v={v} size="tv" />}
      </div>
      <aside class={`tv-side${g.trivia ? " quiz-up" : ""}`}>
        <div class="tv-head">
          <Clock v={v} />
          <span class={table ? "code tablecode" : "code num"}>
            {table ? t("tableCode") : t("room")} {table ?? v.code}
          </span>
          <Qr text={joinUrl(v.code, table)} size={84} />
        </div>
        {g.paused && <p class="banner">{t("paused")}</p>}
        {/* What's happening now, and the table (standings and log): side by side where the screen is
            wide enough, one under the other where it isn't. The log takes whatever room is left. */}
        <div class="tv-cols">
          <FitColumn class="tv-now">
            <Departures v={v} move={move} />
            <Arrival v={v} big after={landAt} />
            <NewsBanner v={v} big />
            <Trivia v={v} big />
          </FitColumn>
          <div class="tv-table">
            <h2 class="departures">{t("departures")}</h2>
            <Standings v={v} big />
            {g.bets && (
              <p class="muted">
                {t("betQuestion", { team: seatName(v, g.bets.seat) })} {t("betOdds", { yes: g.bets.yes, no: g.bets.no })}
              </p>
            )}
            <Feed v={v} n={12} />
          </div>
        </div>
      </aside>
      <CoinFx v={v} after={rideReady(move)} />
      <Touchdown v={v} big after={rideEnd(move)} />
      <SoundHint />
    </main>
  );
}

/**
 * A TV or laptop opened straight on the board can't play a sound until someone touches it (the
 * browser's rule): a quiet line says so, until a tap or a key press on the remote.
 */
function SoundHint() {
  const [, tick] = useState(0);
  const quiet = !isMuted() && !audioReady();
  useEffect(() => {
    if (!quiet) return;
    const check = () => window.setTimeout(() => tick((n) => n + 1), 150);
    document.addEventListener("pointerdown", check, { passive: true });
    document.addEventListener("keydown", check);
    return () => {
      document.removeEventListener("pointerdown", check);
      document.removeEventListener("keydown", check);
    };
  }, [quiet]);
  return quiet ? <p class="sound-hint">{t("soundTap")}</p> : null;
}

/**
 * A column of cards that shrinks them when they'd run off the bottom (nobody scrolls a TV): an arrival
 * card, the news and a question can be taller than a smaller screen, in English especially. They're
 * laid out wider by the same factor, so the text wraps into fewer lines rather than getting squeezed.
 */
function FitColumn({ class: cls, children }: { class: string; children: ComponentChildren }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      i.classList.remove("shrunk");
      const room = o.clientHeight;
      const need = i.offsetHeight;
      if (room > 0 && need > room) {
        i.style.setProperty("--fit", (room / need).toFixed(3));
        i.classList.add("shrunk");
      }
    };
    // Straight away, before the change is painted, so a card never shows cut off. (Both observers report
    // before the next paint; fit() changes only a class and a style, which neither of them watches.)
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    const mo = new MutationObserver(fit);
    mo.observe(i, { childList: true, subtree: true, characterData: true });
    void document.fonts?.ready.then(fit);
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return (
    <div class={cls} ref={outer}>
      <div class="fit" ref={inner}>
        {children}
      </div>
    </div>
  );
}

function TvCenter({ v, card }: { v: RoomView; card: ReturnType<typeof useFreshCard> }) {
  const g = v.game!;
  if (g.auction)
    return (
      <div class="boardcenter big">
        <p class="pending">{t("auction", { space: spaceName(g.auction.at) })}</p>
        <p class="huge num">{g.auction.price ? money(g.auction.price) : "$10"}</p>
        <p>{g.auction.leader !== null ? seatName(v, g.auction.leader) : t("auctionNone")}</p>
        <Countdown until={g.auction.endsAt} label="soldIn" />
      </div>
    );
  if (g.quiz)
    return (
      <div class="boardcenter big">
        <p class="pending">{t("quizWatch", { team: seatName(v, g.quiz.visitor), item: quizItemText(g.quiz.item) })}</p>
        <Countdown until={g.quiz.endsAt} />
      </div>
    );
  if (g.silenceUntil && g.silenceUntil > v.now)
    return (
      <div class="boardcenter big">
        <p class="pending">🤫 {t("silenceTitle")}</p>
        <Countdown until={g.silenceUntil} />
        <small class="muted">{t("silencePull")}</small>
      </div>
    );
  const party = recentParty(v);
  if (party)
    return (
      <div class="boardcenter big party-card" key={party.id}>
        <p class="pass-strip">
          <span>{t("partyTitle")}</span>
          <span>{t(`party_${party.why}` as Key)}</span>
        </p>
        <SeatChip v={v} seat={party.seat} />
        <p class="party-dare">{dareText(party)}</p>
      </div>
    );
  if (card) return <CardFace v={v} card={card} big />;
  return null;
}

/** The big screen's sounds. What a move brings sounds when its token gets there: the plane once it
 * has landed, money with the stamp. The move itself (the dice settling, each space, the stamp) is the
 * ride's. A new turn is the airport chime: the next team's boarding call. */
function useScreenSounds(v: RoomView, move: RidePlan | null) {
  const last = useRef(lastId(v));
  const asked = useRef(v.game?.trivia?.id ?? 0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const tv = v.game?.trivia;
    if (tv && tv.id !== asked.current) {
      asked.current = tv.id;
      sfx.ask();
    }
    const fresh = v.feed.filter((f) => f.id > last.current);
    last.current = lastId(v) || last.current;
    if (!fresh.length) return;
    const at = (when: number, play: () => void) => {
      const wait = when - serverNow();
      if (wait > 30) timers.current.push(window.setTimeout(play, wait));
      else play();
    };
    const flight = latestFlight(v);
    if (flight && fresh.some((f) => f.id === flight.key)) at(rideEnd(move), sfx.flight);
    if (fresh.some((f) => f.t === "game" && f.e.t === "news" && f.e.on)) sfx.news();
    if (fresh.some((f) => f.t === "game" && f.e.t === "turn")) sfx.turn();
    if (fresh.some((f) => f.t === "party" || f.t === "timeup")) sfx.alert();
    else if (fresh.some((f) => f.t === "game" && f.e.t === "roll")) sfx.dice();
    else if (fresh.some((f) => f.t === "game" && (f.e.t === "buy" || f.e.t === "auction" || f.e.t === "bonus"))) at(rideReady(move), sfx.coin);
    else if (reducedMotion() && fresh.some((f) => f.t === "game" && f.e.t === "stamp")) sfx.stamp();
  });
}
