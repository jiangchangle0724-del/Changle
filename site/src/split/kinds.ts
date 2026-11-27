/**
 * What kind of spending an expense counts as (categories.ts): the kind it keeps, else the kind its
 * own words say (its note, and the business's name), else 其他. The words each kind goes by, in both
 * languages, are in words.ts (KIND_SAYS), with everything else written in Chinese.
 */
import type { Category } from "./categories";
import type { Expense } from "./core";
import { KIND_SAYS } from "./words";

/** The kind an expense's own words say (the first kind in KIND_SAYS whose words they hold), or null when they say none. */
export function guessed(e: Pick<Expense, "note" | "merchant">): Category | null {
  const words = `${e.note} ${e.merchant ?? ""}`.normalize("NFKC");
  return KIND_SAYS.find(([, says]) => says.test(words))?.[0] ?? null;
}

/** The kind an expense counts as: the one it keeps, else the one its words say, else 其他. */
export const categoryOf = (e: Pick<Expense, "note" | "merchant" | "category">): Category => e.category ?? guessed(e) ?? "other";
