/*
 * 两清's arithmetic (src/split/core/). Run with `npx tsx tests/split.test.ts`
 *  1. Money: what is typed becomes whole cents (or whole yen) and back; one currency into another.
 *  2. The worked examples in the plan (docs/split.md, 算账规则), each as written there.
 *  3. Sharing out: the parts always add up; the odd cents take turns.
 *  4. What is wrong with an expense, as the screen will say it.
 *  5. The example ledger on the plan's three screens: who is owed what, and the four transfers.
 *  6. Settling: the fewest transfers, checked against trying every way for small groups.
 *  7. Ten thousand made-up ledgers (tests/split/ledgers.ts): every expense adds up, the balances add
 *     up to zero, the plan brings everyone to zero, and it holds still while people pay one by one.
 *  8. The same answers as last time: a fingerprint of the first 2,000 ledgers' results, so a change
 *     to any rule shows up here and is made on purpose.
 */
import {
  allot,
  balances,
  convert,
  EXACT_UP_TO,
  expensesOf,
  fromMinor,
  isAmount,
  isRate,
  MAX_AMOUNT,
  nextRot,
  oddUnits,
  portionsOf,
  problem,
  settle,
  settlement,
  soundTransfer,
  spent,
  toMinor,
  transfersOf,
  type Entry,
  type Expense,
  type Ledger,
  type Split,
} from "../src/split/core";
import { CURRENCIES } from "../src/tools/money";
import { randomLedger, rng } from "./split/ledgers";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
const eq = (got: unknown, want: unknown, msg: string) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  ok(g === w, `${msg} → ${g}${g === w ? "" : `, wanted ${w}`}`);
};
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

// ---------- 1. money ----------
eq(toMinor("86.40", 2), 8640, "86.40 is 8640 cents");
eq(toMinor("86.4", 2), 8640, "86.4 too");
eq(toMinor("86.", 2), 8600, "86. (still typing) is 86 dollars");
eq(toMinor("86", 2), 8600, "86 is 86 dollars");
eq(toMinor("0.05", 2), 5, "0.05 is 5 cents");
eq(toMinor("3000", 0), 3000, "3000 yen is 3000");
eq(toMinor("1.005", 2), null, "a third decimal isn't an amount");
eq(toMinor("12.5", 0), null, "yen has no decimals");
eq(toMinor("", 2), null, "nothing typed");
eq(toMinor("abc", 2), null, "letters");
eq(toMinor("1.2.3", 2), null, "two points");
eq(toMinor("-5", 2), null, "no minus");
eq(toMinor("0.1", 2)! + toMinor("0.2", 2)!, 30, "0.1 + 0.2 is 30 cents exactly, never 0.30000000000000004");
eq(fromMinor(8640, 2), "86.40", "8640 cents reads 86.40");
eq(fromMinor(5, 2), "0.05", "5 cents reads 0.05");
eq(fromMinor(-500, 2), "-5.00", "owing 5 dollars reads -5.00");
eq(fromMinor(3000, 0), "3000", "3000 yen reads 3000");
eq(fromMinor(0, 2), "0.00", "nothing reads 0.00");
{
  const r = rng(11);
  let same = true;
  for (let i = 0; i < 2000; i++) {
    const n = Math.floor(r() * MAX_AMOUNT) + 1;
    if (toMinor(fromMinor(n, 2), 2) !== n || toMinor(fromMinor(n, 0), 0) !== n) same = false;
  }
  ok(same, "2,000 amounts written out and read back are the same amount");
}
ok(isAmount(1) && isAmount(MAX_AMOUNT) && !isAmount(0) && !isAmount(-1) && !isAmount(1.5) && !isAmount(MAX_AMOUNT + 1) && !isAmount("5") && !isAmount(NaN), "an amount is a whole number from 1 to the most an entry can be");
ok(isRate("1.40") && isRate("0.0091") && isRate("108") && !isRate("0") && !isRate("0.00") && !isRate("1.") && !isRate(".5") && !isRate("1e3") && !isRate("-1") && !isRate("1.123456789"), "a rate is digits with up to 8 decimals, above zero");
eq(convert(3000, 2, "1.40", 2), 4200, "US$30.00 at 1.40 is $42.00");
eq(convert(3000, 0, "0.0091", 2), 2730, "3,000 yen at 0.0091 is $27.30");
eq(convert(4200, 2, "108.5", 0), 4557, "$42.00 at 108.5 is 4,557 yen");
eq(convert(1, 2, "0.5", 2), 1, "half a cent rounds up");
eq(convert(1, 2, "0.49", 2), 0, "less than half a cent rounds down");
eq(convert(1000, 2, "1.005", 2), 1005, "10.00 at 1.005 is 10.05 exactly (as a fraction, 1.005 is a hair under and would lose the cent)");
eq(convert(MAX_AMOUNT, 2, "999999999.99999999", 2), null, "a result too big to hold is refused, not garbled");
eq(convert(MAX_AMOUNT, 2, "1500.12345678", 0), 150012345663, "the most an entry can be, at a long rate, to the yen");
eq(convert(100, 2, "abc", 2), null, "a rate that isn't one");
ok(CURRENCIES.every((c) => c.decimals === 0 || c.decimals === 2), "every currency the site knows writes 2 decimals or none");

