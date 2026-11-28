/**
 * Erasing a vault on the server (src/server/erase.ts, and its actions in account.ts): at once by a session that has
 * the vault open, after seven days by any other, called off by a session that has it open; what goes and what stays;
 * the day's writes; the events that stay in sight; and an erasing that is due, done before anything is answered and
 * by the object's alarm. On Node's SQLite, as tests/ways.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { newId } from "../src/core/ids";
import { act, dueErase, proofsIn, signIn, type Answer } from "../src/server/account";
import { ERASE_DELAY, pendingErase } from "../src/server/erase";
import { configOf } from "../src/server/gate";
import { hashOf, newToken } from "../src/server/sessions";
import { packPush, unpackPushed } from "../src/server/wire";
import { sqlite } from "./sqlremote";

const A = "uaaaaaa1";
const T0 = Date.UTC(2026, 10, 27, 23, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const cfg = configOf({ ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: A, QUOTA_WRITES_PER_DAY: "10" })!;

type Db = ReturnType<typeof sqlite>;
const way = (vault: string, kind: string) => ({ wrapper: { v: 1, id: newId(), vault, kind, salt: "c2FsdA", wrapped: "d3JhcHBlZA" }, params: { v: 1, kind, salt: "cHJvb2Y" }, proof: newToken() });

/** A session of the account, and what it asks, as the object asks `act`: with the proofs hashed first. */
async function device(db: Db, now: number) {
  const hash = (await hashOf(newToken()))!;
  const session = newId();
  assert.equal(signIn(db, { account: A, session, hash, label: "Chrome on Windows", owner: false }, now, cfg.gate), "ok");
  const ask = async (action: string, at: number, body: unknown = {}): Promise<Answer> => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const proofs = await proofsIn(action, bytes);
    assert.ok(proofs, action);
    return act(db, { account: A, hash, action, body: bytes, proofs }, at, cfg);
  };
  return { session, hash, ask };
}
/** A database with a vault made by its first session, which holds it open; a second session that has not opened it. */
async function withVault() {
  const db = sqlite();
  const maker = await device(db, T0);
  const other = await device(db, T0 + 1);
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")] as const;
  assert.equal((await maker.ask("vault/start", T0 + 2, { vault, ways })).status, 200);
  return { db, maker, other, vault, ways };
}
const count = (db: Db, table: string): number => Number((db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).all()[0] as { n: number }).n);
const lines = (db: Db): [string, string | null][] => (db.raw.prepare(`SELECT kind, session FROM events ORDER BY n`).all() as { kind: string; session: string | null }[]).map((row) => [row.kind, row.session]);
/** What a vault leaves in each table of it. */
const left = (db: Db) => ({ chunks: count(db, "chunks"), vault: count(db, "vault"), ways: count(db, "ways"), tries: count(db, "tries"), unlocked: count(db, "unlocked"), opened: count(db, "opened") });
const said = (answer: Answer): [number, unknown] => [answer.status, answer.json?.why];
/** Writes `n` chunks of the vault, as a device that has it open does. */
function write(db: Db, d: { hash: string }, vault: string, at: number, n: number): Answer {
  const writes = Array.from({ length: n }, () => ({ id: newId(), base: 0, blob: crypto.getRandomValues(new Uint8Array(64)) }));
  return act(db, { account: A, hash: d.hash, action: "sync/push", body: packPush(vault, writes), proofs: [] }, at, cfg);
}
/** Sessions end after thirty quiet minutes (sessions.ts): what is asked days later is asked by a device that signs in then. */
const later = (db: Db, at: number) => device(db, at);

