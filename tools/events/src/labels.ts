// Names, dates and times as people read them, in Chinese and English, for the page at changle.ca/go,
// the preview at /go/preview and the calendar feed's names. Everything from a source that goes into
// HTML goes through `esc`.
import { dayOf } from "./query";
import type { Area, Category, EventStatus, PublicEvent, Tag } from "./types";

export type Lang = "zh" | "en";
export type Pair = readonly [zh: string, en: string];

/** The names in CONTRACTS.md, "The 8 categories and the 7 areas". */
export const CATEGORY_LABEL: Record<Category, Pair> = {
  social: ["社交聚会", "Social & Meetups"],
  shows: ["演出音乐", "Concerts & Shows"],
  food: ["吃喝市集", "Food & Markets"],
  outdoors: ["户外运动", "Outdoors & Sports"],
  arts: ["文化展览", "Arts & Culture"],
  festivals: ["节日庆典", "Festivals & Holidays"],
  family: ["亲子家庭", "Family & Kids"],
  nightlife: ["夜生活派对", "Nightlife & Parties"],
};

export const AREA_LABEL: Record<Area, Pair> = {
  vancouver: ["温哥华市", "Vancouver"],
  richmond: ["列治文", "Richmond"],
  burnaby: ["本拿比", "Burnaby"],
  surrey: ["素里及白石", "Surrey & White Rock"],
  "north-shore": ["北岸", "North Shore"],
  "tri-cities": ["三联市及新西敏", "Tri-Cities & New West"],
  langley: ["兰里及菲沙河谷", "Langley & Fraser Valley"],
};

export const TAG_LABEL: Record<Tag, Pair> = {
  free: ["免费", "Free"],
  chinese: ["中文", "In Chinese"],
  students: ["学生", "Students"],
  newcomers: ["新移民", "Newcomers"],
  kids: ["带娃", "Kids"],
  indoor: ["室内", "Indoors"],
  outdoor: ["户外", "Outdoors"],
  tickets: ["要买票", "Tickets"],
  featured: ["本周推荐", "Featured"],
};

/** The sources' names in Chinese, where they have one people use (the rest keep their own name). */
export const SOURCE_ZH: Record<string, string> = {
  "Vancouver Public Library": "温哥华公共图书馆",
  "Richmond Public Library": "列治文公共图书馆",
  "Burnaby Public Library": "本拿比公共图书馆",
};

export const STATUS_LABEL: Record<Exclude<EventStatus, "scheduled">, Pair> = {
  cancelled: ["已取消", "Cancelled"],
  postponed: ["延期", "Postponed"],
  rescheduled: ["改期", "Rescheduled"],
  soldout: ["售罄", "Sold out"],
};

export const WEEKDAY: Record<Lang, readonly string[]> = {
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Text and attribute values: everything from a source goes through this. */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A link only to a web page (never javascript: or data:). */
export const webUrl = (u: string): string | null => (/^https?:\/\/[^\s]+$/i.test(u) ? u : null);

export const two = (n: number) => String(n).padStart(2, "0");

/** The day of the week of a date, 0 for Sunday. */
export const weekday = (date: string): number => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay();

/** "11月3日" / "3 Nov" */
export function shortDate(date: string, lang: Lang): string {
  const m = +date.slice(5, 7);
  const d = +date.slice(8, 10);
  return lang === "zh" ? `${m}月${d}日` : `${d} ${MONTH[m - 1]}`;
}

/** "11月3日 周二" / "Tue 3 Nov" */
export function dayName(date: string, lang: Lang): string {
  const wd = WEEKDAY[lang][weekday(date)];
  return lang === "zh" ? `${shortDate(date, lang)} ${wd}` : `${wd} ${shortDate(date, lang)}`;
}

/** "17:30" / "5:30 pm", from a Vancouver wall-clock time ("2026-11-10T17:30:00-07:00"). */
export function clock(iso: string, lang: Lang): string {
  const h = +iso.slice(11, 13);
  const m = iso.slice(14, 16);
  if (lang === "zh") return `${two(h)}:${m}`;
  return `${h % 12 || 12}${m === "00" ? "" : `:${m}`} ${h < 12 ? "am" : "pm"}`;
}

/** The day an event is listed under: the day it starts, or the first day shown if it started before. */
export const listedOn = (e: PublicEvent, first: string) => (dayOf(e.start) < first ? first : dayOf(e.start));

/** Within a day: under way already, then all day, then by time, then time to be announced. */
export const rank = (e: PublicEvent, day: string) => (dayOf(e.start) < day ? 0 : e.timeTBD ? 3 : e.allDay ? 1 : 2);

/** The time column: when it starts (and ends, the same day), and the last day if it runs on. */
export function whenLines(e: PublicEvent, day: string, lang: Lang): string[] {
  const zh = lang === "zh";
  const start = dayOf(e.start);
  const end = e.end ? dayOf(e.end) : start;
  const lines: string[] = [];
  if (start < day) lines.push(zh ? "进行中" : "On now");
  else if (e.timeTBD) lines.push(zh ? "时间待定" : "Time TBA");
  else if (e.allDay) lines.push(zh ? "全天" : "All day");
  else {
    lines.push(clock(e.start, lang));
    if (e.end && e.end.length > 10 && end === start) lines.push(zh ? `至 ${clock(e.end, lang)}` : `to ${clock(e.end, lang)}`);
  }
  if (end > day) lines.push(zh ? `至 ${shortDate(end, lang)}` : `until ${shortDate(end, lang)}`);
  return lines;
}
