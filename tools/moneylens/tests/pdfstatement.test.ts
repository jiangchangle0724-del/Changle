/**
 * The reader of statements in PDF (src/core/pdfstatement.ts). Every statement in here is made up
 * in this file (SEC-12, IMP-9). The first one is laid out like the first real statement the reader
 * met, a credit card's, as its invented copy showed it: the labels and where things stand are the
 * layout's, and every name, number and line is made up here, so that the sums add up.
 */
import assert from "node:assert/strict";
import test from "node:test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ParsedStatement, ReadResult } from "../src/core/model";
import { readPdfStatement } from "../src/core/pdfstatement";
import type { PdfPage, PdfRun } from "../src/core/pdftext";
import { reconcile } from "../src/core/reconcile";
import { pdfPages, type PdfLib } from "../src/web/pdf";
import { makePdf } from "./pdfmake";
import { CARD_SUMMARY, CARD_TABLE, tenth, width } from "./pdfsamples";
import { seeded } from "./seeded";

const lib = pdfjs as unknown as PdfLib;

/** The same two for a page built by hand, with no PDF in between. */
const run = (text: string, x: number, y: number, size = 9): PdfRun => ({ text, x, y, w: tenth(width(text, size)), h: size });
const endingRun = (text: string, edge: number, y: number, size = 9): PdfRun => ({ text, x: tenth(edge - width(text, size)), y, w: tenth(width(text, size)), h: size });
/** A text set word by word, each word a run of its own, a space apart. */
const spaced = (text: string, x: number, y: number, size = 9): PdfRun[] =>
  text.split(" ").map((word) => {
    const made = run(word, tenth(x), y, size);
    x += width(word, size) + 0.278 * size;
    return made;
  });
const page = (...runs: PdfRun[]): PdfPage => ({ width: 612, height: 792, runs });

const one = (read: ReadResult): ParsedStatement => {
  assert.ok(read.ok, read.ok ? "" : read.error);
  assert.equal(read.statements.length, 1);
  return read.statements[0]!;
};
const refused = (read: ReadResult): string => (read.ok ? "read" : read.error);
const amounts = (statement: ParsedStatement): number[] => statement.lines.map((line) => line.amount);

// ---------------------------------------------------------------------------------------------
// A credit card's statement
// ---------------------------------------------------------------------------------------------

test("a card's statement, through PDF.js: its lines, its balances, and the sums agree", async () => {
  const pages = await pdfPages(lib, makePdf([{ runs: CARD_SUMMARY }, { runs: CARD_TABLE }]));
  assert.ok(pages.ok);
  const statement = one(readPdfStatement(pages.pages));
  assert.deepEqual(statement.lines, [
    { posted: "2026-09-16", date: "2026-09-15", amount: -450, description: "CAFE MAPLE #12 VANCOUVER BC" },
    { posted: "2026-09-22", date: "2026-09-20", amount: -8217, description: "NORTH SHORE GROCER BURNABY BC" },
    // "CR" on a card is money in
    { posted: "2026-09-29", date: "2026-09-28", amount: 25000, description: "PAYMENT RECEIVED - THANK YOU" },
    // the line under a line is more of its wording
    { posted: "2026-10-02", date: "2026-09-30", amount: -1495, description: "ACME WIDGETS OF NOVA SCOTIA DARTMOUTH", memo: "NS" },
    // a card number in a description is cut to its last four digits (IMP-6)
    { posted: "2026-10-05", date: "2026-10-03", amount: -1075, description: "ONLINE STORE ****9012" },
  ]);
  // The statement says it is a Mastercard's; what is owed is a balance below zero. The lines for the subtotal and the
  // total, the card's own heading and the small print are not transactions.
  assert.deepEqual({ ...statement, lines: [] }, {
    parser: "pdf",
    account: { kind: "credit", currency: "CAD", last4: "4821" },
    from: "2026-09-15",
    to: "2026-10-14",
    closingAsOf: "2026-10-14",
    opening: -25000,
    closing: -11237,
    lines: [],
    unread: 0,
    warnings: [],
  });
  assert.deepEqual(reconcile(statement.lines, statement.opening, statement.closing), { status: "reconciled", opening: -25000, closing: -11237, sum: 13763 });
  // told that it is a card's, it reads the same; told that it is a bank account's, the same numbers read the other way and no longer add up
  assert.deepEqual(one(readPdfStatement(pages.pages, { kind: "credit" })), statement);
  const asBank = one(readPdfStatement(pages.pages, { kind: "chequing" }));
  assert.deepEqual(amounts(asBank), [450, 8217, 25000, 1495, 1075]);
  assert.equal(reconcile(asBank.lines, asBank.opening, asBank.closing).status, "mismatch");
});

