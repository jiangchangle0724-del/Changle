/*
 * 两清's changes (src/split/changes.ts): what phones send and the server takes, one at a time.
 * Run with `npx tsx tests/split-changes.test.ts`
 *  1. Every made-up ledger can be built out of changes, and comes out the same.
 *  2. Once only: sent twice, sent again later, or all over again, a change counts once.
 *  3. Phones that were offline: whatever order their changes arrive in, nothing is lost, nothing
 *     is doubled, and everyone stands where the ledger says.
 *  4. Three expenses recorded with no signal (the plan's gate 2), the reply lost, sent again.
 *  5. Two phones change the same expense: the later one stands. An expense paid in another
 *     currency, changed: what is said about that currency, said null, and not said.
 *  6. What changes nothing, and that it really changes nothing.
 *  7. What arrives from the network: junk is no change, and nothing extra rides in.
 *  8. Thousands of changes of every kind, sound and not: the ledger stays sound.
 *  9. The phone's own view: the server's ledger with what is still waiting on top.
 */
import { balances, expensesOf, MAX_MEMBERS, nextRot, portionsOf, type Entry, type Expense, type Ledger, type Split } from "../src/split/core";
import { accept, applyChange, MAX_ENTRIES, parseSent, rebase, type Change, type Sent, type Took } from "../src/split/changes";
import { addExpense, startLedger } from "../src/split/ops";
import { asLedger } from "../src/split/shape";
import { randomLedger, rng } from "./split/ledgers";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
/** The same thing whatever order its fields were written in. */
const canon = (x: unknown): string =>
  JSON.stringify(x, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const eq = (got: unknown, want: unknown, msg: string) => ok(canon(got) === canon(want), `${msg}${canon(got) === canon(want) ? "" : ` → ${canon(got)}, wanted ${canon(want)}`}`);
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const byId = (l: Ledger) => [...l.entries].sort((a, b) => (a.id < b.id ? -1 : 1));

let made = 0;
const sent = (change: Change, at = 0): Sent => ({ id: `c${++made}`, at, change });

/** The changes that record one entry: it goes in, and if it was taken out, it is taken out. */
function recording(e: Entry): Sent[] {
  const { gone, ...rest } = e;
  const first: Change = rest.kind === "expense" ? { do: "expense", expense: rest } : { do: "transfer", transfer: { id: rest.id, at: rest.at, from: rest.from, to: rest.to, amount: rest.amount } };
  return gone === undefined ? [sent(first, e.at)] : [sent(first, e.at), sent({ do: "out", entry: e.id, at: gone }, gone)];
}
const changesOf = (l: Ledger): Sent[] => l.entries.flatMap(recording);
const empty = (l: Ledger): Ledger => ({ ...l, entries: [] });
/** A server taking these, one at a time. */
function serve(start: Ledger, changes: Sent[], seen = new Map<string, boolean>()) {
  let ledger = start;
  const took: Took[] = [];
  for (const s of changes) {
    const r = accept(ledger, seen, s);
    ledger = r.ledger;
    took.push(r.took);
  }
  return { ledger, took, seen };
}
const count = (took: Took[], what: Took) => took.filter((t) => t === what).length;

// ---------- 1. every made-up ledger, out of changes ----------
{
  let same = 0;
  let entries = 0;
  let allNew = true;
  for (let seed = 1; seed <= 400; seed++) {
    const l = randomLedger(seed);
    const built = serve(empty(l), changesOf(l));
    if (canon(built.ledger) === canon(JSON.parse(JSON.stringify(l)))) same++;
    allNew &&= built.took.every((t) => t === "new");
    entries += l.entries.length;
  }
  ok(same === 400 && allNew, `400 made-up ledgers (${entries} entries) built one change at a time come out the same, every change counting → ${same}`);
}

// ---------- 2. once only ----------
{
  let good = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed);
    const l = randomLedger(seed);
    const once = changesOf(l);
    const twice: Sent[] = [];
    for (const s of once) {
      twice.push(s);
      // sent again straight away, and something from earlier sent again now. (Never before its own
      // first time: a phone sends everything it has waiting, oldest first.)
      if (r() < 0.3) twice.push(s);
      if (r() < 0.3) twice.push(twice[Math.floor(r() * twice.length)]);
    }
    const a = serve(empty(l), once);
    const b = serve(empty(l), [...twice, ...once]);
    if (canon(a.ledger) === canon(b.ledger) && count(b.took, "new") === once.length && count(b.took, "nothing") === 0) good++;
  }
  ok(good === 200, `200 ledgers with changes sent twice, sent again later, and then all over again: each counts once → ${good}`);
}

