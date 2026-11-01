import { haptic, sfx } from "../lib/sfx";
import { useRoom, useRoomEvent } from "./RoomContext";

/**
 * What the table sounds like when something happens on any phone.
 * Things that happen to you are full volume and buzz; things that happen across the table are softer.
 */
export function useTableSounds() {
  const { me, room } = useRoom();
  // the DJ booth's phones stay silent: the only sound is the speaker's
  const booth = room?.game?.id === "dj";
  useRoomEvent((e) => {
    if (booth) return;
    switch (e.k) {
      case "react":
        sfx.reaction(e.r, e.pid === me ? 1 : 0.75);
        return;
      case "join":
        if (e.pid !== me) sfx.join();
        return;
      case "left":
        if (e.pid !== me) sfx.leave();
        return;
      case "host":
        if (e.pid === me) {
          sfx.yourTurn();
          haptic([10, 30, 10]);
        }
        return;
      case "drank":
        sfx.gulps(e.pid === me ? 3 : 2, e.pid === me ? 0.9 : 0.5);
        return;
      case "fx":
        break;
      default:
        return;
    }
    const mine = e.pid === me;
    switch (e.fx) {
      case "start":
        sfx.drum(0.8);
        window.setTimeout(() => sfx.gong("small", 0.9), 150);
        return;
      case "card":
        sfx.cardSlide();
        window.setTimeout(() => sfx.flip(), 160);
        return;
      case "shuffle":
        sfx.shuffle();
        return;
      case "camera":
        sfx.shutter();
        haptic(30);
        return;
      case "nose":
        sfx.honk();
        if (!mine) haptic([20, 40, 20]);
        return;
      case "wc":
        sfx.woodblock(0.8, 0.8);
        window.setTimeout(() => sfx.safe(), 120);
        return;
      case "dice": {
        sfx.dice(0.95, mine ? 1 : 0.8);
        const [a, b] = e.data ?? [0, 0];
        const sum = a + b;
        window.setTimeout(() => {
          if (a === 1 && b === 1) sfx.gong("small");
          else if (sum === 7) sfx.pour(0.6);
          else if (sum === 8 || sum === 9) sfx.drum();
          else sfx.settle();
        }, 980);
        return;
      }
      case "reveal":
        sfx.reveal();
        return;
      case "correct":
        sfx.correct();
        if (mine) haptic([12, 30, 12]);
        return;
      case "crown":
        sfx.crown();
        if (mine) haptic([20, 40, 30]);
        return;
      case "win":
        sfx.win();
        return;
      case "collide":
        sfx.clash();
        return;
      case "grab": {
        // each number grabbed climbs one step up the scale
        const n = e.data?.[0] ?? 2;
        sfx.pluck(Math.min(10, Math.max(0, n - 2)), mine ? 1 : 0.8);
        if (mine) haptic(10);
        return;
      }
      case "called":
        sfx.woodblock(1.2, 0.8);
        window.setTimeout(() => sfx.pop(), 90);
        return;
      case "wrong":
        sfx.wrong();
        if (mine) haptic(120);
        return;
      case "level":
        // everyone got under the bar: a lift, not the chime each passer already heard
        sfx.lift();
        return;
      case "play":
        // a card lands on the table
        sfx.cardSlide();
        window.setTimeout(() => sfx.flip(), 110);
        if (mine) haptic(8);
        return;
      case "trick":
        // the trick is swept up; a little ding if it's yours
        sfx.whoosh(0.3, false);
        if (mine) {
          window.setTimeout(() => sfx.pluck(7, 0.8), 180);
          haptic([10, 30, 10]);
        }
        return;
      // "timeup" is knocked by the timer on every phone already; "buzz", "freeze", "out" and
      // "award" are played by the game screens themselves, on the beat
      default:
        return;
    }
  });
}
