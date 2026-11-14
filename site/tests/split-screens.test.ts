/*
 * 两清's screens, the parts of them that are rules and not pictures (src/split/, outside core/).
 * Run with `npx tsx tests/split-screens.test.ts`
 *  1. The keypad: what the amount reads after each key, and what a typed field lets through.
 *  2. Money as it is written for a person to read.
 *  3. 记一笔 while it is filled in: a draft, the three ways of sharing, moving between them.
 *  4. What can be done to a ledger: every change, and every change that is refused.
 *  5. The plan's example weekend, recorded the way the screens record it, and the lines they say.
 *  6. What is kept on the phone, and what the server answers, however either comes back.
 *  7. What the screens say about the server: nothing while in step, and what didn't stick by name.
 *  8. An invitation: the link, the key in it, what is pasted into the chat, the code to scan.
 *  9. Words: both languages for every one, the same blanks in each, none left unused.
 * 10. The screens write nothing of their own: tokens only, and no words outside the table.
 * 11. Still hidden: no way in but its address.
 */
import QRCode from "qrcode";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { balances, expensesOf, MAX_AMOUNT, MAX_MEMBERS, nextRot, portions, settlement, spent, toMinor, fromMinor, type Decimals, type Expense, type Ledger, type Split } from "../src/split/core";
import { amountOf, blankDraft, draftOf, draftProblem, shareBy, sharers, splitOf, type Draft } from "../src/split/draft";
import { currencyName, decimalsOf, money, signOf, typed } from "../src/split/format";
import { asAmountText, press, type Key } from "../src/split/input";
import { inviteLink, inviteText, keyFrom, qrPath } from "../src/split/invite";
import { fromLegacyHash, parse } from "../src/router";
import { applyChange, type Change, type Sent } from "../src/split/changes";
import { lostLine, mine, nameFor, paidBy, paysLine, planText, sharedHow, standing, syncLine } from "../src/split/lines";
import { addExpense, addMember, addTransfer, editExpense, inAnyEntry, LEDGER_NAME_MAX, NAME_MAX, nameTaken, NOTE_MAX, putBack, removeMember, renameLedger, renameMember, startLedger, takeOut, tidy } from "../src/split/ops";
import { asPushed, asSnapshot } from "../src/split/shape";
import { newId, newKey, parseSaved } from "../src/split/store";
import { hold, shown, type Held } from "../src/split/sync";
import { say, W, type Word } from "../src/split/words";
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

// ---------- 1. the keypad ----------
/** Keys pressed one after another; "<" is the delete key. */
const keys = (pressed: string, decimals: Decimals, from = "") => [...pressed].reduce((text, k) => press(text, (k === "<" ? "back" : k) as Key, decimals), from);
eq(keys("186", 2), "186", "1 8 6");
eq(keys("81.50", 2), "81.50", "8 1 . 5 0");
eq(keys("81.505", 2), "81.50", "a third decimal doesn't go in");
eq(keys(".5", 2), "0.5", "the point first reads 0.");
eq(keys("1..5", 2), "1.5", "a second point does nothing");
eq(keys("007", 2), "7", "zeros don't pile up in front");
eq(keys("0.07", 2), "0.07", "but 0.07 is typed as it reads");
eq(keys("123456789", 2), "12345678", "eight digits before the point, for dollars");
eq(keys("99999999.99", 2), "99999999.99", "the most an entry can be, typed whole");
eq(toMinor(keys("99999999.99", 2), 2), MAX_AMOUNT, "and that is exactly the most an entry can be");
eq(keys("3000.5", 0), "30005", "yen has no point: the key does nothing");
eq(keys("12345678901", 0), "1234567890", "ten digits of yen");
eq(toMinor(keys("9999999999", 0), 0), MAX_AMOUNT, "the most an entry can be, in yen");
eq(keys("12<", 2), "1", "delete takes the last digit");
eq(keys("1.<", 2), "1", "or the point");
eq(keys("<", 2), "", "and does nothing to nothing");
eq(keys("5", 2, "81.50"), "81.50", "an amount opened to change it, already at its cents, takes no more digits until one is deleted");
{
  // whatever is pressed, what the screen holds is an amount or on its way to one, never past the most
  const all = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "back"] as Key[];
  let bad = "";
  for (const decimals of [0, 2] as const) {
    const r = rng(decimals + 7);
    for (let run = 0; run < 2000 && !bad; run++) {
      let text = "";
      for (let i = 0; i < 24; i++) {
        text = press(text, all[Math.floor(r() * (r() < 0.2 ? 12 : 11))], decimals);
        const n = toMinor(text, decimals);
        const shaped = decimals ? /^$|^(0|[1-9]\d{0,7})(\.\d{0,2})?$/.test(text) : /^$|^(0|[1-9]\d{0,9})$/.test(text);
        if (!shaped || (text !== "" && (n === null || n > MAX_AMOUNT))) bad = `${JSON.stringify(text)} with ${decimals} decimals`;
      }
    }
  }
  ok(!bad, `4,000 runs of random keys never leave anything but an amount on the screen${bad ? ` (found ${bad})` : ""}`);
}
eq(asAmountText("12.50", 2), "12.50", "a typed field takes an amount as it is");
eq(asAmountText("12,5", 2), "12.5", "a comma is the point (a French keyboard's number pad)");
eq(asAmountText("12。50", 2), "12.50", "so is a Chinese full stop");
eq(asAmountText("$1 2a3", 2), "123", "anything that isn't a digit or the point is dropped");
eq(asAmountText("1.2.3", 2), "1.23", "one point");
eq(asAmountText("12.5", 0), "125", "no point for yen");
eq(asAmountText("0012.345", 2), "12.34", "and the keypad's rules all the same");