test("erased at once by a session that has the vault open: the vault and all that went with it go, and nothing else", async () => {
  const { db, maker, other, vault, ways } = await withVault();
  assert.equal((await write(db, maker, vault, T0 + 3, 3)).status, 200);
  // a wrong try, and the other device opening the vault and locking again
  assert.equal((await other.ask("vault/unlock", T0 + 4, { id: ways[0].wrapper.id, proof: newToken() })).status, 422);
  assert.equal((await other.ask("vault/unlock", T0 + 5, { id: ways[1].wrapper.id, proof: ways[1].proof })).status, 200);
  assert.equal((await other.ask("vault/lock", T0 + 6)).status, 200);
  assert.deepEqual(left(db), { chunks: 3, vault: 1, ways: 2, tries: 1, unlocked: 1, opened: 2 });

  // what is not an erasing of this vault by a session that has it open does nothing
  assert.deepEqual(said(await other.ask("vault/erase", T0 + 7, { vault })), [423, "locked"]);
  for (const body of [{}, { vault: "no" }, { vault: 7 }, { vault: null }, []]) assert.deepEqual(said(await maker.ask("vault/erase", T0 + 8, body)), [400, "bad-request"], JSON.stringify(body));
  assert.deepEqual(said(await maker.ask("vault/erase", T0 + 9, { vault: newId() })), [409, "another-vault"]);
  assert.deepEqual(left(db), { chunks: 3, vault: 1, ways: 2, tries: 1, unlocked: 1, opened: 2 });

  const before = { sessions: count(db, "sessions"), events: count(db, "events"), account: count(db, "account") };
  assert.deepEqual((await maker.ask("vault/erase", T0 + 10, { vault })).json, { ok: true });
  assert.deepEqual(left(db), { chunks: 0, vault: 0, ways: 0, tries: 0, unlocked: 0, opened: 0 });
  // the sessions, the account and the events stay, with one line more: the vault erased, by that session
  assert.deepEqual({ sessions: count(db, "sessions"), events: count(db, "events"), account: count(db, "account") }, { ...before, events: before.events + 1 });
  assert.deepEqual(lines(db).at(-1), ["vault-erased", maker.session]);
  // there is no vault: none is shown, nobody holds one open, sync is for nobody, and erasing it again is erasing nothing
  for (const d of [maker, other]) {
    const seen = (await d.ask("vault", T0 + 11)).json!;
    assert.deepEqual([seen.vault, seen.unlocked, seen.ways, seen.erasing], [null, false, [], null]);
    assert.deepEqual(said(await d.ask("sync/pull", T0 + 12, { vault, since: 0 })), [423, "locked"]);
  }
  assert.deepEqual(said(await maker.ask("vault/erase", T0 + 13, { vault })), [423, "locked"]);
  // and a new vault can be made, by any device, with ways in of its own
  const again = newId();
  assert.equal((await other.ask("vault/start", T0 + 14, { vault: again, ways: [way(again, "passphrase"), way(again, "recovery")] })).status, 200);
  assert.deepEqual([(await maker.ask("vault", T0 + 15)).json!.vault, left(db).ways], [again, 2]);
});

test("a vault made the same day goes on from the day's writes of the one erased: erasing is no way to more writes in a day (LIM-1)", async () => {
  const { db, maker, vault } = await withVault();
  const pushed = (answer: Answer) => {
    const read = answer.status === 200 ? unpackPushed(answer.bytes!) : null;
    return read ? (read.ok ? "ok" : read.why) : answer.status;
  };
  assert.equal(pushed(write(db, maker, vault, T0 + 3, 8)), "ok");
  assert.equal((await maker.ask("vault/erase", T0 + 4, { vault })).status, 200);
  assert.equal(count(db, "spent"), 1);
  const again = newId();
  const againWays = [way(again, "passphrase"), way(again, "recovery")] as const;
  assert.equal((await maker.ask("vault/start", T0 + 5, { vault: again, ways: againWays })).status, 200);
  assert.equal(count(db, "spent"), 0);
  // ten a day: eight were written today, so three more are too many and two are not
  assert.equal(pushed(write(db, maker, again, T0 + 6, 3)), "quota-writes");
  assert.equal(pushed(write(db, maker, again, T0 + 7, 2)), "ok");
  assert.equal(pushed(write(db, maker, again, T0 + 8, 1)), "quota-writes");
  // a day later the count starts again
  const tomorrow = await later(db, T0 + DAY + HOUR);
  assert.equal((await tomorrow.ask("vault/unlock", T0 + DAY + HOUR + 1, { id: againWays[0].wrapper.id, proof: againWays[0].proof })).status, 200);
  assert.equal(pushed(write(db, tomorrow, again, T0 + DAY + HOUR + 2, 10)), "ok");
  // a vault that wrote nothing hands nothing on, and a new vault without one before it starts at nothing
  const fresh = await withVault();
  assert.equal((await fresh.maker.ask("vault/erase", T0 + 3, { vault: fresh.vault })).status, 200);
  assert.equal(count(fresh.db, "spent"), 0);
});