test("a card's balance that says CR is in the cardholder's favour", () => {
  const summary = page(run("ABC Sample Visa", 52.7, 34), run("Previous balance", 80, 106), endingRun("$73.45 CR", 354, 106), run("Statement date", 376, 104), run("Nov. 14, 2026", 544, 104), run("New balance", 80, 187), endingRun("$19.15", 339, 187));
  const table = page(run("DATE", 54, 118, 6), run("DESCRIPTION", 142, 118, 6), endingRun("AMOUNT ($)", 400, 118, 6), run("Oct. 17", 54, 146), run("CAFE MAPLE", 142, 146), endingRun("92.60", 400, 146));
  const statement = one(readPdfStatement([summary, table]));
  assert.deepEqual([statement.opening, statement.closing, amounts(statement)], [7345, -1915, [-9260]]);
  assert.equal(reconcile(statement.lines, statement.opening, statement.closing).status, "reconciled");
  // one date column: it is the day the line was posted
  assert.deepEqual(statement.lines[0], { posted: "2026-10-17", amount: -9260, description: "CAFE MAPLE" });
});

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

const head = (y: number): PdfRun[] => [run("Date", 54, y), run("Description", 142, y), endingRun("Amount", 400, y)];
const line = (date: string, words: string, amount: string, y: number): PdfRun[] => [run(date, 54, y), run(words, 142, y), endingRun(amount, 400, y)];

test("a date without a year takes the statement's: the latest year that is not past its end", () => {
  const read = (dated: string, ...dates: string[]): string[] => {
    const statement = one(readPdfStatement([page(run("Sample Visa", 54, 30), run("Statement date", 54, 60), run(dated, 200, 60), ...head(100), ...dates.flatMap((date, i) => line(date, "CAFE MAPLE", "4.50", 120 + i * 13)))]));
    return statement.lines.map((l) => l.posted);
  };
  // December's lines on January's statement are last year's
  assert.deepEqual(read("Jan. 5, 2027", "Dec. 8", "Dec. 31", "Jan. 2"), ["2026-12-08", "2026-12-31", "2027-01-02"]);
  // a line posted a few days after the statement's date is still this year's; one far past it is last year's
  assert.deepEqual(read("Oct. 14, 2026", "Oct. 14", "Oct. 20", "Oct. 30"), ["2025-10-30", "2026-10-14", "2026-10-20"]);
  // the day before the month, and French months
  assert.deepEqual(read("14 oct. 2026", "17 sept.", "2 oct"), ["2026-09-17", "2026-10-02"]);
  assert.deepEqual(read("2026-10-14", "Sep 17", "Oct2"), ["2026-09-17", "2026-10-02"]);
  // the 29th of February, in a year that has one and next to one that has none
  assert.deepEqual(read("Mar. 5, 2028", "Feb. 29"), ["2028-02-29"]);
  // a date with its year needs nothing from the statement
  const own = one(readPdfStatement([page(run("Sample Visa", 54, 30), ...head(100), ...line("Oct. 17, 2026", "CAFE MAPLE", "4.50", 120), ...line("2026-10-19", "CAFE MAPLE", "4.50", 133), ...line("20 Oct 2026", "CAFE MAPLE", "4.50", 146))]));
  assert.deepEqual(own.lines.map((l) => l.posted), ["2026-10-17", "2026-10-19", "2026-10-20"]);
  // without a year anywhere, the statement is not guessed at
  assert.equal(refused(readPdfStatement([page(run("Sample Visa", 54, 30), ...head(100), ...line("Oct. 17", "CAFE MAPLE", "4.50", 120))])), "layout-unclear");
  // and a day that is no day is a line that was not read
  const odd = one(readPdfStatement([page(run("Sample Visa", 54, 30), run("Statement date", 54, 60), run("Mar. 5, 2027", 200, 60), ...head(100), ...line("Feb. 29", "CAFE MAPLE", "4.50", 120), ...line("Feb. 28", "CAFE MAPLE", "4.50", 133))]));
  assert.deepEqual([odd.lines.length, odd.unread, odd.warnings], [1, 1, ["no-closing-balance", "lines-left-out"]]);
});

