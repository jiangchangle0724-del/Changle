/**
 * A statement in a PDF, read into lines (IMP-3): from the runs of text on its pages (web/pdf.ts,
 * pdftext.ts) to the transactions it lists and the balances it states.
 *
 * A PDF has no columns, only text at places. What this reader goes by:
 *
 * - The table of transactions is found by its row of column names ("DATE", "DESCRIPTION",
 *   "AMOUNT ($)"; a second row above it may say which date is which). A statement whose table
 *   has no such row is refused (`layout-unclear`), not guessed at.
 * - A line of the table starts with a date where the date column is, and ends with an amount
 *   where an amount column is. What stands between is its description. A line under it that
 *   starts where descriptions start, with no date and no amount, is more of the same line.
 * - Money: a column of withdrawals or debits is money out and one of deposits or credits money
 *   in. With one column for both, "CR" is money in and "DR" money out; a plain number is money
 *   out on a card's statement (a purchase raises what is owed) and money in on a bank account's;
 *   a minus turns it round.
 * - The balances are read where the statement names them ("Previous balance", "New balance",
 *   "Opening balance"…), a label and the amount beside it. A card's balance is what is owed, so
 *   it is a negative balance here unless it says "CR".
 * - A date without a year takes it from the statement's own date or period: the latest year that
 *   does not put the line after the statement's end.
 *
 * Nothing is taken on trust: what comes back goes through the same check as any import, the
 * opening balance plus the lines against the closing balance (ACC-2, reconcile.ts). A line that
 * starts like a transaction and could not be read is counted (`unread`), never dropped silently.
 *
 * Built from the layout of the operator's own statements, passed on as invented copies (IMP-9).
 * The first was a credit card's (25 November 2026). A bank account's statement, with columns for
 * money out, money in and the balance, is read by the same rules and has not met a real one yet.
 */
import { dayNumber, parseDay, type DateStyle, type Day } from "./dates";
import type { AccountKind, ParsedLine, ParsedStatement, ReadResult, Warning } from "./model";
import { parseAmount } from "./money";
import { MAX_LINES } from "./ofx";
import { linesOf, type PdfLine, type PdfPage } from "./pdftext";
import { runningBalances } from "./reconcile";
import { lastFour, maskNumbers, tidy } from "./text";

/** What the caller knows before the file is read: the kind and currency of the account it is for. */
export type PdfHints = { kind?: AccountKind; currency?: string };

/**
 * Runs that stand together on a line: a word, a sentence, an amount. A gap of seven tenths of the type's height starts
 * the next one: the space between two words is under a third of it, and columns stand further apart than that.
 */
type Cell = { text: string; x: number; right: number; h: number };
const CELL_GAP = 0.7;

function cellsOf(line: PdfLine): Cell[] {
  const cells: Cell[] = [];
  for (const run of line.runs) {
    const last = cells[cells.length - 1];
    const tall = Math.max(run.h, last?.h ?? 0, 1);
    if (last && run.x - last.right < tall * CELL_GAP) {
      const apart = run.x - last.right >= tall * 0.25 && !/\s$/.test(last.text) && !/^\s/.test(run.text);
      last.text += (apart ? " " : "") + run.text;
      last.right = Math.max(last.right, run.x + run.w);
      last.h = Math.max(last.h, run.h);
    } else cells.push({ text: run.text, x: run.x, right: run.x + run.w, h: run.h });
  }
  return cells.map((cell) => ({ ...cell, text: tidy(cell.text, 400) })).filter((cell) => cell.text !== "");
}

/** Text as its words are compared: no accents, no capitals. */
const plain = (text: string): string => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------------------------

/** An amount as printed: how much, whether a minus (or brackets) stood on it, and whether "CR" or "DR" did. */
type Money = { value: number; minus: boolean; way: "CR" | "DR" | null };

/**
 * The amount these words end with, and how many of them it takes; null when they do not end with one. An amount
 * here has its cents ("83.58", not "83"): a store's number or a day at the end of a description is not money.
 */
