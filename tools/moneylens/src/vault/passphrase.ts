/**
 * Is a passphrase strong enough to guard a vault (VAULT-7)? The stored, wrapped vault key can be
 * attacked offline by anyone who gets a copy of it: the slow key derivation makes each guess cost
 * the same as it costs the user, and this check keeps out the passphrases an attacker tries first.
 *
 * It is a floor, not a meter. It refuses what is short; what is a pattern (one character, a short
 * piece repeated, a run along the keyboard, the alphabet or the Chinese numerals, nothing but
 * digits); what is mostly well-known passwords, whatever digits and marks are stuck on, whether
 * letters were swapped for look-alikes ("p@ssw0rd") or written backwards; and what is only a word
 * or two with digits and marks ("Summer2026!!"). Anything else is accepted without a score: a
 * score would suggest more than a rule like this can know.
 *
 * `normalizePassphrase` is part of how the key is made (crypto.ts). Changing what it folds would
 * lock out everyone whose passphrase the change touches, so it is pinned by a test with a stored
 * vault (tests/golden.ts) and must only ever fold more with a new wrapper version.
 */

/** The fewest characters: 12, or 8 when at least four of them are Chinese, Japanese or Korean (a phrase in those says more per character). */
export const MIN_LENGTH = 12;
export const MIN_LENGTH_WIDE = 8;
/** The longest taken, so that a pasted file can't be made into a passphrase by accident. */
export const MAX_LENGTH = 256;
/** Under this length a passphrase needs at least three runs of letters (three words, or letters broken up by digits and marks). */
const FEW_WORDS_BELOW = 20;

export type Weak = "too-short" | "too-long" | "pattern" | "common" | "few-words";

/**
 * A passphrase as it is used, so that the same keys pressed on any device give the same bytes.
 * Phones and Chinese keyboards rewrite what is typed: straight quotes become curly, two hyphens
 * become a dash, a full stop becomes an ideographic one, letters come out full-width, an emoji
 * gains or loses its variation selector. All of those are folded back; then compatibility forms
 * (NFKC), runs of spaces to one space, and no space at either end. Capitals are kept: they are
 * the user's own.
 */
