import type { ComponentChildren, VNode } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { BOARD, CITY_AT, ROUTES, SERVICES, groupAt, priceOf, rentAt, type GameEvent } from "../../engine";
import type { FeedItem, RoomView } from "../../room/protocol";
import type { Mood } from "../art/characters";
import { Dice } from "../art/dice";
import { RoundBoard, TOKEN_R, angleOf, xy, type Rig, type SpaceMark, type TokenMark } from "../art/RoundBoard";
import type { Flight } from "../art/RouteMap";
import { colon, groupName, money, spaceName, t, tx } from "../i18n";
import { GroupIcon, Money, SeatChip, Sheet, TEAM_COLORS, TEAM_LETTERS, teamOf } from "./common";
import { GlobeLayer } from "./GlobeLayer";
import { currentNews, newsTag } from "./News";
import { reducedMotion } from "../motion";
import { serverNow } from "../store";
import { SheetFrame } from "./Photo";
import { LandStamp, Ride } from "./Ride";
import { ridesOn, walkOf, type RidePlan } from "./ridePlan";
import { useThrowing } from "./throwing";

export { reducedMotion };

/** How a token looks right now, from the latest thing that happened to its team. */
export function moodOf(v: RoomView, seat: number): Mood {
  const s = v.game!.s;
  if (s.ps[seat]?.out) return "sad";
  const recent = v.feed.slice(-10).filter(thisGame(v));
  for (let i = recent.length - 1; i >= 0; i--) {
    const f = recent[i];
    if (f.t !== "game") continue;
    const e = f.e;
    switch (e.t) {
      case "rent":
        if (e.p === seat) return "shock";
        if (e.to === seat) return "smug";
        break;
      case "pay":
      case "debt":
        if (e.p === seat) return "shock";
        break;
      case "buy":
      case "passport":
        if (e.p === seat) return "happy";
        break;
      case "auction":
        if (e.winner === seat) return "happy";
        break;
      case "card":
        if (e.p === seat) return "curious";
        break;
      case "jail":
      case "bankrupt":
        if (e.p === seat) return "sad";
        break;
      case "manage":
        if (e.p === seat && e.k === "build") return "happy";
        break;
    }
  }
  return "idle";
}

/** Feed items from this game: after a rematch the room's feed still holds the last game's end. */
export const thisGame = (v: RoomView) => (f: FeedItem) => !v.game || f.at >= v.game.startedAt;

/** The latest flight: a token reaching a city in a different region from the last city it visited. */
export function latestFlight(v: RoomView): Flight | null {
  const lands = v.feed.filter((f) => f.t === "game" && f.e.t === "land" && CITY_AT[(f.e as { at: number }).at]).filter(thisGame(v)) as {
    id: number;
    e: Extract<GameEvent, { t: "land" }>;
  }[];
  const last = lands[lands.length - 1];
  if (!last) return null;
  const to = CITY_AT[last.e.at]!;
  // The engine names the city the team came from; a game saved before it did is looked up in the feed.
  let from = last.e.from === undefined ? undefined : CITY_AT[last.e.from];
  for (let i = lands.length - 2; i >= 0 && last.e.from === undefined; i--) {
    if (lands[i].e.p !== last.e.p) continue;
    from = CITY_AT[lands[i].e.at];
    break;
  }
  return from && from.group !== to.group ? { from: from.id, to: to.id, key: last.id } : null;
}

/**
 * Which space the table turns where. A phone with first-person moves keeps its own token at
 * 9 o'clock, where its camera pushes in (so its turn starts without the table turning, and a ride
 * ends where the table rests). With reduced motion, or the setting off, a phone's table never
 * turns. The big screen (and a phone with no team) turns the team on turn to the bottom when the
 * turn passes, not while a token is walking.
 */
function useFocus(v: RoomView, tv: boolean): { focus: number; at: number } {
  const s = v.game!.s;
  const mine = v.you.seats;
  const seatRef = useRef<number | null>(null);
  const turnRef = useRef<{ turn: number; pos: number } | null>(null);
  if (!tv && mine.length) {
    if (!ridesOn()) return { focus: 0, at: 180 };
    const seat = mine.includes(s.turn) ? s.turn : seatRef.current !== null && mine.includes(seatRef.current) ? seatRef.current : mine[0];
    seatRef.current = seat;
    return { focus: s.ps[seat]?.pos ?? 0, at: 270 };
  }
  if (!turnRef.current || turnRef.current.turn !== s.turn) turnRef.current = { turn: s.turn, pos: s.ps[s.turn]?.pos ?? 0 };
  return { focus: turnRef.current.pos, at: 180 };
}

