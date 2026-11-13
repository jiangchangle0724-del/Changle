import type { Expense, Ledger } from "../../src/split/core/types";

/** Each participant's part, with odd units assigned in roster order. */
export function parts(expense: Expense, ledger: Ledger): Record<string, number> {
  if (expense.gone !== undefined) return {};
  const split = expense.split;
  if (split.how === "exact") {
    return Object.fromEntries(ledger.members
      .filter(({ id }) => (split.amounts[id] ?? 0) > 0)
      .map(({ id }) => [id, split.amounts[id]]));
  }

  const people = ledger.members.filter(({ id }) => split.how === "equal"
    ? split.among.includes(id)
    : (split.shares[id] ?? 0) > 0);
  const weights = people.map(({ id }) => split.how === "equal" ? 1 : split.shares[id]);
  const totalWeight = weights.reduce((sum, weight) => sum + BigInt(weight), 0n);
  // Integer division keeps even the multiplication exact before taking each floor.
  const amounts = weights.map((weight) => Number(BigInt(expense.amount) * BigInt(weight) / totalWeight));
  const left = expense.amount - amounts.reduce((sum, amount) => sum + amount, 0);
  for (let i = 0; i < left; i++) amounts[(expense.rot % people.length + i) % people.length] += 1;
  return Object.fromEntries(people.map(({ id }, i) => [id, amounts[i]]));
}

/** Paid minus borne, plus money sent and minus money received. */
export function standing(ledger: Ledger): Record<string, number> {
  const nets: Record<string, number> = Object.fromEntries(ledger.members.map(({ id }) => [id, 0]));
  for (const entry of ledger.entries) {
    if (entry.gone !== undefined) continue;
    if (entry.kind === "transfer") {
      nets[entry.from] += entry.amount;
      nets[entry.to] -= entry.amount;
    } else {
      nets[entry.payer] += entry.amount;
      for (const [id, amount] of Object.entries(parts(entry, ledger))) nets[id] -= amount;
    }
  }
  return nets;
}

/** Search actual transfers, each of which completely settles the first unsettled person. */
export function fewest(nets: number[]): number {
  const remaining = nets.filter((net) => net !== 0);
  const memo = new Map<string, number>();

  function search(start: number): number {
    while (start < remaining.length && remaining[start] === 0) start += 1;
    if (start === remaining.length) return 0;
    const key = remaining.slice(start).filter((net) => net !== 0).sort((a, b) => a - b).join(",");
    const saved = memo.get(key);
    if (saved !== undefined) return saved;

    const first = remaining[start];
    let best = remaining.length - start - 1;
    const tried = new Set<number>();
    for (let i = start + 1; i < remaining.length; i++) {
      const other = remaining[i];
      if (other === 0 || (first > 0) === (other > 0) || tried.has(other)) continue;
      tried.add(other);
      // Transfer abs(first) between these two, leaving the first at zero.
      remaining[i] = other + first;
      best = Math.min(best, 1 + search(start + 1));
      remaining[i] = other;
      // Equal and opposite people can be paired in an optimal solution.
      if (other + first === 0) break;
    }
    memo.set(key, best);
    return best;
  }

  return search(0);
}
