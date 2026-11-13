import { samePool, type SongPool } from "../../shared/songs";

/**
 * Challenge links (挑战链接, like Soundle's): a game of real songs on one phone, sent on so friends
 * play the same songs, with the same four titles, and try to beat the score. All of it is in the
 * link, nothing is kept anywhere:
 *
 *   changle.ca/g/name-that-tune/play?c=<base64url of "1|pool|flags|seed|name|points|songs|check">
 *
 * flags: q multiple choice, h hard titles, s one second. seed: the four titles' shuffle (base 36).
 * name: who set the score. points: theirs, one digit a song (0 to 3). songs: Apple ids, base 36,
 * joined with ".". check: a hash of the rest, so a link cut short or mistyped reads as none.
 *
 * The wrong titles come from the built-in song list as it is when the link is opened: after the list
 * changes (a rebuild, new years), an old link keeps its songs but may show other wrong titles.
 */
export type Challenge = {
  pool: SongPool;
  quiz: boolean;
  hard: boolean;
  snap: boolean;
  /** the wrong titles come from this (seeded), so both phones show the same four */
  seed: number;
  /** who set the score, and their points song by song */
  name: string;
  pts: number[];
  ids: number[];
};

/** at most this many songs in a link (the longest game) */
export const CHALLENGE_MAX = 20;
const NAME_MAX = 20;

export const challengeScore = (c: Pick<Challenge, "pts">) => c.pts.reduce((a, b) => a + b, 0);

const b64 = (s: string) => {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
};
/** FNV-1a, three base-36 digits of it */
const check = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return (h % 46656).toString(36).padStart(3, "0");
};
/** a name as a link carries it: no separator, no control characters, not too long */
const cleanName = (n: string) => [...n.replace(/[|\p{C}]/gu, "").trim()].slice(0, NAME_MAX).join("");

export function challengeCode(c: Challenge): string {
  const flags = `${c.quiz ? "q" : ""}${c.hard ? "h" : ""}${c.snap ? "s" : ""}`;
  const body = ["1", samePool(c.pool) ?? "", flags, (c.seed >>> 0).toString(36), cleanName(c.name), c.pts.join(""), c.ids.map((x) => x.toString(36)).join(".")].join("|");
  return b64(`${body}|${check(body)}`);
}

/** A challenge from its link, or null when it isn't one (cut short, mistyped, made up). */
export function readChallenge(code: unknown): Challenge | null {
  if (typeof code !== "string" || code.length > 1600 || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  let text: string;
  try {
    text = unb64(code);
  } catch {
    return null;
  }
  const f = text.split("|");
  if (f.length !== 8 || f[0] !== "1" || f[7] !== check(f.slice(0, 7).join("|"))) return null;
  const [, poolIn, flags, seed36, name, pts, songs] = f;
  const pool = samePool(poolIn);
  if (!pool || !/^q?h?s?$/.test(flags) || !/^[0-9a-z]{1,7}$/.test(seed36) || !/^[0-3]+$/.test(pts)) return null;
  const ids = songs.split(".").map((x) => (/^[0-9a-z]{1,11}$/.test(x) ? parseInt(x, 36) : NaN));
  if (!ids.length || ids.length > CHALLENGE_MAX || ids.length !== pts.length || ids.some((x) => !Number.isSafeInteger(x) || x <= 0)) return null;
  if (new Set(ids).size !== ids.length) return null;
  const seed = parseInt(seed36, 36);
  if (seed > 0xffffffff) return null;
  return { pool, quiz: flags.includes("q"), hard: flags.includes("h"), snap: flags.includes("s"), seed, name: cleanName(name), pts: [...pts].map(Number), ids };
}

/** Where a challenge is played. */
export const challengeUrl = (c: Challenge, origin = typeof location === "undefined" ? "https://changle.ca" : location.origin) =>
  `${origin}/g/name-that-tune/play?c=${challengeCode(c)}`;

/**
 * The dice for one song's four titles: the same game seed and song give the same shuffle on every
 * phone (mulberry32).
 */
export function seeded(seed: number, round: number): () => number {
  let a = (seed ^ Math.imul(round + 1, 0x9e3779b9)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new game's seed. */
export const newSeed = () => (Math.random() * 0x100000000) >>> 0;
