/**
 * Moves between the user's own accounts (ACC-4): a transfer from chequing to savings, a payment
 * from chequing to a credit card. Each is two lines, one out of an account and one into another,
 * for the same amount a few days apart. Paired, they are left out of spending and income, because
 * no money was spent or earned.
 *
 * Pairing is cautious. The amounts must be equal, the accounts different and in the same currency,
 * the days close, and at least one of the two lines must read like a move (its wording, or the
 * bank's own type for it). When both read like one the pair is `sure` and can be applied without
 * asking; when only one does it is a suggestion for the user to confirm. Two lines that merely
 * share an amount are never paired.
 */
import { daysBetween, type Day } from "./dates";
import type { AccountKind } from "./model";
import { fold } from "./text";

export type Leg = { id: string; account: string; posted: Day; amount: number; description: string; memo?: string; type?: string; pair?: string; unpaired?: boolean };

export type Pairing = {
  /** The line that left an account, and the line that arrived in another. */
  out: string;
  in: string;
  /** Days between the two posting days. */
  days: number;
  kind: "transfer" | "card-payment";
  /** Both lines read like a move. */
  sure: boolean;
};

const MOVE_WORDS =
  /(?:^| )(?:TRANSFER|TRANSFERT|TRANSFERS|TFR|TRF|XFER|XFR|E TRANSFER|E TFR|ETRANSFER|ETFR|ETRF|VIREMENT|PAYMENT|PAIEMENT|PYMT|PMT|PAYT|THANK YOU|MERCI)(?: |$)/;
const MOVE_TYPES = new Set(["XFER", "PAYMENT"]);

/** Does this line read like a move between accounts or a card payment? */
export function looksLikeMove(line: { description: string; memo?: string; type?: string }): boolean {
  return (!!line.type && MOVE_TYPES.has(line.type)) || MOVE_WORDS.test(fold(`${line.description} ${line.memo ?? ""}`));
}

/**
 * Finds the pairs among lines not yet paired. `accounts` gives each account's kind and currency.
 * Each line is used at most once: sure pairs first, then the closest days.
 */
export function pairMoves(legs: readonly Leg[], accounts: Readonly<Record<string, { kind: AccountKind; currency: string }>>, options: { window?: number } = {}): Pairing[] {
  const window = options.window ?? 5;
  const free = legs.filter((l) => !l.pair && !l.unpaired && l.amount !== 0 && accounts[l.account]);
  const ins = new Map<string, Leg[]>();
  for (const l of free) {
    if (l.amount <= 0) continue;
    const key = `${accounts[l.account]!.currency}|${l.amount}`;
    const list = ins.get(key);
    if (list) list.push(l);
    else ins.set(key, [l]);
  }
  const candidates: (Pairing & { at: Day })[] = [];
  for (const out of free) {
    if (out.amount >= 0) continue;
    const from = accounts[out.account]!;
    const outMove = looksLikeMove(out);
    for (const into of ins.get(`${from.currency}|${-out.amount}`) ?? []) {
      if (into.account === out.account) continue;
      const days = Math.abs(daysBetween(out.posted, into.posted));
      if (days > window) continue;
      const inMove = looksLikeMove(into);
      if (!outMove && !inMove) continue;
      const card = from.kind === "credit" || accounts[into.account]!.kind === "credit";
      candidates.push({ out: out.id, in: into.id, days, kind: card ? "card-payment" : "transfer", sure: outMove && inMove, at: out.posted });
    }
  }
  candidates.sort((a, b) => Number(b.sure) - Number(a.sure) || a.days - b.days || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) || (a.out < b.out ? -1 : a.out > b.out ? 1 : 0) || (a.in < b.in ? -1 : a.in > b.in ? 1 : 0));
  const used = new Set<string>();
  const pairs: Pairing[] = [];
  for (const { at: _at, ...pair } of candidates) {
    if (used.has(pair.out) || used.has(pair.in)) continue;
    used.add(pair.out);
    used.add(pair.in);
    pairs.push(pair);
  }
  return pairs;
}
