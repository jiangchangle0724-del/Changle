/**
 * The big screen's dancer since Nov 18 (Steve on Nov 14: "我要跟真人看起来一样…包括动作这些方面都需要去深度优化"):
 * a real dancer's motion capture (Adobe Mixamo, free to use in a project, downloaded with Steve's
 * account) on her model (the design's photos on a TRELLIS.2 model, made by site/scripts/dj-dancer/,
 * README there). This file says what she wears and dances when; no three.js here (her.ts loads her
 * and the files).
 *
 * Her looks (Steve on Nov 18: "要根据不同风格的歌跳不同的舞，比如快节奏就跳街舞sexy一点的，抒情的感情歌就要穿
 * 的像初恋纯真一样的短裙，跳温柔柔和一点的。不同的曲风设计不同的衣服，不同的舞蹈，包括背景的灯光"): a song's
 * own tempo says which: a ballad (sweet: the first-love skirt, gentle dances, soft lights), one in
 * between (party), a fast one (club: her club outfit, street dances, hard lights). With the DJ playing,
 * the night's stretch says.
 *
 * Each dance is a loop of whole bars cut on its own beat, played on the speaker's: a beat of the song
 * is a beat of the dance. So the dances picked are the ones whose own tempo is near the song's (within
 * a quarter), from the look's, eight bars each, then the next.
 */
import type { Mood } from "../../../shared/dj/dance";

export const DANCER_DIR = "/models/dancer";
export type Look = "sweet" | "party" | "club";
export const LOOKS: readonly Look[] = ["sweet", "party", "club"];
/**
 * The outfit each look wears: its model's file (`her.glb.gz` the club one she came in on Nov 18;
 * `her-sweet.glb.gz` the first-love blouse and pleated skirt, `her-party.glb.gz` the rose-gold
 * sequin party dress, Nov 19 and 20).
 */
// Her outfits, all on the first dancer (Nov 21, Steve: "直接用第一个人物的模型脸，只给她换几套衣服",
// "不同的歌曲搭配不同的衣服和舞蹈"): each look's, a song wearing one of them (outfitFor); the first one
// with no song. "club" is her own (her.glb.gz), the rest drawn on her (site/scripts/dj-dancer/README.md).
// (her-qipao: the pink brocade qipao set; her-lace: the white off-shoulder lace dress; her-leather: the
// lace cami, black leather jacket and skirt; her-eyelet: the white eyelet dress; her-cardigan: the black
// cardigan and white midi skirt: from the photos Steve sent on Nov 21)
// (her-sweet: the first-love blouse and pleated skirt; her-party: the rose-gold sequin dress: the first
// outfits' designs, on her since Nov 21 too, Steve: "旧衣服也可以加进去套在现有的模特身上")
// (her-gown, her-ballroom, her-classical: a wine-red evening gown, a champagne ballroom dress and a jade
// Chinese classical dance costume, since Nov 21 too; Steve: "晚礼服、摩登舞裙、古典舞服")
export const OUTFITS: Record<Look, readonly string[]> = {
  sweet: ["eyelet", "sweet", "cardigan", "qipao", "classical"],
  party: ["lace", "party", "qipao", "leather", "gown", "ballroom"],
  club: ["club", "leather", "party", "lace"],
};
/** The outfit she wears for a song (its id: the same song, the same outfit), in its look. */
export function outfitFor(look: Look, song: string | null): string {
  const list = OUTFITS[look];
  if (!song) return list[0];
  let h = 2166136261;
  for (let i = 0; i < song.length; i++) h = Math.imul(h ^ song.charCodeAt(i), 16777619);
  return list[(h >>> 0) % list.length];
}
export const herFile = (outfit = "club") => (outfit === "club" ? `${DANCER_DIR}/her.glb.gz` : `${DANCER_DIR}/her-${outfit}.glb.gz`);
export const danceFile = (id: string) => `${DANCER_DIR}/dance/${id}.bin.gz`;

