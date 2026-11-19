/**
 * A CSV export from any bank (IN-1; IN-2 as the operator settled it on 2026-11-19: no list of
 * banks, people bring whatever their own bank gives them). There is no parser per bank here. The
 * reader works the layout out of the file itself:
 *
 * - what separates the fields, where the table starts, and whether it has a row of column names;
 * - which column is the day, and whether "03/04/2026" is March 4 or 3 April;
 * - where the money is: one column with a sign, a column out and a column in, or an amount with
 *   a word beside it that says which way it went; and which sign is money out;
 * - which column, if any, is the balance after each line. A balance that follows from the amounts
 *   line after line is the strongest evidence a file gives: it settles the signs and the order of
 *   the lines, and it lets the import reconcile to the cent (ACC-2).
 *
 * What the file leaves open is said, as a warning on the statement ("date-order-guessed",
 * "sign-guessed"), and the preview asks the person (IMP-6). The layout that was used comes back
 * with the statements: the person can correct it and the file is read again with `readCsvAs`;
 * once confirmed it is kept with the account, so the next file from the same bank is read the
 * same way without guessing. A file whose layout cannot be worked out is refused and nothing is
 * saved.
 *
 * The kind of account matters, and a file rarely states it: on a credit card the same columns
 * read the other way round (a purchase raises what is owed). Pass `kind` whenever the account is
 * known. Without it a file is read as a bank account's, and the statement that comes back has no
 * kind: when the person then says it is a card, the file is read again from the start.
 *
 * Every cell is data (IMP-5). Account and card numbers are cut to four digits here, and a column
 * named for the card's holder is never read (IMP-6).
 */
import { CsvError, filled, parseCsv } from "./csv";
import { makeDay, parseDay, type DateStyle, type Day } from "./dates";
import type { AccountKind, CsvAmount, CsvLayout, ImportError, ParsedLine, ParsedStatement, Warning } from "./model";
import { add, isCurrency, isMinor, parseAmount } from "./money";
import { MAX_LINES } from "./ofx";
import { runningBalances } from "./reconcile";
import { lastFour, maskNumbers, tidy } from "./text";

/**
 * What the caller knows before the file is read: the kind and currency of the account it is for,
 * and today (a date in the future is a misread). Where the file names the kind of account itself
 * ("Savings", "Visa"), the file's word is the one on the statement: a screen can then say that
 * the file is not for the account the person chose.
 */
export type CsvHints = { kind?: AccountKind; currency?: string; today?: Day };

export type CsvRead = { ok: true; statements: ParsedStatement[]; layout: CsvLayout } | { ok: false; error: ImportError };

type Delimiter = CsvLayout["delimiter"];
const DELIMITERS: readonly Delimiter[] = [",", ";", "\t", "|"];
const STYLES: readonly DateStyle[] = ["YMD", "MDY", "DMY"];
/** How many rows the layout is worked out from. Every row is still checked when it is read. */
const SAMPLE = 400;

// ---------------------------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------------------------

/** A clock after a date, and a zone after that: "T14:30:00Z", " 2:30 PM PST". */
const CLOCK = /(?:t|\s+)\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:[ap]\.?m\.?)?\s*(?:z|[+-]\d{2}:?\d{2}|[a-z]{2,5})?$/i;

/** The day in a cell. The clock is left out: the day is taken as written (dates.ts). */
function dayOf(cell: string, style: DateStyle): Day | null {
  if (cell.length > 60) return null;
  const text = cell.replace(CLOCK, "");
  const han = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/.exec(text);
  if (han) return makeDay(Number(han[1]), Number(han[2]), Number(han[3]));
  return parseDay(text, style);
}

const anyDay = (cell: string): boolean => STYLES.some((style) => dayOf(cell, style) !== null);

/** Does the date's own text leave open which number is the month ("03/04/2026")? */
const numbersOnly = (cell: string): boolean => /^\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4}(?!\d)/.test(cell);

const flip = (n: number): number => (n === 0 ? 0 : -n);

/** An amount in a cell. "CR" or "DR" beside it says which way the money went, whatever the sign. */
function amountOf(cell: string, decimal: "." | ",", currency: string): { value: number; way?: "in" | "out" } | null {
  if (cell.length > 40) return null;
  const after = /^(.*?[\d)])\s*(cr|dr|db)\.?$/i.exec(cell);
  const before = after ? null : /^(cr|dr|db)\.?\s*([-+($\d].*)$/i.exec(cell);
  const mark = (after?.[2] ?? before?.[1])?.toLowerCase();
  const value = parseAmount(after ? after[1]! : before ? before[2]! : cell, currency, { decimal });
  if (value === null) return null;
  return mark ? { value: Math.abs(value), way: mark === "cr" ? "in" : "out" } : { value };
}

/** The number in a cell with the sign its own marks give it: "DR" is a minus. */
const signed = (read: { value: number; way?: "in" | "out" }): number => (read.way === "out" ? flip(read.value) : read.value);

/** Is it written the way money is: with cents, or with a currency sign? (A cheque number or a reference is a number too.) */
const moneyish = (cell: string): boolean => /[.,]\d{2}(?!\d)/.test(cell) || /[$€£¥]/.test(cell);

/** A column's name, or a word in a cell, as it is compared: no accents, no capitals, no punctuation. */
const plain = (text: string): string => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}$#]+/gu, " ").trim();

/** A word that says which way a line went. */
function wayOf(cell: string): "in" | "out" | null {
  const word = plain(cell);
  if (/^(d|dr|db|debit|debits|withdrawal|withdrawals|retrait|retraits|支出|借|借方)$/.test(word)) return "out";
  if (/^(c|cr|credit|credits|deposit|deposits|depot|depots|收入|贷|贷方)$/.test(word)) return "in";
  return null;
}

const PENDING = /^(pending|en attente|en suspens|authorized|authorised|processing|待入账|处理中|未入账)$/;
/** A payment to a credit card, in the words statements use for it. */
const PAYMENT = /\b(payment|paiement|pmt|thank you|merci|autopay)\b|还款/;

