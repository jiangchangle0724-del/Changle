/**
 * A ledger's record (改动记录), in words: what was done, by whom, and when, newest first. The server
 * keeps every change that counted, with who made it as the phone said (`Sent.by`) and when it
 * arrived, and a line for each time the ledger was locked or opened again
 * (tools/split/src/room/ledger.ts, Logged); this phone adds what it hasn't sent yet.
 *
 * Read from the start, the record says what each entry was before every change to it, so a line
 * can say what an edit changed, and offer to change it back (the latest edit of an expense still
 * in the ledger, where changing it back would go through) or to bring a deleted expense back
 * (within RESTORE_DAYS of deleting it). Nothing here touches the network or the screen
 * (tests/split-screens.test.ts).
 *
 * The record doesn't hold the ledger as it was started, so a person who was there from the start
 * has no name in it before they were renamed: their first rename says only the new name, and a
 * person taken off is named only if the record added them.
 */
import type { Lang } from "../i18n";
import { applyChange, type Change, type Sent } from "./changes";
import type { Entry, Expense, Ledger, Transfer } from "./core";
import { dayName, money } from "./format";
import { DETAILS, NAME_MAX, NOTE_MAX, PAY_MAX, afterEdit, tidy, type Detail } from "./ops";
import { say, type Word } from "./words";

/** How the record says an expense's business, place or what paid it changed, or was taken off. */
const DETAIL_SAID: Record<Detail, Word> = { merchant: "historyMerchant", place: "historyPlace", payment: "historyPayment" };
const DETAIL_GONE: Record<Detail, Word> = { merchant: "historyMerchantGone", place: "historyPlaceGone", payment: "historyPaymentGone" };

/** A line of the record as the server keeps it: a change that counted, or the ledger locked or opened. */
export type Logged = { seq: number; at: number; sent: Sent } | { seq: number; at: number; lock: boolean };

/** How long after an expense is deleted it can still be brought back from the record. */
export const RESTORE_DAYS = 30;
const DAY = 86_400_000;

/** One line of the record as the sheet shows it. */
export type HistoryLine = {
  key: string;
  /** what was done, and to what */
  text: string;
  /** for an expense changed: what changed */
  detail?: string;
  /** who did it */
  who: string;
  /** when it was done: on the phone that did it (the server's time, for a lock) */
  at: number;
  /** still on this phone, not sent yet */
  pending?: boolean;
  /** what this line offers: the expense changed back to what it was, or brought back */
  action?: { word: "revert" | "restore"; change: Change };
};

type Step = { key: string; at: number; pending: boolean; by?: string; change: Change } | { key: string; at: number; lock: boolean };

