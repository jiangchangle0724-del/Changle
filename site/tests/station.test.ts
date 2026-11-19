/*
 * The background music's programme (src/lib/station.ts). Run with `npx tsx tests/station.test.ts`
 * Every phone works out the same song and the same beat from the time alone, the style follows
 * Vancouver's time of day and day of the week, and the songs follow one another without a gap.
 */
import { MOOD_NAME, POOLS, STEPS, WEEK, moodAt, nextSlot, placeOf, runAt, slotAt, songMs, type Mood, type Slot } from "../src/lib/station";
import { FORM, SONGS } from "../src/lib/nightset";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
const HOUR = 3_600_000;
const at = (iso: string) => Date.parse(iso);

// the songs and the pools
const ids = new Set(SONGS.map((s) => s.id));
ok(ids.size === SONGS.length, `${SONGS.length} songs, each with its own id`);
for (const [mood, pool] of Object.entries(POOLS)) ok(pool.length >= 3 && pool.every((id) => ids.has(id)), `${mood}: ${pool.length} songs, all of them real`);
ok(
  SONGS.every((s) => Object.values(POOLS).some((p) => p.includes(s.id))),
  "every song is in some mood",
);
ok(
  SONGS.every((s) => [s.style.bass, s.style.lead?.bars, s.style.chords?.prog].every((bars) => !bars || bars.length === 4)),
  "every song's parts are four bars",
);
ok(
  SONGS.every((s) => s.name.zh && s.name.en),
  "every song has a name in Chinese and English",
);
const moods = new Set(WEEK.flat().map(([, m]) => m));
ok(
  [...moods].every((m) => MOOD_NAME[m].zh && MOOD_NAME[m].en && POOLS[m]),
  `the week's ${moods.size} moods have names and songs`,
);
ok(
  WEEK.length === 7 && WEEK.every((d) => d[0][0] === 0 && d.every(([h], i) => i === 0 || h > d[i - 1][0])),
  "each day of the week starts at midnight and its moods follow in order",
);

// Vancouver's clock (the times sit away from the hour, so a change to its daylight time can't move them into another mood)
const cases: [string, Mood, string][] = [
  ["2026-11-21T05:30:00Z", "party", "Friday 9:30 at night"],
  ["2026-11-21T09:30:00Z", "party", "Saturday 1:30 in the morning: Friday's party goes on"],
  ["2026-11-21T18:00:00Z", "brunch", "Saturday 10 in the morning"],
  ["2026-11-22T22:30:00Z", "day", "Sunday 2:30 in the afternoon"],
  ["2026-11-23T03:30:00Z", "night", "Sunday 7:30 in the evening"],
  ["2026-11-23T16:00:00Z", "morning", "Monday 8 in the morning"],
  ["2026-11-24T06:30:00Z", "night", "Monday 10:30 at night"],
  ["2026-11-24T11:00:00Z", "late", "Tuesday 3 in the morning"],
  ["2026-11-25T02:30:00Z", "evening", "Tuesday 6:30 in the evening"],
  ["2026-07-05T05:30:00Z", "party", "a Saturday night in July (daylight time)"],
  ["2026-07-06T19:30:00Z", "day", "a Monday afternoon in July"],
];
for (const [iso, mood, what] of cases) ok(moodAt(at(iso)) === mood, `${what}: ${MOOD_NAME[mood].en}`);

const fri = runAt(at("2026-11-21T05:30:00Z"));
ok(fri.mood === "party" && fri.end - fri.start === 7 * HOUR, "Friday's party runs seven hours without a break, 8 at night to 3");
ok(moodAt(fri.start - 1) !== "party" && moodAt(fri.end) !== "party", "and it starts and ends where the mood changes");

// a week of songs, one after another
const from = at("2026-11-23T08:00:00Z"); // Monday, midnight in Vancouver
let s: Slot = slotAt(from);
let count = 0;
let gaps = 0;
let wrongMood = 0;
let repeats = 0;
let badCuts = 0;
let badLength = 0;
const heard = new Map<string, number>();
while (s.start < from + 7 * 24 * HOUR) {
  const n = nextSlot(s);
  if (n.start !== s.end) gaps++;
  if (moodAt(s.start) !== s.mood || !POOLS[s.mood].includes(s.song.id)) wrongMood++;
  // a song cut short only where its mood ends, on the hour
  if (s.cut && (n.mood === s.mood || s.end % HOUR !== 0)) badCuts++;
  if (n.mood === s.mood && n.song === s.song) repeats++;
  if (!s.cut && Math.abs(s.end - s.start - songMs(s.song)) > 0.01) badLength++;
  heard.set(s.song.id, (heard.get(s.song.id) ?? 0) + 1);
  s = n;
  count++;
}
ok(count > 7000 && count < 12000, `a week is ${count} songs`);
ok(gaps === 0, "each song starts the moment the one before it ends");
ok(wrongMood === 0, "each song is one of its mood's songs, at its mood's time");
ok(repeats === 0, "no song twice in a row");
ok(badCuts === 0, "a song is cut short only where its mood ends, on the hour");
ok(badLength === 0, "every other song plays its whole arrangement");
ok(heard.size === SONGS.length, `all ${SONGS.length} songs play in a week`);

// two phones that start at different moments land on the same song and the same sixteenths
const t1 = at("2026-11-25T03:17:42.123Z");
const a = slotAt(t1);
const b = slotAt(t1 + 7_311.5);
const sameSong = a.song === b.song && a.start === b.start;
ok(sameSong || b.start === a.end, "a phone that comes in seven seconds later finds the same song (or the next one)");
if (sameSong) {
  const n = Math.ceil((t1 + 7_311.5 - b.start) / b.step);
  ok(a.start + n * a.step === b.start + n * b.step, "and the same moment for every sixteenth");
}
ok(JSON.stringify(slotAt(t1)) === JSON.stringify(a), "the same moment always gives the same song");
const later = slotAt(a.end - 0.001);
ok(later.start === a.start, "up to its very end, the song is the same one");

// where in its arrangement a sixteenth is
ok(STEPS === FORM.reduce((n, f) => n + f.loops * 64, 0) && STEPS % 64 === 0, `a song is ${STEPS} sixteenths`);
const p0 = placeOf(0);
const p1 = placeOf(FORM[0].loops * 64);
const last = placeOf(STEPS - 1);
ok(p0?.k === 0 && p0.loop === 0 && p0.step === 0, "the first sixteenth opens the intro");
ok(p1?.k === 1 && p1.loop === 0 && p1.step === 0, "the groove starts where the intro ends");
ok(last?.k === FORM.length - 1 && last.step === 63, "the last sixteenth ends the outro");
ok(placeOf(STEPS) === null, "nothing after it");

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