export function normalizePassphrase(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/[\u2014\u2015]/g, "--")
    .replace(/[\u2010\u2011\u2012\u2013\u2212]/g, "-")
    .replace(/\u3002/g, ".")
    .replace(/[\ufe00-\ufe0f\u200b\u00ad\ufeff]/g, "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

// Passwords and pieces of them that attackers try first. All lowercase, letters and digits only.
// Kept short on purpose: almost everything on the long public lists is already refused for being
// under twelve characters, or for being one word with digits and marks.
const COMMON = new Set([
  "password", "passw0rd", "passwrd", "pasword", "passwd", "pass", "passwort", "password1", "mypassword", "secret", "letmein", "welcome", "welcome1", "admin", "administrator",
  "login", "master", "root", "user", "guest", "default", "changeme", "hello", "hellothere", "qwerty", "qwertyuiop", "qwertz", "azerty", "asdf", "asdfgh", "asdfghjkl", "zxcvbn",
  "zxcvbnm", "qazwsx", "qazwsxedc", "1qaz2wsx", "1q2w3e", "1q2w3e4r", "1q2w3e4r5t", "q1w2e3r4", "q1w2e3r4t5", "abc", "abcd", "abcdef", "abcdefg", "abcdefgh", "abc123", "a1b2c3",
  "a1b2c3d4", "iloveyou", "iloveu", "loveyou", "loveme", "love", "lovely", "sunshine", "princess", "monkey", "dragon", "football", "baseball", "basketball", "hockey", "soccer",
  "superman", "batman", "starwars", "pokemon", "whatever", "trustno1", "freedom", "shadow", "michael", "jennifer", "jordan", "hunter", "ranger", "buster", "thomas", "robert",
  "daniel", "ashley", "charlie", "killer", "hacker", "ninja", "mustang", "access", "flower", "angel", "baby", "computer", "internet", "google", "samsung", "iphone", "android",
  "money", "moneylens", "changle", "changleca", "vancouver", "canada", "canucks", "banking", "finance", "spring", "summer", "autumn", "fall", "winter", "january", "february",
  "march", "april", "june", "july", "august", "september", "october", "november", "december", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "woaini", "woaini1314", "5201314", "1314520", "aini1314", "aini", "woshishui", "nihao", "nihaoma", "mima", "wodemima", "baobei", "laopo", "laogong", "zhongguo", "beijing",
  "shanghai", "zhang", "wang", "aaa", "test", "testing", "temp", "correcthorsebatterystaple", "thequickbrownfox", "letmeinplease", "opensesame", "passphrase", "mypassphrase",
  "newpassword", "oldpassword", "password123",
  "我爱你", "爱你", "我想你", "永远爱你", "爱你一万年", "老婆我爱你", "老公我爱你", "一生一世", "一路平安", "一帆风顺", "万事如意", "恭喜发财", "大吉大利", "财源广进", "新年快乐", "生日快乐",
  "天天开心", "身体健康", "心想事成", "平安喜乐", "岁月静好", "密码", "我的密码", "没有密码", "你好", "你好吗", "你是谁", "我是谁", "不知道", "加油", "芝麻开门", "阿弥陀佛", "上帝保佑", "宝贝",
  "亲爱的", "哈哈哈", "呵呵呵", "中国", "北京", "上海", "温哥华", "加拿大", "常乐",
]);

// Runs people type by sliding along the keys, the alphabet, or the numerals.
const RUNS = [
  "01234567890123456789",
  "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",
  "qwertyuiopasdfghjklzxcvbnm",
  "qwertzuiopasdfghjklyxcvbnm",
  "1q2w3e4r5t6y7u8i9o0p",
  "1qaz2wsx3edc4rfv5tgb6yhn7ujm",
  "qazwsxedcrfvtgbyhnujmikolp",
  "零一二三四五六七八九十百千万",
  "壹贰叁肆伍陆柒捌玖拾佰仟",
  "壹貳參肆伍陸柒捌玖拾",
  "甲乙丙丁戊己庚辛壬癸",
  "子丑寅卯辰巳午未申酉戌亥",
];

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Is `s` (lowercase) one piece of at most half its length, repeated? "abcabcabcabc", "passwordpassword". */
function repeats(s: string): boolean {
  for (let unit = 1; unit <= s.length / 2; unit++) {
    if (s.length % unit === 0 && s === s.slice(0, unit).repeat(s.length / unit)) return true;
  }
  return false;
}

/** How much of `chars` (lowercase) is covered by runs of four or more along a keyboard row, the alphabet or the numerals, forwards or backwards. */
function runShare(chars: readonly string[]): number {
  let covered = 0;
  let i = 0;
  while (i < chars.length) {
    let best = 0;
    for (const run of RUNS) {
      const forwards = [...run];
      for (const line of [forwards, [...forwards].reverse()]) {
        let from = line.indexOf(chars[i]!);
        while (from >= 0) {
          let length = 1;
          while (i + length < chars.length && from + length < line.length && chars[i + length] === line[from + length]) length++;
          if (length > best) best = length;
          from = line.indexOf(chars[i]!, from + 1);
        }
      }
    }
    if (best >= 4) {
      covered += best;
      i += best;
    } else i++;
  }
  return covered / chars.length;
}

/** How much of `s` (lowercase letters and digits) is well-known passwords, with the digits between them counted in. "iloveyou2monkey" is all of it. */
function commonShare(s: string): number {
  const chars = [...s];
  if (chars.length === 0) return 0;
  // best[i]: the most characters from i to the end that well-known passwords and digits can cover. Filled from the end.
  const best: number[] = new Array<number>(chars.length + 1).fill(0);
  for (let i = chars.length - 1; i >= 0; i--) {
    best[i] = best[i + 1]! + (/\d/.test(chars[i]!) ? 1 : 0);
    for (let length = 2; length <= 25 && i + length <= chars.length; length++) {
      if (COMMON.has(chars.slice(i, i + length).join(""))) best[i] = Math.max(best[i]!, length + best[i + length]!);
    }
  }
  return best[0]! / chars.length;
}

const LOOKALIKES: Readonly<Record<string, string>> = { "@": "a", "4": "a", "3": "e", "!": "i", "0": "o", $: "s", "5": "s", "7": "t", "+": "t" };

/** `s` with look-alike digits and marks turned back into the letters they stand for; "1" as "i" or as "l". */
const unleet = (s: string, one: "i" | "l"): string => s.replace(/[@43!0$57+1]/g, (c) => (c === "1" ? one : LOOKALIKES[c]!));

/** Is this text (lowercase, accents off) mostly well-known passwords? Or nothing but digits and marks ("pattern")? */
function knownAs(form: string): Weak | null {
  const letters = form.replace(/[^\p{L}\p{N}]/gu, "");
  if (!/\p{L}/u.test(letters)) return "pattern";
  const core = letters.replace(/^\d+|\d+$/g, "");
  const backwards = [...core].reverse().join("");
  if (COMMON.has(letters) || COMMON.has(core) || COMMON.has(backwards) || commonShare(core) >= 0.75 || commonShare(backwards) >= 0.75) return "common";
  return null;
}

/** What is wrong with a passphrase, or null when it will do. */
export function weakness(text: string): Weak | null {
  if (typeof text !== "string" || text.length > 4 * MAX_LENGTH) return "too-long";
  const p = normalizePassphrase(text);
  const chars = [...p];
  if (chars.length > MAX_LENGTH) return "too-long";
  const wide = chars.filter((c) => CJK.test(c)).length >= 4;
  if (chars.length < (wide ? MIN_LENGTH_WIDE : MIN_LENGTH)) return "too-short";
  const lower = p.toLowerCase();
  const lowerChars = [...lower];
  if (new Set(lowerChars).size < 5 || repeats(lower) || runShare(lowerChars) >= 0.75) return "pattern";
  // accents off, so that "pàssword" is looked up as "password"
  const plain = lower.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  // nothing but digits and marks is a pattern; then well-known passwords, as typed and with look-alikes turned back
  for (const form of new Set([plain, unleet(plain, "i"), unleet(plain, "l")])) {
    const known = knownAs(form);
    if (known === "common" || (known === "pattern" && form === plain)) return known;
  }
  // one or two words with digits and marks: the shape attackers' rules are built for
  if (!wide && chars.length < FEW_WORDS_BELOW && (plain.match(/\p{L}+/gu) ?? []).length < 3) return "few-words";
  return null;
}
