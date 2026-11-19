/**
 * Classification (CLS-1 to CLS-3, ISO-5). Every step here is a plain rule, so the same
 * transaction always gets the same answer and the answer says where it came from. In order:
 *
 *   1. the category the user chose for that one transaction;
 *   2. a move between the user's own accounts (ACC-4);
 *   3. the user's rules, first match in the user's order;
 *   4. the user's merchant aliases, the longest matching phrase;
 *   5. the site's own merchant dictionary (curated by the operator from public information),
 *      the longest matching phrase;
 *   6. a category an AI suggested for it, if the user turned that on.
 *
 * Automatic categories are worked out each time and never stored, so adding, changing or removing
 * a rule changes every past transaction it applies to and undoing it puts them back (CLS-2). Only
 * the user's own choices and AI suggestions are stored on a transaction. Rules, aliases and
 * suggestions belong to one user and are never shared (ISO-5).
 */
import type { Source } from "./model";
import { fold } from "./text";

export type CategoryKind = "expense" | "income" | "transfer";

/** A category. The built-in ones have both names; one the user made has the name they typed in both. */
export type Category = { id: string; kind: CategoryKind; zh: string; en: string; custom?: boolean; hidden?: boolean };

/** Paired moves between the user's own accounts land in these two. */
export const TRANSFER = "transfer";
export const CARD_PAYMENT = "card-payment";

/** The categories a new vault starts with. Their ids never change; the user can hide them and add their own. */
export const CATEGORIES: readonly Category[] = [
  { id: "housing", kind: "expense", zh: "住房", en: "Housing" },
  { id: "utilities", kind: "expense", zh: "水电网", en: "Utilities" },
  { id: "groceries", kind: "expense", zh: "买菜", en: "Groceries" },
  { id: "dining", kind: "expense", zh: "外食", en: "Eating out" },
  { id: "transport", kind: "expense", zh: "交通", en: "Transport" },
  { id: "shopping", kind: "expense", zh: "购物", en: "Shopping" },
  { id: "health", kind: "expense", zh: "医疗健康", en: "Health" },
  { id: "entertainment", kind: "expense", zh: "娱乐", en: "Entertainment" },
  { id: "subscriptions", kind: "expense", zh: "订阅", en: "Subscriptions" },
  { id: "travel", kind: "expense", zh: "旅行", en: "Travel" },
  { id: "education", kind: "expense", zh: "教育", en: "Education" },
  { id: "family", kind: "expense", zh: "家人", en: "Family" },
  { id: "gifts", kind: "expense", zh: "礼物和捐款", en: "Gifts and donations" },
  { id: "insurance", kind: "expense", zh: "保险", en: "Insurance" },
  { id: "fees", kind: "expense", zh: "手续费和利息", en: "Fees and interest" },
  { id: "taxes", kind: "expense", zh: "税", en: "Taxes" },
  { id: "other", kind: "expense", zh: "其他支出", en: "Other spending" },
  { id: "pay", kind: "income", zh: "工资", en: "Pay" },
  { id: "benefits", kind: "income", zh: "政府补助", en: "Government benefits" },
  { id: "interest", kind: "income", zh: "利息", en: "Interest earned" },
  { id: "other-income", kind: "income", zh: "其他收入", en: "Other income" },
  { id: TRANSFER, kind: "transfer", zh: "自己账户之间", en: "Between my accounts" },
  { id: CARD_PAYMENT, kind: "transfer", zh: "还信用卡", en: "Credit card payment" },
  { id: "investing", kind: "transfer", zh: "转去投资", en: "To investments" },
];

/**
 * A rule the user made. Every condition given must hold. `text` is a phrase looked for in the
 * transaction's wording, whole words only ("TIM" doesn't match "TIMS"). `min` and `max` bound the
 * amount's size, in smallest units, whichever way the money went.
 */
export type Rule = { id: string; category: string; text?: string; account?: string; direction?: "in" | "out"; min?: number; max?: number; off?: boolean };

/** A merchant the user named: a phrase in the wording, the name to show for it, and the category it usually is. */
export type Alias = { id: string; phrase: string; name: string; category?: string };

/** One line of the site's dictionary. */
export type DictionaryEntry = { phrase: string; name: string; category: string };

/** What classification reads, besides the transaction: all of it the one user's own, except the dictionary. */
export type Book = {
  categories: readonly Category[];
  rules: readonly Rule[];
  aliases: readonly Alias[];
  dictionary?: readonly DictionaryEntry[];
  /** Has the user turned AI suggestions on? Off, a stored suggestion is not used. */
  ai?: boolean;
};

export type Classifiable = {
  account: string;
  amount: number;
  description: string;
  memo?: string;
  category?: string;
  suggested?: { category: string; confidence: number };
  pair?: string;
  /** For a paired move: is one side a credit card? */
  pairKind?: "transfer" | "card-payment";
};

export type Classified = {
  /** The category, or null when nothing matched. */
  category: string | null;
  source: Source;
  /** What decided it: the rule's or alias's id, or the dictionary's phrase. */
  by?: string;
  /** The merchant's name, when an alias or the dictionary knows it. */
  merchant?: string;
  /** An AI suggestion's own estimate, 0 to 1 (CLS-2). */
  confidence?: number;
};

/** The wording a phrase is looked for in: " WORD WORD " with a space at both ends, so a phrase matches whole words. */
export const haystack = (t: { description: string; memo?: string }): string => ` ${fold(`${t.description} ${t.memo ?? ""}`)} `;

/** A phrase as it is stored and compared. Empty when there is nothing in it to match. */
export const phraseOf = (text: string): string => fold(text);

const has = (hay: string, phrase: string): boolean => phrase !== "" && hay.includes(` ${phrase} `);

