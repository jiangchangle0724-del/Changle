// VAULT-7: the floor a passphrase has to clear before it may guard a vault (T-25).
import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LENGTH, normalizePassphrase, weakness } from "../src/vault/passphrase";

test("passphrases that will do", () => {
  for (const p of ["tidal marmot quartz lantern", "violet anchor nineteen cedar", "Tr0ub4dor&3xyz", "my cat ate 3 purple socks", "我家楼下的面馆叫老王", "温哥华的雨下了一整个十一月", "j7#Qp2!vLx9@", "4829103756281947", "ILoveYouForever"]) {
    assert.equal(weakness(p), null, p);
  }
});

test("too short, by the count for its script", () => {
  for (const p of ["", "short", "elevenchars", "我的密码", "面馆老王a1!"]) assert.equal(weakness(p), "too-short", p);
  assert.equal(weakness("twelve chars"), null);
  assert.equal(weakness("老王面馆在楼下呀"), null, "eight characters of Chinese");
  assert.equal(weakness("x".repeat(MAX_LENGTH + 1)), "too-long");
});

test("patterns: one character, a piece repeated, a slide along the keys, only digits", () => {
  for (const p of ["aaaaaaaaaaaa", "aaaaaaaaaaab", "abcabcabcabc", "passwordpassword", "qwertyuiop12", "qwertyuiopasdfghjkl", "123456789012", "abcdefghijkl", "0987654321098", "zyxwvutsrqpo", "1q2w3e4r5t6y", "1qaz2wsx3edc", "!@#$%^&*()_+", "604-555-1234-9", "2026-11-19-00", "哈哈哈哈哈哈哈哈"]) {
    assert.equal(weakness(p), "pattern", p);
  }
});

test("well-known passwords, whatever digits and marks are stuck on, or stuck together", () => {
  for (const p of ["password1234", "Password!2026", "P@ssw0rd-2026".replace("@", "a"), "iloveyou1234", "sunshine2026!", "qwerty-monkey", "Welcome-Admin1", "letmein-letmein!", "correct horse battery staple", "moneylens2026", "changle.ca2026", "woaini1314520", "2026iloveyou2026"]) {
    assert.equal(weakness(p), "common", p);
  }
});

test("the same passphrase on every keyboard", () => {
  assert.equal(normalizePassphrase("  tidal marmot \n"), "tidal marmot");
  assert.equal(normalizePassphrase("ｔｉｄａｌ"), "tidal");
  assert.equal(normalizePassphrase("tidal  marmot"), "tidal  marmot", "spaces inside are the user's own");
  // é typed as one character or as e plus an accent
  assert.equal(normalizePassphrase("café"), normalizePassphrase("café"));
});
