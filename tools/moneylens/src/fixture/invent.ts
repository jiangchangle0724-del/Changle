/**
 * Invented text with the shape of real text (IMP-9). The fixture tool runs every word and number
 * of a real statement through this before anything is offered for sharing: letters become other
 * letters and digits other digits, and the shape stays (lengths, capitals, punctuation, where the
 * cents are), because the shape is what a statement reader goes by.
 *
 * Kept as they are: the words statements are built from ("Balance", "Withdrawals", "Solde",
 * "余额"), which are no one's data and which a reader looks for; years; and numbers that are
 * nothing but zeros. A month stays a month and a day a day, moved: every month by the same number
 * of months (never round the end of the year), and the days onto other days in the same order, so
 * the lines of a statement stay in the order they were in and every date is still a real date.
 *
 * It works in two passes over the same texts: `learn` each one (to see which days there are), then
 * `text` each one. The operator still looks the result over before sharing it (IMP-9).
 */

/** A source of numbers from 0 up to, not including, 1. The page uses the browser's own random bytes; a test, a seed. */
export type Random = () => number;

const plain = (word: string): string => word.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** Words a statement is built from, without accents or capitals. Anything else made of letters is somebody's: a name, a shop, a street. */
const VOCAB = new Set(
  `a an and as at by for from in of on or per the to with your you this that is are no not all
  account accounts activity adjustment adjustments advance advances amount amounts annual atm available balance balances bank banking
  bill billing branch card cards cash charge charges cheque cheques check checks chequing checking closing code continued cr credit
  credits currency current daily date dates day days db debit debits deposit deposits description details direct dr due electronic end
  ending exchange fee fees foreign forward funds interac interest last limit line minimum month monthly new next number online opening
  overdraft page paid payment payments pending period plan point points posted posting previous purchase purchases rate received ref
  reference refund refunds rewards sale savings service statement statements status subtotal summary tax thank total totals transaction
  transactions transfer transfers type usd cad value visa mastercard amex withdrawal withdrawals year ytd
  au aux de des du et la le les ou par pour sur un une votre vos achat achats avance carte compte comptes courant depot depots epargne
  frais interet interets limite mensuel montant montants nouveau numero operation operations ouverture cloture paiement paiements periode
  precedent releve report reporte retrait retraits solde soldes sommaire suite virement virements
  monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun lundi mardi mercredi jeudi vendredi samedi dimanche`.split(/\s+/),
);

