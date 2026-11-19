/**
 * Is a passphrase strong enough to guard a vault (VAULT-7)? The stored, wrapped vault key can be
 * attacked offline by anyone who gets a copy of it: the slow key derivation makes each guess cost
 * the same as it costs the user, and this check keeps out the passphrases an attacker tries first.
 *
 * It is a floor, not a meter. It refuses what is short; what is a pattern (one character, a short
 * piece repeated, a run along the keyboard, the alphabet or the Chinese numerals, nothing but
 * digits, one long number with a little around it); what is mostly well-known passwords, whatever
 * digits and marks are stuck on, whether letters were swapped for look-alikes ("p@ssw0rd") or
 * written backwards; and what is only a word or two with digits and marks ("Maplewood2026!!").
 * Anything else is accepted without a score: a score would suggest more than a rule like this
 * can know.
 *
 * It errs both ways, and is meant to. A password from a generator is let through, because its
 * letters don't read as words; now and then one does by chance and is refused, and the person
 * makes another. A word the check doesn't know for a word ("sky") is not counted as one, so some
 * two-word passphrases get through.
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
/** Under this length, a passphrase that is only one or two words with digits and marks is refused. */
const FEW_WORDS_BELOW = 20;
/** From this many digits, a number is long enough to be a passphrase by itself: picked at random, it takes more guesses than five words from a list of 7,776. */
const MANY_DIGITS = 20;

export type Weak = "too-short" | "too-long" | "pattern" | "common" | "few-words";

/**
 * A passphrase as it is used, so that the same keys pressed on any device give the same bytes.
 * Phones, word processors and Chinese keyboards rewrite what is typed: straight quotes become the
 * quotation marks of the keyboard's language, two or three hyphens become a dash (which dash
 * depends on the app), a full stop becomes an ideographic one, letters come out full-width, an
 * emoji gains or loses its variation selector, and text copied out of a chat or a document brings
 * marks along that nobody sees. All of those are folded back, in this order:
 *
 * 1. compatibility forms (NFKC), so that what they turn into is folded too;
 * 2. characters nobody sees are dropped, and NFKC again, because taking one out can bring a
 *    letter and its accent together;
 * 3. every kind of quotation mark and apostrophe becomes a straight one, a wave dash becomes a
 *    tilde, any dash and any run of dashes or hyphens becomes one hyphen, an ideographic full stop
 *    a period, and the middle dots of the different input methods one middle dot;
 * 4. runs of spaces become one space, and there is none at either end.
 *
 * Capitals are kept: they are the user's own. Doing it twice changes nothing more.
 */
