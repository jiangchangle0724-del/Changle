import type { T } from "../i18n";

/**
 * Name That Tune: well-known melodies that are all in the public domain (traditional songs and
 * pieces first published long before 1929), played on the built-in synth.
 *
 * Notation, one token per note: pitch and octave ("C4", "F#5", "Bb3") or "r" for a rest,
 * then the length: no mark is one beat, each "/" halves it, each "-" adds a beat, "." makes it
 * one and a half times as long. "G4/." is a dotted eighth, "C5--" a dotted half (three beats).
 */
export type Tune = { title: T; bpm: number; notes: string; up?: number };

const s = (zh: string, en: string): T => ({ zh, en });
const tune = (zh: string, en: string, bpm: number, notes: string, up = 0): Tune => ({ title: s(zh, en), bpm, notes, up });

export const TUNES: Tune[] = [
  tune("欢乐颂", "Ode to Joy", 132, "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4. D4/ D4- E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4. C4/ C4-", 12),
  tune("小星星", "Twinkle, Twinkle, Little Star", 120, "C4 C4 G4 G4 A4 A4 G4- F4 F4 E4 E4 D4 D4 C4- G4 G4 F4 F4 E4 E4 D4-", 12),
  tune("两只老虎", "Frère Jacques", 132, "C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4- E4 F4 G4- G4/ A4/ G4/ F4/ E4 C4 G4/ A4/ G4/ F4/ E4 C4 C4 G3 C4- C4 G3 C4-", 12),
  tune("生日快乐", "Happy Birthday", 110, "G4/. G4// A4 G4 C5 B4- G4/. G4// A4 G4 D5 C5- G4/. G4// G5 E5 C5 B4 A4- F5/. F5// E5 C5 D5 C5-"),
  tune("铃儿响叮当", "Jingle Bells", 150, "E4 E4 E4- E4 E4 E4- E4 G4 C4. D4/ E4--- F4 F4 F4. F4/ F4 E4 E4 E4/ E4/ E4 D4 D4 E4 D4- G4-", 12),
  tune("致爱丽丝", "Für Elise", 150, "E5/ D#5/ E5/ D#5/ E5/ B4/ D5/ C5/ A4- r/ C4/ E4/ A4/ B4- r/ E4/ G#4/ B4/ C5- r/ E4/ E5/ D#5/ E5/ D#5/ E5/ B4/ D5/ C5/ A4-"),
  tune("玛丽有只小羊羔", "Mary Had a Little Lamb", 132, "E4 D4 C4 D4 E4 E4 E4- D4 D4 D4- E4 G4 G4- E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4---", 12),
  tune("伦敦桥要倒了", "London Bridge Is Falling Down", 126, "G4. A4/ G4 F4 E4 F4 G4- D4 E4 F4- E4 F4 G4- G4. A4/ G4 F4 E4 F4 G4- D4- G4- E4 C4--", 12),
  tune("划船歌", "Row, Row, Row Your Boat", 100, "C4. C4. C4 D4/ E4. E4 D4/ E4 F4/ G4-. C5/ C5/ C5/ G4/ G4/ G4/ E4/ E4/ E4/ C4/ C4/ C4/ G4 F4/ E4 D4/ C4-.", 12),
  tune("王老先生有块地", "Old MacDonald Had a Farm", 132, "G4 G4 G4 D4 E4 E4 D4- B4 B4 A4 A4 G4--- D4 G4 G4 G4 D4 E4 E4 D4- B4 B4 A4 A4 G4---", 12),
  tune("扬基歌", "Yankee Doodle", 132, "C4 C4 D4 E4 C4 E4 D4 G3 C4 C4 D4 E4 C4- B3- C4 C4 D4 E4 F4 E4 D4 C4 B3 G3 A3 B3 C4- C4-", 12),
  tune("哦！苏珊娜", "Oh! Susanna", 120, "C4/ D4/ E4 G4 G4. A4/ G4 E4 C4. D4/ E4 E4 D4 C4 D4-- C4/ D4/ E4 G4 G4. A4/ G4 E4 C4. D4/ E4 E4 D4 D4 C4--", 12),
  tune("友谊地久天长", "Auld Lang Syne", 96, "G3 C4. B3/ C4 E4 D4. C4/ D4 E4/ D4/ C4. C4/ E4 G4 A4-- A4 G4. E4/ E4 C4 D4. C4/ D4 E4/ D4/ C4. A3/ A3 G3 C4--", 12),
  tune("奇异恩典", "Amazing Grace", 92, "G3 C4- E4/ C4/ E4- D4 C4- A3 G3- G3 C4- E4/ C4/ E4- D4 G4--", 12),
  tune("平安夜", "Silent Night", 96, "G4. A4/ G4 E4-. G4. A4/ G4 E4-. D5- D5 B4-. C5- C5 G4-.", 12),
  tune("我们祝你圣诞快乐", "We Wish You a Merry Christmas", 150, "G4 C5 C5/ D5/ C5/ B4/ A4 A4 A4 D5 D5/ E5/ D5/ C5/ B4 G4 G4 E5 E5/ F5/ E5/ D5/ C5 A4 G4/ G4/ A4 D5 B4 C5-"),
  tune("绿袖子", "Greensleeves", 116, "A4 C5- D5 E5. F5/ E5 D5- B4 G4. A4/ B4 C5- A4 A4. G#4/ A4 B4- G#4 E4- A4 C5- D5 E5. F5/ E5 D5- B4 G4. A4/ B4 C5. B4/ A4 G#4. F#4/ G#4 A4--"),
  tune("弦乐小夜曲", "Eine kleine Nachtmusik", 132, "G4 r/ D4/ G4 r/ D4/ G4/ D4/ G4/ B4/ D5 r C5 r/ A4/ C5 r/ A4/ C5/ A4/ F#4/ A4/ D4 r", 12),
  tune("艺人", "The Entertainer", 100, "D4/ D#4/ E4/ C5 E4/ C5 E4/ C5-- C5/ D5/ D#5/ E5/ C5/ D5/ E5 B4/ D5 C5--", 12),
  tune("天鹅湖", "Swan Lake", 84, "F#4--- B3/ C#4/ D4/ E4/ F#4-. D4/ F#4-. D4/ F#4-. B3/ D4/ B3/ G3/ D4/ B3---", 12),
  tune("在山大王的宫殿里", "In the Hall of the Mountain King", 132, "B3/ C#4/ D4/ E4/ F#4/ D4/ F#4 F4/ C#4/ F4 E4/ C4/ E4 B3/ C#4/ D4/ E4/ F#4/ D4/ F#4/ B4/ A4/ F#4/ D4/ F#4/ A4-", 12),
  tune("哈巴涅拉（卡门）", "Habanera (Carmen)", 92, "D5 C#5/ C5- B4/ Bb4/ A4/ A4/ Ab4/ G4 F4/ F4/ E4-"),
  tune("卡农", "Canon in D", 100, "F#5- E5- D5- C#5- B4- A4- B4- C#5- D5 C#5 B4 A4 G4 F#4 G4 E4"),
  tune("土耳其进行曲", "Turkish March", 132, "B4/ A4/ G#4/ A4/ C5- D5/ C5/ B4/ C5/ E5- F5/ E5/ D#5/ E5/ B5/ A5/ G#5/ A5/ B5/ A5/ G#5/ A5/ C6-"),
  tune("蓝色多瑙河", "The Blue Danube", 156, "C4 C4 E4 G4 G4- r G5 G5 r E5 E5 r C4 C4 E4 G4 G4- r G5 G5 r F5 F5", 12),
  tune("命运交响曲", "Beethoven's Fifth Symphony", 108, "r/ G4/ G4/ G4/ Eb4--- r/ F4/ F4/ F4/ D4---", 12),
  tune("莫扎特第 40 号交响曲", "Mozart's Symphony No. 40", 120, "Eb5/ D5/ D5 Eb5/ D5/ D5 Eb5/ D5/ D5 Bb5- r Bb5/ A5/ G5 G5/ F5/ Eb5 Eb5/ D5/ C5 C5-"),
  tune("婚礼进行曲", "Here Comes the Bride (Bridal Chorus)", 84, "C4 F4. F4/ F4- C4 G4. E4/ F4- C4 F4. Bb4/ Bb4 A4. G4/ F4. E4/ F4 G4-", 12),
  tune("茉莉花", "Jasmine Flower (Mo Li Hua)", 76, "E4 E4/ G4/ A4/ C5/ C5/ A4/ G4 G4/ A4/ G4- E4 E4/ G4/ A4/ C5/ C5/ A4/ G4 G4/ A4/ G4- G4 G4 G4 E4/ G4/ A4 A4 G4-", 12),
  tune("送别", "Farewell (Song Bie)", 88, "G4 E4/ G4/ C5-- A4 C5 G4-- G4 C4/ D4/ E4 D4/ C4/ D4--- G4 E4/ G4/ C5. B4/ A4 C5 G4-- G4 D4/ E4/ F4. B3/ C4---", 12),
  tune("康康舞曲", "Can-Can", 150, "C4- D4/ F4/ E4/ D4/ G4 G4 G4/ A4/ E4/ F4/ D4 D4 D4/ F4/ E4/ D4/ C4/ C5/ B4/ A4/ G4/ F4/ E4/ D4/ C4-", 12),
  tune("蟑螂之歌", "La Cucaracha", 150, "C4/ C4/ C4/ F4. A4/ r C4/ C4/ C4/ F4. A4/ r F4 F4/ E4/ E4/ D4/ D4/ C4-", 12),
  tune("装饰大厅", "Deck the Halls", 120, "G4. F4/ E4 D4 C4 D4 E4 C4 D4/ E4/ F4/ D4/ E4. D4/ C4 B3 C4-", 12),
  tune("克莱门汀", "Oh My Darling, Clementine", 120, "C4/. C4// C4 G3 E4/. E4// E4 C4 C4/. E4// G4. G4/ F4/ E4/ D4--", 12),
  tune("威廉·退尔序曲", "William Tell Overture", 150, "G4/ G4/ G4 G4/ G4/ G4 G4/ G4/ C5 D5 E5 G4/ G4/ G4 G4/ G4/ G4 G4/ G4/ C5 D5 E5"),
  tune("勃拉姆斯摇篮曲", "Brahms' Lullaby", 100, "E4/ E4/ G4-. E4/ E4/ G4-. E4/ G4/ C5 B4. A4/ A4 G4 D4/ E4/ F4 D4 D4/ E4/ F4-. D4/ F4/ B4/ A4/ G4 B4 C5-.", 12),
];

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** [midi note (0 = rest), beats] for each token. */
export function parseTune(notes: string, up = 0): [number, number][] {
  return notes
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const m = /^([A-G])([#b]?)(\d)|^r/.exec(tok);
      if (!m) throw new Error(`bad note ${tok}`);
      const rest = tok.startsWith("r");
      const len = tok.slice(rest ? 1 : m[0].length);
      let beats = 1;
      for (const ch of len) {
        if (ch === "/") beats /= 2;
        else if (ch === "-") beats += 1;
        else if (ch === ".") beats *= 1.5;
      }
      if (rest) return [0, beats] as [number, number];
      const midi = 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + up;
      return [midi, beats] as [number, number];
    });
}

/** How many notes each clip plays: a teaser, a bit more, then the whole phrase (up to 13 seconds). */
export const STAGE_NOTES = [4, 7, 99];
export const MAX_CLIP_S = 13;
/** When each clip starts, after the first, in ms. */
export const STAGE_GAPS = [0, 8000, 18000];
export const LISTEN_MS = 34_000;

/** The notes of one clip, cut to its length. */
export function clipOf(t: Tune, stage: number): [number, number][] {
  const all = parseTune(t.notes, t.up);
  const want = STAGE_NOTES[Math.min(stage, STAGE_NOTES.length - 1)];
  const out: [number, number][] = [];
  let count = 0;
  let beats = 0;
  for (const [n, b] of all) {
    if (count >= want || (beats * 60) / t.bpm >= MAX_CLIP_S) break;
    out.push([n, b]);
    beats += b;
    if (n > 0) count++;
  }
  return out;
}
