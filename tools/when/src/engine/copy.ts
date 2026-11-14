// Short messages to paste into the group chat. The page chooses the tone and variant.
import { dateLabel, slotLabel } from "./slots";
import type { Day, Lang, Part } from "./types";

export type Tone = "plain" | "easy" | "funny";
export type InviteWords = { title: string; url: string; days: Day[]; deadline?: string };
export type NudgeWords = { title: string; url: string; missing: string[]; deadline?: string };
export type ResultWords = { title: string; url: string; day: Day; part: Part; coming: number; asked: number; maybe: string[] };

type Variants<Words> = Record<Lang, Record<Tone, readonly ((words: Words) => string)[]>>;

function message(title: string, body: string, url: string, lang: Lang): string {
  return `${lang === "zh" ? `「${title}」` : `"${title}"`}\n${body}\n${url}`;
}

function choose<Words>(variants: Variants<Words>, words: Words, tone: Tone, lang: Lang, pick: number): string {
  const choices = variants[lang][tone];
  const index = Number.isFinite(pick) ? Math.trunc(pick) : 0;
  return choices[((index % choices.length) + choices.length) % choices.length](words);
}

function dateRange(days: Day[], lang: Lang): string {
  if (!days.length) return "";
  const first = dateLabel(days[0], lang);
  return days.length === 1 ? first : `${first}${lang === "zh" ? "到" : " to "}${dateLabel(days[days.length - 1], lang)}`;
}

function answerBy(deadline: string | undefined, lang: Lang): string {
  if (!deadline) return "";
  // a deadline that ends in a full stop of its own ("Thursday 8 p.m.") doesn't get a second one
  return lang === "zh" ? `请在${deadline}前填好。` : ` Please reply by ${deadline}${deadline.endsWith(".") ? "" : "."}`;
}

const INVITES: Variants<{ dates: string }> = {
  zh: {
    plain: [
      ({ dates }) => `${dates}，请点链接填有空的时间。`,
      ({ dates }) => `想在${dates}约个时间，请在链接里选。`,
      ({ dates }) => `${dates}什么时候方便？请点链接填写。`,
    ],
    easy: [
      ({ dates }) => `${dates}找个时间聚聚，点链接选你有空的。`,
      ({ dates }) => `来约个时间吧，${dates}什么时候行？点链接填。`,
      ({ dates }) => `${dates}想一起聚聚，点链接说说什么时候有空。`,
    ],
    funny: [
      ({ dates }) => `日历开会了：${dates}，点链接选空档。`,
      ({ dates }) => `${dates}，让大家的日历碰个头，点链接填空档。`,
      ({ dates }) => `群聊征集空档：${dates}，点链接给日历投票。`,
    ],
  },
  en: {
    plain: [
      ({ dates }) => `Please mark when you're free, ${dates}, using the link.`,
      ({ dates }) => `We're picking a time, ${dates}. Please add when you're free below.`,
      ({ dates }) => `Which times work for you, ${dates}? Please answer at the link.`,
    ],
    easy: [
      ({ dates }) => `Let's get together! What works for you, ${dates}? Pick your times below.`,
      ({ dates }) => `Any gaps, ${dates}? Let's meet up. Tap the link and choose your times.`,
      ({ dates }) => `Time for a catch-up, ${dates}. Pop your free times in the link.`,
    ],
    funny: [
      ({ dates }) => `Calling a meeting of calendars, ${dates}. Give yours a vote at the link.`,
      ({ dates }) => `Can our calendars agree on anything, ${dates}? Add your free times below.`,
      ({ dates }) => `The group chat is seeking a date, ${dates}. Send your calendar's suggestions below.`,
    ],
  },
};

/** The first and last dates are already ordered by the page; deadlines are its own words. */
export function inviteText(words: InviteWords, tone: Tone, lang: Lang, pick = 0): string {
  const body = choose(INVITES, { dates: dateRange(words.days, lang) }, tone, lang, pick);
  return message(words.title, body + answerBy(words.deadline, lang), words.url, lang);
}

function missingPeople(names: string[], lang: Lang): string {
  if (!names.length) return lang === "zh" ? "还没填的朋友" : "Anyone who hasn't answered yet";
  if (names.length > 5) return lang === "zh" ? `还有 ${names.length} 位朋友没填` : `Still waiting for ${names.length} replies`;
  return names.join(lang === "zh" ? "、" : ", ");
}

