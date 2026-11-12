// How the coach looks for each song: what it wears (its colours and extras: PSY's sunglasses and bow
// tie, a cowboy hat for Y.M.C.A., a kimono for 極楽浄土), how big it dances (its moves pushed further
// than the steps need: a performer's version, not a teacher's), and its face as it goes (a grin, a
// wink, a cool smirk behind the shades). The library's dances keep the coach's own look.
import { SONGS, songMoves } from "../../shared/songs";

/** The coach's faces (rig.ts draws them). */
export type Face = "smile" | "grin" | "laugh" | "cool" | "wink" | "wow" | "smug" | "shy" | "focus";

/** The colours the coach can change (rig.ts COLORS); the rest stay its own. */
export type Dye = "skin" | "hair" | "top" | "topLight" | "pants" | "waist" | "shoe" | "headband" | "hat" | "skirt" | "sleeve" | "flower" | "lapel";

/** Extras over the clothes. */
export type Wear = "shades" | "bowtie" | "lapels" | "cowboy" | "cap" | "capBack" | "flower" | "bow" | "headphones" | "skirt" | "kimono";

export interface Outfit {
  dye: Partial<Record<Dye, string>>;
  wear: Wear[];
  /** the headband and the ponytail off (short hair, or a hat) */
  short?: boolean;
}

export interface Style {
  outfit: Outfit;
  /** how much bigger than its key frames it dances (1 as written) */
  big: number;
  /** its face when a move doesn't say */
  face: Face;
}

export const PLAIN: Style = { outfit: { dye: {}, wear: [] }, big: 1, face: "smile" };

const STYLES: Record<string, Style> = {
  // PSY: the light blue tuxedo, the bow tie, the sunglasses
  "song-gangnam-style": {
    outfit: { dye: { top: "#7fd3f2", topLight: "#7fd3f2", lapel: "#16141f", pants: "#16141f", waist: "#16141f", shoe: "#16141f", hair: "#16121c" }, wear: ["shades", "bowtie", "lapels"], short: true },
    big: 1.4,
    face: "smug",
  },
  "song-macarena": { outfit: { dye: { top: "#ff5fa2", topLight: "#ffd84a", pants: "#2f9bff", headband: "#ffd84a", flower: "#ffd84a" }, wear: ["flower"] }, big: 1.3, face: "grin" },
  "song-yi-xiao-jiang-hu": { outfit: { dye: { top: "#1c1a26", topLight: "#e8333c", pants: "#1c1a26", waist: "#e8333c", headband: "#e8333c" }, wear: ["shades"] }, big: 1.35, face: "smug" },
  "song-zui-xuan-min-zu-feng": { outfit: { dye: { top: "#e8323c", topLight: "#ffd84a", pants: "#1c1a26", headband: "#ffd84a", flower: "#e8323c" }, wear: ["flower"] }, big: 1.3, face: "grin" },
  "song-ai-ni": { outfit: { dye: { top: "#ff9ec9", topLight: "#ffffff", pants: "#efbe9c", skirt: "#ffffff", headband: "#ff5fa2", flower: "#ff5fa2" }, wear: ["skirt", "bow"] }, big: 1.2, face: "smile" },
  "song-apt": { outfit: { dye: { top: "#ff4f9a", topLight: "#16141f", pants: "#16141f", hair: "#f3d37a", headband: "#16141f" }, wear: ["headphones"] }, big: 1.3, face: "grin" },
  "song-cupid-shuffle": { outfit: { dye: { top: "#e53950", topLight: "#ffffff", pants: "#3d5ea8", hat: "#16141f" }, wear: ["capBack"], short: true }, big: 1.3, face: "grin" },
  "song-cha-cha-slide": { outfit: { dye: { top: "#2b6fd6", topLight: "#ffffff", pants: "#2b6fd6", hat: "#ffffff", waist: "#ffffff" }, wear: ["cap"], short: true }, big: 1.3, face: "grin" },
  // the Village People's cowboy
  "song-ymca": { outfit: { dye: { top: "#f2ede0", topLight: "#8a5a2b", pants: "#3d5ea8", waist: "#8a5a2b", hat: "#8a5a2b", shoe: "#8a5a2b" }, wear: ["cowboy"], short: true }, big: 1.35, face: "laugh" },
  "song-watch-me": { outfit: { dye: { top: "#f4f4fb", topLight: "#e53950", pants: "#16141f", hat: "#e53950" }, wear: ["shades", "cap"], short: true }, big: 1.35, face: "smug" },
  // Las Ketchup's black dresses, a red flower
  "song-ketchup": { outfit: { dye: { top: "#16141f", topLight: "#e8333c", pants: "#efbe9c", skirt: "#16141f", headband: "#e8333c", flower: "#e8333c", shoe: "#e8333c" }, wear: ["skirt", "flower"] }, big: 1.3, face: "grin" },
  // white tees, bright skinny jeans
  "song-gee": { outfit: { dye: { top: "#ffffff", topLight: "#ff4fa3", pants: "#ff4fa3", headband: "#ffd84a", flower: "#ffd84a" }, wear: ["bow"] }, big: 1.25, face: "smile" },
  // the video's lime suit and sunglasses
  "song-hai-cao-wu": { outfit: { dye: { top: "#c6e83c", topLight: "#c6e83c", lapel: "#16141f", pants: "#c6e83c", waist: "#16141f" }, wear: ["shades", "lapels"], short: true }, big: 1.35, face: "laugh" },
  // the songs danced to the library's moves: the look, at least
  "song-dynamite": { outfit: { dye: { top: "#9fd8ff", topLight: "#ffffff", pants: "#f2d7ff", headband: "#ffd84a" }, wear: [] }, big: 1.2, face: "grin" },
  "song-gentleman": { outfit: { dye: { top: "#f4f4fb", topLight: "#f4f4fb", lapel: "#16141f", pants: "#16141f", hair: "#16121c" }, wear: ["shades", "bowtie", "lapels"], short: true }, big: 1.3, face: "smug" },
  "song-levitating": { outfit: { dye: { top: "#c9a3ff", topLight: "#ffd84a", pants: "#2a1d3a", headband: "#ffd84a" }, wear: [] }, big: 1.2, face: "smile" },
  "song-waka-waka": { outfit: { dye: { top: "#ffd84a", topLight: "#1fa35b", pants: "#1fa35b", headband: "#1fa35b", hair: "#b8742e" }, wear: [] }, big: 1.25, face: "grin" },
  "song-uptown-funk": { outfit: { dye: { top: "#e8333c", topLight: "#e8333c", lapel: "#16141f", pants: "#16141f", hat: "#16141f" }, wear: ["lapels", "cap"], short: true }, big: 1.3, face: "smug" },
  "song-cant-stop-the-feeling": { outfit: { dye: { top: "#ffd84a", topLight: "#ffffff", pants: "#3d5ea8", headband: "#ff5fa2" }, wear: [] }, big: 1.2, face: "grin" },
  "song-gokuraku-jodo": {
    outfit: { dye: { top: "#6b2fa3", topLight: "#ffd84a", pants: "#2a1d3a", skirt: "#6b2fa3", sleeve: "#9a5fd6", waist: "#ffd84a", headband: "#ff4f7b", flower: "#ff4f7b" }, wear: ["kimono", "skirt", "flower"] },
    big: 1.2,
    face: "smile",
  },
};

