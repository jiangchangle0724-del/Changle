/**
 * The fixture tool's own work (src/fixture): a CSV statement and a PDF's layout written again with
 * invented contents, and the summary that holds no contents at all (IMP-9). The "real" files in
 * here are made up for the test.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readAnyCsv } from "../src/core/anycsv";
import { lineText, linesOf, type PdfPage } from "../src/core/pdftext";
import { readStatementFile } from "../src/core/read";
import { inventCsv } from "../src/fixture/csv";
import { inventPdf, isPdfFixture } from "../src/fixture/pdf";
import { shapeOf, summaryOf } from "../src/fixture/summary";
import { bytesOf } from "./samples";
import { seeded } from "./seeded";

const SECRETS = ["SAMPLE", "9990001234567", "PAYROLL", "ACME", "WIDGETS", "CAFE", "MAPLE", "VANCOUVER", "SHORE", "GROCER", "2,500.00", "82.17", "14.95", "10/01", "10/15"];

const STATEMENT =
  "﻿" +
  [
    "Account activity for A. SAMPLE",
    "Account number: 9990001234567",
    "",
    '"Date","Description","Withdrawals","Deposits"',
    '"10/01/2026","PAYROLL DEPOSIT ACME WIDGETS","","2,500.00"',
    '"10/02/2026","CAFE MAPLE #12, VANCOUVER","4.50",""',
    '"10/15/2026","NORTH SHORE GROCER","82.17",""',
    '"10/31/2026","MONTHLY FEE","14.95",""',
  ].join("\r\n") +
  "\r\n";

test("a CSV statement written again: the same layout, and nothing of what was in it", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const made = inventCsv(STATEMENT, seeded(seed));
    const lines = made.text.split("\r\n");
    assert.equal(lines.length, 9, "the same lines, ended the same way");
    assert.ok(made.text.startsWith("﻿"));
    assert.equal(made.delimiter, ",");
    // the row of column names is the fourth line, kept as it was
    assert.equal(made.header, 3);
    assert.equal(lines[3], '"Date","Description","Withdrawals","Deposits"');
    // above it, the words a statement is built from stay and the name and the number go
    assert.match(lines[0]!, /^﻿Account activity for [A-Z]\. [A-Z]{6}$/);
    assert.match(lines[1]!, /^Account number: \d{13}$/);
    assert.equal(lines[2], "");
    // under it: the quotes, the comma inside a quoted field, the empty fields and the way a date and an amount are written
    assert.match(lines[4]!, /^"\d\d\/\d\d\/2026","[A-Z]{7} DEPOSIT [A-Z]{4} [A-Z]{7}","","\d,\d{3}\.\d\d"$/);
    assert.match(lines[5]!, /^"\d\d\/\d\d\/2026","[A-Z]{4} [A-Z]{5} #\d\d, [A-Z]{9}","\d\.\d\d",""$/);
    for (const secret of SECRETS) assert.ok(!made.text.includes(secret), `${secret} (seed ${seed})`);

    // the reader reads the copy the way it read the file: the same layout, the same number of lines, each going the same way
    const [was, is] = [readAnyCsv(STATEMENT), readAnyCsv(made.text)];
    assert.ok(was.ok && is.ok);
    assert.deepEqual(is.layout, was.layout);
    assert.deepEqual(
      is.statements[0]!.lines.map((line) => Math.sign(line.amount)),
      was.statements[0]!.lines.map((line) => Math.sign(line.amount)),
    );
    assert.deepEqual(is.statements[0]!.warnings, was.statements[0]!.warnings);
    // and in the same order: the days were moved, not shuffled
    const days = is.statements[0]!.lines.map((line) => line.posted);
    assert.deepEqual([...days].sort(), days);
  }
});

test("other ways a CSV is written survive being written again", () => {
  // semicolons, a comma before the cents, a space in the thousands, the day first, no quotes, lines ended the Unix way
  const french = ["Date;Libellé;Montant", "01/10/2026;PAIE ACME;2 500,00", "13/10/2026;CAFÉ ÉRABLE;-4,50", "31/10/2026;ÉPICERIE;-82,17"].join("\n");
  for (const seed of [1, 2, 3]) {
    const made = inventCsv(french, seeded(seed));
    assert.equal(made.delimiter, ";");
    const lines = made.text.split("\n");
    assert.equal(lines[0], "Date;Libellé;Montant");
    assert.match(lines[1]!, /^\d\d\/\d\d\/2026;[A-Z]{4} [A-Z]{4};\d \d{3},\d\d$/);
    assert.match(lines[2]!, /^\d\d\/\d\d\/2026;[A-Z]{4} [A-Z]{6};-\d,\d\d$/);
    const [was, is] = [readAnyCsv(french), readAnyCsv(made.text)];
    assert.ok(was.ok && is.ok);
    assert.deepEqual(is.layout, was.layout);
  }
  // A column of balances no longer follows from the amounts: the numbers are invented one by one. The copy says where things are, not what
  // they add up to; the reader leaves such a balance out and says there is none to check against.
  const balanced = "Date,Description,Amount,Balance\n2026-10-01,PAYROLL,2500.00,3500.00\n2026-10-02,COFFEE,-4.50,3495.50\n2026-10-15,GROCER,-82.17,3413.33\n";
  const made = readAnyCsv(inventCsv(balanced, seeded(4)).text);
  assert.ok(made.ok);
  assert.equal(made.layout.balance, undefined);
  assert.deepEqual(made.statements[0]!.warnings, ["no-closing-balance"]);
  // text that is no table is still written again, word for word
  assert.match(inventCsv("Dear Avery,\nyour statement is ready.\n", seeded(1)).text, /^[A-Z][a-z]{3} [A-Z][a-z]{4},\nyour statement is [a-z]{5}\.\n$/);
  assert.equal(inventCsv("", seeded(1)).text, "");
});

const run = (text: string, x: number, y: number, w = text.length * 5, h = 9): PdfPage["runs"][number] => ({ text, x, y, w, h });

test("the runs of a page are gathered into lines", () => {
  const page: PdfPage = { width: 612, height: 792, runs: [run("4.50", 420, 114.6), run("Oct", 72, 114), run("02", 90, 114.2), run("Opening balance", 72, 100), run("CAFE MAPLE", 130, 113.5), run("Next line", 72, 126)] };
  const lines = linesOf(page);
  assert.deepEqual(
    lines.map((line) => line.runs.map((r) => r.text)),
    [["Opening balance"], ["Oct", "02", "CAFE MAPLE", "4.50"], ["Next line"]],
  );
  // a gap is a space; runs that touch are one word
  assert.deepEqual(lineText(lines[1]!), { text: "Oct 02 CAFE MAPLE 4.50", starts: [0, 4, 7, 18] });
  const letters: PdfPage = { width: 612, height: 792, runs: [..."CAFE"].map((c, i) => run(c, 72 + i * 5, 50, 5)) };
  assert.equal(lineText(linesOf(letters)[0]!).text, "CAFE");
});

test("a PDF's layout written again: every run where it was, with invented contents", () => {
  const pages: PdfPage[] = [
    {
      width: 612,
      height: 792,
      runs: [run("Statement period: October 1 to October 31, 2026", 72, 60), run("Avery Sample", 72, 74), run("Opening balance", 72, 100), run("1,000.00", 500, 100), run("Oct", 72, 114), run("02", 90, 114), run("CAFE MAPLE #12", 130, 114), run("4.50", 420, 114), run("995.50", 505, 114), run("Oct", 72, 128), run("15", 90, 128), run("NORTH SHORE GROCER", 130, 128), run("82.17", 415, 128), run("913.33", 505, 128)],
    },
    { width: 612, height: 792, runs: [..."CAFE"].map((c, i) => run(c, 72 + i * 5, 50, 5)) },
  ];
  for (const seed of [1, 2, 3, 4]) {
    const made = inventPdf(pages, seeded(seed));
    const kept: unknown = JSON.parse(JSON.stringify(made));
    assert.ok(isPdfFixture(kept));
    // the same runs in the same places, and the same sizes
    assert.deepEqual(
      made.pages.map((page) => page.runs.map((r) => [r.x, r.y, r.w, r.h])),
      pages.map((page) => page.runs.map((r) => [r.x, r.y, r.w, r.h])),
    );
    const texts = made.pages[0]!.runs.map((r) => r.text);
    // the words a statement is built from stay; the month moves, and is the same month in the heading and on the lines
    assert.match(texts[0]!, /^Statement period: ([A-Z][a-z]+) \d\d? to \1 \d\d, 2026$/);
    assert.equal(texts[2], "Opening balance");
    assert.match(texts[1]!, /^[A-Z][a-z]{4} [A-Z][a-z]{5}$/);
    // a date set as two runs is still a date: the month's name in one, a day of that month in the other, the earlier line still earlier
    assert.equal(texts[4], texts[9]);
    assert.match(texts[4]!, /^[A-Z][a-zéû]{2}$/);
    assert.ok(Number(texts[5]) >= 1 && Number(texts[5]) <= 12 && Number(texts[10]) >= 13 && Number(texts[10]) <= 28, `${texts[5]} ${texts[10]}`);
    assert.match(texts[3]!, /^\d,\d{3}\.\d\d$/);
    assert.match(texts[7]!, /^\d\.\d\d$/);
    // a word set letter by letter is invented letter by letter
    assert.match(made.pages[1]!.runs.map((r) => r.text).join(""), /^[A-Z]{4}$/);
    const all = JSON.stringify(made);
    for (const secret of ["Avery", "Sample", "CAFE", "MAPLE", "GROCER", "1,000.00", "995.50", "82.17", "913.33", "October"]) assert.ok(!all.includes(secret), `${secret} (seed ${seed})`);
  }
  for (const junk of [null, 5, {}, { kind: "moneylens-pdf-layout", version: 1, invented: false, pages: [] }, { kind: "moneylens-pdf-layout", version: 2, invented: true, pages: [] }, { kind: "moneylens-pdf-layout", version: 1, invented: true, pages: [{ width: 1, height: 1, runs: [{ text: 5, x: 0, y: 0, w: 0, h: 0 }] }] }, { kind: "moneylens-pdf-layout", version: 1, invented: true, pages: [{ width: "1", height: 1, runs: [] }] }]) assert.equal(isPdfFixture(junk), false);
});

test("the summary to pass on holds the layout and nothing that was in the file", () => {
  assert.equal(shapeOf("CAFE Maple #12, 余额 -1,234.56"), "AAAA Aaaaa #99, 中中 -9,999.99");
  const read = readStatementFile(bytesOf(STATEMENT));
  const summary = summaryOf({ kind: "text", bytes: STATEMENT.length }, read, STATEMENT);
  assert.equal(summary.read, "ok");
  assert.deepEqual(summary.statements, [{ parser: "csv", currency: "CAD", lines: 4, balance: false, sums: "unchecked", unread: 0, warnings: ["no-closing-balance"] }]);
  assert.deepEqual(summary.layout?.names, ["Date", "Description", "Withdrawals", "Deposits"]);
  assert.deepEqual(summary.table?.shapes[1], ["99/99/9999", "AAAA AAAAA #99, AAAAAAAAA", "9.99", ""]);
  const text = JSON.stringify(summary);
  for (const secret of SECRETS) assert.ok(!text.includes(secret), secret);
  // a file that was refused: the shape of its table is what there is to go on
  const two = "2026-10-01,COFFEE,-4.50,-3.25\n2026-10-02,GROCER,-82.17,-60.00\n";
  const refused = summaryOf({ kind: "text", bytes: two.length }, readStatementFile(bytesOf(two)), two);
  assert.equal(refused.read, "layout-unclear");
  assert.deepEqual(refused.table, { delimiter: ",", width: 4, names: null, shapes: [["9999-99-99", "AAAAAA", "-9.99", "-9.99"], ["9999-99-99", "AAAAAA", "-99.99", "-99.99"]] });
  // a PDF: how much there was
  assert.deepEqual(summaryOf({ kind: "pdf", bytes: 10 }, null, undefined, [{ width: 1, height: 1, runs: [run("x", 0, 0)] }]).pdf, { pages: 1, runs: 1 });
});