/** The record, newest first: the server's lines, then (newer still) what this phone has waiting. `now`: the ledger as the screen shows it; `clock`: the time now. */
export function historyOf(now: Ledger, log: Logged[], waiting: Sent[], me: string | undefined, lang: Lang, clock: number): HistoryLine[] {
  const steps: Step[] = [
    ...[...log].sort((a, b) => a.seq - b.seq).map((l): Step => ("lock" in l ? { key: `s${l.seq}`, at: l.at, lock: l.lock } : { key: `s${l.seq}`, at: l.sent.at, pending: false, by: l.sent.by, change: l.sent.change })),
    ...waiting.map((s): Step => ({ key: `w${s.id}`, at: s.at, pending: true, by: s.by, change: s.change })),
  ];
  // the last edit of each expense, and the last time each was deleted: the only lines that offer anything
  const lastEdit = new Map<string, string>();
  const lastOut = new Map<string, string>();
  for (const s of steps) {
    if ("lock" in s) continue;
    if (s.change.do === "edit") lastEdit.set(s.change.entry, s.key);
    if (s.change.do === "out") lastOut.set(s.change.entry, s.key);
  }
  const locked = now.locked !== undefined;
  const byId = new Map(now.entries.map((e) => [e.id, e]));
  const inNow = (id: string) => byId.get(id);

  const entries = new Map<string, Entry>();
  // names the record itself gave people: someone added along the way, or renamed
  const names = new Map<string, string>();
  const nameOf = (id: string) => now.members.find((m) => m.id === id)?.name ?? names.get(id) ?? "";
  const who = (by: string | undefined) => (by === undefined ? say(lang, "someone") : by === me ? say(lang, "you") : nameOf(by) || say(lang, "someone"));
  const amount = (n: number) => money(n, now.currency, lang);
  const expense = (e: { note: string; amount: number; merchant?: string | null }) => `${tidy(e.note, NOTE_MAX) || e.merchant || say(lang, "noNote")} ${amount(e.amount)}`;
  const paid = (t: { from: string; to: string; amount: number }) => say(lang, "planLine", { from: nameOf(t.from) || say(lang, "someone"), to: nameOf(t.to) || say(lang, "someone"), amount: amount(t.amount) });
  const what = (e: Entry | undefined) => (!e ? say(lang, "noNote") : e.kind === "expense" ? expense(e) : paid(e));

  const lines: HistoryLine[] = [];
  for (const s of steps) {
    if ("lock" in s) {
      lines.push({ key: s.key, text: say(lang, s.lock ? "historyLock" : "historyUnlock"), who: say(lang, "startedIt"), at: s.at });
      continue;
    }
    const line = (text: string, more: Partial<HistoryLine> = {}): HistoryLine => ({ key: s.key, text, who: who(s.by), at: s.at, ...(s.pending ? { pending: true } : {}), ...more });
    const c = s.change;
    switch (c.do) {
      case "expense": {
        entries.set(c.expense.id, { ...c.expense, kind: "expense" });
        lines.push(line(say(lang, "historyExpense", { what: expense(c.expense) })));
        break;
      }
      case "edit": {
        const before = entries.get(c.entry);
        if (!before || before.kind !== "expense") {
          lines.push(line(say(lang, "historyEdit", { what: expense(c.to) })));
          break;
        }
        const after = edited(before, c.to);
        entries.set(c.entry, after);
        const there = inNow(c.entry);
        const back: Change = { do: "edit", entry: c.entry, to: { payer: before.payer, amount: before.amount, note: before.note, split: before.split, paidIn: before.paidIn ?? null, files: before.files ?? null, tip: before.tip ?? null, tax: before.tax ?? null, date: before.date ?? null, merchant: before.merchant ?? null, place: before.place ?? null, payment: before.payment ?? null } };
        // (only where it would go through: whoever paid it or shared it may have been taken off since)
        const offer = !locked && lastEdit.get(c.entry) === s.key && !!there && there.gone === undefined && applyChange(now, back) !== null;
        lines.push(line(say(lang, "historyEdit", { what: expense(after) }), {
          detail: changed(before, after, me, lang, nameOf, amount, now.currency),
          ...(offer ? { action: { word: "revert" as const, change: back } } : {}),
        }));
        break;
      }
      case "out": {
        const e = entries.get(c.entry);
        if (e) entries.set(c.entry, { ...e, gone: c.at });
        const there = inNow(c.entry);
        const offer = !locked && e?.kind === "expense" && lastOut.get(c.entry) === s.key && there?.gone !== undefined && clock - s.at <= RESTORE_DAYS * DAY;
        lines.push(line(say(lang, e?.kind === "transfer" ? "historyUnpaid" : "historyOut", { what: what(e) }), offer ? { action: { word: "restore", change: { do: "back", entry: c.entry } } } : {}));
        break;
      }
      case "back": {
        const e = entries.get(c.entry);
        if (e) {
          const { gone: _was, ...back } = e;
          entries.set(c.entry, back as Entry);
        }
        lines.push(line(say(lang, "historyBack", { what: what(e) })));
        break;
      }
      case "transfer": {
        const t: Transfer = { ...c.transfer, kind: "transfer" };
        entries.set(t.id, t);
        lines.push(line(say(lang, "historyPaid", { what: paid(t) })));
        break;
      }
      case "member": {
        const name = tidy(c.member.name, NAME_MAX);
        names.set(c.member.id, name);
        lines.push(line(say(lang, "historyAdd", { who: name })));
        break;
      }
      case "rename": {
        const was = names.get(c.member);
        const name = tidy(c.name, NAME_MAX);
        names.set(c.member, name);
        lines.push(line(was ? say(lang, "historyRename", { who: was, name }) : say(lang, "historyRenameSomeone", { name })));
        break;
      }
      case "pay": {
        // (what it says isn't repeated here: the record is for what happened, the 收款方式 is on the person)
        const name = nameOf(c.member) || say(lang, "someone");
        lines.push(line(say(lang, tidy(c.pay, PAY_MAX) ? "historyPay" : "historyPayOff", { who: name })));
        break;
      }
      case "remove": {
        const name = nameOf(c.member);
        lines.push(line(name ? say(lang, "historyRemove", { who: name }) : say(lang, "historyRemoveSomeone")));
        break;
      }
      case "title": {
        lines.push(line(say(lang, "historyTitle", { name: c.name })));
        break;
      }
    }
  }
  return lines.reverse();
}

