/**
 * The lines 两清's screens say about a ledger, as plain text: where you stand, how an expense was
 * paid and shared, who pays whom, the plan as it is pasted into a group chat, and how the sending
 * to the server is going. Nothing here touches the screen, so each line is tested as it is written
 * (tests/split-screens.test.ts).
 */
import type { Lang } from "../i18n";
import type { Sent } from "./changes";
import { balances, expensesOf, type Expense, type Ledger, type Settlement } from "./core";
import type { Category } from "./categories";
import type { Person } from "./people";
import { summaryOf, type Most } from "./summary";
import { dayBefore, dayName, localDay, money, signedMoney } from "./format";
import { NAME_MAX, NOTE_MAX, tidy } from "./ops";
import type { Held } from "./sync";
import type { SyncState, Trouble } from "./syncer";
import { say, type Word } from "./words";

const nameOf = (l: Ledger, id: string) => l.members.find((m) => m.id === id)?.name ?? "";

/**
 * Which of the ledger's people this phone's owner is, when the phone knows. (A saved record can
 * lose it, and someone who joins by a link, later, hasn't said yet. It never guesses.)
 */
export const mine = (l: Ledger, me: string | undefined) => (me && l.members.some((m) => m.id === me) ? me : undefined);

/** Each kind of spending's name (categories.ts). */
export const CATEGORY_WORD: Record<Category, Word> = { food: "catFood", groceries: "catGroceries", transport: "catTransport", lodging: "catLodging", fun: "catFun", shopping: "catShopping", other: "catOther" };

/** A member's name as this phone's owner reads it: 你 for themselves. */
export const nameFor = (l: Ledger, id: string, me: string | undefined, lang: Lang) => (id === me ? say(lang, "you") : nameOf(l, id));

/** The day an expense was spent: the one it says, or else the day it was recorded, on this phone's calendar. */
export const spentOn = (e: Pick<Expense, "date" | "at">) => e.date ?? localDay(e.at);

/** A day as a person reads it next to today: 今天, 昨天, or the day (with its weekday when asked, its year when it isn't this one). */
export function dayLabel(day: string, today: string, lang: Lang, weekday = false): string {
  if (day === today) return say(lang, "dayToday");
  if (day === dayBefore(today)) return say(lang, "dayYesterday");
  return dayName(day, lang, Number(today.slice(0, 4)), weekday);
}

/** Expenses by the day they were spent, latest day first; within a day, the latest recorded first. */
export function byDay<E extends Pick<Expense, "date" | "at">>(expenses: readonly E[]): [string, E[]][] {
  const days = new Map<string, E[]>();
  for (const e of [...expenses].reverse()) {
    const day = spentOn(e);
    days.set(day, [...(days.get(day) ?? []), e]);
  }
  return [...days.entries()].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
}

/**
 * 总结 (summary.ts) as lines a page or a picture says: what each is, its sum, and what it is over
 * (how many expenses, or whose it is). Nothing while nothing has been spent; the tips and the tax
 * only when some expense has them. `me` is 你 on a page, and nobody on a picture the group reads.
 * When everyone in the ledger came to the most (a trip shared evenly throughout), naming them all
 * says nothing: it says 一样多, and what each came to.
 */
export function summaryLines(l: Ledger, me: string | undefined, lang: Lang): { term: string; value: string; more: string }[] {
  const s = summaryOf(l);
  if (!s.count) return [];
  const sum = (n: number) => money(n, l.currency, lang);
  const counted = (n: number, one: Word, many: Word) => (n === 1 ? say(lang, one) : say(lang, many, { n }));
  const most = (term: Word, m: Most) =>
    m.who.length > 1 && m.who.length === l.members.length
      ? { term: say(lang, term), value: say(lang, "summaryAllSame"), more: say(lang, "summaryEach", { amount: sum(m.amount) }) }
      : { term: say(lang, term), value: m.who.map((id) => nameFor(l, id, me, lang) || say(lang, "someone")).join(say(lang, "nameAnd")), more: sum(m.amount) };
  return [
    { term: say(lang, "summarySpent"), value: signedMoney(s.spent, l.currency, lang), more: counted(s.count, "summaryCountOne", "summaryCount") },
    ...(s.refunded ? [{ term: say(lang, "summaryRefunds"), value: sum(s.refunds), more: counted(s.refunded, "summaryRefundCountOne", "summaryRefundCount") }] : []),
    ...(s.tipped ? [{ term: say(lang, "summaryTips"), value: sum(s.tips), more: counted(s.tipped, "summaryOnOne", "summaryOn") }] : []),
    ...(s.taxed ? [{ term: say(lang, "summaryTax"), value: sum(s.tax), more: counted(s.taxed, "summaryOnOne", "summaryOn") }] : []),
    ...(s.paidMost ? [most("summaryPaidMost", s.paidMost)] : []),
    ...(s.spentMost ? [most("summarySpentMost", s.spentMost)] : []),
  ];
}

