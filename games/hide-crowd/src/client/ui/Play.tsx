// A round on a phone: the arena (3D, or flat without WebGL), the clock and the scores along the top,
// the stick and the three moves under the thumbs, at the night market the four snacks you've tasted,
// and at the theatre the stage's count in the middle when the whole crowd is about to punch.
// Sideways the arena fills the screen; upright it sits above the controls. A phone that joined during
// the round watches until the next one.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { MATCH_MS } from "../../engine";
import type { ClientMsg, EventView, GameView, MeView, RoomView } from "../../room/protocol";
import { t, type Key } from "../i18n";
import { Arena } from "./Arena";
import { ArenaFallback } from "./ArenaFallback";
import { Icon, IconButton, type IconName } from "./chrome";
import { Controls } from "./Controls";
import { BarsHint } from "./HomeScreen";
import { arenaEvents, DrillCall, INTRO_WINDOW_MS, MomentBanner, useDrill, useRoundSounds } from "./roundFx";

const NOTICE: Partial<Record<EventView["t"], Key>> = { tag: "hit", foul: "foul", swing: "swing", hide: "hidden", bite: "tasted", feast: "feast", decoy: "decoyDone", blast: "blasted" };
/** the night market's four stalls, left to right: their snacks */
export const SNACKS: readonly { icon: IconName; name: Key }[] = [
  { icon: "squid", name: "snack0" },
  { icon: "fishball", name: "snack1" },
  { icon: "tea", name: "snack2" },
  { icon: "potato", name: "snack3" }
];
const tastedCount = (bites: number) => [0, 1, 2, 3].filter((stall) => bites & (1 << stall)).length;

interface Notice {
  key: Key;
  id: number;
  vars?: Record<string, string | number>;
}

/** The latest thing that happened to this phone's player, as a word on screen for a moment. */
function useNotice(events: EventView[], me: MeView | null): Notice | null {
  const [notice, setNotice] = useState<Notice | null>(null);
  const seen = useRef(events.length ? events[events.length - 1].id : 0);
  const timer = useRef(0);
  // (every frame brings a new list: look again only when something new has happened, and leave the
  // word's own timer to run until a newer word takes its place, or the word would never go)
  const latest = events.length ? events[events.length - 1].id : 0;
  useEffect(() => {
    const fresh = events.filter((event) => event.id > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].id;
    const mine = [...fresh].reverse().find((event) => event.onYou || (event.byYou && NOTICE[event.t]));
    if (!mine) return;
    const key = mine.onYou && mine.t === "tag" ? "spotted" : NOTICE[mine.t];
    if (!key) return;
    const vars = mine.t === "bite" ? { snack: t(SNACKS[mine.stall ?? 0].name), n: 4 - tastedCount(me?.bites ?? 0) } : undefined;
    setNotice({ key, id: mine.id, vars });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice((now) => (now?.id === mine.id ? null : now)), mine.t === "hide" || mine.t === "feast" || mine.t === "decoy" || mine.t === "blast" ? 2_600 : 1_400);
  }, [latest]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return notice;
}

/**
 * The night market's side quest on your phone: the four snacks, lit once you've tasted them, and a
 * ring filling round the one you're standing at.
 */
function Quest(props: { me: MeView }) {
  const { me } = props;
  return (
    <div class="quest" role="group" aria-label={t("questLabel", { n: tastedCount(me.bites) })}>
      <span class="quest-title">{t("questTitle")}</span>
      {SNACKS.map((snack, stall) => {
        const done = (me.bites & (1 << stall)) !== 0;
        const tasting = !done && me.at === stall && me.tasting > 0;
        return (
          <span
            key={stall}
            class={`quest-snack stall-${stall}${done ? " is-done" : ""}${tasting ? " is-tasting" : ""}`}
            style={tasting ? { "--tasting": String(me.tasting) } : undefined}
            title={t(snack.name)}
          >
            <Icon name={snack.icon} size={18} />
          </span>
        );
      })}
    </div>
  );
}

export function Scoreboard(props: { view: RoomView; target: number; compact?: boolean }) {
  const players = props.view.players.filter((player) => player.inRound);
  return (
    <ol class={`scores${props.compact ? " is-compact" : ""}`} aria-label={t("score")}>
      {players.map((player, index) => (
        <li key={index} class={`score${player.you ? " is-you" : ""}${player.online ? "" : " is-away"}`}>
          <span class="score-name">{player.name}</span>
          <span class="score-pips" aria-hidden="true">
            {Array.from({ length: props.target }, (_, pip) => (
              <i key={pip} class={pip < player.score ? "is-on" : ""} />
            ))}
          </span>
          <b class="tabular score-num">{player.score}</b>
        </li>
      ))}
    </ol>
  );
}

