// CLS-1 to CLS-3 and ISO-5: the order of precedence, that every answer says where it came from,
// what a new rule would change, and that one user's rules never touch another's (T-18).
import assert from "node:assert/strict";
import test from "node:test";
import { CARD_PAYMENT, CATEGORIES, classify, guessMerchant, previewAlias, previewRule, ruleMatches, TRANSFER, type Alias, type Book, type Classifiable, type Rule } from "../src/core/classify";

const txn = (description: string, amount = -1000, more: Partial<Classifiable> = {}): Classifiable => ({ account: "chq", amount, description, ...more });
const book = (more: Partial<Book> = {}): Book => ({ categories: CATEGORIES, rules: [], aliases: [], ...more });
const dictionary = [{ phrase: "save on foods", name: "Save-On-Foods", category: "groceries" }];

test("the categories a vault starts with", () => {
  const ids = CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of CATEGORIES) {
    assert.match(c.id, /^[a-z][a-z-]*$/);
    assert.ok(c.zh.trim() && c.en.trim(), c.id);
  }
  assert.equal(CATEGORIES.find((c) => c.id === TRANSFER)!.kind, "transfer");
  assert.equal(CATEGORIES.find((c) => c.id === CARD_PAYMENT)!.kind, "transfer");
});

test("precedence: the user's own choice, a move, rules, aliases, the dictionary, an AI suggestion", () => {
  const everything = book({
    rules: [{ id: "r1", category: "dining", text: "save on foods" }],
    aliases: [{ id: "a1", phrase: "SAVE ON FOODS", name: "Save-On", category: "shopping" }],
    dictionary,
    ai: true,
  });
  const t = txn("POS SAVE ON FOODS #987", -8437, { suggested: { category: "family", confidence: 0.6 } });
  assert.deepEqual(classify({ ...t, category: "gifts", pair: "x" }, everything), { category: "gifts", source: "user", merchant: "Save-On" });
  assert.deepEqual(classify({ ...t, pair: "x" }, everything), { category: TRANSFER, source: "pair", by: "x", merchant: "Save-On" });
  assert.deepEqual(classify({ ...t, pair: "x", pairKind: "card-payment" }, everything).category, CARD_PAYMENT);
  assert.deepEqual(classify(t, everything), { category: "dining", source: "rule", by: "r1", merchant: "Save-On" });
  assert.deepEqual(classify(t, { ...everything, rules: [] }), { category: "shopping", source: "alias", by: "a1", merchant: "Save-On" });
  assert.deepEqual(classify(t, { ...everything, rules: [], aliases: [] }), { category: "groceries", source: "dictionary", by: "SAVE ON FOODS", merchant: "Save-On-Foods" });
  assert.deepEqual(classify(t, book({ ai: true })), { category: "family", source: "ai", confidence: 0.6 });
  assert.deepEqual(classify(t, book()), { category: null, source: "none" });
});

test("an AI suggestion counts only while the user has it on, and its confidence stays between 0 and 1", () => {
  const t = txn("MYSTERY", -500, { suggested: { category: "other", confidence: 7 } });
  assert.equal(classify(t, book()).source, "none");
  assert.equal(classify(t, book({ ai: false })).source, "none");
  assert.equal(classify(t, book({ ai: true })).confidence, 1);
  assert.equal(classify(txn("M", -5, { suggested: { category: "other", confidence: NaN } }), book({ ai: true })).confidence, 0);
  assert.equal(classify(txn("M", -5, { suggested: { category: "made-up", confidence: 0.9 } }), book({ ai: true })).source, "none");
});

test("a rule's conditions all have to hold; a phrase matches whole words", () => {
  const t = txn("TIM HORTONS #1234 BURNABY", -450);
  const match = (rule: Partial<Rule>, on = t) => ruleMatches({ id: "r", category: "dining", ...rule }, on);
  assert.ok(match({ text: "tim hortons" }));
  assert.ok(match({ text: "Tim Horton's".replace("'s", "s") }));
  assert.ok(match({ text: "HORTONS 1234" }));
  assert.ok(!match({ text: "TIM HORTON" }), "not a whole word");
  assert.ok(!match({ text: "TIMS" }));
  assert.ok(!match({ text: "***" }), "a phrase with nothing in it matches nothing");
  assert.ok(match({ text: "burnaby", direction: "out", min: 400, max: 500, account: "chq" }));
  assert.ok(!match({ text: "burnaby", direction: "in" }));
  assert.ok(!match({ text: "burnaby", min: 451 }));
  assert.ok(!match({ text: "burnaby", max: 449 }));
  assert.ok(!match({ text: "burnaby", account: "visa" }));
  assert.ok(match({ direction: "out" }));
  assert.ok(match({ min: 450, max: 450 }));
  assert.ok(!match({}), "a rule with no condition matches nothing");
  assert.ok(!match({ text: "tim", off: true }));
  // the memo is searched too
  assert.ok(match({ text: "refund" }, txn("T AND T", 2000, { memo: "REFUND" })));
  // Chinese wording
  assert.ok(match({ text: "大统华" }, txn("大统华 超市 RICHMOND")));
});