test("dates in numbers only: the order of month and day is read off the lines, or said to be assumed", () => {
  const read = (...dates: string[]): ParsedStatement => one(readPdfStatement([page(run("Sample Visa", 54, 30), run("Statement date", 54, 60), run("Nov. 14, 2026", 200, 60), ...head(100), ...dates.flatMap((date, i) => line(date, "CAFE MAPLE", "4.50", 120 + i * 13)))]));
  // a 17 can only be a day
  assert.deepEqual(read("10/17", "11/02").lines.map((l) => l.posted), ["2026-10-17", "2026-11-02"]);
  assert.deepEqual(read("17/10", "02/11").lines.map((l) => l.posted), ["2026-10-17", "2026-11-02"]);
  assert.deepEqual(read("17/10/2026", "02/11/2026").lines.map((l) => l.posted), ["2026-10-17", "2026-11-02"]);
  assert.deepEqual(read("10/17", "11/02").warnings, ["no-closing-balance"]);
  // nothing settles it: month first, and the person is asked
  const open = read("03/04", "05/06");
  assert.deepEqual(open.lines.map((l) => l.posted), ["2026-03-04", "2026-05-06"]);
  assert.ok(open.warnings.includes("date-order-guessed"));
});

// ---------------------------------------------------------------------------------------------
// A bank account's statement
// ---------------------------------------------------------------------------------------------

test("the row of names says which column is money out, money in and the balance", () => {
  const names = [run("Date", 54, 100), run("Description", 110, 100), endingRun("Withdrawals ($)", 380, 100), endingRun("Deposits ($)", 470, 100), endingRun("Balance ($)", 560, 100)];
  const statement = one(
    readPdfStatement([
      page(
        run("Sample Bank", 54, 30),
        run("Chequing account statement", 54, 44),
        run("Account number: 00123-4567890", 54, 58),
        run("For the period Oct. 1, 2026 to Oct. 31, 2026", 54, 72),
        ...names,
        run("Oct. 1", 54, 120),
        run("Opening balance", 110, 120),
        endingRun("1,000.00", 560, 120),
        run("Oct. 2", 54, 133),
        run("CAFE MAPLE #12", 110, 133),
        endingRun("4.50", 380, 133),
        endingRun("995.50", 560, 133),
        run("Oct. 15", 54, 146),
        run("PAYROLL DEPOSIT ACME WIDGETS", 110, 146),
        endingRun("2,500.00", 470, 146),
        endingRun("3,495.50", 560, 146),
        run("Oct. 20", 54, 159),
        run("RENT", 110, 159),
        endingRun("3,600.00", 380, 159),
        endingRun("104.50 OD", 560 + 14, 159),
        run("Oct. 31", 54, 172),
        run("Closing balance", 110, 172),
        endingRun("104.50 OD", 560 + 14, 172),
      ),
      // what the small print on a later page names does not make the statement a card's
      page(run("Ask us about the Sample Bank Mastercard credit card.", 54, 100)),
    ]),
  );
  assert.deepEqual(statement.lines, [
    { posted: "2026-10-02", amount: -450, description: "CAFE MAPLE #12", balance: 99550 },
    { posted: "2026-10-15", amount: 250000, description: "PAYROLL DEPOSIT ACME WIDGETS", balance: 349550 },
    { posted: "2026-10-20", amount: -360000, description: "RENT", balance: -10450 },
  ]);
  // the two balances are lines of the table here, and are read as what they are
  assert.deepEqual([statement.opening, statement.closing, statement.from, statement.to, statement.unread, statement.warnings], [100000, -10450, "2026-10-01", "2026-10-31", 0, []]);
  assert.deepEqual(statement.account, { currency: "CAD", last4: "7890" });
  assert.equal(reconcile(statement.lines, statement.opening, statement.closing).status, "reconciled");
});

