// The big screen (TV or laptop): the board, everyone's standing, and how to join. No controls.
import { useEffect, useRef } from "preact/hooks";
import type { RoomView } from "../../room/protocol";
import { money, spaceName, t } from "../i18n";
import { sfx } from "../sound";
import { Board, latestFlight } from "./Board";
import { CityPoster } from "../art/posters";
import { Countdown, TEAM_COLORS, TEAM_LETTERS, TeamFace, seatName, teamLabel } from "./common";
import { quizItemText } from "./feedText";
import { Arrival, Clock, Feed, Over, Standings, lastId } from "./Game";
import { Qr, joinUrl } from "./Lobby";

export function Screen({ v }: { v: RoomView }) {
  useScreenSounds(v);
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
        <h1>{t("title")}</h1>
        <div class="join-tv">
          <Qr text={joinUrl(v.code)} size={260} />
          <div>
            <p class="muted">{t("room")}</p>
            <p class="code num">{v.code}</p>
            <p>{t("scanToJoin", { host: location.host })}</p>
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
      </main>
    );
  if (v.phase === "over") return <Over v={v} />;
  const g = v.game!;
  return (
    <main class="screen">
      <div class="tv-board">
        <Board v={v} big center={TvCenter({ v })} />
      </div>
      <aside class="tv-side">
        <div class="tv-head">
          <Clock v={v} />
          <span class="code num">
            {t("room")} {v.code}
          </span>
          <Qr text={joinUrl(v.code)} size={84} />
        </div>
        {g.paused && <p class="banner">{t("paused")}</p>}
        <Arrival v={v} big />
        <h2 class="departures">{t("departures")}</h2>
        <Standings v={v} big />
        {g.bets && (
          <p class="muted">
            {t("betQuestion", { team: seatName(v, g.bets.seat) })} {t("betOdds", { yes: g.bets.yes, no: g.bets.no })}
          </p>
        )}
        <Feed v={v} n={8} />
      </aside>
    </main>
  );
}

function TvCenter({ v }: { v: RoomView }) {
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
  return null;
}

function useScreenSounds(v: RoomView) {
  const last = useRef(lastId(v));
  useEffect(() => {
    const fresh = v.feed.filter((f) => f.id > last.current);
    last.current = lastId(v) || last.current;
    if (!fresh.length) return;
    const flight = latestFlight(v);
    if (flight && fresh.some((f) => f.id === flight.key)) sfx.flight();
    if (fresh.some((f) => f.t === "party" || f.t === "timeup")) sfx.alert();
    else if (fresh.some((f) => f.t === "game" && f.e.t === "roll")) sfx.dice();
    else if (fresh.some((f) => f.t === "game" && (f.e.t === "buy" || f.e.t === "auction"))) sfx.coin();
    else if (fresh.some((f) => f.t === "game" && f.e.t === "stamp")) sfx.stamp();
  });
}