// ---------- 2. the plan's worked examples ----------
eq(allot(10000, [1, 1, 1], 0), [3334, 3333, 3333], "平分：$100 三人是 33.34、33.33、33.33");
eq(allot(9000, [3, 1], 0), [6750, 2250], "按份数：$90，3 份和 1 份是 67.50、22.50");
eq(problem({ payer: "w", amount: 8000, split: { how: "exact", amounts: { w: 5000, m: 3000 } } }, ["w", "m"]), null, "按金额：$80，小王 50，阿美 30，加起来对");
eq(convert(3000, 2, "1.40", 2), 4200, "多币种：30 美元的晚饭，汇率 1.40，记成 $42.00");
eq(allot(3000, [1, 1, 1], 0), [1000, 1000, 1000], "没有小数的货币：3,000 日元三人各 1,000");
eq(12000 - 7750, 4250, "净额：付了 $120，该承担 $77.50，该收 $42.50");

// ---------- 3. sharing out ----------
eq(allot(10000, [1, 1, 1], 1), [3333, 3334, 3333], "the next odd cent goes to the next person");
eq(allot(10000, [1, 1, 1], 2), [3333, 3333, 3334], "and then the third");
eq(allot(10000, [1, 1, 1], 3), [3334, 3333, 3333], "and round again");
eq(allot(10001, [1, 1, 1], 2), [3334, 3333, 3334], "two odd cents from the third place: the third, then round to the first");
eq(allot(200, [1, 0, 1, 1], 1), [66, 0, 67, 67], "someone who takes no part never gets an odd cent");
eq(allot(1, [1, 1, 1, 1], 6), [0, 0, 1, 0], "one cent between four goes to one person");
eq(allot(100, [1, 2], 0), [34, 66], "shares 1 and 2 of $1.00: 33 and 66, the odd cent to the first in turn");
eq(allot(100, [1, 2], 1), [33, 67], "and to the second on the next turn");
eq(allot(5000, [0, 0, 0], 0), [0, 0, 0], "no weights, nothing handed out");
eq(allot(100, [1, 1, 1], NaN), [34, 33, 33], "a damaged turn starts from the top");
eq(oddUnits(10000, [1, 1, 1]), 1, "$100 between three leaves one odd cent");
eq(oddUnits(10001, [1, 1, 1]), 2, "$100.01 leaves two");
eq(oddUnits(9000, [3, 1]), 0, "$90 by 3 and 1 leaves none");
{
  // 300 dinners of $100 between the same three, each starting where the last one stopped
  const extra = [0, 0, 0];
  let rot = 0;
  for (let i = 0; i < 300; i++) {
    allot(10000, [1, 1, 1], rot).forEach((p, k) => (extra[k] += p - 3333));
    rot += oddUnits(10000, [1, 1, 1]);
  }
  eq(extra, [100, 100, 100], "over 300 dinners of $100 between three, each pays the odd cent 100 times");
  // mixed amounts: nobody is ever more than one odd cent ahead
  const got = [0, 0, 0, 0];
  const r = rng(5);
  let turn = 0;
  let fair = true;
  for (let i = 0; i < 2000; i++) {
    const amount = Math.floor(r() * 100000) + 1;
    const base = Math.floor(amount / 4);
    allot(amount, [1, 1, 1, 1], turn).forEach((p, k) => (got[k] += p - base));
    turn += oddUnits(amount, [1, 1, 1, 1]);
    if (Math.max(...got) - Math.min(...got) > 1) fair = false;
  }
  ok(fair, "over 2,000 uneven bills between four, nobody is ever more than one odd cent ahead");
}

