/**
 * The app's records as the store keeps them, and the one way a statement gets in (IMP-6).
 *
 * The store (vault/sync.ts) knows records only as an id, a kind and fields. This is where they
 * become accounts, transactions and imports again, and where what comes back is checked: a
 * record may have been written by another version of the app, or merged from two devices, so
 * one that is not what its kind says is left out instead of being trusted.
 *
 * A statement is saved in two steps, because the person has to see it first:
 *
 * - `preview` changes nothing. It says which account the statement belongs to, whether its lines
 *   add up to its balances (ACC-2), which lines the account already holds (ACC-3), and what each
 *   new line would be filed under and why (CLS-1, CLS-2).
 * - `save` writes what the person confirmed: the account if it is new, the lines that are new,
 *   and a record of the import. All of it or none of it, and since they go to the server as one
 *   batch (sync.ts), all of it or none of it there too.
 *
 * Nothing here reads a file or touches the network. The lines come from core/read.ts, already
 * cut down to what may be kept (card numbers to four digits, no name, no address).
 */
import { CATEGORIES, classify, type Alias, type Book, type Category, type Classified, type Rule } from "../core/classify";
import { findDuplicates } from "../core/dedupe";
import { isId, newId } from "../core/ids";
import type { Account, AccountKind, CsvLayout, ImportRecord, ParsedLine, ParsedStatement, Txn } from "../core/model";
import { reconcile, type Reconciliation } from "../core/reconcile";
import { entryOf, type Json, type Value } from "../vault/records";
import type { Store } from "../vault/sync";

/** The group of everything that is not a transaction: accounts, imports, rules, aliases, categories. */
export const BOOK = "book";
/** The group of one account's transactions. */
export const groupOf = (account: string): string => `t/${account}`;

const isText = (x: unknown): x is string => typeof x === "string";
const isDay = (x: unknown): boolean => isText(x) && /^\d{4}-\d{2}-\d{2}$/.test(x);
const isKind = (x: unknown): x is AccountKind => x === "chequing" || x === "savings" || x === "credit";
const isAccount = (v: Value): boolean => isKind(v.kind) && isText(v.currency) && isText(v.name);
const isTxn = (v: Value): boolean => isId(v.account) && isDay(v.posted) && Number.isSafeInteger(v.amount) && isText(v.description);
const isImport = (v: Value): boolean => isId(v.account) && isText(v.parser) && isText(v.at) && Number.isSafeInteger(v.lines);
const isRule = (v: Value): boolean => isText(v.category);
const isAlias = (v: Value): boolean => isText(v.phrase) && isText(v.name);
const isCategory = (v: Value): boolean => (v.kind === "expense" || v.kind === "income" || v.kind === "transfer") && isText(v.zh) && isText(v.en);

const read = <T>(store: Store, kind: string, fits: (v: Value) => boolean): T[] => store.list(kind).filter(fits) as unknown as T[];

export const accounts = (store: Store): Account[] => read<Account>(store, "account", isAccount);
export const imports = (store: Store): ImportRecord[] => read<ImportRecord>(store, "import", isImport);
/** Transactions, of one account or of all. In no particular order. */
export const txns = (store: Store, account?: string): Txn[] => read<Txn>(store, "txn", isTxn).filter((t) => account === undefined || t.account === account);

/** What classification goes by: the built-in categories and the person's own, their rules and their aliases. */
export function bookOf(store: Store): Book {
  return {
    categories: [...CATEGORIES, ...read<Category>(store, "category", isCategory)],
    rules: read<Rule>(store, "rule", isRule),
    aliases: read<Alias>(store, "alias", isAlias),
  };
}

export type Row = {
  line: ParsedLine;
  /** `exact`: the account holds this line already. `likely`: it probably does; the person says. */
  status: "fresh" | "exact" | "likely";
  /** For a line already held: that transaction. */
  held?: string;
  /** What a new line would be filed under, and what decided it. */
  classified: Classified;
};

export type Preview = {
  statement: ParsedStatement;
  /** The account the statement belongs to, when the vault has exactly one it can be. Null: the person picks, or makes one. */
  account: Account | null;
  /** The accounts it could go into: the same currency, and the same kind when the file says the kind. */
  candidates: Account[];
  reconciliation: Reconciliation;
  rows: Row[];
  counts: { fresh: number; exact: number; likely: number };
};

/**
 * What saving this statement would do. `into` is the account the person picked; without it the
 * account is the one whose last four digits the file names, if the vault has exactly one such.
 */
