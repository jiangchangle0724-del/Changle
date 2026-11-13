// What a round sounds like, and the crowd's moments on screen. On a phone: your own punches, hits and
// spills, your bites at the night market's stalls, the ferry horn, the busker, the gong or the
// fireworks, the last five seconds, the whistle and the fanfare. On the big screen (and in practice):
// every punch, hit and bite in the room, and a light loop for the place.
import { useEffect, useRef } from "preact/hooks";
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
      }
    }
  }, [game.events]);

  // a punch thrown: your own (a phone), or anyone's (the big screen sees them all anyway)
  const poses = useRef<string[]>([]);
  useEffect(() => {
    game.avatars.forEach((avatar, index) => {
      const before = poses.current[index];
      if (avatar.p === "windup" && before !== "windup" && before !== undefined && (screen || avatar.me)) sfx.whoosh();
      poses.current[index] = avatar.p;
    });
  }, [game.avatars]);

  // the ferry horn, the busker, the gong, the fireworks
  const moment = game.moment?.kind ?? null;
  useEffect(() => {
    if (moment === "horn") sfx.horn();
    if (moment === "dance") sfx.busker();
    if (moment === "gong") sfx.gong();
    if (moment === "fireworks") sfx.fireworks();
  }, [moment]);

  // the last five seconds
  useEffect(() => {
    if (game.phase === "playing" && seconds > 0 && seconds <= 5) sfx.tick(seconds === 1);
  }, [seconds]);
}

type Blow = Exclude<EventView["t"], "bite" | "feast">;

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
    else blow ??= event;
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
