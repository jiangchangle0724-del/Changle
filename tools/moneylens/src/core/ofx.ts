/**
 * The OFX and QFX parser: one named parser, "ofx", for every bank, because the format is a
 * standard (IMP-3). It reads both spellings: OFX 1 (SGML, where a value's tag is never closed) and
 * OFX 2 (XML). Chequing, savings and credit card statements are read; an investment statement in
 * the same file is left out (IN-3).
 *
 * What is kept of the file (IMP-6): of the account number, its last four digits; no name, no
 * address (bank and card statements in OFX carry none); descriptions with any account or card
 * number in them cut to four digits. A line's FITID is kept whole, because it is how the same line
 * is recognized in a later file (dedupe.ts); it is never shown and never leaves the vault.
 *
 * A file that is cut short or breaks the format is refused whole (T-11): a statement with lines
 * missing is worse than no statement.
 */
import { ofxDay, type Day } from "./dates";
import { exponentOf, isCurrency, isMinor } from "./money";
import type { AccountKind, ParsedLine, ParsedStatement, ReadResult, Warning } from "./model";
import { decodeText, fold, lastFour, maskNumbers, tidy, type Charset } from "./text";

/** The most lines one file may hold. */
export const MAX_LINES = 50_000;
const MAX_DEPTH = 32;
const MAX_TAGS = 2_000_000;

type Node = { name: string; value: string; children: Node[] };

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** A value's character references, turned into the characters they stand for. The result is text and is never read as markup again. */
function unescape(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (whole, ref: string) => {
    if (ref[0] !== "#") return ENTITIES[ref.toLowerCase()] ?? whole;
    const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return code > 0x1f && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : " ";
  });
}

/**
 * The file's tags as a tree. In OFX 1 only a group of values has a closing tag, so a tag is taken
 * for a group when nothing follows it but another tag. A value that was left empty looks the same
 * until its "group" turns out never to be closed: then what was read as its contents is handed
 * back to the group around it. Null when the file breaks the format.
 */
function tree(body: string): Node | null {
  const root: Node = { name: "", value: "", children: [] };
  const open: Node[] = [root];
  const tag = /<(\/?)([A-Za-z0-9_.]+)(?:\s[^<>]*)?(\/?)>([^<]*)/g;
  let count = 0;
  for (let m = tag.exec(body); m; m = tag.exec(body)) {
    if (++count > MAX_TAGS) return null;
    const name = m[2]!.toUpperCase();
    if (m[1]) {
      let at = open.length - 1;
      while (at > 0 && open[at]!.name !== name) at--;
      // (a closing tag with nothing open under that name is a value's own closing tag, as OFX 2 writes them)
      if (at === 0) continue;
      while (open.length - 1 > at) {
        // (an open tag is always the last thing in the group around it, so its contents go right after it)
        const empty = open.pop()!;
        const around = open[open.length - 1]!;
        for (const c of empty.children) around.children.push(c);
        empty.children = [];
      }
      open.pop();
      continue;
    }
    const node: Node = { name, value: tidy(unescape(m[4]!), 300), children: [] };
    open[open.length - 1]!.children.push(node);
    if (node.value === "" && !m[3]) {
      if (open.length > MAX_DEPTH) return null;
      open.push(node);
    }
  }
  // everything has to be closed by the end: a file cut short is refused, not read as far as it goes
  return open.length === 1 ? root : null;
}

const child = (node: Node | undefined, name: string): Node | undefined => node?.children.find((c) => c.name === name);
const all = (node: Node | undefined, name: string): Node[] => node?.children.filter((c) => c.name === name) ?? [];
const value = (node: Node | undefined, name: string): string => child(node, name)?.value ?? "";

/** An OFX amount: digits with a point or a comma before the cents, no grouping. Null for anything else, and for a comma followed by more digits than the currency has (which would be a thousands mark misread). */
function ofxAmount(text: string, currency: string): number | null {
  const m = /^([+-]?)(\d*)(?:([.,])(\d+))?$/.exec(text.replace(/\s/g, ""));
  if (!m || (!m[2] && !m[4])) return null;
  const places = exponentOf(currency);
  let cents = m[4] ?? "";
  if (cents.length > places) {
    if (m[3] === "," || /[^0]/.test(cents.slice(places))) return null;
    cents = cents.slice(0, places);
  }
  const digits = ((m[2] ?? "") + cents.padEnd(places, "0")).replace(/^0+(?=\d)/, "");
  if (digits.length > 14) return null;
  const amount = Number(digits);
  if (!isMinor(amount)) return null;
  return m[1] === "-" && amount !== 0 ? -amount : amount;
}

