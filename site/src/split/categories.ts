/**
 * 分类 (2026-11-26, borrowed from Spliit, SplitPro and Cospend, which sort expenses into kinds and
 * sum each kind up): what kind of spending an expense was. Seven kinds, for a trip or a night out.
 * Read off its receipt with the rest (tools/split/src/server/read.ts), picked by hand, or, for an
 * expense that says neither, guessed from its words (kinds.ts). Shown and summed up; what anyone
 * owes never depends on it. The server keeps it (changes.ts), so this is the kinds alone: no words.
 */
export const CATEGORIES = ["food", "groceries", "transport", "lodging", "fun", "shopping", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const isCategory = (x: unknown): x is Category => typeof x === "string" && (CATEGORIES as readonly string[]).includes(x);
