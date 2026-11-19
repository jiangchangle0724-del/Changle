/**
 * The station: the background music around the site is one programme, the same on every phone and
 * TV at the same moment, and its style follows the time of day and the day of the week (Steve
 * 2026-11-19: two phones side by side played two different songs).
 *
 * The time is Vancouver's, the site's home, so a table spread over two cities hears one song too.
 * The week is cut into moods (WEEK): mornings are easy, Friday and Saturday nights are the party,
 * the small hours wind down. Each mood plays its own songs (POOLS) back to back from the hour it
 * begins, in an order drawn from that hour, so anyone who knows the time knows the song and the
 * step. The clock is the rooms server's (syncClock), so the phones' own clocks don't matter.
 * lib/music.ts plays it; the songs are in lib/nightset.ts. Nothing here touches sound.
 */
import { FORM, SONGS, type Section, type Song } from "./nightset";

export { FORM, sectionStyle } from "./nightset";

export type Mood = "late" | "morning" | "brunch" | "day" | "evening" | "party" | "night";

const HOUR = 3_600_000;
const ZONE = "America/Vancouver";

/** From which hour each mood plays, Sunday first (as `Date#getDay`); a night runs on past midnight. */
const WEEKDAY: [number, Mood][] = [
  [0, "late"],
  [6, "morning"],
  [11, "day"],
  [17, "evening"],
  [21, "night"],
];
export const WEEK: [number, Mood][][] = [
  // Sunday: Saturday's party until 3, brunch, an afternoon, a quiet evening before the week
  [
    [0, "party"],
    [3, "late"],
    [8, "brunch"],
    [14, "day"],
    [18, "night"],
  ],
  WEEKDAY,
  WEEKDAY,
  WEEKDAY,
  WEEKDAY,
  // Friday: the party from 8 in the evening
  [
    [0, "late"],
    [6, "morning"],
    [11, "day"],
    [17, "evening"],
    [20, "party"],
  ],
  // Saturday: Friday's party until 3, brunch, and the party again
  [
    [0, "party"],
    [3, "late"],
    [8, "brunch"],
    [13, "day"],
    [17, "evening"],
    [20, "party"],
  ],
];

/** Each mood's songs (`Song#id`). */
export const POOLS: Record<Mood, string[]> = {
  late: ["moonlight", "morning-light", "deep-end", "cafe"],
  morning: ["morning-light", "cafe", "island", "city-pop"],
  brunch: ["cafe", "city-pop", "island", "groove-machine", "mirror-ball"],
  day: ["lagos-nights", "island", "east-wind", "city-pop", "groove-machine", "fiesta"],
  evening: ["rooftop", "mirror-ball", "groove-machine", "east-wind", "lagos-nights", "neon"],
  party: ["rooftop", "neon", "night-bus", "fiesta", "mirror-ball", "east-wind"],
  night: ["deep-end", "moonlight", "city-pop", "night-bus", "morning-light"],
};

export const MOOD_NAME: Record<Mood, { zh: string; en: string }> = {
  late: { zh: "深夜放松", en: "Small hours" },
  morning: { zh: "早上轻松", en: "Easy morning" },
  brunch: { zh: "周末早午餐", en: "Weekend brunch" },
  day: { zh: "白天明快", en: "Daytime" },
  evening: { zh: "傍晚热场", en: "Warming up" },
  party: { zh: "周末派对", en: "Weekend party" },
  night: { zh: "夜里慢慢来", en: "Late evening" },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
let fmt: Intl.DateTimeFormat | null = null;

/** Vancouver's day of the week (0 is Sunday) and hour at a moment. */
export function vancouver(ms: number): { day: number; hour: number } {
  try {
    fmt ??= new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", hour: "numeric", hourCycle: "h23" });
    let day = -1;
    let hour = -1;
    for (const p of fmt.formatToParts(ms)) {
      if (p.type === "weekday") day = DAYS.indexOf(p.value);
      else if (p.type === "hour") hour = Number(p.value) % 24;
    }
    if (day >= 0 && hour >= 0) return { day, hour };
  } catch {
    /* a browser without time zones: Pacific standard time below */
  }
  const d = new Date(ms - 8 * HOUR);
  return { day: d.getUTCDay(), hour: d.getUTCHours() };
}

export function moodAt(ms: number): Mood {
  const { day, hour } = vancouver(ms);
  let mood = WEEK[day][0][1];
  for (const [from, m] of WEEK[day]) if (hour >= from) mood = m;
  return mood;
}

/**
 * The stretch of hours one mood plays without a break. Vancouver is a whole number of hours off
 * UTC, so its hours start where UTC's do.
 */
export type Run = { mood: Mood; start: number; end: number };
export function runAt(ms: number): Run {
  const h = Math.floor(ms / HOUR);
  const mood = moodAt(h * HOUR);
  let a = h;
  let b = h + 1;
  for (let i = 0; i < 48 && moodAt((a - 1) * HOUR) === mood; i++) a--;
  for (let i = 0; i < 48 && moodAt(b * HOUR) === mood; i++) b++;
  return { mood, start: a * HOUR, end: b * HOUR };
}

/** A small seeded random (mulberry32): the same numbers on every phone. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BY_ID = new Map(SONGS.map((s) => [s.id, s]));

/** A run's songs in order, for ever: its pool shuffled again and again, never one song twice in a row. */
function* order(run: Run): Generator<Song> {
  const pool = POOLS[run.mood].map((id) => BY_ID.get(id)).filter((s): s is Song => !!s);
  const r = seeded(run.start / HOUR);
  let last: Song | null = null;
  for (;;) {
    const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.length > 1 && a[0] === last) [a[0], a[1]] = [a[1], a[0]];
    yield* a;
    last = a[a.length - 1];
  }
}