test("asked for by any session, erased seven days later: shown to every session meanwhile, asking again changes nothing", async () => {
  const { db, maker, other, vault, ways } = await withVault();
  for (const body of [{}, { vault: "no" }]) assert.deepEqual(said(await other.ask("vault/erase-later", T0 + 3, body)), [400, "bad-request"]);
  assert.deepEqual(said(await other.ask("vault/erase-later", T0 + 3, { vault: newId() })), [409, "another-vault"]);
  // the session that has not opened the vault asks; the answer says when, and the object's alarm is to wake then
  const asked = await other.ask("vault/erase-later", T0 + 4, { vault });
  assert.deepEqual(asked.json, { ok: true, erasing: { asked: T0 + 4, due: T0 + 4 + ERASE_DELAY, session: other.session, here: true } });
  assert.equal(asked.wake, T0 + 4 + ERASE_DELAY);
  assert.equal(ERASE_DELAY, 7 * DAY);
  assert.deepEqual(lines(db).at(-1), ["erase-asked", other.session]);
  // every session is shown it when it asks after the vault, with the alarm set again each time
  const seen = await maker.ask("vault", T0 + 5);
  assert.deepEqual(seen.json!.erasing, { asked: T0 + 4, due: T0 + 4 + ERASE_DELAY, session: other.session, here: false });
  assert.equal(seen.wake, T0 + 4 + ERASE_DELAY);
  // asked again, by either, and a day later by a device that signed in since: the same erasing, the same day, and nothing written
  const events = count(db, "events");
  for (const d of [other, maker]) {
    const again = await d.ask("vault/erase-later", T0 + 10 * MINUTE, { vault });
    assert.deepEqual([again.json!.erasing, again.wake], [{ asked: T0 + 4, due: T0 + 4 + ERASE_DELAY, session: other.session, here: d === other }, T0 + 4 + ERASE_DELAY]);
  }
  const tomorrow = await later(db, T0 + DAY);
  const asked2 = await tomorrow.ask("vault/erase-later", T0 + DAY + 1, { vault });
  assert.deepEqual(asked2.json!.erasing, { asked: T0 + 4, due: T0 + 4 + ERASE_DELAY, session: other.session, here: false });
  assert.equal(count(db, "events"), events + 1);
  assert.deepEqual(lines(db).at(-1), ["sign-in", tomorrow.session]);
  // A device opens the vault ten minutes before it is due. A millisecond before, nothing is erased: it can still read.
  const reader = await later(db, T0 + 4 + ERASE_DELAY - 10 * MINUTE);
  assert.equal((await reader.ask("vault/unlock", T0 + 4 + ERASE_DELAY - 10 * MINUTE + 1, { id: ways[0].wrapper.id, proof: ways[0].proof })).status, 200);
  assert.equal((await reader.ask("sync/pull", T0 + 3 + ERASE_DELAY, { vault, since: 0 })).status, 200);
  assert.equal(left(db).vault, 1);
  // When it is due, the next request of any session, whatever it asks, finds the vault erased, in no session's name: the
  // one that reads is answered that it holds nothing open, and is shown no vault.
  assert.deepEqual(said(await reader.ask("sync/pull", T0 + 4 + ERASE_DELAY, { vault, since: 0 })), [423, "locked"]);
  assert.deepEqual(left(db), { chunks: 0, vault: 0, ways: 0, tries: 0, unlocked: 0, opened: 0 });
  assert.deepEqual(lines(db).at(-1), ["vault-erased", null]);
  assert.equal(pendingErase(db), null);
  const after = await reader.ask("vault", T0 + 5 + ERASE_DELAY);
  assert.deepEqual([after.json!.vault, after.json!.erasing, after.wake], [null, null, undefined]);
});

