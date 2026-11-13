import type { ComponentChildren, VNode } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { BOARD, CITY_AT, ROUTES, SERVICES, groupAt, priceOf, rentAt, type GameEvent } from "../../engine";
import type { FeedItem, RoomView } from "../../room/protocol";
import type { Mood } from "../art/characters";
import { Dice } from "../art/dice";
import { RoundBoard, TOKEN_R, TOKEN_SCALE, angleOf, xy, type BoardFx, type Rig, type SpaceMark, type TokenMark, type WorldMark } from "../art/RoundBoard";
import type { Flight } from "../art/RouteMap";
import { colon, getLang, groupName, money, spaceName, t, tx, type Key } from "../i18n";
import { MAP_SIZES, prefs, type MapSize } from "../prefs";
import { GroupIcon, Money, SeatChip, Sheet, TEAM_COLORS, TEAM_LETTERS, teamOf } from "./common";
import { GlobeLayer } from "./GlobeLayer";
import { ZOOM, useMapView } from "./mapView";
import { litSets, useNewSets } from "./Sets";
import { currentNews, newsTag } from "./News";
import { reducedMotion } from "../motion";
import { serverNow, update } from "../store";
import { LocalMoney } from "./Local";
import { SheetFrame } from "./Photo";
import { LandStamp, Ride, placeCamLayers, project, rest, viewBoard } from "./Ride";
import { moveInPlay, ridesOn, walkOf, type RidePlan } from "./ridePlan";
import { globeWanted } from "./GlobeLayer";
import { useThrowing } from "./throwing";
import { useWorldMoment } from "./World";

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

/** How long a stamp stays on the board (ms; its animation in art.css runs as long). */
const FX_MS = 1_800;
/** …and a world event's effect (art.css .wf). */
const WORLD_FX_MS = 3_600;

/**
 * A city sold at auction, a team gone broke: a stamp on its space for a moment, in the team's colour.
 * Only what happens while the board is up: what was in the feed when it first drew is old news.
 */
function useBoardFx(v: RoomView): BoardFx[] {
  const [fx, setFx] = useState<BoardFx[]>([]);
  const seen = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastId = v.feed.length ? v.feed[v.feed.length - 1].id : 0;
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const from = seen.current;
    seen.current = Math.max(from ?? 0, lastId);
    if (from === null) return;
    const fresh: BoardFx[] = [];
    for (const f of v.feed) {
      if (f.id <= from || f.t !== "game") continue;
      const e = f.e;
      if (e.t === "auction" && e.winner !== null) {
        const team = teamOf(v, e.winner);
        fresh.push({ id: f.id, kind: "sold", at: e.at, label: t("fx_sold"), color: team ? TEAM_COLORS[team.color] : "var(--active)" });
      } else if (e.t === "bankrupt" && v.game) {
        fresh.push({ id: f.id, kind: "broke", at: v.game.s.ps[e.p]?.pos ?? 0, label: t("fx_broke"), color: "var(--active)" });
      }
    }
    if (!fresh.length) return;
    const ids = new Set(fresh.map((f) => f.id));
    setFx((now) => [...now, ...fresh]);
    timers.current.push(setTimeout(() => setFx((now) => now.filter((f) => !ids.has(f.id))), FX_MS));
  }, [lastId]);
  return fx;
}

/** Feed items from this game: after a rematch the room's feed still holds the last game's end. */
export const thisGame = (v: RoomView) => (f: FeedItem) => !v.game || f.at >= v.game.startedAt;

/** The latest flight: a token reaching a city in a different region from the last city it visited. */
export function latestFlight(v: RoomView): (Flight & { seat: number }) | null {
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
  return from && from.group !== to.group ? { from: from.id, to: to.id, key: last.id, seat: last.e.p } : null;
}

/** A flight takes off a moment after the token is down on its city: the stamp first, then the trip. */
const TAKE_OFF = 250;