// ---------- 3. phones that were offline ----------
{
  let good = 0;
  let orders = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed * 7);
    const l = randomLedger(seed);
    // five phones, each holding some of the entries, in the order it recorded them
    const phones: Sent[][] = [[], [], [], [], []];
    for (const e of l.entries) phones[Math.floor(r() * 5)].push(...recording(e));
    const want = { nets: canon(balances(l)), entries: canon(byId(JSON.parse(JSON.stringify(l)) as Ledger)) };
    let agree = true;
    for (let round = 0; round < 6; round++) {
      // their changes arrive shuffled together, each phone's own still in order
      const left = phones.map((p) => [...p]);
      const arriving: Sent[] = [];
      while (left.some((p) => p.length)) {
        const waiting = left.filter((p) => p.length);
        arriving.push(waiting[Math.floor(r() * waiting.length)].shift()!);
      }
      const got = serve(empty(l), arriving).ledger;
      agree &&= canon(balances(got)) === want.nets && canon(byId(got)) === want.entries && new Set(got.entries.map((e) => e.id)).size === got.entries.length;
      orders++;
    }
    if (agree) good++;
  }
  ok(good === 200, `200 ledgers recorded on five phones, their changes arriving in ${orders} different orders: nothing lost, nothing doubled, everyone stands the same → ${good}`);
}

// ---------- 4. three with no signal ----------
{
  const people = ["s", "w", "m", "j", "l"].map((id) => ({ id, name: id.toUpperCase() }));
  const five = people.map((p) => p.id);
  let server = startLedger("L", "Whistler", "CAD", people);
  const seen = new Map<string, boolean>();
  const take = (changes: Sent[]) => {
    const r = serve(server, changes, seen);
    server = r.ledger;
    return r.took;
  };
  take([sent({ do: "expense", expense: { kind: "expense", id: "e0", at: 1, payer: "w", amount: 18600, note: "晚饭", split: { how: "equal", among: five }, rot: 0 } })]);

  // Steve's phone loses its signal here, and records three more on what it has
  let phone = server;
  const offline: Sent[] = [];
  const three: Expense[] = [];
  for (const [id, amount] of [["a1", 10000], ["a2", 10001], ["a3", 333]] as const) {
    phone = addExpense(phone, { id, at: 10, payer: "s", amount, note: "", split: { how: "equal", among: ["s", "w", "m"] } });
    const expense = phone.entries[phone.entries.length - 1] as Expense;
    three.push(expense);
    offline.push(sent({ do: "expense", expense }, 10));
  }
  const shown = three.map((e) => portionsOf(e, phone));

  // meanwhile the others carry on
  take([
    sent({ do: "expense", expense: { kind: "expense", id: "b1", at: 11, payer: "m", amount: 10000, note: "", split: { how: "equal", among: ["s", "w", "m"] }, rot: nextRot(server) } }),
    sent({ do: "member", member: { id: "x", name: "Xi" } }),
    sent({ do: "transfer", transfer: { id: "t1", at: 12, from: "j", to: "w", amount: 3720 } }),
  ]);

  // the signal comes back: the three go up, the answer never arrives, so they go up again with a fourth
  const first = take(offline);
  const fourth = sent({ do: "expense", expense: { kind: "expense", id: "a4", at: 20, payer: "s", amount: 500, note: "", split: { how: "equal", among: ["s", "x"] }, rot: 7 } }, 20);
  const again = take([...offline, fourth]);
  eq([first, again], [["new", "new", "new"], ["seen", "seen", "seen", "new"]], "three recorded with no signal go up; sent again with a fourth, only the fourth is new");
  eq(server.entries.map((e) => e.id), ["e0", "b1", "t1", "a1", "a2", "a3", "a4"], "the ledger holds each of them once, after what the others did meanwhile");
  eq(three.map((e) => portionsOf(server.entries.find((x) => x.id === e.id) as Expense, server)), shown, "and everyone's share of those three is what Steve's phone showed, to the cent");
  eq(shown.map((p) => [p.s, p.w, p.m]), [[3334, 3333, 3333], [3333, 3334, 3334], [111, 111, 111]], "the odd cents taking turns as they did on his phone");
  ok(sum(Object.values(balances(server))) === 0 && server.members.length === 6, "the ledger still adds up to zero, the new person included");
  eq(rebase(server, offline), server, "the phone, with nothing new waiting, shows the server's ledger");
}

