// The OFX/QFX parser (IMP-3) on synthetic statements: what it reads, what it leaves out (IMP-6),
// that the statement reconciles to the cent (T-10), and that broken or hostile files are refused
// whole (T-11).
import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedStatement } from "../src/core/model";
import { readOfx } from "../src/core/ofx";
import { reconcile } from "../src/core/reconcile";
import { readStatementFile, type CsvParser } from "../src/core/read";
import { bankV1, bytesOf, CARD_NUMBER, cardV2, CHEQUING_NUMBER, latin1, SAVINGS_NUMBER } from "./samples";

function one(text: string | Uint8Array): ParsedStatement {
  const result = readOfx(typeof text === "string" ? bytesOf(text) : text);
  assert.ok(result.ok, result.ok ? "" : result.error);
  assert.equal(result.statements.length, 1);
  return result.statements[0]!;
}
const errorOf = (text: string): string => {
  const result = readOfx(bytesOf(text));
  return result.ok ? "ok" : result.error;
};

test("a chequing statement in OFX 1: the account, the period, the lines oldest first", () => {
  const s = one(bankV1());
  assert.equal(s.parser, "ofx");
  assert.equal(s.institution, "Maple Test Bank");
  assert.deepEqual(s.account, { kind: "chequing", currency: "CAD", last4: "4567" });
  assert.equal(s.from, "2026-10-01");
  assert.equal(s.to, "2026-10-31");
  assert.equal(s.closing, 123456);
  assert.equal(s.closingAsOf, "2026-10-31");
  assert.equal(s.unread, 0);
  assert.deepEqual(s.warnings, []);
  assert.equal(s.lines.length, 11);
  assert.deepEqual(s.lines.map((l) => l.posted), ["2026-10-02", "2026-10-15", "2026-10-16", "2026-10-20", "2026-10-22", "2026-10-25", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-31"]);
  assert.deepEqual(s.lines[0], { posted: "2026-10-02", date: "2026-10-01", amount: -8437, description: "SAVE ON FOODS #987", memo: "POS PURCHASE VANCOUVER BC", type: "DEBIT", ref: "2026100200001" });
  assert.deepEqual(s.lines[1], { posted: "2026-10-15", amount: 245000, description: "PAYROLL DEPOSIT", memo: "ACME FOODS LTD", type: "CREDIT", ref: "2026101500001" });
});

test("it reconciles to the cent with the balance before it (T-10)", () => {
  const s = one(bankV1());
  assert.deepEqual(reconcile(s.lines, 102992, s.closing), { status: "reconciled", opening: 102992, closing: 123456, sum: 20464 });
  assert.equal(reconcile(s.lines, 102991, s.closing).status, "mismatch");
  assert.equal(reconcile(s.lines, undefined, s.closing).status, "unchecked");
});

test("account and card numbers never survive reading (IMP-6)", () => {
  const s = one(bankV1());
  const kept = JSON.stringify(s);
  for (const secret of [CHEQUING_NUMBER, SAVINGS_NUMBER, "000199999"]) assert.ok(!kept.includes(secret), `${secret} was kept`);
  assert.equal(s.lines[3]!.description, "TRANSFER TO ****4321");
  assert.equal(s.lines[4]!.description, "VISA PAYMENT ****9012");
  const card = one(cardV2());
  assert.ok(!JSON.stringify(card).includes(CARD_NUMBER));
  assert.equal(card.account.last4, "9012");
});

test("the format's rough edges: a value left empty, an escaped character, a cheque, two alike on one day", () => {
  const s = one(bankV1());
  // <MEMO> with nothing after it, then <NAME>: the name is still the line's
  assert.deepEqual(s.lines[7], { posted: "2026-10-26", amount: -1299, description: "STREAMFLIX.COM", type: "DEBIT", ref: "2026102600001" });
  assert.equal(s.lines[8]!.description, "A&W #55 BURNABY");
  assert.equal(s.lines[9]!.cheque, "123");
  assert.equal(s.lines[5]!.description, "TIM HORTONS #1234");
  assert.equal(s.lines[6]!.description, "TIM HORTONS #1234");
  assert.notEqual(s.lines[5]!.ref, s.lines[6]!.ref);
});

test("a credit card statement in OFX 2: purchases are negative, the balance owed is negative", () => {
  const s = one(cardV2());
  assert.equal(s.institution, "Cedar Test Cards");
  assert.deepEqual(s.account, { kind: "credit", currency: "CAD", last4: "9012" });
  assert.equal(s.lines.length, 5);
  assert.equal(s.closing, -41218);
  assert.deepEqual(s.warnings, ["pending-left-out"]);
  assert.ok(!JSON.stringify(s).includes("PENDING CAFE"), "a line not posted yet is not imported (ACC-5)");
  assert.deepEqual(s.lines[0], { posted: "2026-10-03", amount: -31240, description: "T AND T SUPERMARKET", type: "DEBIT", ref: "C-1" });
  // text in a CDATA section is text, markup characters and all
  assert.deepEqual(s.lines[1], { posted: "2026-10-09", amount: -6803, description: "BOOKS & <MORE> SEATTLE WA", type: "DEBIT", ref: "C-2", foreign: { currency: "USD", rate: "1.3606" } });
  assert.deepEqual(s.lines[2], { posted: "2026-10-12", amount: 2000, description: "T AND T SUPERMARKET", memo: "REFUND", type: "CREDIT", ref: "C-3" });
  assert.equal(reconcile(s.lines, -35000, s.closing).status, "reconciled");
});

test("one file, two accounts; an investment account in it is left out and said so", () => {
  const bank = bankV1();
  const card = cardV2();
  const both = bank.replace("</OFX>", `${card.slice(card.indexOf("<CREDITCARDMSGSRSV1>"), card.indexOf("</OFX>"))}<INVSTMTMSGSRSV1><INVSTMTTRNRS><INVSTMTRS><CURDEF>CAD</INVSTMTRS></INVSTMTTRNRS></INVSTMTMSGSRSV1></OFX>`);
  const result = readOfx(bytesOf(both));
  assert.ok(result.ok);
  assert.deepEqual(result.statements.map((s) => s.account.kind), ["chequing", "credit"]);
  assert.ok(result.statements.every((s) => s.warnings.includes("investment-left-out")));
  assert.equal(errorOf("OFXHEADER:100\n\n<OFX><INVSTMTMSGSRSV1><INVSTMTTRNRS><INVSTMTRS><CURDEF>CAD</INVSTMTRS></INVSTMTTRNRS></INVSTMTMSGSRSV1></OFX>"), "no-accounts");
});

test("amounts: a comma before the cents is read, a thousands mark is not guessed at", () => {
  const trn = (amount: string) => `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005<TRNAMT>${amount}<FITID>x${amount}<NAME>SHOP</STMTTRN>`;
  const s = one(bankV1({ lines: [trn("-12,34"), trn("+7"), trn("-.5"), trn("-3.10")].join("\n") }));
  assert.deepEqual(s.lines.map((l) => l.amount), [-1234, 700, -50, -310]);
  const bad = one(bankV1({ lines: [trn("-3.10"), trn("1,234"), trn("1,234.56"), trn("12.345"), trn("abc"), trn("")].join("\n") }));
  assert.deepEqual(bad.lines.map((l) => l.amount), [-310]);
  assert.equal(bad.unread, 5);
  assert.deepEqual(bad.warnings, ["lines-left-out"]);
});

test("a line in another currency is not given an amount it doesn't have (ACC-6)", () => {
  const s = one(bankV1({ lines: `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005<TRNAMT>-10.00<FITID>a<NAME>HOME</STMTTRN>\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-10.00<FITID>b<NAME>ABROAD<CURRENCY><CURRATE>1.36<CURSYM>USD</CURRENCY></STMTTRN>` }));
  assert.deepEqual(s.lines.map((l) => l.description), ["HOME"]);
  assert.equal(s.unread, 1);
  assert.deepEqual(s.warnings, ["other-currency-lines"]);
});

test("accents in an older export, and a file with no balance", () => {
  const french = one(latin1(bankV1({ lines: "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005<TRNAMT>-4.25<FITID>f1<NAME>CAFÉ DÉPÔT MONTRÉAL</STMTTRN>" })));
  assert.equal(french.lines[0]!.description, "CAFÉ DÉPÔT MONTRÉAL");
  const bare = one(bankV1({ tail: "" }));
  assert.equal(bare.closing, undefined);
  assert.deepEqual(bare.warnings, ["no-closing-balance"]);
  assert.equal(reconcile(bare.lines, 102992, bare.closing).status, "unchecked");
});

test("broken files are refused whole (T-11)", () => {
  const good = bankV1();
  assert.equal(errorOf(good.slice(0, good.indexOf("<STMTTRN>", 900))), "malformed", "cut short");
  assert.equal(errorOf(good.replace("</OFX>", "")), "malformed", "never closed");
  assert.equal(errorOf(good.replace("<OFX>", "<NOPE>")), "malformed");
  assert.equal(errorOf(bankV1({ currency: "dollars" })), "malformed");
  assert.equal(errorOf(bankV1({ currency: "" })), "malformed");
  assert.equal(errorOf(bankV1({ lines: "" })), "no-lines");
  assert.equal(errorOf("OFXHEADER:100\n\n<OFX></OFX>"), "no-accounts");
  assert.equal(errorOf("just some text"), "malformed");
  assert.equal(errorOf(""), "malformed");
});

test("hostile files end in a refusal, not a crash or a long wait (T-11)", () => {
  const started = Date.now();
  // nested far too deep
  assert.equal(errorOf(`OFXHEADER:100\n\n<OFX>${"<A>".repeat(5000)}${"</A>".repeat(5000)}</OFX>`), "malformed");
  // a tag left open with a great many values after it
  const flood = `OFXHEADER:100\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>CAD<JUNK>${"<X>1".repeat(300_000)}</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  assert.equal(errorOf(flood), "no-lines");
  // more lines than a file may hold
  const many = `<STMTTRN><DTPOSTED>20261005<TRNAMT>-1.00<NAME>X</STMTTRN>`.repeat(50_001);
  assert.equal(errorOf(bankV1({ lines: many })), "too-long");
  // markup in a description stays text
  const script = one(bankV1({ lines: "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005<TRNAMT>-1.00<FITID>s<NAME>&lt;script&gt;alert(1)&lt;/script&gt; &#60;b&#62; &#x3c;i&#x3e; &#0; &bogus;</STMTTRN>" }));
  assert.equal(script.lines[0]!.description, "<script>alert(1)</script> <b> <i> &bogus;");
  // a great many CDATA sections that never close
  assert.equal(errorOf(`OFXHEADER:100\n\n<OFX>${"<![CDATA[x".repeat(400_000)}</OFX>`), "no-accounts");
  // a value far longer than any real one is cut, not kept
  const long = one(bankV1({ lines: `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005<TRNAMT>-1.00<FITID>${"9".repeat(500)}<NAME>${"N".repeat(5000)}</STMTTRN>` }));
  assert.ok(long.lines[0]!.description.length <= 200);
  assert.ok(long.lines[0]!.ref!.length <= 80);
  assert.ok(Date.now() - started < 20_000, "took too long");
});

test("the front door: bytes decide, and a file nobody recognizes saves nothing", () => {
  const errorFor = (bytes: Uint8Array, parsers?: CsvParser[]) => {
    const r = readStatementFile(bytes, parsers);
    return r.ok ? "ok" : r.error;
  };
  assert.equal(errorFor(bytesOf(bankV1())), "ok");
  assert.equal(errorFor(new Uint8Array(0)), "empty");
  assert.equal(errorFor(Uint8Array.of(0x89, 0x50, 0x4e, 0x47)), "not-a-statement");
  assert.equal(errorFor(bytesOf("<!doctype html><title>Sign in</title>")), "not-a-statement");
  assert.equal(errorFor(bytesOf("%PDF-1.7")), "pdf-not-yet");
  assert.equal(errorFor(bytesOf("Date,Description,Amount\n2026-10-01,COFFEE,-4.50\n")), "no-parser");
  // a bank's CSV layout, once there is a parser for it
  const toy: CsvParser = {
    id: "toybank-chequing-csv",
    matches: (rows) => rows[0]?.join("|") === "Date|Description|Amount",
    read: (rows) =>
      rows.length > 3
        ? null
        : { parser: "toybank-chequing-csv", account: { currency: "CAD" }, lines: rows.slice(1).map((r) => ({ posted: r[0]!, amount: Math.round(Number(r[2]) * 100), description: r[1]! })), unread: 0, warnings: [] },
  };
  const read = readStatementFile(bytesOf("Date,Description,Amount\n\n2026-10-01,COFFEE,-4.50\n"), [toy]);
  assert.ok(read.ok);
  assert.equal(read.statements[0]!.lines.length, 1);
  assert.equal(errorFor(bytesOf("Date,Description,Amount\n"), [toy]), "no-lines");
  assert.equal(errorFor(bytesOf("Date,Description,Amount\n1,a,1\n2,b,2\n3,c,3\n"), [toy]), "malformed");
  assert.equal(errorFor(bytesOf("Other,Header\n1,2\n"), [toy]), "no-parser");
  assert.equal(errorFor(bytesOf('Date,Description,Amount\n"never closed'), [toy]), "malformed");
});
