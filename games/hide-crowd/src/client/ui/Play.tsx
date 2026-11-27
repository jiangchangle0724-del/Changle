// A round on a phone: the arena (3D, or flat without WebGL), the clock and the scores along the top,
// the stick and the three moves under the thumbs, at the night market the four snacks you've tasted,
// and at the theatre the stage's count in the middle when the whole crowd is about to punch.
// Sideways the arena fills the screen; upright it sits above the controls. A phone that joined during
// the round watches until the next one.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ARENAS, MATCH_MS, type ArenaId } from "../../engine";
import type { ClientMsg, EventView, GameView, MeView, RoomView } from "../../room/protocol";
import { t, type Key } from "../i18n";
import { Arena } from "./Arena";
import { ArenaFallback } from "./ArenaFallback";
import { Icon, IconButton } from "./chrome";
import { Controls } from "./Controls";
import { BarsHint } from "./HomeScreen";
import { Coach, COACH, useCoach } from "./Coach";
import { QUESTS } from "./quest";
import { arenaEvents, useFinalCall, CalloutBanner, DrillCall, INTRO_WINDOW_MS, MomentBanner, useCallout, useDrill, useRoundSounds } from "./roundFx";

const NOTICE: Partial<Record<EventView["t"], Key>> = { tag: "hit", foul: "foul", swing: "swing", hide: "hidden", bite: "tasted", feast: "feast", decoy: "decoyDone", lights: "lightsDone", blast: "blasted", bike: "biked" };
const BAD: readonly Key[] = ["spotted", "spottedBy", "foul", "blasted", "biked"];
const GOOD: readonly Key[] = ["hit", "hitName", ...ARENAS.map((arena) => QUESTS[arena].feast)];
const tastedCount = (bites: number) => [0, 1, 2, 3].filter((stall) => bites & (1 << stall)).length;

interface Notice {
  key: Key;
  id: number;
  vars?: Record<string, string | number>;
  /** a smaller line under it (getting up in another body: who it was that spotted you) */
  sub?: string;
}

/** The latest thing that happened to this phone's player, as a word on screen for a moment. */
function useNotice(events: EventView[], me: MeView | null, arena: ArenaId): Notice | null {
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
    // (the side quest's words are the place's own: a snack tasted, a view snapped, a door, a lantern)
    const quest = QUESTS[arena];
    let key = mine.onYou && mine.t === "tag" ? "spotted" : mine.t === "bite" ? quest.done : mine.t === "feast" ? quest.feast : NOTICE[mine.t];
    if (!key) return;
    let vars: Notice["vars"] = mine.t === "bite" ? { snack: t(quest.spots[mine.stall ?? 0].name), n: 4 - tastedCount(me?.bites ?? 0) } : undefined;
    // a tag names the other player: who spotted you, or whom you got
    if (mine.t === "tag" && mine.name) {
      key = mine.onYou ? "spottedBy" : "hitName";
      vars = { name: mine.name };
    }
    // getting up in another body after a tag: who it was stays on screen, under it
    const tagged = mine.t === "hide" ? [...events].reverse().find((event) => event.t === "tag" && event.onYou && event.id < mine.id) : undefined;
    const sub = tagged?.name ? t("spottedByAfter", { name: tagged.name }) : undefined;
    setNotice({ key, id: mine.id, vars, sub });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice((now) => (now?.id === mine.id ? null : now)), mine.t === "hide" || mine.t === "feast" || mine.t === "decoy" || mine.t === "lights" || mine.t === "blast" || mine.t === "bike" ? 2_600 : 1_400);
  }, [latest]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return notice;
}

/**
 * The night market's side quest on your phone: the four snacks, lit once you've tasted them, and a
 * ring filling round the one you're standing at.
 */
