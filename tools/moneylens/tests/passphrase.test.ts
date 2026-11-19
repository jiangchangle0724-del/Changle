// VAULT-7: the floor a passphrase has to clear before it may guard a vault (T-25), and the
// normalization that makes the same keys pressed on any device give the same passphrase.
import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LENGTH, normalizePassphrase, weakness } from "../src/vault/passphrase";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

test("passphrases that will do", () => {
  for (const p of [
    "tidal marmot quartz lantern",
    "violet anchor nineteen cedar",
    "harbour seal eleven maples",
    "my cat ate 3 purple socks",
    "my password is purple monkey dishwasher",
    "tidalmarmotquartzlantern",
    "Tr0ub4dor&3xyz",
    "j7#Qp2!vLx9@",
    "kX9#mP2$vL5@",
    "我家楼下的面馆叫老王",
    "温哥华的雨下了一整个十一月",
    "老王面馆在楼下呀",
    "面馆老王 tidal 42",
  ]) {
    assert.equal(weakness(p), null, p);
  }
});

test("too short, by the count for its script; the shorter count is only for Chinese, Japanese and Korean", () => {
  for (const p of ["", "short", "elevenchars", "我的密码", "面馆老王a1!", "€£¥¢pass", "éàüöabcd", `${cp(0x1f600, 0x1f601, 0x1f602, 0x1f923)}love`, "ÀÉÎÕÜàéîõü1"]) assert.equal(weakness(p), "too-short", p);
  assert.equal(weakness("老王面馆在楼下呀"), null, "eight characters of Chinese");
  assert.equal(weakness("にほんごのあいことば"), null, "kana");
  assert.equal(weakness("x".repeat(MAX_LENGTH + 1)), "too-long");
  assert.equal(weakness("tidal marmot ".repeat(100)), "too-long");
  // far too long is refused before any work is done on it
  const started = Date.now();
  assert.equal(weakness(cp(0xfdfa).repeat(1_000_000)), "too-long");
  assert.ok(Date.now() - started < 200);
  assert.equal(weakness(undefined as unknown as string), "too-long");
});

test("patterns: one character, a piece repeated, a slide along the keys or the numerals, nothing but digits", () => {
  for (const p of [
    "aaaaaaaaaaaa",
    "aaaaaaaaaaab",
    "abcabcabcabc",
    "passwordpassword",
    "qwertyuiop12",
    "qwertyuiopasdfghjkl",
    "123456789012",
    "abcdefghijkl",
    "0987654321098",
    "zyxwvutsrqpo",
    "1q2w3e4r5t6y",
    "1qaz2wsx3edc",
    "!@#$%^&*()_+",
    "604-555-1234-9",
    "2026-11-19-00",
    "6045551234199001",
    "4829103756281947",
    "哈哈哈哈哈哈哈哈",
    "一二三四五六七八",
    "12345678一二三四",
    "壹贰叁肆伍陆柒捌",
    "九八七六五四三二一",
  ]) {
    assert.equal(weakness(p), "pattern", p);
  }
});

test("well-known passwords: with digits and marks stuck on, with look-alike letters, backwards, in Chinese, or several together", () => {
  for (const p of [
    "password1234",
    "Password!2026",
    "P@ssw0rd-2026",
    "P@ssw0rd2026!",
    "P@ssword2026",
    "Pa$$w0rd2026",
    "Pa$$word2026",
    "p4ssw0rd!!2026",
    "iloveyou1234",
    "1L0veY0u-2026",
    "sunshine2026!",
    "Summer2026!!",
    "Hello123456!",
    "Asdf1234!!!!",
    "drowssap1234",
    "!!!!!!!!passwrd1",
    "ÀÀÀÀpassword",
    "pässwörd-2026",
    "qwerty-monkey",
    "Welcome-Admin1",
    "letmein-letmein!",
    "correct horse battery staple",
    "welcome to canada vancouver",
    "moneylens2026",
    "changle.ca2026",
    "woaini1314520",
    "2026iloveyou2026",
    "我爱你我爱你一生一世",
    "一生一世我爱你呀",
    "恭喜发财万事如意",
  ]) {
    assert.equal(weakness(p), "common", p);
  }
});

test("a word or two with digits and marks is not a passphrase", () => {
  for (const p of ["Maplewood2026!!", "twelve chars", "blue sky 2026", "correct-horse", "ILoveYouForever", "Burnaby#604#BC", "xkqzvwpmtrhs"]) assert.equal(weakness(p), "few-words", p);
  // the same shape is fine once it is long, or has three words
  assert.equal(weakness("maplewood ravine in november"), null);
  assert.equal(weakness("maplewoodravinenovember"), null);
});

test("the same passphrase from every keyboard", () => {
  const same = (a: string, b: string) => assert.equal(normalizePassphrase(a), normalizePassphrase(b), `${JSON.stringify(a)} and ${JSON.stringify(b)}`);
  // a phone's smart punctuation
  same("don't stop", `don${cp(0x2019)}t stop`);
  same('say "hi" twice', `say ${cp(0x201c)}hi${cp(0x201d)} twice`);
  same("wait--what", `wait${cp(0x2014)}what`);
  same("wait...what", `wait${cp(0x2026)}what`);
  same("a-b", `a${cp(0x2013)}b`);
  same("a-b", `a${cp(0x2212)}b`);
  // an emoji with and without its variation selector
  same(cp(0x2764), cp(0x2764, 0xfe0f));
  // a Chinese keyboard: full-width letters and marks, the ideographic full stop and space
  same("tidal, 42.", `${cp(0xff54, 0xff49, 0xff44, 0xff41, 0xff4c, 0xff0c)} ${cp(0xff14, 0xff12, 0x3002)}`);
  same("a b", `a${cp(0x3000)}b`);
  // spaces: at the ends, doubled, or the kind that doesn't break
  same("tidal marmot", "  tidal   marmot \n");
  same("tidal marmot", `tidal${cp(0xa0)}marmot`);
  // one character, or a letter and its accent
  same(cp(0xe9), `e${cp(0x301)}`);
  // and what stays different: capitals, and which words
  assert.notEqual(normalizePassphrase("Tidal marmot"), normalizePassphrase("tidal marmot"));
  assert.notEqual(normalizePassphrase("tidalmarmot"), normalizePassphrase("tidal marmot"));
  assert.equal(normalizePassphrase(`  ${cp(0xff34)}idal  marmot${cp(0x3002)} `), "Tidal marmot.");
});

test("the check takes a moment even on the worst input of its longest length", () => {
  const started = Date.now();
  for (const p of ["a1".repeat(128), "password".repeat(32), "qwerty12345".repeat(23), "我爱你".repeat(85), "@".repeat(256), "abc ".repeat(64)]) weakness(p);
  assert.ok(Date.now() - started < 1000);
});