function endAmount(words: readonly string[], currency: string, decimal: "." | ","): { money: Money; used: number } | null {
  let at = words.length - 1;
  let way: Money["way"] = null;
  const marked = /^(cr|dr|od)\.?$/i.exec(words[at] ?? "");
  if (marked && at > 0) {
    way = marked[1]!.toLowerCase() === "cr" ? "CR" : "DR";
    at--;
  }
  let text = words[at];
  if (text === undefined) return null;
  // a currency sign set apart, after the number ("83,58 $")
  if (text === "$" && at > 0) text = `${words[--at]} $`;
  // "CR" written against the number: "73.45CR"
  const glued = /^(.*\d)(cr|dr|od)$/i.exec(text);
  if (glued && !way) {
    way = glued[2]!.toLowerCase() === "cr" ? "CR" : "DR";
    text = glued[1]!;
  }
  if (!/\d[.,]\d{2}\)?-?(?: ?\$)?$/.test(text)) return null;
  // thousands set apart by spaces, where a comma is the decimal sign: "1 234,56"
  if (decimal === ",") while (at > 0 && /^[-+($]*\d{1,3}$/.test(words[at - 1]!) && /^\d{3}(?!\d)/.test(text)) text = `${words[--at]} ${text}`;
  // a sign or a currency sign set apart, before the number: "$ 83.58", "- 83.58"
  if (at > 0 && /^(?:[-+−(]?[A-Z]{0,3}\$|[-+−])$/.test(words[at - 1]!)) text = `${words[--at]}${text}`;
  const value = parseAmount(text, currency, { decimal });
  if (value === null) return null;
  return { money: { value: Math.abs(value), minus: value < 0, way }, used: words.length - at };
}

/** A cell that is one amount and nothing else. */
function amountOf(cell: Cell, currency: string, decimal: "." | ","): Money | null {
  const words = cell.text.split(" ");
  const got = endAmount(words, currency, decimal);
  return got && got.used === words.length ? got.money : null;
}

type NumberRole = "amount" | "out" | "in" | "balance";

/** An amount of a line with our sign: plus is into the account. `credit`: the statement is a credit card's. */
function signed(money: Money, role: "amount" | "out" | "in", credit: boolean): number {
  const turned = (value: number): number => (money.minus ? -value : value);
  if (role === "out") return turned(-money.value);
  if (role === "in") return turned(money.value);
  if (money.way) return turned(money.way === "CR" ? money.value : -money.value);
  return turned(credit ? -money.value : money.value);
}

/** A balance with our sign. A card's is what is owed, unless it says "CR"; a bank account's is what is there, unless it says "DR" or "OD". */
function balanceOf(money: Money, credit: boolean): number {
  const turned = (value: number): number => (money.minus ? -value : value);
  if (money.way) return turned(money.way === "CR" ? money.value : -money.value);
  return turned(credit ? -money.value : money.value);
}

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

/** A date as written: `full` has its year; `short` waits for the statement's. `numbers`: written in numbers only, month and day in an order to be settled. */
type Written = { raw: string; full: boolean; numbers: boolean };

const WORD = "[A-Za-z\\u00C0-\\u017F]{3,9}";
const DATE_FORMS: readonly { form: RegExp; full: boolean; numbers: boolean }[] = [
  { form: /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?!\d)/, full: true, numbers: true },
  { form: /^\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2})(?!\d)/, full: true, numbers: true },
  { form: new RegExp(`^${WORD}\\.? ?\\d{1,2},? \\d{4}(?!\\d)`), full: true, numbers: false },
  { form: new RegExp(`^\\d{1,2}[ -]${WORD}\\.?,?[ -]\\d{4}(?!\\d)`), full: true, numbers: false },
  { form: new RegExp(`^${WORD}\\.? ?\\d{1,2}(?![\\d/]|[.,]\\d)`), full: false, numbers: false },
  { form: new RegExp(`^\\d{1,2}[ -]${WORD}\\.?(?![A-Za-z\\u00C0-\\u017F])`), full: false, numbers: false },
  { form: /^\d{1,2}\/\d{1,2}(?![\d/]|[.,]\d)/, full: false, numbers: true },
];

/** Is this one real day, in some year and some order? (2000 has a 29th of February.) */
const isDate = (written: Written): boolean => {
  if (!written.numbers) return parseDay(written.full ? written.raw : `${written.raw} 2000`, "MDY") !== null;
  if (/^\d{4}/.test(written.raw)) return parseDay(written.raw.replace(/[/.]/g, "-"), "YMD") !== null;
  const whole = written.full ? written.raw : `${written.raw}/2000`;
  return parseDay(whole, "MDY") !== null || parseDay(whole, "DMY") !== null;
};