// ---------- 4. what is wrong with an expense ----------
const three = ["a", "b", "c"];
const equal: Split = { how: "equal", among: three };
eq(problem({ payer: "a", amount: 0, split: equal }, three), { what: "amount" }, "no amount");
eq(problem({ payer: "a", amount: 10.5, split: equal }, three), { what: "amount" }, "half a cent");
eq(problem({ payer: "a", amount: MAX_AMOUNT + 1, split: equal }, three), { what: "amount" }, "more than an entry can be");
eq(problem({ payer: "z", amount: 100, split: equal }, three), { what: "payer" }, "paid by someone not in the ledger");
eq(problem({ payer: "a", amount: 100, split: { how: "equal", among: [] } }, three), { what: "nobody" }, "shared between nobody");
eq(problem({ payer: "a", amount: 100, split: { how: "equal", among: ["a", "z"] } }, three), { what: "member" }, "shared with someone not in the ledger");
eq(problem({ payer: "a", amount: 100, split: { how: "equal", among: ["a", "a"] } }, three), { what: "member" }, "the same person twice");
eq(problem({ payer: "a", amount: 100, split: { how: "shares", shares: { a: 0, b: 0 } } }, three), { what: "nobody" }, "shares, all zero");
eq(problem({ payer: "a", amount: 100, split: { how: "shares", shares: { a: 1.5 } } }, three), { what: "member" }, "half a share");
eq(problem({ payer: "a", amount: 100, split: { how: "shares", shares: { a: 1000 } } }, three), { what: "member" }, "a thousand shares");
eq(problem({ payer: "a", amount: 100, split: { how: "shares", shares: { a: 3, b: 1, c: 0 } } }, three), null, "shares 3, 1 and none are fine");
eq(problem({ payer: "a", amount: 8000, split: { how: "exact", amounts: { a: 5000, b: 2000 } } }, three), { what: "sum", off: 1000 }, "typed amounts $10 short");
eq(problem({ payer: "a", amount: 8000, split: { how: "exact", amounts: { a: 5000, b: 3500 } } }, three), { what: "sum", off: -500 }, "typed amounts $5 over");
eq(problem({ payer: "a", amount: 8000, split: { how: "exact", amounts: { a: 8000, b: 0 } } }, three), null, "typed amounts with a zero are fine");
eq(problem({ payer: "a", amount: 8000, split: { how: "exact", amounts: { a: 9000, b: -1000 } } }, three), { what: "member" }, "a negative typed amount");
eq(problem({ payer: "a", amount: 100, split: equal, paidIn: { currency: "USD", amount: 70, rate: "0" } }, three), { what: "rate" }, "a rate of zero");
eq(problem({ payer: "a", amount: 100, split: equal, paidIn: { currency: "USD", amount: 70, rate: "1.40" } }, three), null, "paid in another currency, with a rate");