// ---------- 2. money for a person to read ----------
eq(money(4250, "CAD", "zh"), "$42.50", "4250 cents");
eq(money(-4250, "CAD", "zh"), "$42.50", "never a minus: the words beside it say who owes whom");
eq(money(123456789, "CAD", "en"), "$1,234,567.89", "digits in threes");
eq(money(123456789, "CAD", "zh"), "$1,234,567.89", "in Chinese too");
eq(money(0, "CAD", "en"), "$0.00", "nothing");
eq(money(5, "CAD", "en"), "$0.05", "five cents");
eq(money(3000, "JPY", "zh"), "JP¥3,000", "yen has no decimals");
eq(money(MAX_AMOUNT, "JPY", "en"), "JP¥9,999,999,999", "the most an entry can be, in yen");
eq(money(MAX_AMOUNT, "CAD", "en"), "$99,999,999.99", "and in dollars");
eq(money(MAX_AMOUNT * 30, "CAD", "en"), "$2,999,999,999.70", "a balance past what one entry can be still reads right");
eq(money(150, "XYZ", "en"), "XYZ 1.50", "a currency the site doesn't know stands for itself, in cents");
eq([typed("", "CAD", "zh"), typed("1234", "CAD", "zh"), typed("1234.", "CAD", "zh"), typed("1234.5", "CAD", "zh"), typed("0.05", "CAD", "zh")], ["$0", "$1,234", "$1,234.", "$1,234.5", "$0.05"], "while typing, exactly as far as it has been typed");
eq(typed("3000", "JPY", "en"), "JP¥3,000", "yen while typing");
eq([decimalsOf("CAD"), decimalsOf("JPY"), decimalsOf("KRW"), decimalsOf("???")], [2, 0, 0, 2], "decimals by currency");
eq([currencyName("CAD", "zh"), currencyName("CAD", "en"), currencyName("???", "en")], ["加元", "Canadian dollar", "???"], "a currency's name");
{
  // 复制金额 copies the amount with everything but digits and the point taken off: that must be the amount itself
  const r = rng(11);
  let bad = "";
  for (const c of CURRENCIES) {
    ok(!/[0-9.]/.test(signOf(c.code)), `${c.code}'s sign (${signOf(c.code)}) has no digit or point in it`);
    for (let i = 0; i < 300 && !bad; i++) {
      const n = Math.floor(r() * (i % 3 ? 1_000_000 : MAX_AMOUNT)) + 1;
      for (const lang of ["zh", "en"] as const) if (money(n, c.code, lang).replace(/[^0-9.]/g, "") !== fromMinor(n, decimalsOf(c.code))) bad = `${c.code} ${n}`;
    }
  }
  ok(!bad, `in all ${CURRENCIES.length} currencies, an amount with its sign and commas taken off is the amount${bad ? ` (not ${bad})` : ""}`);
}

// ---------- 3. 记一笔 while it is filled in ----------
const five: Ledger = startLedger("L", "惠斯勒周末", "CAD", [
  { id: "s", name: "Steve" },
  { id: "w", name: "小王" },
  { id: "m", name: "阿美" },
  { id: "j", name: "Jason" },
  { id: "l", name: "小李" },
]);
const roster = five.members.map((x) => x.id);
{
  const blank = blankDraft(five, "s");
  eq([blank.payer, blank.how, blank.among, blank.text], ["s", "equal", roster, ""], "a new expense starts paid by you, shared equally by everyone");
  eq(blankDraft(five, undefined).payer, "s", "with nobody known as you, by the first on the roster");
  eq(blankDraft(five, "gone").payer, "s", "and the same when 'you' is no longer in the ledger");
  eq(draftProblem(blank, five, 2), { what: "amount" }, "nothing typed yet");
  eq(draftProblem({ ...blank, text: "0" }, five, 2), { what: "amount" }, "zero isn't an amount");
  eq(draftProblem({ ...blank, text: "0.00" }, five, 2), { what: "amount" }, "nor is 0.00");
  const d: Draft = { ...blank, text: "86.40" };
  eq(draftProblem(d, five, 2), null, "86.40 between five can be recorded");
  eq(amountOf(d, 2), 8640, "as 8640 cents");
  eq(splitOf(d, 2), { how: "equal", among: roster }, "shared equally by all five");

  // four of the five
  const four: Draft = { ...d, among: ["s", "w", "m", "j"] };
  eq(sharers(four, five, 2), ["s", "w", "m", "j"], "one person left out");
  eq(sharers({ ...d, among: ["j", "s"] }, five, 2), ["s", "j"], "who takes part is read in roster order, whatever order they were ticked in");
  eq(draftProblem({ ...d, among: [] }, five, 2), { what: "nobody" }, "everyone left out");

  // by shares: the same people, one share each to start
  const byShares = shareBy(four, "shares", five, 2, 0);
  eq([byShares.how, byShares.shares], ["shares", { s: 1, w: 1, m: 1, j: 1 }], "by shares starts with one share each for the same people");
  eq(shareBy(byShares, "shares", five, 2, 0) === byShares, true, "choosing the way it is already shared changes nothing");
  const family: Draft = { ...byShares, shares: { ...byShares.shares, s: 2, j: 0 } };
  eq(sharers(family, five, 2), ["s", "w", "m"], "no shares takes no part");
  eq(splitOf(family, 2), { how: "shares", shares: { s: 2, w: 1, m: 1 } }, "and isn't kept");
  eq(draftProblem(family, five, 2), null, "2 : 1 : 1 can be recorded");
  eq(shareBy({ ...d, among: [] }, "shares", five, 2, 0).shares, { s: 1, w: 1, m: 1, j: 1, l: 1 }, "from nobody, by shares starts with everyone");

  // by amounts: each starts from exactly what they bore the way it was shared before, whoever's turn the odd cents are
  for (const rot of [0, 1, 2, 3, 7]) {
    const fromShares = shareBy(family, "exact", five, 2, rot);
    const was = portions(8640, splitOf(family, 2), rot, roster);
    eq(Object.fromEntries(Object.entries(fromShares.amounts).map(([id, text]) => [id, toMinor(text, 2)])), was, `turn ${rot}: by amounts starts from what 2 : 1 : 1 gave each`);
    ok(draftProblem(fromShares, five, 2) === null, `turn ${rot}: and adds up before anyone changes a figure`);
    const odd: Draft = { ...d, text: "100", among: ["s", "w", "m"] };
    eq(Object.fromEntries(Object.entries(shareBy(odd, "exact", five, 2, rot).amounts).map(([id, text]) => [id, toMinor(text, 2)])), portions(10000, splitOf(odd, 2), rot, roster), `turn ${rot}: $100 between three, the odd cent where the sheet showed it`);
  }
  const typedOut = shareBy(four, "exact", five, 2, 0);
  eq(typedOut.amounts, { s: "21.60", w: "21.60", m: "21.60", j: "21.60" }, "86.40 between four, typed out");
  eq(draftProblem({ ...typedOut, amounts: { ...typedOut.amounts, s: "40" } }, five, 2), { what: "sum", off: -1840 }, "40 for one of them is 18.40 too much");
  eq(draftProblem({ ...typedOut, amounts: { s: "40", w: "40" } }, five, 2), { what: "sum", off: 640 }, "40 and 40 leaves 6.40 to share");
  eq(sharers({ ...typedOut, amounts: { s: "40", w: "0", m: "", j: "0.00" } }, five, 2), ["s"], "0, 0.00 and nothing typed take no part");
  eq(draftProblem({ ...typedOut, amounts: {} }, five, 2), { what: "nobody" }, "no figures at all");
  eq(shareBy({ ...typedOut, amounts: { s: "40", w: "46.40" } }, "equal", five, 2, 0).among, ["s", "w"], "back to equal keeps who had a figure");
  eq(shareBy({ ...blank, how: "shares", shares: {} }, "exact", five, 2, 0).amounts, {}, "with no amount typed, by amounts starts empty");

  // yen
  const yen = startLedger("Y", "北海道", "JPY", five.members);
  const y: Draft = { ...blankDraft(yen, "s"), text: "1000", among: ["s", "w", "m"] };
  eq(shareBy(y, "exact", yen, 0, 1).amounts, { s: "333", w: "334", m: "333" }, "1,000 yen between three, the odd yen on the second");
  eq(draftProblem({ ...y, text: "12.5" }, yen, 0), { what: "amount" }, "12.5 yen isn't an amount");
}
{
  // an expense opened and saved untouched is the same expense: over the made-up ledgers
  let checked = 0;
  let bad = "";
  for (let seed = 1; seed <= 400 && !bad; seed++) {
    const l = randomLedger(seed);
    const dec = decimalsOf(l.currency);
    const before = JSON.stringify([balances(l), nextRot(l), spent(l)]);
    let now = l;
    for (const e of expensesOf(l)) {
      const d = draftOf(e, dec);
      if (draftProblem(d, l, dec) !== null || amountOf(d, dec) !== e.amount || d.payer !== e.payer) bad = `seed ${seed} ${e.id}: the draft isn't the expense`;
      now = editExpense(now, e.id, { payer: d.payer, amount: amountOf(d, dec) ?? 0, note: d.note, split: splitOf(d, dec) });
      checked++;
    }
    if (!bad && JSON.stringify([balances(now), nextRot(now), spent(now)]) !== before) bad = `seed ${seed}: saving untouched moved a balance`;
    if (!bad && now.entries.some((e, i) => e.kind === "expense" && (e.rot !== (l.entries[i] as Expense).rot || e.at !== l.entries[i].at || e.id !== l.entries[i].id))) bad = `seed ${seed}: an edit moved an id, a time or a turn`;
  }
  ok(!bad && checked > 3000, `${checked} expenses in 400 made-up ledgers: opened and saved untouched, nothing moves${bad ? ` (${bad})` : ""}`);
}