/** The dates a text starts with, at most `most` of them, and what follows them. */
function leadingDates(text: string, most: number): { dates: Written[]; rest: string } {
  const dates: Written[] = [];
  let rest = text;
  while (dates.length < most) {
    let found: Written | null = null;
    for (const { form, full, numbers } of DATE_FORMS) {
      const m = form.exec(rest);
      if (!m) continue;
      const written = { raw: m[0], full, numbers };
      if (!isDate(written)) continue;
      found = written;
      break;
    }
    if (!found) break;
    dates.push(found);
    rest = rest.slice(found.raw.length).trimStart();
  }
  return { dates, rest };
}

/** Every date with its year in a text, in the order they stand. */
function fullDates(text: string, style: DateStyle): Day[] {
  const days: Day[] = [];
  for (let i = 0; i < text.length; i++) {
    if (i > 0 && /[\p{L}\p{N}]/u.test(text[i - 1]!)) continue;
    const { dates } = leadingDates(text.slice(i), 1);
    const written = dates[0];
    if (!written?.full) continue;
    const day = dayOf(written, style, undefined);
    if (day) days.push(day);
    i += written.raw.length - 1;
  }
  return days;
}

/** A line can be posted a little after the day its statement is dated; never much. */
const AFTER_END = 7;

/** The day a written date is. One without a year is the latest such day that is not past the statement's end. */
function dayOf(written: Written, style: DateStyle, end: Day | undefined): Day | null {
  if (written.full) {
    if (!written.numbers) return parseDay(written.raw, "MDY");
    return /^\d{4}/.test(written.raw) ? parseDay(written.raw.replace(/[/.]/g, "-"), "YMD") : parseDay(written.raw, style);
  }
  if (!end) return null;
  const year = Number(end.slice(0, 4));
  for (const y of [year, year - 1]) {
    const day = written.numbers ? parseDay(`${written.raw}/${y}`, style) : parseDay(`${written.raw} ${y}`, "MDY");
    if (day && dayNumber(day) <= dayNumber(end) + AFTER_END) return day;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The row of column names
// ---------------------------------------------------------------------------------------------

type Columns = {
  /** Where each date column starts, and whether it is the day the line was posted. */
  dates: { x: number; posted: boolean }[];
  /** Where descriptions start, when the row names that column. */
  description: number | null;
  numbers: { role: NumberRole; x: number; right: number }[];
};

const numberRole = (text: string): NumberRole | null =>
  /withdraw|debit|retrait|sortie|paid out|支出|借方/.test(text)
    ? "out"
    : /deposit|credit|depot|entree|paid in|存入|收入|贷方/.test(text)
      ? "in"
      : /balance|solde|余额/.test(text)
        ? "balance"
        : /amount|montant|金额/.test(text)
          ? "amount"
          : null;

/** A row of column names: short cells, a date first, and a column of money to its right. `above` is the line over it, which may finish the names ("POSTING" over "DATE"). */
function columnsOf(cells: readonly Cell[], above: readonly Cell[]): Columns | null {
  if (cells.length < 3) return null;
  const columns: Columns = { dates: [], description: null, numbers: [] };
  for (const cell of cells) {
    const text = plain(cell.text);
    if (text.length > 32) continue;
    const over = above
      .filter((a) => a.x <= cell.right + 6 && a.right >= cell.x - 6 && a.text.length <= 32)
      .map((a) => plain(a.text))
      .join(" ");
    const role = numberRole(text);
    if (/\bdate\b|日期/.test(text) && !role) columns.dates.push({ x: cell.x, posted: /post|inscri|report|入账|记账/.test(`${over} ${text}`) });
    else if (role) columns.numbers.push({ role, x: cell.x, right: cell.right });
    else if (columns.description === null && /description|detail|particular|transaction|activity|libelle|operation|说明|摘要|交易/.test(text)) columns.description = cell.x;
  }
  const { dates, numbers } = columns;
  if (dates.length < 1 || dates.length > 2 || dates[0]!.x !== cells[0]!.x) return null;
  if (!numbers.length) return null;
  // one column of each kind, and one column for both ways or one for each, never both
  const roles = numbers.map((n) => n.role);
  if (new Set(roles).size !== roles.length || (roles.includes("amount") && (roles.includes("out") || roles.includes("in")))) return null;
  // which date is the day a line was posted: the one that says so, or else the second of two
  if (dates.length === 1) dates[0]!.posted = true;
  else if (dates[0]!.posted === dates[1]!.posted) [dates[0]!.posted, dates[1]!.posted] = [false, true];
  numbers.sort((a, b) => a.right - b.right);
  return columns;
}

// ---------------------------------------------------------------------------------------------
// Lines of the table
// ---------------------------------------------------------------------------------------------

type Row = { dates: Written[]; words: string; money: Partial<Record<NumberRole, Money>> };

/** How far a date may start from where its column does. */
const DATE_SLACK = 8;

/**
 * A line of the table: null when it is not one, "unread" when it starts like one (a date where the dates are) and has
 * no amount where the amounts are.
 */
function rowOf(cells: readonly Cell[], columns: Columns, currency: string, decimal: "." | ","): Row | "unread" | null {
  const first = cells[0];
  if (!first || Math.abs(first.x - columns.dates[0]!.x) > DATE_SLACK) return null;
  const lead = leadingDates(first.text, columns.dates.length);
  if (!lead.dates.length) return null;
  const rest: Cell[] = cells.slice(1);
  // the second date, set as a cell of its own
  if (lead.dates.length < columns.dates.length && lead.rest === "" && rest[0] && Math.abs(rest[0].x - columns.dates[1]!.x) <= DATE_SLACK) {
    const next = leadingDates(rest[0].text, 1);
    if (next.dates.length) {
      lead.dates.push(next.dates[0]!);
      if (next.rest === "") rest.shift();
      else rest[0] = { ...rest[0], text: next.rest };
    }
  }
  if (lead.rest !== "") rest.unshift({ ...first, text: lead.rest });
  // the amounts, from the right: each goes to the column of money whose right edge is nearest its own
  const money: Row["money"] = {};
  const reach = columns.numbers.length === 1 ? 60 : 30;
  while (rest.length && Object.keys(money).length < columns.numbers.length) {
    const cell = rest[rest.length - 1]!;
    const words = cell.text.split(" ");
    const got = endAmount(words, currency, decimal);
    if (!got) break;
    const column = columns.numbers.filter((n) => !(n.role in money) && Math.abs(n.right - cell.right) <= reach).sort((a, b) => Math.abs(a.right - cell.right) - Math.abs(b.right - cell.right))[0];
    if (!column) break;
    money[column.role] = got.money;
    if (got.used < words.length) {
      // (the amount was set against the words before it: those are the description's)
      rest[rest.length - 1] = { ...cell, text: words.slice(0, -got.used).join(" ") };
      break;
    }
    rest.pop();
  }
  if (!Object.keys(money).length) return "unread";
  return { dates: lead.dates, words: rest.map((cell) => cell.text).join(" "), money };
}

// ---------------------------------------------------------------------------------------------
// What the statement says of itself
// ---------------------------------------------------------------------------------------------

const OPENING = /^(?:(?:previous|prior|opening|beginning|last)(?: statement| total)? balance|balance (?:brought )?forward|solde (?:precedent|anterieur|reporte|d'ouverture)|上期(?:账单)?余额|期初余额)/;
const CLOSING = /^(?:(?:new|closing|ending|statement|total)(?: statement| total)? balance|nouveau solde|solde (?:de cloture|final|de fermeture)|本期(?:账单)?余额|期末余额)/;
const PERIOD = /^(?:statement period|period covered|for the period|periode(?: du releve)?|账单周期)/;
const DATED = /^(?:statement date|closing date|period ending|date du releve|账单日)/;
const NUMBER = /^(?:(?:card|account) (?:number|no\.?|#)|numero de (?:carte|compte)|卡号|账号)\b/;
const CARD = /mastercard|visa|american express|amex|credit card|credit limit|carte de credit|limite de credit|信用卡|信用额度/;

/**
 * Is a cell that starts with one of these names the name and nothing more? A date may follow it ("Previous balance,
 * Oct. 14, 2026"), a sentence may not ("Total balance for purposes of interest", "New balance not yet due").
 */
function isLabel(text: string, name: RegExp): boolean {
  const m = name.exec(text);
  if (!m) return false;
  const after = text
    .slice(m[0].length)
    .replace(/[\d\s.,:;()/\-]+/g, " ")
    .split(" ")
    .filter((word) => word !== "" && !/^(?:as|of|on|at|au|le|du|de|en|date|截至)$/.test(word) && parseDay(`${word} 1 2000`, "MDY") === null);
  return after.length === 0;
}

type Said = { opening?: Money; closing?: Money; period?: Day[]; dated?: Day; last4?: string; card: boolean };

/** The first amount that stands by itself to the right of a label, on its line. */
function beside(cells: readonly Cell[], at: number, currency: string, decimal: "." | ","): Money | undefined {
  for (const cell of cells.slice(at + 1)) {
    const money = amountOf(cell, currency, decimal);
    if (money) return money;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------------------------

/** How far below a line of the table a second line of its wording may stand, in heights of its type. */
const NEXT_LINE = 1.7;

export function readPdfStatement(pages: readonly PdfPage[], hints: PdfHints = {}): ReadResult {
  const currency = hints.currency ?? "CAD";
  const laid = pages.map((page) => linesOf(page).map((line) => ({ y: line.y, h: line.h, cells: cellsOf(line) })).filter((line) => line.cells.length));
  const everything = laid.flat();
  // how this statement writes its cents: with a point, or with a comma
  let [points, commas] = [0, 0];
  for (const line of everything) {
    for (const cell of line.cells) {
      if (/\d\.\d{2}(?:\D{0,4})$/.test(cell.text)) points++;
      else if (/\d,\d{2}(?:\D{0,4})$/.test(cell.text)) commas++;
    }
  }
  const decimal = commas > points ? "," : ".";

  // --- the table: its rows of names, and the lines under each
  /** A line of the table, the lines of wording under it, and whether the first of its two dates is the day it was posted. */
  type Found = { row: Row; memo: string[]; postedFirst: boolean };
  const found: Found[] = [];
  let unread = 0;
  let columns: Columns | null = null;
  let tables = 0;
  for (const page of laid) {
    let last: { found: Found; y: number; h: number } | null = null;
    for (let n = 0; n < page.length; n++) {
      const line = page[n]!;
      const before = page[n - 1];
      const named = columnsOf(line.cells, before && line.y - before.y <= Math.max(line.h, before.h, 1) * 2.5 ? before.cells : []);
      if (named) {
        columns = named;
        tables++;
        last = null;
        continue;
      }
      // (a table goes on over the page, with or without its row of names again)
      if (!columns) continue;
      const row = rowOf(line.cells, columns, currency, decimal);
      if (row === "unread") {
        unread++;
        last = null;
      } else if (row) {
        const one: Found = { row, memo: [], postedFirst: columns.dates.length === 2 && columns.dates[0]!.posted };
        found.push(one);
        last = { found: one, y: line.y, h: line.h };
      } else if (last && last.found.memo.length < 3 && line.y - last.y <= Math.max(line.h, last.h, 1) * NEXT_LINE) {
        // more of the line above: it starts where descriptions do, and no amount stands at its end
        const starts: number = columns.description ?? columns.dates[columns.dates.length - 1]!.x + 20;
        const cells = line.cells;
        if (cells[0]!.x >= starts - 4 && !amountOf(cells[cells.length - 1]!, currency, decimal)) {
          last.found.memo.push(cells.map((cell) => cell.text).join(" "));
          last = { found: last.found, y: line.y, h: line.h };
        } else last = null;
      } else last = null;
    }
  }
  if (!tables) return { ok: false, error: "layout-unclear" };
  if (found.length > MAX_LINES) return { ok: false, error: "too-long" };

  // --- the order of month and day, where dates are written in numbers only
  const numeric = found.flatMap((one) => one.row.dates).filter((written) => written.numbers && !/^\d{4}/.test(written.raw));
  const reads = (style: DateStyle): boolean => numeric.every((written) => parseDay(written.full ? written.raw : `${written.raw}/2000`, style) !== null);
  const [monthFirst, dayFirst] = [reads("MDY"), reads("DMY")];
  const style: DateStyle = monthFirst || !dayFirst ? "MDY" : "DMY";
  const warnings = new Set<Warning>();
  if (numeric.length && monthFirst && dayFirst) warnings.add("date-order-guessed");

  // --- what the statement says of itself: its balances, its period, its number, and whether it is a card's
  const said: Said = { card: false };
  laid.forEach((page, n) => {
    for (const line of page) {
      line.cells.forEach((cell, at) => {
        const text = plain(cell.text);
        // (the first page says what the statement is; the small print after it can name anything)
        if (n === 0 && CARD.test(text)) said.card = true;
        if (text.length > 80) return;
        if (!said.opening && isLabel(text, OPENING)) said.opening = beside(line.cells, at, currency, decimal);
        else if (!said.closing && isLabel(text, CLOSING)) said.closing = beside(line.cells, at, currency, decimal);
        if (!said.period && PERIOD.test(text)) {
          // (the two days of a period can be set as one run or as three; what else stands on the line comes after them)
          const days = fullDates(line.cells.slice(at).map((c) => c.text).join(" "), style);
          if (days.length >= 2) said.period = days.slice(0, 2);
          else said.dated ??= days[0];
        } else if (!said.dated && DATED.test(text)) said.dated = fullDates(line.cells.slice(at, at + 2).map((c) => c.text).join(" "), style)[0];
        if (!said.last4 && NUMBER.test(text)) {
          const digits = lastFour(line.cells.slice(at, at + 2).map((c) => c.text).join(" "));
          if (digits.length === 4) said.last4 = digits;
        }
      });
    }
  });
  const kind: AccountKind | undefined = hints.kind ?? (said.card ? "credit" : undefined);
  const credit = kind === "credit";
  const [from, to] = [said.period?.[0], said.period?.[1] ?? said.dated];

  // --- the lines
  const lines: ParsedLine[] = [];
  let unsigned = 0;
  let ways = 0;
  for (const { row, memo, postedFirst } of found) {
    const days = row.dates.map((written) => dayOf(written, style, to));
    const posted = days[row.dates.length === 2 && postedFirst ? 0 : row.dates.length - 1];
    const other = row.dates.length === 2 ? days[postedFirst ? 1 : 0] : undefined;
    const { amount, out, in: into, balance } = row.money;
    if (!posted || (!amount && !out && !into)) {
      // A day that is no day, or one with no year where the statement gives none; or a line with a balance and no
      // amount ("Opening balance" set as a line of the table).
      const label = plain(row.words);
      if (posted && balance && isLabel(label, OPENING)) said.opening ??= balance;
      else if (posted && balance && isLabel(label, CLOSING)) said.closing ??= balance;
      else unread++;
      continue;
    }
    let value = 0;
    if (amount) {
      value = signed(amount, "amount", credit);
      if (amount.way || amount.minus) ways++;
      else unsigned++;
    }
    if (out) value += signed(out, "out", credit);
    if (into) value += signed(into, "in", credit);
    const line: ParsedLine = { posted, amount: value, description: tidy(maskNumbers(row.words)) };
    if (other && other !== posted) line.date = other;
    if (memo.length) line.memo = tidy(maskNumbers(memo.join(" ")));
    if (balance) line.balance = balanceOf(balance, credit);
    lines.push(line);
  }
  if (!lines.length) return { ok: false, error: unread ? "layout-unclear" : "no-lines" };
  // Oldest first. A statement that lists the newest first is turned round. One with no balances is then put in the
  // order of its days, lines of one day staying as they stood: a card's statement lists each card by itself. One with
  // a balance after every line is left in the order the balances follow.
  let [later, earlier] = [0, 0];
  for (let i = 1; i < lines.length; i++) {
    const step = dayNumber(lines[i]!.posted) - dayNumber(lines[i - 1]!.posted);
    if (step > 0) later++;
    else if (step < 0) earlier++;
  }
  if (earlier > later) lines.reverse();
  if (!lines.some((line) => line.balance !== undefined)) lines.sort((a, b) => dayNumber(a.posted) - dayNumber(b.posted));
  // one column for both ways, on a bank account, and not one line that says which way it went
  if (!credit && unsigned > 0 && ways === 0) warnings.add("sign-guessed");

  let opening = said.opening ? balanceOf(said.opening, credit) : undefined;
  let closing = said.closing ? balanceOf(said.closing, credit) : undefined;
  if (opening === undefined || closing === undefined) {
    // a balance after every line says both
    const run = lines.every((line) => line.balance !== undefined) ? runningBalances(lines) : null;
    if (run && run.breaksAt === undefined) [opening, closing] = [opening ?? run.opening, closing ?? run.closing];
  }
  if (opening === undefined || closing === undefined) warnings.add("no-closing-balance");
  if (unread) warnings.add("lines-left-out");

  const statement: ParsedStatement = {
    parser: "pdf",
    account: { ...(kind ? { kind } : {}), currency, ...(said.last4 ? { last4: said.last4 } : {}) },
    ...(from ? { from } : {}),
    ...(to ? { to, closingAsOf: to } : {}),
    ...(opening === undefined ? {} : { opening }),
    ...(closing === undefined ? {} : { closing }),
    lines,
    unread,
    warnings: [...warnings],
  };
  return { ok: true, statements: [statement] };
}
