// The first-person touchdown: the first time a team reaches a city (its new passport stamp), look out
// of the plane window, come down through the clouds and arrive. The city fills the view, the greeting
// and the real local time come up, the city's sound plays and the stamp comes down. On the big screen
// for every team; on a phone only for its own team. Tap to skip; reduced motion skips it (the arrival
// card still shows). It never covers a decision on a clock: if an auction, Shanghai's quiz, Seoul's
// silence or a table vote comes up, it gives way. The timing lives in styles.css (.touchdown), scaled
// by --k on phones.
import { useEffect, useRef, useState } from "preact/hooks";
import { CITIES } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { weatherKind } from "../../room/weather";
import { localClock } from "../art/places";
import { CityPoster } from "../art/posters";
import { Stamp } from "../art/stamps";
import { getLang, t, tx } from "../i18n";
import { sfx } from "../sound";
import { serverNow } from "../store";
import { useWeather, weatherLabel } from "../weather";
import { latestFlight, reducedMotion } from "./Board";
import { SeatChip } from "./common";

interface Landing {
  id: number;
  /** Server time of the stamp. */
  at: number;
  seat: number;
  city: string;
}

/** A landing older than this (a phone back from the lock screen, a reconnect) isn't replayed. */
const STALE = 4000;

/** The newest first visit (a new passport stamp) by one of these seats, or by anyone. */
function latestStamp(v: RoomView, seats: number[] | null): Landing | null {
  for (let i = v.feed.length - 1; i >= 0; i--) {
    const f = v.feed[i];
    if (f.t === "game" && f.e.t === "stamp" && (!seats || seats.includes(f.e.p))) return { id: f.id, at: f.at, seat: f.e.p, city: f.e.city };
  }
  return null;
}

/** Something is up on a clock: an auction, Shanghai's quiz, Seoul's silence or a table vote; and on a
 * phone (`mine`), a waiting players' question this phone can still answer. */
export function onClock(v: RoomView, mine = false): boolean {
  const g = v.game;
  if (!g) return false;
  const now = serverNow();
  const question = mine && !!g.trivia?.open && g.trivia.answerFor !== null;
  return !!g.auction || !!g.quiz || (g.silenceUntil ?? 0) > now || (g.deadline ?? 0) > now || question;
}

/** Whether the landing's team has thrown the dice again since. */
const threwSince = (v: RoomView, land: Landing) => v.feed.some((f) => f.id > land.id && f.t === "game" && f.e.t === "roll" && f.e.p === land.seat);

/** Big screen: the whole scene is 5.2 s. Phones run the same timeline at this speed. */
const PHONE = 0.68;

export function Touchdown({ v, big }: { v: RoomView; big?: boolean }) {
  const land = latestStamp(v, big ? null : v.you.seats);
  // A landing from before this page opened isn't replayed.
  const seen = useRef(land?.id ?? 0);
  const timers = useRef<number[]>([]);
  const [show, setShow] = useState<Landing | null>(null);
  // The newest view, for the timers below.
  const latest = useRef(v);
  latest.current = v;
  const clocked = onClock(v, !big);
  // The real weather there right now (live, from Open-Meteo through the game's server), if known.
  const wx = useWeather(show?.city ?? land?.city);
  const wxNow = useRef(wx);
  wxNow.current = wx;
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShow(null);
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (!land || land.id <= seen.current) return;
    seen.current = land.id;
    // One at a time: a landing while another is showing just gets its arrival card.
    if (timers.current.length || reducedMotion() || serverNow() - land.at > STALE) return;
    const k = big ? 1 : PHONE;
    const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
    // On a phone, the city's sound only plays when there's no big screen in the room to play it.
    const loud = big || !v.members.some((m) => m.role === "screen" && m.online);
    // Let the dice land and the token finish walking first, and on the big screen let the plane land
    // if it flew here from another region (the flight is keyed by the landing, just before the stamp).
    const flight = latestFlight(v);
    const flew = !!flight && land.id - Number(flight.key) >= 1 && land.id - Number(flight.key) <= 3;
    // (On a phone the team's own throw is up for 1.7 s: the scene starts once it's gone.)
    const lead = !big ? 1800 : flew ? 3300 : 2000;
    later(lead, () => {
      // The game moved on while the dice were up (a clock came up, or the team threw again): no scene.
      if (onClock(latest.current, !big) || threwSince(latest.current, land)) return stop();
      setShow(land);
      if (loud) sfx.cabin();
    });
    if (loud) {
      later(lead + 1350 * k, () => sfx.descent());
      later(lead + 1500 * k, () => wxNow.current && sfx.weather(weatherKind(wxNow.current.code)));
      later(lead + 2100 * k, () => sfx.city(land.city));
    }
    later(lead + 3000 * k, () => sfx.stamp());
    later(lead + 5200 * k, stop);
  }, [land?.id]);
  // A decision on a clock came up (the team passed on a city and it went to auction, or landed on
  // Shanghai's quiz): give way to it, sounds and all.
  useEffect(() => {
    if (clocked) stop();
  }, [clocked]);
  // The team throws again (doubles, or the computer playing for it): the game has moved on.
  const rolledAgain = !!show && threwSince(v, show);
  useEffect(() => {
    if (rolledAgain) stop();
  }, [rolledAgain]);

  // (Gone in the same frame as the new dice or the clock, not one frame later.)
  if (!show || rolledAgain || clocked) return null;
  const city = CITIES.find((c) => c.id === show.city);
  if (!city) return null;
  const clock = localClock(city.id, serverNow());
  const kind = wx ? weatherKind(wx.code) : null;
  const lang = getLang();
  return (
    <div
      class={`touchdown${big ? " big" : ""} sky-${clock?.sky ?? "day"}${kind ? ` wx-${kind}` : ""}`}
      key={show.id}
      role="dialog"
      aria-label={tx(city.name)}
      onClick={stop}
    >
      <div class="td-view">
        <div class="td-sky" />
        <div class="td-city">
          <div class="td-push">
            <div class="poster">
              <CityPoster id={city.id} />
            </div>
          </div>
          <div class="td-stamp">
            <Stamp id={city.id} size={big ? 170 : 104} turn={-12} lang={lang} />
          </div>
        </div>
        <div class="td-clouds">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        {kind && kind !== "clear" && kind !== "cloudy" && kind !== "overcast" && <div class={`td-weather ${kind}`} />}
      </div>
      <div class="td-wall">
        <div class="td-frame" />
      </div>
      <div class="td-caption">
        <p class="td-who">
          <SeatChip v={v} seat={show.seat} small /> {t("touchdownFirst")}
        </p>
        <h2>
          {tx(city.name)} <small>{lang === "zh" ? city.name.en : city.name.zh}</small>
        </h2>
        <p class="td-hello">
          <span lang="und">{city.greeting.text}</span>
          {city.greeting.roman && <i>{city.greeting.roman}</i>}
        </p>
        <p class="td-meta">
          {clock && `${t("localTime", { time: clock.time })} · `}
          {wx && `${weatherLabel(wx)} · `}
          {tx(city.currency)}
        </p>
      </div>
    </div>
  );
}
