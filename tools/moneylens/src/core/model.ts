/**
 * The shapes MoneyLens works with. Two stages:
 *
 * - what a parser reads out of one file (`ParsedStatement`, `ParsedLine`): nothing has an
 *   identifier yet, nothing is saved, and the user sees it as a preview first (IMP-6);
 * - what is kept in the vault once the user confirms (`Account`, `Txn`, `ImportRecord`).
 *
 * Amounts are whole numbers of the currency's smallest unit; positive is money into the account
 * (money.ts). Days are "YYYY-MM-DD" (dates.ts).
 */
import type { DateStyle, Day } from "./dates";

/** The account types of the first release (IN-3). */
export type AccountKind = "chequing" | "savings" | "credit";

/** One posted line of a statement, as a parser reads it. */
export type ParsedLine = {
  /** The day it was posted to the account (ACC-5). */
  posted: Day;
  /** The day of the transaction itself, when the statement gives one and it differs. */
  date?: Day;
  /** In the account's currency. Positive: into the account. */
  amount: number;
  /** The statement's wording, tidied, with account and card numbers cut to four digits (IMP-6). */
  description: string;
  /** A second line of wording, when the statement has one. */
  memo?: string;
  /** The statement's own word for the kind of line (OFX: DEBIT, CREDIT, POS, XFER, PAYMENT, FEE…), capitals. */
  type?: string;
  /** The statement's own identifier for the line (OFX FITID). The same line in another file of the same account carries the same one, at banks that keep them stable. */
  ref?: string;
  /** A cheque number. */
  cheque?: string;
  /** A purchase in another currency (ACC-6): that currency, and what the statement prints of the original amount (in that currency's smallest unit) and of the rate. Never worked out here. */
  foreign?: { currency: string; amount?: number; rate?: string };
  /** The account's balance after this line, when the file gives a running balance. */
  balance?: number;
};

/** What went wrong or was left out while reading, as a code. Never a piece of the file (OBS-1). */
export type Warning =
  | "pending-left-out" // lines not posted yet were skipped (ACC-5)
  | "investment-left-out" // an investment account in the file was skipped (IN-3)
  | "lines-left-out" // lines that couldn't be read were skipped; the count is in `unread`
  | "no-closing-balance"
  | "other-currency-lines" // lines in a currency that isn't the account's were kept as printed (IN-4)
  // The two things a CSV file can leave open (anycsv.ts). The preview asks the person, and the answer is kept with the account.
  | "date-order-guessed" // which number in "03/04/2026" is the month was assumed; nothing in the file settles it
  | "sign-guessed"; // which amounts are money out was assumed, not read off the file

/** One account's part of one file. */
export type ParsedStatement = {
  /** The named parser that read it (IMP-3), e.g. "ofx". */
  parser: string;
  /** The institution, when the file names it. */
  institution?: string;
  account: {
    kind?: AccountKind;
    currency: string;
    /** The last four digits of the account or card number. The rest never leaves the parser (IMP-6). */
    last4?: string;
  };
  /** The period the file says it covers. */
  from?: Day;
  to?: Day;
  /** Balances the file states (ACC-2): before the first line, and after the last one. */
  opening?: number;
  closing?: number;
  /** The day the closing balance is as of. */
  closingAsOf?: Day;
  /** Posted lines, oldest first. */
  lines: ParsedLine[];
  /** How many lines couldn't be read and were skipped. */
  unread: number;
  warnings: Warning[];
};

/** Why a file was refused. Nothing of it is saved (IMP-3, T-11). */
export type ImportError =
  | "empty"
  | "too-big"
  | "not-a-statement" // a photo, a spreadsheet, a web page, anything that isn't a statement export
  | "pdf-not-yet" // a PDF handed over as bytes: its text has to be taken out first (web/pdf.ts), and is then read by pdfstatement.ts
  | "no-parser" // text, but not a table of dated amounts
  | "layout-unclear" // a table, but which column is the day or the money can't be told: the person says (anycsv.ts)
  | "malformed" // recognized, but it breaks its own format
  | "too-long" // more lines than one file may hold
  | "no-accounts" // a well-formed file with no chequing, savings or credit card account in it
  | "no-lines"; // an account with nothing posted in it

/** What reading a file gives: the statements in it (one per account), or the one reason it was refused. A CSV file also gives the layout it was read with. */
export type ReadResult = { ok: true; statements: ParsedStatement[]; layout?: CsvLayout } | { ok: false; error: ImportError };

