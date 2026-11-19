// The recovery code (VAULT-2, VAULT-7): 160 random bits written so that a person can copy them,
// with a check that tells a slip of the pen from a code that isn't the vault's.
import assert from "node:assert/strict";
import test from "node:test";
import { formatRecovery, newRecovery, parseRecovery, readRecovery, RECOVERY_BYTES } from "../src/vault/recovery";

const SHAPE = /^(?:[0-9A-HJKMNP-TV-Z]{4}-){8}[0-9A-HJKMNP-TV-Z]{2}$/;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
// 0x00 0x44 0x32 0x14 0xc7 is 00000 00001 00010 00011 00100 00101 00110 00111 in 5-bit groups: "01234567"
const BYTES = Uint8Array.of(0x00, 0x44, 0x32, 0x14, 0xc7, ...new Uint8Array(15));
const CODE = formatRecovery(BYTES);
const fullWidth = (text: string): string => [...text].map((c) => (c === "-" ? c : String.fromCodePoint(c.codePointAt(0)! + 0xfee0))).join("");

test("written and read back, for any bytes", () => {
  assert.ok(RECOVERY_BYTES * 8 >= 128);
  assert.equal(formatRecovery(new Uint8Array(20)), "0000-0000-0000-0000-0000-0000-0000-0000-00");
  assert.ok(CODE.startsWith("0123-4567-0000-0000-0000-0000-0000-0000-"));
  // the check is the 32 symbols as one base-32 number, modulo 1021, worked out here with big integers
  const expect = (bytes: Uint8Array): string => {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    const rest = Number(n % 1021n);
    return ALPHABET[rest >> 5]! + ALPHABET[rest & 31]!;
  };
  assert.equal(formatRecovery(new Uint8Array(20).fill(255)), `ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-${expect(new Uint8Array(20).fill(255))}`);
  for (let i = 0; i < 500; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const code = formatRecovery(bytes);
    assert.match(code, SHAPE);
    assert.equal(code.slice(-2), expect(bytes));
    assert.deepEqual(parseRecovery(code), bytes);
    assert.deepEqual(readRecovery(code), { ok: true, bytes });
  }
  assert.throws(() => formatRecovery(new Uint8Array(19)), RangeError);
});

test("read the way people copy: any capitals, spaces, dashes, dots or underscores, O for 0, I and L for 1, a Chinese keyboard's full-width characters", () => {
  const bare = CODE.replace(/-/g, "");
  for (const typed of [CODE, bare, CODE.toLowerCase(), CODE.replace(/-/g, " "), CODE.replace(/-/g, String.fromCodePoint(0x2013)), CODE.replace(/-/g, String.fromCodePoint(0x2014)), CODE.replace(/-/g, "_"), CODE.replace(/-/g, "."), CODE.replace(/-/g, " - "), `  ${CODE.slice(0, 20)}\n${CODE.slice(20)}  `, `o${CODE.slice(1)}`, `OI${CODE.slice(2)}`, `0l${CODE.slice(2)}`, fullWidth(CODE), fullWidth(bare), CODE.replace(/-/g, String.fromCodePoint(0x3000))]) {
    assert.deepEqual(parseRecovery(typed), BYTES, typed);
  }
});

test("a slip of the pen, a symbol missing, and something that isn't a code are told apart", () => {
  // any one symbol wrong, anywhere
  const bare = CODE.replace(/-/g, "");
  for (let at = 0; at < bare.length; at++) {
    for (const other of ["2", "7", "B", "Z"]) {
      if (bare[at] === other) continue;
      const typed = bare.slice(0, at) + other + bare.slice(at + 1);
      assert.deepEqual(readRecovery(typed), { ok: false, why: "typo" }, typed);
    }
  }
  // two neighbours swapped
  for (let i = 0; i < 200; i++) {
    const code = newRecovery().code.replace(/-/g, "");
    for (let at = 0; at < 31; at++) {
      if (code[at] === code[at + 1]) continue;
      const swapped = code.slice(0, at) + code[at + 1] + code[at] + code.slice(at + 2);
      assert.deepEqual(readRecovery(swapped), { ok: false, why: "typo" }, swapped);
    }
  }
  // a symbol left out or typed twice, or something much shorter: the reader says how many symbols it saw, so the person can be told
  for (const [typed, symbols] of [[CODE.slice(0, -1), 33], [`${CODE}0`, 35], [CODE.slice(5), 30], ["0123", 4], ["not a recovery code", 16]] as const) {
    assert.deepEqual(readRecovery(typed), { ok: false, why: "wrong-length", symbols }, typed);
    assert.equal(parseRecovery(typed), null);
  }
  // not a code at all: a character no code has (U is the one letter left out), or far too much text
  for (const typed of ["", `U${CODE.slice(1)}`, `${CODE.slice(0, -1)}!`, `${CODE.slice(0, -1)}U`, "x".repeat(201), "not a recovery code at all, just a sentence"]) {
    assert.deepEqual(readRecovery(typed), { ok: false, why: "malformed" }, typed);
    assert.equal(parseRecovery(typed), null);
  }
  assert.deepEqual(readRecovery(undefined as unknown as string), { ok: false, why: "malformed" });
});

test("letters of other alphabets are not quietly read as ours", () => {
  // a dotless i would capitalize to I, and so to 1: it is not a symbol of the code, and neither is an accented letter
  for (const stray of [String.fromCodePoint(0x131), String.fromCodePoint(0xe9), `1${String.fromCodePoint(0x301)}`, String.fromCodePoint(0x4e00)]) {
    assert.deepEqual(readRecovery(stray.repeat(34)), { ok: false, why: "malformed" }, stray);
    assert.deepEqual(readRecovery(`${stray}${CODE.slice(1)}`), { ok: false, why: "malformed" }, stray);
  }
  // compatibility forms of our own letters fold to them, like the full-width ones: the Kelvin sign is K, the long s is S
  let code = newRecovery().code;
  while (!code.includes("K") || !code.includes("S")) code = newRecovery().code;
  assert.deepEqual(parseRecovery(code.replace(/K/g, String.fromCodePoint(0x212a)).replace(/S/g, String.fromCodePoint(0x17f))), parseRecovery(code));
});

test("a new code is new every time", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const { code, bytes } = newRecovery();
    assert.equal(bytes.length, 20);
    assert.equal(code, formatRecovery(bytes));
    seen.add(code);
  }
  assert.equal(seen.size, 1000);
});