/** Sixteenths in one song: every song plays the same arrangement (nightset FORM). */
export const STEPS = FORM.reduce((n, s) => n + s.loops * 64, 0);
export const stepMs = (s: Song) => 15000 / s.style.bpm;
export const songMs = (s: Song) => STEPS * stepMs(s);

/**
 * One song on the programme, in the server's milliseconds. `cut`: the mood changes before the
 * song is over, so it fades out at `end`.
 */
export type Slot = { song: Song; mood: Mood; start: number; end: number; step: number; cut: boolean };

/** The song playing at `ms`. */
export function slotAt(ms: number): Slot {
  const run = runAt(ms);
  let t = run.start;
  for (const song of order(run)) {
    const len = songMs(song);
    if (t + len > ms || t + len >= run.end) {
      const end = Math.min(t + len, run.end);
      return { song, mood: run.mood, start: t, end, step: stepMs(song), cut: end < t + len };
    }
    t += len;
  }
  throw new Error("no songs");
}

/** The song after this one (the next mood's first, if this one ends its mood). */
export const nextSlot = (s: Slot) => slotAt(s.end);

/** Where in the arrangement a song's sixteenth `n` falls: section `k`, its loop, the step in the loop. */
export function placeOf(n: number): { k: number; sec: Section; loop: number; step: number } | null {
  for (let k = 0; k < FORM.length; k++) {
    const len = FORM[k].loops * 64;
    if (n < len) return { k, sec: FORM[k], loop: Math.floor(n / 64), step: n % 64 };
    n -= len;
  }
  return null;
}

/* ---------------- the clock ---------------- */

// The rooms server's time as an offset from performance.now(). Until the server answers it is this
// device's own clock. Later answers are eased in (`slew`), so a song never jumps while it plays.
let skew = Date.now() - performance.now();
let target = skew;
let syncedAt = 0;
let syncs = 0;
let askedAt = -Infinity;
let syncing: Promise<void> | null = null;
// Date.now() against performance.now() when the clock was last set: a phone that slept stops the
// one but not the other
let wall = skew;

/** The server's time now, in milliseconds. */
export const serverNow = () => performance.now() + skew;
/** performance.now() at a moment on the server's clock. */
export const perfOf = (serverMs: number) => serverMs - skew;

/** A phone that slept (performance.now() stood still) or a clock set by hand: take the device's word until the server answers. */
function checkWall() {
  const w = Date.now() - performance.now();
  if (Math.abs(w - wall) > 1000) {
    skew += w - wall;
    target += w - wall;
    wall = w;
    syncedAt = 0;
  }
}

/** Ask the rooms server for the time a few times and keep the quickest answer (the least to guess about). */
export function syncClock(): Promise<void> {
  syncing ??= (async () => {
    askedAt = performance.now();
    const { API } = await import("../config");
    let best = Infinity;
    let got: number | null = null;
    for (let i = 0; i < 5; i++) {
      try {
        const p0 = performance.now();
        const res = await fetch(`${API}/time`, { cache: "no-store" });
        const p1 = performance.now();
        const { now } = (await res.json()) as { now?: unknown };
        if (typeof now === "number" && Number.isFinite(now) && p1 - p0 < best) {
          best = p1 - p0;
          got = now - (p0 + p1) / 2;
        }
      } catch {
        break;
      }
    }
    if (got === null) return;
    // the first answer is taken as it is: nothing is playing on it yet
    if (!syncedAt) skew = got;
    target = got;
    wall = Date.now() - performance.now();
    syncedAt = performance.now();
    syncs++;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/**
 * Before the music starts: the server's time, waited for up to a second and a half the first time
 * (or after a sleep), asked again in the background when it's older than five minutes.
 */
export function ready(): Promise<void> {
  checkWall();
  if (syncedAt && performance.now() - syncedAt < 300_000) return Promise.resolve();
  const asked = syncClock();
  if (syncedAt) return Promise.resolve();
  return Promise.race([asked, new Promise<void>((r) => window.setTimeout(r, 1500))]).then(() => {
    skew = target;
  });
}

/** While the music plays: ease toward the latest answer, a quarter of a millisecond a call (1% of the tempo at most). */
export function slew() {
  checkWall();
  const d = target - skew;
  skew = Math.abs(d) > 250 ? target : skew + Math.max(-0.25, Math.min(0.25, d));
  // asked again once soon after the first answer (over a line that's warm by then, the answer is
  // closer), then every five minutes; at most once a minute when the server doesn't answer
  const at = performance.now();
  if (at - syncedAt > (syncs === 1 ? 20_000 : 300_000) && at - askedAt > (syncs === 1 ? 20_000 : 60_000)) void syncClock();
}
