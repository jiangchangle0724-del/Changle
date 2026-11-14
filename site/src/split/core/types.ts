/**
 * What a 两清 ledger is made of: the shapes only, no arithmetic. The phone keeps these, the server
 * (later) stores them, and the tests' second implementation (tests/split/) reads nothing but this.
 *
 * Money is always a whole number of the currency's smallest unit: cents for dollars, one yen for
 * yen (money.ts).
 */

/** One person in a ledger. The order of `Ledger.members` is the roster's order, and never changes. */
export type Member = { id: string; name: string };

/** Who an expense is shared between, and how. The ids are members' ids. */
export type Split =
  /** the same for everyone in `among` */
  | { how: "equal"; among: string[] }
  /** in proportion to whole numbers of shares (1 to 999); a member not listed (or with 0) takes no part */
  | { how: "shares"; shares: Record<string, number> }
  /** what each one owes, in smallest units; they add up to the expense */
  | { how: "exact"; amounts: Record<string, number> };

/** Something one member paid for, shared between some of them. */
export type Expense = {
  kind: "expense";
  id: string;
  /** when it was recorded (ms since 1970) */
  at: number;
  /** who paid */
  payer: string;
  /** what it cost, in the ledger's currency, in smallest units */
  amount: number;
  note: string;
  split: Split;
  /** whose turn it was for the odd cents when this was recorded (split.ts); it never changes after */
  rot: number;
  /**
   * paid in another currency: that currency's code, the amount in its smallest units, and the rate
   * used ("this many of the ledger's currency for one of that one"). Kept to show and to check;
   * `amount` is what counts, so a rate that moves later never changes an old entry.
   */
  paidIn?: { currency: string; amount: number; rate: string };
  /** when it was taken out, if it was: any number here means taken out (0 too), and it counts for nothing */
  gone?: number;
};

/** One member paying another back (已转). */
export type Transfer = {
  kind: "transfer";
  id: string;
  at: number;
  from: string;
  to: string;
  amount: number;
  gone?: number;
};

export type Entry = Expense | Transfer;

export type Ledger = {
  id: string;
  name: string;
  /** the currency everything is settled in (a code from tools/money.ts) */
  currency: string;
  members: Member[];
  entries: Entry[];
  /**
   * when its owner locked it, if it is locked: any number here means locked. A locked ledger can be
   * read and takes no changes until its owner opens it again. Only the server sets this (no change
   * a phone sends can); the sums take no notice of it.
   */
  locked?: number;
};
