// What a round sounds like, and the crowd's moments on screen. On a phone: your own punches, hits and
// spills, your bites at the night market's stalls, the ferry horn, the busker, the gong, the stage's
// count or the fireworks, the last five seconds, the whistle and the fanfare. On the big screen (and
// in practice): every punch, hit and bite in the room, and a light loop for the place. And the
// theatre's drill, counted big in the middle of the screen.
import { useEffect, useRef, useState } from "preact/hooks";
import { DRILL_BEAT_MS, DRILL_GO_MS, DRILL_MS, DRILL_WINDOW, PUNCH_WINDUP_MS } from "../../engine";
import type { AwardView, EventView, GameView } from "../../room/protocol";
import { t, type Key } from "../i18n";
import { buzz, installAudioUnlock, sfx, startMusic, stopMusic } from "../sound";
import { Icon, type IconName } from "./chrome";

export function useRoundSounds(game: GameView, seconds: number, options: { screen: boolean; music: boolean }) {
  const { screen, music } = options;
  // the whistle and the place's loop, while the round is on
  useEffect(() => {
    installAudioUnlock();
    if (game.phase !== "playing") return;
    sfx.whistle();
    if (music) startMusic(game.arena);
    return () => stopMusic();
  }, [game.phase, game.arena, music]);

  // what just happened
  const seen = useRef(game.events.length ? game.events[game.events.length - 1].id : 0);
  useEffect(() => {
    const fresh = game.events.filter((event) => event.id > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].id;
    for (const event of fresh) {
      if (event.t === "over") {
        sfx.fanfare();
        stopMusic();
      } else if (event.t === "tag" && (screen || event.byYou)) {
        sfx.bonk();
        sfx.thud(0.33);
      } else if (event.t === "tag" && event.onYou) {
        sfx.spotted();
        sfx.thud(0.35);
        buzz([40, 50, 90]);
      } else if (event.t === "foul" && (screen || event.byYou)) {
        sfx.oops();
        sfx.thud(0.32);
        if (event.byYou) buzz(30);
      } else if (event.t === "bite" && (screen || event.byYou)) {
        sfx.bite(event.stall ?? 0);
        if (event.byYou) buzz(20);
      } else if (event.t === "feast" && (screen || event.byYou)) {
        sfx.feast();
        if (event.byYou) buzz([30, 40, 30]);
      } else if (event.t === "decoy" && event.byYou) {
        // (only its maker hears of a distraction)
        sfx.psst();
      }
    }
  }, [game.events]);

  // a punch thrown: your own (a phone), or anyone's (the big screen sees them all anyway), one whoosh
  // however many at once (the drill's whole crowd has its own, in the count's sound)
  const poses = useRef<string[]>([]);
  const moment = game.moment?.kind ?? null;
  useEffect(() => {
    let thrown = false;
    game.avatars.forEach((avatar, index) => {
      const before = poses.current[index];
      if (avatar.p === "windup" && before !== "windup" && before !== undefined && (avatar.me || (screen && moment !== "drill"))) thrown = true;
      poses.current[index] = avatar.p;
    });
    if (thrown) sfx.whoosh();
  }, [game.avatars]);

  // the ferry horn, the busker, the gong, the stage's count, the fireworks
  useEffect(() => {
    if (moment === "horn") sfx.horn();
    if (moment === "dance") sfx.busker();
    if (moment === "gong") sfx.gong();
    if (moment === "drill") sfx.drill(Math.max(0, DRILL_MS - (game.moment?.endsInMs ?? DRILL_MS)));
    if (moment === "fireworks") sfx.fireworks();
  }, [moment]);

  // the last five seconds
  useEffect(() => {
    if (game.phase === "playing" && seconds > 0 && seconds <= 5) sfx.tick(seconds === 1);
  }, [seconds]);
}

/** a screen that shows a round within this long of its start opens on the camera's sweep (Arena3D) */
export const INTRO_WINDOW_MS = 2_500;

type Blow = Exclude<EventView["t"], "bite" | "feast" | "decoy">;

/**
 * What the arena shows of the round's events: the latest blow (the shake, how a body falls), and the
 * night market's latest stall tasted (it lights up for everyone), with whether that bite was a feast.
 */
export function arenaEvents(game: GameView): { impactId: number; impactType: Blow; flash: { id: number; stall: number; feast: boolean } | null } {
  let blow: EventView | undefined;
  let bite: EventView | undefined;
  let feast = 0;
  for (let index = game.events.length - 1; index >= 0 && (!blow || !bite); index--) {
    const event = game.events[index];
    if (event.t === "bite") bite ??= event;
    else if (event.t === "feast") feast = bite ? feast : event.id;
    else if (event.t !== "decoy") blow ??= event;
  }
  return {
    impactId: blow?.id ?? 0,
    impactType: (blow?.t ?? "swing") as Blow,
    flash: bite ? { id: bite.id, stall: bite.stall ?? 0, feast: feast > bite.id } : null
  };
}

