/*
 * Countdowns under timed dares (src/lib/duration.ts). Run with `npx tsx tests/duration.test.ts`
 *  1. Times are read in both languages: digits, Chinese numbers, English words, minutes.
 *  2. Every truth, dare and king's command says the same time in Chinese and in English (its
 *     own-penalty wording too), so the countdown is the same whichever language a phone reads.
 *  3. The timed cards are all found.
 */
import { durationLabel, durationOf, secondsInChinese, secondsInEnglish } from "../src/lib/duration";
import { DARES, TRUTHS } from "../src/data/truthDare";
import { COMMANDS } from "../src/data/king";
import type { T } from "../src/i18n";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}

// 1. reading a time
const zh: [string, number | null][] = [
  ["和一个人对视 20 秒，不许眨眼。", 20],
  ["跳 15 秒舞，不许笑。", 15],
  ["用最温柔的声音骂一个人十秒。", 10],
  ["{a}号公主抱{b}号三秒。", 3],
  ["接下来一分钟，说话必须用唱的。", 60],
  ["和一个人交换手机三分钟，随便看。", 180],
  ["两分钟", 120],
  ["坚持二十五秒", 25],
  ["半分钟", 30],
  ["一分半钟", 90],
  ["秒回", null],
  ["最后一秒", null],
  ["你手机里最近一次搜索的是什么？", null],
];
for (const [text, want] of zh) ok(secondsInChinese(text) === want, `${text} → ${want}`);

const en: [string, number | null][] = [
  ["Hold eye contact with someone for 20 seconds. No blinking.", 20],
  ["Insult someone in the gentlest voice you can, for ten seconds.", 10],
  ["Name three things you like about someone here, then hold their gaze for five seconds.", 5],
  ["Give the person on your left a one-minute massage.", 60],
  ["Sing everything you say for the next minute.", 60],
  ["Swap phones with someone for three minutes. Anything goes.", 180],
  ["Hold it for half a minute", 30],
  ["Keep going for forty-five seconds", 45],
  ["Instant reply", null],
  ["What's the last thing you searched on your phone?", null],
];
for (const [text, want] of en) ok(secondsInEnglish(text) === want, `${text} → ${want}`);

ok(durationLabel(20, "zh") === "20 秒" && durationLabel(60, "zh") === "1 分钟" && durationLabel(90, "zh") === "1 分 30 秒", "labels in Chinese");
ok(durationLabel(1, "en") === "1 second" && durationLabel(20, "en") === "20 seconds" && durationLabel(180, "en") === "3 minutes", "labels in English");

// 2. both languages agree, on every card and its own-penalty wording
const cards: [string, T][] = [];
for (const p of [...TRUTHS, ...DARES]) {
  cards.push(["truth or dare", p]);
  if (p.custom) cards.push(["truth or dare, own penalty", p.custom]);
}
for (const c of COMMANDS) {
  cards.push(["king's game", c]);
  if (c.custom) cards.push(["king's game, own penalty", c.custom]);
}
const disagree = cards.filter(([, t]) => secondsInChinese(t.zh) !== secondsInEnglish(t.en));
for (const [game, t] of disagree) console.log(`     ${game}: ${t.zh} (${secondsInChinese(t.zh)}) / ${t.en} (${secondsInEnglish(t.en)})`);
ok(disagree.length === 0, `${cards.length} cards say the same time in both languages`);

// 3. the timed ones are found (eye contact, massages, hugs, the phone swap...)
const timed = (list: T[]) => list.filter((t) => durationOf(t) !== null).length;
ok(timed(DARES) >= 10, `${timed(DARES)} dares have a countdown`);
ok(timed(TRUTHS) === 0, "no truth has a countdown");
ok(timed(COMMANDS) >= 7, `${timed(COMMANDS)} king's commands have a countdown`);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
