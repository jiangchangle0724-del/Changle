// The recovery code (VAULT-2, VAULT-7): 160 random bits written so that a person can copy them.
import assert from "node:assert/strict";
import test from "node:test";
import { formatRecovery, newRecovery, parseRecovery, RECOVERY_BYTES } from "../src/vault/recovery";

test("written and read back, for any bytes", () => {
  assert.equal(RECOVERY_BYTES * 8 >= 128, true);
  assert.equal(formatRecovery(new Uint8Array(20)), "0000-0000-0000-0000-0000-0000-0000-0000");
  assert.equal(formatRecovery(new Uint8Array(20).fill(255)), "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ");
  // 0x00 0x44 0x32 0x14 0xc7 is "00123" + "4567" in 5-bit groups: 00000 00001 00010 00011 00100 00101 00110 00111
  assert.equal(formatRecovery(Uint8Array.of(0x00, 0x44, 0x32, 0x14, 0xc7, ...new Uint8Array(15))), "0123-4567-0000-0000-0000-0000-0000-0000");
  for (let i = 0; i < 500; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const code = formatRecovery(bytes);
    assert.match(code, /^(?:[0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.deepEqual(parseRecovery(code), bytes);
  }
  assert.throws(() => formatRecovery(new Uint8Array(19)), RangeError);
});

test("read the way people copy: any capitals, spaces or dashes, O for 0, I and L for 1", () => {
  const bytes = Uint8Array.of(0x00, 0x44, 0x32, 0x14, 0xc7, ...new Uint8Array(15));
  for (const typed of ["0123-4567-0000-0000-0000-0000-0000-0000", "01234567000000000000000000000000", "o123 4567 oooo OOOO 0000 0000 0000 0000", "OI23-4567-0000-0000-0000-0000-0000-0000", "0l23-4567-0000-0000-0000-0000-0000-0000", "  0123-4567-0000-0000\n0000-0000-0000-0000  "]) {
    assert.deepEqual(parseRecovery(typed), bytes, typed);
  }
});

test("what isn't a whole code is refused", () => {
  for (const typed of ["", "0123", "0123-4567-0000-0000-0000-0000-0000-000", "0123-4567-0000-0000-0000-0000-0000-00000", "U123-4567-0000-0000-0000-0000-0000-0000", "0123-4567-0000-0000-0000-0000-0000-000!", "x".repeat(201)]) {
    assert.equal(parseRecovery(typed), null, typed);
  }
  assert.equal(parseRecovery(undefined as unknown as string), null);
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
