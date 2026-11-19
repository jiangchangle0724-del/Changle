// ACC-1: amounts are whole smallest units, read digit by digit. What is read, what is refused,
// and that nothing drifts by a cent.
import assert from "node:assert/strict";
import test from "node:test";
import { add, exponentOf, isMinor, MAX_MINOR, parseAmount, toDecimalString, total } from "../src/core/money";

const nbsp = String.fromCharCode(0x00a0);
const narrow = String.fromCharCode(0x202f);
const minus = String.fromCharCode(0x2212);

test("amounts as statements print them", () => {
  const cases: [string, number][] = [
    ["1,234.56", 123456],
    ["1234.56", 123456],
    ["-1,234.56", -123456],
    ["+1,234.56", 123456],
    ["(1,234.56)", -123456],
    ["1,234.56-", -123456],
    ["$1,234.56", 123456],
    ["-$5.00", -500],
    ["$-5.00", -500],
    ["($5.00)", -500],
    ["CA$12.50", 1250],
    ["C$12.50", 1250],
    ["CAD$ 12.50", 1250],
    ["12.50 CAD", 1250],
    ["CAD 12.50", 1250],
    ["12", 1200],
    ["12.5", 1250],
    [".5", 50],
    ["0.05", 5],
    ["12.3400", 1234],
    ["  7.00  ", 700],
    ["1 234.56", 123456],
    [`${minus}45.10`, -4510],
    ["1,000,000.00", 100000000],
  ];
  for (const [text, want] of cases) assert.equal(parseAmount(text), want, text);
});

test("a currency written next to the amount has to be the account's", () => {
  assert.equal(parseAmount("US$12.50", "USD"), 1250);
  assert.equal(parseAmount("12.50 USD", "USD"), 1250);
  assert.equal(parseAmount("USD -12.50", "USD"), -1250);
  assert.equal(parseAmount("-US$12.50", "USD"), -1250);
  assert.equal(parseAmount("$12.50", "USD"), 1250, "a bare dollar sign says nothing about which dollar");
  for (const text of ["US$12.50", "12.50 USD", "USD 12.50", "-US$12.50", "HK$12.50", "12.50 EUR"]) assert.equal(parseAmount(text, "CAD"), null, text);
  assert.equal(parseAmount("CA$12.50", "USD"), null);
});

test("zero is zero, never minus zero", () => {
  for (const text of ["0", "0.00", "-0.00", "(0.00)", "0.00-"]) assert.ok(Object.is(parseAmount(text), 0), text);
});

test("the French way, when the file's parser says so", () => {
  assert.equal(parseAmount(`1${nbsp}234,56${nbsp}$`, "CAD", { decimal: "," }), 123456);
  assert.equal(parseAmount(`1${narrow}234,56`, "CAD", { decimal: "," }), 123456);
  assert.equal(parseAmount("1.234,56", "CAD", { decimal: "," }), 123456);
  assert.equal(parseAmount("-12,5", "CAD", { decimal: "," }), -1250);
  // and never by guessing: a comma is not a decimal mark unless the parser says so
  assert.equal(parseAmount("12,50"), null);
  assert.equal(parseAmount("12.50", "CAD", { decimal: "," }), null);
});

test("anything that isn't exactly one amount is refused", () => {
  for (const text of ["", " ", "abc", "12.345", "1,23", "1,2345.00", "1.2.3", "--5", "-(5.00)", "(5.00)-", "-5.00-", "5.", "1e5", "0x10", "12 34", "$", "-", "5.00 CR", "12.50 cad", "１２", "1,234.56 and more", "9".repeat(41)]) {
    assert.equal(parseAmount(text), null, JSON.stringify(text));
  }
  assert.equal(parseAmount("99,999,999,999.99"), 9999999999999);
  assert.equal(parseAmount("100,000,000,000.00"), MAX_MINOR);
  assert.equal(parseAmount("100,000,000,000.01"), null, "past the largest amount taken");
  assert.equal(parseAmount("9999999999999.99"), null);
  assert.equal(parseAmount(undefined as unknown as string), null);
});

test("currencies with no cents, and with three places", () => {
  assert.equal(exponentOf("CAD"), 2);
  assert.equal(exponentOf("JPY"), 0);
  assert.equal(exponentOf("KWD"), 3);
  assert.equal(parseAmount("1,234", "JPY"), 1234);
  assert.equal(parseAmount("12.0", "JPY"), 12);
  assert.equal(parseAmount("12.5", "JPY"), null);
  assert.equal(parseAmount("1.234", "KWD"), 1234);
  assert.equal(toDecimalString(1234, "JPY"), "1234");
  assert.equal(toDecimalString(-1234, "KWD"), "-1.234");
});

test("no fraction ever appears: the classic traps", () => {
  // 0.1 + 0.2 is 0.30000000000000004 in floating point; 1.15 * 100 is 114.99999999999999
  assert.equal(add(parseAmount("0.1")!, parseAmount("0.2")!), parseAmount("0.3"));
  assert.equal(parseAmount("1.15"), 115);
  assert.equal(parseAmount("8.20"), 820);
  assert.equal(parseAmount("1.005"), null);
  assert.equal(total([parseAmount("19.99")!, parseAmount("0.01")!, parseAmount("-20.00")!]), 0);
});

test("written back out, an amount reads back the same", () => {
  assert.equal(toDecimalString(123456), "1234.56");
  assert.equal(toDecimalString(-5), "-0.05");
  assert.equal(toDecimalString(0), "0.00");
  assert.equal(toDecimalString(100), "1.00");
  let seed = 20261118;
  for (let i = 0; i < 2000; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const amount = (seed % 2_000_000_000) - 1_000_000_000;
    assert.equal(parseAmount(toDecimalString(amount)), amount);
  }
});

test("sums refuse to go where they stop being exact", () => {
  assert.equal(total([1, 2, 3]), 6);
  assert.equal(total([]), 0);
  assert.throws(() => add(Number.MAX_SAFE_INTEGER, 1), RangeError);
  assert.throws(() => add(0.5, 1), RangeError);
  assert.throws(() => toDecimalString(1.5), RangeError);
  assert.ok(isMinor(MAX_MINOR) && isMinor(-MAX_MINOR) && isMinor(0));
  for (const bad of [MAX_MINOR + 1, 0.5, NaN, Infinity, "5", null]) assert.ok(!isMinor(bad), String(bad));
});