/** A move's face: the same all through, or by count (1 to 8: a face from that count on). */
type FaceBy = Face | [number, Face][];
const FACES: Record<string, FaceBy> = {
  // 江南Style: deadpan behind the shades, then everything at once
  "horse-ride": [[1, "smug"], [5, "grin"]],
  "horse-lasso": "laugh",
  "sexy-lady": [[1, "wink"], [5, "smug"]],
  "disco-point": [[1, "wow"], [5, "laugh"]],
  "gangnam-strut": "smug",
  "gangnam-bounce": "grin",
  "hey-point": "laugh",
  "gangnam-pose": "cool",
  "macarena-hips": [[1, "wink"], [7, "laugh"]],
  "kms-guai": "shy",
  "kms-xiao": "laugh",
  "kms-slow-xiao": "smug",
  "zx-oath": "focus",
  "zx-pose": "laugh",
  "aini-heart": "wink",
  "aini-wings": "grin",
  "apt-headphones": "wow",
  "apt-climb": "focus",
  "cupid-walk": "smug",
  "cupid-kick": "laugh",
  "cha-freeze": "wow",
  "cha-low": [[1, "focus"], [5, "laugh"]],
  "cha-top": "laugh",
  "cha-funky": "laugh",
  "cha-reverse": "wow",
  "cha-knees": "laugh",
  "cha-charlie": "grin",
  "ymca-letters": [[1, "wow"], [5, "laugh"]],
  "ymca-pump": "focus",
  "wm-whip": [[1, "smug"], [3, "cool"], [5, "grin"]],
  "wm-whip2": [[1, "cool"], [5, "grin"]],
  "wm-stanky": "laugh",
  "wm-yule": [[1, "smug"], [5, "focus"]],
  "wm-duff": "wink",
  "ketchup-head": "smug",
  "ketchup-hands": "grin",
  "gee-sparkle": "wow",
  "gee-surprise": "wow",
  "gee-shy": "shy",
  "gee-shiver": "laugh",
  "gee-crab": "grin",
  "hc-dream": "shy",
  "hc-hero": [[1, "shy"], [5, "focus"]],
  "hc-look": "focus",
  "hc-where": [[1, "shy"], [5, "grin"]],
  "gj-peek": "smug",
  "gj-beckon": "wink",
  "gj-bloom": "shy",
  "gj-sing": "grin",
  "gj-dance": "laugh",
};

/** The song a move of its own dance belongs to, for a page that shows moves alone (the library's are the coach's own). */
const SONG_OF = new Map<string, string>();
for (const song of SONGS) if (song.aligned) for (const id of songMoves(song)) if (!SONG_OF.has(id)) SONG_OF.set(id, song.id);
export const songOfMove = (id: string): string | null => SONG_OF.get(id) ?? null;

export const styleOf = (songId: string | null | undefined): Style => (songId ? (STYLES[songId] ?? PLAIN) : PLAIN);

/** The moves that make a face of their own (for the tests). */
export const faceMoves = (): string[] => Object.keys(FACES);

/** The face for a move at a beat position (p: 0 is count 1), or null when the move doesn't say. */
export function faceOf(id: string, p: number): Face | null {
  const f = FACES[id];
  if (!f) return null;
  if (typeof f === "string") return f;
  const count = (((Math.floor(p) % 8) + 8) % 8) + 1;
  let out: Face | null = null;
  for (const [from, face] of f) if (count >= from) out = face;
  return out ?? f[0]![1];
}