// ---------- 4. what can be done to a ledger ----------
{
  eq(tidy("  小  王 \n", NAME_MAX), "小 王", "a name loses its stray spaces");
  eq(tidy("x".repeat(50), NAME_MAX).length, NAME_MAX, "and is no longer than a name can be");
  eq(tidy(`a${"🐱".repeat(10)}`, NAME_MAX), `a${"🐱".repeat(9)}`, "a cut never leaves half an emoji");
  eq(tidy("abcd efgh", 5), "abcd", "or a space at the end");
  const made = startLedger("id1", `  ${"惠".repeat(40)}  `, "CAD", [{ id: "a", name: " A " }, { id: "b", name: "B" }]);
  eq([made.name.length, made.members, made.entries], [LEDGER_NAME_MAX, [{ id: "a", name: "A" }, { id: "b", name: "B" }], []], "a new ledger: its name cut to length, names tidied, no entries");
  eq(startLedger("x", "x", "CAD", Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))).members.length, MAX_MEMBERS, "never more people than a ledger holds");

  const exp = (id: string, payer: string, amount: number, split: Split = { how: "equal", among: roster }, note = "") => ({ id, at: 1, payer, amount, note, split });
  let l = addExpense(five, exp("e1", "w", 18600, undefined, `  晚饭 ${"x".repeat(60)}`));
  eq([l.entries.length, (l.entries[0] as Expense).rot, (l.entries[0] as Expense).note.length], [1, 0, NOTE_MAX], "an expense goes in with the first turn and its note cut to length");
  ok(five.entries.length === 0, "the ledger before is left as it was");
  eq(addExpense(l, exp("e1", "s", 100)) === l, true, "the same expense sent twice is still one");
  eq(addExpense(l, exp("e2", "nobody", 100)) === l, true, "an expense paid by someone not in the ledger is refused");
  eq(addExpense(l, exp("e2", "s", 0)) === l, true, "so is one for nothing");
  eq(addExpense(l, exp("e2", "s", 1.5)) === l, true, "or for half a cent");
  eq(addExpense(l, exp("e2", "s", MAX_AMOUNT + 1)) === l, true, "or past the most an entry can be");
  eq(addExpense(l, exp("e2", "s", 100, { how: "exact", amounts: { s: 60, w: 30 } })) === l, true, "or with parts that don't add up");
  // the odd cents take turns: $100 between three leaves one cent, and the next expense's turn has moved on by it
  l = addExpense(l, exp("e2", "s", 10000, { how: "equal", among: ["s", "w", "m"] }));
  l = addExpense(l, exp("e3", "s", 10000, { how: "equal", among: ["s", "w", "m"] }));
  eq([(l.entries[1] as Expense).rot, (l.entries[2] as Expense).rot], [0, 1], "each expense is given the turn the ledger has reached");
  eq([portions(10000, (l.entries[1] as Expense).split, 0, roster).s, portions(10000, (l.entries[2] as Expense).split, 1, roster).w], [3334, 3334], "so the odd cent goes to Steve, then to 小王");

  const edited = editExpense(l, "e2", { payer: "w", amount: 9000, note: " 改过 ", split: { how: "equal", among: ["s", "w"] } });
  const e2 = edited.entries[1] as Expense;
  eq([e2.id, e2.at, e2.rot, e2.payer, e2.amount, e2.note, e2.split], ["e2", 1, 0, "w", 9000, "改过", { how: "equal", among: ["s", "w"] }], "an edit changes who paid, how much, the note and the sharing; its id, time and turn stay");
  eq(editExpense(l, "e2", { payer: "w", amount: 0, note: "", split: { how: "equal", among: ["s"] } }) === l, true, "an edit that isn't sound is refused");
  eq(JSON.stringify(editExpense(l, "nope", { payer: "w", amount: 100, note: "", split: { how: "equal", among: ["s"] } })) === JSON.stringify(l), true, "an edit to an expense that isn't there changes nothing");

  const out = takeOut(l, "e3", 99);
  eq([(out.entries[2] as Expense).gone, expensesOf(out).length, nextRot(out)], [99, 2, nextRot(l)], "an expense taken out counts for nothing, and nobody else's odd cent moves");
  eq(JSON.stringify(putBack(out, "e3")) === JSON.stringify(l), true, "put back, the ledger is as it was");
  ok(!("gone" in putBack(out, "e3").entries[2]), "with no mark left on it");
  const outAtZero = takeOut(l, "e3", 0);
  eq([(outAtZero.entries[2] as Expense).gone, expensesOf(outAtZero).length, balances(outAtZero)], [0, 2, balances(out)], "taken out at time 0 is taken out all the same");

  const paid = addTransfer(l, { id: "t1", at: 5, from: "j", to: "w", amount: 7750 });
  eq(paid.entries.length, 4, "a transfer goes in");
  eq(addTransfer(paid, { id: "t1", at: 6, from: "j", to: "w", amount: 7750 }) === paid, true, "once, however many times it is sent");
  eq(addTransfer(l, { id: "t2", at: 5, from: "j", to: "j", amount: 100 }) === l, true, "nobody pays themselves");
  eq(addTransfer(l, { id: "t2", at: 5, from: "j", to: "zz", amount: 100 }) === l, true, "or someone who isn't in the ledger");
  eq(addTransfer(l, { id: "t2", at: 5, from: "j", to: "w", amount: 0 }) === l, true, "or nothing");

  // people
  eq(addMember(l, { id: "c", name: " 老陈 " }).members.at(-1), { id: "c", name: "老陈" }, "a new person goes on the end of the roster, name tidied");
  eq(addMember(l, { id: "c", name: "  " }) === l, true, "nobody without a name");
  eq(addMember(l, { id: "c", name: "jason" }) === l, true, "nobody with a name already taken, whatever the capitals");
  eq(addMember(l, { id: "s", name: "新人" }) === l, true, "nobody with an id already there");
  let full = l;
  for (let i = 0; i < 40; i++) full = addMember(full, { id: `x${i}`, name: `X${i}` });
  eq(full.members.length, MAX_MEMBERS, "and never past what a ledger holds");
  eq([nameTaken(l, "STEVE"), nameTaken(l, "Steve", "s"), nameTaken(l, " steve  ")], [true, false, true], "a name is taken whatever its capitals or spaces, except by its own holder");
  eq(renameMember(l, "s", " 斯蒂夫 ").members[0], { id: "s", name: "斯蒂夫" }, "a rename");
  eq(renameMember(l, "s", "STEVE").members[0].name, "STEVE", "someone can change the capitals of their own name");
  eq(renameMember(l, "s", "小王") === l, true, "but not take someone else's name");
  eq(renameMember(l, "s", "   ") === l, true, "or none");
  eq([inAnyEntry(l, "w"), inAnyEntry(l, "m"), inAnyEntry(l, "nobody")], [true, true, false], "who an entry names: whoever paid, whoever shares");
  eq(inAnyEntry(takeOut(addExpense(startLedger("z", "z", "CAD", five.members), exp("only", "l", 500, { how: "exact", amounts: { j: 500 } })), "only", 1), "j"), true, "even an entry taken out still names its people (it can come back)");
  eq(inAnyEntry(paid, "j"), true, "and so does a transfer");
  const withNew = addMember(l, { id: "c", name: "老陈" });
  eq(removeMember(withNew, "c").members.length, 5, "someone no entry names can be taken off");
  eq(removeMember(withNew, "w") === withNew, true, "someone with entries can't");
  const two = startLedger("t", "t", "CAD", [{ id: "a", name: "A" }, { id: "b", name: "B" }]);
  eq(removeMember(two, "b") === two, true, "and a ledger keeps at least two people");
  eq([renameLedger(l, "  新名字 ").name, renameLedger(l, "   ") === l], ["新名字", true], "a ledger renamed; not to nothing");
}

