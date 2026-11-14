/**
 * 导出账目: a ledger as a CSV file, to open in a spreadsheet (docs/split.md: "export the expenses as
 * CSV"; "people can export their own data"). One row per expense or payment still in the ledger,
 * in the order they were recorded: when, which kind, the note, who paid, how much (in the ledger's currency, and in the
 * one it was paid in, if another), then a column for each person: what that row does to where they
 * stand (what they paid, less their part of it; a payment counts for the one who made it and against
 * the one paid). The last row adds each column up, so each person's total is where they stand, the
 * number the settle tab works from. Deleted entries aren't in it: they count for nothing (the record
 * keeps them).
 *
 * Written for Excel as much as anything: UTF-8 with a byte-order mark (without it Excel reads Chinese
 * as noise), each line ending in CR LF, and a field with a comma, a quote or a line break in it in
 * quotes. A note or a name is only ever text: one that starts the way a formula does (= + - @) gets
 * a ' in front of it, so a spreadsheet shows it rather than runs it. Nothing here touches the screen
 * (tests/split-screens.test.ts).
 */
import type { Lang } from "../i18n";
import { balances, fromMinor, portionsOf, spent, type Ledger } from "./core";
import { decimalsOf } from "./format";
import { say } from "./words";

/** Excel's sign that the file is UTF-8. */
const BOM = "\uFEFF";

/** A field as CSV writes it: in quotes when it holds a comma, a quote or a line break. */
const field = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** Text someone typed (a note, a name): never read as a formula. */
const text = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** When, as a spreadsheet reads it: 2026-11-14 10:12, on this phone's clock. */
const stamp = (at: number) => {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** The ledger as CSV, its headings in `lang`. */
export function csvOf(l: Ledger, lang: Lang): string {
  const cents = decimalsOf(l.currency);
  const plain = (n: number) => fromMinor(n, cents);
  const name = (id: string) => l.members.find((m) => m.id === id)?.name ?? "";
  const live = l.entries.filter((e) => e.gone === undefined);
  // the columns for another currency, only in a ledger that has any
  const abroad = live.some((e) => e.kind === "expense" && e.paidIn);
  const rows: string[][] = [
    [
      say(lang, "csvWhen"),
      say(lang, "csvKind"),
      say(lang, "csvNote"),
      say(lang, "csvPaidBy"),
      say(lang, "csvAmount"),
      say(lang, "csvCurrency"),
      ...(abroad ? [say(lang, "csvPaidIn"), say(lang, "csvPaidInAmount"), say(lang, "csvRate")] : []),
      ...l.members.map((m) => text(m.name)),
    ],
  ];
  for (const e of live) {
    const parts = new Map<string, number>(l.members.map((m) => [m.id, 0]));
    const add = (id: string, n: number) => parts.set(id, (parts.get(id) ?? 0) + n);
    let row: string[];
    if (e.kind === "expense") {
      add(e.payer, e.amount);
      for (const [id, part] of Object.entries(portionsOf(e, l))) add(id, -part);
      const other = e.paidIn ? [e.paidIn.currency, fromMinor(e.paidIn.amount, decimalsOf(e.paidIn.currency)), e.paidIn.rate] : ["", "", ""];
      row = [stamp(e.at), say(lang, "csvExpense"), text(e.note), text(name(e.payer)), plain(e.amount), l.currency, ...(abroad ? other : [])];
    } else {
      add(e.from, e.amount);
      add(e.to, -e.amount);
      row = [stamp(e.at), say(lang, "csvPayment"), text(say(lang, "pictureWho", { from: name(e.from), to: name(e.to) })), text(name(e.from)), plain(e.amount), l.currency, ...(abroad ? ["", "", ""] : [])];
    }
    rows.push([...row, ...l.members.map((m) => plain(parts.get(m.id) ?? 0))]);
  }
  const stand = balances(l);
  rows.push(["", say(lang, "csvTotal"), "", "", plain(spent(l)), l.currency, ...(abroad ? ["", "", ""] : []), ...l.members.map((m) => plain(stand[m.id] ?? 0))]);
  return BOM + rows.map((r) => r.map(field).join(",")).join("\r\n") + "\r\n";
}