// ---------- 5. the plan's three screens ----------
const names = ["小王", "你", "阿美", "Jason", "小李"];
const people = names.map((name, i) => ({ id: `p${i}`, name }));
const everyone = people.map((p) => p.id);
const whistler: Ledger = { id: "w", name: "惠斯勒周末", currency: "CAD", members: people, entries: [] };
const spend = (l: Ledger, payer: string, amount: number, note: string, split: Split = { how: "equal", among: everyone }) => {
  const e: Expense = { kind: "expense", id: `e${l.entries.length}`, at: l.entries.length, payer, amount, note, split, rot: nextRot(l) };
  l.entries.push(e);
  return e;
};
const pay = (l: Ledger, s: { from: string; to: string; amount: number }) => {
  const id = `t${l.entries.length}`;
  l.entries.push({ kind: "transfer", id, at: l.entries.length, from: s.from, to: s.to, amount: s.amount });
  return id;
};
spend(whistler, "p0", 18600, "晚饭");
spend(whistler, "p1", 12000, "油费");
spend(whistler, "p2", 8150, "早餐");
eq(spent(whistler), 38750, "5 个人共花 $387.50");
eq(balances(whistler), { p0: 10850, p1: 4250, p2: 400, p3: -7750, p4: -7750 }, "你该收 $42.50，小王 $108.50，阿美 $4.00，Jason 和小李各该给 $77.50");
const said = (l: Ledger) => settlement(l).steps.map((s) => `${names[+s.from.slice(1)]} 给 ${names[+s.to.slice(1)]} ${fromMinor(s.amount, 2)}${s.paid ? "（已转）" : ""}`);
eq(said(whistler), ["Jason 给 小王 77.50", "小李 给 小王 31.00", "小李 给 你 42.50", "小李 给 阿美 4.00"], "4 笔转账，和线框图上的一样");
const first = settlement(whistler).steps;
const paidId = pay(whistler, first[0]);
eq(said(whistler), ["Jason 给 小王 77.50（已转）", "小李 给 小王 31.00", "小李 给 你 42.50", "小李 给 阿美 4.00"], "Jason 点了已转：他那一笔打勾，别人的不动");
eq(balances(whistler).p3, 0, "Jason 的净额归零");
ok(!settlement(whistler).clear, "还没全部两清");
pay(whistler, first[2]);
eq(balances(whistler).p1, 0, "小李给你 $42.50，点已转，你的净额归零");
pay(whistler, first[1]);
pay(whistler, first[3]);
ok(settlement(whistler).clear && Object.values(balances(whistler)).every((v) => v === 0), "四笔都转了：全部两清，每个人归零");
// taking the first transfer back
(whistler.entries.find((e) => e.id === paidId) as Entry).gone = 99;
eq(said(whistler)[0], "Jason 给 小王 77.50", "撤销 Jason 那笔：它又变回没转");
ok(!settlement(whistler).clear && balances(whistler).p3 === -7750, "Jason 又欠 $77.50");
(whistler.entries.find((e) => e.id === paidId) as Entry).gone = undefined;
// a new expense after everything was paid: the old transfers match no step of the new plan
spend(whistler, "p3", 5000, "停车");
{
  const s = settlement(whistler);
  eq(s.others.length, 4, "结清以后又记了一笔：之前转过的 4 笔都列在「已经转过的」里");
  eq(said(whistler), ["小王 给 Jason 10.00", "你 给 Jason 10.00", "阿美 给 Jason 10.00", "小李 给 Jason 10.00"], "新的方案只管还欠的：每人给 Jason $10");
  const after = balances(whistler);
  for (const st of s.steps) {
    after[st.from] += st.amount;
    after[st.to] -= st.amount;
  }
  ok(Object.values(after).every((v) => v === 0), "照新方案转完，每个人归零");
}
// someone who paid for several of the biggest things is owed more than one entry can be
{
  const l: Ledger = { id: "big", name: "big", currency: "CAD", members: people.slice(0, 2), entries: [] };
  for (let i = 0; i < 3; i++) spend(l, "p0", MAX_AMOUNT, "big", { how: "equal", among: ["p1"] });
  const s = settlement(l);
  eq(s.steps, [{ from: "p1", to: "p0", amount: 3 * MAX_AMOUNT }], "three of the biggest entries: one transfer of their sum");
  pay(l, s.steps[0]);
  ok(settlement(l).clear && balances(l).p0 === 0, "and paying it back in one transfer counts");
}
// an expense taken out counts for nothing, and one put back counts again
{
  const l: Ledger = { id: "x", name: "x", currency: "CAD", members: people.slice(0, 3), entries: [] };
  const abc = ["p0", "p1", "p2"];
  const e = spend(l, "p0", 10000, "a", { how: "equal", among: abc });
  eq(balances(l), { p0: 6666, p1: -3333, p2: -3333 }, "$100 between three, the first paid: owed 66.66, the others owe 33.33 each");
  eq(nextRot(l), 1, "one odd cent handed out: the next turn starts one place on");
  const second = spend(l, "p0", 10000, "b", { how: "equal", among: abc });
  eq(portionsOf(second, l), { p0: 3333, p1: 3334, p2: 3333 }, "the second $100: the odd cent is the second person's");
  e.gone = 5;
  eq(balances(l), { p0: 6667, p1: -3334, p2: -3333 }, "the first taken out: only the second counts, and its odd cent stays where it was");
  eq(nextRot(l), 2, "an entry taken out still holds its turn, so nobody else's cent moves");
  eq(expensesOf(l).length, 1, "one expense counts");
  l.entries.push({ kind: "transfer", id: "bad", at: 9, from: "p1", to: "p1", amount: 100 });
  l.entries.push({ kind: "expense", id: "bad2", at: 9, payer: "nobody", amount: 100, note: "", split: { how: "equal", among: abc }, rot: 0 });
  eq(balances(l), { p0: 6667, p1: -3334, p2: -3333 }, "an entry that isn't sound (paying yourself, a payer not in the ledger) counts for nothing");
}
// taken out is taken out whatever number `gone` holds, 0 included. (The second opinion found the core
// still counting an entry taken out at time 0: docs/codex-tasks/split/C1-second-opinion.md.)
{
  const l: Ledger = { id: "z", name: "z", currency: "CAD", members: people.slice(0, 2), entries: [] };
  const e = spend(l, "p0", 1, "a", { how: "exact", amounts: { p1: 1 } });
  eq(balances(l), { p0: 1, p1: -1 }, "one cent paid for the other: owed a cent, owes a cent");
  for (const when of [0, -1, 0.5, 1e15]) {
    e.gone = when;
    eq([balances(l), expensesOf(l).length, spent(l)], [{ p0: 0, p1: 0 }, 0, 0], `taken out at time ${when}: it counts for nothing`);
  }
  const back = pay(l, { from: "p1", to: "p0", amount: 1 });
  eq([balances(l), transfersOf(l).length], [{ p0: -1, p1: 1 }, 1], "a cent paid back for an expense that no longer counts: the one who paid it is owed it");
  (l.entries.find((x) => x.id === back) as Entry).gone = 0;
  eq([balances(l), transfersOf(l).length, settlement(l).clear], [{ p0: 0, p1: 0 }, 0, true], "that transfer taken back at time 0: nothing counts, nobody owes anybody");
  e.gone = undefined;
  eq(balances(l), { p0: 1, p1: -1 }, "`gone` set back to undefined: the expense counts again");
}

