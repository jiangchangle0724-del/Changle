/**
 * The general CSV reader (src/core/anycsv.ts). Every file in here is made up in this file: no
 * bank's real export and no real person's line is in the repository (SEC-12, IMP-9). The tests
 * are named for the shape of a file, not for a bank.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { csvPreview, isCsvLayout, readAnyCsv, readCsvAs, type CsvHints, type CsvRead } from "../src/core/anycsv";
import { addDays, type Day } from "../src/core/dates";
import type { CsvLayout, ParsedStatement } from "../src/core/model";
import { MAX_LINES } from "../src/core/ofx";
import { PARSER_IDS, readStatementFile } from "../src/core/read";
import { reconcile } from "../src/core/reconcile";
import { bytesOf, CARD_NUMBER, CHEQUING_NUMBER, latin1, SAVINGS_NUMBER } from "./samples";

// ---------------------------------------------------------------------------------------------
// Two made-up months, and a way to write them as a file of any shape
// ---------------------------------------------------------------------------------------------

/** One line as it should come back: the day, the amount with our sign (plus is into the account), the wording. */
type Line = readonly [day: Day, amount: number, words: string];

/** A month on a chequing account that opens with $1,000.00 and closes with $3,700.72. */
const OPENING = 100000;
const MONTH: readonly Line[] = [
  ["2026-10-01", 250000, "PAYROLL DEPOSIT ACME WIDGETS"],
  ["2026-10-02", -450, "CAFE MAPLE #12"],
  ["2026-10-02", -8217, "NORTH SHORE GROCER"],
  ["2026-10-05", -165000, "RENT E-TRANSFER"],
  ["2026-10-07", -6000, "ATM WITHDRAWAL"],
  ["2026-10-09", -1299, "STREAMBOX.CA"],
  ["2026-10-13", -4520, "HYDRO BILL"],
  ["2026-10-15", 250000, "PAYROLL DEPOSIT ACME WIDGETS"],
  ["2026-10-16", -12034, "NORTH SHORE GROCER"],
  ["2026-10-20", -2500, "TRANSIT PASS"],
  ["2026-10-23", 1575, "REFUND STREAMBOX.CA"],
  ["2026-10-27", -30000, "TRANSFER TO SAVINGS"],
  ["2026-10-30", -1495, "MONTHLY FEE"],
  ["2026-10-31", 12, "INTEREST"],
];

/** A month on a credit card that opens owing $412.50 and closes owing $398.53. What is owed is a negative balance. */
const CARD_OPENING = -41250;
const CARD: readonly Line[] = [
  ["2026-10-02", -1899, "CAFE MAPLE #12"],
  ["2026-10-03", -6420, "NORTH SHORE GROCER"],
  ["2026-10-06", -2350, "TRANSIT PASS"],
  ["2026-10-08", 41250, "PAYMENT - THANK YOU"],
  ["2026-10-11", -12999, "HARDWARE DEPOT"],
  ["2026-10-14", -4575, "STREAMBOX.CA"],
  ["2026-10-17", 2000, "REFUND HARDWARE DEPOT"],
  ["2026-10-21", -8800, "PACIFIC FUEL"],
  ["2026-10-25", -3310, "BOOKSHOP ON MAIN"],
  ["2026-10-29", -1500, "ANNUAL FEE"],
];

type Col = "date" | "bought" | "text" | "amount" | "out" | "in" | "balance" | "way" | "number" | "holder" | "blank";
type Shape = {
  cols: readonly Col[];
  /** The row of column names, by column. Left out: the file has no such row. */
  names?: Partial<Record<Col, string>>;
  delimiter?: "," | ";" | "\t" | "|";
  day?: "iso" | "mdy" | "dmy" | "compact" | "named" | "han" | "clock";
  decimal?: "." | ",";
  thousands?: boolean;
  newest?: boolean;
  /** Written the way some card files are: a purchase is a plus, and the balance is what is owed. */
  owing?: boolean;
  number?: string;
  above?: readonly string[];
  below?: readonly string[];
  /** Every line of the table ends with a delimiter, and the row of names doesn't. */
  trailing?: boolean;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function written(day: Day, style: Shape["day"]): string {
  const [y, m, d] = [day.slice(0, 4), day.slice(5, 7), day.slice(8, 10)];
  switch (style) {
    case "mdy":
      return `${m}/${d}/${y}`;
    case "dmy":
      return `${d}/${m}/${y}`;
    case "compact":
      return `${y}${m}${d}`;
    case "named":
      return `${MONTH_NAMES[Number(m) - 1]} ${Number(d)}, ${y}`;
    case "han":
      return `${y}年${Number(m)}月${Number(d)}日`;
    case "clock":
      return `${day} 09:30:00`;
    default:
      return day;
  }
}

function money(minor: number, shape: Pick<Shape, "decimal" | "thousands"> = {}): string {
  const mark = shape.decimal ?? ".";
  let whole = String(Math.floor(Math.abs(minor) / 100));
  if (shape.thousands) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, mark === "," ? " " : ",");
  return `${minor < 0 ? "-" : ""}${whole}${mark}${String(Math.abs(minor) % 100).padStart(2, "0")}`;
}