/** The kind of account a cell names ("Chequing", "Visa Infinite"). */
function kindOf(cell: string): AccountKind | undefined {
  const word = plain(cell);
  if (word === "") return undefined;
  if (/(visa|mastercard|master card|amex|american express|credit card|carte de credit|信用卡)/.test(word)) return "credit";
  if (/(chequing|checking|cheque|cheques|活期|支票)/.test(word)) return "chequing";
  if (/(saving|savings|epargne|储蓄)/.test(word)) return "savings";
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------------------------

/** The table in a file: its rows of lines, and its row of column names when it has one. `stray` counts rows of another width inside it. */
type Table = { delimiter: Delimiter; width: number; names: string[] | null; rows: string[][]; stray: number };

/** The text split with one delimiter: rows with something in them, cells trimmed. Null when the text breaks CSV's own rules that way. */
function split(text: string, delimiter: Delimiter): string[][] | null {
  try {
    return filled(parseCsv(text, { delimiter, maxRows: MAX_LINES + 200 })).map((row) => row.map((cell) => cell.trim()));
  } catch (e) {
    if (e instanceof CsvError && e.code === "too-many-rows") throw e;
    return null;
  }
}

/** A row of column names: words in at least two cells, and nothing that reads as a day or as money. */
function isHeader(row: readonly string[]): boolean {
  const named = row.filter((cell) => cell !== "");
  return named.length >= 2 && named.every((cell) => /\p{L}/u.test(cell) && !anyDay(cell) && !(moneyish(cell) && /\d/.test(cell)));
}

/** Where the row of column names is: above every row with a day in it, near the top. -1 when there is none. */
function headerAt(rows: readonly string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    if (isHeader(rows[i]!)) return i;
    if (rows[i]!.some(anyDay)) return -1;
  }
  return -1;
}

/**
 * The table in those rows: the rows of the commonest width. What comes before and after it (a
 * title, the day of the export, a total) is not part of it, and neither is a row of another
 * width inside it: a note or a subtotal is not a line.
 */
function tableIn(all: readonly string[][], delimiter: Delimiter, fixed?: number): Table | null {
  let width = fixed ?? 0;
  if (fixed === undefined) {
    const counts = new Map<number, number>();
    for (const row of all) if (row.length >= 2) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    for (const [w, n] of counts) {
      const most = counts.get(width) ?? 0;
      if (n > most || (n === most && w > width)) width = w;
    }
  }
  if (width < 2) return null;
  // a row that only adds empty cells past the table's width is a row of the table: its line ended with a delimiter
  const rows = all.map((row) => (row.length > width && row.slice(width).every((cell) => cell === "") ? row.slice(0, width) : row));
  let first = rows.findIndex((row) => row.length === width);
  if (first < 0) return null;
  let last = first;
  for (let i = rows.length - 1; i > first; i--) {
    if (rows[i]!.length === width) {
      last = i;
      break;
    }
  }
  // column names in a shorter row directly above: the lines end with a delimiter and the names don't
  const above = first > 0 ? rows[first - 1]! : undefined;
  if (above && above.length >= 2 && above.length < width && isHeader(above) && !isHeader(rows[first]!)) {
    rows[first - 1] = [...above, ...Array<string>(width - above.length).fill("")];
    first--;
  }
  const inside = rows.slice(first, last + 1);
  const table = inside.filter((row) => row.length === width);
  const at = headerAt(table);
  return { delimiter, width, names: at < 0 ? null : table[at]!, rows: at < 0 ? table : table.slice(at + 1), stray: inside.length - table.length };
}

/** Does the table have a column of days? A statement does. */
function dated(table: Table): boolean {
  const sample = table.rows.slice(0, 50);
  for (let c = 0; c < table.width && sample.length > 0; c++) {
    if (sample.filter((row) => anyDay(row[c]!)).length * 10 >= sample.length * 9) return true;
  }
  return false;
}

/**
 * The tables a text could hold, one for each way of splitting it that gives a table, likeliest
 * first: one with a column of days before one without, then the one that takes in the most rows.
 * Which of them is the statement is settled by reading: a text split the wrong way can still look
 * like a table ("Oct 1, 2026" in a file split by tabs makes three even columns out of commas).
 */
function tablesOf(text: string, delimiter?: Delimiter, width?: number): Table[] {
  const found: Table[] = [];
  for (const d of delimiter ? [delimiter] : DELIMITERS) {
    const rows = split(text, d);
    const table = rows && tableIn(rows, d, width);
    if (table) found.push(table);
  }
  return found.sort((a, b) => Number(dated(b)) - Number(dated(a)) || b.rows.length - a.rows.length);
}

/** A cell as it may be shown or kept: numbers cut to four digits, tidied, short. */
const shown = (cell: string, most: number): string => tidy(maskNumbers(cell), most);

/**
 * The first rows of the table as the reader splits them, for the screen where a person says which
 * column is which. Null when the text holds no table.
 */