// ---------- 5. the plan's weekend, as the screens record it ----------
{
  let l = five;
  const record = (id: string, me: string, text: string, payer: string | null, note: string) => {
    const d = { ...blankDraft(l, me), text, note, ...(payer ? { payer } : {}) };
    // (记一笔 sends the expense as a change, with the turn for the odd cents the ledger shows it then)
    const expense = { kind: "expense" as const, id, at: l.entries.length + 1, payer: d.payer, amount: amountOf(d, 2)!, note: d.note, split: splitOf(d, 2), rot: nextRot(l) };
    const sameAsBefore = addExpense(l, expense);
    l = applyChange(l, { do: "expense", expense }) ?? l;
    ok(JSON.stringify(l) === JSON.stringify(sameAsBefore), `${note}: recorded as a change, the ledger is what recording it on the phone alone made it`);
  };
  eq(standing(l, "s", "zh"), "还没记账", "before anything is recorded");
  record("e1", "s", "186", "w", "晚饭");
  record("e2", "s", "120", null, "油费");
  record("e3", "s", "81.50", "m", "早餐");
  eq(spent(l), 38750, "three expenses, $387.50");
  eq(balances(l), { s: 4250, w: 10850, m: 400, j: -7750, l: -7750 }, "who is owed what");
  eq([standing(l, "s", "zh"), standing(l, "s", "en")], ["你该收 $42.50", "You're owed $42.50"], "the ledger's card, for Steve");
  eq([standing(l, "j", "zh"), standing(l, "j", "en")], ["你该给 $77.50", "You owe $77.50"], "and for Jason");
  eq([standing(l, undefined, "zh"), standing(l, "left", "zh"), mine(l, "left"), mine(l, "s")], ["", "", undefined, "s"], "a phone that doesn't know who you are says nothing about you");
  const first = l.entries[0] as Expense;
  eq([paidBy(first, l, "s", "zh"), paidBy(first, l, "w", "zh"), paidBy(first, l, "s", "en"), paidBy(first, l, "w", "en")], ["小王付", "你付", "小王 paid", "You paid"], "who paid, on a row");
  eq([sharedHow(first, l, "s", "zh"), sharedHow(first, l, "s", "en")], ["5 人平分", "split 5 ways"], "how it was shared, on a row");
  const alone = (who: string): Expense => ({ ...first, split: { how: "equal", among: [who] } });
  eq([sharedHow(alone("s"), l, "s", "zh"), sharedHow(alone("j"), l, "s", "zh"), sharedHow(alone("j"), l, "s", "en")], ["你一个人的", "Jason一个人的", "all Jason's"], "an expense that is all one person's");
  eq([sharedHow({ ...first, split: { how: "shares", shares: { s: 2, w: 1 } } }, l, "s", "zh"), sharedHow({ ...first, split: { how: "exact", amounts: { s: 18600 } } }, l, "s", "zh")], ["按份数分", "按金额分"], "by shares, by amounts");
  eq([nameFor(l, "s", "s", "zh"), nameFor(l, "s", "s", "en"), nameFor(l, "w", "s", "zh"), nameFor(l, "zz", "s", "zh")], ["你", "You", "小王", ""], "a name as you read it");

  const plan = settlement(l);
  eq(plan.steps, [
    { from: "j", to: "w", amount: 7750 },
    { from: "l", to: "s", amount: 4250 },
    { from: "l", to: "w", amount: 3100 },
    { from: "l", to: "m", amount: 400 },
  ], "four transfers square it up");
  eq(plan.steps.map((s) => paysLine(l, s.from, s.to, "s", "zh")), ["Jason 给 小王", "小李 给 你", "小李 给 小王", "小李 给 阿美"], "as Steve reads them");
  eq(plan.steps.map((s) => paysLine(l, s.from, s.to, "l", "en")), ["Jason pays 小王", "You pay Steve", "You pay 小王", "You pay 阿美"], "as 小李 reads them, in English");
  eq(planText(l, plan, "zh"), "惠斯勒周末 · 结清\nJason 给 小王 $77.50\n小李 给 Steve $42.50\n小李 给 小王 $31.00\n小李 给 阿美 $4.00", "the plan, as pasted into the group chat: names, never 你");
  eq(planText(l, plan, "en"), "惠斯勒周末: settling up\nJason pays 小王 $77.50\n小李 pays Steve $42.50\n小李 pays 小王 $31.00\n小李 pays 阿美 $4.00", "and in English");

  // one by one they pay: the plan holds still, and at the end everyone is square
  l = addTransfer(l, { id: "t1", at: 10, ...plan.steps[0] });
  const one = settlement(l);
  eq([one.steps.map((s) => [s.from, s.to, s.amount]), one.steps.map((s) => s.paid), one.clear], [plan.steps.map((s) => [s.from, s.to, s.amount]), ["t1", undefined, undefined, undefined], false], "one marked: the same four lines, the first ticked");
  ok(planText(l, one, "zh").split("\n")[1] === "Jason 给 小王 $77.50（已转）" && planText(l, one, "en").split("\n")[1] === "Jason pays 小王 $77.50 (paid)", "and the pasted plan says which is paid");
  plan.steps.slice(1).forEach((s, i) => (l = addTransfer(l, { id: `t${i + 2}`, at: 11 + i, ...s })));
  const done = settlement(l);
  eq([done.clear, done.steps.every((s) => s.paid), Object.values(balances(l)).every((n) => n === 0)], [true, true, true], "all four marked: everyone is square");
  eq(standing(l, "s", "zh"), "你两清了", "and the card says so");
  ok(planText(l, done, "zh").endsWith("\n全部两清了。"), "and so does the pasted plan");
  const undone = takeOut(l, "t2", 20);
  eq([settlement(undone).clear, standing(undone, "s", "zh")], [false, "你该收 $42.50"], "a mark taken back: Steve is owed again");
  eq(settlement(putBack(undone, "t2")).clear, true, "and put back, square again");
}

