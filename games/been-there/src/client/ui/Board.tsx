import type { ComponentChildren, VNode } from "preact";
import { useRef, useState } from "preact/hooks";
import { BOARD, CITY_AT, ROUTES, SERVICES, groupAt, priceOf, rentAt, type GameEvent } from "../../engine";
import type { FeedItem, RoomView } from "../../room/protocol";
import type { Mood } from "../art/characters";
import { RoundBoard, type Rig, type SpaceMark, type TokenMark } from "../art/RoundBoard";
import type { Flight } from "../art/RouteMap";
import { colon, groupName, money, spaceName, t, tx } from "../i18n";
import { GroupIcon, Money, SeatChip, Sheet, TEAM_COLORS, TEAM_LETTERS, teamOf } from "./common";
import { GlobeLayer } from "./GlobeLayer";
import { currentNews, newsTag } from "./News";
import { reducedMotion } from "../motion";
import { SheetFrame } from "./Photo";
import { Ride } from "./Ride";
import type { RidePlan } from "./ridePlan";

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

/** The table turns when the turn passes, not while a token is walking. */
function useTurnFocus(v: RoomView) {
  const s = v.game!.s;
  const ref = useRef<{ turn: number; pos: number } | null>(null);
  if (!ref.current || ref.current.turn !== s.turn) ref.current = { turn: s.turn, pos: s.ps[s.turn]?.pos ?? 0 };
  return ref.current.pos;
}

export function Board({
  v,
  center,
  globe,
  over,
  ride,
  urgent,
  onRideDone,
}: {
  v: RoomView;
  big?: boolean;
  center?: ComponentChildren;
  globe?: boolean;
  over?: ComponentChildren;
  /** A first-person move to play (a phone, its own team's move: ridePlan.ts). */
  ride?: RidePlan | null;
  /** Something on a clock came up for this phone: a ride gives way. */
  urgent?: boolean;
  onRideDone?: (key: number) => void;
}) {
  const g = v.game!;
  const s = g.s;
  const [open, setOpen] = useState<number | null>(null);
  const focus = useTurnFocus(v);
  const rig = useRef<Rig | null>(null);
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
      {table}
      {globe && <GlobeLayer flight={latestFlight(v)} focus={CITY_AT[focus]?.id ?? null} />}
      {center && <div class="center-disc">{center}</div>}
      {ride && (
        <Ride
          key={ride.key}
          plan={ride}
          rig={rig}
          kind={teamOf(v, ride.seat)?.color ?? 0}
          mood={moodOf(v, ride.seat)}
          urgent={!!urgent}
          onDone={onRideDone ?? (() => {})}
        />
      )}
      {over}
      {open !== null && <SpaceSheet v={v} at={open} onClose={() => setOpen(null)} />}
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