test("one column for both ways: a minus, brackets, CR and DR say which way; with none of them it is said to be assumed", () => {
  const read = (kind: "chequing" | "credit" | undefined, ...money: string[]): ParsedStatement =>
    one(readPdfStatement([page(run("Sample statement", 54, 30), run("Statement date", 54, 60), run("Nov. 14, 2026", 200, 60), ...head(100), ...money.flatMap((amount, i) => line("Oct. 17", "CAFE MAPLE", amount, 120 + i * 13)))], kind ? { kind } : {}));
  assert.deepEqual(amounts(read("chequing", "-4.50", "2,500.00", "(14.95)", "82.17-", "12.00 DR", "5.00 CR", "$1.25", "-$3.00")), [-450, 250000, -1495, -8217, -1200, 500, 125, -300]);
  assert.deepEqual(amounts(read("credit", "-4.50", "2,500.00", "(14.95)", "82.17-", "12.00 DR", "5.00 CR", "$1.25", "-$3.00")), [450, -250000, 1495, 8217, -1200, 500, -125, 300]);
  // not told the kind, and nothing on the first page says a card: read as a bank account's
  assert.deepEqual(amounts(read(undefined, "-4.50", "2,500.00")), [-450, 250000]);
  assert.deepEqual(read("chequing", "-4.50", "2,500.00").warnings, ["no-closing-balance"]);
  // every amount a plain number: on a bank account nothing says which way they went
  assert.deepEqual(read("chequing", "4.50", "2,500.00").warnings, ["sign-guessed", "no-closing-balance"]);
  assert.deepEqual(read("credit", "4.50", "2,500.00").warnings, ["no-closing-balance"]);
});

test("a statement in French: its labels, its months, and a comma for the cents", () => {
  const statement = one(
    readPdfStatement([
      page(
        run("Banque Exemple", 54, 30),
        run("Numéro de compte : 00123-4567890", 54, 58),
        run("Période du relevé : 1 oct. 2026 - 31 oct. 2026", 54, 72),
        run("Solde précédent", 54, 86),
        endingRun("1 000,00 $", 300, 86),
        run("Nouveau solde", 54, 99),
        endingRun("3 413,33 $", 300, 99),
        run("Date", 54, 120),
        run("Description", 110, 120),
        endingRun("Retraits", 380, 120),
        endingRun("Dépôts", 470, 120),
        endingRun("Solde", 560, 120),
        run("2 oct.", 54, 140),
        run("CAFÉ ÉRABLE", 110, 140),
        endingRun("4,50", 380, 140),
        endingRun("995,50", 560, 140),
        run("15 oct.", 54, 153),
        run("DÉPÔT DE PAIE", 110, 153),
        endingRun("2 500,00", 470, 153),
        endingRun("3 495,50", 560, 153),
        run("20 oct.", 54, 166),
        run("ÉPICERIE", 110, 166),
        endingRun("82,17", 380, 166),
        endingRun("3 413,33", 560, 166),
      ),
    ]),
  );
  assert.deepEqual(statement.lines.map((l) => [l.posted, l.amount, l.description, l.balance]), [
    ["2026-10-02", -450, "CAFÉ ÉRABLE", 99550],
    ["2026-10-15", 250000, "DÉPÔT DE PAIE", 349550],
    ["2026-10-20", -8217, "ÉPICERIE", 341333],
  ]);
  assert.deepEqual([statement.opening, statement.closing, statement.from, statement.to, statement.account.last4], [100000, 341333, "2026-10-01", "2026-10-31", "7890"]);
  assert.equal(reconcile(statement.lines, statement.opening, statement.closing).status, "reconciled");
});

