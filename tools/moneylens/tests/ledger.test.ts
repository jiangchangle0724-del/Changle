// A statement's way into the store: the preview, then what the person confirmed (IMP-6). Every value is invented.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BOOK, accounts, bookOf, groupOf, imports, preview, save, txns } from "../src/app/ledger";
import type { ParsedStatement } from "../src/core/model";
import { readStatementFile } from "../src/core/read";
import { MemoryCache, MemoryRemote } from "../src/vault/memory";
import { Store } from "../src/vault/sync";
import { bankV1, bytesOf, cardV2 } from "./samples";
import { idOf, testVault } from "./vaulthelp";

const statementOf = (text: string): ParsedStatement => {
  const read = readStatementFile(bytesOf(text));
  assert.ok(read.ok);
  return read.statements[0]!;
};

async function fresh() {
  const vault = await testVault();
  const remote = new MemoryRemote(vault.id);
  return { vault, remote, store: await Store.open(vault, new MemoryCache()) };
}

const when = new Date("2026-11-25T18:00:00Z");

test("a first statement: previewed, confirmed, saved whole, and the same on another device", async () => {
  const { vault, remote, store } = await fresh();
  const statement = statementOf(bankV1());
  assert.ok(statement.lines.length >= 3);
  const shown = preview(store, statement);
  assert.equal(shown.account, null, "the vault has no account yet: the person makes one");
  assert.deepEqual(shown.candidates, []);
  // this file states the balance it ends on and not the one it starts from: there is nothing to check a first import against
  assert.deepEqual([statement.opening, typeof statement.closing], [undefined, "number"]);
  assert.deepEqual(shown.reconciliation, { status: "unchecked", why: "no-opening", sum: statement.lines.reduce((sum, l) => sum + l.amount, 0) });
  assert.deepEqual(shown.counts, { fresh: statement.lines.length, exact: 0, likely: 0 });
  assert.equal(store.status().records, 0, "a preview changes nothing");
  const saved = save(store, shown, { account: { name: "Everyday", kind: "chequing" } }, when);
  assert.ok(saved.ok);
  assert.deepEqual([saved.added, saved.skipped], [statement.lines.length, 0]);
  const [account] = accounts(store);
  assert.deepEqual(account, { id: saved.account, kind: "chequing", currency: "CAD", name: "Everyday", ...(statement.institution ? { institution: statement.institution } : {}), last4: statement.account.last4 });
  const kept = txns(store, saved.account);
  assert.equal(kept.length, statement.lines.length);
  assert.equal(kept.reduce((sum, t) => sum + t.amount, 0), statement.lines.reduce((sum, l) => sum + l.amount, 0));
  for (const t of kept) {
    assert.equal(t.importId, saved.importId);
    assert.equal(t.parser, "ofx");
    assert.equal("balance" in t, false, "a running balance is the statement's, not the transaction's");
  }
  assert.deepEqual(imports(store), [
    { id: saved.importId, account: saved.account, parser: "ofx", at: "2026-11-25T18:00:00.000Z", lines: statement.lines.length, duplicates: 0, reconciliation: "unchecked", ...(statement.from ? { from: statement.from } : {}), ...(statement.to ? { to: statement.to } : {}), closing: statement.closing },
  ]);
  // one batch: the book and the account's transactions together
  const sent = await store.sync(remote);
  assert.ok(sent.ok);
  assert.equal(sent.sent, 2);
  const other = await Store.open(vault, new MemoryCache());
  assert.ok((await other.sync(remote)).ok);
  assert.equal(txns(other, saved.account).length, statement.lines.length);
  assert.deepEqual(accounts(other), [account]);
});

test("the same statement again: every line is already held, and nothing is saved", async () => {
  const { store } = await fresh();
  const statement = statementOf(bankV1());
  const first = save(store, preview(store, statement), { account: { name: "Everyday", kind: "chequing" } }, when);
  assert.ok(first.ok);
  const again = preview(store, statement);
  assert.equal(again.account?.id, first.account, "found by the last four digits the file names");
  assert.deepEqual(again.counts, { fresh: 0, exact: statement.lines.length, likely: 0 });
  assert.ok(again.rows.every((row) => row.status === "exact" && row.held));
  const before = store.changes;
  assert.deepEqual(save(store, again, { account: first.account }, when), { ok: false, why: "nothing-new" });
  assert.equal(store.changes, before);
  assert.equal(imports(store).length, 1);
});