/** The lines as a file. The day before a purchase's posting stands in for the day it was made. */
function csv(lines: readonly Line[], opening: number, shape: Shape): string {
  const d = shape.delimiter ?? ",";
  const quote = (cell: string): string => (cell.includes(d) || /["\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  const worded = shape.cols.includes("way");
  let balance = opening;
  const rows = lines.map(([day, amount, words]) => {
    balance += amount;
    const cells: Record<Col, string> = {
      date: written(day, shape.day),
      bought: written(amount < 0 ? addDays(day, -1) : day, shape.day),
      text: words,
      amount: money(worded ? Math.abs(amount) : shape.owing ? -amount : amount, shape),
      out: amount < 0 ? money(-amount, shape) : "",
      in: amount > 0 ? money(amount, shape) : "",
      balance: money(shape.owing ? -balance : balance, shape),
      way: amount < 0 ? "DEBIT" : "CREDIT",
      number: shape.number ?? CHEQUING_NUMBER,
      holder: "A. SAMPLE",
      blank: "",
    };
    return shape.cols.map((col) => quote(cells[col])).join(d) + (shape.trailing ? d : "");
  });
  if (shape.newest) rows.reverse();
  const head = shape.names ? [shape.cols.map((col) => quote(shape.names![col] ?? "")).join(d)] : [];
  return [...(shape.above ?? []), ...head, ...rows, ...(shape.below ?? [])].join("\r\n") + "\r\n";
}

const sum = (lines: readonly Line[]): number => lines.reduce((total, [, amount]) => total + amount, 0);
const told = (s: ParsedStatement): (string | number)[][] => s.lines.map((l) => [l.posted, l.amount, l.description]);
const errorOf = (read: CsvRead): string => (read.ok ? "ok" : read.error);

function one(read: CsvRead, label = ""): ParsedStatement {
  assert.ok(read.ok, `${label} ${errorOf(read)}`);
  assert.equal(read.statements.length, 1, label);
  return read.statements[0]!;
}

/** The statement holds these lines, oldest first; with an opening balance, it also reconciles to the cent (ACC-2). */
function same(s: ParsedStatement, lines: readonly Line[], opening?: number, label = ""): void {
  assert.deepEqual(told(s), lines.map((line) => [...line]), label);
  assert.equal(s.parser, "csv");
  if (opening === undefined) {
    assert.equal(s.opening, undefined, label);
    assert.equal(s.closing, undefined, label);
    assert.ok(s.warnings.includes("no-closing-balance"), label);
    return;
  }
  assert.equal(s.opening, opening, label);
  assert.equal(s.closing, opening + sum(lines), label);
  assert.equal(s.closingAsOf, lines[lines.length - 1]![0], label);
  assert.equal(reconcile(s.lines, s.opening, s.closing).status, "reconciled", label);
}

const ENGLISH: Partial<Record<Col, string>> = { date: "Date", text: "Description", amount: "Amount", out: "Withdrawals", in: "Deposits", balance: "Balance" };

// ---------------------------------------------------------------------------------------------
// The shapes exports come in
// ---------------------------------------------------------------------------------------------

test("column names and one amount with a sign, with the balance after each line", () => {
  const read = readAnyCsv(csv(MONTH, OPENING, { cols: ["date", "text", "amount", "balance"], names: ENGLISH }));
  const s = one(read);
  same(s, MONTH, OPENING);
  assert.equal(s.closing, 370072);
  assert.deepEqual(s.warnings, []);
  assert.deepEqual(s.account, { currency: "CAD" });
  assert.equal(s.unread, 0);
  // each line carries the balance after it
  assert.deepEqual(s.lines[1], { posted: "2026-10-02", amount: -450, description: "CAFE MAPLE #12", balance: 349550 });
  assert.ok(read.ok);
  assert.deepEqual(read.layout, {
    delimiter: ",",
    width: 4,
    header: true,
    names: ["Date", "Description", "Amount", "Balance"],
    date: 0,
    dateStyle: "YMD",
    description: [1],
    amount: { kind: "signed", columns: [{ column: 2 }], out: "minus" },
    decimal: ".",
    balance: 3,
  });
  assert.ok(PARSER_IDS.includes("csv"));
});

test("no column names: the day, the wording, money out, money in, the balance", () => {
  const read = readAnyCsv(csv(MONTH, OPENING, { cols: ["date", "text", "out", "in", "balance"], day: "mdy", thousands: true }));
  const s = one(read);
  same(s, MONTH, OPENING);
  assert.deepEqual(s.warnings, []);
  assert.ok(read.ok);
  assert.deepEqual(read.layout, { delimiter: ",", width: 5, header: false, date: 0, dateStyle: "MDY", description: [1], amount: { kind: "split", out: 2, in: 3 }, decimal: ".", balance: 4 });
  // money in before money out: the balance says which is which, for a bank account
  const turned = readAnyCsv(csv(MONTH, OPENING, { cols: ["in", "out", "balance", "text", "date"] }), { kind: "chequing" });
  const t = one(turned);
  same(t, MONTH, OPENING);
  assert.deepEqual(t.warnings, []);
  assert.ok(turned.ok);
  assert.deepEqual(turned.layout.amount, { kind: "split", out: 1, in: 0 });
});

test("lines above and below the table, days written 20261001, a delimiter at the end of every line", () => {
  const names = { date: "Date", text: "Transaction", out: "Debit", in: "Credit", balance: "Running Balance" };
  const text = csv(MONTH, OPENING, { cols: ["date", "text", "out", "in", "balance"], names, day: "compact", above: ["Account activity", "Exported 2026-11-01 08:00", ""], below: ["", "End of list"], trailing: true });
  const read = readAnyCsv(text);
  const s = one(read);
  same(s, MONTH, OPENING);
  assert.deepEqual(s.warnings, []);
  assert.ok(read.ok);
  // the lines are one cell wider than the names: the names are lined up with them
  assert.deepEqual(read.layout.names, ["Date", "Transaction", "Debit", "Credit", "Running Balance", ""]);
  assert.equal(read.layout.dateStyle, "YMD");
  assert.deepEqual(read.layout.amount, { kind: "split", out: 2, in: 3 });
});

test("semicolons, a comma before the cents, the day first, names in French", () => {
  const text = csv(MONTH, OPENING, { cols: ["date", "text", "amount", "balance"], names: { date: "Date", text: "Libellé", amount: "Montant", balance: "Solde" }, delimiter: ";", day: "dmy", decimal: ",", thousands: true });
  assert.ok(text.includes("01/10/2026;PAYROLL DEPOSIT ACME WIDGETS;2 500,00;3 500,00"));
  const read = readAnyCsv(text);
  same(one(read), MONTH, OPENING);
  assert.ok(read.ok);
  assert.equal(read.layout.delimiter, ";");
  assert.equal(read.layout.dateStyle, "DMY");
  assert.equal(read.layout.decimal, ",");
  // the narrow space some exports group thousands with
  same(one(readAnyCsv(text.replace(/(\d) (\d{3},)/g, `$1${String.fromCodePoint(0x202f)}$2`))), MONTH, OPENING);
  // out and in under their French names, saved in Windows-1252 as older exports are
  const split = csv(MONTH, OPENING, { cols: ["date", "text", "out", "in", "balance"], names: { date: "Date", text: "Libellé", out: "Débit", in: "Crédit", balance: "Solde" }, delimiter: ";", day: "dmy", decimal: "," });
  const bytes = readStatementFile(latin1(split));
  assert.ok(bytes.ok);
  same(bytes.statements[0]!, MONTH, OPENING);
  assert.deepEqual(bytes.layout?.amount, { kind: "split", out: 2, in: 3 });
});

test("names in Chinese, days written 2026年10月1日", () => {
  const text = csv(MONTH, OPENING, { cols: ["date", "text", "out", "in", "balance"], names: { date: "交易日期", text: "摘要", out: "支出", in: "收入", balance: "余额" }, day: "han" });
  const read = readAnyCsv(text);
  same(one(read), MONTH, OPENING);
  assert.ok(read.ok);
  assert.deepEqual(read.layout.amount, { kind: "split", out: 2, in: 3 });
  assert.equal(read.layout.balance, 4);
});

test("a card: purchases and payments in named columns, what is owed as the balance", () => {
  const names = { bought: "Transaction Date", date: "Posted Date", number: "Card No.", text: "Description", out: "Debit", in: "Credit", balance: "Balance" };
  const text = csv(CARD, CARD_OPENING, { cols: ["bought", "date", "number", "text", "out", "in", "balance"], names, owing: true, number: CARD_NUMBER, day: "mdy" });
  const read = readAnyCsv(text);
  const s = one(read);
  same(s, CARD, CARD_OPENING);
  assert.equal(s.closing, -39853);
  assert.deepEqual(s.warnings, []);
  assert.deepEqual(s.account, { currency: "CAD", last4: "9012" });
  // the day of the purchase, where it isn't the day it was posted
  assert.equal(s.lines[0]!.date, "2026-10-01");
  assert.equal(s.lines[3]!.date, undefined);
  // what is owed is printed as a plus, and is a negative balance here
  assert.equal(s.lines[0]!.balance, -43149);
  assert.ok(read.ok);
  assert.equal(read.layout.date, 1);
  assert.equal(read.layout.bought, 0);
});

test("a card with one column of amounts: which sign is a purchase", () => {
  const shape: Shape = { cols: ["date", "text", "amount"], names: ENGLISH, owing: true };
  const text = csv(CARD, CARD_OPENING, shape);
  // told that it is a card, the reader goes by the payment: it is money in, so its sign is the sign of money in
  const card = one(readAnyCsv(text, { kind: "credit" }));
  same(card, CARD);
  assert.deepEqual(card.warnings, ["no-closing-balance"]);
  assert.equal(card.account.kind, "credit");
  // not told, it reads the file as a bank account's and leaves the kind open: the screen has to ask, and read again
  const blind = one(readAnyCsv(text));
  assert.equal(blind.account.kind, undefined);
  assert.deepEqual(
    told(blind),
    CARD.map(([day, amount, words]) => [day, -amount, words]),
  );
  // the same card written with a purchase as a minus
  same(one(readAnyCsv(csv(CARD, CARD_OPENING, { ...shape, owing: false }), { kind: "credit" })), CARD);
  // no payment in the file: most lines on a card are purchases, and the statement says this was assumed
  const purchases = CARD.filter(([, amount]) => amount < 0);
  const guessed = one(readAnyCsv(csv(purchases, CARD_OPENING, shape), { kind: "credit" }));
  same(guessed, purchases);
  assert.deepEqual(guessed.warnings, ["sign-guessed", "no-closing-balance"]);
});

test("a card with one column of amounts and what is owed after each line", () => {
  const text = csv(CARD, CARD_OPENING, { cols: ["date", "text", "amount", "balance"], owing: true });
  const read = readAnyCsv(text, { kind: "credit" });
  const s = one(read);
  same(s, CARD, CARD_OPENING);
  assert.deepEqual(s.warnings, []);
  assert.ok(read.ok);
  assert.deepEqual(read.layout.amount, { kind: "signed", columns: [{ column: 2 }], out: "plus" });
  // the same card with what is owed written as a minus, the way a bank account's balance would be
  same(one(readAnyCsv(csv(CARD, CARD_OPENING, { cols: ["date", "text", "amount", "balance"] }), { kind: "credit" })), CARD, CARD_OPENING);
});

test("a card's export that names each merchant's trade: a trade with \"payment\" in it is not a payment", () => {
  // The shape of the first real file this reader met: two dates, the card number with stars, the merchant's trade in a
  // column of its own, the merchant's town and postal code, a dollar sign on every amount, purchases as a plus, and the
  // cardholder's name on every line. The column names are the file's, as its invented copy kept them (IMP-9); every
  // line under them is made up here, the trades too.
  const text = [
    "Date,Posted Date,Reference Number,Activity Type,Activity Status,Card Number,Merchant Category Description,Merchant Name,Merchant City,Merchant State or Province,Merchant Country Code,Merchant Postal Code,Amount,Rewards,Name on Card",
    '2026-10-02,2026-10-03,"11111111111111111111111",TRANS,APPROVED,************4821,Payment Service Providers-Kiosks,INVENTED BURGER 12,VANCOUVER,BC,CAN,V5K 0A1,$12.49,,A SAMPLE',
    '2026-10-03,2026-10-04,"22222222222222222222222",TRANS,APPROVED,************4821,Grocery Stores and Supermarkets,NORTH SHORE GROCER,BURNABY,BC,CAN,V5H 0A1,$64.20,,A SAMPLE',
    '2026-10-04,2026-10-05,"33333333333333333333333",TRANS,APPROVED,************4821,Payment Service Providers-Kiosks,INVENTED NOODLE BAR,RICHMOND,BC,CAN,V6X 0A1,$18.99,,A SAMPLE',
    '2026-10-05,2026-10-06,"44444444444444444444444",TRANS,APPROVED,************4821,Telecommunication Services,INVENTED TEL PRE-AUTH PAYMENT,TORONTO,ON,CAN,M5V 0A1,$76.35,,A SAMPLE',
    '2026-10-06,2026-10-07,"10000ABCD-000001-000001",PYMT,APPROVED,************4821,,PAYMENT THANK YOU,,,,,-$412.50,,A SAMPLE',
    '2026-10-07,2026-10-08,"55555555555555555555555",TRANS,APPROVED,************4821,Payment Service Providers-Kiosks,CAFE MAPLE,VANCOUVER,BC,CAN,V6B 0A1,$4.75,,A SAMPLE',
    '2026-10-08,2026-10-09,"66666666666666666666666",TRANS,APPROVED,************4821,,INVENTED STORE / REFUND,TORONTO,ON,CAN,00000,-$26.70,,A SAMPLE',
  ].join("\r\n");
  const read = readAnyCsv(text, { kind: "credit" });
  const card = one(read);
  // purchases are money out, and the payment and the refund are money in: three trades and one shop that say "payment" do not outvote the line that thanks for one
  assert.deepEqual(
    card.lines.map((l) => [l.posted, l.date, l.amount, l.description]),
    [
      ["2026-10-03", "2026-10-02", -1249, "INVENTED BURGER 12"],
      ["2026-10-04", "2026-10-03", -6420, "NORTH SHORE GROCER"],
      ["2026-10-05", "2026-10-04", -1899, "INVENTED NOODLE BAR"],
      ["2026-10-06", "2026-10-05", -7635, "INVENTED TEL PRE-AUTH PAYMENT"],
      ["2026-10-07", "2026-10-06", 41250, "PAYMENT THANK YOU"],
      ["2026-10-08", "2026-10-07", -475, "CAFE MAPLE"],
      ["2026-10-09", "2026-10-08", 2670, "INVENTED STORE / REFUND"],
    ],
  );
  assert.deepEqual(card.account, { kind: "credit", currency: "CAD", last4: "4821" });
  assert.deepEqual(card.warnings, ["no-closing-balance"]);
  assert.equal(card.unread, 0);
  assert.ok(read.ok && read.layout.amount.kind === "signed" && read.layout.amount.out === "plus");
  // nothing of the cardholder's name, and nothing of where the merchants are, is kept
  assert.ok(!JSON.stringify(card).includes("SAMPLE") && !JSON.stringify(card).includes("V5K"));
  // With no line that thanks for a payment, "payment" where the lines are described is what there is to go by, and the
  // trades still do not count: two payments with a minus against one shop with the word in its name.
  const bare = text.replace("PAYMENT THANK YOU", "PAYMENT").replace("INVENTED STORE / REFUND", "ONLINE PAYMENT");
  const second = one(readAnyCsv(bare, { kind: "credit" }));
  assert.deepEqual(second.lines.map((l) => l.amount), [-1249, -6420, -1899, -7635, 41250, -475, 2670]);
  assert.deepEqual(second.warnings, ["no-closing-balance"]);
});

test("a card's file read without being told that it is a card", () => {
  // purchases as a minus, and what is owed as a plus: the balance goes down as the amounts go up
  const text = ["Date,Description,Amount,Balance", "2026-10-02,CAFE MAPLE,-18.99,431.49", "2026-10-03,NORTH SHORE GROCER,-64.20,495.69", "2026-10-08,PAYMENT - THANK YOU,412.50,83.19"].join("\n");
  // told: purchases are money out, and what is owed is a negative balance
  const card = one(readAnyCsv(text, { kind: "credit" }));
  assert.deepEqual(
    card.lines.map((l) => [l.amount, l.balance]),
    [
      [-1899, -43149],
      [-6420, -49569],
      [41250, -8319],
    ],
  );
  assert.equal(card.opening, -41250);
  assert.deepEqual(card.warnings, []);
  // not told: it could also be a bank account that writes money out as a plus. The reader keeps to the bank account and says that it assumed;
  // the statement has no kind, so the screen asks, and the file is read again.
  const blind = one(readAnyCsv(text));
  assert.deepEqual(blind.warnings, ["sign-guessed"]);
  assert.equal(blind.account.kind, undefined);
  assert.deepEqual(
    blind.lines.map((l) => l.amount),
    [1899, 6420, -41250],
  );
  // told that it is a bank account, there is nothing left to assume
  assert.deepEqual(one(readAnyCsv(text, { kind: "chequing" })).warnings, []);
});

test("the balance: what follows from the amounts, and what doesn't", () => {
  // Two lines of one amount on one day, newest first, read as well backwards with the signs turned round. The usual reading is kept.
  for (const text of ["Date,Description,Amount,Balance\n2026-10-02,COFFEE,-5.00,90.00\n2026-10-02,TEA,-5.00,95.00\n", "2026-10-02,COFFEE,-5.00,90.00\n2026-10-02,TEA,-5.00,95.00\n"]) {
    const s = one(readAnyCsv(text));
    assert.deepEqual(told(s), [
      ["2026-10-02", -500, "TEA"],
      ["2026-10-02", -500, "COFFEE"],
    ]);
    assert.equal(s.opening, 10000);
    assert.equal(s.closing, 9000);
    assert.deepEqual(s.warnings, []);
  }
  // today's balance, repeated on every line, is not the balance after each line: it is left out, and the person gives the closing balance
  const repeated = readAnyCsv("Date,Description,Amount,Balance\n2026-10-01,PAYROLL,2500.00,3700.72\n2026-10-02,COFFEE,-4.50,3700.72\n2026-10-03,GROCER,-82.17,3700.72\n");
  const r = one(repeated);
  assert.equal(r.opening, undefined);
  assert.equal(r.lines[0]!.balance, undefined);
  assert.deepEqual(r.warnings, ["no-closing-balance"]);
  assert.ok(repeated.ok);
  assert.equal(repeated.layout.balance, undefined);
  // the balance after each line, not the "available" balance beside it
  const beside = readAnyCsv("Date,Description,Amount,Available Balance,Balance\n2026-10-01,PAYROLL,2500.00,3400.00,3500.00\n2026-10-02,COFFEE,-4.50,3395.50,3495.50\n2026-10-03,GROCER,-82.17,3313.33,3413.33\n");
  assert.equal(one(beside).opening, 100000);
  assert.ok(beside.ok);
  assert.equal(beside.layout.balance, 4);
  // without names, two columns that both follow from the amounts: nothing says which is the balance, and the reader doesn't pick
  assert.equal(errorOf(readAnyCsv("2026-10-01,PAYROLL,2500.00,3400.00,3500.00\n2026-10-02,COFFEE,-4.50,3395.50,3495.50\n2026-10-03,GROCER,-82.17,3313.33,3413.33\n")), "layout-unclear");
  // several accounts with a balance each, their lines one among the other, oldest first or newest first
  // (the column of account numbers has to be named, or to hold few numbers over many lines: six lines without names are not enough to tell it from a reference)
  const rows = [
    `${CHEQUING_NUMBER},2026-10-01,PAYROLL,2500.00,3500.00`,
    `${SAVINGS_NUMBER},2026-10-01,INTEREST,0.12,200.12`,
    `${CHEQUING_NUMBER},2026-10-02,COFFEE,-4.50,3495.50`,
    `${SAVINGS_NUMBER},2026-10-03,TRANSFER IN,300.00,500.12`,
    `${CHEQUING_NUMBER},2026-10-03,GROCER,-82.17,3413.33`,
    `${CHEQUING_NUMBER},2026-10-05,RENT,-1650.00,1763.33`,
  ];
  for (const text of [["Account,Date,Description,Amount,Balance", ...rows].join("\n"), ["Account,Date,Description,Amount,Balance", ...[...rows].reverse()].join("\n")]) {
    const read = readAnyCsv(text);
    assert.ok(read.ok, errorOf(read));
    assert.deepEqual(
      read.statements.map((s) => [s.account.last4, s.opening, s.closing, s.lines.length, reconcile(s.lines, s.opening, s.closing).status, s.warnings.length]).sort(),
      [
        ["4321", 20000, 50012, 2, "reconciled", 0],
        ["4567", 100000, 176333, 4, "reconciled", 0],
      ],
    );
  }
  assert.equal(errorOf(readAnyCsv(rows.join("\n"))), "layout-unclear");
});

test("newest first: the lines come back oldest first, and the balances still follow", () => {
  const shapes: Col[][] = [["date", "text", "amount", "balance"], ["date", "text", "out", "in", "balance"], ["date", "text", "amount"]];
  for (const cols of shapes) {
    same(one(readAnyCsv(csv(MONTH, OPENING, { cols, newest: true }))), MONTH, cols.includes("balance") ? OPENING : undefined);
  }
  // every line on one day: the days don't say which way the file runs, the balance does
  const day = MONTH.slice(0, 5).map(([, amount, words]): Line => ["2026-10-02", amount, words]);
  same(one(readAnyCsv(csv(day, OPENING, { cols: ["date", "text", "amount", "balance"], newest: true }))), day, OPENING);
  same(one(readAnyCsv(csv(day, OPENING, { cols: ["date", "text", "amount", "balance"] }))), day, OPENING);
});

test("an amount without a sign, and a word that says which way it went", () => {
  // a column of DEBIT and CREDIT
  const read = readAnyCsv(csv(MONTH, OPENING, { cols: ["date", "text", "way", "amount", "balance"], names: { ...ENGLISH, way: "Type" } }));
  same(one(read), MONTH, OPENING);
  assert.ok(read.ok);
  assert.deepEqual(read.layout.amount, { kind: "marked", column: 3, mark: 2 });
  assert.equal(read.layout.type, undefined);
  // the same without column names, with and without a balance
  same(one(readAnyCsv(csv(MONTH, OPENING, { cols: ["date", "text", "amount", "way", "balance"] }))), MONTH, OPENING);
  same(one(readAnyCsv(csv(MONTH, OPENING, { cols: ["date", "way", "text", "amount"] }))), MONTH);
  // CR and DR written beside the number itself
  const beside = ["Date,Details,Amount", ...MONTH.map(([day, amount, words]) => `${day},${words},${money(Math.abs(amount))} ${amount < 0 ? "DR" : "CR"}`)].join("\n");
  const s = one(readAnyCsv(beside));
  same(s, MONTH);
  assert.deepEqual(s.warnings, ["no-closing-balance"]);
});

test("several accounts in one file, with a column for each currency", () => {
  const text = [
    "Account Type,Account Number,Transaction Date,Cheque Number,Description 1,Description 2,CAD$,USD$",
    `Chequing,${CHEQUING_NUMBER},10/1/2026,,PAYROLL DEPOSIT,ACME WIDGETS,2500.00,`,
    `Chequing,${CHEQUING_NUMBER},10/5/2026,000117,CHEQUE,,-1650.00,`,
    `Savings,${SAVINGS_NUMBER},10/15/2026,,INTEREST,,0.12,`,
    `Chequing,${CHEQUING_NUMBER},10/16/2026,,NORTH SHORE GROCER,VANCOUVER BC,-120.34,`,
    "Chequing,9990005550001,10/20/2026,,WIRE IN,INVOICE 7,,300.00",
    `Visa,${CARD_NUMBER},10/21/2026,,PACIFIC FUEL,,-88.00,`,
  ].join("\n");
  const read = readAnyCsv(text);
  assert.ok(read.ok, errorOf(read));
  assert.deepEqual(
    read.statements.map((s) => s.account),
    [
      { kind: "chequing", currency: "CAD", last4: "4567" },
      { kind: "savings", currency: "CAD", last4: "4321" },
      { kind: "chequing", currency: "USD", last4: "0001" },
      { kind: "credit", currency: "CAD", last4: "9012" },
    ],
  );
  assert.deepEqual(read.statements[0]!.lines, [
    { posted: "2026-10-01", amount: 250000, description: "PAYROLL DEPOSIT", memo: "ACME WIDGETS" },
    { posted: "2026-10-05", amount: -165000, description: "CHEQUE", cheque: "000117" },
    { posted: "2026-10-16", amount: -12034, description: "NORTH SHORE GROCER", memo: "VANCOUVER BC" },
  ]);
  assert.deepEqual(told(read.statements[1]!), [["2026-10-15", 12, "INTEREST"]]);
  assert.deepEqual(told(read.statements[2]!), [["2026-10-20", 30000, "WIRE IN"]]);
  assert.deepEqual(told(read.statements[3]!), [["2026-10-21", -8800, "PACIFIC FUEL"]]);
  assert.deepEqual(read.layout.amount, { kind: "signed", columns: [{ column: 6, currency: "CAD" }, { column: 7, currency: "USD" }], out: "minus" });
  for (const s of read.statements) assert.deepEqual(s.warnings, ["no-closing-balance"]);
  // a column that states the currency line by line
  const stated = readAnyCsv("Date,Description,Amount,Currency\n2026-10-01,PAYROLL,2500.00,CAD\n2026-10-02,WIRE IN,300.00,USD\n2026-10-03,COFFEE,-4.50,CAD\n");
  assert.ok(stated.ok);
  assert.deepEqual(
    stated.statements.map((s) => [s.account.currency, s.lines.length]),
    [
      ["CAD", 2],
      ["USD", 1],
    ],
  );
});

test("lines that are still pending are left out (ACC-5)", () => {
  const text = ["Date,Description,Amount,Status", "2026-10-01,PAYROLL DEPOSIT,2500.00,Posted", "2026-10-02,CAFE MAPLE,-4.50,Posted", "2026-10-03,NORTH SHORE GROCER,-82.17,Pending"].join("\n");
  const s = one(readAnyCsv(text));
  assert.deepEqual(told(s), [
    ["2026-10-01", 250000, "PAYROLL DEPOSIT"],
    ["2026-10-02", -450, "CAFE MAPLE"],
  ]);
  assert.deepEqual(s.warnings, ["pending-left-out", "no-closing-balance"]);
  // nothing posted yet
  assert.equal(errorOf(readAnyCsv("Date,Description,Amount,Status\n2026-10-03,NORTH SHORE GROCER,-82.17,Pending\n")), "no-lines");
});

// ---------------------------------------------------------------------------------------------
// What a file leaves open
// ---------------------------------------------------------------------------------------------

test("the day first or the month first: the file settles it, or the statement says it was assumed", () => {
  const file = (days: readonly string[]): string => ["Date,Description,Amount", ...days.map((day, i) => `"${day}",LINE ${i + 1},-${i + 1}.00`)].join("\n");
  const seen = (text: string, hints?: CsvHints): { days: string[]; warnings: string[]; style: string } => {
    const read = readAnyCsv(text, hints);
    assert.ok(read.ok, errorOf(read));
    return { days: read.statements[0]!.lines.map((l) => l.posted), warnings: read.statements[0]!.warnings, style: read.layout.dateStyle };
  };
  // one line that is a real day only one way round settles it for all of them
  assert.deepEqual(seen(file(["03/04/2026", "05/04/2026", "13/04/2026"])), { days: ["2026-04-03", "2026-04-05", "2026-04-13"], warnings: ["no-closing-balance"], style: "DMY" });
  assert.deepEqual(seen(file(["03/04/2026", "03/05/2026", "03/13/2026"])), { days: ["2026-03-04", "2026-03-05", "2026-03-13"], warnings: ["no-closing-balance"], style: "MDY" });
  // A week in which no day passes 12. Nothing settles it: four lines a month apart, written the other way round, look the same. The reader
  // assumes the day is the number that changes, and the statement says that it assumed.
  const week = ["10/01/2026", "10/02/2026", "10/05/2026", "10/06/2026", "10/07/2026"];
  assert.deepEqual(seen(file(week)), { days: ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"], warnings: ["date-order-guessed", "no-closing-balance"], style: "MDY" });
  assert.deepEqual(seen(file(week.map((day) => `${day.slice(3, 5)}/${day.slice(0, 2)}/${day.slice(6)}`))), { days: ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"], warnings: ["date-order-guessed", "no-closing-balance"], style: "DMY" });
  // neither number changes more than the other: month first is assumed
  const two = file(["02/03/2026", "02/04/2026", "03/02/2026"]);
  assert.deepEqual(seen(two), { days: ["2026-02-03", "2026-02-04", "2026-03-02"], warnings: ["date-order-guessed", "no-closing-balance"], style: "MDY" });
  // a date in the future is a misread
  assert.deepEqual(seen(file(["02/03/2026", "02/04/2026"]), { today: "2026-02-20" }), { days: ["2026-02-03", "2026-02-04"], warnings: ["no-closing-balance"], style: "MDY" });
  assert.deepEqual(seen(file(["03/02/2026", "04/02/2026"]), { today: "2026-02-20" }), { days: ["2026-02-03", "2026-02-04"], warnings: ["no-closing-balance"], style: "DMY" });
  // two-digit years are read where the year comes last
  assert.deepEqual(seen(file(["10/13/26", "10/14/26"])).days, ["2026-10-13", "2026-10-14"]);
  assert.deepEqual(seen(file(["13/10/26", "14/10/26"])).days, ["2026-10-13", "2026-10-14"]);
  // ... and refused where it comes first: read the usual way round these would be the 26th of October of 2001, 2002 and 2005
  assert.equal(errorOf(readAnyCsv(file(["26/10/01", "26/10/02", "26/10/05"]))), "no-parser");
  // the person says which: one field of the layout changes, and the file is read again
  const asked = readAnyCsv(two);
  assert.ok(asked.ok);
  const corrected = one(readCsvAs(two, { ...asked.layout, dateStyle: "DMY" }));
  assert.deepEqual(
    corrected.lines.map((l) => l.posted),
    ["2026-03-02", "2026-04-02", "2026-02-03"],
  );
  assert.deepEqual(corrected.warnings, ["no-closing-balance"]);
  // the year first, a month by its name, a clock after the day: these read one way
  for (const day of ["2026-10-05", "2026/10/05", "2026.10.05", "20261005", "Oct 5, 2026", "October 5 2026", "5 oct. 2026", "05-Oct-26", "5 octobre 2026", "2026年10月5日", "2026-10-05T14:30:00Z", "2026-10-05 14:30:00.000", "Oct 5, 2026 2:30 PM"]) {
    assert.deepEqual(seen(file([day])), { days: ["2026-10-05"], warnings: ["no-closing-balance"], style: "YMD" }, day);
  }
});

test("which way the money went, when the file doesn't say", () => {
  // amounts with no sign anywhere and nothing beside them
  const bare = ["2026-10-01,PAYROLL DEPOSIT,2500.00", "2026-10-02,CAFE MAPLE,4.50", "2026-10-03,NORTH SHORE GROCER,82.17"].join("\n");
  const read = readAnyCsv(bare);
  assert.deepEqual(one(read).warnings, ["sign-guessed", "no-closing-balance"]);
  assert.ok(read.ok);
  // the person says they are money out: one field of the layout changes
  const fixed = one(readCsvAs(bare, { ...read.layout, amount: { kind: "signed", columns: [{ column: 2 }], out: "plus" } }));
  assert.deepEqual(
    fixed.lines.map((l) => l.amount),
    [-250000, -450, -8217],
  );
  assert.deepEqual(fixed.warnings, ["no-closing-balance"]);
  // two columns and no balance: by custom the first is money out
  const usual = one(readAnyCsv(csv(MONTH, OPENING, { cols: ["date", "text", "out", "in"] })));
  same(usual, MONTH);
  assert.deepEqual(usual.warnings, ["no-closing-balance"]);
  // the other way round, the first column holds fewer lines than the second: the reader still assumes, and says so
  const turned = csv(MONTH, OPENING, { cols: ["date", "text", "in", "out"] });
  const assumed = readAnyCsv(turned);
  assert.deepEqual(one(assumed).warnings, ["sign-guessed", "no-closing-balance"]);
  assert.ok(assumed.ok);
  assert.deepEqual(assumed.layout.amount, { kind: "split", out: 2, in: 3 });
  same(one(readCsvAs(turned, { ...assumed.layout, amount: { kind: "split", out: 3, in: 2 } })), MONTH);
});

// ---------------------------------------------------------------------------------------------
// What is never kept, and what is never read
// ---------------------------------------------------------------------------------------------

test("numbers are cut to four digits, and the holder's name is not read (IMP-6)", () => {
  const text = [
    "Account Number,Name on Card,Date,Description,Amount,Balance",
    `${CHEQUING_NUMBER},A. SAMPLE,2026-10-01,E-TRANSFER FROM ${SAVINGS_NUMBER},500.00,1500.00`,
    `${CHEQUING_NUMBER},A. SAMPLE,2026-10-02,PAYMENT TO CARD 4500 1234 5678 9012,-200.00,1300.00`,
    `${CHEQUING_NUMBER},A. SAMPLE,2026-10-03,CAFE MAPLE #12,-4.50,1295.50`,
  ].join("\n");
  // with its row of names, and without: there the number and the name are the same on every line, and neither is a line's wording
  for (const file of [text, text.split("\n").slice(1).join("\n")]) {
    const read = readAnyCsv(file);
    const s = one(read);
    assert.equal(s.account.last4, "4567");
    assert.deepEqual(
      s.lines.map((l) => [l.description, l.memo]),
      [
        ["E-TRANSFER FROM ****4321", undefined],
        ["PAYMENT TO CARD ****9012", undefined],
        ["CAFE MAPLE #12", undefined],
      ],
    );
    assert.equal(s.opening, 100000);
    assert.equal(s.closing, 129550);
    const kept = JSON.stringify(read);
    for (const secret of [CHEQUING_NUMBER, SAVINGS_NUMBER, CARD_NUMBER, "4500 1234 5678 9012", "SAMPLE"]) assert.ok(!kept.includes(secret), secret);
    // what the screen shows while a person says which column is which has its numbers cut too
    const shown = csvPreview(file);
    assert.ok(shown);
    assert.equal(shown.width, 6);
    assert.equal(shown.rows.length, 3);
    assert.equal(shown.rows[0]![0], "****4567");
    for (const secret of [CHEQUING_NUMBER, SAVINGS_NUMBER, "4500 1234 5678 9012"]) assert.ok(!JSON.stringify(shown).includes(secret), secret);
  }
  assert.deepEqual(csvPreview(text)?.names, ["Account Number", "Name on Card", "Date", "Description", "Amount", "Balance"]);
  assert.equal(csvPreview("no table in here"), null);
});

test("a cell is only ever data (IMP-5)", () => {
  const text = [
    "Date,Description,Amount",
    `2026-10-01,"=HYPERLINK(""http://example.test"",""x"")",-1.00`,
    `2026-10-02,A${String.fromCodePoint(0)}B${String.fromCodePoint(0x202e)}C,-2.00`,
    `2026-10-03,${"N".repeat(1500)},-3.00`,
    "2026-10-04,<script>alert(1)</script>,-4.00",
  ].join("\n");
  const s = one(readAnyCsv(text));
  assert.deepEqual(
    s.lines.map((l) => l.description),
    ['=HYPERLINK("http://example.test","x")', "A B C", "N".repeat(200), "<script>alert(1)</script>"],
  );
  assert.deepEqual(
    s.lines.map((l) => l.amount),
    [-100, -200, -300, -400],
  );
});

test("files that are not statements, or not readable ones, save nothing", () => {
  const error = (text: string, hints?: CsvHints): string => errorOf(readAnyCsv(text, hints));
  assert.equal(error("Dear customer,\nyour statement is ready.\n"), "no-parser");
  // a table without days, and a table with days and no numbers
  assert.equal(error("Name,Email,Phone\nA. Sample,a@example.test,555-0100\nB. Sample,b@example.test,555-0101\n"), "no-parser");
  assert.equal(error("Date,Event,Where\n2026-10-01,Dentist,Main St\n2026-10-08,Recital,School\n"), "no-parser");
  // column names and nothing under them: a month in which nothing happened, when the names are a statement's
  assert.equal(error("Date,Description,Withdrawals,Deposits,Balance\n"), "no-lines");
  assert.equal(error("Name,Email,Phone\n"), "no-parser");
  // broken off inside a quoted field
  assert.equal(error('Date,Description,Amount\n2026-10-01,"COFFEE,-4.50\n'), "malformed");
  // an amount past what a number holds is not an amount
  assert.notEqual(error("Date,Description,Amount\n2026-10-01,COFFEE,-4.50\n2026-10-02,WINDFALL,999999999999999.00\n"), "ok");
  // more lines than one import takes
  const lines = (n: number): string => ["Date,Description,Amount", ...Array.from({ length: n }, (_, i) => `2026-10-01,LINE ${i},-1.00`)].join("\n");
  assert.equal(error(lines(MAX_LINES + 1)), "too-long");
  assert.equal(error(lines(MAX_LINES + 300)), "too-long");

  // two columns of money and nothing to choose between them by: the reader doesn't pick one
  const two = "2026-10-01,COFFEE,-4.50,-3.25\n2026-10-02,GROCER,-82.17,-60.00\n2026-10-03,FUEL,-40.00,-29.11\n";
  assert.equal(error(two), "layout-unclear");
  // ... a person does: the screen shows the table, and the file is read with the layout they give
  assert.deepEqual(csvPreview(two)?.rows[0], ["2026-10-01", "COFFEE", "-4.50", "-3.25"]);
  const picked: CsvLayout = { delimiter: ",", width: 4, header: false, date: 0, dateStyle: "YMD", description: [1], amount: { kind: "signed", columns: [{ column: 2 }], out: "minus" }, decimal: "." };
  assert.deepEqual(
    one(readCsvAs(two, picked)).lines.map((l) => l.amount),
    [-450, -8217, -4000],
  );
  // a layout that points at a column with no money in it reads nothing, and says it doesn't fit
  assert.equal(errorOf(readCsvAs(two, { ...picked, amount: { kind: "signed", columns: [{ column: 1 }], out: "minus" } })), "layout-unclear");

  // a row inside the table that isn't a line is left out, and the statement says so
  const whole = csv(MONTH, OPENING, { cols: ["date", "text", "amount", "balance"], names: ENGLISH });
  for (const note of ["Carried forward,,,", "Page 2"]) {
    const s = one(readAnyCsv(whole.replace("2026-10-05", `${note}\r\n2026-10-05`)));
    same(s, MONTH, OPENING);
    assert.equal(s.unread, 1);
    assert.deepEqual(s.warnings, ["lines-left-out"]);
  }
  // a line the reader can't read breaks the sums, and the import shows it: nothing is smoothed over
  const broken = one(readAnyCsv(whole.replace("-1650.00", "see note")));
  assert.equal(broken.unread, 1);
  assert.equal(broken.lines.length, MONTH.length - 1);
  // (the balances on the lines still give the two ends, so the two ends agree; the gap shows as a break in the balances)
  assert.equal(broken.opening, OPENING);
  assert.equal(broken.closing, 370072);
  assert.equal(reconcile(broken.lines, broken.opening, broken.closing).status, "mismatch");
  // a layout that leaves many rows unread doesn't fit the file
  const monthFirst = csv(MONTH, OPENING, { cols: ["date", "text", "amount", "balance"], day: "mdy" });
  const fits = readAnyCsv(monthFirst);
  assert.ok(fits.ok);
  assert.equal(errorOf(readCsvAs(monthFirst, { ...fits.layout, dateStyle: "DMY" })), "layout-unclear");
});

// ---------------------------------------------------------------------------------------------
// The layout: kept with the account, checked before it is used
// ---------------------------------------------------------------------------------------------

test("a layout is kept with the account, and a file in another layout is worked out afresh", () => {
  const shape: Shape = { cols: ["date", "text", "out", "in", "balance"], names: ENGLISH };
  const first = readAnyCsv(csv(MONTH, OPENING, shape));
  assert.ok(first.ok);
  const kept: unknown = JSON.parse(JSON.stringify(first.layout));
  assert.ok(isCsvLayout(kept));
  // next month's file from the same bank
  const NEXT = MONTH.slice(0, 13).map(([day, amount, words]): Line => [`2026-11${day.slice(7)}`, amount, words]);
  const next = OPENING + sum(MONTH);
  same(one(readCsvAs(csv(NEXT, next, shape), kept)), NEXT, next);
  // the bank renames a column, or adds one: the kept layout doesn't fit, and says so
  const renamed = csv(NEXT, next, { ...shape, names: { ...ENGLISH, out: "Debits", in: "Credits" } });
  const wider = csv(NEXT, next, { cols: ["date", "text", "blank", "out", "in", "balance"], names: { ...ENGLISH, blank: "Category" } });
  const bare = csv(NEXT, next, { cols: shape.cols });
  for (const text of [renamed, wider, bare]) {
    assert.deepEqual(readCsvAs(text, kept), { ok: false, error: "layout-unclear" });
    // through the front door, a kept layout that no longer fits is not forced on the file
    const read = readStatementFile(bytesOf(text), { layout: kept });
    assert.ok(read.ok);
    same(read.statements[0]!, NEXT, next);
    assert.notDeepEqual(read.layout, kept);
  }
  // one that fits is used as it is: here it says the day comes first, which this file alone would not show
  const dayFirst = readAnyCsv("Date,Description,Amount\n13/02/2026,LINE,-1.00\n");
  assert.ok(dayFirst.ok);
  assert.equal(dayFirst.layout.dateStyle, "DMY");
  const later = readStatementFile(bytesOf("Date,Description,Amount\n02/03/2026,LINE,-1.00\n03/03/2026,LINE,-2.00\n"), { layout: dayFirst.layout });
  assert.ok(later.ok);
  assert.deepEqual(
    later.statements[0]!.lines.map((l) => l.posted),
    ["2026-03-02", "2026-03-03"],
  );
  assert.deepEqual(later.statements[0]!.warnings, ["no-closing-balance"]);

  // what isn't a layout is not read with
  const text = csv(MONTH, OPENING, shape);
  const bad: unknown[] = [
    null,
    5,
    "layout",
    {},
    { ...kept, width: 1 },
    { ...kept, width: 5.5 },
    { ...kept, date: 9 },
    { ...kept, date: -1 },
    { ...kept, delimiter: "x" },
    { ...kept, dateStyle: "DYM" },
    { ...kept, decimal: ";" },
    { ...kept, header: "yes" },
    { ...kept, names: ["Date"] },
    { ...kept, description: [7] },
    { ...kept, description: "1" },
    { ...kept, balance: 5 },
    { ...kept, amount: null },
    { ...kept, amount: { kind: "split", out: 2, in: 2 } },
    { ...kept, amount: { kind: "split", out: 0, in: 3 } },
    { ...kept, amount: { kind: "split", out: 2, in: 4 } },
    { ...kept, amount: { kind: "signed", columns: [], out: "minus" } },
    { ...kept, amount: { kind: "signed", columns: [{ column: 2 }], out: "both" } },
    { ...kept, amount: { kind: "signed", columns: [{ column: 2, currency: "dollars" }], out: "minus" } },
    { ...kept, amount: { kind: "marked", column: 2, mark: 2 } },
    { ...kept, amount: { kind: "other" } },
  ];
  for (const layout of bad) {
    assert.equal(isCsvLayout(layout), false, JSON.stringify(layout));
    assert.deepEqual(readCsvAs(text, layout as CsvLayout), { ok: false, error: "layout-unclear" });
  }
});

test("through the front door: bytes in, statements and the layout out", () => {
  const text = csv(MONTH, OPENING, { cols: ["date", "text", "amount", "balance"], names: ENGLISH });
  // with the mark some programs put at the start of a file, and the account it is for
  const read = readStatementFile(Uint8Array.of(0xef, 0xbb, 0xbf, ...bytesOf(text)), { kind: "savings", currency: "USD" });
  assert.ok(read.ok);
  same(read.statements[0]!, MONTH, OPENING);
  assert.deepEqual(read.statements[0]!.account, { kind: "savings", currency: "USD" });
  assert.ok(isCsvLayout(read.layout));
  assert.deepEqual(readStatementFile(bytesOf("2026-10-01,COFFEE,-4.50,-3.25\n2026-10-02,GROCER,-82.17,-60.00\n")), { ok: false, error: "layout-unclear" });
});

// ---------------------------------------------------------------------------------------------
// The same two months, written many ways
// ---------------------------------------------------------------------------------------------

/** A small generator with a fixed seed, so that a failure can be run again. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const NAMED: Record<"en" | "fr" | "zh", (cols: readonly Col[]) => Partial<Record<Col, string>>> = {
  en: (cols) => ({ ...ENGLISH, date: cols.includes("bought") ? "Posted Date" : "Date", bought: "Transaction Date", way: "Type", number: "Account Number", holder: "Account Holder", blank: "Notes" }),
  fr: (cols) => ({ date: cols.includes("bought") ? "Date d'inscription" : "Date", bought: "Date de transaction", text: "Libellé", amount: "Montant", out: "Retraits", in: "Dépôts", balance: "Solde", way: "Débit/Crédit", number: "Numéro de compte", holder: "Titulaire", blank: "Notes" }),
  zh: (cols) => ({ date: cols.includes("bought") ? "记账日期" : "交易日期", bought: "交易日期", text: "摘要", amount: "金额", out: "支出", in: "收入", balance: "余额", way: "借贷", number: "账号", holder: "户名", blank: "备注" }),
};

test("the same month, written six hundred ways, comes back the same", () => {
  const random = seeded(20261119);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const seen = { split: 0, signed: 0, marked: 0, turned: 0 };
  for (let n = 0; n < 600; n++) {
    const card = random() < 0.4;
    const lines = card ? CARD : MONTH;
    const opening = card ? CARD_OPENING : OPENING;
    const how = pick(["signed", "split", "marked"] as const);
    const balance = random() < 0.6;
    const language = pick(["none", "en", "fr", "zh"] as const);
    const cols: Col[] = ["date", "text", ...(how === "signed" ? (["amount"] as const) : how === "split" ? (["out", "in"] as const) : (["amount", "way"] as const)), ...(balance ? (["balance"] as const) : [])];
    if (card && random() < 0.5) cols.push("bought");
    if (random() < 0.4) cols.push("number");
    if (random() < 0.3) cols.push("holder");
    if (random() < 0.2) cols.push("blank");
    for (let i = cols.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cols[i], cols[j]] = [cols[j]!, cols[i]!];
    }
    const shape: Shape = {
      cols,
      ...(language === "none" ? {} : { names: NAMED[language](cols) }),
      delimiter: pick([",", ";", "\t", "|"] as const),
      day: pick(["iso", "mdy", "dmy", "compact", "named", "han", "clock"] as const),
      decimal: pick([".", ","] as const),
      thousands: random() < 0.5,
      newest: random() < 0.4,
      // a card's file is written either way round
      owing: card && random() < 0.6,
      number: card ? CARD_NUMBER : CHEQUING_NUMBER,
      ...(random() < 0.3 ? { above: ["Account activity", "Exported 2026-11-01 08:00"] } : {}),
      ...(random() < 0.2 ? { below: ["End of list"] } : {}),
      trailing: random() < 0.15,
    };
    const text = csv(lines, opening, shape);
    const hints: CsvHints = { ...(card ? { kind: "credit" as const } : random() < 0.5 ? { kind: "chequing" as const } : {}), today: "2026-11-19" };
    const label = `#${n} ${JSON.stringify(shape)}`;
    const read = readAnyCsv(text, hints);
    const s = one(read, label);
    assert.ok(read.ok);
    seen[how]++;

    // Without names and without a balance, two columns of money are told apart by custom alone: money out first. Written the other way round, the reader says that it assumed.
    const turned = language === "none" && how === "split" && !balance && cols.indexOf("in") < cols.indexOf("out");
    if (turned) {
      seen.turned++;
      assert.deepEqual(s.warnings, ["sign-guessed", "no-closing-balance"], label);
      assert.deepEqual(
        told(s),
        lines.map(([day, amount, words]) => [day, -amount, words]),
        label,
      );
      assert.equal(read.layout.amount.kind, "split", label);
      continue;
    }
    same(s, lines, balance ? opening : undefined, label);
    // With a balance the two columns are told apart by it, for a bank account. Not told the kind, the reader says it took the file for one when money in comes first.
    const assumed = language === "none" && how === "split" && balance && !hints.kind && cols.indexOf("in") < cols.indexOf("out");
    assert.deepEqual(s.warnings, [...(assumed ? ["sign-guessed"] : []), ...(balance ? [] : ["no-closing-balance"])], label);
    assert.equal(s.unread, 0, label);
    assert.deepEqual(s.account, { ...(hints.kind ? { kind: hints.kind } : {}), currency: "CAD", ...(cols.includes("number") ? { last4: card ? "9012" : "4567" } : {}) }, label);
    assert.deepEqual(
      s.lines.map((l) => l.date ?? l.posted),
      lines.map(([day, amount]) => (cols.includes("bought") && amount < 0 ? addDays(day, -1) : day)),
      label,
    );
    assert.ok(s.lines.every((l) => l.memo === undefined), label);
    // neither the number nor the holder's name is in what comes back
    const kept = JSON.stringify(read);
    assert.ok(!kept.includes(CARD_NUMBER) && !kept.includes(CHEQUING_NUMBER) && !kept.includes("SAMPLE"), label);
    // the layout that was worked out reads the file the same way again, from storage, with nothing left to assume
    const again = one(readCsvAs(text, JSON.parse(kept).layout as CsvLayout, hints), label);
    assert.deepEqual(again, { ...s, warnings: s.warnings.filter((w) => w !== "sign-guessed") }, label);
  }
  // (every way of writing the money was met)
  assert.ok(seen.split > 100 && seen.signed > 100 && seen.marked > 100 && seen.turned > 5, JSON.stringify(seen));
});

test("the file's own word for the kind of account comes before the caller's", () => {
  const text = ["Account Type,Date,Description,Amount", "Savings,2026-10-01,INTEREST,0.12", "Savings,2026-10-15,TRANSFER IN,300.00"].join("\n");
  // the person chose a chequing account and the file says savings: the statement says what the file says, and the screen can ask
  assert.equal(one(readAnyCsv(text, { kind: "chequing" })).account.kind, "savings");
  // a file that doesn't say takes the caller's word
  assert.equal(one(readAnyCsv("Date,Description,Amount\n2026-10-01,INTEREST,0.12\n", { kind: "savings" })).account.kind, "savings");
});

test("a column of numbers that isn't the amount doesn't pass for it", () => {
  // Fees charged on three deposits, beside money out, money in and the balance. Fees and money out are never on one line, and the two
  // of them follow nine steps of the balance in ten; money out and money in follow every step, and that is the reading taken.
  let balance = OPENING;
  const rows = MONTH.map(([day, amount, words]) => {
    balance += amount;
    return [day, words, amount > 0 ? "1.50" : "", amount < 0 ? money(-amount) : "", amount > 0 ? money(amount) : "", money(balance)].join(",");
  });
  const read = readAnyCsv(rows.join("\n"), { kind: "chequing" });
  same(one(read), MONTH, OPENING);
  assert.ok(read.ok);
  assert.deepEqual(read.layout.amount, { kind: "split", out: 3, in: 4 });
  assert.equal(read.layout.balance, 5);
  // a column of 0.00 is not where the money is
  same(one(readAnyCsv(MONTH.map(([day, amount, words]) => `${day},${words},0.00,${money(amount)}`).join("\n"))), MONTH);
  // the amount in another currency beside the amount, and no balance: nothing says which is which
  assert.equal(errorOf(readAnyCsv(MONTH.map(([day, amount, words]) => `${day},${words},${money(Math.round(amount * 0.73))},${money(amount)}`).join("\n"))), "layout-unclear");
  // with their names, the one called the amount is the amount
  same(one(readAnyCsv(["Date,Description,Original Amount,Amount", ...MONTH.map(([day, amount, words]) => `${day},${words},${money(Math.round(amount * 0.73))},${money(amount)}`)].join("\n"))), MONTH);
});