test("newest first, with a balance after every line: turned round, and the balances say where it opened and closed", () => {
  const names = [run("Date", 54, 100), run("Description", 110, 100), endingRun("Withdrawals ($)", 380, 100), endingRun("Deposits ($)", 470, 100), endingRun("Balance ($)", 560, 100)];
  const rows = [
    [run("Oct. 20, 2026", 54, 120), run("NORTH SHORE GROCER", 130, 120), endingRun("82.17", 380, 120), endingRun("3,413.33", 560, 120)],
    [run("Oct. 15, 2026", 54, 133), run("PAYROLL DEPOSIT", 130, 133), endingRun("2,500.00", 470, 133), endingRun("3,495.50", 560, 133)],
    [run("Oct. 15, 2026", 54, 146), run("CAFE MAPLE #12", 130, 146), endingRun("4.50", 380, 146), endingRun("995.50", 560, 146)],
  ];
  const statement = one(readPdfStatement([page(run("Sample Bank", 54, 30), ...names, ...rows.flat())]));
  // (the two lines of the 15th keep the order the balances follow: the coffee came before the pay)
  assert.deepEqual(statement.lines.map((l) => [l.posted, l.amount, l.balance]), [
    ["2026-10-15", -450, 99550],
    ["2026-10-15", 250000, 349550],
    ["2026-10-20", -8217, 341333],
  ]);
  assert.deepEqual([statement.opening, statement.closing, statement.warnings], [100000, 341333, []]);
  // a balance that does not follow from the line before it says nothing about the rest
  const broken = one(readPdfStatement([page(run("Sample Bank", 54, 30), ...names, ...rows[0]!, run("Oct. 15, 2026", 54, 133), run("PAYROLL DEPOSIT", 130, 133), endingRun("2,500.00", 470, 133), endingRun("9,999.99", 560, 133), ...rows[2]!)]));
  assert.deepEqual([broken.opening, broken.closing, broken.warnings], [undefined, undefined, ["no-closing-balance"]]);
});

// ---------------------------------------------------------------------------------------------
// What is a line, and what is not
// ---------------------------------------------------------------------------------------------