export function Board({
  v,
  big,
  center,
  globe,
  over,
  ride,
  rideMode = "fp",
  urgent,
  onRideReady,
  onRideDone,
}: {
  v: RoomView;
  /** The big screen. */
  big?: boolean;
  center?: ComponentChildren;
  globe?: boolean;
  over?: ComponentChildren;
  /** A move to play (ridePlan.ts): a phone's own team's, or on the big screen anyone's. */
  ride?: RidePlan | null;
  rideMode?: "fp" | "flat" | "tv";
  /** Something on a clock came up for this phone: a ride gives way. */
  urgent?: boolean;
  onRideReady?: (key: number) => void;
  onRideDone?: (key: number) => void;
}) {
  const g = v.game!;
  const s = g.s;
  const [open, setOpen] = useState<number | null>(null);
  const { focus, at: focusAt } = useFocus(v, !!big);
  const rig = useRef<Rig | null>(null);
  const throwing = useThrowing();
  // The other teams' tokens walk in step with their thrower's ride (a phone), and land with a stamp.
  const others = big ? [] : s.ps.flatMap((p, seat) => (p.out || v.you.seats.includes(seat) ? [] : [seat]));
  const walks: Record<number, { start: number; per: number }> = {};
  const landings: { seat: number; at: number; land: number }[] = [];
  const nowS = serverNow();
  for (const seat of others) {
    const w = walkOf(v, seat, nowS);
    if (!w) continue;
    walks[seat] = { start: performance.now() + (w.start - nowS), per: w.per };
    landings.push({ seat, at: w.to, land: w.land });
  }
  const still = useRef<{ key: number; board: VNode } | null>(null);
  const news = currentNews(s);
  const marks: (SpaceMark | null)[] = s.deeds.map((d, at) => {
    if (!d) return null;
    const team = d.owner >= 0 ? teamOf(v, d.owner) : undefined;
    const city = CITY_AT[at];
    return {
      owner: team ? { color: TEAM_COLORS[team.color], letter: TEAM_LETTERS[team.color] } : null,
      houses: d.houses,
      mortgaged: d.mort,
      news: news && city && news.item.cities.includes(city.id) ? newsTag(news.item) : undefined,
    };
  });
  const tokens: TokenMark[] = s.ps.flatMap((p, seat) => (p.out ? [] : [{ seat, at: p.pos, kind: teamOf(v, seat)?.color ?? 0, mood: moodOf(v, seat) }]));
  let table = (
    <RoundBoard
      marks={marks}
      tokens={tokens}
      focus={focus}
      active={s.ps[s.turn]?.pos}
      flight={latestFlight(v)}
      onPick={ride ? undefined : setOpen}
      reduced={reducedMotion()}
      rig={rig}
      riding={ride ? ride.seat : null}
      focusAt={focusAt}
      walks={walks}
    />
  );
  // A ride turns the table itself, every frame: while it plays the table isn't drawn again (the same
  // drawing is handed back, which Preact skips), and once it's over it catches up in one go.
  if (ride) {
    if (still.current?.key !== ride.key) still.current = { key: ride.key, board: table };
    table = still.current.board;
  } else still.current = null;
  return (
    <div class={`boardwrap${ride ? " on-ride" : ""}`}>
      {/* (behind the board: the sky the board leans back into on a ride) */}
      {ride && <div class="ride-sky" key={`sky-${ride.key}`} />}
      {/* (the frame a move's camera moves: ui/Ride.tsx) */}
      <div class="board-view">{table}</div>
      {/* (what's drawn over the middle of the board moves with the big screen's camera on a move;
          a flight on the globe waits for the token to land) */}
      {(globe || center) && (
        <div class="board-cam">
          {globe && <GlobeLayer flight={ride ? null : latestFlight(v)} focus={CITY_AT[focus]?.id ?? null} />}
          {center && <div class="center-disc">{center}</div>}
        </div>
      )}
      {ride && (
        <Ride
          key={ride.key}
          plan={ride}
          rig={rig}
          kind={teamOf(v, ride.seat)?.color ?? 0}
          mood={moodOf(v, ride.seat)}
          mode={rideMode}
          urgent={!!urgent}
          onReady={onRideReady}
          onDone={onRideDone ?? (() => {})}
        />
      )}
      {/* (this phone's dice are in the air: they tumble at once, before the server answers) */}
      {throwing && !ride && (
        <div class="throw-dice" aria-hidden="true">
          <Dice dice={[3, 5]} seed={7} size={40} />
        </div>
      )}
      {landings.map((l) => (
        <OtherStamp key={`${l.seat}-${l.land}`} rig={rig} at={l.at} land={l.land} />
      ))}
      {over}
      {open !== null && <SpaceSheet v={v} at={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/**
 * Another team's token lands (on a phone): a small stamp comes down beside it, at the moment the
 * thrower's own stamp does, and fades.
 */
function OtherStamp({ rig, at, land }: { rig: { current: Rig | null }; at: number; land: number }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const r = rig.current;
    const box = el.current;
    if (!r || !box) return;
    const [x, y] = xy(angleOf(at), TOKEN_R - 104);
    const a = (r.rotation() * Math.PI) / 180;
    const rx = x * Math.cos(a) - y * Math.sin(a);
    const ry = x * Math.sin(a) + y * Math.cos(a);
    box.style.left = `${(50 + rx / 10).toFixed(2)}%`;
    box.style.top = `${(50 + ry / 10).toFixed(2)}%`;
    const wait = land - serverNow();
    box.dataset.land = String(Math.round(Date.now() + wait));
    const on = window.setTimeout(() => box.classList.add("on"), Math.max(0, wait));
    return () => clearTimeout(on);
  }, [land]);
  return (
    <div class="other-stamp" ref={el} aria-hidden="true">
      <svg viewBox="-60 -60 120 120" overflow="visible">
        <LandStamp at={at} />
      </svg>
    </div>
  );
}

/** Everything about one space: the city card (rule, the real fact behind it, greeting, currency, rents). */
export function SpaceSheet({ v, at, onClose }: { v: RoomView; at: number; onClose: () => void }) {
  const s = v.game!.s;
  const sp = BOARD[at];
  const city = CITY_AT[at];
  const deed = s.deeds[at];
  return (
    <Sheet title={spaceName(at)} onClose={onClose}>
      {city && (
        <div class="citycard">
          <SheetFrame id={city.id} />
          <p class="group">
            <GroupIcon group={city.group} size={14} /> {groupName(city.group)}
          </p>
          <p>
            <b>{tx(city.rule.title)}</b>{colon()}{tx(city.rule.text)}
          </p>
          <p class="muted">
            {t("realBasis")}{colon()}{tx(city.basis)}{" "}
            <a href={city.source} target="_blank" rel="noopener noreferrer">
              {t("source")}
            </a>
          </p>
          <p>
            {t("greeting")}{colon()}<span lang="und">{city.greeting.text}</span>
            {city.greeting.roman ? ` (${city.greeting.roman})` : ""} · {t("currency")}{colon()}{tx(city.currency)}
          </p>
          <p class="num">
            {t("emptyRent", {
              a: money(s.cfg.rents[city.id][0]),
              b: money(s.cfg.rents[city.id][1]),
              c: s.cfg.rents[city.id].slice(2, 6).map(money).join(" / "),
              d: money(s.cfg.rents[city.id][6]),
            })}
          </p>
        </div>
      )}
      {sp.k === "route" && (
        <p>
          {tx(ROUTES.find((r) => r.id === sp.id)!.name)} · {t("routeRent", { list: s.cfg.routeRent.map(money).join(" / ") })}
        </p>
      )}
      {sp.k === "service" && (
        <p>
          {tx(SERVICES.find((r) => r.id === sp.id)!.name)} · {t("serviceRent", { a: s.cfg.serviceTimes[0], b: s.cfg.serviceTimes[1] })}
        </p>
      )}
      {deed && (
        <p>
          {t("price")} <Money n={priceOf(s, at)} /> · {t("owner")}{colon()}
          {deed.owner >= 0 ? <SeatChip v={v} seat={deed.owner} /> : t("unowned")}
          {deed.owner >= 0 && !deed.mort && (
            <>
              {" "}
              · {t("rentNow", { rent: money(rentAt(s, at, 7)) })}
            </>
          )}
          {deed.mort && ` · ${t("mortgaged")}`}
          {groupAt(at) === null && null}
        </p>
      )}
    </Sheet>
  );
}