// ---------- 5. two phones, one expense ----------
{
  const l = startLedger("L", "x", "CAD", [{ id: "a", name: "A" }, { id: "b", name: "B" }]);
  const start = applyChange(l, { do: "expense", expense: { kind: "expense", id: "e", at: 1, payer: "a", amount: 1000, note: "", split: { how: "equal", among: ["a", "b"] }, rot: 0 } })!;
  const to = (amount: number): Change => ({ do: "edit", entry: "e", to: { payer: "a", amount, note: "", split: { how: "equal", among: ["a", "b"] } } });
  const ab = serve(start, [sent(to(2000)), sent(to(3000))]);
  const ba = serve(start, [sent(to(3000)), sent(to(2000))]);
  eq([(ab.ledger.entries[0] as Expense).amount, (ba.ledger.entries[0] as Expense).amount, ab.took, ba.took], [3000, 2000, ["new", "new"], ["new", "new"]], "two phones change the same expense: the one that arrives second stands, and both are in the log");
  eq(serve(ab.ledger, [sent(to(3000))]).took, ["nothing"], "a change to what it already says changes nothing");
  const out = serve(start, [sent({ do: "out", entry: "e", at: 5 }), sent({ do: "out", entry: "e", at: 9 }), sent(to(4000))]);
  eq([out.took, out.ledger.entries[0]], [["new", "nothing", "new"], { ...(start.entries[0] as Expense), amount: 4000, gone: 5 }], "taken out twice keeps the first time; changed while it is out, it is still out");
  eq(serve(out.ledger, [sent({ do: "back", entry: "e" }), sent({ do: "back", entry: "e" })]).took, ["new", "nothing"], "put back once");
  const refused = sent({ do: "rename", member: "a", name: "B" });
  const twice = serve(start, [refused, sent(to(5000)), refused, refused]);
  eq(twice.took, ["nothing", "new", "nothing", "nothing"], "a change that changed nothing says so every time it is sent, so a phone whose answer was lost still learns it didn't stick");

  // paid in another currency: 30 US dollars at 1.40, which counts for 42 Canadian
  const usd = { currency: "USD", amount: 3000, rate: "1.40" };
  const said = { payer: "a", note: "", split: { how: "equal", among: ["a", "b"] } as Split };
  const abroad = applyChange(l, { do: "expense", expense: { kind: "expense", id: "e", at: 1, ...said, amount: 4200, rot: 0, paidIn: usd } })!;
  const now = (x: Ledger | null) => (x ? { amount: (x.entries[0] as Expense).amount, paidIn: (x.entries[0] as Expense).paidIn ?? "none" } : "nothing changed");
  const edit = (to: Omit<Partial<Expense>, "paidIn"> & { paidIn?: Expense["paidIn"] | null }, from = abroad) => now(applyChange(from, { do: "edit", entry: "e", to: { ...said, amount: 4200, ...to } }));
  eq(edit({ amount: 4900, paidIn: { currency: "USD", amount: 3500, rate: "1.40" } }), { amount: 4900, paidIn: { currency: "USD", amount: 3500, rate: "1.40" } }, "an expense paid in another currency is changed to 35 dollars: the change says both amounts, and both are kept");
  eq(edit({ paidIn: { currency: "USD", amount: 3000, rate: "1.39" }, amount: 4170 }), { amount: 4170, paidIn: { currency: "USD", amount: 3000, rate: "1.39" } }, "the rate alone is changed");
  eq(edit({ amount: 4200, paidIn: { currency: "JPY", amount: 4600, rate: "0.00913" } }), { amount: 4200, paidIn: { currency: "JPY", amount: 4600, rate: "0.00913" } }, "the currency is changed, and the amount it counts for happens to stay");
  eq(edit({ amount: 4200, paidIn: null }), { amount: 4200, paidIn: "none" }, "said null, it is an expense in the ledger's own currency from then on, even at the same amount");
  eq(edit({ amount: 5000, paidIn: null }), { amount: 5000, paidIn: "none" }, "and at another amount");
  eq(edit({ note: "lunch" }), { amount: 4200, paidIn: usd }, "a change that says nothing about the currency (a page from before) and leaves the amount alone: the other currency stays");
  eq(edit({ amount: 5000 }), { amount: 5000, paidIn: "none" }, "one that says nothing and changes the amount: the other currency goes, since 30 dollars no longer comes to it");
  eq(edit({}), "nothing changed", "one that says nothing and changes nothing is no change");
  eq(edit({ paidIn: usd }), "nothing changed", "nor is one that says what the expense already says");
  eq(edit({ paidIn: { currency: "USD", amount: 3000, rate: "1.40" }, amount: 4200 }, applyChange(abroad, { do: "out", entry: "e", at: 9 })!), "nothing changed", "(taken out or not)");
  eq(edit({ amount: 4200, paidIn: usd }, start), { amount: 4200, paidIn: usd }, "an expense in the ledger's currency can be changed into one paid in another");
  eq(
    [edit({ paidIn: { currency: "USD", amount: 3000, rate: "0" } }), edit({ paidIn: { currency: "USD", amount: 0, rate: "1.40" } }), edit({ paidIn: { currency: "USD", amount: 30.5, rate: "1.40" } }), edit({ amount: 5000, paidIn: { currency: "USD", amount: 3000, rate: "x" } })],
    ["nothing changed", "nothing changed", "nothing changed", "nothing changed"],
    "a change whose other currency isn't sound (no rate, nothing paid, half a cent) changes nothing at all, the amount included",
  );
  const kept = (applyChange(abroad, { do: "edit", entry: "e", to: { ...said, amount: 4900, paidIn: { currency: "USD", amount: 3500, rate: "1.40", extra: 1 } as Expense["paidIn"] } })!.entries[0] as Expense).paidIn;
  eq(Object.keys(kept ?? {}).sort(), ["amount", "currency", "rate"], "only the three things an other currency has are kept");
  const two = serve(abroad, [sent({ do: "edit", entry: "e", to: { ...said, amount: 5000 } }), sent({ do: "edit", entry: "e", to: { ...said, amount: 4170, paidIn: { currency: "USD", amount: 3000, rate: "1.39" } } })]);
  eq([two.took, now(two.ledger)], [["new", "new"], { amount: 4170, paidIn: { currency: "USD", amount: 3000, rate: "1.39" } }], "an old page and a new one change the same expense: the one that arrives second stands, whole");
}

