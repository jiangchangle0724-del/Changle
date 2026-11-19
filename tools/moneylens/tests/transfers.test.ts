// ACC-4: moves between the user's own accounts and credit card payments are paired, cautiously.
import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeMove, pairMoves, type Leg } from "../src/core/transfers";

const accounts = {
  chq: { kind: "chequing", currency: "CAD" },
  sav: { kind: "savings", currency: "CAD" },
  visa: { kind: "credit", currency: "CAD" },
  usd: { kind: "chequing", currency: "USD" },
} as const;
const leg = (id: string, account: keyof typeof accounts, posted: string, amount: number, description: string, more: Partial<Leg> = {}): Leg => ({ id, account, posted, amount, description, ...more });

test("what reads like a move", () => {
  for (const text of ["TRANSFER TO ****4321", "Online Banking transfer - 1234", "INTERAC E-TRANSFER", "e-Transfer sent", "VISA PAYMENT", "PAYMENT - THANK YOU", "PAIEMENT - MERCI", "VIREMENT", "TFR FROM SAVINGS", "PYMT RECEIVED"]) {
    assert.ok(looksLikeMove({ description: text }), text);
  }
  for (const text of ["SAVE ON FOODS", "TRANSFERWISE", "PAYMENTECH", "TIM HORTONS", "INTERAC PURCHASE", ""]) assert.ok(!looksLikeMove({ description: text }), text);
  assert.ok(looksLikeMove({ description: "MISC", type: "XFER" }));
  assert.ok(looksLikeMove({ description: "MISC", memo: "TRANSFER" }));
});

test("chequing to savings, and chequing to a card", () => {
  const pairs = pairMoves(
    [
      leg("a", "chq", "2026-10-20", -50000, "TRANSFER TO ****4321", { type: "XFER" }),
      leg("b", "sav", "2026-10-20", 50000, "TRANSFER FROM ****4567"),
      leg("c", "chq", "2026-10-22", -35025, "VISA PAYMENT ****9012"),
      leg("d", "visa", "2026-10-23", 35025, "PAYMENT - THANK YOU"),
      leg("e", "chq", "2026-10-25", -450, "TIM HORTONS"),
    ],
    accounts,
  );
  assert.deepEqual(pairs, [
    { out: "a", in: "b", days: 0, kind: "transfer", sure: true },
    { out: "c", in: "d", days: 1, kind: "card-payment", sure: true },
  ]);
});

test("only one side reads like a move: a suggestion, not a sure thing", () => {
  const pairs = pairMoves([leg("a", "chq", "2026-10-20", -50000, "TRANSFER TO ****4321"), leg("b", "sav", "2026-10-21", 50000, "DEPOSIT")], accounts);
  assert.deepEqual(pairs, [{ out: "a", in: "b", days: 1, kind: "transfer", sure: false }]);
});

test("the same amount alone is never enough", () => {
  // a $50 withdrawal and a $50 refund on the card a day apart are two unrelated things
  assert.deepEqual(pairMoves([leg("a", "chq", "2026-10-20", -5000, "ATM WITHDRAWAL"), leg("b", "visa", "2026-10-21", 5000, "SHOE STORE REFUND")], accounts), []);
});

test("what never pairs: one account, two currencies, days too far apart, lines already settled", () => {
  const out = leg("a", "chq", "2026-10-20", -50000, "TRANSFER OUT");
  assert.deepEqual(pairMoves([out, leg("b", "chq", "2026-10-20", 50000, "TRANSFER IN")], accounts), []);
  assert.deepEqual(pairMoves([out, leg("b", "usd", "2026-10-20", 50000, "TRANSFER IN")], accounts), []);
  assert.deepEqual(pairMoves([out, leg("b", "sav", "2026-10-26", 50000, "TRANSFER IN")], accounts), []);
  assert.equal(pairMoves([out, leg("b", "sav", "2026-10-26", 50000, "TRANSFER IN")], accounts, { window: 6 }).length, 1);
  assert.deepEqual(pairMoves([out, leg("b", "sav", "2026-10-20", 50000, "TRANSFER IN", { pair: "x" })], accounts), []);
  assert.deepEqual(pairMoves([{ ...out, unpaired: true }, leg("b", "sav", "2026-10-20", 50000, "TRANSFER IN")], accounts), []);
  assert.deepEqual(pairMoves([out, leg("b", "sav", "2026-10-20", 50001, "TRANSFER IN")], accounts), []);
  assert.deepEqual(pairMoves([leg("a", "nowhere" as "chq", "2026-10-20", -1, "TRANSFER"), leg("b", "sav", "2026-10-20", 1, "TRANSFER")], accounts), []);
});

test("each line is used once: sure pairs first, then the closest days", () => {
  const pairs = pairMoves(
    [
      leg("out1", "chq", "2026-10-01", -10000, "TRANSFER"),
      leg("out2", "chq", "2026-10-03", -10000, "TRANSFER"),
      leg("in-far", "sav", "2026-10-05", 10000, "TRANSFER"),
      leg("in-near", "sav", "2026-10-03", 10000, "DEPOSIT"),
    ],
    accounts,
  );
  // out2 and in-far are both moves (sure) and 2 days apart; out1 and in-far would be 4. The sure pair with the closest days wins, then out1 takes what is left.
  assert.deepEqual(pairs, [
    { out: "out2", in: "in-far", days: 2, kind: "transfer", sure: true },
    { out: "out1", in: "in-near", days: 2, kind: "transfer", sure: false },
  ]);
  // the same lines in another order give the same pairs
  const shuffled = pairMoves(
    [leg("in-near", "sav", "2026-10-03", 10000, "DEPOSIT"), leg("in-far", "sav", "2026-10-05", 10000, "TRANSFER"), leg("out2", "chq", "2026-10-03", -10000, "TRANSFER"), leg("out1", "chq", "2026-10-01", -10000, "TRANSFER")],
    accounts,
  );
  assert.deepEqual(shuffled, pairs);
});