test("lines set in other ways: one run for the whole line, a cell for each date, the amount against the words", () => {
  const dated = [run("Sample Visa", 54, 30), run("Statement date", 54, 60), run("Nov. 14, 2026", 200, 60)];
  // two columns of dates, named on one line; the second is the day it was posted unless the names say otherwise
  const names = [run("Trans date", 54, 100), run("Posting date", 110, 100), run("Details", 180, 100), endingRun("Amount", 500, 100)];
  const separate = one(readPdfStatement([page(...dated, ...names, run("Oct. 17", 54, 120), run("Oct. 21", 110, 120), run("CAFE MAPLE", 180, 120), endingRun("4.50", 500, 120))]));
  assert.deepEqual(separate.lines, [{ posted: "2026-10-21", date: "2026-10-17", amount: -450, description: "CAFE MAPLE" }]);
  const turned = [run("Posted", 54, 92), run("Date", 54, 100), run("Purchase", 110, 92), run("Date", 110, 100), run("Details", 180, 100), endingRun("Amount", 500, 100)];
  const other = one(readPdfStatement([page(...dated, ...turned, run("Oct. 21", 54, 120), run("Oct. 17", 110, 120), run("CAFE MAPLE", 180, 120), endingRun("4.50", 500, 120))]));
  assert.deepEqual(other.lines, [{ posted: "2026-10-21", date: "2026-10-17", amount: -450, description: "CAFE MAPLE" }]);
  // two columns named "Date" and nothing more: the second is the day it was posted
  const plainNames = [run("Date", 54, 100), run("Date", 110, 100), run("Details", 180, 100), endingRun("Amount", 500, 100)];
  const unnamed = one(readPdfStatement([page(...dated, ...plainNames, run("Oct. 17", 54, 120), run("Oct. 21", 110, 120), run("CAFE MAPLE", 180, 120), endingRun("4.50", 500, 120))]));
  assert.deepEqual(unnamed.lines, [{ posted: "2026-10-21", date: "2026-10-17", amount: -450, description: "CAFE MAPLE" }]);
  // the same day twice is one day
  const same = one(readPdfStatement([page(...dated, ...names, run("Oct. 17", 54, 120), run("Oct. 17", 110, 120), run("CAFE MAPLE", 180, 120), endingRun("4.50", 500, 120))]));
  assert.deepEqual(same.lines, [{ posted: "2026-10-17", amount: -450, description: "CAFE MAPLE" }]);
  // a whole line as one run of text: the dates are its start and the amount its end
  const whole = "Oct. 17 Oct. 21 CAFE MAPLE #12 VANCOUVER 4.50";
  const single = one(readPdfStatement([page(...dated, ...names, { text: whole, x: 54, y: 120, w: 446, h: 9 })]));
  assert.deepEqual(single.lines, [{ posted: "2026-10-21", date: "2026-10-17", amount: -450, description: "CAFE MAPLE #12 VANCOUVER" }]);
  // a number at the end of a description is not the amount: 12 has no cents, and a store's number stands far from the column
  const numbered = one(readPdfStatement([page(...dated, ...names, run("Oct. 17", 54, 120), run("Oct. 21", 110, 120), run("STORE 12", 180, 120), endingRun("4.50", 500, 120), run("Oct. 18", 54, 133), run("Oct. 22", 110, 133), run("STORE 0045 99.99", 180, 133), endingRun("7.25", 500, 133))]));
  assert.deepEqual(numbered.lines.map((l) => [l.amount, l.description]), [[-450, "STORE 12"], [-725, "STORE 0045 99.99"]]);
  // every word a run of its own, a space apart: words that stand together are still one name, one date, one amount
  const wordByWord = one(
    readPdfStatement([
      page(
        ...spaced("Sample Visa", 54, 30),
        ...spaced("Statement date", 54, 60),
        ...spaced("Nov. 14, 2026", 200, 60),
        ...spaced("Previous balance", 54, 73),
        endingRun("250.00", 380, 73),
        run("CR", 382.5, 73),
        ...spaced("New balance", 54, 86),
        endingRun("245.50", 380, 86),
        run("CR", 382.5, 86),
        ...spaced("Trans date", 54, 100),
        ...spaced("Posting date", 110, 100),
        run("Details", 180, 100),
        endingRun("Amount", 500, 100),
        ...spaced("Oct. 17", 54, 120),
        ...spaced("Oct. 21", 110, 120),
        ...spaced("CAFE MAPLE #12", 180, 120),
        endingRun("4.50", 500, 120),
      ),
    ]),
  );
  assert.deepEqual(wordByWord.lines, [{ posted: "2026-10-21", date: "2026-10-17", amount: -450, description: "CAFE MAPLE #12" }]);
  assert.deepEqual([wordByWord.opening, wordByWord.closing, reconcile(wordByWord.lines, wordByWord.opening, wordByWord.closing).status], [25000, 24550, "reconciled"]);
});