export function csvPreview(text: string, delimiter?: Delimiter, most = 20): { delimiter: Delimiter; width: number; names: string[] | null; rows: string[][] } | null {
  try {
    const tables = tablesOf(text, delimiter);
    const table = tables.find((t) => t.rows.length > 0 && dated(t) && guess(t, {}) !== "none") ?? tables[0];
    if (!table) return null;
    return { delimiter: table.delimiter, width: table.width, names: table.names && table.names.map((name) => shown(name, 40)), rows: table.rows.slice(0, most).map((row) => row.map((cell) => shown(cell, 80))) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Working the layout out
// ---------------------------------------------------------------------------------------------

type Role = "skip" | "kind" | "status" | "currency" | "balance" | "cheque" | "ref" | "account" | "posted" | "date" | "out" | "in" | "amount" | "type" | "description";

const UNIT = "( (cad|usd)| \\$)?";
/**
 * What banks call their columns, in English, French and Chinese, as `plain` leaves the words. The
 * first that fits wins, so the order matters: "Name on Card" is the holder, not a name and not a
 * card; "Account Type" is not an account number.
 */
const NAMES: readonly (readonly [Role, RegExp])[] = [
  ["skip", /(^| )(name on card|card ?holder|account holder|holder name|customer name|client name|titulaire|address|adresse)( |$)|^(姓名|户名|持卡人|地址)$/],
  ["kind", /^(account type|type of account|type de compte|账户类型)$/],
  ["status", /^(status|statut|etat|状态|交易状态)$/],
  ["currency", /^(currency|devise|ccy|币种|货币)$/],
  ["balance", /(^| )(balance|solde)( |$)|余额/],
  ["cheque", /^(cheque|check|chq)( (number|num|no|#))?$|^numero de cheque$|^支票号$/],
  ["ref", /^(reference|ref|transaction|confirmation) (number|num|no|id|#)$|^(reference|ref|流水号|交易流水号)$/],
  ["account", /^(account|compte|账号|卡号)$|(^| )(account|card|carte|compte) (number|num|no|#)$|^numero de (compte|carte)$|(^| )card$/],
  ["posted", /^(post(ed|ing)? date|date post(ed|ing)?|date d inscription|date de report|记账日期|入账日期)$/],
  ["date", /(^| )date( |$)|日期|^交易时间$/],
  ["out", new RegExp(`^(amount )?(debits?|withdrawals?|withdrawn|funds out|money out|paid out|charges?|retraits?|支出|借方)( (amount|amt))?${UNIT}$|^montant (du |de |des )?(retraits?|debits?)$`)],
  ["in", new RegExp(`^(amount )?(credits?|deposits?|funds in|money in|paid in|depots?|收入|贷方)( (amount|amt))?${UNIT}$|^montant (du |de |des )?(depots?|credits?)$`)],
  ["amount", new RegExp(`^((transaction )?(amount|amt)|montant|金额|交易金额)${UNIT}$|^(cad|usd) ?\\$?$`)],
  ["type", /^((transaction |trans |activity )?type|type of transaction|type de transaction|交易类型|类型)$/],
  ["description", /^(descriptions?( \d)?|sub description|(transaction )?details|transaction|memo|payee|name|merchant( name)?|narrative|particulars|libelle|descriptif|摘要|交易描述|商户|商户名称|对方户名|交易对方)$/],
];

const roleOf = (name: string): Role | undefined => {
  const words = plain(name);
  return NAMES.find(([, pattern]) => pattern.test(words))?.[0];
};

/** The currency a column's name states: "USD$", "Amount (USD)". */
const currencyIn = (name: string): string | undefined => /(?:^| )(cad|usd)(?= |\$|$)/.exec(plain(name))?.[1]?.toUpperCase();

/** What one column holds, counted over the sample. */
type Column = {
  filled: number;
  /** Cells that read as a day, by the order of the numbers. */
  days: Record<DateStyle, number>;
  /** Of those, the ones whose own text leaves the order open. */
  open: number;
  /** Cells that read as an amount, by the mark before the cents. */
  amounts: Record<"." | ",", number>;
  moneyish: number;
  worded: number;
  distinct: number;
  length: number;
};

function measure(rows: readonly string[][], width: number, currency: string): Column[] {
  return Array.from({ length: width }, (_, c) => {
    const column: Column = { filled: 0, days: { YMD: 0, MDY: 0, DMY: 0 }, open: 0, amounts: { ".": 0, ",": 0 }, moneyish: 0, worded: 0, distinct: 0, length: 0 };
    const seen = new Set<string>();
    for (const row of rows) {
      const cell = row[c]!;
      if (cell === "") continue;
      column.filled++;
      seen.add(cell);
      column.length += cell.length;
      for (const style of STYLES) if (dayOf(cell, style)) column.days[style]++;
      if (numbersOnly(cell)) column.open++;
      if (amountOf(cell, ".", currency)) column.amounts["."]++;
      if (amountOf(cell, ",", currency)) column.amounts[","]++;
      if (moneyish(cell)) column.moneyish++;
      if (/\p{L}/u.test(cell)) column.worded++;
    }
    column.distinct = seen.size;
    return column;
  });
}

/** How well a column of balances follows from a column of amounts, and how: read oldest first or newest first, the balance going up by each amount (`rho` 1) or down (`rho` -1). */
type Chain = { order: "forward" | "reverse"; rho: 1 | -1; hits: number; steps: number };

/**
 * `prefer` is the reading to keep when two fit equally well. Two lines of the same amount on one
 * day read as well backwards with the signs turned as they do forwards: it takes more steps that
 * follow, not as many, to read a file against the usual way.
 */
function chain(net: readonly (number | null)[], balance: readonly (number | null)[], order?: "forward" | "reverse", prefer: 1 | -1 = 1): Chain {
  let best: Chain = { order: order ?? "forward", rho: prefer, hits: -1, steps: 0 };
  for (const rho of prefer === 1 ? ([1, -1] as const) : ([-1, 1] as const)) {
    for (const o of order ? [order] : (["forward", "reverse"] as const)) {
      let hits = 0;
      let steps = 0;
      for (let i = 1; i < net.length; i++) {
        // forward: line i brought the balance from row i-1 to row i. reverse: line i-1 brought it from row i to row i-1.
        const before = o === "forward" ? balance[i - 1] : balance[i];
        const after = o === "forward" ? balance[i] : balance[i - 1];
        const amount = o === "forward" ? net[i] : net[i - 1];
        if (before === null || before === undefined || after === null || after === undefined || amount === null || amount === undefined) continue;
        steps++;
        if (after - before === rho * amount) hits++;
      }
      if (hits > best.hits) best = { order: o, rho, hits, steps };
    }
  }
  return best;
}

/** Does the balance follow the amounts well enough to be believed? Banks list one day's lines in another order now and then, so one step in ten may fail. */
const follows = (c: Chain): boolean => c.hits >= 1 && c.hits * 10 >= c.steps * 9;

/** Which way the days run down the file: 1 oldest first, -1 newest first, 0 when they don't say. */
function direction(days: readonly (Day | null)[]): 1 | -1 | 0 {
  let up = 0;
  let down = 0;
  let last: Day | null = null;
  for (const day of days) {
    if (!day) continue;
    if (last && day > last) up++;
    if (last && day < last) down++;
    last = day;
  }
  return up > down ? 1 : down > up ? -1 : 0;
}

type Guess = { layout: CsvLayout; doubts: Warning[] };

/**
 * Works a table's layout out. "none" when it is not a statement (no column of days, or no
 * numbers); "unclear" when there is more than one way to read the money and nothing to choose by.
 */
function guess(table: Table, hints: CsvHints): Guess | "none" | "unclear" {
  const currency = isCurrency(hints.currency) ? hints.currency : "CAD";
  const names = table.names ?? [];
  const data = table.rows;
  const sample = data.slice(0, SAMPLE);
  const columns = measure(sample, table.width, currency);
  const doubts: Warning[] = [];
  const all = Array.from({ length: table.width }, (_, c) => c);

  // the mark before the cents: whichever reads more of what is written like money
  const reads = (mark: "." | ","): number => columns.reduce((sum, c) => sum + (c.moneyish > 0 ? c.amounts[mark] : 0), 0);
  const decimal: "." | "," = reads(",") > reads(".") ? "," : ".";

  // How much of a column has to read as days, or as amounts, for it to be one. A table holds a row
  // now and then that is not a line (a note, a total), so one cell in ten may be something else; a
  // column that is named for what it holds is taken at its word when most of it agrees. Rows that
  // then can't be read are counted, and too many of them refuse the file (readRows).
  const mostly = (hits: number, filled: number, byName: boolean): boolean => filled > 0 && (byName ? hits * 10 >= filled * 6 : hits >= filled - (filled < 4 ? 0 : Math.max(1, Math.floor(filled / 10))));
  const daysIn = (c: number): number => Math.max(columns[c]!.days.YMD, columns[c]!.days.MDY, columns[c]!.days.DMY);
  const isDays = (c: number, byName = false): boolean => columns[c]!.filled * 10 >= sample.length * 9 && mostly(daysIn(c), columns[c]!.filled, byName);
  const isAmounts = (c: number, byName = false): boolean => !isDays(c) && mostly(columns[c]!.amounts[decimal], columns[c]!.filled, byName);
  const isMoney = (c: number): boolean => isAmounts(c) && columns[c]!.moneyish * 2 >= columns[c]!.filled;

  // what the names say, kept only where the column's contents agree
  const named: Partial<Record<Role, number[]>> = {};
  for (const c of all) {
    const role = names[c] ? roleOf(names[c]!) : undefined;
    if (!role) continue;
    if ((role === "date" || role === "posted") && !isDays(c, true)) continue;
    if ((role === "amount" || role === "balance") && !isAmounts(c, true)) continue;
    // (a column out or in may be empty from top to bottom: a month with no deposits)
    if ((role === "out" || role === "in") && columns[c]!.filled > 0 && !isAmounts(c, true)) continue;
    (named[role] ??= []).push(c);
  }
  const taken = new Set<number>(Object.values(named).flat());

  // --- the day
  const dayColumns = named.posted?.length || named.date?.length ? [...(named.posted ?? []), ...(named.date ?? [])] : all.filter((c) => !taken.has(c) && isDays(c));
  for (const c of dayColumns) taken.add(c);
  // a day that is the same on every line (the statement's, the export's) is not the line's own
  const varying = dayColumns.filter((c) => columns[c]!.distinct > 1);
  const days = varying.length ? varying : dayColumns;
  if (days.length === 0) return "none";
  const style = dateStyle(sample, columns[days[0]!]!, days[0]!, hints.today, doubts);
  if (!style) return "none";
  let date = days[0]!;
  let bought: number | undefined;
  if (days.length > 1) {
    // two days on a line: the purchase and the posting. The names say which; without names, the later one is the posting.
    const other = days[1]!;
    const later = sample.filter((row) => (dayOf(row[other]!, style) ?? "") > (dayOf(row[date]!, style) ?? "")).length;
    const earlier = sample.filter((row) => (dayOf(row[other]!, style) ?? "") < (dayOf(row[date]!, style) ?? "")).length;
    if (named.posted?.[0] === date || (!named.posted?.length && earlier >= later)) bought = other;
    else [date, bought] = [other, date];
  }

  // --- the account
  let account = named.account?.[0];
  if (account === undefined) {
    // nobody named it: a column that holds the same long number, masked or not, on line after line is the account's or the card's
    account = all.find((c) => !taken.has(c) && columns[c]!.filled >= 2 && columns[c]!.distinct * 4 <= Math.max(4, columns[c]!.filled) && sample.every((row) => row[c] === "" || /^(?=.*\d{4})[\dXx*• -]{8,}$/.test(row[c]!)));
    if (account !== undefined) taken.add(account);
  }
  // In a file of several accounts the balances run within each one, and so may the order of the lines: the evidence below is read off the account with the most lines.
  let mine: boolean[] | null = null;
  if (account !== undefined && columns[account]!.distinct > 1) {
    const counts = new Map<string, number>();
    for (const row of data) counts.set(row[account]!, (counts.get(row[account]!) ?? 0) + 1);
    const main = [...counts].reduce((most, entry) => (entry[1] > most[1] ? entry : most))[0];
    mine = data.map((row) => row[account!] === main);
  }
  const within = <T>(values: readonly T[]): readonly T[] => (mine ? values.filter((_, i) => mine![i]) : values);

  // --- every row's numbers, for the columns that could be money
  const numbers = new Map<number, (number | null)[]>();
  const column = (c: number): (number | null)[] => {
    let values = numbers.get(c);
    if (!values) {
      values = data.map((row) => {
        const read = row[c] === "" ? null : amountOf(row[c]!, decimal, currency);
        return read ? signed(read) : null;
      });
      numbers.set(c, values);
    }
    return values;
  };
  const run = direction(within(data).map((row) => dayOf(row[date]!, style)));
  const order = run === 1 ? "forward" : run === -1 ? "reverse" : undefined;
  /** How well a column of balances follows from a column of amounts in this file. */
  const follow = (nets: readonly (number | null)[], balances: readonly (number | null)[]): Chain => chain(within(nets), within(balances), order);
  /** A column out and a column in: never both on one line, each with one sign throughout, neither empty. */
  const apart = (a: number, b: number): boolean => {
    const [x, y] = [column(a), column(b)];
    const oneSign = (values: readonly (number | null)[]): boolean => !(values.some((v) => v !== null && v > 0) && values.some((v) => v !== null && v < 0)) && values.some((v) => v);
    return oneSign(x) && oneSign(y) && x.every((v, i) => !v || !y[i]);
  };
  /** What a line with a column out and a column in comes to: in less out. */
  const net = (out: number, into: number): (number | null)[] => {
    const [o, i] = [column(out), column(into)];
    return o.map((v, n) => (v === null && i[n] === null ? null : Math.abs(i[n] ?? 0) - Math.abs(v ?? 0)));
  };

  // --- the kind of account, as far as the caller or the file says
  const stated = named.kind?.length ? new Set(sample.map((row) => kindOf(row[named.kind![0]!]!))) : null;
  // (the file's own word, where every line has the same one, before the caller's: the bank knows what it exported)
  const kind: AccountKind | undefined = (stated?.size === 1 ? [...stated][0] : undefined) ?? hints.kind;
  /** A credit card's balance is printed as what is owed: a positive number that purchases push up. */
  const owed = (balance: number): boolean => kind === "credit" && column(balance).filter((v) => v !== null && v > 0).length >= column(balance).filter((v) => v !== null && v < 0).length;

  // --- the money
  /** A column whose every word says which way a line went ("DEBIT", "CR"). Amounts with no sign of their own take theirs from it. */
  const says = (c: number): boolean => sample.some((row) => row[c] !== "") && sample.every((row) => row[c] === "" || wayOf(row[c]!) !== null);
  const marker = [...(named.type ?? []), ...(named.description ?? []), ...all.filter((c) => !taken.has(c))].find(says);
  const ways = marker === undefined ? null : data.map((row) => wayOf(row[marker]!));
  const unsigned = (c: number): boolean => ways !== null && column(c).every((v) => v === null || v >= 0);
  /** A column's numbers as amounts: with the marker's sign when they have none of their own. */
  const amounts = (c: number): (number | null)[] => (ways !== null && unsigned(c) ? column(c).map((v, i) => (v !== null && ways[i] === "out" ? flip(v) : v)) : column(c));
  let amount: CsvAmount | undefined;
  // (the balance after each line, before the "available" balance some files give beside it)
  const lesser = (c: number): boolean => /avail|dispon|可用/.test(plain(names[c] ?? ""));
  let balance: number | undefined = named.balance?.find((c) => !lesser(c)) ?? named.balance?.[0];
  if (named.out?.length && named.in?.length) {
    amount = { kind: "split", out: named.out[0]!, in: named.in[0]! };
  } else if (named.amount?.length) {
    // one column of amounts, or one per currency ("CAD$", "USD$")
    const tagged = named.amount.filter((c) => currencyIn(names[c]!));
    const several = new Set(tagged.map((c) => currencyIn(names[c]!))).size > 1;
    amount = { kind: "signed", columns: (several ? tagged.slice(0, 4) : [named.amount[0]!]).map((c) => ({ column: c, ...(currencyIn(names[c]!) ? { currency: currencyIn(names[c]!)! } : {}) })), out: "minus" };
  } else {
    // No names to go by, or only one of a pair. A balance that follows from the amounts says which column is which.
    for (const c of [...(named.out ?? []), ...(named.in ?? [])]) taken.delete(c);
    const numeric = all.filter((c) => !taken.has(c) && c !== balance && isAmounts(c));
    // (a column of nothing but 0.00, a fee that was never charged, is not where the money is)
    const candidates = numeric.filter((c) => isMoney(c) && column(c).some((v) => v)).slice(0, 8);
    if (candidates.length === 0) return numeric.length || balance !== undefined ? "unclear" : "none";
    // Every way of reading the money that a balance bears out: a column out and a column in, or one column with a sign, and the
    // column that follows from them. The reading that accounts for the most steps of its balance is taken: a column of fees beside the
    // amounts can pair up with one of them and still follow nine steps in ten. Two readings that account for as many leave it open.
    const readings: { amount: CsvAmount; balance: number; found: Chain }[] = [];
    for (const z of balance !== undefined ? [balance] : candidates) {
      for (const x of candidates) {
        for (const y of candidates) {
          if (x >= y || x === z || y === z || !apart(x, y)) continue;
          const found = follow(net(x, y), column(z));
          if (!follows(found)) continue;
          // the balance goes up with y and down with x: when it is money you have, x is money out; when it is money you owe, y is
          const outFirst = (found.rho === 1) !== owed(z);
          readings.push({ amount: { kind: "split", out: outFirst ? x : y, in: outFirst ? y : x }, balance: z, found });
        }
      }
      for (const c of candidates) {
        if (c === z || columns[c]!.filled * 20 < sample.length * 19) continue;
        const found = follow(amounts(c), column(z));
        if (follows(found)) readings.push({ amount: { kind: "signed", columns: [{ column: c }], out: "minus" }, balance: z, found });
      }
    }
    readings.sort((one, other) => other.found.hits - one.found.hits);
    if (readings.length > 1 && readings[0]!.found.hits === readings[1]!.found.hits) return "unclear";
    const best = readings[0];
    if (best) {
      amount = best.amount;
      balance = best.balance;
      // (not told the kind, a balance that goes up with the first of two columns is a bank account with money in first, or a card that prints what is owed)
      if (best.amount.kind === "split" && best.found.rho === -1 && kind === undefined) doubts.push("sign-guessed");
    }
    if (!amount) {
      // No balance to go by. One pair of columns that are never both filled is money out and money in; one column filled on every line is the amount.
      const pairs = candidates.flatMap((x) => candidates.filter((y) => x < y && apart(x, y)).map((y) => [x, y] as const));
      const whole = candidates.filter((c) => columns[c]!.filled * 20 >= sample.length * 19);
      if (pairs.length === 1) {
        // by custom the column for money out comes first; when the second holds more lines than the first, say that this was assumed
        const [first, second] = pairs[0]!;
        amount = { kind: "split", out: first, in: second };
        if (column(first).filter((v) => v).length < column(second).filter((v) => v).length) doubts.push("sign-guessed");
      } else if (pairs.length === 0 && (whole.length === 1 || candidates.length === 1)) {
        amount = { kind: "signed", columns: [{ column: whole[0] ?? candidates[0]! }], out: "minus" };
      } else {
        return "unclear";
      }
    }
    // a name beats the order of the columns
    if (amount.kind === "split" && (named.out?.[0] === amount.in || named.in?.[0] === amount.out)) amount = { kind: "split", out: amount.in, in: amount.out };
  }

  // --- an amount with no sign of its own, and a word beside it that says which way each line went
  if (amount.kind === "signed" && amount.columns.length === 1 && marker !== undefined && unsigned(amount.columns[0]!.column)) amount = { kind: "marked", column: amount.columns[0]!.column, mark: marker };

  // --- which sign is money out, for a column with a sign
  if (amount.kind === "signed") {
    const firsts = column(amount.columns[0]!.column);
    const values = amount.columns.flatMap((entry) => column(entry.column));
    const found = balance !== undefined && amount.columns.length === 1 ? follow(firsts, column(balance)) : null;
    if (found && follows(found)) {
      // the balance settles it: it goes up by what comes in, unless it is what is owed on a card
      amount.out = (found.rho === 1) !== owed(balance!) ? "minus" : "plus";
      // A balance that goes down as the amounts go up is a bank account that writes money out as a plus, or a card that prints what is
      // owed. Not told which, the reader keeps to the bank account, and says that it assumed.
      if (found.rho === -1 && kind === undefined) doubts.push("sign-guessed");
    } else if (kind !== "credit") {
      // a bank account's export writes money out with a minus; with no minus anywhere, that can't be seen
      amount.out = "minus";
      if (!values.some((v) => v !== null && v < 0)) doubts.push("sign-guessed");
    } else {
      // On a card, exports go both ways. A payment is money in, so the sign its lines carry is the sign of money in.
      const words = [...(named.description ?? []), ...all.filter((c) => !taken.has(c) && !isAmounts(c))];
      const payments = data.map((row, i) => (words.some((c) => PAYMENT.test(plain(row[c]!))) ? firsts[i] : null)).filter((v): v is number => typeof v === "number" && v !== 0);
      const minus = payments.filter((v) => v < 0).length;
      if (payments.length > 0 && minus * 2 !== payments.length) amount.out = minus * 2 > payments.length ? "plus" : "minus";
      else {
        // nothing to go by but the count: most lines on a card are purchases
        amount.out = values.filter((v) => v !== null && v > 0).length >= values.filter((v) => v !== null && v < 0).length ? "plus" : "minus";
        doubts.push("sign-guessed");
      }
    }
  }
  for (const c of amount.kind === "signed" ? amount.columns.map((entry) => entry.column) : amount.kind === "split" ? [amount.out, amount.in] : [amount.column, amount.mark]) taken.add(c);

  // --- the balance, once more
  const nets = amount.kind === "split" ? net(amount.out, amount.in) : amount.kind === "marked" ? amounts(amount.column) : amount.columns.length === 1 ? column(amount.columns[0]!.column) : null;
  if (balance !== undefined && nets) {
    // A column called a balance that doesn't follow from the amounts at all is not the balance after each line (today's balance, say, repeated on every
    // line). It is left out, and the person gives the closing balance (ACC-2), rather than every import from this bank failing to reconcile.
    const found = follow(nets, column(balance));
    if (found.steps > 0 && found.hits * 2 < found.steps) balance = undefined;
  }
  // a balance nobody named: the one column of numbers that follows from the amounts (two that do differ by a fixed sum, and nothing says which is the balance)
  if (balance === undefined && nets) {
    const following = all.filter((c) => !taken.has(c) && isAmounts(c) && follows(follow(nets, column(c))));
    if (following.length === 1) balance = following[0];
  }
  if (balance !== undefined) taken.add(balance);

  // --- the wording: the columns named for it, or else the columns of words that say something different from line to line
  const word = amount.kind === "marked" ? amount.mark : undefined;
  let type = named.type?.find((c) => c !== word);
  /** A column that says one of a few short things: the kind of line, not its wording. */
  const few = (c: number): boolean => sample.length >= 8 && columns[c]!.distinct <= Math.max(3, sample.length / 50) && columns[c]!.length <= columns[c]!.filled * 14;
  const telling = (c: number): boolean => columns[c]!.distinct > 1 || sample.length < 3;
  let description = (named.description ?? []).filter((c) => c !== word).slice(0, 4);
  if (description.length > 1) {
    // the same words on every line are the holder's name or the account's, never a line's own (IMP-6)
    if (description.some(telling)) description = description.filter(telling);
    const sorts = description.filter(few);
    if (type === undefined && sorts.length === 1 && description.length > 1) {
      type = sorts[0]!;
      description = description.filter((c) => c !== type);
    }
  }
  if (description.length === 0) {
    const worded = all.filter((c) => !taken.has(c) && columns[c]!.filled > 0 && columns[c]!.worded * 2 >= columns[c]!.filled);
    const lines = worded.filter((c) => telling(c) && !few(c));
    description = (lines.length ? lines : worded.slice(0, 1)).slice(0, 3);
  }

  const layout: CsvLayout = {
    delimiter: table.delimiter,
    width: table.width,
    header: table.names !== null,
    ...(table.names ? { names: table.names.map((name) => shown(name, 40)) } : {}),
    date,
    dateStyle: style,
    ...(bought === undefined ? {} : { bought }),
    description,
    amount,
    decimal,
    ...(balance === undefined ? {} : { balance }),
    ...(account === undefined ? {} : { account }),
    ...(named.kind?.length ? { kind: named.kind[0]! } : {}),
    ...(type === undefined ? {} : { type }),
    ...(named.status?.length ? { status: named.status[0]! } : {}),
    ...(named.currency?.length ? { currency: named.currency[0]! } : {}),
    ...(named.ref?.length ? { ref: named.ref[0]! } : {}),
    ...(named.cheque?.length ? { cheque: named.cheque[0]! } : {}),
  };
  return { layout, doubts };
}

/**
 * The order of a date column's numbers. Written with the month's name or with the year first, a
 * date reads one way. "03/04/2026" reads two ways, and only two things settle it: a line that is
 * a real day only one way round (there is no 13th month), or a reading that would put a line in
 * the future. Short of that the statement says the order was assumed, and the person is asked:
 * a week of lines written month first and four monthly lines written day first look the same.
 * What is assumed is the reading in which the day is the number that changes, or else month first.
 *
 * Null when the column can't be read: "26/10/05" with the year first reads as a real day the
 * wrong way round (26 October 2005), so a column whose "years" change from line to line while its
 * "days" stand still is refused, not read.
 */
function dateStyle(sample: readonly string[][], column: Column, c: number, today: Day | undefined, doubts: Warning[]): DateStyle | null {
  const most = Math.max(column.days.YMD, column.days.MDY, column.days.DMY);
  if (most === 0) return null;
  const fits = STYLES.filter((style) => column.days[style] === most);
  if (column.open === 0) return fits[0]!;
  const parts = sample.map((row) => /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/.exec(row[c]!)).filter((m): m is RegExpExecArray => m !== null);
  const distinct = (n: 1 | 2 | 3): number => new Set(parts.map((m) => Number(m[n]))).size;
  if (parts.length >= 3 && parts.every((m) => m[3]!.length === 2) && distinct(3) >= 3 && distinct(1) <= 2) return null;
  if (!(fits.includes("MDY") && fits.includes("DMY"))) return fits[0]!;
  // both readings give a real day on every line
  if (today) {
    const late = (style: DateStyle): number => sample.filter((row) => (dayOf(row[c]!, style) ?? "") > today).length;
    if (late("MDY") === 0 && late("DMY") > 0) return "MDY";
    if (late("DMY") === 0 && late("MDY") > 0) return "DMY";
  }
  doubts.push("date-order-guessed");
  return distinct(1) > distinct(2) ? "DMY" : "MDY";
}

// ---------------------------------------------------------------------------------------------
// Reading with a layout
// ---------------------------------------------------------------------------------------------

/** Is this a layout: from storage, or from the screen where a person corrected one? Every column inside the table, and the money in columns of its own. */
export function isCsvLayout(x: unknown): x is CsvLayout {
  if (typeof x !== "object" || x === null) return false;
  const l = x as Record<string, unknown>;
  const width = l.width;
  if (typeof width !== "number" || !Number.isInteger(width) || width < 2 || width > 100) return false;
  const col = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < width;
  const maybe = (v: unknown): boolean => v === undefined || col(v);
  if (!DELIMITERS.includes(l.delimiter as Delimiter) || typeof l.header !== "boolean" || !col(l.date) || !STYLES.includes(l.dateStyle as DateStyle)) return false;
  if (l.decimal !== "." && l.decimal !== ",") return false;
  if (l.names !== undefined && !(l.header && Array.isArray(l.names) && l.names.length === width && l.names.every((name) => typeof name === "string" && name.length <= 60))) return false;
  if (!Array.isArray(l.description) || l.description.length > 6 || !l.description.every(col)) return false;
  if (![l.bought, l.balance, l.account, l.kind, l.type, l.status, l.currency, l.ref, l.cheque].every(maybe)) return false;
  const a = l.amount as Record<string, unknown> | null;
  if (typeof a !== "object" || a === null) return false;
  const free = (c: unknown): boolean => c !== l.date && c !== l.balance;
  if (a.kind === "split") return col(a.out) && col(a.in) && a.out !== a.in && free(a.out) && free(a.in);
  if (a.kind === "marked") return col(a.column) && col(a.mark) && a.column !== a.mark && free(a.column);
  if (a.kind !== "signed" || (a.out !== "minus" && a.out !== "plus") || !Array.isArray(a.columns) || a.columns.length < 1 || a.columns.length > 4) return false;
  return a.columns.every((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as { column?: unknown; currency?: unknown };
    return col(e.column) && free(e.column) && (e.currency === undefined || isCurrency(e.currency));
  });
}

/** One row, read: a line, or a row that only states a balance (`blank`). */
type Row = { account: string; kind?: AccountKind; currency: string; line: ParsedLine; stated: number | null; blank: boolean };

function readRows(table: Table, layout: CsvLayout, hints: CsvHints, doubts: readonly Warning[]): CsvRead {
  const base = isCurrency(hints.currency) ? hints.currency : "CAD";
  const data = table.rows;
  if (data.length > MAX_LINES) return { ok: false, error: "too-long" };
  const groups = new Map<string, Row[]>();
  let unread = table.stray;
  let pending = 0;
  let empty = 0;
  let read = 0;
  const amount = layout.amount;
  const cell = (row: readonly string[], c: number | undefined): string => (c === undefined ? "" : (row[c] ?? ""));

  for (const row of data) {
    if (layout.status !== undefined && PENDING.test(plain(cell(row, layout.status)))) {
      pending++;
      continue;
    }
    const posted = dayOf(cell(row, layout.date), layout.dateStyle);
    if (!posted) {
      unread++;
      continue;
    }
    const says = cell(row, layout.currency).toUpperCase();
    let currency = isCurrency(says) ? says : base;
    const number = cell(row, layout.account);
    const kind = kindOf(cell(row, layout.kind)) ?? kindOf(number) ?? hints.kind;

    // the money, with our sign: positive is into the account
    let value: number | null = null;
    let blank = false;
    if (amount.kind === "signed") {
      const entry = amount.columns.find((e) => cell(row, e.column) !== "");
      if (!entry) blank = true;
      else {
        currency = entry.currency ?? currency;
        const got = amountOf(cell(row, entry.column), layout.decimal, currency);
        if (got) value = got.way ? signed(got) : amount.out === "minus" ? got.value : flip(got.value);
      }
    } else if (amount.kind === "split") {
      const [out, into] = [cell(row, amount.out), cell(row, amount.in)];
      if (out === "" && into === "") blank = true;
      else {
        const o = out === "" ? 0 : amountOf(out, layout.decimal, currency)?.value;
        const i = into === "" ? 0 : amountOf(into, layout.decimal, currency)?.value;
        // (money out and money in on one line can't both be meant: the line is left out and said so)
        if (o !== undefined && i !== undefined && !(o !== 0 && i !== 0)) value = Math.abs(i) - Math.abs(o);
      }
    } else {
      const text = cell(row, amount.column);
      if (text === "") blank = true;
      else {
        const got = amountOf(text, layout.decimal, currency);
        const way = got?.way ?? wayOf(cell(row, amount.mark));
        if (got && way) value = way === "in" ? Math.abs(got.value) : flip(Math.abs(got.value));
      }
    }
    let stated: number | null = null;
    if (layout.balance !== undefined && cell(row, layout.balance) !== "") {
      const got = amountOf(cell(row, layout.balance), layout.decimal, currency);
      // "CR" beside a balance is money you have and "DR" money you owe; on a card the plain number is what is owed, so there they turn round
      if (got) stated = got.way === undefined ? got.value : (got.way === "in") === (kind !== "credit") ? got.value : flip(got.value);
    }
    if (blank && stated === null) {
      empty++; // a row with a day and no money on it at all: a note
      continue;
    }
    if (!blank && (value === null || !isMinor(value))) {
      unread++;
      continue;
    }
    const words = layout.description.map((c) => shown(cell(row, c), 200)).filter((word, i, list) => word !== "" && list.indexOf(word) === i);
    const bought = layout.bought === undefined ? null : dayOf(cell(row, layout.bought), layout.dateStyle);
    const type = shown(cell(row, layout.type), 40).toUpperCase();
    const ref = tidy(cell(row, layout.ref), 80);
    const cheque = cell(row, layout.cheque).replace(/\D/g, "").slice(0, 20);
    const line: ParsedLine = {
      posted,
      ...(bought && bought !== posted ? { date: bought } : {}),
      amount: value ?? 0,
      description: words[0] ?? "",
      ...(words.length > 1 ? { memo: tidy(words.slice(1).join(" ")) } : {}),
      ...(type ? { type } : {}),
      ...(ref ? { ref } : {}),
      ...(/[1-9]/.test(cheque) ? { cheque } : {}),
    };
    const key = `${number}\n${currency}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = []));
    group.push({ account: number, ...(kind ? { kind } : {}), currency, line, stated, blank });
    if (!blank) read++;
  }
  // a layout that reads nothing, or leaves more than a few rows unread, does not fit this file
  if (read === 0) return { ok: false, error: unread > 0 || empty > 0 ? "layout-unclear" : "no-lines" };
  if (unread > Math.max(2, (read + unread) / 20)) return { ok: false, error: "layout-unclear" };

  const statements: ParsedStatement[] = [];
  for (const rows of groups.values()) {
    if (rows.every((r) => r.blank)) continue;
    // oldest first: the days say which way the file runs; when they don't, the balance does
    const run = direction(rows.map((r) => r.line.posted));
    const has = rows.some((r) => r.stated !== null);
    // The balance with our sign. What is owed on a card is printed as a positive number that purchases push up: here it is a negative balance.
    const kind = rows.find((r) => r.kind)?.kind;
    const printedOwed = kind === "credit" && rows.filter((r) => r.stated !== null && r.stated > 0).length >= rows.filter((r) => r.stated !== null && r.stated < 0).length;
    const found = has
      ? chain(
          rows.map((r) => r.line.amount),
          rows.map((r) => r.stated),
          run === 1 ? "forward" : run === -1 ? "reverse" : undefined,
          printedOwed ? -1 : 1,
        )
      : null;
    const believed = found !== null && follows(found);
    if (run === -1 || (run === 0 && believed && found.order === "reverse")) rows.reverse();
    const owed = believed ? found.rho === -1 : printedOwed;
    const lines = rows.map((r) => (r.stated === null ? r.line : { ...r.line, balance: owed ? flip(r.stated) : r.stated }));
    const ends = has ? runningBalances(lines) : null;
    const kept = lines.filter((_, i) => !rows[i]!.blank);
    const warnings: Warning[] = [...doubts];
    if (pending) warnings.push("pending-left-out");
    if (unread) warnings.push("lines-left-out");
    if (!ends) warnings.push("no-closing-balance");
    const last4 = lastFour(rows[0]!.account);
    statements.push({
      parser: "csv",
      account: { ...(kind ? { kind } : {}), currency: rows[0]!.currency, ...(last4 ? { last4 } : {}) },
      ...(ends ? { opening: ends.opening, closing: ends.closing, closingAsOf: kept.reduce((latest, l) => (l.posted > latest ? l.posted : latest), kept[0]!.posted) } : {}),
      lines: kept,
      unread,
      warnings,
    });
  }
  return { ok: true, statements, layout };
}

/** The sums have to stay exact: a file whose amounts add up past what a number holds is refused. */
function finish(read: CsvRead): CsvRead {
  if (!read.ok) return read;
  try {
    for (const statement of read.statements) statement.lines.reduce((sum, line) => add(sum, line.amount), 0);
    return read;
  } catch {
    return { ok: false, error: "malformed" };
  }
}

const refused = (e: unknown): CsvRead => ({ ok: false, error: e instanceof CsvError && e.code === "too-many-rows" ? "too-long" : "malformed" });

/**
 * Reads a CSV text from any bank: works its layout out, reads it, and hands back the statements
 * (one per account in the file; the lines in the file's own order, turned round when it lists the
 * newest first) with the layout used. `layout-unclear` when
 * the file is a table of dated numbers but the reader can't tell which column is which: the
 * screen then asks (`csvPreview`), and reads it again with `readCsvAs`. `no-parser` when it isn't
 * a table of dated amounts at all.
 */
export function readAnyCsv(text: string, hints: CsvHints = {}): CsvRead {
  try {
    const tables = tablesOf(text);
    // (no table: text that isn't one, or a CSV file that breaks off inside a quoted field)
    if (tables.length === 0) return { ok: false, error: split(text, ",") ? "no-parser" : "malformed" };
    let unclear = false;
    for (const table of tables) {
      if (table.rows.length === 0 || !dated(table)) continue;
      const guessed = guess(table, hints);
      if (guessed === "none") continue;
      const read = guessed === "unclear" ? null : finish(readRows(table, guessed.layout, hints, guessed.doubts));
      if (read && (read.ok || read.error !== "layout-unclear")) return read;
      unclear = true;
    }
    if (unclear) return { ok: false, error: "layout-unclear" };
    // column names and nothing under them: an export of a month in which nothing happened, if the names are a statement's
    const roles = new Set(tables[0]!.rows.length === 0 ? (tables[0]!.names ?? []).map(roleOf) : []);
    const statement = (roles.has("date") || roles.has("posted")) && (roles.has("amount") || roles.has("out") || roles.has("in"));
    return { ok: false, error: statement ? "no-lines" : "no-parser" };
  } catch (e) {
    return refused(e);
  }
}

/**
 * Reads a CSV text with a layout a person confirmed or corrected, or one kept with the account
 * from an earlier file. `layout-unclear` when the layout does not fit this file: another width,
 * other column names, or rows it can't read.
 */
export function readCsvAs(text: string, layout: CsvLayout, hints: CsvHints = {}): CsvRead {
  if (!isCsvLayout(layout)) return { ok: false, error: "layout-unclear" };
  try {
    const table = tablesOf(text, layout.delimiter, layout.width)[0];
    if (!table || (table.names !== null) !== layout.header) return { ok: false, error: "layout-unclear" };
    if (layout.names && table.names && layout.names.some((name, c) => plain(name) !== plain(shown(table.names![c]!, 40)))) return { ok: false, error: "layout-unclear" };
    if (table.rows.length === 0) return { ok: false, error: "no-lines" };
    return finish(readRows(table, layout, hints, []));
  } catch (e) {
    return refused(e);
  }
}