/** A whole song's look by its own tempo (as found): under 90 beats a minute a ballad, from 115 a fast one. */
export const SWEET_BPM = 90;
export const CLUB_BPM = 115;
export function lookOf(songBpm: number | null | undefined, mood: Mood): Look {
  if (typeof songBpm === "number" && Number.isFinite(songBpm) && songBpm >= 40) return songBpm < SWEET_BPM ? "sweet" : songBpm < CLUB_BPM ? "party" : "club";
  // the DJ playing (or a song whose tempo wasn't found): the night's stretch
  return mood === "cool" || mood === "slow" ? "sweet" : mood === "warm" ? "party" : "club";
}

/**
 * Her dances: the file's id, its own tempo (beats a minute, as the motion's own beat was found), the
 * looks it goes with. Mixamo's names in site/scripts/dj-dancer/README.md.
 */
export const DANCES: readonly { id: string; bpm: number; looks: readonly Look[]; rare?: boolean }[] = [
  { id: "rumba", bpm: 101.4, looks: ["sweet", "party"] },
  { id: "bodywave", bpm: 128.6, looks: ["club"] },
  // (Nov 21, Steve: "这个舞蹈动作我不喜欢少出现一点": half as often as the others)
  { id: "belly", bpm: 124.1, looks: ["party", "club"] },
  { id: "booty", bpm: 100.2, looks: ["club"] },
  { id: "hiphop", bpm: 117.2, looks: ["club"] },
  { id: "samba", bpm: 87.3, looks: ["party"] },
  // (standing, swaying: gentle enough for a ballad, at its tempo)
  { id: "idle", bpm: 120.1, looks: ["sweet"] },
  { id: "idle2", bpm: 111, looks: ["sweet"] },
  // Nov 20 (Steve: "要根据不同风格的歌跳不同的舞"): a shy one and a salsa step for a ballad, salsa for the
  // party, sexier street ones for the club
  { id: "timid", bpm: 98.1, looks: ["sweet"] },
  { id: "salsa_side", bpm: 105.9, looks: ["sweet", "party"] },
  { id: "salsa", bpm: 111.2, looks: ["party"] },
  { id: "ribpops", bpm: 93.1, looks: ["party", "club"] },
  { id: "shimmy", bpm: 145.6, looks: ["club"] },
  // Nov 21 (Steve: "学习这两个视频的舞蹈动作", two YouTube dance covers): phrases of ILLIT "It's Me"
  // and KATSEYE "Gnarly", learnt from the videos (site/scripts/dj-dancer/mocap/fromvideo.ts); the
  // phrases that didn't pass the motion checks left out
  { id: "itsme1", bpm: 143.6, looks: ["club"] },
  { id: "itsme4", bpm: 143.6, looks: ["club"] },
  { id: "itsme5", bpm: 143.6, looks: ["club"] },
  { id: "gnarly1", bpm: 136, looks: ["club"] },
  { id: "gnarly4", bpm: 136, looks: ["club"] },
  { id: "gnarly5", bpm: 136, looks: ["club"] },
  { id: "gnarly7", bpm: 136, looks: ["club"] },
  // Chinese classical dance (古典舞身韵, the arm-swing set 摇臂组合), learnt from a front-on demonstration
  // in practice clothes found on YouTube (Nov 21; Steve: "你自己去youtube 找视频学习"): the two phrases of
  // eight that passed the motion checks
  { id: "shenyun5", bpm: 107.7, looks: ["sweet"] },
  // ballet (a centre adagio and port de bras), learnt from a teacher's class demonstration found on YouTube
  // (Nov 21; Steve: "一个接一个继续做"): the two phrases of seven that passed every check, turned to face the room
  { id: "ballet3", bpm: 92.3, looks: ["sweet"] },
  // (Nov 21: "kickstep" left out. Her feet slid more in it than the dancer's did: tests/dancer.test.ts)
];

