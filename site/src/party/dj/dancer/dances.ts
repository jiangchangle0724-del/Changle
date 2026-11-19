/**
 * The big screen's dancer since Nov 18 (Steve on Nov 14: "我要跟真人看起来一样…包括动作这些方面都需要去深度优化"):
 * a real dancer's motion capture (Adobe Mixamo, free to use in a project, downloaded with Steve's
 * account) on her model (her.glb.gz: the design's photos on a TRELLIS.2 model, made by
 * site/scripts/dj-dancer/, README there). This file says which dance she dances when; no three.js
 * here (her.ts loads her and the files).
 *
 * Each dance is a loop of whole bars cut on its own beat, played on the speaker's: a beat of the song
 * is a beat of the dance. So the dances picked are the ones whose own tempo is near the song's (within
 * a quarter), from those that go with the night's stretch, eight bars each, then the next.
 */
import type { Mood } from "../../../shared/dj/dance";

export const DANCER_DIR = "/models/dancer";
export const herFile = () => `${DANCER_DIR}/her.glb.gz`;
export const danceFile = (id: string) => `${DANCER_DIR}/dance/${id}.bin.gz`;

/**
 * Her dances: the file's id, its own tempo (beats a minute, as the motion's own beat was found), the
 * night's stretches it goes with. Mixamo's names in site/scripts/dj-dancer/README.md.
 */
export const DANCES: readonly { id: string; bpm: number; moods: readonly Mood[] }[] = [
  { id: "rumba", bpm: 101.4, moods: ["warm", "cool", "slow"] },
  { id: "belly_slow", bpm: 83.2, moods: ["slow", "cool"] },
  { id: "bodywave", bpm: 128.6, moods: ["warm", "build"] },
  { id: "wave", bpm: 102.9, moods: ["warm", "build"] },
  { id: "belly", bpm: 124.1, moods: ["warm", "build", "cool"] },
  { id: "booty", bpm: 100.2, moods: ["build", "peak"] },
  { id: "hiphop", bpm: 117.2, moods: ["peak", "build"] },
  { id: "house", bpm: 112.6, moods: ["peak"] },
  { id: "samba", bpm: 87.3, moods: ["peak", "slow"] },
];

/** Standing, swaying a little, when no song plays: at their own tempo. */
export const IDLES: readonly { id: string; bpm: number }[] = [
  { id: "idle", bpm: 120.1 },
  { id: "idle2", bpm: 111 },
];

/** How long she dances one dance before the next: eight bars. */
export const DANCE_BEATS = 32;
/** A dance's own tempo this near the song's (a quarter faster or slower) looks right on it. */
const NEAR = Math.log(1.25);

/**
 * The dance on beat `b` of a song at `bpm`, in `mood`'s stretch: every 32 beats the next of those
 * that go with it and are near its tempo (the nearest two if none is), the same on every screen.
 */
export function danceAt(b: number, mood: Mood, bpm: number): string {
  const t = Number.isFinite(bpm) && bpm > 40 ? bpm : 120;
  const off = (d: { bpm: number }) => Math.abs(Math.log(t / d.bpm));
  const pool = DANCES.filter((d) => d.moods.includes(mood));
  const near = pool.filter((d) => off(d) < NEAR);
  const list = near.length ? near : [...pool].sort((x, y) => off(x) - off(y)).slice(0, 2);
  const k = Math.floor(b / DANCE_BEATS);
  return list[((k % list.length) + list.length) % list.length].id;
}

/** The dance after the one on beat `b` (fetched before it's needed). */
export const danceNext = (b: number, mood: Mood, bpm: number) => danceAt(b + DANCE_BEATS, mood, bpm);

/** Her idle, when nothing plays: one, then the other, a minute each. */
export function idleAt(seconds: number): { id: string; bpm: number } {
  return IDLES[Math.floor(seconds / 60) % IDLES.length];
}

/** A dance file's header. */
export type DanceHead = { id: string; fps: number; frames: number; beats: number; beat: number; bpm: number; energy: number; bones: string[] };

/**
 * A dance file, unzipped, read: its header, then each frame's bone turns (four 16-bit numbers a bone)
 * and the hips' place over where they stand (millimetres). site/scripts/dj-dancer/mocap/pack.ts writes them.
 */
export function readDance(buf: ArrayBuffer): { head: DanceHead; q: Int16Array; hips: Int16Array } {
  const v = new DataView(buf);
  const n = v.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as DanceHead;
  const at = 4 + n + ((4 - ((4 + n) % 4)) % 4);
  const qn = head.frames * head.bones.length * 4;
  if (buf.byteLength < at + qn * 2 + head.frames * 6) throw new Error("dance file short");
  const q = new Int16Array(buf, at, qn);
  const hips = new Int16Array(buf, at + qn * 2, head.frames * 3);
  return { head, q, hips };
}
