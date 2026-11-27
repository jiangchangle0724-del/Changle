/**
 * What kind of spending an expense counts as (categories.ts): the kind it keeps, else the kind its
 * own words say (its note, and the business's name), else 其他. The words each kind goes by, in both
 * languages, are in words.ts (KIND_SAYS), with everything else written in Chinese.
 */
import { CATEGORIES, type Category } from "./categories";
import { expensesOf, type Expense, type Ledger } from "./core";
import { KIND_SAYS } from "./words";

/** The kind an expense's own words say (the first kind in KIND_SAYS whose words they hold), or null when they say none. */
export function guessed(e: Pick<Expense, "note" | "merchant">): Category | null {
  const words = `${e.note} ${e.merchant ?? ""}`.normalize("NFKC");
  return KIND_SAYS.find(([, says]) => says.test(words))?.[0] ?? null;
}

/** The kind an expense counts as: the one it keeps, else the one its words say, else 其他. */
export const categoryOf = (e: Pick<Expense, "note" | "merchant" | "category">): Category => e.category ?? guessed(e) ?? "other";

export type KindSpent = { kind: Category; amount: number; count: number };

/**
 * 按分类: what each kind of spending came to in the ledger's currency (less what came back of it),
 * and how many expenses and refunds it was, the most first and 其他 last. A kind that came to
 * nothing, or less, is left out; without refunds, together they are all that was spent.
 */
export function byKind(l: Ledger): KindSpent[] {
  const sums = new Map<Category, KindSpent>();
  for (const e of expensesOf(l)) {
    const kind = categoryOf(e);
    const was = sums.get(kind) ?? { kind, amount: 0, count: 0 };
    sums.set(kind, { kind, amount: was.amount + (e.refund ? -e.amount : e.amount), count: was.count + 1 });
  }
  const last = (k: Category) => (k === "other" ? 1 : 0);
  return [...sums.values()].filter((k) => k.amount > 0).sort((a, b) => last(a.kind) - last(b.kind) || b.amount - a.amount || CATEGORIES.indexOf(a.kind) - CATEGORIES.indexOf(b.kind));
}
