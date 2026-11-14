import { bus, onAudioReset, unlockAudio } from "../../../lib/audio/engine";
import { SfxPlayer } from "./player";

/**
 * The sound board on a phone with no big screen on at the table (Steve on Nov 14: "手机在没有连接
 * 电视的时候也可以在自己的手机上播放音效"): a sound pressed plays on that phone itself, in the site's
 * own sound (lib/audio/engine.ts: woken by the tap, quiet when this phone's sound is off). The room
 * still hears of it (the other phones say who played what); only the phone that pressed plays it.
 */
let player: SfxPlayer | null = null;
let on: AudioContext | null = null;
let hooked = false;

/** Inside the tap: sound `i` here. False when this phone's sound is off. */
export function playHere(i: number): boolean {
  unlockAudio();
  const b = bus();
  if (!b) return false;
  if (!hooked) {
    hooked = true;
    // (a context the engine made again: a player for the new one)
    onAudioReset(() => {
      player?.dispose();
      player = null;
      on = null;
    });
  }
  if (!player || on !== b.c) {
    player?.dispose();
    player = new SfxPlayer(b.c, b.dry);
    on = b.c;
  }
  void player.play(i);
  return true;
}
