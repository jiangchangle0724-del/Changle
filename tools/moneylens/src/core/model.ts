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
import type { Day } from "./dates";

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
  | "other-currency-lines"; // lines in a currency that isn't the account's were kept as printed (IN-4)

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
  | "pdf-not-yet" // a PDF: not read in this version
  | "no-parser" // text, but no bank's parser recognizes its layout
  | "malformed" // recognized, but it breaks its own format
  | "too-long" // more lines than one file may hold
  | "no-accounts" // a well-formed file with no chequing, savings or credit card account in it
  | "no-lines"; // an account with nothing posted in it

export type ReadResult = { ok: true; statements: ParsedStatement[] } | { ok: false; error: ImportError };

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