export function normalizePassphrase(text: string): string {
  return (
    text
      .normalize("NFKC")
      // Variation selectors, the soft hyphen, the zero-width space, the word joiner and its invisible
      // neighbours, the byte-order mark, the Mongolian vowel separator, and the marks that say which
      // way text runs. Before the folds, so that two hyphens with one of these between them are a
      // run. The zero-width joiner and non-joiner stay: they hold emoji together and spell words in
      // Persian and the Indic scripts.
      .replace(/[\ufe00-\ufe0f\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\u{e0100}-\u{e01ef}]/gu, "")
      .normalize("NFKC")
      // single: curly, low, the prime, single guillemets, white corner brackets, and the letters some keyboards type for an apostrophe
      .replace(/[\u2018\u2019\u201a\u201b\u2032\u2039\u203a\u300e\u300f\u02bb\u02bc]/g, "'")
      // double: curly, low, guillemets, corner brackets, the double-prime marks of vertical Chinese (NFKC has made a double prime two single ones)
      .replace(/[\u201c\u201d\u201e\u201f\u00ab\u00bb\u300c\u300d\u301d\u301e\u301f]/g, '"')
      // the wave dash a Mac types where Windows types a full-width tilde (which NFKC has made "~")
      .replace(/[\u301c\u3030]/g, "~")
      // hyphens, dashes of every length and the minus sign. A run is one: two hyphens are an em dash on a phone and an en dash in Google Docs, three are an em dash in both
      .replace(/[-\u2010-\u2015\u2212\u2e3a\u2e3b]+/g, "-")
      .replace(/\u3002/g, ".")
      // the dot between the parts of a name: a Japanese keyboard's, and the one some Traditional Chinese ones type
      .replace(/[\u2027\u30fb]/g, "\u00b7")
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Passwords and pieces of them that attackers try first. All lowercase, letters and digits only.
// Kept short on purpose: almost everything on the long public lists is already refused for being
// under twelve characters, or for being one word with digits and marks.
const COMMON = new Set([
  "password", "passw0rd", "passwrd", "pasword", "passwd", "pass", "passwort", "password1", "mypassword", "secret", "letmein", "welcome", "welcome1", "admin", "administrator",
  "login", "master", "root", "user", "guest", "default", "changeme", "hello", "hellothere", "qwerty", "qwertyuiop", "qwertz", "azerty", "asdf", "asdfgh", "asdfghjkl", "zxcvbn",
  "zxcvbnm", "qazwsx", "qazwsxedc", "1qaz2wsx", "1q2w3e", "1q2w3e4r", "1q2w3e4r5t", "q1w2e3r4", "q1w2e3r4t5", "abc", "abcd", "abcdef", "abcdefg", "abcdefgh", "abc123", "a1b2c3",
  "a1b2c3d4", "iloveyou", "iloveu", "loveyou", "loveme", "love", "lovely", "sunshine", "princess", "monkey", "dragon", "football", "baseball", "basketball", "hockey", "soccer",
  "superman", "batman", "spiderman", "ironman", "starwars", "darthvader", "skywalker", "pokemon", "pikachu", "dragonball", "dragonballz", "naruto", "minecraft", "harrypotter", "hellokitty", "whatever", "trustno1", "freedom", "shadow", "michael", "jennifer", "jordan", "hunter", "ranger", "buster", "thomas", "robert",
  "daniel", "ashley", "charlie", "killer", "hacker", "ninja", "mustang", "access", "flower", "angel", "baby", "computer", "internet", "google", "samsung", "iphone", "android",
  "money", "moneylens", "changle", "changleca", "vancouver", "canada", "canucks", "banking", "finance", "spring", "summer", "autumn", "fall", "winter", "january", "february",
  "march", "april", "june", "july", "august", "september", "october", "november", "december", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "woaini", "woaini1314", "5201314", "1314520", "aini1314", "aini", "woshishui", "nihao", "nihaoma", "mima", "wodemima", "baobei", "laopo", "laogong", "zhongguo", "beijing",
  "shanghai", "zhang", "wang", "aaa", "test", "testing", "temp", "correcthorsebatterystaple", "thequickbrownfox", "letmeinplease", "opensesame", "passphrase", "mypassphrase",
  "newpassword", "oldpassword", "password123", "troubador", "troubadour", "forever", "always", "ever", "never", "morethan", "somuch", "verymuch", "mylove", "jesus", "christ", "godisgood",
  "blessed", "manchester", "united",
  "manchesterunited", "liverpool", "arsenal", "chelsea", "barcelona", "realmadrid", "juventus", "lakers", "yankees", "cowboys", "raptors", "bluejays", "mapleleafs",
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

// The marks on the digit keys of a US keyboard, so that a slide typed with Shift held ("!QAZ@WSX") is still seen as one.
const SHIFTED = "!@#$%^&*()";
const unshift = (chars: readonly string[]): string[] => chars.map((c) => (SHIFTED.includes(c) ? "1234567890"[SHIFTED.indexOf(c)]! : c));

/** Is `s` (lowercase) one piece of at most half its length, repeated? "abcabcabcabc", "passwordpassword". */
function repeats(s: string): boolean {
  for (let unit = 1; unit <= s.length / 2; unit++) {
    if (s.length % unit === 0 && s === s.slice(0, unit).repeat(s.length / unit)) return true;
  }
  return false;
}

/**
 * How much of `chars` (lowercase) is covered by runs of three or more along a keyboard row, the
 * alphabet or the numerals, forwards or backwards. Three, because the commonest of these are
 * typed three keys at a time ("123qweasdzxc"); ordinary words have such a piece now and then
 * ("first", "student"), which is why it takes three quarters of a passphrase to make a pattern.
 */
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
    if (best >= 3) {
      covered += best;
      i += best;
    } else i++;
  }
  return covered / chars.length;
}

/** Is it a slide along the keys or the alphabet: as typed, with Shift held on the digit keys, or as two slides typed turn about ("a1b2c3d4")? */
function slides(chars: readonly string[]): boolean {
  const plain = unshift(chars);
  if (runShare(chars) >= 0.75 || runShare(plain) >= 0.75) return true;
  const [even, odd] = [plain.filter((_, i) => i % 2 === 0), plain.filter((_, i) => i % 2 === 1)];
  return even.length >= 4 && odd.length >= 4 && runShare(even) >= 0.75 && runShare(odd) >= 0.75;
}

/**
 * How much of `s` (lowercase letters and digits) is well-known passwords, with the digits around
 * and between them counted in: "iloveyou2monkey" is all of it. Nothing when no well-known
 * password is in it at all, however many digits there are.
 */
function commonShare(s: string): number {
  const chars = [...s];
  // From i to the end, the most characters that can be covered: `digits[i]` by digits alone,
  // `best[i]` by digits and at least one well-known password (-1 when none fits). Filled from the end.
  const digits: number[] = new Array<number>(chars.length + 1).fill(0);
  const best: number[] = new Array<number>(chars.length + 1).fill(-1);
  for (let i = chars.length - 1; i >= 0; i--) {
    const digit = /\d/.test(chars[i]!) ? 1 : 0;
    digits[i] = digits[i + 1]! + digit;
    if (best[i + 1]! >= 0) best[i] = best[i + 1]! + digit;
    for (let length = 2; length <= 25 && i + length <= chars.length; length++) {
      if (COMMON.has(chars.slice(i, i + length).join(""))) best[i] = Math.max(best[i]!, length + Math.max(best[i + length]!, digits[i + length]!));
    }
  }
  return chars.length === 0 || best[0]! < 0 ? 0 : best[0]! / chars.length;
}

const LOOKALIKES: Readonly<Record<string, string>> = { "@": "a", "4": "a", "3": "e", "!": "i", "0": "o", $: "s", "5": "s", "7": "t", "+": "t" };

/** `s` with look-alike digits and marks turned back into the letters they stand for; "1" as "i" or as "l". */
const unleet = (s: string, one: "i" | "l"): string => s.replace(/[@43!0$57+1]/g, (c) => (c === "1" ? one : LOOKALIKES[c]!));

/** Is this text (lowercase, accents off) mostly well-known passwords? Or digits and marks with no letter, and not many digits: a phone number, a date, a card number ("pattern")? */
function knownAs(form: string): Weak | null {
  const letters = form.replace(/[^\p{L}\p{N}]/gu, "");
  if (!/\p{L}/u.test(letters)) return letters.length < MANY_DIGITS ? "pattern" : null;
  const core = letters.replace(/^\d+|\d+$/g, "");
  const backwards = [...core].reverse().join("");
  // (two thirds of it well-known is enough: "troubador" with a few letters after it)
  if (COMMON.has(letters) || COMMON.has(core) || COMMON.has(backwards) || commonShare(core) * 3 >= 2 || commonShare(backwards) * 3 >= 2) return "common";
  return null;
}

// Which letters commonly follow each letter in English words: the pairs that make up 97% of all
// the letter pairs in 40,000 common English words, and any pair found in five or more of the
// 4,000 commonest. Worked out from the SCOWL word lists (Kevin Atkinson), sizes 10 to 35.
const FOLLOWS: Readonly<Record<string, string>> = {
  a: "bcdfgiklmnprstuvwy", b: "abeijlorstuy", c: "acehiklorstuy", d: "adegilmorsuvy", e: "abcdefghiklmnopqrstvwxy", f: "aefilortuy",
  g: "aeghilnorsuy", h: "aeiortuy", i: "abcdefgklmnoprstvxz", j: "eou", k: "eilns", l: "acdefiklopstuvy", m: "abeimopsuy", n: "acdefgiklnopstuvy",
  o: "abcdefgiklmnoprstuvwy", p: "aehiloprstuy", q: "u", r: "abcdefgiklmnoprstuvwy", s: "acefhiklmnopstuwy", t: "acehilmorstuwy",
  u: "abcdefgilmnoprst", v: "aeio", w: "aehinors", x: "aceipt", y: "eiops", z: "ei",
};

// The syllables of Mandarin as pinyin spells them, by how they begin: a name or a phrase typed
// without tones ("zhangxiaojun") is made of words too. A little generous (it lets "bou" through).
const SYLLABLES = new Set(
  (
    [
      ["", "a o e ai ei ao ou an en ang eng er"],
      ["b p m", "a o e ai ei ao ou an en ang eng i ie iao iu ian in ing u"],
      ["f w", "a o ai ei ou an en ang eng u"],
      ["d t n l", "a e ai ei ao ou an en ang eng ong i ia ie iao iu ian in iang ing u uo ui uan un v ve ue"],
      ["g k h", "a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang"],
      ["j q x", "i ia ie iao iu ian in iang ing iong u ue uan un"],
      ["zh ch sh r z c s", "a e i ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang"],
      ["y", "a o e ao ou an in ang ing ong i u ue uan un"],
    ] as const
  ).flatMap(([starts, ends]) => starts.split(" ").flatMap((start) => ends.split(" ").map((end) => start + end))),
);

/** Can `word` (lowercase) be read as pinyin syllables from end to end? */
function pinyin(word: string): boolean {
  // reach[i]: the first i letters are whole syllables
  const reach: boolean[] = new Array<boolean>(word.length + 1).fill(false);
  reach[0] = true;
  for (let i = 0; i < word.length; i++) {
    if (!reach[i]) continue;
    for (let length = 1; length <= 6 && i + length <= word.length; length++) {
      if (SYLLABLES.has(word.slice(i, i + length))) reach[i + length] = true;
    }
  }
  return reach[word.length]!;
}

/**
 * Does a run of letters (lowercase) read as a word or a name? Three or more letters of the plain
 * alphabet that are pinyin from end to end, or that are built like an English word: a vowel among
 * them (y counts) but not nearly all vowels, never four consonants in a row (th, ch, sh, ck, ph,
 * gh and ng counting as one, as in "birthday"), and each letter followed by one that commonly
 * follows it (one exception from six letters, two from thirteen).
 * Rough on purpose. It has to tell "maplewood" from "xkqzvw", not to know every word: a real
 * word that fails it ("sky", "rhythm") is a "maybe" (fewWords).
 */
function wordlike(word: string): boolean {
  if (!/^[a-z]{3,}$/.test(word)) return false;
  if (pinyin(word)) return true;
  const vowels = word.replace(/[^aeiouy]/g, "").length;
  if (vowels === 0 || vowels * 4 > word.length * 3 || /[^aeiouy]{4}/.test(word.replace(/th|ch|sh|ck|ph|gh|ng/g, "c"))) return false;
  let odd = 0;
  for (let i = 1; i < word.length; i++) if (!FOLLOWS[word[i - 1]!]!.includes(word[i]!)) odd++;
  return odd <= (word.length < 6 ? 0 : word.length < 13 ? 1 : 2);
}

/**
 * `s` with look-alikes turned into the letters they stand for, where a letter follows them
 * (straight away, or after more look-alikes): "M4plew00d2026!!" becomes "Maplewood2026!!", the
 * year and the marks after the word staying as they are. A look-alike takes that letter's case,
 * and every character keeps its place.
 */
function respell(s: string, one: "i" | "l"): string {
  const out = s.split("");
  let ahead = "";
  for (let i = out.length - 1; i >= 0; i--) {
    const c = out[i]!;
    const letter = c === "1" ? one : LOOKALIKES[c];
    if (letter === undefined) ahead = /\p{L}/u.test(c) ? c : "";
    else if (ahead !== "") out[i] = ahead === ahead.toLowerCase() ? letter : letter.toUpperCase();
  }
  return out.join("");
}

/**
 * Is it only a word or two, with digits and marks? The shape attackers' rules are built for: a
 * word from a list, a capital, a year, an exclamation mark.
 *
 * Takes the passphrase as typed (accents off), and again with look-alikes respelled. In each it
 * goes through the runs of letters, a capital inside a run starting a new one ("TidalMarmot" is
 * two). A run that reads as a word is a word; any other run of three letters or more is a maybe,
 * since it may be a word this check doesn't know, or a random part. It is "few" when there are
 * one or two words, no more than two runs counting the maybes, and the words hold at least three
 * quarters of the letters that were typed as letters: what is left is then too little to be a
 * third word or a random part.
 *
 * A respelled run is a word only when it is five letters or more and at least two thirds of it
 * was typed as letters: digits respelled are mostly vowels, and would make words out of anything.
 * Three runs as typed, words or maybes, settle it as not "few" whatever the respelling makes of
 * them ("maple+ravine+frost").
 */
function fewWords(cased: string): boolean {
  const letters = (cased.match(/\p{L}/gu) ?? []).length;
  for (const form of new Set([cased, respell(cased, "i"), respell(cased, "l")])) {
    let words = 0;
    let maybes = 0;
    let held = 0;
    for (const run of form.matchAll(/\p{L}+/gu)) {
      let at = run.index ?? 0;
      // (a line break after a small letter that a capital follows, and after a capital that a capital and then a small letter follow)
      for (const piece of run[0].replace(/\p{Ll}(?=\p{Lu})|\p{Lu}(?=\p{Lu}\p{Ll})/gu, "$&\n").split("\n")) {
        const word = piece.toLowerCase();
        // how many of its characters were typed as they are (the rest were look-alikes); places are UTF-16 units, as `at` is
        let typed = 0;
        for (let k = 0; k < piece.length; k++) if (cased[at + k] === piece[k]) typed++;
        if (wordlike(word) && (typed === piece.length || (piece.length >= 5 && typed * 3 >= piece.length * 2))) {
          words++;
          held += typed;
        } else if (piece.length >= 3) maybes++;
        at += piece.length;
      }
    }
    if (form === cased && words + maybes >= 3) return false;
    if (words >= 1 && words + maybes <= 2 && held * 4 >= letters * 3) return true;
  }
  return false;
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
  if (new Set(lowerChars).size < 5 || repeats(lower) || slides(lowerChars)) return "pattern";
  // mostly one number with a little around it: a date, a phone number, an account number
  const longest = Math.max(0, ...(p.match(/\d+/g) ?? []).map((run) => run.length));
  if (longest < MANY_DIGITS && longest * 3 >= chars.length * 2) return "pattern";
  // accents off, so that "pàssword" is looked up as "password"
  const plain = lower.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  // nothing but digits and marks is a pattern; then well-known passwords, as typed and with look-alikes turned back
  for (const form of new Set([plain, unleet(plain, "i"), unleet(plain, "l")])) {
    const known = knownAs(form);
    if (known === "common" || (known === "pattern" && form === plain)) return known;
  }
  if (!wide && chars.length < FEW_WORDS_BELOW && fewWords(p.normalize("NFD").replace(/\p{M}/gu, ""))) return "few-words";
  return null;
}