/**
 * The latest flight as the map flies it: the team's own token flies the route, taking off a moment
 * after its token is down on the ring and stamped (it walks there first: nothing tells the landing
 * before the stamp), on every screen in step with the move. A flight seen after its move is over goes
 * at once. (The big screen's globe flies it once the move has played: GlobeLayer.)
 */
export function flightToFly(v: RoomView): Flight | null {
  const f = latestFlight(v);
  if (!f) return null;
  const m = moveInPlay(v);
  const at = m && m.seat === f.seat ? performance.now() + (m.land + TAKE_OFF - serverNow()) : undefined;
  return { from: f.from, to: f.to, key: f.key, kind: teamOf(v, f.seat)?.color ?? f.seat, at };
}

/**
 * How far the board leans back at rest (degrees), as a board on a table seen from a chair: the big
 * screen's a little more, a phone's or a laptop's at every size of its map (a bigger map is the same
 * table seen closer, dragged round as it shows: ui/mapView.ts).
 */
export const LEAN = { tv: 30, table: 26 };
export const boardLean = (big: boolean): number => (big ? LEAN.tv : LEAN.table);

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
  // The big screen's globe is up: it stands under the board where the flat map was, so the tokens
  // stand on it (and the flat map steps aside).
  const [globeOn, setGlobeOn] = useState(false);
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
  const tokens: TokenMark[] = s.ps.flatMap((p, seat) => {
    if (p.out) return [];
    const team = teamOf(v, seat);
    const kind = team?.color ?? 0;
    return [{ seat, at: p.pos, kind, mood: moodOf(v, seat), badge: { color: TEAM_COLORS[kind], letter: TEAM_LETTERS[kind] } }];
  });
  const tokenScale = big ? TOKEN_SCALE.tv : TOKEN_SCALE.phone;
  const fx = useBoardFx(v);
  // A world event as it comes, and the city one in force has struck (a meteor's crater, a city locked down).
  const [moment] = useWorldMoment(v, WORLD_FX_MS);
  const w = v.game?.s.world;
  const worldMark: WorldMark | null =
    w && w.at !== null && (w.id === "meteor" || w.id === "terror") ? { id: w.id, at: w.at, tag: t(`worldTag_${w.id}`) } : null;
  // The map's size on a phone or a laptop (ui/mapView.ts); the big screen always fits the whole board.
  const wrap = useRef<HTMLDivElement>(null);
  const pan = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const zoomable = !big;
  const size: MapSize = zoomable ? prefs.mapSize : "s";
  // (the board's width, read when it changes: whether it's big enough to lean back)
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.clientWidth));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const lean = boardLean(!!big);
  // (a full set just made lights up its spaces: ui/Sets.tsx)
  const sets = useNewSets(v);
  // The big screen's globe shows the real world itself; anywhere else (and on a big screen that can't
  // show the globe) the board draws it flat, under the ring.
  const sat = !(globe && globeWanted());
  let table = (
    <RoundBoard
      marks={marks}
      tokens={tokens}
      focus={focus}
      active={s.ps[s.turn]?.pos}
      turn={s.turn}
      tokenScale={tokenScale}
      flight={globe && globeOn ? null : flightToFly(v)}
      onPick={ride ? undefined : setOpen}
      reduced={reducedMotion()}
      rig={rig}
      riding={ride ? ride.seat : null}
      focusAt={focusAt}
      walks={walks}
      sat={sat}
      fx={fx}
      worldFx={moment && { id: moment.id, kind: moment.e.id, at: moment.e.at }}
      worldMark={worldMark}
      lean={lean}
      lang={getLang()}
      lit={litSets(v, sets)}
    />
  );
  // A ride turns the table itself, every frame: while it plays the table isn't drawn again (the same
  // drawing is handed back, which Preact skips), and once it's over it catches up in one go.
  if (ride) {
    if (still.current?.key !== ride.key) still.current = { key: ride.key, board: table };
    table = still.current.board;
  } else still.current = null;
  // (this phone's own move: its camera has the view, ui/Ride.tsx; the map's button steps aside)
  const moving = !!ride || throwing;
  const onTurn = s.ps[s.turn] && !s.ps[s.turn].out ? s.turn : null;
  const map = useMapView(wrap, pan, rig, {
    zoom: ZOOM[size],
    follow: zoomable ? onTurn : null,
    turnKey: `${g.startedAt}:${s.turns}`,
    moveKey: `${s.turn}:${s.ps[s.turn]?.pos}`,
    reduced: reducedMotion(),
    look: zoomable ? builtHere(v) : null,
    // (where a point of the board shows in the box, the board leaning back as it rests)
    place: (x, y, rot) => {
      const p = project(x, y, rest(rot, lean), 1000);
      return [p.x - 500, p.y - 500];
    },
  });
  const hint = useMapHint(zoomable && size !== "s" && !moving);
  // Between moves the board rests as it lies (a move's camera has it meanwhile: ui/Ride.tsx), and on
  // the big screen its globe and centre card stand over its middle. Only a new lean eases over
  // (`.easing`, styles.css): the board handed back by a move's camera (one cut short too) is at rest at
  // once, so a pushed-in board never shows unclipped past its box while it eases back.
  const leanShown = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = view.current;
    const r = rig.current;
    if (ride || !el || !r) return;
    const easing = leanShown.current !== null && leanShown.current !== lean;
    leanShown.current = lean;
    el.classList.toggle("easing", easing);
    const c = rest(r.rotation(), lean);
    const w = el.clientWidth || 1;
    viewBoard(el, c, r.rotation(), w);
    if (big) placeCamLayers(Array.from(wrap.current?.querySelectorAll<HTMLElement>(".board-cam") ?? []), c, w);
    if (!easing) return;
    const done = window.setTimeout(() => el.classList.remove("easing"), 700);
    return () => {
      clearTimeout(done);
      el.classList.remove("easing");
    };
  }, [ride, lean, width, globeOn]);
  const pick = (next: MapSize) => {
    setMapSize(next);
    map.recentre();
    hint.show(next);
  };
  return (
    <div class={`boardwrap${ride ? " on-ride" : ""}${zoomable ? " zoomable" : ""}${zoomable && size !== "s" && !moving ? " zoomed" : ""}${globe && globeOn ? " globe-on" : ""}`} ref={wrap} data-map={size}>
      {/* (behind the board: the sky the board leans back into on a ride) */}
      {ride && <div class="ride-sky" key={`sky-${ride.key}`} />}
      {/* (the big screen's globe, under the board where its flat map is, moving with the camera on a move;
          a flight on it waits for the token to land) */}
      {globe && (
        <div class="board-cam board-under">
          <GlobeLayer flight={ride ? null : flightToFly(v)} focus={CITY_AT[focus]?.id ?? null} onOn={setGlobeOn} busy={!!ride} />
        </div>
      )}
      {/* (the map's size and where it's dragged to: ui/mapView.ts) */}
      <div class="board-pan" ref={pan}>
        {/* (the frame a move's camera moves, and the board leans back in at rest: ui/Ride.tsx; another
            team's landing stamps the board itself, so it lies on the board as it leans) */}
        <div class={`board-view${lean ? " leaning" : ""}`} ref={view}>
          {table}
          {landings.map((l) => (
            <OtherStamp key={`${l.seat}-${l.land}`} rig={rig} at={l.at} land={l.land} />
          ))}
        </div>
      </div>
      {/* (what's drawn over the middle of the board moves with the big screen's camera on a move) */}
      {center && (
        <div class="board-cam">
          <div class="center-disc">{center}</div>
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
          scale={tokenScale}
          map={zoomable ? { zoom: ZOOM[size], release: map.release, adopt: map.adopt } : null}
        />
      )}
      {/* (this phone's dice are in the air: they tumble at once, before the server answers) */}
      {throwing && !ride && (
        <div class="throw-dice" aria-hidden="true">
          <Dice dice={[3, 5]} seed={7} size={40} />
        </div>
      )}
      {over}
      {zoomable && !moving && <MapSizeButton size={size} onPick={pick} />}
      {zoomable && !moving && hint.text && (
        <p class="map-hint" key={hint.key} aria-hidden="true">
          {hint.text}
        </p>
      )}
      {open !== null && <SpaceSheet v={v} at={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** The map's size, remembered on this phone; every screen draws again with it. */
export function setMapSize(size: MapSize) {
  prefs.mapSize = size;
  update({});
}

const nextSize = (size: MapSize): MapSize => MAP_SIZES[(MAP_SIZES.indexOf(size) + 1) % MAP_SIZES.length];

/**
 * The map's size, in the board's top right corner (clear of the round board at its smallest): a tap
 * makes it bigger, and from the largest back to the whole board. Its three marks say which size it is.
 */
/** The city this device's own team built on a moment ago (its map looks at it as it comes up), or null. */
function builtHere(v: RoomView): { at: number; key: string } | null {
  for (let i = v.feed.length - 1; i >= 0; i--) {
    const f = v.feed[i];
    if (serverNow() - f.at > 3000) return null;
    if (f.t === "game" && f.e.t === "manage" && f.e.k === "build" && v.you.seats.includes(f.e.p)) return { at: f.e.at, key: String(f.id) };
  }
  return null;
}

function MapSizeButton({ size, onPick }: { size: MapSize; onPick: (s: MapSize) => void }) {
  const now = t(`map_${size}` as Key);
  const label = size === "l" ? t("mapWhole", { size: now }) : t("mapBigger", { size: now });
  const level = MAP_SIZES.indexOf(size);
  return (
    <button type="button" class="map-size" aria-label={label} title={label} onClick={() => onPick(nextSize(size))}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2" />
        <path d="M15.4 15.4L20.5 20.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
        <path d={size === "l" ? "M7.6 10.5h5.8" : "M7.6 10.5h5.8M10.5 7.6v5.8"} stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <span class="pips" aria-hidden="true">
        {MAP_SIZES.map((m, i) => (
          <i key={m} class={i <= level ? "on" : ""} />
        ))}
      </span>
    </button>
  );
}

/** Some words on the board for a moment: that a bigger map drags (the first time it's shown, and
 * whenever its size is picked), or that it's all there. */
let hinted = false;
function useMapHint(zoomed: boolean) {
  const [shown, setShown] = useState<{ text: string; key: number } | null>(null);
  const show = (size: MapSize) => setShown({ text: `${t(`map_${size}` as Key)} · ${t(size === "s" ? "mapAll" : "mapDrag")}`, key: Date.now() });
  useEffect(() => {
    if (!zoomed || hinted) return;
    hinted = true;
    const id = window.setTimeout(() => setShown({ text: t("mapDrag"), key: Date.now() }), 1200);
    return () => clearTimeout(id);
  }, [zoomed]);
  useEffect(() => {
    if (!shown) return;
    const id = window.setTimeout(() => setShown(null), 2600);
    return () => clearTimeout(id);
  }, [shown?.key]);
  return { text: shown?.text ?? "", key: shown?.key ?? 0, show };
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
          {t("price")} <Money n={priceOf(s, at)} />
          <LocalMoney city={city?.id} n={priceOf(s, at)} /> · {t("owner")}{colon()}
          {deed.owner >= 0 ? <SeatChip v={v} seat={deed.owner} /> : t("unowned")}
          {deed.owner >= 0 && !deed.mort && (
            <>
              {" "}
              · {t("rentNow", { rent: money(rentAt(s, at, 7)) })}
              <LocalMoney city={city?.id} n={rentAt(s, at, 7)} />
            </>
          )}
          {deed.mort && ` · ${t("mortgaged")}`}
          {groupAt(at) === null && null}
        </p>
      )}
    </Sheet>
  );
}
