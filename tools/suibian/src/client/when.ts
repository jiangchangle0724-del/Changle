// A planned meal's time in words, in Vancouver time and the reader's language: "明天 18:30",
// "Fri, Nov 13 6:30 p.m.", or "现在".
import { vancouverDay } from "../engine";
import { getLang, t } from "./i18n";

const TZ = "America/Vancouver";
const locale = () => (getLang() === "zh" ? "zh-CN" : "en-CA");
const sameDay = (a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) => a.y === b.y && a.m === b.m && a.d === b.d;

/** "18:30", "6:30 p.m.". */
export function timeLabel(ms: number): string {
  return new Intl.DateTimeFormat(locale(), { timeZone: TZ, hour: "numeric", minute: "2-digit", hourCycle: getLang() === "zh" ? "h23" : "h12" }).format(ms);
}

/** "今天", "明天", "11月13日周五". */
export function dayLabel(ms: number, now = Date.now()): string {
  const d = vancouverDay(ms);
  if (sameDay(d, vancouverDay(now))) return t("today");
  if (sameDay(d, vancouverDay(now, 1))) return t("tomorrow");
  return new Intl.DateTimeFormat(locale(), { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(ms);
}

/** The meal's time, or "now". */
export const whenLabel = (at: number | null | undefined, now = Date.now()) => (at ? `${dayLabel(at, now)} ${timeLabel(at)}` : t("whenNow"));