// ---------- 6. settling ----------
/** The fewest transfers by trying every way: the first person not at zero settles with each person on the other side in turn. */
function fewestByTrying(nets: number[]): number {
  const v = nets.filter((x) => x !== 0);
  const go = (i: number): number => {
    while (i < v.length && v[i] === 0) i++;
    if (i === v.length) return 0;
    let best = Infinity;
    for (let j = i + 1; j < v.length; j++) {
      if (Math.sign(v[j]) === Math.sign(v[i]) || v[j] === 0) continue;
      v[j] += v[i];
      best = Math.min(best, 1 + go(i + 1));
      v[j] -= v[i];
    }
    return best;
  };
  return go(0);
}
/** Are these transfers a way to settle these nets: real amounts between two different people, and everyone at zero after? */
function settles(nets: number[], moves: { from: number; to: number; amount: number }[]): boolean {
  const left = [...nets];
  for (const m of moves) {
    if (!Number.isSafeInteger(m.amount) || m.amount <= 0 || m.from === m.to || left[m.from] === undefined || left[m.to] === undefined) return false;
    left[m.from] += m.amount;
    left[m.to] -= m.amount;
  }
  return left.every((x) => x === 0);
}
eq(settle([]), [], "nobody, nothing to do");
eq(settle([0, 0, 0]), [], "everyone at zero, nothing to do");
eq(settle([500, -500]), [{ from: 1, to: 0, amount: 500 }], "one owes one: one transfer");
eq(settle([10850, 4250, 400, -7750, -7750]).length, 4, "5 个人最多 4 笔");
eq(settle([100, -100, 250, -250, 30, -30]).length, 3, "three pairs that cancel: three transfers, not five");
eq(settle([300, -100, -200, 700, -400, -300]).length, 4, "two threes that cancel: four transfers, not five");
eq(settle([1, 2, 3, -6, 5, 5, -10, 7, -3, -4]).length, 7, "ten people in three groups: seven transfers");
{
  let threw = false;
  try {
    settle([100, -99]);
  } catch {
    threw = true;
  }
  ok(threw, "nets that don't add up to zero are refused out loud");
}
{
  // 16 people, eight pairs hidden among them: the table finds all eight
  const sixteen = [11, 23, 37, 41, 53, 67, 79, 83, -83, -79, -67, -53, -41, -37, -23, -11];
  eq(settle(sixteen).length, 8, `${EXACT_UP_TO} people who cancel in pairs: eight transfers`);
  // 16 people who only cancel as four fours: no pair, no three
  const fours = [1000, 200, 30, -1230, 4000, 500, 60, -4560, 7000, 800, 90, -7890, 10000, 1100, 120, -11220];
  eq(settle(fours).length, 12, "16 people in four groups of four: twelve transfers, the true fewest");
  ok(settles(fours, settle(fours)), "and they do settle");
  // 30 people: pairs and threes come out, the rest fit the table
  const thirty = [...sixteen, ...fours.slice(0, 12), 5, -5];
  ok(settles(thirty, settle(thirty)) && settle(thirty).length === 8 + 9 + 1, "30 people: eight pairs, three fours and a pair, 18 transfers");
  // 20 people with no small group to take out: past the table, still settled, still at most everyone but one
  const r = rng(3);
  const twenty = Array.from({ length: 19 }, () => Math.floor(r() * 1e6) + 1);
  twenty.push(-sum(twenty));
  const moves = settle(twenty);
  ok(settles(twenty, moves) && moves.length <= 19, `20 people who cancel no way but all together: ${moves.length} transfers, never more than 19`);
  eq(JSON.stringify(settle(twenty)), JSON.stringify(moves), "the same nets give the same transfers every time");
}
{
  // small groups: the table against trying every way
  const r = rng(2026);
  let agree = 0;
  let total = 0;
  for (let i = 0; i < 4000; i++) {
    const n = 2 + Math.floor(r() * 7);
    // small numbers, so groups that cancel turn up often
    const nets = Array.from({ length: n - 1 }, () => Math.floor(r() * 21) - 10);
    nets.push(-sum(nets));
    const moves = settle(nets);
    total++;
    if (settles(nets, moves) && moves.length === fewestByTrying(nets)) agree++;
  }
  eq(agree, total, "4,000 groups of 2 to 8: always the same count as trying every way");
}

