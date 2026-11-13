import { balances, portionsOf, settle } from "../src/split/core";
import type { Expense, Ledger } from "../src/split/core/types";
import { randomLedger } from "./split/ledgers";
import { fewest, parts, standing } from "./split/second";

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same(a: Record<string, number>, b: Record<string, number>): boolean {
  return Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every((id) => Object.hasOwn(b, id) && a[id] === b[id]);
}

function compare(a: Record<string, number>, b: Record<string, number>, context: unknown) {
  check(same(a, b), JSON.stringify({ context, second: a, core: b }, null, 2));
}

// Hand-worked examples from C1 pin the independent implementation to the written rules.
const example: Ledger = {
  id: "hand", name: "", currency: "CAD",
  members: ["a", "b", "c"].map((id) => ({ id, name: id })), entries: [],
};
const expense: Expense = {
  kind: "expense", id: "e", at: 1, payer: "a", amount: 10000, note: "", rot: 0,
  split: { how: "equal", among: ["c", "b", "a"] },
};
compare(parts(expense, example), { a: 3334, b: 3333, c: 3333 }, "equal, reversed among, rot 0");
compare(parts({ ...expense, rot: 1 }, example), { a: 3333, b: 3334, c: 3333 }, "equal, rot 1");
compare(parts({ ...expense, amount: 10001, rot: 2 }, example), { a: 3334, b: 3333, c: 3334 }, "equal, wrap");
const shares: Expense = { ...expense, amount: 100, split: { how: "shares", shares: { c: 0, b: 2, a: 1 } } };
compare(parts(shares, example), { a: 34, b: 66 }, "shares, rot 0");
compare(parts({ ...shares, rot: 1 }, example), { a: 33, b: 67 }, "shares, rot 1");
compare(parts({ ...expense, amount: 1 }, example), { a: 1, b: 0, c: 0 }, "participants with zero portions remain");
compare(parts({ ...expense, split: { how: "exact", amounts: { c: 0, b: 10000 } } }, example), { b: 10000 }, "exact zero takes no part");
check(fewest([10850, 4250, 400, -7750, -7750]) === 4, "hand example: five people need four transfers");
check(fewest([100, -100, 250, -250, 30, -30]) === 3, "hand example: three independent pairs");
check(fewest([0, 0]) === 0, "zero standings need no transfers");
console.log("ok hand rules: 10 examples");

const started = performance.now();
const counts = [0, 0, 0, 0];
const times = [0, 0, 0, 0];
for (let seed = 1; seed <= 10_000; seed++) {
  const ledger = randomLedger(seed);
  let at = performance.now();
  for (const entry of ledger.entries) {
    if (entry.kind !== "expense" || entry.gone !== undefined) continue;
    compare(parts(entry, ledger), portionsOf(entry, ledger), { seed, entry, roster: ledger.members });
    counts[0] += 1;
  }
  times[0] += performance.now() - at;

  at = performance.now();
  const independent = standing(ledger);
  compare(independent, balances(ledger), { seed, ledger });
  const nets = ledger.members.map(({ id }) => independent[id]);
  check(nets.reduce((sum, net) => sum + net, 0) === 0, `seed ${seed}: standings must sum to zero`);
  counts[1] += 1;
  times[1] += performance.now() - at;

  at = performance.now();
  const moves = settle([...nets]);
  if (nets.filter((net) => net !== 0).length <= 12) {
    const minimum = fewest(nets);
    check(minimum === moves.length, JSON.stringify({ seed, ledger, nets, second: minimum, core: moves }, null, 2));
    counts[2] += 1;
  }
  times[2] += performance.now() - at;

  at = performance.now();
  const left = [...nets];
  for (const move of moves) {
    check(Number.isSafeInteger(move.amount) && move.amount > 0
      && Number.isInteger(move.from) && Number.isInteger(move.to)
      && move.from >= 0 && move.from < nets.length && move.to >= 0 && move.to < nets.length
      && move.from !== move.to, JSON.stringify({ seed, move, nets }));
    left[move.from] += move.amount;
    left[move.to] -= move.amount;
  }
  check(left.every((net) => net === 0), JSON.stringify({ seed, nets, moves, left }));
  counts[3] += 1;
  times[3] += performance.now() - at;
}
const labels = ["expense portions", "ledger standings", "fewest transfers (at most 12 nonzero)", "plans settle every member"];
labels.forEach((label, i) => console.log(`ok ${label}: ${counts[i]} compared (${times[i].toFixed(1)} ms)`));
console.log(`ok seeds 1..10000 (${(performance.now() - started).toFixed(1)} ms total)`);

// The generator uses positive removal timestamps. Also check the card's "any number",
// including zero. Start with seed 4's removed e6, then shrink to two people and one unit.
// By hand: a removed entry counts for nothing, so both standings must be zero.
const source = randomLedger(4);
const removed = source.entries.find((entry) => entry.id === "e6");
check(removed?.kind === "expense" && removed.gone !== undefined, "seed 4 must contain removed expense e6");
const minimal: Ledger = {
  ...source,
  members: source.members.filter(({ id }) => id === "m8" || id === "m14"),
  entries: [{ ...removed, amount: 1, split: { how: "exact", amounts: { m8: 1 } }, gone: 0 }],
};
const removedTransfer: Ledger = {
  ...minimal,
  entries: [{ kind: "transfer", id: "t", at: 1, from: "m8", to: "m14", amount: 1, gone: 0 }],
};
let disagreements = 0;
for (const ledger of [minimal, removedTransfer]) {
  const independent = standing(ledger);
  check(same(independent, { m8: 0, m14: 0 }), "removed entries must contribute zero by C1");
  const core = balances(ledger);
  if (!same(independent, core)) {
    disagreements += 1;
    console.error("FAIL gone: 0 counts for nothing under C1", JSON.stringify({
      sourceSeed: 4, sourceEntry: "e6", mutation: "removal timestamp changed to zero; reduced to one unit and two people",
      ledger, second: independent, core,
    }, null, 2));
  }
}
check(disagreements === 0, `${disagreements} core disagreements on hand-checked gone: 0 examples`);
console.log("ok gone: 0: 2 hand-checked ledgers");