// ---------- 6. what is kept on the phone, and what the server answers ----------
{
  const l = addTransfer(addExpense(five, { id: "e1", at: 1, payer: "w", amount: 18600, note: "晚饭", split: { how: "equal", among: roster } }), { id: "t1", at: 2, from: "j", to: "w", amount: 100 });
  const key = "k".repeat(43);
  const waiting: Sent = { id: "c1", at: 5, change: { do: "expense", expense: { kind: "expense", id: "e2", at: 5, payer: "s", amount: 1200, note: "油费", split: { how: "equal", among: roster }, rot: 1 } } };
  const lost: Sent = { id: "c0", at: 4, change: { do: "rename", member: "w", name: "阿美" } };
  const h: Held = { key, made: true, seq: 2, server: l, waiting: [waiting], lost: [lost] };
  const saved = { held: [h], me: { L: "s" } };
  eq(parseSaved(JSON.stringify(saved)), saved, "what was saved comes back as it was: the server's ledger, the key, what is waiting, what didn't stick");
  eq(shown(parseSaved(JSON.stringify(saved)).held[0]).entries.map((e) => e.id), ["e1", "t1", "e2"], "and what was recorded with no signal is on the screen again after the page is closed and opened");
  eq(parseSaved(null), { held: [], me: {} }, "nothing saved");
  for (const junk of ["", "{", "null", "[]", "42", '"x"', '{"held":7,"me":[]}', '{"held":[null,7,"x",{}],"me":{"a":1}}']) eq(parseSaved(junk), { held: [], me: {} }, `${junk || "(empty)"} is no ledgers, and no crash`);
  eq(parseSaved(JSON.stringify({ ledgers: [l], me: {} })).held, [], "the first sample's record (ledgers kept on the phone alone) holds nothing this reads as a ledger");
  const damaged = JSON.stringify({
    held: [
      {
        ...h,
        server: { ...l, entries: [...l.entries, { kind: "expense", id: "bad" }, null, { kind: "what" }, { kind: "transfer", id: "t9", at: 1, amount: "5", from: "j", to: "w" }], members: [...l.members, { id: 5 }, "x"], extra: true },
        waiting: [waiting, null, { id: "c2" }, { id: "c3", at: 1, change: { do: "what" } }, { id: "c4", at: 1, change: { do: "expense", expense: { id: "e9" } } }],
        lost: [lost, 7],
        extra: true,
      },
      { ...h, server: { id: "nobody", name: "x", currency: "CAD", members: [], entries: [] } },
      { ...h, key: "short" },
      { ...h, key: undefined },
      { ...h, made: "yes" },
      { ...h, seq: -1 },
      { ...h, seq: 1.5 },
      { ...h, server: { id: "half" } },
      { id: "L" },
    ],
    me: { L: "s", other: 3 },
  });
  eq(parseSaved(damaged), saved, "a damaged record keeps every ledger, person, entry and waiting change that is still whole, and drops the rest");
  eq(parseSaved(JSON.stringify({ held: [{ ...h, waiting: 5, lost: null }], me: {} })).held[0], { ...h, waiting: [], lost: [] }, "a ledger whose list of waiting changes is gone is still a ledger, with nothing waiting");
  const odd = parseSaved(JSON.stringify({ held: [{ ...h, waiting: [], server: { ...l, entries: [{ kind: "expense", id: "e", at: 1, payer: "zz", amount: -5, note: "", rot: 0, split: { how: "equal", among: [] } }] } }], me: {} })).held[0].server;
  eq([odd.entries.length, expensesOf(odd).length, Object.values(balances(odd)).every((n) => n === 0)], [1, 0, true], "an entry that has the shape but isn't sound is kept and counts for nothing");
  const zero = parseSaved(JSON.stringify({ held: [{ ...h, waiting: [], server: { ...l, entries: l.entries.map((e) => ({ ...e, gone: 0 })) } }], me: {} })).held[0].server;
  eq([zero.entries.length, expensesOf(zero).length, settlement(zero).clear, Object.values(balances(zero)).every((n) => n === 0)], [2, 0, true, true], "entries saved as taken out at time 0 come back taken out, and count for nothing");

  // what the server answers is read the same way: only what has the shape of an answer is one
  eq(asSnapshot({ seq: 2, ledger: l, extra: 1 }), { seq: 2, ledger: l }, "the server saying where a ledger stands");
  for (const [what, x] of [["nothing", null], ["a page from a hotel's sign-in", "<html>"], ["no number", { ledger: l }], ["a number that isn't one", { seq: "2", ledger: l }], ["a number below 0", { seq: -1, ledger: l }], ["no ledger", { seq: 2 }], ["a ledger with nobody in it", { seq: 2, ledger: { ...l, members: [] } }]] as [string, unknown][])
    ok(asSnapshot(x) === null, `${what} is not an answer`);
  eq(asPushed({ seq: 3, ledger: l, took: ["new", "seen", "nothing"] }, 3), { seq: 3, ledger: l, took: ["new", "seen", "nothing"] }, "the answer to three changes says what became of each");
  ok(asPushed({ seq: 3, ledger: l, took: ["new"] }, 3) === null && asPushed({ seq: 3, ledger: l, took: ["new", "yes", "seen"] }, 3) === null && asPushed({ seq: 3, ledger: l }, 0) === null, "one that says so for fewer, or in another word, or not at all, is not an answer");

  const ids = Array.from({ length: 2000 }, newId);
  ok(ids.every((id) => /^[A-Za-z0-9_-]{22}$/.test(id)), "a new id is 22 letters, digits, - or _: it fits an address (src/router.ts takes 6 to 64 of them)");
  ok(new Set(ids).size === ids.length, "2,000 new ids, no two alike");
  const keys = Array.from({ length: 2000 }, newKey);
  ok(keys.every((k) => /^[A-Za-z0-9_-]{43}$/.test(k)) && new Set(keys).size === keys.length, "a new key is 43 of the same, 32 random bytes: what the server takes for one (22 to 128), and no two alike");
  ok([...ids, ...keys].every((x) => /^[A-Za-z0-9]/.test(x) && /[A-Za-z0-9]$/.test(x)) && [...ids, ...keys].some((x) => /[-_]/.test(x)), "each begins and ends with a letter or a digit (a chat app leaves a last - or _ out of a link), with - and _ only inside");
  ok(parseSaved(JSON.stringify({ held: [hold(five, keys[0])], me: {} })).held[0].key === keys[0], "and a ledger just opened is kept with its key");
}

