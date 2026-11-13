// What a round sounds like, and the crowd's moments on screen. On a phone: your own punches, hits and
// spills, the ferry horn, the busker or the gong, the last five seconds, the whistle and the fanfare.
// On the big screen (and in practice): every punch and hit in the room, and a light loop for the place.
import { useEffect, useRef } from "preact/hooks";
import type { AwardView, GameView } from "../../room/protocol";
import { t, type Key } from "../i18n";
import { buzz, installAudioUnlock, sfx, startMusic, stopMusic } from "../sound";
import { Icon } from "./chrome";

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

  // the ferry horn, the busker, the gong
  const moment = game.moment?.kind ?? null;
  useEffect(() => {
    if (moment === "horn") sfx.horn();
    if (moment === "dance") sfx.busker();
    if (moment === "gong") sfx.gong();
  }, [moment]);

  // the last five seconds
  useEffect(() => {
    if (game.phase === "playing" && seconds > 0 && seconds <= 5) sfx.tick(seconds === 1);
  }, [seconds]);
}

const MOMENT: Record<NonNullable<GameView["moment"]>["kind"], Key> = { horn: "momentHorn", dance: "momentDance", gong: "momentGong" };

/** The whole crowd stops: say why, while it lasts. */
export function MomentBanner(props: { game: GameView; tv?: boolean }) {
  const moment = props.game.moment;
  if (!moment || props.game.phase !== "playing") return null;
  return (
    <p class={`moment-banner${props.tv ? " is-tv" : ""}`} role="status" key={moment.kind}>
      <Icon name={moment.kind === "horn" ? "ship" : moment.kind === "dance" ? "note" : "gong"} size={props.tv ? 34 : 20} />
      <span>{t(MOMENT[moment.kind])}</span>
    </p>
  );
}

const AWARD: Record<AwardView["award"], { title: Key; why: Key }> = {
  eagleEye: { title: "awardEagleEye", why: "awardEagleEyeWhy" },
  ghost: { title: "awardGhost", why: "awardGhostWhy" },
  friendlyFire: { title: "awardFriendlyFire", why: "awardFriendlyFireWhy" },
  airPunch: { title: "awardAirPunch", why: "awardAirPunchWhy" },
  punchingBag: { title: "awardPunchingBag", why: "awardPunchingBagWhy" }
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
