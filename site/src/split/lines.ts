/**
 * The lines 两清's screens say about a ledger, as plain text: where you stand, how an expense was
 * paid and shared, who pays whom, and the plan as it is pasted into a group chat. Nothing here
 * touches the screen, so each line is tested as it is written (tests/split-screens.test.ts).
 */
import type { Lang } from "../i18n";
import { balances, expensesOf, type Expense, type Ledger, type Settlement } from "./core";
import { money } from "./format";
import { say } from "./words";

const nameOf = (l: Ledger, id: string) => l.members.find((m) => m.id === id)?.name ?? "";

/**
 * Which of the ledger's people this phone's owner is, when the phone knows. (A saved record can
 * lose it, and someone who joins by a link, later, hasn't said yet. It never guesses.)
 */
export const mine = (l: Ledger, me: string | undefined) => (me && l.members.some((m) => m.id === me) ? me : undefined);

/** A member's name as this phone's owner reads it: 你 for themselves. */
export const nameFor = (l: Ledger, id: string, me: string | undefined, lang: Lang) => (id === me ? say(lang, "you") : nameOf(l, id));

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
export const paidBy = (e: Expense, l: Ledger, me: string | undefined, lang: Lang) => (e.payer === me ? say(lang, "paidByYou") : say(lang, "paidBy", { who: nameOf(l, e.payer) }));

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
 * The plan to settle up, as text for a group chat: the ledger's name, then a transfer a line. Real
 * names throughout, never 你: whoever reads it in the chat isn't the one who copied it.
 */
export function planText(l: Ledger, plan: Settlement, lang: Lang): string {
  const lines = [say(lang, "planTitle", { name: l.name })];
  for (const s of plan.steps) lines.push(say(lang, "planLine", { from: nameOf(l, s.from), to: nameOf(l, s.to), amount: money(s.amount, l.currency, lang) }) + (s.paid ? say(lang, "planPaid") : ""));
  if (plan.clear) lines.push(say(lang, "planSquare"));
  return lines.join("\n");
}
