// What a round sounds like, and the crowd's moments on screen. On a phone: your own punches, hits and
// spills, your bites at the night market's stalls, the ferry horn, the bike's bell and its crash, the
// busker, the transit hall's lights going out, the gong, the stage's count, the follow spot, the
// firecrackers or the fireworks, the last five seconds, the whistle and the fanfare. On the big screen (and
// in practice): every punch, hit and bite in the room, and a light loop for the place. And the
// theatre's drill, counted big in the middle of the screen.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { BLACKOUT_MS, DRILL_BEAT_MS, DRILL_GO_MS, DRILL_MS, DRILL_WINDOW, PUNCH_WINDUP_MS, SPOT_MS, THIN_MS, type TagCall } from "../../engine";
import type { AwardView, EventView, GameView } from "../../room/protocol";
import { other, t, type Key } from "../i18n";
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

  // the round's last half minute: a chime as the crowd starts to leave
  useEffect(() => {
    if (game.thinning) sfx.thinning();
  }, [game.thinning]);

  // the transit hall: a light switch pulled, its lever's clack on the big screen (its puller's phone
  // hears it from the event, below; it's the only one told)
  const pulled = game.lights ? game.lights.box : -1;
  useEffect(() => {
    if (screen && pulled >= 0 && (game.lights?.sinceMs ?? Infinity) < 1_000) sfx.lever();
  }, [pulled, screen]);

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
      } else if (event.t === "bike") {
        // the seawall's bike knocked someone down: everyone hears it (anyone can be in its way)
        sfx.crash();
        if (event.onYou) buzz([40, 50, 90]);
      } else if (event.t === "decoy" && event.byYou) {
        // (only its maker hears of a distraction)
        sfx.psst();
      } else if (event.t === "lights" && event.byYou) {
        sfx.lever();
        buzz(24);
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

  // the ferry horn, the bike's bell, the busker, the lights going out, the gong, the stage's count, the
  // follow spot, the firecrackers, the fireworks
  useEffect(() => {
    if (moment === "horn") sfx.horn();
    if (moment === "bike") sfx.bell(game.moment?.bike?.sinceMs ?? 0);
    if (moment === "dance") sfx.busker();
    if (moment === "blackout") sfx.lightsOut(Math.max(0, BLACKOUT_MS - (game.moment?.endsInMs ?? BLACKOUT_MS)));
    if (moment === "gong") sfx.gong();
    if (moment === "spot") sfx.spot(Math.max(0, SPOT_MS - (game.moment?.endsInMs ?? SPOT_MS)));
    if (moment === "drill") sfx.drill(Math.max(0, DRILL_MS - (game.moment?.endsInMs ?? DRILL_MS)));
    if (moment === "crackers") sfx.crackers((game.moment?.crackers ?? []).map((cracker) => ({ landsInMs: cracker.landsInMs, bangsInMs: cracker.bangsInMs })));
    if (moment === "fireworks") sfx.fireworks();
  }, [moment]);

  // the last five seconds
  useEffect(() => {
    if (game.phase === "playing" && seconds > 0 && seconds <= 5) sfx.tick(seconds === 1);
  }, [seconds]);
}

/** a screen that shows a round within this long of its start opens on the camera's sweep (Arena3D) */
export const INTRO_WINDOW_MS = 2_500;

type Blow = Exclude<EventView["t"], "bite" | "feast" | "decoy" | "lights">;

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
    else if (event.t !== "decoy" && event.t !== "lights") blow ??= event;
  }
  return {
    impactId: blow?.id ?? 0,
    impactType: (blow?.t ?? "swing") as Blow,
    flash: bite ? { id: bite.id, stall: bite.stall ?? 0, feast: feast > bite.id } : null
  };
}

const MOMENT: Record<NonNullable<GameView["moment"]>["kind"], { text: Key; icon: IconName }> = {
  horn: { text: "momentHorn", icon: "ship" },
  bike: { text: "momentBike", icon: "bike" },
  dance: { text: "momentDance", icon: "note" },
  blackout: { text: "momentBlackout", icon: "bulb" },
  gong: { text: "momentGong", icon: "gong" },
  drill: { text: "momentDrill", icon: "fist" },
  spot: { text: "momentSpot", icon: "spot" },
  crackers: { text: "momentCrackers", icon: "cracker" },
  fireworks: { text: "momentFireworks", icon: "firework" }
};

/** How long the "the crowd is leaving" pill shows. */
const THINNING_SHOWN_MS = 5_000;

/**
 * The round's last half minute has started, the crowd is leaving (engine THIN_MS): said for a few
 * seconds, as soon as no moment's banner is up (a ferry's horn can sound just then, and goes first).
 */
function useThinningNews(game: GameView): boolean {
  const since = useRef<number | null>(null);
  const ready = game.phase === "playing" && game.thinning && !game.moment;
  if (!game.thinning) since.current = null;
  else if (ready && since.current === null) since.current = Date.now();
  // (the room's frames come many times a second while a round is on, so this is looked at often enough)
  return ready && since.current !== null && Date.now() - since.current < THINNING_SHOWN_MS;
}