export function preview(store: Store, statement: ParsedStatement, into?: string): Preview {
  const all = accounts(store);
  const candidates = all.filter((a) => !a.closed && a.currency === statement.account.currency && (!statement.account.kind || a.kind === statement.account.kind));
  const named = statement.account.last4 ? candidates.filter((a) => a.last4 === statement.account.last4) : [];
  const account = into !== undefined ? (all.find((a) => a.id === into) ?? null) : named.length === 1 ? named[0]! : null;
  const held = account ? txns(store, account.id) : [];
  const found = findDuplicates(
    held.map((t) => ({ id: t.id, posted: t.posted, amount: t.amount, description: t.description, ...(t.ref ? { ref: t.ref } : {}) })),
    statement.lines,
  );
  const status = new Map<number, { status: "exact" | "likely"; held: string }>();
  for (const d of found.exact) status.set(d.index, { status: "exact", held: d.held });
  for (const d of found.likely) status.set(d.index, { status: "likely", held: d.held });
  const book = bookOf(store);
  const rows = statement.lines.map((line, index): Row => {
    const classified = classify({ account: account?.id ?? "", amount: line.amount, description: line.description, ...(line.memo ? { memo: line.memo } : {}) }, book);
    return { line, status: "fresh", classified, ...status.get(index) };
  });
  // The balances to check the lines against (ACC-2) are the file's own. Many files state only the balance at the end.
  // Then, if this file carries on from the account's last import (every line up to that import's last day is one the
  // account holds, every line after it is new), the balance that import ended on is where this one starts: the new
  // lines must take the account from there to the balance this file states. A line missing in between shows as a mismatch.
  let reconciliation = reconcile(statement.lines, statement.opening, statement.closing);
  if (reconciliation.status === "unchecked" && statement.opening === undefined && statement.closing !== undefined && account) {
    const last = imports(store)
      .filter((i) => i.account === account.id && i.closing !== undefined && i.to !== undefined)
      .sort((a, b) => (a.to! < b.to! ? 1 : -1))[0];
    const added = rows.filter((row) => row.status === "fresh");
    const carriesOn = last && added.length > 0 && rows.every((row) => (row.status === "fresh" ? row.line.posted >= last.to! : row.status === "exact" && row.line.posted <= last.to!));
    if (last && carriesOn) reconciliation = reconcile(added.map((row) => row.line), last.closing, statement.closing);
  }
  return {
    statement,
    account,
    candidates,
    reconciliation,
    rows,
    counts: { fresh: found.fresh.length, exact: found.exact.length, likely: found.likely.length },
  };
}

export type Choice = {
  /** The account to save into: one the preview was made for, or a new one to make. */
  account: string | { name: string; kind: AccountKind };
  /** Lines the check was unsure about (`likely`) that the person says are new, by their place in `rows`. */
  alsoNew?: readonly number[];
  /** The layout a CSV file was read with, to keep with the account for the next file (anycsv.ts). */
  layout?: CsvLayout;
};

export type Saved =
  | { ok: true; account: string; importId: string; added: number; skipped: number }
  /**
   * `another-account`: the preview was made for another account than the one chosen; make it again.
   * `nothing-new`: the account holds every line of the file already. `too-big`: something in the
   * file is larger than a record may be. Nothing was saved.
   */
  | { ok: false; why: "another-account" | "wrong-account" | "nothing-new" | "too-big" };

const without = <T extends object>(x: T): Value => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as Value;

/** Saves what the person confirmed in a preview. Call `flush`, then `sync`, afterwards. */
export function save(store: Store, shown: Preview, choice: Choice, now: Date = new Date()): Saved {
  const { statement } = shown;
  let account: Account;
  const records: { kind: string; group: string; value: Value }[] = [];
  if (typeof choice.account === "string") {
    if (shown.account?.id !== choice.account) return { ok: false, why: "another-account" };
    const held = accounts(store).find((a) => a.id === choice.account);
    if (!held || held.currency !== statement.account.currency) return { ok: false, why: "wrong-account" };
    account = held;
  } else {
    // a new account has nothing in it: a preview made for an existing one would have marked lines as held
    if (shown.account) return { ok: false, why: "another-account" };
    account = { id: newId(), kind: choice.account.kind, currency: statement.account.currency, name: choice.account.name, ...(statement.institution ? { institution: statement.institution } : {}), ...(statement.account.last4 ? { last4: statement.account.last4 } : {}) };
    records.push({ kind: "account", group: BOOK, value: without({ ...account, layout: choice.layout as Json | undefined }) });
  }
  const also = new Set(choice.alsoNew ?? []);
  const taken = shown.rows.filter((row, index) => row.status === "fresh" || (row.status === "likely" && also.has(index)));
  if (!taken.length) return { ok: false, why: "nothing-new" };
  const importId = newId();
  for (const { line } of taken) {
    const { balance: _balance, ...kept } = line;
    records.push({ kind: "txn", group: groupOf(account.id), value: without({ id: newId(), account: account.id, ...kept, importId, parser: statement.parser } satisfies Txn) });
  }
  const record: ImportRecord = {
    id: importId,
    account: account.id,
    parser: statement.parser,
    at: now.toISOString(),
    lines: taken.length,
    duplicates: shown.rows.length - taken.length,
    reconciliation: shown.reconciliation.status,
    ...(statement.from ? { from: statement.from } : {}),
    ...(statement.to ? { to: statement.to } : {}),
    ...(statement.opening !== undefined ? { opening: statement.opening } : {}),
    ...(statement.closing !== undefined ? { closing: statement.closing } : {}),
  };
  records.push({ kind: "import", group: BOOK, value: without(record) });
  // Everything is looked at before anything is added, so that a file is saved whole or not at all.
  if (records.some((r) => !entryOf(r.kind, 0, r.value))) return { ok: false, why: "too-big" };
  const added: string[] = [];
  for (const r of records) {
    if (!store.add(r.kind, r.group, r.value).ok) {
      for (const id of added) store.remove(id);
      return { ok: false, why: "too-big" };
    }
    added.push(r.value.id);
  }
  if (typeof choice.account === "string" && choice.layout) store.change(account.id, { layout: choice.layout as Json });
  return { ok: true, account: account.id, importId, added: taken.length, skipped: shown.rows.length - taken.length };
}