// ---------- 7. ten thousand made-up ledgers ----------
{
  const LEDGERS = 10_000;
  let expenses = 0;
  let addUp = 0;
  let zeroSum = 0;
  let allClear = 0;
  let fewEnough = 0;
  let fewest = 0;
  let fewestChecked = 0;
  let holdsStill = 0;
  let holdsStillChecked = 0;
  let pastTable = 0;
  let unsound = 0;
  const started = Date.now();
  for (let seed = 1; seed <= LEDGERS; seed++) {
    const l = randomLedger(seed);
    const roster = l.members.map((m) => m.id);
    unsound += l.entries.filter((e) => (e.kind === "expense" ? problem(e, roster) : !soundTransfer(e, roster))).length;
    const live = expensesOf(l);
    expenses += live.length;
    if (live.every((e) => sum(Object.values(portionsOf(e, l))) === e.amount && Object.values(portionsOf(e, l)).every((p) => Number.isSafeInteger(p) && p >= 0))) addUp++;
    const b = balances(l);
    const nets = l.members.map((m) => b[m.id]);
    if (sum(nets) === 0 && nets.every((v) => Number.isSafeInteger(v))) zeroSum++;
    const s = settlement(l);
    const after = { ...b };
    for (const st of s.steps) {
      if (st.paid) continue;
      after[st.from] += st.amount;
      after[st.to] -= st.amount;
    }
    if (Object.values(after).every((v) => v === 0) && s.steps.every((st) => st.amount > 0 && st.from !== st.to)) allClear++;
    const owing = nets.filter((v) => v !== 0).length;
    if (owing > EXACT_UP_TO) pastTable++;
    const moves = settle(nets);
    if (moves.length <= Math.max(0, owing - 1) && settles(nets, moves)) fewEnough++;
    if (owing <= 9) {
      fewestChecked++;
      if (moves.length === fewestByTrying(nets)) fewest++;
    }
    // no transfers made yet: pay the plan's steps in a made-up order and watch the rest hold still
    if (!l.entries.some((e) => e.kind === "transfer") && s.steps.length > 1) {
      holdsStillChecked++;
      const r = rng(seed * 7 + 1);
      const order = s.steps.map((_, i) => i).sort(() => r() - 0.5);
      const paid = new Set<number>();
      let still = true;
      for (const i of order) {
        pay(l, s.steps[i]);
        paid.add(i);
        const now = settlement(l);
        if (now.others.length || now.steps.length !== s.steps.length || now.steps.some((st, k) => st.from !== s.steps[k].from || st.to !== s.steps[k].to || st.amount !== s.steps[k].amount || !!st.paid !== paid.has(k))) still = false;
      }
      if (still && settlement(l).clear && Object.values(balances(l)).every((v) => v === 0)) holdsStill++;
    }
  }
  console.log(`     (${LEDGERS} ledgers, ${expenses} expenses that count, ${pastTable} ledgers past the table's ${EXACT_UP_TO}, ${Date.now() - started} ms)`);
  eq(unsound, 0, "the made-up ledgers hold only sound entries (card C1 tells Codex so)");
  eq(addUp, LEDGERS, "in every ledger, every expense's parts add up to the expense");
  eq(zeroSum, LEDGERS, "in every ledger, the balances add up to zero");
  eq(allClear, LEDGERS, "in every ledger, the plan's unpaid steps bring everyone to zero");
  eq(fewEnough, LEDGERS, "in every ledger, the transfers settle it and are at most the people still owing, less one");
  eq(fewest, fewestChecked, `in the ${fewestChecked} ledgers with up to 9 people owing, the count is the same as trying every way`);
  eq(holdsStill, holdsStillChecked, `in ${holdsStillChecked} ledgers paid step by step in a made-up order, the plan held still and ended all clear`);
}

// ---------- 8. the same answers as last time ----------
{
  // two plain running sums (FNV-1a, and times-31) over what the first 2,000 ledgers come to: parts, balances and the plan
  let h = 0x811c9dc5;
  let g = 7;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
      g = (Math.imul(g, 31) + s.charCodeAt(i)) >>> 0;
    }
  };
  for (let seed = 1; seed <= 2000; seed++) {
    const l = randomLedger(seed);
    for (const e of expensesOf(l)) feed(JSON.stringify(Object.entries(portionsOf(e, l))));
    feed(JSON.stringify(l.members.map((m) => balances(l)[m.id])));
    feed(JSON.stringify(settlement(l)));
  }
  const print = h.toString(16).padStart(8, "0") + g.toString(16).padStart(8, "0");
  eq(print, "0009cd3d686e32cd", "the first 2,000 ledgers come to the same parts, balances and plans as when this was pinned");
}

console.log(failed ? `\n${failed} failed` : "\nall good");
process.exit(failed ? 1 : 0);