function Quest(props: { me: MeView; arena: ArenaId }) {
  const { me } = props;
  const quest = QUESTS[props.arena];
  return (
    <div class={`quest quest--${props.arena}`} role="group" aria-label={t(quest.label, { n: tastedCount(me.bites) })}>
      <span class="quest-title">{t(quest.title)}</span>
      {quest.spots.map((snack, stall) => {
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

/**
 * The round's points. A knockout's stage has no target (it runs its whole time): the players stand in
 * their order as it's going, best first, a line under the last one going through.
 */
export function Scoreboard(props: { view: RoomView; target: number | null; compact?: boolean }) {
  const knockout = props.target === null ? props.view.knockout : null;
  let players = props.view.players.filter((player) => player.inRound);
  if (knockout) players = [...players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  // (a full room: smaller rows, so eight fit beside the buttons)
  const many = players.length > 5;
  return (
    <ol class={`scores${props.compact ? " is-compact" : ""}${knockout ? " is-knockout" : ""}${many ? " is-many" : ""}`} aria-label={t("score")}>
      {players.flatMap((player, index) => {
        const row = (
          <li key={player.name} class={`score${player.you ? " is-you" : ""}${player.online ? "" : " is-away"}${knockout && player.through ? " is-through" : ""}`}>
            <span class="score-name">{player.name}</span>
            {props.target !== null && (
              <span class="score-pips" aria-hidden="true">
                {Array.from({ length: props.target }, (_, pip) => (
                  <i key={pip} class={pip < player.score ? "is-on" : ""} />
                ))}
              </span>
            )}
            <b class="tabular score-num">{player.score}</b>
          </li>
        );
        // the knockout's cut: a line under the last one going through as it stands
        const cut = !!knockout && !knockout.final && index === knockout.through - 1 && index < players.length - 1;
        return cut
          ? [
              row,
              <li key="cut" class="score-cut" aria-hidden="true">
                <span>{t("koCut")}</span>
              </li>
            ]
          : [row];
      })}
    </ol>
  );
}

/** Under the place's name: what the round is played to (first to 5, or a knockout's stage), and which of a match's places. */
export function roundLine(view: RoomView, game: GameView): string {
  const knockout = view.knockout;
  const what =
    game.scoreToWin !== null ? t("firstTo", { n: game.scoreToWin }) : knockout?.final ? t("koFinal") : t("koStage", { i: knockout?.stage ?? 1, n: knockout?.through ?? 1 });
  return view.match ? `${what} · ${t("matchPlace", { i: view.match.index, n: view.match.of })}` : what;
}

/** A phone that isn't in the round: why (out of the knockout, or joined while one is on), or just watching. */
function watchingLine(view: RoomView): string {
  if (view.knockout?.out) return t("koWatching", { i: view.knockout.out });
  if (view.knockout && !view.knockout.done) return t("koLate");
  return t("watching");
}

/** The round's clock as it reads: minutes and seconds (3:00 down to 0:00). */
export const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

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
  /** practice: a first round's tips, step by step (Coach.tsx) */
  coach?: boolean;
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
  const notice = useNotice(game.events, me, game.arena);
  const drill = useDrill(game, props.receivedAt);
  const callout = useCallout(game.events, { screen: false, screens: view.screens });
  useFinalCall(view, false);
  const meScore = view.players.find((player) => player.you);
  const coach = useCoach(game, !!props.coach && !!me);
  const pointing = coach.index >= 0 && !notice ? COACH[coach.index].point : undefined;
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
    lights: game.lights ?? null,
    intro
  } as const;
  return (
    <section class={`play${me ? " is-playing" : " is-watching"}${pointing ? ` is-coach-${pointing}` : ""}`}>
      <div class="play-arena">
        <Arena {...arenaProps} label={t(game.arena)} youLabel={t("marker")} fallback={<ArenaFallback {...arenaProps} />} />
      </div>
      <header class="play-hud">
        <IconButton icon="more" label={t("menu")} onClick={props.onMenu} class="hud-btn" />
        <div class="hud-what">
          <strong>{t(game.arena)}</strong>
          <span>{roundLine(view, game)}</span>
        </div>
        <div class={`hud-clock tabular${seconds <= 10 && game.phase === "playing" ? " is-last" : ""}`} role="timer" aria-label={t("secondsLeft", { n: seconds })}>
          {clockText(game.phase === "playing" ? seconds : 0)}
        </div>
        {meScore && meScore.inRound && (
          <div class="hud-mine" aria-label={`${t("score")} ${meScore.score}`}>
            <span>{t("you")}</span>
            {/* (keyed by the score: a new point pops in) */}
            <b key={meScore.score} class="tabular">{meScore.score}</b>
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
      <CalloutBanner callout={callout} />
      {me && game.phase === "playing" && <Quest me={me} arena={game.arena} />}
      {props.fullGuide && game.phase === "playing" && <BarsHint onMore={props.fullGuide} />}
      {/* (a word about your own punch or fall comes first) */}
      {!notice && <Coach index={coach.index} onDismiss={coach.dismiss} />}
      {notice && (
        <p class={`play-notice${BAD.includes(notice.key) ? " is-bad" : GOOD.includes(notice.key) ? " is-good" : ""}`} role="status" key={notice.id}>
          {t(notice.key, notice.vars)}
          {notice.sub && <small class="play-notice-sub">{notice.sub}</small>}
        </p>
      )}
      {game.phase === "playing" &&
        (me ? (
          <Controls me={me} now={Date.now() + props.serverOffset} send={send} onVector={setVector} drill={drill} />
        ) : (
          <p class="play-watching" role="status">
            <Icon name="eye" size={18} />
            {watchingLine(view)}
          </p>
        ))}
      <p class="play-turn" aria-hidden="true">
        {t("turn")}
      </p>
      {props.children}
    </section>
  );
}