/**
 * Her walk across the stage, one a look (Steve on Nov 18: "她是可以在整个舞台从左到右走动的"): Mixamo's
 * walks done in place (Feminine Walk Forward, Catwalk Walk Forward, Female Sexy Walk), cut and packed
 * like her dances. Their own steps a minute, and how far a step takes her (`stride`, metres: how far
 * her planted foot slides back in one, so the stage going by under her keeps her feet still on it).
 */
export const WALKS: Record<Look, { id: string; bpm: number; stride: number }> = {
  sweet: { id: "walk_soft", bpm: 124.1, stride: 0.73 },
  party: { id: "walk_cat", bpm: 100, stride: 0.57 },
  club: { id: "walk_sexy", bpm: 87.8, stride: 0.68 },
};

/**
 * Steps a beat when she walks to a song at `bpm`: one, or one every other beat when the song is much
 * faster than the walk's own pace (a strut on a fast song, not a hurry). A slow song: slow steps.
 */
export const stepsPerBeat = (walkBpm: number, bpm: number) => (bpm / walkBpm > Math.SQRT2 ? 0.5 : 1);

/** Standing, swaying a little, when no song plays: at their own tempo. */
export const IDLES: readonly { id: string; bpm: number }[] = [
  { id: "idle", bpm: 120.1 },
  { id: "idle2", bpm: 111 },
];

/** How long she dances one dance before the next: eight bars. */
export const DANCE_BEATS = 32;
/** A dance's own tempo this near the song's (a quarter faster or slower) looks right on it. */
// (Nov 25; Steve: "看看舞蹈的速度能不能稍微慢一点看起来要真实自然": a dance sped up 20 to 25% to a song looked
// hurried. A dance is danced at most 12% faster than it was danced, and as much as 20% slower; a song too
// fast for it may have it half-time, a step every two beats.)
const FASTEST = 1.12;
const SLOWEST = 0.8;
/** How a dance goes to a song: 1 on its beats, 0.5 half-time; null when neither looks natural. */
export function danceRate(id: string, bpm: number): 1 | 0.5 | null {
  const d = DANCES.find((x) => x.id === id);
  const t = Number.isFinite(bpm) && bpm > 40 ? bpm : 120;
  if (!d) return null;
  const f = t / d.bpm;
  if (f <= FASTEST && f >= SLOWEST) return 1;
  // (half-time may go slower still: a ballad's beat is often heard twice as fast as it's felt)
  if (f / 2 <= FASTEST && f / 2 >= 0.65) return 0.5;
  return null;
}

/**
 * The dance on beat `b` of a song at `bpm`, in `look`: every 32 beats the next of the look's that are
 * near its tempo (the nearest two if fewer are: never one dance all song), the same on every screen.
 */
export function danceAt(b: number, look: Look, bpm: number): string {
  const t = Number.isFinite(bpm) && bpm > 40 ? bpm : 120;
  // (how far from natural: faster counts double)
  const off = (d: { bpm: number }) => {
    const f = [t / d.bpm, t / d.bpm / 2].reduce((a, b) => (Math.abs(Math.log(b)) < Math.abs(Math.log(a)) ? b : a));
    return f > 1 ? 2 * Math.log(f) : -Math.log(f);
  };
  const pool = DANCES.filter((d) => d.looks.includes(look));
  const near = pool.filter((d) => danceRate(d.id, t) !== null);
  const some = near.length >= 2 ? near : [...pool].sort((x, y) => off(x) - off(y)).slice(0, 2);
  // (round them twice, a rare one only the second time)
  const list = [...some.filter((d) => !d.rare), ...some];
  const k = Math.floor(b / DANCE_BEATS);
  return list[((k % list.length) + list.length) % list.length].id;
}

/** The dance after the one on beat `b` (fetched before it's needed). */
export const danceNext = (b: number, look: Look, bpm: number) => danceAt(b + DANCE_BEATS, look, bpm);

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