// ---------- 7. what the screens say about the server ----------
{
  const l = addExpense(five, { id: "e1", at: 1, payer: "w", amount: 18600, note: "晚饭", split: { how: "equal", among: roster } });
  const sent = (change: Change): Sent => ({ id: "c", at: 1, change });
  const waits = (n: number) => ({ made: true, waiting: Array.from({ length: n }, () => sent({ do: "title", name: "x" })) });
  const well = { away: false, trouble: null };
  const away = { away: true, trouble: null };
  eq([syncLine(waits(0), well, "zh"), syncLine(waits(2), well, "zh"), syncLine({ made: false, waiting: [] }, well, "zh")], [null, null, null], "in step, or a change simply on its way, or a ledger being made: nothing is said");
  eq(syncLine(waits(0), away, "zh"), { text: "没连上，看到的可能不是最新的。", loud: false }, "no signal and nothing waiting: said quietly");
  eq([syncLine(waits(1), away, "zh")?.text, syncLine(waits(1), away, "en")?.text], ["有 1 处改动还没发出去，有信号就发。", "1 change hasn't been sent yet. It goes when there's a signal."], "one change waiting");
  eq([syncLine(waits(3), away, "zh")?.text, syncLine(waits(3), away, "en")?.text, syncLine(waits(3), away, "en")?.loud], ["有 3 处改动还没发出去，有信号就发。", "3 changes haven't been sent yet. They go when there's a signal.", false], "three waiting: quiet too, they will go by themselves");
  eq(syncLine({ made: false, waiting: waits(2).waiting }, away, "zh")?.text, "这个账本还没存到云端，有信号就存。", "a ledger the server hasn't made yet says that, not how many changes");
  for (const trouble of ["limit", "gone", "key", "taken", "stuck"] as const) {
    const said = syncLine(waits(1), { away: true, trouble }, "zh");
    const en = syncLine(waits(1), { away: false, trouble }, "en");
    ok(said?.loud && en?.loud && said.text.length > 8 && en.text.length > 20 && said.text !== syncLine(waits(1), away, "zh")?.text, `${trouble}: the phone can't go on sending, said in the strong voice, whatever the signal → ${said?.text}`);
  }
  eq(new Set((["limit", "gone", "key", "taken", "stuck"] as const).map((trouble) => syncLine(waits(0), { away: false, trouble }, "zh")?.text)).size, 5, "and each of the five in words of its own");

  const expense = { kind: "expense" as const, id: "e9", at: 1, payer: "s", amount: 4250, split: { how: "equal" as const, among: ["s", "gone"] }, rot: 0 };
  eq([lostLine(l, sent({ do: "expense", expense: { ...expense, note: "  打车 " } }), "zh"), lostLine(l, sent({ do: "expense", expense: { ...expense, note: "" } }), "en")], ["记一笔：打车 $42.50", "New expense: No note $42.50"], "an expense that didn't stick is named by its note and amount");
  const edited = sent({ do: "edit", entry: "e1", to: { payer: "s", amount: 20000, note: "晚饭", split: { how: "equal", among: ["gone"] } } });
  eq([lostLine(l, edited, "zh"), lostLine(l, edited, "en")], ["改一笔：晚饭 $200.00", "Edit: 晚饭 $200.00"], "a change to one, by what it was changed to");
  eq([lostLine(l, sent({ do: "transfer", transfer: { id: "t", at: 1, from: "l", to: "w", amount: 3100 } }), "zh"), lostLine(l, sent({ do: "transfer", transfer: { id: "t", at: 1, from: "l", to: "w", amount: 3100 } }), "en")], ["标成已转：小李 给 小王 $31.00", "Marked as paid: 小李 pays 小王 $31.00"], "a transfer, by who was to pay whom, in real names");
  eq([lostLine(l, sent({ do: "member", member: { id: "n", name: " 老陈 " } }), "zh"), lostLine(l, sent({ do: "member", member: { id: "n", name: "Ann" } }), "en")], ["加人：老陈", "New person: Ann"], "someone added, by name");
  eq([lostLine(l, sent({ do: "rename", member: "w", name: " Zed " }), "zh"), lostLine(l, sent({ do: "rename", member: "w", name: "Zed" }), "en")], ["改名：小王 改成 Zed", "Rename: 小王 to Zed"], "someone renamed, by who they are and what they were to be called");
  eq([lostLine(l, sent({ do: "remove", member: "j" }), "zh"), lostLine(l, sent({ do: "remove", member: "j" }), "en")], ["去掉：Jason", "Removed: Jason"], "someone taken out, by name");
  eq(
    [
      lostLine(l, sent({ do: "remove", member: "nobody" }), "zh"),
      lostLine(l, sent({ do: "rename", member: "nobody", name: "Zed" }), "zh"),
      lostLine(l, sent({ do: "transfer", transfer: { id: "t", at: 1, from: "nobody", to: "w", amount: 5 } }), "zh"),
      lostLine(l, sent({ do: "out", entry: "e1", at: 2 }), "en"),
      lostLine(l, sent({ do: "back", entry: "e1" }), "en"),
      lostLine(l, sent({ do: "title", name: "x" }), "zh"),
    ],
    ["一处别的改动", "一处别的改动", "一处别的改动", "Another change", "Another change", "一处别的改动"],
    "and anything it can't name is still counted",
  );
}

