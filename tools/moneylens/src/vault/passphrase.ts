/**
 * Is a passphrase strong enough to guard a vault (VAULT-7)? The stored, wrapped vault key can be
 * attacked offline by anyone who gets a copy of it: the slow key derivation makes each guess cost
 * the same as it costs the user, and this check keeps out the passphrases an attacker tries first.
 *
 * It is a floor, not a meter. It refuses what is short, what is a pattern (one character, a short
 * piece repeated, a run along the keyboard or the alphabet), and what is a well-known password with
 * digits or marks stuck on. Anything else is accepted without a score: a score would suggest more
 * than a rule like this can know.
 */

/** The fewest characters: 12, or 8 when at least four of them are outside ASCII (a phrase in Chinese says more per character). */
export const MIN_LENGTH = 12;
export const MIN_LENGTH_WIDE = 8;
/** The longest taken, so that a pasted file can't be made into a passphrase by accident. */
export const MAX_LENGTH = 256;

export type Weak = "too-short" | "too-long" | "pattern" | "common";

/** A passphrase as it is used: width and composed forms folded (NFKC), and no space at either end, so that it is the same bytes on every device and keyboard. */
export const normalizePassphrase = (text: string): string => text.normalize("NFKC").trim();

// Passwords and pieces of them that attackers try first, whatever digits or marks are added. All
// lowercase, letters and digits only. Kept short on purpose: almost everything on the long public
// lists is already refused for being under twelve characters.
const COMMON = new Set([
  "password", "passw0rd", "p4ssw0rd", "pa55word", "passwort", "password1", "mypassword", "secret", "letmein", "welcome", "welcome1", "admin", "administrator", "login",
  "master", "root", "user", "guest", "default", "changeme", "qwerty", "qwertyuiop", "qwertz", "azerty", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm", "qazwsx", "qazwsxedc",
  "1qaz2wsx", "1q2w3e", "1q2w3e4r", "1q2w3e4r5t", "q1w2e3r4", "q1w2e3r4t5", "abc", "abcd", "abcdef", "abcdefg", "abcdefgh", "abc123", "a1b2c3", "a1b2c3d4", "iloveyou",
  "iloveu", "loveyou", "lovely", "sunshine", "princess", "monkey", "dragon", "football", "baseball", "basketball", "hockey", "soccer", "superman", "batman", "starwars",
  "pokemon", "whatever", "trustno1", "freedom", "shadow", "michael", "jennifer", "jordan", "hunter", "ranger", "buster", "thomas", "robert", "daniel", "ashley", "charlie",
  "computer", "internet", "google", "samsung", "iphone", "android", "money", "moneylens", "changle", "changleca", "vancouver", "canada", "canucks", "banking", "finance",
  "woaini", "woaini1314", "5201314", "1314520", "aini1314", "woshishui", "nihao", "nihaoma", "mima", "wodemima", "zhang", "wang", "aaa", "test", "testing", "temp",
  "correcthorsebatterystaple", "thequickbrownfox", "letmeinplease", "opensesame", "passphrase", "mypassphrase", "newpassword", "oldpassword", "password123",
]);

// Runs people type by sliding along the keys or the alphabet.
const RUNS = ["01234567890123456789", "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm", "qwertzuiopasdfghjklyxcvbnm", "1q2w3e4r5t6y7u8i9o0p", "1qaz2wsx3edc4rfv5tgb6yhn7ujm", "qazwsxedcrfvtgbyhnujmikolp"];

/** Is `s` (lowercase) one piece of at most half its length, repeated? "abcabcabcabc", "passwordpassword". */
function repeats(s: string): boolean {
  for (let unit = 1; unit <= s.length / 2; unit++) {
    if (s.length % unit === 0 && s === s.slice(0, unit).repeat(s.length / unit)) return true;
  }
  return false;
}

/** How much of `s` (lowercase) is covered by runs of four or more along a keyboard row or the alphabet, forwards or backwards. */
function runShare(s: string): number {
  let covered = 0;
  let i = 0;
  while (i < s.length) {
    let best = 0;
    for (const run of RUNS) {
      for (const line of [run, [...run].reverse().join("")]) {
        let from = line.indexOf(s[i]!);
        while (from >= 0) {
          let length = 1;
          while (i + length < s.length && from + length < line.length && s[i + length] === line[from + length]) length++;
          if (length > best) best = length;
          from = line.indexOf(s[i]!, from + 1);
        }
      }
    }
    if (best >= 4) {
      covered += best;
      i += best;
    } else i++;
  }
  return covered / s.length;
}

/** What is wrong with a passphrase, or null when it will do. */
export function weakness(text: string): Weak | null {
  const p = normalizePassphrase(text);
  const chars = [...p];
  if (chars.length > MAX_LENGTH) return "too-long";
  const wide = chars.filter((c) => c.codePointAt(0)! > 0x7f).length;
  if (chars.length < (wide >= 4 ? MIN_LENGTH_WIDE : MIN_LENGTH)) return "too-short";
  const lower = p.toLowerCase();
  if (new Set(chars.map((c) => c.toLowerCase())).size < 5 || repeats(lower) || runShare(lower) >= 0.75) return "pattern";
  // a well-known password with digits and marks around it, or several of them stuck together
  const letters = lower.replace(/[^\p{L}\p{N}]/gu, "");
  const core = letters.replace(/^\d+|\d+$/g, "");
  // nothing but digits: a phone number, a date, a card number. Sixteen or more random ones would do.
  if (core === "") return letters.length < 16 ? "pattern" : null;
  if (COMMON.has(letters) || COMMON.has(core) || madeOfCommon(core)) return "common";
  return null;
}

/** Is `s` nothing but well-known passwords (and digits between them) one after another? "qwertypassword", "iloveyou2monkey". */
function madeOfCommon(s: string): boolean {
  // works[i]: can s from i to the end be cut into well-known passwords and digits? Filled from the end.
  const works: boolean[] = new Array<boolean>(s.length + 1).fill(false);
  works[s.length] = true;
  for (let i = s.length - 1; i >= 0; i--) {
    if (/\d/.test(s[i]!)) {
      works[i] = works[i + 1]!;
      continue;
    }
    for (let length = 3; length <= 25 && i + length <= s.length && !works[i]; length++) {
      if (works[i + length] && COMMON.has(s.slice(i, i + length))) works[i] = true;
    }
  }
  return works[0]!;
}
