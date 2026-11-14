/**
 * 结清图: the settle plan as a picture, to send to the group chat (docs/split.md: the plan "generates a
 * picture to send to a WeChat group", and "the picture says when it was made; once more is recorded,
 * the page says the picture is out of date, so nobody pays from an old one"). What the picture says is
 * worked out here, with no canvas and no screen (tests/split-screens.test.ts); paint.ts draws it, and
 * PictureSheet.tsx shows it and sends it.
 *
 * Everyone in the group reads it, so it names people by name, never 你, as the plan copied as text
 * does (lines.ts, planText). It says when it was made as a date, not "today": it is read later.
 *
 * Out of date: when the phone makes the picture it keeps, for that ledger, when, and the plan's
 * transfers as they were then (who pays whom, and how much). Once the plan's transfers are no longer
 * those, a picture someone may still be paying from is out of date, and the settle tab says so. A
 * transfer marked as paid since doesn't make it out of date: what it says to pay is still right.
 */
import type { Lang } from "../i18n";
import type { Ledger, Settlement } from "./core";
import { money } from "./format";
import { nameFor, planText } from "./lines";
import { say, W } from "./words";

/** A transfer on the picture: who pays whom, how much, and whether it has been paid. */
export type PictureRow = { who: string; amount: string; status: string; paid: boolean };

/** What the picture says, top to bottom. */
export type Picture = {
  /** 两清 · All Square, at the top, in the tool's light */
  mark: string;
  /** the ledger's name */
  name: string;
  /** how many transfers settle everyone; or that everyone is square */
  head: string;
  clear: boolean;
  rows: PictureRow[];
  /** when it was made, and what to go by after that */
  asOf: string;
  /** where 两清 lives */
  site: string;
  /** all of it as text: what a screen reader says for the picture */
  text: string;
};

/** When the phone last made a ledger's picture, and the plan's transfers as they were then. */
export type Made = { at: number; print: string };

/** The plan's transfers, as a picture shows them: who pays whom, and how much (not whether it is paid yet). */
export const stepsPrint = (plan: Settlement): string => plan.steps.map((s) => `${s.from}>${s.to}:${s.amount}`).join("|");

/** Is the picture this phone last made of a ledger out of date: has who pays whom, or how much, changed since? */
export const isStale = (made: Made | undefined, plan: Settlement): boolean => made !== undefined && made.print !== stepsPrint(plan);

/** The day and time a picture was made, as it is read later: 11月14日 10:12, Nov 14, 10:12 a.m. */
export function dayText(at: number, lang: Lang): string {
  const when = new Date(at);
  const locale = lang === "zh" ? "zh-CN" : "en-CA";
  const day = new Intl.DateTimeFormat(locale, { month: lang === "zh" ? "long" : "short", day: "numeric" }).format(when);
  const time = new Intl.DateTimeFormat(locale, lang === "zh" ? { hour: "2-digit", minute: "2-digit", hour12: false } : { hour: "numeric", minute: "2-digit" }).format(when);
  return lang === "zh" ? `${day} ${time}` : `${day}, ${time}`;
}

/** The picture of a ledger's plan, made at `at`. */
export function pictureOf(l: Ledger, plan: Settlement, lang: Lang, at: number): Picture {
  const name = (id: string) => nameFor(l, id, undefined, lang) || say(lang, "someone");
  return {
    mark: `${W.name.zh} · ${W.name.en}`,
    name: l.name,
    head: plan.clear ? say(lang, "allSquare") : plan.steps.length === 1 ? say(lang, "transferOne") : say(lang, "transfers", { n: plan.steps.length }),
    clear: plan.clear,
    rows: plan.steps.map((s) => ({
      who: say(lang, "pictureWho", { from: name(s.from), to: name(s.to) }),
      amount: money(s.amount, l.currency, lang),
      status: say(lang, s.paid ? "paid" : "notPaid"),
      paid: !!s.paid,
    })),
    asOf: say(lang, "pictureAsOf", { when: dayText(at, lang) }),
    site: "changle.ca",
    text: `${planText(l, plan, lang)}\n${say(lang, "pictureAsOf", { when: dayText(at, lang) })}`,
  };
}
