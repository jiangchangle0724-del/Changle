import type { T } from "../i18n";

/*
 * How long a dare or a command lasts, read from its own words, so a countdown can go under it:
 * "和一个人对视 20 秒" / "Hold eye contact for 20 seconds", "捶背一分钟" / "a one-minute back massage",
 * "骂十秒" / "for ten seconds". Both languages say the same time (tests/duration.test.ts checks every
 * card), so either one is enough; Chinese is read first.
 */

/** Shorter than this isn't worth a countdown; longer isn't a dare. */
const MIN = 3;
const MAX = 600;

const DIGIT: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 三, 十, 十五, 二十, 四十五: Chinese numbers up to 99. */
function chineseNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^([一二两三四五六七八九])?(十)?([一二三四五六七八九])?$/.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[2]) return m[3] ? null : DIGIT[m[1]];
  return (m[1] ? DIGIT[m[1]] : 1) * 10 + (m[3] ? DIGIT[m[3]] : 0);
}

const EN_NUMBER: Record<string, number> = {
  a: 1, an: 1, one: 1, next: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90,
};

const inRange = (s: number | null) => (s !== null && s >= MIN && s <= MAX ? Math.round(s) : null);

/** Seconds named in Chinese text: 20 秒, 十秒, 三分钟, 半分钟, 一分半钟. */
export function secondsInChinese(text: string): number | null {
  if (/半分钟/.test(text)) return inRange(30);
  const half = /([一二两三四五六七八九十\d]+)分半钟?/.exec(text);
  if (half) {
    const n = chineseNumber(half[1]);
    return inRange(n === null ? null : n * 60 + 30);
  }
  const m = /(\d+|[一二两三四五六七八九十]+)\s*(秒钟?|分钟)/.exec(text);
  if (!m) return null;
  const n = chineseNumber(m[1]);
  return inRange(n === null ? null : m[2] === "分钟" ? n * 60 : n);
}

/** Seconds named in English text: 20 seconds, ten seconds, a minute, one-minute, three minutes. */
export function secondsInEnglish(text: string): number | null {
  const t = text.toLowerCase();
  if (/\bhalf a minute\b/.test(t)) return inRange(30);
  // the first number of seconds or minutes: "for the next minute", "a one-minute massage"
  for (const m of t.matchAll(/\b(\d+|[a-z]+(?:-five)?)[\s-]+(seconds?|secs?|minutes?|mins?)\b/g)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : EN_NUMBER[m[1]];
    if (n !== undefined) return inRange(m[2].startsWith("min") ? n * 60 : n);
  }
  return null;
}

/** How many seconds a card asks for, or null when it names no time. */
export function durationOf(text: T): number | null {
  return secondsInChinese(text.zh) ?? secondsInEnglish(text.en);
}

/** 20 秒 / 1 分钟 / 1 分 30 秒 — or 20 seconds / 1 minute / 1 min 30 s. */
export function durationLabel(seconds: number, lang: "zh" | "en"): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (lang === "zh") return m === 0 ? `${s} 秒` : s === 0 ? `${m} 分钟` : `${m} 分 ${s} 秒`;
  if (m === 0) return `${s} second${s === 1 ? "" : "s"}`;
  return s === 0 ? `${m} minute${m === 1 ? "" : "s"}` : `${m} min ${s} s`;
}
