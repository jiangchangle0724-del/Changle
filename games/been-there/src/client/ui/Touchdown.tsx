// The first-person touchdown: the first time a team reaches a city (its new passport stamp), look out
// of the plane window, come down through the clouds and arrive. The city fills the view, the greeting
// and the real local time come up, the city's sound plays and the stamp comes down. On the big screen
// for every team; on a phone only for its own team. Tap to skip; reduced motion skips it (the arrival
// card still shows). The timing lives in styles.css (.touchdown), scaled by --k on phones.
import { useEffect, useRef, useState } from "preact/hooks";
import { CITIES } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { localClock } from "../art/places";
import { CityPoster } from "../art/posters";
import { Stamp } from "../art/stamps";
import { getLang, t, tx } from "../i18n";
import { sfx } from "../sound";
import { serverNow } from "../store";
import { reducedMotion } from "./Board";
import { SeatChip } from "./common";

interface Landing {
  id: number;
  seat: number;
  city: string;
}

/** The newest first visit (a new passport stamp) by one of these seats, or by anyone. */
function latestStamp(v: RoomView, seats: number[] | null): Landing | null {
  for (let i = v.feed.length - 1; i >= 0; i--) {
    const f = v.feed[i];
    if (f.t === "game" && f.e.t === "stamp" && (!seats || seats.includes(f.e.p))) return { id: f.id, seat: f.e.p, city: f.e.city };
  }
  return null;
}

/** Big screen: the whole scene is 5.2 s. Phones run the same timeline at this speed. */
const PHONE = 0.68;

export function Touchdown({ v, big }: { v: RoomView; big?: boolean }) {
  const land = latestStamp(v, big ? null : v.you.seats);
  // A landing from before this page opened isn't replayed.
  const seen = useRef(land?.id ?? 0);
  const timers = useRef<number[]>([]);
  const [show, setShow] = useState<Landing | null>(null);
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
    if (timers.current.length || reducedMotion()) return;
    const k = big ? 1 : PHONE;
    const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
    // On a phone, the city's sound only plays when there's no big screen in the room to play it.
    const loud = big || !v.members.some((m) => m.role === "screen" && m.online);
    // Let the token finish walking (and the plane flying) first.
    const lead = big ? 1400 : 600;
    later(lead, () => {
      setShow(land);
      if (loud) sfx.cabin();
    });
    if (loud) {
      later(lead + 1350 * k, () => sfx.descent());
      later(lead + 2100 * k, () => sfx.city(land.city));
    }
    later(lead + 3000 * k, () => sfx.stamp());
    later(lead + 5200 * k, stop);
  }, [land?.id]);

  if (!show) return null;
  const city = CITIES.find((c) => c.id === show.city);
  if (!city) return null;
  const clock = localClock(city.id, serverNow());
  const lang = getLang();
  return (
    <div class={`touchdown${big ? " big" : ""} sky-${clock?.sky ?? "day"}`} key={show.id} role="dialog" aria-label={tx(city.name)} onClick={stop}>
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
          {tx(city.currency)}
        </p>
      </div>
    </div>
  );
}