const KINDS: Readonly<Record<string, AccountKind>> = { CHECKING: "chequing", SAVINGS: "savings", MONEYMRKT: "savings", CD: "savings", CREDITLINE: "credit" };

function line(trn: Node, currency: string): ParsedLine | "other-currency" | null {
  const posted = ofxDay(value(trn, "DTPOSTED"));
  const amount = ofxAmount(value(trn, "TRNAMT"), currency);
  if (!posted || amount === null) return null;
  // <CURRENCY> says the amount itself is in another currency: there is no amount in the account's
  // own currency to keep, and MoneyLens does not convert (ACC-6)
  if (child(trn, "CURRENCY")) return "other-currency";
  const name = maskNumbers(value(trn, "NAME") || value(child(trn, "PAYEE"), "NAME"));
  const memo = maskNumbers(value(trn, "MEMO"));
  const out: ParsedLine = { posted, amount, description: tidy(name || memo) };
  if (name && memo && fold(memo) !== fold(name)) out.memo = tidy(memo);
  const date = ofxDay(value(trn, "DTUSER"));
  if (date && date !== posted) out.date = date;
  const type = value(trn, "TRNTYPE").toUpperCase();
  if (/^[A-Z]{1,20}$/.test(type)) out.type = type;
  const ref = value(trn, "FITID").slice(0, 80);
  if (ref) out.ref = ref;
  const cheque = value(trn, "CHECKNUM").replace(/^0+(?=\d)/, "").slice(0, 20);
  if (/^\d+$/.test(cheque) && cheque !== "0") out.cheque = cheque;
  const original = child(trn, "ORIGCURRENCY");
  const symbol = value(original, "CURSYM").toUpperCase();
  if (original && isCurrency(symbol) && symbol !== currency) {
    const rate = value(original, "CURRATE");
    out.foreign = { currency: symbol, ...(/^\d{1,9}(?:[.,]\d{1,12})?$/.test(rate) ? { rate: rate.replace(",", ".") } : {}) };
  }
  return out;
}

function statement(rs: Node, card: boolean, institution: string): ParsedStatement | "malformed" | "too-long" {
  const currency = value(rs, "CURDEF").toUpperCase();
  if (!isCurrency(currency)) return "malformed";
  const from = child(rs, card ? "CCACCTFROM" : "BANKACCTFROM");
  const kind = card ? "credit" : KINDS[value(from, "ACCTTYPE").toUpperCase()];
  const last4 = lastFour(value(from, "ACCTID"));
  const list = child(rs, "BANKTRANLIST");
  const warnings: Warning[] = [];
  const lines: ParsedLine[] = [];
  let unread = 0;
  let otherCurrency = 0;
  const trns = all(list, "STMTTRN");
  if (trns.length > MAX_LINES) return "too-long";
  for (const trn of trns) {
    const read = line(trn, currency);
    if (read === null) unread++;
    else if (read === "other-currency") otherCurrency++;
    else lines.push(read);
  }
  // oldest first; lines of one day stay in the file's order
  lines.sort((a, b) => (a.posted < b.posted ? -1 : a.posted > b.posted ? 1 : 0));
  if (unread) warnings.push("lines-left-out");
  if (otherCurrency) warnings.push("other-currency-lines");
  if (all(child(rs, "BANKTRANLISTP"), "STMTTRNP").length) warnings.push("pending-left-out");
  const ledger = child(rs, "LEDGERBAL");
  const closing = ledger ? ofxAmount(value(ledger, "BALAMT"), currency) : null;
  const closingAsOf = ofxDay(value(ledger, "DTASOF"));
  if (closing === null) warnings.push("no-closing-balance");
  const start: Day | null = ofxDay(value(list, "DTSTART"));
  const end: Day | null = ofxDay(value(list, "DTEND"));
  return {
    parser: "ofx",
    ...(institution ? { institution } : {}),
    account: { ...(kind ? { kind } : {}), currency, ...(last4 ? { last4 } : {}) },
    ...(start ? { from: start } : lines[0] ? { from: lines[0].posted } : {}),
    ...(end ? { to: end } : lines.length ? { to: lines[lines.length - 1]!.posted } : {}),
    ...(closing !== null ? { closing } : {}),
    ...(closing !== null && closingAsOf ? { closingAsOf } : {}),
    lines,
    unread: unread + otherCurrency,
    warnings,
  };
}