const NUDGES: Variants<{ who: string }> = {
  zh: {
    plain: [
      ({ who }) => `${who}，方便时请点链接选时间。`,
      ({ who }) => `${who}，请在链接里填有空的时段。`,
      ({ who }) => `${who}，请点链接补充时间，方便大家安排。`,
    ],
    easy: [
      ({ who }) => `${who}，有空来链接里挑个时间吧。`,
      ({ who }) => `${who}，来填一下有空的时间？点链接就行。`,
      ({ who }) => `${who}，什么时候方便呀？在链接里说一声。`,
    ],
    funny: [
      ({ who }) => `日历来敲门：${who}，点链接填空档。`,
      ({ who }) => `群聊还在找日期：${who}，来链接里投一票。`,
      ({ who }) => `日历还没凑齐：${who}，点链接选个时间。`,
    ],
  },
  en: {
    plain: [
      ({ who }) => `${who}: please add your free times at the link when you can.`,
      ({ who }) => `${who}: please use the link to share which times work for you.`,
      ({ who }) => `${who}: a reminder to fill in your availability below.`,
    ],
    easy: [
      ({ who }) => `${who}: got a moment to pick a time? The link's below.`,
      ({ who }) => `${who}: come drop your free times in the link when you get a chance.`,
      ({ who }) => `${who}: what works for you? Pop your times in below.`,
    ],
    funny: [
      ({ who }) => `The calendars are still in talks. ${who}: add your free times below.`,
      ({ who }) => `Our group chat would love a date. ${who}: give your calendar a vote below.`,
      ({ who }) => `The calendar summit is open. ${who}: send your free times via the link.`,
    ],
  },
};

/** No guest list means a general reminder; a long guest list is counted, never cut short. */
export function nudgeText(words: NudgeWords, tone: Tone, lang: Lang, pick = 0): string {
  const body = choose(NUDGES, { who: missingPeople(words.missing, lang) }, tone, lang, pick);
  return message(words.title, body + answerBy(words.deadline, lang), words.url, lang);
}

// Keep the wording and the three-name boundary in agreement with rank.ts's reason().
function attendance(words: ResultWords, lang: Lang): string {
  const head = lang === "zh" ? `${words.asked} 个人里 ${words.coming} 个有空` : `${words.coming} of ${words.asked} free`;
  if (!words.maybe.length) return head;
  if (lang === "zh") return words.maybe.length <= 3 ? `${head}，${words.maybe.join("、")} 可以调` : `${head}，${words.maybe.length} 个可以调`;
  return `${head}, ${words.maybe.length <= 3 ? words.maybe.join(", ") : words.maybe.length} could move things`;
}

const RESULTS: Variants<{ when: string; who: string }> = {
  zh: {
    plain: [
      ({ when, who }) => `定了：${when}。${who}。详情见链接。`,
      ({ when, who }) => `时间已定：${when}。${who}。点链接查看。`,
      ({ when, who }) => `就定${when}。${who}。链接里看详情。`,
    ],
    easy: [
      ({ when, who }) => `约好啦：${when}。${who}。点链接看看。`,
      ({ when, who }) => `那就${when}见。${who}。详情在链接里。`,
      ({ when, who }) => `时间有啦：${when}。${who}。点链接看。`,
    ],
    funny: [
      ({ when, who }) => `日历落笔：${when}。${who}。详情见链接。`,
      ({ when, who }) => `群聊有日期了：${when}。${who}。点链接看。`,
      ({ when, who }) => `日历们谈妥了：${when}。${who}。链接里见。`,
    ],
  },
  en: {
    plain: [
      ({ when, who }) => `The time is set: ${when}. ${who}. See the link for details.`,
      ({ when, who }) => `Confirmed for ${when}. ${who}. Check the details below.`,
      ({ when, who }) => `We're meeting ${when}. ${who}. Details at the link.`,
    ],
    easy: [
      ({ when, who }) => `It's a date: ${when}! ${who}. Take a look below.`,
      ({ when, who }) => `See you ${when}! ${who}. The details are in the link.`,
      ({ when, who }) => `We've got a time: ${when}. ${who}. Tap below for the plan.`,
    ],
    funny: [
      ({ when, who }) => `Our calendars have reached a deal: ${when}. ${who}. Details below.`,
      ({ when, who }) => `The group chat has a date: ${when}. ${who}. See the plan below.`,
      ({ when, who }) => `Calendar summit complete: ${when}. ${who}. Check the link for details.`,
    ],
  },
};

/** Maybes are separate from the free count, just as on the gathering's page. */
export function resultText(words: ResultWords, tone: Tone, lang: Lang, pick = 0): string {
  const body = choose(RESULTS, { when: slotLabel(words.day, words.part, lang), who: attendance(words, lang) }, tone, lang, pick);
  return message(words.title, body, words.url, lang);
}