/**
 * How one bank's CSV export is laid out: worked out from the file (anycsv.ts), shown to the person
 * in the preview, corrected there if it is wrong (IMP-6), and then kept with the account so that
 * the next file from the same bank is read the same way. Columns count from 0.
 */
export type CsvLayout = {
  delimiter: "," | ";" | "\t" | "|";
  /** How many fields a row of the table has. Rows of another width (a title above it, a total under it) are not part of it. */
  width: number;
  /** Does the table start with a row of column names? */
  header: boolean;
  /** Those names, as the file gave them. A later file whose names differ is not in this layout, and is worked out afresh. */
  names?: string[];
  /** The column of the day a line was posted, and the order its numbers are written in. */
  date: number;
  dateStyle: DateStyle;
  /** The column of the day of the purchase itself, in a file that gives both. */
  bought?: number;
  /** The columns of wording: the first is the description, the others are joined as the memo. */
  description: number[];
  amount: CsvAmount;
  /** The mark before the cents. */
  decimal: "." | ",";
  /** The balance after each line. */
  balance?: number;
  /** The account or card number, in a file that holds more than one account. Only its last four digits are kept. */
  account?: number;
  /** The bank's own word for the kind of account ("Chequing", "Visa"). */
  kind?: number;
  /** The bank's own word for the kind of line. */
  type?: number;
  /** Says whether a line is posted or still pending (ACC-5). */
  status?: number;
  /** The currency of each line, in a file that states it line by line. */
  currency?: number;
  /** The bank's own identifier for a line, and a cheque number. */
  ref?: number;
  cheque?: number;
};

/** Where a CSV file keeps the money. */
export type CsvAmount =
  /** One column with a sign; `out` says which sign is money out of the account. Some banks give one such column per currency, named for it. */
  | { kind: "signed"; columns: { column: number; currency?: string }[]; out: "minus" | "plus" }
  /** A column for money out and a column for money in. */
  | { kind: "split"; out: number; in: number }
  /** One column without a sign, and a column whose word says which way the line went ("DEBIT", "CR"). */
  | { kind: "marked"; column: number; mark: number };

/** An account the user keeps in MoneyLens. */
export type Account = {
  id: string;
  kind: AccountKind;
  currency: string;
  /** The user's own name for it. */
  name: string;
  institution?: string;
  last4?: string;
  /** Left out of every total (an account the user stopped tracking). */
  closed?: boolean;
};

/**
 * Where a transaction's category came from (CLS-2), in CLS-1's order of precedence. "pair" is not
 * in CLS-1's list: it is a move between the user's own accounts (ACC-4), which comes right after
 * the user's own choice.
 */
export type Source = "user" | "pair" | "rule" | "alias" | "dictionary" | "ai" | "none";

/** A transaction kept in the vault. */
export type Txn = {
  id: string;
  account: string;
  posted: Day;
  date?: Day;
  amount: number;
  description: string;
  memo?: string;
  type?: string;
  ref?: string;
  cheque?: string;
  foreign?: { currency: string; amount?: number; rate?: string };
  /** The import it came with; absent for one the user typed in. */
  importId?: string;
  /** The parser that read it, so two files of the same kind compare like with like (dedupe.ts). */
  parser?: string;
  /** The category the user chose for this one transaction. It wins over everything (CLS-1). */
  category?: string;
  /** A category an AI suggested, kept so it isn't asked for twice. The lowest in precedence. */
  suggested?: { category: string; confidence: number };
  /** The user's split of this amount over categories. The parts add up to `amount`. */
  splits?: { category: string | null; amount: number; note?: string }[];
  /** The other half of a move between the user's own accounts (ACC-4): that transaction's id. */
  pair?: string;
  /** The user said this is not a move between their accounts, so it is not offered again. */
  unpaired?: boolean;
  note?: string;
};

/** One import, kept as history. */
export type ImportRecord = {
  id: string;
  account: string;
  parser: string;
  /** When it was saved (UTC, ISO 8601). */
  at: string;
  from?: Day;
  to?: Day;
  lines: number;
  duplicates: number;
  /** ACC-2: "reconciled", or one of the two reasons for the visible "unreconciled" mark. */
  reconciliation: "reconciled" | "mismatch" | "unchecked";
  opening?: number;
  closing?: number;
};