/** An expense as an edit leaves it (the same rules as ops.ts, editExpense, without asking the roster); one the rules wouldn't take leaves it as it was. */
const edited = (before: Expense, to: Extract<Change, { do: "edit" }>["to"]): Expense => afterEdit(before, to) ?? before;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What an edit changed, said briefly: the amount, who paid, the note, how it is shared, the other currency, the photos, the tip, the tax and the day. */
function changed(before: Expense, after: Expense, me: string | undefined, lang: Lang, nameOf: (id: string) => string, amount: (n: number) => string, currency: string): string | undefined {
  const parts: string[] = [];
  if (before.amount !== after.amount) parts.push(say(lang, "historyAmount", { from: amount(before.amount), to: amount(after.amount) }));
  if (before.payer !== after.payer) parts.push(after.payer === me ? say(lang, "historyPayerYou") : say(lang, "historyPayer", { who: nameOf(after.payer) || say(lang, "someone") }));
  if (before.note !== after.note) parts.push(after.note ? say(lang, "historyNote", { note: after.note }) : say(lang, "historyNoteGone"));
  if (!same(before.split, after.split)) parts.push(say(lang, "historySplit"));
  if (!same(before.paidIn, after.paidIn)) parts.push(say(lang, "historyCurrency"));
  // (photos: some added, some taken off, or both)
  const had = new Set(before.files ?? []);
  const has = new Set(after.files ?? []);
  if ([...has].some((f) => !had.has(f))) parts.push(say(lang, "historyFilesAdded"));
  if ([...had].some((f) => !has.has(f))) parts.push(say(lang, "historyFilesRemoved"));
  // (tip and tax are in the currency it was paid in)
  const paidIn = (n: number) => money(n, after.paidIn?.currency ?? currency, lang);
  if (before.tip !== after.tip) parts.push(after.tip ? say(lang, "historyTip", { amount: paidIn(after.tip) }) : say(lang, "historyTipGone"));
  if (before.tax !== after.tax) parts.push(after.tax ? say(lang, "historyTax", { amount: paidIn(after.tax) }) : say(lang, "historyTaxGone"));
  if (before.date !== after.date) parts.push(after.date ? say(lang, "historyDate", { day: dayName(after.date, lang, new Date(after.at).getFullYear()) }) : say(lang, "historyDateGone"));
  for (const k of DETAILS) if (before[k] !== after[k]) parts.push(after[k] ? say(lang, DETAIL_SAID[k], { text: after[k] }) : say(lang, DETAIL_GONE[k]));
  if (!parts.length) return undefined;
  const text = parts.join(say(lang, "historyAnd"));
  // (a line of its own, so it starts as a sentence does)
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** When, as the record says it: the time today, yesterday, or the day (and the year, if not this one). */
export function whenText(at: number, clock: number, lang: Lang): string {
  const locale = lang === "zh" ? "zh-CN" : "en-CA";
  const day = new Date(at);
  const today = new Date(clock);
  const time = new Intl.DateTimeFormat(locale, lang === "zh" ? { hour: "2-digit", minute: "2-digit", hour12: false } : { hour: "numeric", minute: "2-digit" }).format(day);
  const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((dayOf(today) - dayOf(day)) / DAY);
  if (daysAgo === 0) return say(lang, "today", { time });
  if (daysAgo === 1) return say(lang, "yesterday", { time });
  const date = new Intl.DateTimeFormat(locale, { ...(day.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}), month: lang === "zh" ? "long" : "short", day: "numeric" }).format(day);
  return `${date} ${time}`;
}