export function useClock(game: GameView | null, receivedAt: number): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (!game || game.phase !== "playing") return;
    const timer = window.setInterval(() => force((n) => n + 1), 250);
    return () => window.clearInterval(timer);
  }, [game?.phase]);
  if (!game) return 0;
  return Math.max(0, game.remainingMs - (Date.now() - receivedAt));
}

export function Play(props: {
  view: RoomView;
  game: GameView;
  receivedAt: number;
  serverOffset: number;
  send: (message: ClientMsg) => void;
  onMenu: () => void;
  /** full screen, or on an iPhone the Home Screen guide; null where neither helps (already from the Home Screen) */
  fullscreen: { on: boolean; toggle: () => void } | null;
  /** the place's music too (practice: this phone is the only screen) */
  music?: boolean;
  /** an iPhone in Safari: the full-screen guide, for the line about hiding Safari's bars */
  fullGuide?: () => void;
  children?: ComponentChildren;
}) {
  const { view, game, send } = props;
  const [vector, setVector] = useState({ x: 0, y: 0 });
  // Safari's pinch zoom, off during a round (two thumbs on the glass look like a pinch to it)
  useEffect(() => {
    const stop = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", stop, { passive: false } as AddEventListenerOptions);
    document.addEventListener("gesturechange", stop, { passive: false } as AddEventListenerOptions);
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
    };
  }, []);
  const remaining = useClock(game, props.receivedAt);
  const seconds = Math.ceil(remaining / 1_000);
  useRoundSounds(game, seconds, { screen: false, music: !!props.music });
  const me = game.me;
  const shown = arenaEvents(game);
  // (the camera's opening sweep when the arena comes up: only if the round has just begun, not for a
  // phone that comes in late; the next round on the same arena starts its own, Arena3D)
  const intro = game.phase === "playing" && game.remainingMs > MATCH_MS - INTRO_WINDOW_MS;
  const notice = useNotice(game.events, me);
  const drill = useDrill(game, props.receivedAt);
  const meScore = view.players.find((player) => player.you);
  const arenaProps = {
    avatars: game.avatars,
    arena: game.arena,
    drift: game.drift,
    localVector: me ? vector : { x: 0, y: 0 },
    maxSpeed: me?.maxSpeed ?? 0,
    receivedAt: props.receivedAt,
    impactId: shown.impactId,
    impactType: shown.impactType,
    flash: shown.flash,
    moment: game.moment,
    glance: game.glance ?? null,
    intro
  } as const;
  return (
    <section class={`play${me ? " is-playing" : " is-watching"}`}>
      <div class="play-arena">
        <Arena {...arenaProps} label={t(game.arena)} youLabel={t("marker")} fallback={<ArenaFallback {...arenaProps} />} />
      </div>
      <header class="play-hud">
        <IconButton icon="more" label={t("menu")} onClick={props.onMenu} class="hud-btn" />
        <div class="hud-what">
          <strong>{t(game.arena)}</strong>
          <span>{t("firstTo", { n: game.scoreToWin })}</span>
        </div>
        <div class={`hud-clock tabular${seconds <= 10 && game.phase === "playing" ? " is-last" : ""}`} role="timer" aria-label={t("secondsLeft", { n: seconds })}>
          {game.phase === "playing" ? seconds : 0}
        </div>
        {meScore && meScore.inRound && (
          <div class="hud-mine" aria-label={`${t("score")} ${meScore.score}`}>
            <span>{t("you")}</span>
            <b class="tabular">{meScore.score}</b>
          </div>
        )}
        {props.fullscreen && (
          <IconButton icon={props.fullscreen.on ? "exitFull" : "full"} label={t(props.fullscreen.on ? "exitFullscreen" : "fullscreen")} onClick={props.fullscreen.toggle} class="hud-btn hud-full" />
        )}
      </header>
      <div class="play-scores">
        <Scoreboard view={view} target={game.scoreToWin} compact />
      </div>
      <MomentBanner game={game} />
      {/* (a word about your own punch takes the count's place) */}
      {!notice && <DrillCall drill={drill} />}
      {game.arena === "market" && me && game.phase === "playing" && <Quest me={me} />}
      {props.fullGuide && game.phase === "playing" && <BarsHint onMore={props.fullGuide} />}
      {notice && (
        <p class={`play-notice${notice.key === "spotted" || notice.key === "foul" || notice.key === "blasted" ? " is-bad" : notice.key === "hit" || notice.key === "feast" ? " is-good" : ""}`} role="status" key={notice.id}>
          {t(notice.key, notice.vars)}
        </p>
      )}
      {game.phase === "playing" &&
        (me ? (
          <Controls me={me} now={Date.now() + props.serverOffset} send={send} onVector={setVector} drill={drill} />
        ) : (
          <p class="play-watching" role="status">
            <Icon name="eye" size={18} />
            {t("watching")}
          </p>
        ))}
      <p class="play-turn" aria-hidden="true">
        {t("turn")}
      </p>
      {props.children}
    </section>
  );
}