test("a statement that overlaps the last one: only the new lines are added, and the import says how many it left", async () => {
  const { store } = await fresh();
  const statement = statementOf(bankV1());
  const first = save(store, preview(store, statement), { account: { name: "Everyday", kind: "chequing" } }, when);
  assert.ok(first.ok);
  const more: ParsedStatement = {
    ...statement,
    lines: [...statement.lines, { posted: "2026-12-01", amount: -1250, description: "INVENTED BAKERY #4" }, { posted: "2026-12-02", amount: 50000, description: "INVENTED PAYROLL" }],
    closing: statement.closing! - 1250 + 50000,
  };
  const shown = preview(store, more);
  assert.deepEqual(shown.counts, { fresh: 2, exact: statement.lines.length, likely: 0 });
  // the file still states no opening balance, but it carries on from the last import, whose closing balance is known
  assert.deepEqual(shown.reconciliation, { status: "reconciled", opening: statement.closing, closing: more.closing, sum: -1250 + 50000 });
  // a line missing between the two statements shows: the balances no longer meet
  const gap = preview(store, { ...more, closing: more.closing! - 2000 });
  assert.deepEqual([gap.reconciliation.status, gap.reconciliation.status === "mismatch" && gap.reconciliation.difference], ["mismatch", -2000]);
  // and a file that does not carry on from it (a new line dated before the last import ended) is not checked this way
  const early = preview(store, { ...more, lines: [...more.lines, { posted: "2020-01-01", amount: -1, description: "INVENTED OLD LINE" }] });
  assert.equal(early.reconciliation.status, "unchecked");
  const saved = save(store, shown, { account: first.account }, when);
  assert.ok(saved.ok);
  assert.deepEqual([saved.added, saved.skipped], [2, statement.lines.length]);
  assert.equal(txns(store, first.account).length, statement.lines.length + 2);
  assert.deepEqual(imports(store).map((i) => [i.lines, i.duplicates]).sort(), [[2, statement.lines.length], [statement.lines.length, 0]].sort());
  // a preview made for one account cannot be saved into another, or into a new one
  const card = save(store, preview(store, statementOf(cardV2())), { account: { name: "Card", kind: "credit" } }, when);
  assert.ok(card.ok);
  assert.deepEqual(save(store, shown, { account: card.account }, when), { ok: false, why: "another-account" });
  assert.deepEqual(save(store, shown, { account: { name: "New", kind: "chequing" } }, when), { ok: false, why: "another-account" });
  assert.equal(accounts(store).length, 2);
  assert.equal(txns(store, card.account).every((t) => t.account === card.account), true);
  assert.equal(txns(store).length, statement.lines.length + 2 + statementOf(cardV2()).lines.length);
});

test("a file with something too large in it is saved not at all", async () => {
  const { store } = await fresh();
  const statement = statementOf(bankV1());
  const huge: ParsedStatement = { ...statement, lines: [...statement.lines, { posted: "2026-12-01", amount: -1, description: "X".repeat(5000) }] };
  const shown = preview(store, huge);
  assert.deepEqual(save(store, shown, { account: { name: "Everyday", kind: "chequing" } }, when), { ok: false, why: "too-big" });
  assert.equal(store.status().records, 0);
  assert.equal(store.status().pending, 0);
});

test("the preview says what each new line would be filed under, and why", async () => {
  const { store } = await fresh();
  const statement = statementOf(bankV1());
  const plain = preview(store, statement);
  const target = statement.lines.find((line) => line.amount < 0)!;
  const word = target.description.split(" ")[0]!;
  assert.deepEqual(store.add("rule", BOOK, { id: idOf(1), category: "groceries", text: word }), { ok: true });
  // something in the book that is not a rule at all is passed over
  assert.deepEqual(store.add("rule", BOOK, { id: idOf(2), nonsense: true }), { ok: true });
  assert.equal(bookOf(store).rules.length, 1);
  const ruled = preview(store, statement);
  const row = ruled.rows[statement.lines.indexOf(target)]!;
  assert.deepEqual([row.classified.category, row.classified.source, row.classified.by], ["groceries", "rule", idOf(1)]);
  assert.notDeepEqual(plain.rows[statement.lines.indexOf(target)]!.classified, row.classified);
});

test("records that are not what their kind says are left out, not trusted", async () => {
  const { store } = await fresh();
  store.add("account", BOOK, { id: idOf(1), kind: "chequing", currency: "CAD", name: "Real" });
  store.add("account", BOOK, { id: idOf(2), kind: "brokerage", currency: "CAD", name: "Not a kind this version knows" });
  store.add("account", BOOK, { id: idOf(3), name: 7 });
  store.add("txn", groupOf(idOf(1)), { id: idOf(10), account: idOf(1), posted: "2026-10-03", amount: -500, description: "INVENTED" });
  store.add("txn", groupOf(idOf(1)), { id: idOf(11), account: idOf(1), posted: "03/10/2026", amount: -500, description: "INVENTED" });
  store.add("txn", groupOf(idOf(1)), { id: idOf(12), account: idOf(1), posted: "2026-10-03", amount: 1.5, description: "INVENTED" });
  store.add("import", BOOK, { id: idOf(20), account: "nope", parser: "ofx", at: "x", lines: 1 });
  assert.deepEqual(accounts(store).map((a) => a.id), [idOf(1)]);
  assert.deepEqual(txns(store).map((t) => t.id), [idOf(10)]);
  assert.deepEqual(imports(store), []);
  // a statement in another currency than the account picked is not saved into it
  const statement = { ...statementOf(bankV1()), account: { currency: "USD" } };
  const shown = preview(store, statement, idOf(1));
  assert.deepEqual(save(store, shown, { account: idOf(1) }, when), { ok: false, why: "wrong-account" });
});