test("rules go in the user's order; one pointing at a category that is gone is passed over", () => {
  const rules: Rule[] = [
    { id: "r0", category: "deleted-category", text: "costco" },
    { id: "r1", category: "transport", text: "costco gas" },
    { id: "r2", category: "groceries", text: "costco" },
  ];
  assert.equal(classify(txn("COSTCO GAS W1234"), book({ rules })).by, "r1");
  assert.equal(classify(txn("COSTCO WHOLESALE W1234"), book({ rules })).by, "r2");
  assert.equal(classify(txn("COSTCO GAS"), book({ rules: [rules[2]!, rules[1]!] })).by, "r2");
  // a hand-picked category that is gone falls back to the automatic answer
  assert.equal(classify(txn("COSTCO GAS", -5000, { category: "deleted-category" }), book({ rules })).source, "rule");
});

test("aliases: the longest phrase wins, and one without a category still names the merchant", () => {
  const aliases: Alias[] = [
    { id: "a1", phrase: "AMZN", name: "Amazon", category: "shopping" },
    { id: "a2", phrase: "AMZN PRIME", name: "Amazon Prime", category: "subscriptions" },
    { id: "a3", phrase: "BLUE BOTTLE", name: "Blue Bottle" },
  ];
  assert.deepEqual(classify(txn("AMZN PRIME*1A2B3"), book({ aliases })), { category: "subscriptions", source: "alias", by: "a2", merchant: "Amazon Prime" });
  assert.deepEqual(classify(txn("AMZN MKTP CA*9Z8Y7"), book({ aliases })), { category: "shopping", source: "alias", by: "a1", merchant: "Amazon" });
  assert.deepEqual(classify(txn("SQ *BLUE BOTTLE"), book({ aliases })), { category: null, source: "none", merchant: "Blue Bottle" });
  assert.deepEqual(classify(txn("SQ *BLUE BOTTLE"), book({ aliases, dictionary: [{ phrase: "blue bottle", name: "BB", category: "dining" }] })), { category: "dining", source: "dictionary", by: "BLUE BOTTLE", merchant: "Blue Bottle" });
});

test("a new rule shows what it would change, never touches a hand-picked category, and is undone by taking it away (CLS-2)", () => {
  const txns = [
    { id: "t1", ...txn("COMPASS AUTOLOAD", -5200) },
    { id: "t2", ...txn("COMPASS VENDING", -350, { category: "other" }) },
    { id: "t3", ...txn("SAVE ON FOODS", -8437) },
    { id: "t4", ...txn("COMPASS AUTOLOAD", -5200) },
  ];
  const before = book({ dictionary });
  const rule: Rule = { id: "r9", category: "transport", text: "compass" };
  const changes = previewRule(rule, txns, before);
  assert.deepEqual(changes.map((c) => [c.id, c.from.category, c.to.category, c.to.source]), [
    ["t1", null, "transport", "rule"],
    ["t4", null, "transport", "rule"],
  ]);
  const after: Book = { ...before, rules: [rule] };
  assert.deepEqual(txns.map((t) => classify(t, after).category), ["transport", "other", "groceries", "transport"]);
  // undo: without the rule, everything is as it was
  assert.deepEqual(txns.map((t) => classify(t, { ...after, rules: [] })), txns.map((t) => classify(t, before)));
  // changing a rule that exists is previewed against the rule it replaces
  assert.deepEqual(previewRule({ ...rule, category: "travel" }, txns, after).map((c) => [c.id, c.from.category, c.to.category]), [
    ["t1", "transport", "travel"],
    ["t4", "transport", "travel"],
  ]);
  assert.deepEqual(previewRule(rule, txns, after), []);
  // the same for an alias, which can also change just the name shown
  const alias: Alias = { id: "a9", phrase: "save on foods", name: "Save-On" };
  assert.deepEqual(previewAlias(alias, txns, before).map((c) => [c.id, c.from.merchant, c.to.merchant]), [["t3", "Save-On-Foods", "Save-On"]]);
});

test("one user's rules and aliases are that user's alone (ISO-5, T-18)", () => {
  const t = txn("SHARED MERCHANT 77", -2500);
  const alice = book({ rules: [{ id: "r1", category: "dining", text: "shared merchant" }], aliases: [{ id: "a1", phrase: "shared merchant", name: "Alice's name for it" }] });
  const bob = book();
  const aliceBefore = JSON.stringify(alice);
  assert.deepEqual(classify(t, alice), { category: "dining", source: "rule", by: "r1", merchant: "Alice's name for it" });
  assert.deepEqual(classify(t, bob), { category: null, source: "none" });
  // classifying reads a book and writes nothing: there is no shared state for one user's rules to leak through
  assert.equal(JSON.stringify(alice), aliceBefore);
  assert.deepEqual(classify(t, bob), { category: null, source: "none" });
});

test("a first guess at the merchant, for the user to confirm", () => {
  const cases: [string, string][] = [
    ["POS PURCHASE SAVE ON FOODS #987 VANCOUVER BC", "SAVE ON FOODS"],
    ["TIM HORTONS #1234 BURNABY BC", "TIM HORTONS"],
    ["SQ *BLUE BOTTLE COFFEE VANCOUVER BC", "BLUE BOTTLE COFFEE"],
    ["COSTCO WHOLESALE W1234 RICHMOND BC", "COSTCO WHOLESALE"],
    ["7 ELEVEN 12345 BURNABY BC", "7 ELEVEN"],
    ["AMZN Mktp CA*1A2B3C4D5", "AMZN"],
    ["STREAMFLIX.COM", "STREAMFLIX COM"],
    ["PAYPAL *SPOTIFY", "SPOTIFY"],
    ["VISA", "VISA"],
    ["", ""],
  ];
  for (const [text, want] of cases) assert.equal(guessMerchant(text), want, text);
});
