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
    "red fox jumps high",
    // what a password generator makes
    "j7#Qp2!vLx9@",
    "kX9#mP2$vL5@",
    "xkqzvwpmtrhs",
    "a8Kd92LmQx7p",
    "Vq3mZx8Lw2Rt9KpB",
    "kq7xw2mpdz9bht",
    "48291037562819470355",
    "3fa9c0de4b1e7a2d",
    "f47ac10b-58cc-4372",
    "8k92a81736b455",
    "nyJmuz-9vurce-xyqxyw",
    "Unfasten-Drab-Jawless7",
    // pinyin, a word at a time
    "wo de mao hen pang",
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

test("patterns: one character, a piece repeated, a slide along the keys or the numerals, nothing but digits, one long number", () => {
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
    // a date or a phone number with initials or a mark around it
    "wxm198812120",
    "wxm19881212!",
    "ab1990061512",
    "k9281736455z",
    "+16045551234x",
    "1qaz@WSX3edc$RFV",
    "!QAZ@WSX#EDC$RFV",
    "a1b2c3d4e5f6g7h8",
    "z9y8x7w6v5u4",
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
    "ILoveYouForever",
    "Iloveyoumorethanever",
    "Tr0ub4dor&3xyz",
    "ManchesterUnited99!!",
    "Manchester United 1999",
    "Jesus loves me 777",
    "spring summer autumn winter",
  ]) {
    assert.equal(weakness(p), "common", p);
  }
});

test("a word or two with digits and marks is not a passphrase", () => {
  for (const p of [
    "Maplewood2026!!",
    "twelve chars",
    "Tidal marmot 42",
    "TidalMarmot#42",
    "correct-horse",
    "Burnaby#604#BC",
    "Elephant#77#Q",
    "ELEPHANT#77#Q",
    "Kelowna19900615",
    "Tom19900615!!",
    "tidalmarmot2026",
    "congratulations1!",
    // look-alikes inside the word
    "M4plew00d2026!!",
    "M4PLEW00D2026!!",
    "El3phant!2030!!",
    // pinyin: a name and a year, two words
    "liuyang20260101",
    "wangxiaoming88",
    "Zhang-Xiaojun-90",
    "Qingdao@1987#",
    "xuexi2026jiayou",
  ]) {
    assert.equal(weakness(p), "few-words", p);
  }
  // the same shape is fine once it is long, or has three words: spaced, run together with capitals, or joined by marks that could be letters
  for (const p of ["maplewood ravine in november", "maplewoodravinenovember", "maple ravine frost", "MapleRavineFrost1", "maple+ravine+frost", "maple!ravine!frost", "sun4moon7star9x"]) assert.equal(weakness(p), null, p);
  // a third run of three letters or more counts when the words are counted, even when the check doesn't know it for a word
  for (const p of ["window garden sky", "nth marble anchors", "psst marble anchors"]) assert.equal(weakness(p), null, p);
});

test("what the floor misses: a word it doesn't know for a word", () => {
  // "sky" and "fox" end in letter pairs that are rare in English, and a short word gets no allowance: each of these counts as one word and some other letters
  for (const p of ["blue sky 2026", "red fox 2026!!", "happy sky 2026"]) assert.equal(weakness(p), null, p);
});

// A small generator of its own, so that the same strings are tried on every run.
function dice(seed: number): (n: number) => number {
  let state = seed;
  return (n) => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return Math.floor((state / 4294967296) * n);
  };
}

test("generated passwords are let through: their letters don't read as words", () => {
  const next = dice(20261119);
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = lower.toUpperCase();
  const digits = "0123456789";
  const alnum = `${lower}${upper}${digits}`;
  const printable = `${alnum}!@#$%^&*()-_=+[]{};:,.<>/?`;
  // the share refused of 2,000 of each kind, held under a limit; what was measured over 20,000 of each is in docs/moneylens/security-assessment.md, 1.4
  const kinds: [string, string, number, number][] = [
    ["16 letters and digits", alnum, 16, 0.005],
    ["12 letters and digits", alnum, 12, 0.01],
    ["12 letters, digits and marks", printable, 12, 0.01],
    ["15 lowercase letters", lower, 15, 0.015],
    ["20 digits", digits, 20, 0.005],
    // the hard cases: one case of letters with digits leaves runs long enough to read as words now and then
    ["14 lowercase letters and digits", `${lower}${digits}`, 14, 0.06],
    ["12 capitals and digits", `${upper}${digits}`, 12, 0.08],
    // and sixteen hexadecimal digits: "bad", "fed" and "cafe" are words, and more than half of it is digits
    ["16 hexadecimal digits", "0123456789abcdef", 16, 0.12],
  ];
  for (const [name, alphabet, length, limit] of kinds) {
    let refused = 0;
    for (let i = 0; i < 2000; i++) if (weakness(Array.from({ length }, () => alphabet[next(alphabet.length)]!).join("")) !== null) refused++;
    assert.ok(refused / 2000 < limit, `${name}: ${refused} of 2000 refused`);
  }
});