// ---------- 8. an invitation ----------
{
  const id = "Ab3-_xyzAb3-_xyzAb3-_x";
  const key = newKey();
  const link = inviteLink("https://changle.ca", id, key);
  // (said with ok, not eq: eq writes what it compared into the log, and a key, even a made-up one, has no place there)
  ok(link === `https://changle.ca/split/${id}#k=${key}`, "the link: the ledger's address, and its key after the #");
  const url = new URL(link);
  eq(parse(url.pathname, url.search), { kind: "split", id }, "it opens the ledger's page");
  ok(keyFrom(url.hash) === key && !url.pathname.includes(key) && !url.search.includes(key), "the key is read back from it, and is in no part of it that is sent to a server");
  ok(fromLegacyHash(url.hash) === null, "and it isn't mistaken for one of the site's old #/ links");
  ok([`#k=${key}&from=singlemessage`, `#from=timeline&k=${key}`, `#a=1&k=${key}&b=2`].every((hash) => keyFrom(hash) === key), "whatever else an app adds after the #, before or behind, the key is still found");
  ok([".", ")", "。", "%EF%BC%8C%E5%BF%AB%E6%9D%A5", "/", "?x=1"].every((tail) => keyFrom(`#k=${key}${tail}`) === key), "and so is one with the end of a sentence stuck to it (a full stop, a bracket, the next words)");
  for (const [what, hash] of [["no # part", ""], ["an empty one", "#"], ["no key", "#k="], ["a key too short", "#k=abc"], ["a key too long", `#k=${"a".repeat(129)}`], ["one with something that isn't in a key", `#k=${key.slice(0, 20)}+${key.slice(21)}`], ["another name", `#key=${key}`], ["a name that only ends in k", `#ok=${key}`], ["an old site link", "#/g/truth"]] as [string, string][])
    ok(keyFrom(hash) === null, `${what} is no invitation`);
  const made = Array.from({ length: 300 }, () => inviteLink("https://changle.ca", newId(), newKey()));
  ok(made.every((l) => /[A-Za-z0-9]$/.test(l) && !/\s/.test(l) && l.length < 100), "300 links: each ends in a letter or digit, has no spaces, and is under 100 characters");

  ok(inviteText("惠斯勒周末", link, "zh") === `来「惠斯勒周末」一起记账：\n${link}`, "what is pasted into the group chat: what this is, then the link on a line of its own");
  ok(inviteText("Whistler", link, "en") === `Join the ledger "Whistler" on All Square:\n${link}`, "and in English");

  // the code to scan: every dark square the library worked out is in the drawing, and nothing else is
  const qr = qrPath(link);
  const want = QRCode.create(link, { errorCorrectionLevel: "M" }).modules;
  const drawn = new Uint8Array(want.size * want.size);
  let whole = !!qr;
  for (const m of (qr?.d ?? "").matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    const [x, y, run, back] = m.slice(1).map(Number);
    if (run !== back || x + run > want.size) whole = false;
    for (let i = 0; i < run; i++) drawn[y * want.size + x + i] += 1;
  }
  ok(whole && qr?.size === want.size && want.size >= 21 && (qr?.d ?? "").replace(/M\d+ \d+h\d+v1h-\d+z/g, "") === "", `the code is drawn on a grid ${want.size} squares wide, in rectangles one square tall and nothing else`);
  ok(drawn.every((n, i) => n === (want.data[i] ? 1 : 0)), "every dark square is drawn once, and no light one");
  ok(qrPath("x".repeat(5000)) === null, "a text too long for a code draws nothing, and doesn't throw");
}