test("what is not a line is not read as one, and a line that could not be read is counted", () => {
  const top = [run("Sample Visa", 54, 30), run("Statement date", 54, 60), run("Nov. 14, 2026", 200, 60)];
  const statement = one(
    readPdfStatement([
      page(
        ...top,
        // a date and an amount before any table
        ...line("Oct. 1", "NOT IN A TABLE", "9.99", 80),
        ...head(100),
        ...line("Oct. 17", "CAFE MAPLE", "4.50", 120),
        // more wording under a line: three lines of it at most
        run("FOREIGN CURRENCY 3.25 USD @ 1.3846", 142, 129),
        run("SECOND LINE", 142, 138),
        run("THIRD LINE", 142, 147),
        run("FOURTH LINE", 142, 156),
        ...line("Oct. 18", "NORTH SHORE GROCER", "82.17", 170),
        // under a line, and starting too far left to be more of it
        run("Card number: XXXX XXXX XXXX 4821", 54, 179),
        ...line("Oct. 19", "ACME WIDGETS", "14.95", 192),
        // under a line, where descriptions start, and ending with an amount: a total, not wording
        run("Subtotal", 142, 201),
        endingRun("101.62", 400, 201),
        // a line that starts with a date and has no amount: counted
        run("Oct. 20", 54, 214),
        run("NO AMOUNT HERE", 142, 214),
        // a word and a number are not a date
        run("Items 12", 54, 227),
        endingRun("4.50", 400, 227),
        // a date that does not stand where the dates do
        run("Oct. 21 NOTE", 142, 240),
        endingRun("3.00", 400, 240),
        // an amount far from the column of amounts: counted
        run("Oct. 22", 54, 320),
        run("TOO FAR LEFT", 142, 320),
        endingRun("7.00", 300, 320),
        // a number with no cents at the end of a line is not its amount, even where the amounts stand: counted
        { text: "Oct. 23 STORE 12", x: 54, y: 333, w: 340, h: 9 },
      ),
      // the table goes on over the page without its row of names; a balance named in a sentence is not the statement's
      // and wording far below a line is not that line's
      page(...line("Oct. 24", "CAFE MAPLE", "1.00", 60), run("Thank you for being a customer", 142, 130), run("Total balance for purposes of interest", 54, 200), endingRun("$99.05", 400, 200), run("Total balance not yet due", 54, 214), endingRun("$1.00", 400, 214)),
    ]),
  );
  assert.deepEqual(statement.lines, [
    { posted: "2026-10-17", amount: -450, description: "CAFE MAPLE", memo: "FOREIGN CURRENCY 3.25 USD @ 1.3846 SECOND LINE THIRD LINE" },
    { posted: "2026-10-18", amount: -8217, description: "NORTH SHORE GROCER" },
    { posted: "2026-10-19", amount: -1495, description: "ACME WIDGETS" },
    { posted: "2026-10-24", amount: -100, description: "CAFE MAPLE" },
  ]);
  assert.deepEqual([statement.unread, statement.opening, statement.closing, statement.warnings], [3, undefined, undefined, ["no-closing-balance", "lines-left-out"]]);
  // A statement with no balances is put in the order of its days (one card's lines, then the next card's), and lines
  // of one day stay as they stood. One that lists the newest first is turned round before that.
  const cards = one(readPdfStatement([page(...top, ...head(100), ...line("Oct. 17", "A", "1.00", 120), ...line("Oct. 19", "C", "3.00", 133), ...line("Oct. 17", "B", "2.00", 146), ...line("Oct. 19", "D", "4.00", 159))]));
  assert.deepEqual(cards.lines.map((l) => l.description), ["A", "B", "C", "D"]);
  const newest = one(readPdfStatement([page(...top, ...head(100), ...line("Oct. 19", "D", "4.00", 120), ...line("Oct. 19", "C", "3.00", 133), ...line("Oct. 17", "B", "2.00", 146), ...line("Oct. 17", "A", "1.00", 159))]));
  assert.deepEqual(newest.lines.map((l) => l.description), ["A", "B", "C", "D"]);
});