test("everyday words: one or two with a year are refused, three are let through", () => {
  // ordinary words, none of them on the list of well-known passwords
  const words = (
    "garden window river mountain coffee bridge yellow purple orange silver market doctor kitchen blanket pencil rabbit turtle candle forest island " +
    "harbour violet anchor lantern marble pepper ginger walnut salmon cedar maple ravine frost meadow breeze thunder planet rocket basket button " +
    "carpet mirror ladder hammer bottle pillow tiger eagle cherry lemon"
  ).split(" ");
  const capital = (word: string): string => word[0]!.toUpperCase() + word.slice(1);
  const next = dice(604);
  const pick = (): string => words[next(words.length)]!;
  for (const word of words) assert.equal(weakness(`${capital(word)}2026!!`.padEnd(12, "!")), "few-words", word);
  const shapes: [string, () => string, boolean][] = [
    ["two words and a year", () => `${pick()} ${pick()} 2026`, true],
    ["two words run together, a number and a mark", () => `${capital(pick())}${capital(pick())}99!`, true],
    ["three words", () => `${pick()} ${pick()} ${pick()}`, false],
    ["three words with capitals and hyphens, and a digit", () => `${capital(pick())}-${capital(pick())}-${capital(pick())}7`, false],
  ];
  for (const [name, make, few] of shapes) {
    let tried = 0;
    while (tried < 300) {
      const p = make();
      // under twenty characters, where the rule applies; from twenty on, any of these will do
      if (p.length >= 20) {
        assert.equal(weakness(p), null, p);
        continue;
      }
      tried++;
      assert.equal(weakness(p), few ? "few-words" : null, `${name}: ${p}`);
    }
  }
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
  // forms that only turn into a dash or a full stop once their width is folded: half-width and small ones, the vertical dash
  same("tidal.", `tidal${cp(0xff61)}`);
  same("wait--what", `wait${cp(0xfe58)}what`);
  same("wait--what", `wait${cp(0xfe31)}what`);
  same("a-b", `a${cp(0xff0d)}b`);
  // an ideograph with and without a variation selector, and a zero-width space left in by a copy
  same(cp(0x845b), cp(0x845b, 0xe0100));
  same("tidal marmot", `ti${cp(0x200b)}dal marmot`);
  // and what stays different: capitals, and which words
  assert.notEqual(normalizePassphrase("Tidal marmot"), normalizePassphrase("tidal marmot"));
  assert.notEqual(normalizePassphrase("tidalmarmot"), normalizePassphrase("tidal marmot"));
  assert.equal(normalizePassphrase(`  ${cp(0xff34)}idal  marmot${cp(0x3002)} `), "Tidal marmot.");
});

test("normalizing twice changes nothing more", () => {
  const pool = [0x20, 0x27, 0x22, 0x2d, 0x2e, 0x61, 0x41, 0x31, 0xa0, 0xad, 0xe9, 0x301, 0x2010, 0x2013, 0x2014, 0x2015, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026, 0x2032, 0x2033, 0x200b, 0x2212, 0x3000, 0x3002, 0x4e00, 0x845b, 0xfe0f, 0xfe31, 0xfe58, 0xfeff, 0xff0d, 0xff21, 0xff41, 0xff61, 0x1f600, 0x2764, 0xe0100, 0xfdfa, 0x212a, 0x17f];
  const next = dice(7);
  for (let i = 0; i < 5000; i++) {
    const text = String.fromCodePoint(...Array.from({ length: 1 + next(12) }, () => pool[next(pool.length)]!));
    const once = normalizePassphrase(text);
    assert.equal(normalizePassphrase(once), once, JSON.stringify([...text].map((c) => c.codePointAt(0)!.toString(16))));
  }
});

test("the check takes a moment even on the worst input of its longest length", () => {
  const started = Date.now();
  for (const p of ["a1".repeat(128), "password".repeat(32), "qwerty12345".repeat(23), "我爱你".repeat(85), "@".repeat(256), "abc ".repeat(64)]) weakness(p);
  assert.ok(Date.now() - started < 1000);
});