// ---------- 9. words ----------
const here = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(join(here, p), "utf8");
function walk(dir: string): string[] {
  return readdirSync(join(here, dir)).flatMap((n) => {
    const p = join(dir, n).replace(/\\/g, "/");
    return statSync(join(here, p)).isDirectory() ? walk(p) : [p];
  });
}
const source = walk("src/split").filter((p) => /\.(tsx?|css)$/.test(p));
const code = source.filter((p) => /\.tsx?$/.test(p) && p !== "src/split/words.ts");
/** A file with its comments taken out (what is left is what runs or shows). */
const bare = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
{
  const blanks = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  const words = Object.keys(W) as Word[];
  ok(words.every((k) => W[k].zh.trim() && W[k].en.trim()), `all ${words.length} lines are written in Chinese and in English`);
  const uneven = words.filter((k) => blanks(W[k].zh) !== blanks(W[k].en));
  ok(!uneven.length, `each has the same blanks to fill in both languages${uneven.length ? ` (not ${uneven.join(", ")})` : ""}`);
  const cjkInEnglish = words.filter((k) => /[㐀-鿿　-〿＀-￯]/.test(W[k].en));
  ok(!cjkInEnglish.length, `no Chinese, or Chinese punctuation, in an English line${cjkInEnglish.length ? ` (${cjkInEnglish.join(", ")})` : ""}`);
  const sameBoth = words.filter((k) => W[k].zh === W[k].en);
  ok(!sameBoth.length, `none is the same in both, a line left untranslated${sameBoth.length ? ` (${sameBoth.join(", ")})` : ""}`);
  eq(say("zh", "transfers", { n: 4 }), "4 笔转账，全部两清", "a blank filled in");
  eq(say("en", "pays", { from: "A", to: "B" }), "A pays B", "two blanks");
  eq(say("zh", "remove", { who: "{who}" }), "去掉 {who}", "a name that looks like a blank is left as the name it is");
  const all = code.map(bare).join("\n");
  const unused = words.filter((k) => !new RegExp(`["']${k}["']|\\bW\\.${k}\\b`).test(all));
  ok(!unused.length, `every line is used by a screen${unused.length ? ` (unused: ${unused.join(", ")})` : ""}`);
  const asked = [...all.matchAll(/\bsay\(\s*lang\s*,\s*"(\w+)"/g)].map((m) => m[1]).filter((k) => !(k in W));
  ok(!asked.length, `and every line a screen asks for is in the table${asked.length ? ` (missing: ${asked.join(", ")})` : ""}`);
  // a line break inside a line marks where it may wrap first (Chinese has no spaces to say so): it is
  // in both languages, and the line is shown by something that keeps it
  const broken = words.filter((k) => W[k].zh.includes("\n") || W[k].en.includes("\n"));
  const lopsided = broken.filter((k) => W[k].zh.split("\n").length !== W[k].en.split("\n").length);
  ok(broken.length > 0 && !lopsided.length, `a line broken in two is broken in both languages${lopsided.length ? ` (not ${lopsided.join(", ")})` : ""}`);
  const dropped = broken.filter((k) => !new RegExp(`<Sentences text=\\{say\\(lang, "${k}"\\)|\\bbody=\\{say\\(lang, "${k}"\\)\\}`).test(all));
  ok(!dropped.length, `and is shown by something that keeps the break: Sentences, or the empty state's words${dropped.length ? ` (not ${dropped.join(", ")})` : ""}`);
}

// ---------- 10. tokens only, and no words outside the table ----------
{
  for (const p of code) {
    const src = bare(p);
    const cjk = src.match(/[㐀-鿿]+/g) ?? [];
    ok(!cjk.length, `${p}: nothing a player reads is written here, only in words.ts${cjk.length ? ` (found ${cjk.slice(0, 3).join(", ")})` : ""}`);
  }
  for (const p of source.filter((x) => x !== "src/split/words.ts")) {
    const src = bare(p);
    const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    const colors = src.match(/\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/g) ?? [];
    ok(!hex.length && !colors.length, `${p}: no colors of its own${hex.length || colors.length ? ` (found ${[...hex, ...colors].slice(0, 3).join(", ")})` : ""}`);
    const inline = src.match(/\bstyle=\{/g) ?? [];
    ok(!inline.length, `${p}: no styles written on an element`);
  }
  for (const p of source.filter((x) => x.endsWith(".css"))) {
    const css = bare(p);
    // every length is a token, but for hairlines and rings (1 to 3px) and the heights a phone's screen is asked about
    const rules = css.replace(/@media[^{]*\{/g, "@media {");
    const lengths = (rules.match(/(?<![\w.-])\d*\.?\d+(px|rem|em|vh|vw|dvh|svh|lvh|ch|pt)\b/g) ?? []).filter((v) => !/^[123]px$/.test(v));
    ok(!lengths.length, `${p}: sizes and spacing come from tokens${lengths.length ? ` (found ${[...new Set(lengths)].slice(0, 5).join(", ")})` : ""}`);
    const times = rules.match(/(?<![\w.-])\d*\.?\d+m?s\b/g) ?? [];
    ok(!times.length, `${p}: timings come from tokens${times.length ? ` (found ${times.slice(0, 3).join(", ")})` : ""}`);
    const fonts = (rules.match(/font(-size)?\s*:[^;]+;/g) ?? []).filter((f) => !/var\(--text-/.test(f) && !/font\s*:\s*inherit/.test(f));
    ok(!fonts.length, `${p}: every font size is a step of the scale${fonts.length ? ` (found ${fonts.slice(0, 2).join(" ")})` : ""}`);
    const unknown = [...new Set([...rules.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))].filter((v) => !new RegExp(`${v}\\s*:`).test(read("src/styles/tokens.css")));
    ok(!unknown.length, `${p}: every token it uses is one tokens.css defines${unknown.length ? ` (not ${unknown.join(", ")})` : ""}`);
    ok(/prefers-reduced-motion/.test(css), `${p}: says what happens with reduced motion`);
    const classes = [...new Set([...rules.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))].filter((c) => !/^(split|is|ui)-|^(split|field|field-label)$/.test(c));
    ok(!classes.length, `${p}: styles only its own classes (split-…), the shared components' (ui-…) and the site's form field${classes.length ? ` (also ${classes.join(", ")})` : ""}`);
  }
}

// ---------- 11. still hidden ----------
{
  // 两清 gets its card on the Tools tab when all three gates in docs/split.md are passed, and not before.
  // Until then its address is the only way in: nothing in the site but the router and the app shell may name it.
  // (its own check in a browser, scripts/split_check.ts, opens it by its address too)
  const mayNameIt = new Set(["src/router.ts", "src/App.tsx", "scripts/split_check.ts"]);
  const elsewhere = [...walk("src"), ...walk("scripts"), "index.html"].filter((p) => /\.(tsx?|mjs|js|json|html|css)$/.test(p) && !p.startsWith("src/split/") && !mayNameIt.has(p));
  const naming = elsewhere.filter((p) => /["'`(]\/split(\/|["'`)])|kind:\s*["']split["']|split\/SplitApp/.test(read(p)));
  ok(!naming.length, `nothing links to /split yet (${elsewhere.length} files looked at)${naming.length ? `: ${naming.join(", ")}` : ""}`);
  ok(!/split/i.test(read("public/robots.txt")) && !/["'`]\/split/.test(read("scripts/postbuild.ts")), "and it isn't in the sitemap or robots.txt");
}

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