/**
 * Text in a CDATA section is plain text: its markup characters are escaped, so the tag reader
 * passes over them and `unescape` gives them back. (Done by hand, one pass: a pattern for it would
 * take a file with many unclosed sections a very long time.)
 */
function plainCdata(body: string): string {
  const OPEN = "<![CDATA[";
  let from = body.indexOf(OPEN);
  if (from < 0) return body;
  let out = "";
  let done = 0;
  while (from >= 0) {
    const end = body.indexOf("]]>", from + OPEN.length);
    if (end < 0) break;
    out += body.slice(done, from) + body.slice(from + OPEN.length, end).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    done = end + 3;
    from = body.indexOf(OPEN, done);
  }
  return out + body.slice(done);
}

/** The character set an OFX file says it is in, when it says. */
function charsetOf(bytes: Uint8Array): Charset | undefined {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 600));
  if (/ENCODING:\s*(?:UTF-8|UNICODE)/i.test(head) || /encoding\s*=\s*["']utf-8["']/i.test(head)) return "utf-8";
  if (/CHARSET:\s*1252/i.test(head) || /ENCODING:\s*USASCII/i.test(head) || /encoding\s*=\s*["'](?:windows-1252|iso-8859-1)["']/i.test(head)) return "windows-1252";
  return undefined;
}

/** Reads an OFX or QFX file: one statement per chequing, savings or credit card account in it. */
export function readOfx(bytes: Uint8Array): ReadResult {
  try {
    return read(bytes);
  } catch {
    // whatever a hostile file manages to trip, the answer is the same: refused, nothing kept
    return { ok: false, error: "malformed" };
  }
}

function read(bytes: Uint8Array): ReadResult {
  let text: string;
  try {
    const said = charsetOf(bytes);
    // (a file that says UTF-8 but isn't still gets read, as Windows-1252)
    text = said === "windows-1252" ? decodeText(bytes, said) : decodeText(bytes);
  } catch {
    return { ok: false, error: "malformed" };
  }
  const starts = text.search(/<OFX>/i);
  if (starts < 0) return { ok: false, error: "malformed" };
  const root = tree(plainCdata(text.slice(starts)));
  const ofx = child(root ?? undefined, "OFX");
  if (!ofx) return { ok: false, error: "malformed" };
  const institution = tidy(maskNumbers(value(child(child(child(ofx, "SIGNONMSGSRSV1"), "SONRS"), "FI"), "ORG")), 60);
  const statements: ParsedStatement[] = [];
  let found = 0;
  for (const [set, wrap, inner, card] of [
    ["BANKMSGSRSV1", "STMTTRNRS", "STMTRS", false],
    ["CREDITCARDMSGSRSV1", "CCSTMTTRNRS", "CCSTMTRS", true],
  ] as const) {
    for (const messages of all(ofx, set)) {
      for (const response of all(messages, wrap)) {
        const rs = child(response, inner);
        if (!rs) continue;
        found++;
        const read = statement(rs, card, institution);
        if (read === "malformed" || read === "too-long") return { ok: false, error: read };
        statements.push(read);
      }
    }
  }
  const investment = all(ofx, "INVSTMTMSGSRSV1").length > 0;
  if (!found) return { ok: false, error: "no-accounts" };
  const withLines = statements.filter((s) => s.lines.length > 0);
  if (!withLines.length) return { ok: false, error: "no-lines" };
  if (investment) for (const s of withLines) s.warnings.push("investment-left-out");
  return { ok: true, statements: withLines };
}