test("called off by a session that has the vault open, and by no other", async () => {
  const { db, maker, other, vault, ways } = await withVault();
  assert.deepEqual(said(await maker.ask("vault/erase-cancel", T0 + 3)), [404, "no-erase"]);
  assert.equal((await other.ask("vault/erase-later", T0 + 4, { vault })).status, 200);
  // the session that asked, which has not opened the vault, cannot call it off: whoever holds only the mailbox cannot keep a reset from happening
  assert.deepEqual(said(await other.ask("vault/erase-cancel", T0 + 5)), [423, "locked"]);
  // a session that has opened it and locked it again cannot either, until it opens it again
  assert.equal((await maker.ask("vault/lock", T0 + 6)).status, 200);
  assert.deepEqual(said(await maker.ask("vault/erase-cancel", T0 + 7)), [423, "locked"]);
  assert.equal((await maker.ask("vault/unlock", T0 + 8, { id: ways[0].wrapper.id, proof: ways[0].proof })).status, 200);
  assert.deepEqual((await maker.ask("vault/erase-cancel", T0 + 9)).json, { ok: true });
  assert.deepEqual(lines(db).at(-1), ["erase-cancelled", maker.session]);
  const seen = await other.ask("vault", T0 + 10);
  assert.deepEqual([seen.json!.erasing, seen.wake], [null, undefined]);
  assert.deepEqual(said(await maker.ask("vault/erase-cancel", T0 + 11)), [404, "no-erase"]);
  // the alarm still wakes the object at the old time, and finds nothing to do
  assert.equal(dueErase(db, T0 + 4 + ERASE_DELAY), null);
  assert.equal(left(db).vault, 1);
  // asked for again, by a device that signed in a day later, it is a new erasing, seven days from then
  const tomorrow = await later(db, T0 + DAY);
  const again = await tomorrow.ask("vault/erase-later", T0 + DAY + 1, { vault });
  assert.equal((again.json!.erasing as { due: number }).due, T0 + DAY + 1 + ERASE_DELAY);
  // a session that erases at once takes the erasing asked for with it
  assert.equal((await tomorrow.ask("vault/unlock", T0 + DAY + 2, { id: ways[1].wrapper.id, proof: ways[1].proof })).status, 200);
  assert.equal((await tomorrow.ask("vault/erase", T0 + DAY + 3, { vault })).status, 200);
  assert.equal(pendingErase(db), null);
});

test("the alarm: erases what is due without a session, says when to wake again, and does nothing where nothing is", async () => {
  // a database nobody signed in to has nothing to do and makes no tables
  const blank = sqlite();
  assert.equal(dueErase(blank, T0), null);
  assert.equal(count(blank, "sqlite_master"), 0);
  const { db, other, vault } = await withVault();
  assert.equal(dueErase(db, T0 + 3), null);
  assert.equal((await other.ask("vault/erase-later", T0 + 4, { vault })).status, 200);
  // woken early, it says when to wake; at the time, it erases; and after that there is nothing to wake for
  assert.equal(dueErase(db, T0 + 5), T0 + 4 + ERASE_DELAY);
  assert.equal(left(db).vault, 1);
  assert.equal(dueErase(db, T0 + 4 + ERASE_DELAY), null);
  assert.deepEqual([left(db).vault, lines(db).at(-1)], [0, ["vault-erased", null]]);
  assert.equal(dueErase(db, T0 + 5 + ERASE_DELAY), null);
  assert.equal(lines(db).filter(([kind]) => kind === "vault-erased").length, 1);
  // not a time: nothing
  assert.equal(dueErase(db, Number.NaN), null);
});