/** The whole crowd stops, or starts to leave: say why, while it lasts (or `idle` when there's nothing to say). */
export function MomentBanner(props: { game: GameView; tv?: boolean; idle?: ComponentChildren }) {
  const moment = props.game.moment;
  const thinning = useThinningNews(props.game);
  if (props.game.phase !== "playing") return null;
  if (thinning) {
    return (
      <p class={`moment-banner${props.tv ? " is-tv" : ""}`} role="status" key="thinning">
        <Icon name="leave" size={props.tv ? 34 : 20} />
        <span>{t("thinning", { n: THIN_MS / 1_000 })}</span>
      </p>
    );
  }
  if (!moment) return <>{props.idle ?? null}</>;
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

const CALL: Record<TagCall, Key> = {
  first: "callFirst",
  double: "callDouble",
  triple: "callTriple",
  quadra: "callQuadra",
  penta: "callPenta",
  spree: "callSpree",
  rampage: "callRampage",
  shutdown: "callShutdown"
};
/** How big a moment each call is: its sound, from a first blood or a double up to a penta. */
const TIER: Record<TagCall, number> = { first: 1, double: 1, spree: 2, triple: 2, shutdown: 2, rampage: 3, quadra: 3, penta: 4 };
/** How long a call stays up (its CSS fades it out over the last --dur-exit). */
const CALL_MS = 1_900;

export interface Callout {
  call: TagCall;
  who?: string;
  you: boolean;
  id: number;
}

/**
 * The announcer, as in Honor of Kings (Steve, 2026-11-25): when a tag makes a call (engine tagCall:
 * first blood, a double kill and on, a spree, a rampage, a shutdown), every screen shows it for a
 * moment with who made it, and plays its stab; the one who made it feels it too.
 */
export function useCallout(events: readonly EventView[]): Callout | null {
  const last = events.length ? events[events.length - 1].id : 0;
  const seen = useRef(last);
  const [shown, setShown] = useState<Callout | null>(null);
  useEffect(() => {
    const fresh = events.filter((event) => event.id > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].id;
    const called = [...fresh].reverse().find((event) => event.call);
    if (!called?.call) return;
    setShown({ call: called.call, who: called.who, you: called.byYou, id: called.id });
    sfx.callout(TIER[called.call]);
    if (called.byYou) buzz([20, 40, 20, 40, 70]);
  }, [last]);
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), CALL_MS);
    return () => window.clearTimeout(timer);
  }, [shown?.id]);
  return shown;
}

/** The call on screen: who made it (you, on your own phone), the call big, and the other language under it. */
export function CalloutBanner(props: { callout: Callout | null; tv?: boolean }) {
  const callout = props.callout;
  if (!callout) return null;
  return (
    <div class={`callout is-${callout.call}${callout.you ? " is-you" : ""}${props.tv ? " is-tv" : ""}`} role="status" key={callout.id}>
      {(callout.you || callout.who) && <span class="callout-who">{callout.you ? t("marker") : callout.who}</span>}
      <strong class="callout-call">{t(CALL[callout.call])}</strong>
      <span class="callout-other" aria-hidden="true">
        {other(CALL[callout.call])}
      </span>
    </div>
  );
}

const AWARD: Record<AwardView["award"], { title: Key; why: Key }> = {
  double: { title: "awardDouble", why: "awardDoubleWhy" },
  triple: { title: "awardTriple", why: "awardTripleWhy" },
  quadra: { title: "awardQuadra", why: "awardQuadraWhy" },
  penta: { title: "awardPenta", why: "awardPentaWhy" },
  eagleEye: { title: "awardEagleEye", why: "awardEagleEyeWhy" },
  ghost: { title: "awardGhost", why: "awardGhostWhy" },
  friendlyFire: { title: "awardFriendlyFire", why: "awardFriendlyFireWhy" },
  airPunch: { title: "awardAirPunch", why: "awardAirPunchWhy" },
  punchingBag: { title: "awardPunchingBag", why: "awardPunchingBagWhy" },
  foodie: { title: "awardFoodie", why: "awardFoodieWhy" }
};

/** The round's nicknames, one per player at most. */
export function Awards(props: { awards: AwardView[]; label?: Key }) {
  if (!props.awards.length) return null;
  return (
    <ul class="awards" aria-label={t(props.label ?? "awards")}>
      {props.awards.map((item, index) => (
        <li key={index} class={`award${item.you ? " is-you" : ""}`} style={`--i: ${index}`}>
          <span class="award-name">{item.name}</span>
          <b class="award-title">{t(AWARD[item.award].title)}</b>
          <span class="award-why">{t(AWARD[item.award].why)}</span>
        </li>
      ))}
    </ul>
  );
}
