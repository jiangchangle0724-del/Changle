// ISO-3: identifiers are 128 random bits; and the URL-safe base64 they (and later the vault's
// keys and chunks) are written in.
import assert from "node:assert/strict";
import test from "node:test";
import { base64url, fromBase64url, isId, newId } from "../src/core/ids";

test("URL-safe base64 agrees with the platform's, both ways, at every length", () => {
  for (let length = 0; length <= 70; length++) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    const text = base64url(bytes);
    assert.equal(text, Buffer.from(bytes).toString("base64url"));
    assert.deepEqual(fromBase64url(text), bytes);
  }
  assert.equal(base64url(Uint8Array.of(0xfb, 0xff, 0xfe)), "-__-");
});

test("what isn't URL-safe base64 is refused, and one value has one spelling", () => {
  for (const bad of ["a", "abcde", "ab=d", "ab+d", "ab/d", "ab d", "é", "abc\n"]) assert.equal(fromBase64url(bad), null, JSON.stringify(bad));
  assert.equal(fromBase64url(undefined as unknown as string), null);
  // "AA" and "AB" would both decode to one zero byte if spare bits were ignored
  assert.deepEqual(fromBase64url("AA"), Uint8Array.of(0));
  assert.equal(fromBase64url("AB"), null);
  assert.equal(fromBase64url("AAB"), null);
  assert.deepEqual(fromBase64url(""), new Uint8Array(0));
});

test("a new identifier: 22 characters, 128 bits, never the same twice", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i++) {
    const id = newId();
    assert.ok(isId(id), id);
    assert.equal(fromBase64url(id)!.length, 16);
    seen.add(id);
  }
  assert.equal(seen.size, 5000);
  // one value, one spelling: the last character carries two bits, so twelve of its sixteen spellings are not identifiers
  assert.ok(isId("AAAAAAAAAAAAAAAAAAAAAA") && isId("AAAAAAAAAAAAAAAAAAAAAQ") && isId("AAAAAAAAAAAAAAAAAAAAAg") && isId("AAAAAAAAAAAAAAAAAAAAAw"));
  assert.ok(!isId("AAAAAAAAAAAAAAAAAAAAAB") && !isId("AAAAAAAAAAAAAAAAAAAAA_"));
  for (const bad of ["", "short", "x".repeat(23), "x".repeat(21) + "!", 22, null]) assert.ok(!isId(bad), String(bad));
});