test("an erasing asked for a vault this database no longer holds is let go of, and erases nothing", async () => {
  const { db, other, vault } = await withVault();
  assert.equal((await other.ask("vault/erase-later", T0 + 3, { vault })).status, 200);
  // (nothing the server does gets here; a database restored or changed by hand can)
  db.raw.prepare(`UPDATE erasing SET vault = ?`).run(newId());
  const due = await later(db, T0 + 3 + ERASE_DELAY);
  assert.equal((await due.ask("sessions", T0 + 3 + ERASE_DELAY + 1)).status, 200);
  assert.deepEqual([pendingErase(db), left(db).vault, lines(db).at(-1)], [null, 1, ["sign-in", due.session]]);
  // a row that is not one is an error, and nothing is done on it: every request is answered that it cannot be served
  // (the object turns the error into "unavailable", worker.ts), as for any part of a database that cannot be read
  db.raw.prepare(`INSERT INTO erasing (one, vault, asked, due, session) VALUES (1, ?, ?, ?, NULL)`).run(vault, T0 + 9, T0 + 8);
  assert.throws(() => pendingErase(db), /erasing row/);
  await assert.rejects(due.ask("sessions", T0 + 3 + ERASE_DELAY + 2), /erasing row/);
  assert.equal(left(db).vault, 1);
  // A vault whose own row cannot be read: what reads the vault fails as before, and nothing else does. The check for an
  // erasing that is due reads the vault only when one is due.
  db.raw.prepare(`DELETE FROM erasing`).run();
  db.raw.prepare(`UPDATE vault SET seq = -5`).run();
  await assert.rejects(due.ask("vault", T0 + 3 + ERASE_DELAY + 3), /vault row/);
  for (const action of ["sessions", "events"]) assert.equal((await due.ask(action, T0 + 3 + ERASE_DELAY + 4)).status, 200, action);
  assert.equal((await due.ask("session/end", T0 + 3 + ERASE_DELAY + 5)).status, 200);
});

test("what the owner is shown stays in sight: an erasing asked for, called off, done, and the vault opened by another session, whatever came after", async () => {
  const { db, maker, other, vault, ways } = await withVault();
  // another session opens the vault, asks for it to be erased, the owner calls that off; then it is erased by the owner
  assert.equal((await other.ask("vault/unlock", T0 + 3, { id: ways[0].wrapper.id, proof: ways[0].proof })).status, 200);
  assert.equal((await other.ask("vault/lock", T0 + 4)).status, 200);
  assert.equal((await other.ask("vault/erase-later", T0 + 5, { vault })).status, 200);
  assert.equal((await maker.ask("vault/erase-cancel", T0 + 6)).status, 200);
  assert.equal((await maker.ask("vault/erase", T0 + 7, { vault })).status, 200);
  assert.equal((await other.ask("session/end", T0 + 8)).status, 200);
  // a new vault, which the maker opens again itself after locking it
  const again = newId();
  const againWays = [way(again, "passphrase"), way(again, "recovery")] as const;
  assert.equal((await maker.ask("vault/start", T0 + 9, { vault: again, ways: againWays })).status, 200);
  assert.equal((await maker.ask("vault/lock", T0 + 10)).status, 200);
  assert.equal((await maker.ask("vault/unlock", T0 + 11, { id: againWays[0].wrapper.id, proof: againWays[0].proof })).status, 200);
  // an afternoon of signing in and out from yet another device; the maker stays, asking now and then
  let now = T0 + 12;
  for (let i = 0; i < 60; i++) {
    now += 6 * MINUTE;
    const comer = await device(db, now);
    assert.equal((await comer.ask("session/end", now + 1)).status, 200);
    assert.equal((await maker.ask("sessions", now + 2)).status, 200);
  }
  const shown = (await maker.ask("events", now + 2)).json!.events as { kind: string; session: string | null; here: boolean }[];
  const beyond = shown.slice(50).map((line) => [line.kind, line.session === maker.session ? "maker" : line.session === other.session ? "other" : line.session]);
  // beyond the newest fifty, newest first: the new vault made, the erasing, called off, asked for, the vault opened by
  // the other device, and the first vault made. Not the maker's own opening of the new one.
  assert.deepEqual(beyond, [
    ["vault-started", "maker"],
    ["vault-erased", "maker"],
    ["erase-cancelled", "maker"],
    ["erase-asked", "other"],
    ["unlocked", "other"],
    ["vault-started", "maker"],
  ]);
  // the owner's own openings are not kept in sight for the owner: they are its own
  assert.equal(shown.some((line) => line.kind === "unlocked" && line.here), false);
  // seen from a device that signs in now, both sessions' openings are another's, and both are kept in sight
  const fromHere = await device(db, now + 3);
  const theirs = (await fromHere.ask("events", now + 4)).json!.events as { kind: string; session: string | null }[];
  assert.deepEqual(theirs.filter((line) => line.kind === "unlocked").map((line) => line.session), [maker.session, other.session]);
});
