/**
 * Duplicates (ACC-3): lines of a new file that the account already holds, found before anything is
 * saved and shown to the user. Only ever within one account of one user.
 *
 * Three answers for each incoming line:
 *
 * - `exact`: it is already there. Either the bank's own identifier for the line matches (`ref`,
 *   OFX's FITID) together with the day and the amount, or the day, the amount and the wording all
 *   match. Two coffees at the same price on the same day are two lines, so lines are matched one
 *   for one: if the account holds one and the file has two, one is a duplicate and one is new. An
 *   identifier alone is never enough: some banks number each file's lines from 1 again, and a new
 *   line must not be thrown away because an old one had the same number.
 * - `likely`: same amount, a day within `window` of a line the account holds that nothing else
 *   matched, and a day the account's earlier imports already cover. This is what the same
 *   statement looks like when it arrives a second time in another format (the CSV after the QFX):
 *   the wording and the day differ a little. The user decides.
 * - `fresh`: new.
 */
import { daysBetween, type Day } from "./dates";
import { fold } from "./text";

/** A line the account already holds. */
export type Held = { id: string; posted: Day; amount: number; description: string; ref?: string };
/** A line of the file being imported. */
export type Incoming = { posted: Day; amount: number; description: string; ref?: string };

export type Duplicates = {
  /** Indexes into the incoming lines that are new. */
  fresh: number[];
  /** Already held. `held` is the matching line's id. */
  exact: { index: number; held: string; by: "ref" | "content" }[];
  /** Probably already held: for the user to look at. `days` is how far apart the two posting days are. */
  likely: { index: number; held: string; days: number }[];
};

const contentKey = (l: { posted: Day; amount: number; description: string }): string => `${l.posted}|${l.amount}|${fold(l.description)}`;

export function findDuplicates(held: readonly Held[], incoming: readonly Incoming[], options: { window?: number } = {}): Duplicates {
  const window = options.window ?? 3;
  const out: Duplicates = { fresh: [], exact: [], likely: [] };
  const used = new Set<string>(); // held lines already matched
  const byRef = new Map<string, Held[]>();
  for (const h of held) {
    if (!h.ref) continue;
    const list = byRef.get(h.ref);
    if (list) list.push(h);
    else byRef.set(h.ref, [h]);
  }

  // 1. the bank's own identifier, on the same day for the same amount
  const rest: number[] = [];
  incoming.forEach((line, index) => {
    const h = line.ref ? byRef.get(line.ref)?.find((x) => !used.has(x.id) && x.posted === line.posted && x.amount === line.amount) : undefined;
    if (h) {
      used.add(h.id);
      out.exact.push({ index, held: h.id, by: "ref" });
    } else rest.push(index);
  });

  // 2. the same day, amount and wording, one for one
  const byContent = new Map<string, Held[]>();
  for (const h of held) {
    if (used.has(h.id)) continue;
    const key = contentKey(h);
    const list = byContent.get(key);
    if (list) list.push(h);
    else byContent.set(key, [h]);
  }
  const unmatched: number[] = [];
  for (const index of rest) {
    const h = byContent.get(contentKey(incoming[index]!))?.shift();
    if (h) {
      used.add(h.id);
      out.exact.push({ index, held: h.id, by: "content" });
    } else unmatched.push(index);
  }

  // 3. the same amount, a day close by, inside what was imported before: nearest days first
  const covered = held.reduce<Day | null>((latest, h) => (latest === null || h.posted > latest ? h.posted : latest), null);
  const byAmount = new Map<number, Held[]>();
  for (const h of held) {
    if (used.has(h.id)) continue;
    const list = byAmount.get(h.amount);
    if (list) list.push(h);
    else byAmount.set(h.amount, [h]);
  }
  const candidates: { index: number; held: Held; days: number }[] = [];
  for (const index of unmatched) {
    const line = incoming[index]!;
    if (covered === null || line.posted > covered) continue;
    for (const h of byAmount.get(line.amount) ?? []) {
      const days = Math.abs(daysBetween(h.posted, line.posted));
      if (days <= window) candidates.push({ index, held: h, days });
    }
  }
  candidates.sort((a, b) => a.days - b.days || a.index - b.index);
  const taken = new Set<number>();
  for (const c of candidates) {
    if (taken.has(c.index) || used.has(c.held.id)) continue;
    taken.add(c.index);
    used.add(c.held.id);
    out.likely.push({ index: c.index, held: c.held.id, days: c.days });
  }
  for (const index of unmatched) if (!taken.has(index)) out.fresh.push(index);
  out.exact.sort((a, b) => a.index - b.index);
  out.likely.sort((a, b) => a.index - b.index);
  return out;
}