test("a PDF that is no statement, or has no table this reader knows, is refused", () => {
  assert.equal(refused(readPdfStatement([])), "layout-unclear");
  assert.equal(refused(readPdfStatement([page(run("Dear customer, your statement is ready.", 54, 100))])), "layout-unclear");
  // lines with dates and amounts, and no row of names over them
  assert.equal(refused(readPdfStatement([page(run("Statement date", 54, 60), run("Nov. 14, 2026", 200, 60), ...line("Oct. 17", "CAFE MAPLE", "4.50", 120))])), "layout-unclear");
  // a row of names needs a date first and a column of money: these are not one
  for (const names of [
    [run("Description", 54, 100), run("Date", 200, 100), endingRun("Amount", 400, 100)],
    [run("Date", 54, 100), run("Description", 142, 100), run("Reference", 300, 100)],
    [run("Date", 54, 100), run("Description", 142, 100), endingRun("Balance", 400, 100)],
    [run("Date", 54, 100), endingRun("Amount", 400, 100)],
    [run("Date", 54, 100), run("Description", 142, 100), endingRun("Amount", 300, 100), endingRun("Debit", 400, 100)],
    [run("The date on which your statement is printed each month", 54, 100), run("Description", 345, 100), endingRun("Amount", 440, 100)],
  ])
    assert.equal(refused(readPdfStatement([page(run("Statement date", 54, 60), run("Nov. 14, 2026", 200, 60), ...names, ...line("Oct. 17", "CAFE MAPLE", "4.50", 120))])), "layout-unclear");
  // (a row of names with no money in it is no table of transactions, with or without lines under it)
  assert.equal(refused(readPdfStatement([page(run("Date", 54, 100), run("Description", 142, 100), run("Reference", 300, 100))])), "layout-unclear");
  // a table with nothing in it is a statement with no transactions
  assert.equal(refused(readPdfStatement([page(run("Statement date", 54, 60), run("Nov. 14, 2026", 200, 60), ...head(100))])), "no-lines");
});

test("whatever the pages hold, the reader answers and does not throw", () => {
  const random = seeded(11);
  const pick = <T>(from: readonly T[]): T => from[Math.floor(random() * from.length)]!;
  const WORDS = ["Date", "DATE", "Posting", "Description", "Amount", "Balance", "Withdrawals", "Deposits", "Oct. 17", "17 oct.", "10/17", "2026-10-17", "Oct. 17, 2026", "4.50", "$1,234.56", "1 234,56 $", "12.00 CR", "(3.00)", "-", "$", "CR", "Statement date", "Statement period", "Previous balance", "New balance", "Card number", "XXXX 1234", "CAFE MAPLE", "", " ", "é", "余额", "日期", "金额", "0", "99"];
  for (let round = 0; round < 400; round++) {
    const pages = Array.from({ length: 1 + Math.floor(random() * 3) }, () =>
      page(...Array.from({ length: Math.floor(random() * 40) }, () => ({ text: pick(WORDS) + (random() < 0.3 ? ` ${pick(WORDS)}` : ""), x: pick([54, 88, 142, 300, 365, 400, 470, 560]) + random() * 4, y: 20 + Math.floor(random() * 30) * 13, w: random() * 80, h: pick([0, 6, 9, 13]) }))),
    );
    const read = readPdfStatement(pages, pick([{}, { kind: "credit" as const }, { kind: "chequing" as const, currency: "USD" }]));
    if (read.ok) {
      for (const statement of read.statements) {
        assert.equal(statement.parser, "pdf");
        for (const l of statement.lines) assert.ok(/^\d{4}-\d\d-\d\d$/.test(l.posted) && Number.isSafeInteger(l.amount) && typeof l.description === "string");
      }
    } else assert.ok(["layout-unclear", "no-lines", "too-long"].includes(read.error), read.error);
  }
});