const MOMENT: Record<NonNullable<GameView["moment"]>["kind"], { text: Key; icon: IconName }> = {
  horn: { text: "momentHorn", icon: "ship" },
  dance: { text: "momentDance", icon: "note" },
  gong: { text: "momentGong", icon: "gong" },
  drill: { text: "momentDrill", icon: "fist" },
  fireworks: { text: "momentFireworks", icon: "firework" }
};

/** The whole crowd stops: say why, while it lasts. */
export function MomentBanner(props: { game: GameView; tv?: boolean }) {
  const moment = props.game.moment;
  if (!moment || props.game.phase !== "playing") return null;
  return (
    <p class={`moment-banner${props.tv ? " is-tv" : ""}`} role="status" key={moment.kind}>
      <Icon name={MOMENT[moment.kind].icon} size={props.tv ? 34 : 20} />
      <span>{t(MOMENT[moment.kind].text)}</span>
    </p>
  );
}

export interface Drill {
  /** the count: 0, 1, 2 for 三, 二, 一, then 3 for the call (出拳！) */
  beat: number;
  /** a punch pressed now lands with the crowd's (from the call until the window closes) */
  cue: boolean;
}

/** How far into the theatre's drill this screen is (ms), or null outside one. */
export function drillElapsed(game: GameView, receivedAt: number, at = Date.now()): number | null {
  if (game.phase !== "playing" || game.moment?.kind !== "drill") return null;
  return DRILL_MS - game.moment.endsInMs + Math.max(0, at - receivedAt);
}

/** a punch pressed this long into the drill still lands inside the crowd's window (it lands a wind-up later) */
const CUE_ENDS = DRILL_WINDOW[1] - PUNCH_WINDUP_MS;
/** (the cue lights a moment before the call: a thumb takes that long to come down) */
const CUE_STARTS = DRILL_GO_MS - 120;

/**
 * The theatre's drill as this screen counts it, on the beat: the room's frames come often but not on
 * the beat, so it wakes itself on each one (and when the punch's window closes).
 */
export function useDrill(game: GameView, receivedAt: number): Drill | null {
  const [, wake] = useState(0);
  const elapsed = drillElapsed(game, receivedAt);
  useEffect(() => {
    if (elapsed === null) return;
    const next = [DRILL_BEAT_MS, DRILL_BEAT_MS * 2, CUE_STARTS, DRILL_GO_MS, CUE_ENDS, DRILL_MS].find((mark) => mark > elapsed);
    if (next === undefined) return;
    const timer = window.setTimeout(() => wake((n) => n + 1), next - elapsed + 4);
    return () => window.clearTimeout(timer);
  });
  if (elapsed === null || elapsed >= DRILL_MS) return null;
  return { beat: Math.min(3, Math.floor(Math.max(0, elapsed) / DRILL_BEAT_MS)), cue: elapsed >= CUE_STARTS && elapsed < CUE_ENDS };
}

const COUNT: readonly Key[] = ["drill3", "drill2", "drill1", "drillGo"];

/** The stage's count, big in the middle: 三, 二, 一 in a disc, then 出拳！ in the gel (the banner says it in words). */
export function DrillCall(props: { drill: Drill | null; tv?: boolean }) {
  if (!props.drill) return null;
  const { beat } = props.drill;
  return (
    <p class={`drill-call${beat === 3 ? " is-go" : ""}${props.tv ? " is-tv" : ""}`} aria-hidden="true" key={beat}>
      <span>{t(COUNT[beat])}</span>
    </p>
  );
}

const AWARD: Record<AwardView["award"], { title: Key; why: Key }> = {
  eagleEye: { title: "awardEagleEye", why: "awardEagleEyeWhy" },
  ghost: { title: "awardGhost", why: "awardGhostWhy" },
  friendlyFire: { title: "awardFriendlyFire", why: "awardFriendlyFireWhy" },
  airPunch: { title: "awardAirPunch", why: "awardAirPunchWhy" },
  punchingBag: { title: "awardPunchingBag", why: "awardPunchingBagWhy" },
  foodie: { title: "awardFoodie", why: "awardFoodieWhy" }
};

/** The round's nicknames, one per player at most. */
export function Awards(props: { awards: AwardView[] }) {
  if (!props.awards.length) return null;
  return (
    <ul class="awards" aria-label={t("awards")}>
      {props.awards.map((item, index) => (
        <li key={index} class={`award${item.you ? " is-you" : ""}`}>
          <span class="award-name">{item.name}</span>
          <b class="award-title">{t(AWARD[item.award].title)}</b>
          <span class="award-why">{t(AWARD[item.award].why)}</span>
        </li>
      ))}
    </ul>
  );
}