/**
 * One member's sums on a line, for 每个人: "付了 $120.00 · 摊 $87.50 · 已收 $20.00" (what they sent
 * or received only when there is some). Someone with nothing at all has 还没有账.
 */
export function personLine(p: Person, currency: string, lang: Lang): string {
  if (!p.paid && !p.share && !p.sent && !p.received) return say(lang, "personNothing");
  // (paid and shared count refunds the other way round, so either can be below nothing)
  const part = (w: Word, n: number) => `${say(lang, w)} ${signedMoney(n, currency, lang)}`;
  return [part("personPaid", p.paid), part("personShare", p.share), ...(p.sent ? [part("personSent", p.sent)] : []), ...(p.received ? [part("personReceived", p.received)] : [])].join(" · ");
}

/** Where one member stands, in a word and a sum: 该收 $12.50, 该给 $12.50, or 两清 with none. */
export const personStands = (p: Pick<Person, "net">): { word: Word; amount: number | null } =>
  p.net > 0 ? { word: "personGets", amount: p.net } : p.net < 0 ? { word: "personOwes", amount: -p.net } : { word: "personSquare", amount: null };

/** An expense's tip and tax, said in the currency it was paid in ("小费 $18.00 · 税 $5.25"); null with neither. */
export function extrasText(tip: number | null | undefined, tax: number | null | undefined, currency: string, lang: Lang): string | null {
  const parts = [tip ? say(lang, "extraTip", { amount: money(tip, currency, lang) }) : "", tax ? say(lang, "extraTax", { amount: money(tax, currency, lang) }) : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Where you stand in a ledger, in words, for its card in the list: owed, owing, square, or nothing
 * recorded yet. Empty when the phone doesn't know which of the people you are.
 */
export function standing(l: Ledger, me: string | undefined, lang: Lang): string {
  if (!expensesOf(l).length) return say(lang, "nothingYet");
  const who = mine(l, me);
  if (!who) return "";
  const net = balances(l)[who] ?? 0;
  if (net > 0) return `${say(lang, "youGet")} ${money(net, l.currency, lang)}`;
  if (net < 0) return `${say(lang, "youOwe")} ${money(net, l.currency, lang)}`;
  return say(lang, "youSquare");
}

/** Who paid an expense, for its row: "你付", "小王付". */
export const paidBy = (e: Expense, l: Ledger, me: string | undefined, lang: Lang) =>
  // (a refund: who got it back)
  e.refund
    ? e.payer === me
      ? say(lang, "receivedByYou")
      : say(lang, "receivedBy", { who: nameOf(l, e.payer) })
    : e.payer === me
      ? say(lang, "paidByYou")
      : say(lang, "paidBy", { who: nameOf(l, e.payer) });

/** How an expense was shared, in a few words for its row. */
export function sharedHow(e: Expense, l: Ledger, me: string | undefined, lang: Lang): string {
  const s = e.split;
  if (s.how === "shares") return say(lang, "splitShares");
  if (s.how === "exact") return say(lang, "splitExact");
  if (s.among.length === 1) return s.among[0] === me ? say(lang, "splitOneYou") : say(lang, "splitOne", { who: nameOf(l, s.among[0]) });
  return say(lang, "splitEven", { n: s.among.length });
}

/** One transfer as this phone's owner reads it: "小李 给 你", "You pay 小王". */
export function paysLine(l: Ledger, from: string, to: string, me: string | undefined, lang: Lang): string {
  if (from === me) return say(lang, "youPay", { to: nameOf(l, to) });
  if (to === me) return say(lang, "paysYou", { from: nameOf(l, from) });
  return say(lang, "pays", { from: nameOf(l, from), to: nameOf(l, to) });
}

/**
 * The plan to settle up, as text for a group chat: the ledger's name, then a transfer a line, then
 * how each person still to be paid takes money, when they have said (收款方式). Real names
 * throughout, never 你: whoever reads it in the chat isn't the one who copied it.
 */
export function planText(l: Ledger, plan: Settlement, lang: Lang): string {
  const lines = [say(lang, "planTitle", { name: l.name })];
  for (const s of plan.steps) lines.push(say(lang, "planLine", { from: nameOf(l, s.from), to: nameOf(l, s.to), amount: money(s.amount, l.currency, lang) }) + (s.paid ? say(lang, "planPaid") : ""));
  if (plan.clear) lines.push(say(lang, "planSquare"));
  // (how the people still to be paid take money, a line each, when they have said: so the group has it where the transfers are)
  const owed = [...new Set(plan.steps.filter((s) => !s.paid).map((s) => s.to))];
  for (const id of owed) {
    const pay = l.members.find((m) => m.id === id)?.pay;
    if (pay) lines.push(say(lang, "planPay", { who: nameOf(l, id), pay }));
  }
  return lines.join("\n");
}

const TROUBLE: Record<Trouble, Word> = { limit: "troubleLimit", gone: "troubleGone", key: "troubleKey", taken: "troubleTaken", stuck: "troubleStuck", signin: "troubleSignin" };

/**
 * What to say about a ledger and the server, when there is something to say; null while the two
 * are in step, or a change is simply on its way (the page says nothing then). `loud` is for what
 * won't sort itself out: the phone can't go on sending, and its owner has to know. The rest is
 * for a phone with no signal, and passes when the signal is back.
 *
 * A locked ledger says so for as long as it is locked (`lock`: its mark is a lock): quietly, as
 * the state of things, and in the strong voice on a phone that recorded something before it heard,
 * which can't go up until the ledger's owner opens it. `mine`: this phone is the owner's.
 */
export function syncLine(h: Pick<Held, "made" | "waiting"> & { locked?: boolean; mine?: boolean }, s: Pick<SyncState, "away" | "trouble">, lang: Lang): { text: string; loud: boolean; lock?: true } | null {
  if (s.trouble) return { text: say(lang, TROUBLE[s.trouble]), loud: true };
  if (h.locked) {
    const n = h.waiting.length;
    if (n) return { text: n === 1 ? say(lang, "lockedUnsentOne") : say(lang, "lockedUnsent", { n }), loud: true, lock: true };
    return { text: say(lang, h.mine ? "lockedOwner" : "locked"), loud: false, lock: true };
  }
  if (!s.away) return null;
  if (!h.made) return { text: say(lang, "notMade"), loud: false };
  const n = h.waiting.length;
  return { text: n === 0 ? say(lang, "offline") : n === 1 ? say(lang, "unsentOne") : say(lang, "unsent", { n }), loud: false };
}

/**
 * A change that didn't stick, named so the one who made it knows which it was: the note and the
 * amount of an expense, who was to pay whom, the name of a person. Real names, as in the plan.
 */
export function lostLine(l: Ledger, sent: Sent, lang: Lang): string {
  const c = sent.change;
  const expense = (e: { note: string; amount: number; merchant?: string | null }) => `${tidy(e.note, NOTE_MAX) || e.merchant || say(lang, "noNote")} ${money(e.amount, l.currency, lang)}`;
  switch (c.do) {
    case "expense":
      return say(lang, "lostExpense", { what: expense(c.expense) });
    case "edit":
      return say(lang, "lostEdit", { what: expense(c.to) });
    case "transfer": {
      const from = nameOf(l, c.transfer.from);
      const to = nameOf(l, c.transfer.to);
      return from && to ? say(lang, "lostPaid", { what: say(lang, "planLine", { from, to, amount: money(c.transfer.amount, l.currency, lang) }) }) : say(lang, "lostOther");
    }
    case "member":
      return say(lang, "lostAdd", { who: tidy(c.member.name, NAME_MAX) });
    case "rename": {
      const who = nameOf(l, c.member);
      return who ? say(lang, "lostRename", { who, name: tidy(c.name, NAME_MAX) }) : say(lang, "lostOther");
    }
    case "remove": {
      const who = nameOf(l, c.member);
      return who ? say(lang, "lostRemove", { who }) : say(lang, "lostOther");
    }
    case "pay": {
      const who = nameOf(l, c.member);
      return who ? say(lang, "lostPay", { who }) : say(lang, "lostOther");
    }
    default:
      return say(lang, "lostOther");
  }
}