/** Is this one of those words? "d'ouverture" is, for its "ouverture": the letter before an apostrophe is nobody's. */
const known = (word: string): boolean => word.split(/['’]/).every((part) => part.length <= 1 || VOCAB.has(plain(part)));

/** The same, in Chinese. The longer of two that fit is taken. */
const HAN_VOCAB = ["期初余额", "期末余额", "交易日期", "记账日期", "入账日期", "交易描述", "交易金额", "交易类型", "对账单", "信用卡", "手续费", "流水号", "日期", "摘要", "描述", "金额", "支出", "收入", "余额", "账户", "账号", "卡号", "借方", "贷方", "类型", "状态", "币种", "货币", "期初", "期末", "上期", "本期", "合计", "总计", "账单", "明细", "交易", "储蓄", "活期", "支票", "还款", "利息", "备注", "借", "贷", "页", "第", "共", "年", "月", "日"];
const HAN_POOL = "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥";

/** The months, in the forms statements write them in. A month keeps its form when it is moved. */
const MONTHS: readonly (readonly string[])[] = [
  ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
  ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
  ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"],
];

function monthOf(word: string): { form: number; month: number } | null {
  const p = plain(word);
  for (let form = 0; form < MONTHS.length; form++) {
    const month = MONTHS[form]!.findIndex((name) => plain(name) === p);
    if (month >= 0) return { form, month };
  }
  return p === "sept" ? { form: 0, month: 8 } : null;
}

/** Written like `like`: all capitals, a first capital, or neither. */
function cased(word: string, like: string): string {
  if (like === like.toUpperCase() && like !== like.toLowerCase()) return word.toUpperCase();
  if (like[0] !== like[0]!.toLowerCase()) return word[0]!.toUpperCase() + word.slice(1);
  return word;
}

type Kind = "iso" | "three" | "two" | "number" | "han" | "word" | "other";
type Token = { kind: Kind; raw: string; at: number; parts: (string | undefined)[]; role?: "day" | "year" | "month" };

/** A date with the year first, a date in three numbers, a date in two ("10/02"), a number with its points and commas ("1,234.56"), a run of Chinese, a word, or one other character. */
const TOKEN = /(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?!\d)|(?<!\d)(\d{1,2})([-/.])(\d{1,2})\6(\d{2}|\d{4})(?!\d)|(?<![\d.,/])(\d{1,2})\/(\d{1,2})(?![\d/.,])|\d+(?:[.,]\d+)*|\p{Script=Han}+|\p{L}[\p{L}\p{M}'’]*|[\s\S]/gu;

function tokensOf(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const raw = m[0];
    const kind: Kind = m[1] !== undefined ? "iso" : m[5] !== undefined ? "three" : m[9] !== undefined ? "two" : /^\d/.test(raw) ? "number" : /^\p{Script=Han}/u.test(raw) ? "han" : /^\p{L}/u.test(raw) ? "word" : "other";
    tokens.push({ kind, raw, at: m.index, parts: [...m].slice(1) });
  }
  // A month's name with a number beside it is a date: "Oct 02", "02 OCT", "5 oct. 2026", "05-Oct-26". The day is the number before the
  // name when there is one, or else the one after; two digits after a day and a name are a year.
  const near = (from: number, step: 1 | -1): number => {
    for (let i = from + step, skipped = 0; i >= 0 && i < tokens.length && skipped <= 3; i += step, skipped++) {
      const t = tokens[i]!;
      if (t.kind === "number") return t.role === undefined ? i : -1;
      if (!(t.kind === "other" && /^[\s,.\-/]$/.test(t.raw))) return -1;
    }
    return -1;
  };
  const isDay = (i: number): boolean => i >= 0 && tokens[i]!.raw.length <= 2 && Number(tokens[i]!.raw) >= 1 && Number(tokens[i]!.raw) <= 31;
  tokens.forEach((token, i) => {
    if (token.kind !== "word" || !monthOf(token.raw)) return;
    const [before, after] = [near(i, -1), near(i, 1)];
    if (isDay(before)) {
      tokens[before]!.role = "day";
      if (after >= 0 && tokens[after]!.raw.length === 2) tokens[after]!.role = "year";
      token.role = "month";
    } else if (isDay(after)) {
      tokens[after]!.role = "day";
      token.role = "month";
    } else if (after >= 0 && /^(19|20)\d\d$/.test(tokens[after]!.raw)) {
      token.role = "month"; // "October 2026"
    }
  });
  return tokens;
}

/** "20261005": a year, a month and a day run together. */
const compact = (raw: string): RegExpExecArray | null => /^((?:19|20)\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.exec(raw);

export class Inventor {
  private readonly days = new Set<number>();
  private readonly months = new Set<number>();
  /** The two numbers of every date written without a month's name and without the year first. */
  private readonly pairs: [number, number][] = [];
  private padded = false;
  private settled: { shift: number; dayFirst: boolean; day: Map<number, number> } | null = null;

  constructor(private readonly random: Random) {}

  private pick(n: number): number {
    return Math.min(n - 1, Math.floor(this.random() * n));
  }

  /** First pass: note the days in a text that `text` will be asked to invent. */
  learn(text: string): void {
    for (const token of tokensOf(text)) {
      const p = token.parts;
      const run = token.kind === "number" ? compact(token.raw) : null;
      if (token.role === "day") this.see(token.raw);
      else if (token.role === "month") this.months.add(monthOf(token.raw)!.month + 1);
      else if (token.kind === "iso") this.see(p[3]!, p[2]!);
      else if (token.kind === "three") this.pair(p[4]!, p[6]!);
      else if (token.kind === "two") this.pair(p[8]!, p[9]!);
      else if (run) this.see(run[3]!, run[2]!);
    }
  }

  private see(day: string, month?: string): void {
    this.days.add(Number(day));
    if (month !== undefined) this.months.add(Number(month));
    if (day.length === 2 && day[0] === "0") this.padded = true;
  }

  private pair(a: string, b: string): void {
    this.pairs.push([Number(a), Number(b)]);
    if ((a.length === 2 && a[0] === "0") || (b.length === 2 && b[0] === "0")) this.padded = true;
  }

  private settle(): { shift: number; dayFirst: boolean; day: Map<number, number> } {
    if (this.settled) return this.settled;
    // which of the two numbers is the day: the one that passes 12, or else the one that takes more values
    const firsts = new Set(this.pairs.map(([a]) => a));
    const seconds = new Set(this.pairs.map(([, b]) => b));
    const dayFirst = Math.max(0, ...firsts) > 12 ? true : Math.max(0, ...seconds) > 12 ? false : firsts.size > seconds.size;
    for (const [a, b] of this.pairs) {
      this.days.add(dayFirst ? a : b);
      this.months.add(dayFirst ? b : a);
    }
    // Every month moves by the same number of months, and none of them past December or back past January: the year stays as written, so a
    // month that went round the corner would put its lines out of order. A text that spans the whole year keeps its months.
    const months = [...this.months].filter((m) => m >= 1 && m <= 12);
    const [earliest, latest] = [Math.min(12, ...months), Math.max(1, ...months)];
    const moves = Array.from({ length: 23 }, (_, i) => i - 11).filter((move) => move !== 0 && earliest + move >= 1 && latest + move <= 12);
    const shift = moves.length ? moves[this.pick(moves.length)]! : 0;
    // The days go onto other days in the same order. A day up to the 12th stays one, and a later day stays later, because that is what
    // tells a reader which number is the day; no day goes past the 28th, so that every month has it.
    const day = new Map<number, number>();
    const spread = (from: readonly number[], lowest: number, highest: number): void => {
      const room = highest - lowest + 1;
      if (from.length > room) {
        for (const d of from) day.set(d, Math.min(d, highest));
        return;
      }
      const slots = Array.from({ length: room }, (_, i) => lowest + i);
      while (slots.length > from.length) slots.splice(this.pick(slots.length), 1);
      from.forEach((d, i) => day.set(d, slots[i]!));
    };
    const all = [...this.days].filter((d) => d >= 1 && d <= 31).sort((a, b) => a - b);
    spread(all.filter((d) => d <= 12), 1, 12);
    spread(all.filter((d) => d > 12), 13, 28);
    return (this.settled = { shift, dayFirst, day });
  }

  private day(raw: string): string {
    const d = Number(raw);
    const to = this.settle().day.get(d) ?? (d <= 12 ? d : Math.min(d, 28));
    return String(to).padStart(this.padded || (raw.length === 2 && raw[0] === "0") ? 2 : 1, "0");
  }

  private month(raw: string): string {
    const m = Number(raw);
    if (m < 1 || m > 12) return this.digits(raw);
    return String(((((m - 1 + this.settle().shift) % 12) + 12) % 12) + 1).padStart(this.padded || (raw.length === 2 && raw[0] === "0") ? 2 : 1, "0");
  }

  /**
   * Other digits in the place of these, with the points and commas where they were. A first digit that isn't 0 stays one that isn't
   * ("0.57" stays under one), and a number of nothing but zeros stays as it is. A round amount does not stay round: "1,000.00" with
   * only its first digit changed would still say a round thousand, and one time in nine would be the same number.
   */
  private digits(raw: string): string {
    if (!/[1-9]/.test(raw)) return raw;
    let out = "";
    let first = true;
    for (const c of raw) {
      if (c < "0" || c > "9") out += c;
      else out += first ? (c === "0" ? "0" : String(1 + this.pick(9))) : String(this.pick(10));
      if (c >= "0" && c <= "9") first = false;
    }
    return out;
  }

  private letters(raw: string): string {
    let out = "";
    for (const c of raw) {
      if (!/\p{L}/u.test(c)) out += c;
      else if (c !== c.toLowerCase()) out += String.fromCharCode(65 + this.pick(26));
      else out += String.fromCharCode(97 + this.pick(26));
    }
    return out;
  }

  private han(raw: string): string {
    let out = "";
    for (let i = 0; i < raw.length; ) {
      const known = HAN_VOCAB.find((word) => raw.startsWith(word, i));
      if (known) {
        out += known;
        i += known.length;
      } else {
        out += HAN_POOL[this.pick(HAN_POOL.length)];
        i++;
      }
    }
    return out;
  }

  /** Second pass, piece by piece: each word, number or mark of the text with where it started and how long it was, and what stands in its place. */
  pieces(text: string): { at: number; length: number; out: string }[] {
    const { shift, dayFirst } = this.settle();
    return tokensOf(text).map((token) => {
      const p = token.parts;
      let out: string;
      if (token.kind === "iso") out = `${p[0]}${p[1]}${this.month(p[2]!)}${p[1]}${this.day(p[3]!)}`;
      else if (token.kind === "three") out = `${dayFirst ? this.day(p[4]!) : this.month(p[4]!)}${p[5]}${dayFirst ? this.month(p[6]!) : this.day(p[6]!)}${p[5]}${p[7]}`;
      else if (token.kind === "two") out = `${dayFirst ? this.day(p[8]!) : this.month(p[8]!)}/${dayFirst ? this.month(p[9]!) : this.day(p[9]!)}`;
      else if (token.kind === "han") out = this.han(token.raw);
      else if (token.kind === "other") out = token.raw;
      else if (token.kind === "number") {
        const run = compact(token.raw);
        if (token.role === "day") out = this.day(token.raw);
        else if (token.role === "year" || /^(19|20)\d\d$/.test(token.raw)) out = token.raw;
        else if (run) out = `${run[1]}${this.month(run[2]!).padStart(2, "0")}${this.day(run[3]!).padStart(2, "0")}`;
        else out = this.digits(token.raw);
      } else {
        const month = token.role === "month" ? monthOf(token.raw) : null;
        if (month) out = cased(MONTHS[month.form]![(((month.month + shift) % 12) + 12) % 12]!, token.raw);
        else if (known(token.raw)) out = token.raw;
        else out = this.letters(token.raw);
      }
      return { at: token.at, length: token.raw.length, out };
    });
  }

  /** Second pass: the text with its words and numbers invented. */
  text(text: string): string {
    return this.pieces(text)
      .map((piece) => piece.out)
      .join("");
  }
}

/** Invented texts for a list of texts, in the same order. */
export function inventAll(texts: readonly string[], random: Random): string[] {
  const inventor = new Inventor(random);
  for (const text of texts) inventor.learn(text);
  return texts.map((text) => inventor.text(text));
}