export function ruleMatches(rule: Rule, t: Classifiable, hay = haystack(t)): boolean {
  if (rule.off) return false;
  const text = rule.text === undefined ? "" : phraseOf(rule.text);
  // a rule with no condition at all would sweep up everything: it matches nothing
  if (!text && rule.account === undefined && rule.direction === undefined && rule.min === undefined && rule.max === undefined) return false;
  if (rule.text !== undefined && !has(hay, text)) return false;
  if (rule.account !== undefined && rule.account !== t.account) return false;
  if (rule.direction === "in" && !(t.amount > 0)) return false;
  if (rule.direction === "out" && !(t.amount < 0)) return false;
  const size = Math.abs(t.amount);
  if (rule.min !== undefined && size < rule.min) return false;
  if (rule.max !== undefined && size > rule.max) return false;
  return true;
}

/** The entry with the longest phrase found in the wording; the earlier one when two are as long. */
function longest<T extends { phrase: string }>(entries: readonly T[], hay: string): T | undefined {
  let best: T | undefined;
  let bestLength = 0;
  for (const e of entries) {
    const phrase = phraseOf(e.phrase);
    if (phrase.length > bestLength && has(hay, phrase)) {
      best = e;
      bestLength = phrase.length;
    }
  }
  return best;
}

export function classify(t: Classifiable, book: Book): Classified {
  const known = new Set(book.categories.map((c) => c.id));
  const hay = haystack(t);
  const alias = longest(book.aliases, hay);
  const entry = book.dictionary ? longest(book.dictionary, hay) : undefined;
  const merchant = alias?.name ?? entry?.name;
  const named = merchant ? { merchant } : {};
  if (t.category !== undefined && known.has(t.category)) return { category: t.category, source: "user", ...named };
  if (t.pair !== undefined) return { category: t.pairKind === "card-payment" ? CARD_PAYMENT : TRANSFER, source: "pair", by: t.pair, ...named };
  for (const rule of book.rules) {
    if (known.has(rule.category) && ruleMatches(rule, t, hay)) return { category: rule.category, source: "rule", by: rule.id, ...named };
  }
  if (alias?.category !== undefined && known.has(alias.category)) return { category: alias.category, source: "alias", by: alias.id, ...named };
  if (entry && known.has(entry.category)) return { category: entry.category, source: "dictionary", by: phraseOf(entry.phrase), ...named };
  if (book.ai && t.suggested && known.has(t.suggested.category)) {
    const confidence = Math.min(1, Math.max(0, Number(t.suggested.confidence) || 0));
    return { category: t.suggested.category, source: "ai", confidence, ...named };
  }
  return { category: null, source: "none", ...named };
}

/**
 * CLS-2: what would change if `rule` were put first among the user's rules (or took the place of
 * the rule with its id). Transactions the user categorized by hand never appear: their own choice
 * stands.
 */
export function previewRule<T extends Classifiable & { id: string }>(rule: Rule, txns: readonly T[], book: Book): { id: string; from: Classified; to: Classified }[] {
  const after: Book = { ...book, rules: [rule, ...book.rules.filter((r) => r.id !== rule.id)] };
  const changes: { id: string; from: Classified; to: Classified }[] = [];
  for (const t of txns) {
    const from = classify(t, book);
    const to = classify(t, after);
    if (from.category !== to.category) changes.push({ id: t.id, from, to });
  }
  return changes;
}

/** The same question for an alias: what changes if it is added (or takes the place of the alias with its id). */
export function previewAlias<T extends Classifiable & { id: string }>(alias: Alias, txns: readonly T[], book: Book): { id: string; from: Classified; to: Classified }[] {
  const after: Book = { ...book, aliases: [alias, ...book.aliases.filter((a) => a.id !== alias.id)] };
  const changes: { id: string; from: Classified; to: Classified }[] = [];
  for (const t of txns) {
    const from = classify(t, book);
    const to = classify(t, after);
    if (from.category !== to.category || from.merchant !== to.merchant) changes.push({ id: t.id, from, to });
  }
  return changes;
}

// Words at the front of a line that say how it was paid, not where.
const LEAD = new Set(["POS", "PURCHASE", "PURCHASES", "ACHAT", "DEBIT", "CREDIT", "CARD", "VISA", "MC", "MASTERCARD", "AMEX", "INTERAC", "CONTACTLESS", "IDP", "RETAIL", "PREAUTHORIZED", "PRE", "AUTHORIZED", "PAD", "MISC", "INTL", "FX", "ONLINE", "RECURRING", "SQ", "TST", "PAYPAL", "PP", "SP"]);
// Province and state codes that end a line after the city.
const REGION = new Set(["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU", "WA", "OR", "CA", "NY", "CAN", "USA"]);

/**
 * A first guess at the merchant in a line of wording, as a phrase the user can turn into an alias:
 * "POS PURCHASE SAVE ON FOODS #987 VANCOUVER BC" gives "SAVE ON FOODS". It drops how the line was
 * paid from the front, store and reference numbers anywhere, and the province and one word of city
 * from the end, then keeps at most three words. It is only ever a suggestion the user sees and can
 * change before it is used.
 */
export function guessMerchant(description: string): string {
  let words = fold(description).split(" ").filter(Boolean);
  while (words.length > 1 && LEAD.has(words[0]!)) words.shift();
  // numbers of three or more digits, and codes that mix letters with digits ("1A2B3C4D5")
  words = words.filter((w, i) => i === 0 || !(/^\d{3,}$/.test(w) || (w.length >= 4 && /\d/.test(w) && /\p{L}/u.test(w))));
  if (words.length > 2 && REGION.has(words[words.length - 1]!)) words = words.slice(0, -2);
  return words.slice(0, 3).join(" ");
}
