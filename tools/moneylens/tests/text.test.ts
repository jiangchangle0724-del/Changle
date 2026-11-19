// IMP-5 and IMP-6: statement text is only ever text, and account and card numbers in it are cut to
// their last four digits.
import assert from "node:assert/strict";
import test from "node:test";
import { decodeText, fold, lastFour, maskNumbers, tidy } from "../src/core/text";

test("bytes to text: the mark at the start decides, then UTF-8, then Windows-1252", () => {
  assert.equal(decodeText(Uint8Array.of(0xef, 0xbb, 0xbf, 0x41, 0xc3, 0xa9)), "Aé");
  assert.equal(decodeText(Uint8Array.of(0xff, 0xfe, 0x41, 0x00, 0xe9, 0x00)), "Aé");
  assert.equal(decodeText(Uint8Array.of(0xfe, 0xff, 0x00, 0x41, 0x00, 0xe9)), "Aé");
  assert.equal(decodeText(Uint8Array.of(0x41, 0xc3, 0xa9)), "Aé");
  // 0xE9 alone is not UTF-8: an older export, é in Windows-1252
  assert.equal(decodeText(Uint8Array.of(0x43, 0x41, 0x46, 0xc9)), "CAFÉ");
  assert.equal(decodeText(Uint8Array.of(0x43, 0x41, 0x46, 0xc9), "windows-1252"), "CAFÉ");
  assert.equal(decodeText(new Uint8Array(0)), "");
});

test("tidying a line", () => {
  const zeroWidth = String.fromCharCode(0x200b);
  const override = String.fromCharCode(0x202e);
  assert.equal(tidy("  TIM   HORTONS\t#12\r\n"), "TIM HORTONS #12");
  assert.equal(tidy(`A${zeroWidth}B${override}C\u0000D`), "A B C D");
  assert.equal(tidy("x".repeat(500)).length, 200);
  assert.equal(tidy("x".repeat(500), 10), "xxxxxxxxxx");
  assert.equal(tidy(""), "");
});

test("account and card numbers are cut to their last four digits", () => {
  const cases: [string, string][] = [
    ["TRANSFER TO 9990007654321", "TRANSFER TO ****4321"],
    ["VISA 4500 1234 5678 9012", "VISA ****9012"],
    ["VISA 4500-1234-5678-9012 THANKS", "VISA ****9012 THANKS"],
    ["AMEX 3712-345678-90123", "AMEX ****0123"],
    ["CARD 4500********9012", "CARD ****9012"],
    ["CARD 450012******9012 STORE", "CARD ****9012 STORE"],
    ["XXXX XXXX XXXX 9012", "****9012"],
    ["xxxx-xxxx-xxxx-9012", "****9012"],
    ["4500 12** **** 9012 STORE", "****9012 STORE"],
    ["ACCT ************", "ACCT ****"],
    ["****1234567", "****4567"],
    ["12.50 XXXX9012", "12.50 ****9012"],
    ["REF 1234567", "REF ****4567"],
    ["PAY 6045551234 NOW", "PAY ****1234 NOW"],
    ["TWO 9990001234567 AND 9990007654321", "TWO ****4567 AND ****4321"],
  ];
  for (const [text, want] of cases) assert.equal(maskNumbers(text), want, text);
});

test("short numbers stay: a store number, an amount, a day", () => {
  for (const text of ["TIM HORTONS #1234", "2026-10-31", "$1,234.56", "STORE 123456", "UNIT 12 1234 5678", "A&W #55 BURNABY", "MAXX XL", "", "7 ELEVEN 99"]) {
    assert.equal(maskNumbers(text), text, text);
  }
});

test("masking twice changes nothing more", () => {
  for (const text of ["TRANSFER TO 9990007654321", "VISA 4500 1234 5678 9012", "CARD 4500********9012", "XXXX XXXX XXXX 9012", "****1234567", "REF 1234567 AND 4500-1234-5678-9012"]) {
    const once = maskNumbers(text);
    assert.equal(maskNumbers(once), once, text);
    assert.ok(!/\d{5,}/.test(once), `${once} still shows a long number`);
  }
});

test("last four digits, however the number was written", () => {
  assert.equal(lastFour("9990001234567"), "4567");
  assert.equal(lastFour("1234-567 8901"), "8901");
  assert.equal(lastFour("XXXX-XXXX-XXXX-9012"), "9012");
  assert.equal(lastFour("12"), "12");
  assert.equal(lastFour(""), "");
});

test("text as it is compared", () => {
  assert.equal(fold("Tim Horton's #1234"), "TIM HORTON S 1234");
  assert.equal(fold("  SAVE-ON-FOODS  "), "SAVE ON FOODS");
  assert.equal(fold("ＡＢＣ１２"), "ABC12");
  assert.equal(fold("大统华 T&T"), "大统华 T T");
  assert.equal(fold("***"), "");
});