// ---------- 6. what changes nothing ----------
{
  const people = Array.from({ length: MAX_MEMBERS }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const full = startLedger("L", "x", "CAD", people);
  const three = startLedger("L", "x", "CAD", people.slice(0, 3));
  const e = (over: Partial<Expense>): Change => ({ do: "expense", expense: { kind: "expense", id: "n", at: 1, payer: "p0", amount: 100, note: "", split: { how: "equal", among: ["p0", "p1"] }, rot: 0, ...over } });
  const base = serve(three, [sent(e({ id: "e1" })), sent({ do: "transfer", transfer: { id: "t1", at: 2, from: "p1", to: "p0", amount: 50 } })]).ledger;
  const no: [string, Change, Ledger?][] = [
    ["an expense paid by someone not in the ledger", e({ payer: "zz" })],
    ["an expense of nothing", e({ amount: 0 })],
    ["an expense of half a cent", e({ amount: 0.5 })],
    ["an expense shared with nobody", e({ split: { how: "equal", among: [] } })],
    ["typed amounts that don't add up", e({ split: { how: "exact", amounts: { p0: 60, p1: 30 } } })],
    ["a turn below zero", e({ rot: -1 })],
    ["a turn that isn't whole", e({ rot: 1.5 })],
    ["a time that isn't a number", e({ at: Number.NaN })],
    ["an id already in the ledger", e({ id: "e1" })],
    ["an expense with a transfer's id", e({ id: "t1" })],
    ["a rate that isn't one", e({ paidIn: { currency: "USD", amount: 100, rate: "abc" } })],
    ["a change to an expense that isn't there", { do: "edit", entry: "zz", to: { payer: "p0", amount: 5, note: "", split: { how: "equal", among: ["p0"] } } }],
    ["a change to a transfer", { do: "edit", entry: "t1", to: { payer: "p0", amount: 5, note: "", split: { how: "equal", among: ["p0"] } } }],
    ["a change that isn't sound", { do: "edit", entry: "e1", to: { payer: "p0", amount: -5, note: "", split: { how: "equal", among: ["p0"] } } }],
    ["taking out what isn't there", { do: "out", entry: "zz", at: 1 }],
    ["putting back what isn't out", { do: "back", entry: "e1" }],
    ["paying yourself back", { do: "transfer", transfer: { id: "t2", at: 3, from: "p0", to: "p0", amount: 5 } }],
    ["a transfer with an id already there", { do: "transfer", transfer: { id: "e1", at: 3, from: "p0", to: "p1", amount: 5 } }],
    ["a person with no name", { do: "member", member: { id: "q", name: "  " } }],
    ["a person with someone else's name", { do: "member", member: { id: "q", name: "p1" } }],
    ["a person who is already in", { do: "member", member: { id: "p1", name: "New" } }],
    [`person ${MAX_MEMBERS + 1}`, { do: "member", member: { id: "q", name: "New" } }, full],
    ["renaming to someone else's name", { do: "rename", member: "p0", name: "P1" }],
    ["renaming to the same name", { do: "rename", member: "p0", name: " P0 " }],
    ["renaming someone who isn't there", { do: "rename", member: "zz", name: "Q" }],
    ["taking off someone an entry names", { do: "remove", member: "p0" }],
    ["taking off someone who isn't there", { do: "remove", member: "zz" }],
    ["taking off one of the last two", { do: "remove", member: "p1" }, startLedger("L", "x", "CAD", people.slice(0, 2))],
    ["a ledger with no name", { do: "title", name: "   " }],
    ["the ledger's own name", { do: "title", name: "x" }],
  ];
  const wrong = no.filter(([, c, l = base]) => applyChange(l, c) !== null || accept(l, new Map(), sent(c)).ledger !== l || accept(l, new Map(), sent(c)).took !== "nothing");
  ok(!wrong.length, `${no.length} changes that change nothing leave the very same ledger${wrong.length ? `: not ${wrong.map(([name]) => name).join("; ")}` : ""}`);
  eq(serve(base, [sent({ do: "remove", member: "p2" }), sent({ do: "member", member: { id: "q", name: " Qi  " } }), sent({ do: "rename", member: "q", name: "Qiu" }), sent({ do: "title", name: " 周末 " })]).ledger, { ...base, name: "周末", members: [...base.members.slice(0, 2), { id: "q", name: "Qiu" }] }, "and the ones that are allowed: someone no entry names goes, someone joins, is renamed, the ledger is renamed");
  let big = three;
  for (let i = 0; i < MAX_ENTRIES; i++) big = applyChange(big, e({ id: `x${i}`, amount: 1 + i }))!;
  ok(big.entries.length === MAX_ENTRIES && applyChange(big, e({ id: "over" })) === null && applyChange(big, { do: "transfer", transfer: { id: "over", at: 1, from: "p0", to: "p1", amount: 1 } }) === null, `a ledger holds ${MAX_ENTRIES} entries and no more`);
}

// ---------- 7. what arrives from the network ----------
{
  let round = 0;
  let total = 0;
  for (let seed = 1; seed <= 100; seed++) {
    for (const s of changesOf(randomLedger(seed))) {
      total++;
      if (canon(parseSent(JSON.parse(JSON.stringify(s)))) === canon(JSON.parse(JSON.stringify(s)))) round++;
    }
  }
  ok(round === total, `${total} changes sent as text arrive as the same changes → ${round}`);
  const good = { id: "c", at: 1, change: { do: "expense", expense: { kind: "expense", id: "e", at: 1, payer: "a", amount: 100, note: "x", split: { how: "equal", among: ["a"] }, rot: 0 } } };
  const edited = { payer: "a", amount: 100, note: "x", split: { how: "equal", among: ["a"] } };
  const junk: unknown[] = [
    null, 7, "x", [], {}, { id: "c" }, { ...good, id: "has space" }, { ...good, id: "x".repeat(65) }, { ...good, at: "1" }, { ...good, at: null }, { ...good, change: null }, { ...good, change: { do: "nope" } },
    { ...good, change: { do: "expense" } }, { ...good, change: { do: "expense", expense: { ...good.change.expense, rot: "0" } } }, { ...good, change: { do: "expense", expense: { ...good.change.expense, note: 5 } } },
    { ...good, change: { do: "expense", expense: { ...good.change.expense, note: "x".repeat(401) } } }, { ...good, change: { do: "expense", expense: { ...good.change.expense, split: { how: "equal", among: "a" } } } },
    { ...good, change: { do: "expense", expense: { ...good.change.expense, split: { how: "shares", shares: { a: "1" } } } } }, { ...good, change: { do: "expense", expense: { ...good.change.expense, split: { how: "exact", amounts: { "a b": 1 } } } } },
    { ...good, change: { do: "expense", expense: { ...good.change.expense, paidIn: { currency: "usd", amount: 1, rate: "1" } } } }, { ...good, change: { do: "expense", expense: { ...good.change.expense, split: { how: "equal", among: Array.from({ length: MAX_MEMBERS + 1 }, (_, i) => `p${i}`) } } } },
    { ...good, change: { do: "edit", entry: "e" } }, { ...good, change: { do: "edit", entry: "e", to: { ...edited, paidIn: 5 } } }, { ...good, change: { do: "edit", entry: "e", to: { ...edited, paidIn: "USD" } } }, { ...good, change: { do: "edit", entry: "e", to: { ...edited, paidIn: [] } } },
    { ...good, change: { do: "edit", entry: "e", to: { ...edited, paidIn: { currency: "USD", amount: "5", rate: "1" } } } }, { ...good, change: { do: "edit", entry: "e", to: { ...edited, paidIn: { currency: "US", amount: 5, rate: "1" } } } }, { ...good, change: { do: "edit", entry: "e", to: { ...edited, paidIn: { currency: "USD", amount: 5, rate: 1.4 } } } },
    { ...good, change: { do: "edit", entry: "e", to: { ...edited, paidIn: { currency: "USD", amount: 5, rate: "1".repeat(21) } } } }, { ...good, change: { do: "expense", expense: { ...good.change.expense, paidIn: null } } },
    { ...good, change: { do: "out", entry: "e" } }, { ...good, change: { do: "back" } }, { ...good, change: { do: "transfer", transfer: { id: "t", at: 1, from: "a", to: "b" } } },
    { ...good, change: { do: "member", member: { id: "m" } } }, { ...good, change: { do: "rename", member: "m" } }, { ...good, change: { do: "remove" } }, { ...good, change: { do: "title" } }, { ...good, change: { do: "title", name: 5 } },
  ];
  const read = junk.map((j) => {
    try {
      return parseSent(j);
    } catch {
      return "threw";
    }
  });
  ok(read.every((x) => x === null), `${junk.length} things that aren't changes are read as none, and none of them crashes it`);
  const loaded = parseSent({ ...good, extra: 1, change: { ...good.change, extra: 2, expense: { ...good.change.expense, gone: 5, extra: 3, split: { how: "equal", among: ["a"], extra: 4 }, paidIn: { currency: "USD", amount: 5, rate: "1.4", extra: 5 } } } });
  eq(loaded, { ...good, change: { do: "expense", expense: { ...good.change.expense, paidIn: { currency: "USD", amount: 5, rate: "1.4" } } } }, "only a change's own fields are read: nothing extra rides in, and an expense can't arrive already taken out");
  const asSent = (to: object) => parseSent({ id: "c", at: 1, change: { do: "edit", entry: "e", to } })?.change;
  eq(
    [asSent(edited), asSent({ ...edited, paidIn: null }), asSent({ ...edited, extra: 1, rot: 3, paidIn: { currency: "USD", amount: 5, rate: "1.4", extra: 2 } })],
    [{ do: "edit", entry: "e", to: edited }, { do: "edit", entry: "e", to: { ...edited, paidIn: null } }, { do: "edit", entry: "e", to: { ...edited, paidIn: { currency: "USD", amount: 5, rate: "1.4" } } }],
    "a change to an expense arrives saying nothing about another currency, saying there is none, or saying which: each as it was sent, with nothing extra",
  );
  ok(!("paidIn" in (asSent(edited) as { to: object }).to), "(said nothing is nothing there at all, not a null)");
}

// ---------- 8. anything at all ----------
{
  const names = ["Ann", "Bo", "Cy", "Di", "Ed", "", "  ", "ann", "Fay"];
  let changes = 0;
  let took = 0;
  const broken: string[] = [];
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed * 13);
    const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
    const pick = <X>(xs: X[]): X => xs[int(0, xs.length - 1)];
    let l = empty(randomLedger(seed));
    const seen = new Map<string, boolean>();
    const who = () => (r() < 0.08 ? "ghost" : pick(l.members).id);
    const entry = () => (l.entries.length && r() < 0.9 ? pick(l.entries).id : "nope");
    const amount = () => pick([int(1, 50_000), int(1, 50_000), 0, -5, 1.5, 9_999_999_999, 10_000_000_000]);
    const split = (cost: number): Split => {
      const among = [...new Set(Array.from({ length: int(0, 5) }, who))];
      const how = r();
      if (how < 0.4) return { how: "equal", among };
      if (how < 0.7) return { how: "shares", shares: Object.fromEntries(among.map((id) => [id, pick([1, 2, 3, 0, 1000, 1.5])])) };
      // typed amounts, right most of the time
      const each = among.length ? Math.floor(cost / among.length) : 0;
      return { how: "exact", amounts: Object.fromEntries(among.map((id, i) => [id, i === 0 ? cost - each * (among.length - 1) - (r() < 0.2 ? 1 : 0) : each])) };
    };
    for (let i = 0; i < 60; i++) {
      const roll = r();
      const cost = amount();
      const edit = { payer: who(), amount: cost, note: pick(["", "午饭", "x".repeat(60)]), split: split(cost) };
      const c: Change =
        roll < 0.4 ? { do: "expense", expense: { kind: "expense", id: r() < 0.9 ? `e${i}` : entry(), at: i, ...edit, rot: pick([0, 3, int(0, 500), -1, 2.5]) } }
        : roll < 0.5 ? { do: "edit", entry: entry(), to: edit }
        : roll < 0.58 ? { do: "out", entry: entry(), at: pick([0, i, -1]) }
        : roll < 0.64 ? { do: "back", entry: entry() }
        : roll < 0.76 ? { do: "transfer", transfer: { id: r() < 0.9 ? `t${i}` : entry(), at: i, from: who(), to: who(), amount: cost } }
        : roll < 0.86 ? { do: "member", member: { id: r() < 0.9 ? `n${i}` : who(), name: pick(names) } }
        : roll < 0.92 ? { do: "rename", member: who(), name: pick(names) }
        : roll < 0.97 ? { do: "remove", member: who() }
        : { do: "title", name: pick(["", "周末", "x".repeat(50)]) };
      const before = l;
      const got = accept(l, seen, sent(c, i));
      l = got.ledger;
      changes++;
      if (got.took === "new") took++;
      const lowered = l.members.map((m) => m.name.toLowerCase());
      const sound =
        (got.took === "new") === (l !== before) &&
        sum(Object.values(balances(l))) === 0 &&
        new Set(l.entries.map((x) => x.id)).size === l.entries.length &&
        new Set(l.members.map((m) => m.id)).size === l.members.length &&
        new Set(lowered).size === lowered.length && lowered.every((n) => n.length > 0) &&
        l.members.length >= 2 && l.members.length <= MAX_MEMBERS &&
        expensesOf(l).every((x) => sum(Object.values(portionsOf(x, l))) === x.amount) &&
        l.entries.filter((x) => x.kind === "expense").length === expensesOf(l).length + l.entries.filter((x) => x.kind === "expense" && x.gone !== undefined).length &&
        canon(asLedger(JSON.parse(JSON.stringify(l)))) === canon(l);
      if (!sound && broken.length < 3) broken.push(`seed ${seed}, change ${i}: ${JSON.stringify(c)}`);
    }
  }
  ok(!broken.length && took > changes / 4, `${changes} changes of every kind, sound and not, to 300 ledgers (${took} counted): after each one the ledger adds up to zero, every expense that is in is sound, names and ids are one of a kind, and it can be kept and read back${broken.length ? ` → ${broken.join(" | ")}` : ""}`);
}

// ---------- 9. the phone's own view ----------
{
  let good = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const l = randomLedger(seed);
    const all = changesOf(l);
    const cut = Math.floor(all.length / 2);
    const server = serve(empty(l), all.slice(0, cut)).ledger;
    if (canon(rebase(server, all.slice(cut))) === canon(serve(server, all.slice(cut)).ledger)) good++;
  }
  ok(good === 100, `100 phones with changes still waiting show what the server will hold once they arrive → ${good}`);
  const server = startLedger("L", "x", "CAD", [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "Cy" }]);
  const waiting = [sent({ do: "rename", member: "a", name: "Cy" }), sent({ do: "expense", expense: { kind: "expense", id: "e", at: 1, payer: "a", amount: 300, note: "", split: { how: "equal", among: ["a", "b", "c"] }, rot: 0 } })];
  eq(rebase(server, waiting), { ...server, entries: [(waiting[1].change as Extract<Change, { do: "expense" }>).expense] }, "a waiting change that no longer fits (the name was taken meanwhile) is left out, and the rest still shows");
}

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
