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
import { listing } from "../src/app/devices";
import { eraseLater, eraseNow, erasing, keepVault, pendingOf } from "../src/app/erase";
import type { Ask } from "../src/app/door";
import { ERASE_DELAY, pendingErase } from "../src/server/erase";
import { configOf } from "../src/server/gate";
import { hashOf, newToken } from "../src/server/sessions";
import { packPush, unpackPushed } from "../src/server/wire";
import { sqlite } from "./sqlremote";
import { workerModule } from "./workermod";

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
  assert.deepEqual(said(await maker.ask("vault/erase", T0 + 13, { vault })), [404, "no-vault"]);
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
  // A device signs in ten minutes before it is due, and does not open the vault (that would call the erasing off). A
  // millisecond before, nothing is erased: it is shown the vault, and the erasing.
  const reader = await later(db, T0 + 4 + ERASE_DELAY - 10 * MINUTE);
  const before = await reader.ask("vault", T0 + 3 + ERASE_DELAY);
  assert.deepEqual([before.json!.vault, (before.json!.erasing as { due: number }).due], [vault, T0 + 4 + ERASE_DELAY]);
  assert.equal(left(db).vault, 1);
  // When it is due, the next request of any session, whatever it asks, finds the vault erased, in no session's name.
  assert.deepEqual(said(await reader.ask("sync/pull", T0 + 4 + ERASE_DELAY, { vault, since: 0 })), [423, "locked"]);
  assert.deepEqual(left(db), { chunks: 0, vault: 0, ways: 0, tries: 0, unlocked: 0, opened: 0 });
  assert.deepEqual(lines(db).at(-1), ["vault-erased", null]);
  assert.equal(pendingErase(db), null);
  const after = await reader.ask("vault", T0 + 5 + ERASE_DELAY);
  assert.deepEqual([after.json!.vault, after.json!.erasing, after.wake], [null, null, undefined]);
});

test("called off by a session that has the vault open, or by a right proof, and by no other", async () => {
  const { db, maker, other, vault, ways } = await withVault();
  // of the vault named, like the other two
  for (const body of [undefined, {}, { vault: "no" }]) assert.deepEqual(said(await maker.ask("vault/erase-cancel", T0 + 3, body)), [400, "bad-request"], JSON.stringify(body));
  assert.deepEqual(said(await maker.ask("vault/erase-cancel", T0 + 3, { vault })), [404, "no-erase"]);
  assert.equal((await other.ask("vault/erase-later", T0 + 4, { vault })).status, 200);
  assert.deepEqual(said(await maker.ask("vault/erase-cancel", T0 + 4, { vault: newId() })), [409, "another-vault"]);
  // the session that asked, which has not opened the vault, cannot call it off: whoever holds only the mailbox cannot keep a reset from happening
  assert.deepEqual(said(await other.ask("vault/erase-cancel", T0 + 5, { vault })), [423, "locked"]);
  // nor can a wrong proof
  assert.equal((await other.ask("vault/unlock", T0 + 5, { id: ways[0].wrapper.id, proof: newToken() })).status, 422);
  assert.notEqual(pendingErase(db), null);
  // a session that has opened it and locked it again cannot either, until it opens it again
  assert.equal((await maker.ask("vault/lock", T0 + 6)).status, 200);
  assert.deepEqual(said(await maker.ask("vault/erase-cancel", T0 + 7, { vault })), [423, "locked"]);
  // ...and a right proof calls it off by itself, with its line in that session's name, and says so
  const shown = await maker.ask("vault/unlock", T0 + 8, { id: ways[0].wrapper.id, proof: ways[0].proof });
  assert.deepEqual([shown.status, shown.json!.erasing], [200, "called-off"]);
  assert.deepEqual(lines(db).slice(-2), [["unlocked", maker.session], ["erase-cancelled", maker.session]]);
  assert.equal(pendingErase(db), null);
  // a right proof with nothing asked for says nothing of it
  const plain = await maker.ask("vault/unlock", T0 + 8, { id: ways[1].wrapper.id, proof: ways[1].proof });
  assert.deepEqual([plain.status, "erasing" in plain.json!], [200, false]);
  // asked again; a session that has the vault open calls it off with the button, once
  assert.equal((await other.ask("vault/erase-later", T0 + 9, { vault })).status, 200);
  assert.deepEqual((await maker.ask("vault/erase-cancel", T0 + 9, { vault })).json, { ok: true });
  assert.deepEqual(lines(db).at(-1), ["erase-cancelled", maker.session]);
  const seen = await other.ask("vault", T0 + 10);
  assert.deepEqual([seen.json!.erasing, seen.wake], [null, undefined]);
  assert.deepEqual(said(await maker.ask("vault/erase-cancel", T0 + 11, { vault })), [404, "no-erase"]);
  // the alarm still wakes the object at the old time, and finds nothing to do
  assert.equal(dueErase(db, T0 + 4 + ERASE_DELAY), null);
  assert.equal(left(db).vault, 1);
  // asked for again, by a device that signed in a day later, it is a new erasing, seven days from then
  const tomorrow = await later(db, T0 + DAY);
  const again = await tomorrow.ask("vault/erase-later", T0 + DAY + 1, { vault });
  assert.equal((again.json!.erasing as { due: number }).due, T0 + DAY + 1 + ERASE_DELAY);
  // a session that erases at once takes the erasing asked for with it (one that had the vault open before it was asked)
  const opener = await later(db, T0 + DAY + 1);
  assert.equal((await opener.ask("vault/unlock", T0 + DAY + 1, { id: ways[1].wrapper.id, proof: ways[1].proof })).json!.erasing, "called-off");
  assert.equal((await tomorrow.ask("vault/erase-later", T0 + DAY + 2, { vault })).status, 200);
  assert.notEqual(pendingErase(db), null);
  assert.equal((await opener.ask("vault/erase", T0 + DAY + 3, { vault })).status, 200);
  assert.equal(pendingErase(db), null);
});

test("an erasing waits for seven days in which nobody was kept out: proofs turned away, sign-ins refused, sessions pushed out or signed out by another (the review of this slice, finding 1)", async () => {
  const { db, maker, other, vault, ways } = await withVault();
  const due = (): number => pendingErase(db)!.due;
  const asked = T0 + 3;
  assert.equal((await other.ask("vault/erase-later", asked, { vault })).status, 200);
  assert.equal(due(), asked + ERASE_DELAY);
  // Nine wrong proofs fill nothing. The tenth in the hour fills the count, and every proof is turned away until the
  // first of the ten is an hour old: the erasing waits until seven days after that.
  const wrong = (d: typeof other, at: number) => d.ask("vault/unlock", at, { id: ways[0].wrapper.id, proof: newToken() });
  for (let i = 1; i <= 9; i++) assert.equal((await wrong(other, T0 + MINUTE + i)).status, 422);
  assert.equal(due(), asked + ERASE_DELAY);
  assert.equal((await wrong(other, T0 + MINUTE + 10)).status, 422);
  assert.equal(due(), T0 + MINUTE + 1 + HOUR + ERASE_DELAY);
  // meanwhile the right proof is turned away too, nothing more is counted, and the erasing stays where it is
  assert.equal((await maker.ask("vault/unlock", T0 + MINUTE + 20, { id: ways[0].wrapper.id, proof: ways[0].proof })).status, 429);
  assert.equal(due(), T0 + MINUTE + 1 + HOUR + ERASE_DELAY);
  // the alarm at the old time finds nothing due, and says when to wake
  assert.equal(dueErase(db, asked + ERASE_DELAY), T0 + MINUTE + 1 + HOUR + ERASE_DELAY);
  assert.equal(count(db, "vault"), 1);

  // Three hours on, the sessions of then have ended (thirty minutes without a word). Eight sign-ins push nobody out; a
  // ninth pushes the oldest out, and the erasing waits until seven days after that.
  const t1 = T0 + 3 * HOUR;
  const signedIn = [];
  for (let i = 0; i < 8; i++) signedIn.push(await later(db, t1 + i));
  assert.equal(due(), T0 + MINUTE + 1 + HOUR + ERASE_DELAY);
  await later(db, t1 + 8);
  assert.equal(due(), t1 + 8 + ERASE_DELAY);

  // Two hours on: eleven sign-ins, each signed out again by itself, fill nothing. The twelfth in the hour fills the count,
  // and every sign-in is refused until the first of the twelve is an hour old: the erasing waits until seven days after.
  const t2 = T0 + 5 * HOUR;
  for (let i = 0; i < 11; i++) {
    const d = await later(db, t2 + i);
    assert.equal((await d.ask("session/end", t2 + i)).status, 200);
  }
  assert.equal(due(), t1 + 8 + ERASE_DELAY);
  const twelfth = await later(db, t2 + 11);
  assert.equal(due(), t2 + HOUR + ERASE_DELAY);
  const refused = signIn(db, { account: A, session: newId(), hash: (await hashOf(newToken()))!, label: "Chrome on Windows", owner: false }, t2 + 12, cfg.gate);
  assert.equal(refused, "too-many");
  assert.equal(due(), t2 + HOUR + ERASE_DELAY);

  // Three hours on: a session signing another out, by its id or all of them at once, is someone kept out; signing
  // itself out is not.
  const t3 = T0 + 8 * HOUR;
  const [a, b, c] = [await later(db, t3), await later(db, t3 + 1), await later(db, t3 + 2)];
  assert.equal((await a.ask("sessions/end", t3 + 3, { id: b.session })).status, 200);
  assert.equal(due(), t3 + 3 + ERASE_DELAY);
  assert.equal((await a.ask("sessions/end", t3 + 4, { others: true })).json!.ended, 1);
  assert.equal(due(), t3 + 4 + ERASE_DELAY);
  const own = (await later(db, t3 + 5));
  assert.equal((await own.ask("sessions/end", t3 + 6, { id: own.session })).status, 200);
  assert.equal((await a.ask("session/end", t3 + 7)).status, 200);
  assert.equal((await a.ask("sessions/end", t3 + 8, { others: true })).status, 401);
  assert.equal(due(), t3 + 4 + ERASE_DELAY);
  void [signedIn, twelfth, c];

  // seven days in which nobody was kept out, and it is erased, in no session's name
  assert.equal(dueErase(db, t3 + 4 + ERASE_DELAY - 1), t3 + 4 + ERASE_DELAY);
  assert.equal(dueErase(db, t3 + 4 + ERASE_DELAY), null);
  assert.equal(count(db, "vault"), 0);
  assert.deepEqual(lines(db).at(-1), ["vault-erased", null]);
});

test("asked for while proofs or sign-ins are being turned away, an erasing waits for seven days after they are not; it is never brought on", async () => {
  const { db, other, vault, ways } = await withVault();
  for (let i = 1; i <= 10; i++) assert.equal((await other.ask("vault/unlock", T0 + 2 + i, { id: ways[0].wrapper.id, proof: newToken() })).status, 422);
  // the first of the ten was at T0 + 3: proofs are turned away until it is an hour old
  const asked = await other.ask("vault/erase-later", T0 + 20, { vault });
  assert.equal((asked.json!.erasing as { due: number }).due, T0 + 3 + HOUR + ERASE_DELAY);
  assert.equal(asked.wake, T0 + 3 + HOUR + ERASE_DELAY);
  // a hold that would bring it on does nothing
  assert.equal(pendingErase(db)!.due, T0 + 3 + HOUR + ERASE_DELAY);
  assert.equal((await other.ask("vault/erase-cancel", T0 + 21, { vault })).status, 423);

  // and sign-ins: twelve in the hour, then asked for from one of them
  const fresh = sqlite();
  const first = await device(fresh, T0);
  const vault2 = newId();
  assert.equal((await first.ask("vault/start", T0 + 1, { vault: vault2, ways: [way(vault2, "passphrase"), way(vault2, "recovery")] })).status, 200);
  for (let i = 1; i < 11; i++) assert.equal((await (await device(fresh, T0 + i)).ask("session/end", T0 + i)).status, 200);
  const last = await device(fresh, T0 + 11);
  const asked2 = await last.ask("vault/erase-later", T0 + 12, { vault: vault2 });
  assert.equal((asked2.json!.erasing as { due: number }).due, T0 + HOUR + ERASE_DELAY);
  // nothing asked for: nothing put off, and nothing written
  const empty = sqlite();
  const lone = await device(empty, T0);
  const events = count(empty, "events");
  assert.equal((await lone.ask("sessions/end", T0 + 1, { others: true })).json!.ended, 0);
  assert.equal(count(empty, "events"), events);
});

test("whoever holds only the mailbox, keeping the count full for eight days, keeps the vault from being erased; once they stop, a right proof calls the erasing off", async () => {
  const db = sqlite();
  const owner = await device(db, T0);
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")] as const;
  assert.equal((await owner.ask("vault/start", T0 + 1, { vault, ways })).status, 200);
  assert.equal((await owner.ask("vault/lock", T0 + 2)).status, 200);
  let attacker = await device(db, T0 + 3);
  assert.equal((await attacker.ask("vault/erase-later", T0 + 4, { vault })).status, 200);
  // every five minutes they guess, signing in again when their session has ended; every three hours the owner shows the right code
  const STEP = 5 * MINUTE;
  let ownerIn = false;
  for (let at = T0 + STEP; at < T0 + 8 * DAY; at += STEP) {
    let tried = await attacker.ask("vault/unlock", at, { id: ways[0].wrapper.id, proof: newToken() });
    if (tried.status === 401) {
      attacker = await device(db, at);
      tried = await attacker.ask("vault/unlock", at, { id: ways[0].wrapper.id, proof: newToken() });
    }
    assert.ok(tried.status === 422 || tried.status === 429, String(tried.status));
    if ((at - T0) % (3 * HOUR) === 0) {
      const own = await device(db, at + 1);
      const shown = await own.ask("vault/unlock", at + 1, { id: ways[1].wrapper.id, proof: ways[1].proof });
      if (shown.status === 200) ownerIn = true;
    }
  }
  // the owner never got past the count, and the vault is there after eight days, with the erasing still to come
  assert.equal(ownerIn, false);
  assert.equal(count(db, "vault"), 1);
  assert.ok(pendingErase(db)!.due > T0 + 8 * DAY);
  // they stop; within a day the count frees, and the owner's next right proof calls the erasing off
  let calledOff = false;
  for (let at = T0 + 8 * DAY; !calledOff && at < T0 + 10 * DAY; at += 3 * HOUR) {
    const own = await device(db, at);
    const shown = await own.ask("vault/unlock", at, { id: ways[1].wrapper.id, proof: ways[1].proof });
    if (shown.status === 200) calledOff = shown.json!.erasing === "called-off";
  }
  assert.ok(calledOff);
  assert.equal(pendingErase(db), null);
  assert.equal(count(db, "vault"), 1);
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
  // (a session that is no text: a number would be made text by the column, a blob is not)
  db.raw.prepare(`UPDATE erasing SET due = ?, session = X'00'`).run(T0 + 10);
  assert.throws(() => pendingErase(db), /erasing row/);
  db.raw.prepare(`UPDATE erasing SET session = NULL`).run();
  assert.deepEqual(pendingErase(db), { vault, asked: T0 + 9, due: T0 + 10, session: null });
  db.raw.prepare(`UPDATE erasing SET due = ?`).run(T0 + 8);
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
  assert.equal((await maker.ask("vault/erase-cancel", T0 + 6, { vault })).status, 200);
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

// ---------------------------------------------------------------------------------------------
// As the app asks for it (src/app/erase.ts)
// ---------------------------------------------------------------------------------------------

/** A session's requests the way a browser makes them: JSON there and back. */
const asking = (d: { ask: (action: string, at: number, body?: unknown) => Promise<Answer> }, clock: { now: number }): Ask => async (action, body = {}) => {
  const answer = await d.ask(action, clock.now++, body);
  return { status: answer.status, json: JSON.parse(JSON.stringify(answer.json ?? {})) as Record<string, unknown> };
};
const canned =
  (answers: Record<string, { status: number; json?: Record<string, unknown> } | null>): Ask =>
  async (action) => {
    const answer = answers[action];
    return answer === undefined ? { status: 404, json: { ok: false, why: "no-such-thing" } } : answer && { status: answer.status, json: answer.json ?? {} };
  };

test("the app's side, against the server's own code: asking, seeing, calling off, erasing", async () => {
  const { maker, other, vault } = await withVault();
  const clock = { now: T0 + 3 };
  const [mine, theirs] = [asking(maker, clock), asking(other, clock)];
  assert.deepEqual(await erasing(mine), { ok: true, vault, pending: null });
  // the device that has not opened the vault asks; every device sees it, and which one asked
  const at = clock.now;
  const asked = await eraseLater(theirs, vault);
  assert.ok(asked.ok);
  assert.deepEqual(asked.pending, { asked: at, due: at + ERASE_DELAY, session: other.session, here: true });
  assert.deepEqual(await erasing(mine), { ok: true, vault, pending: { ...asked.pending, here: false } });
  assert.deepEqual(await eraseLater(mine, vault), { ok: true, pending: { ...asked.pending, here: false } });
  assert.deepEqual(await eraseLater(mine, newId()), { ok: false, why: "another" });
  // it cannot call it off; the device that has the vault open can, once, and only of the vault it has open
  assert.equal(await keepVault(theirs, vault), "locked");
  assert.equal(await keepVault(mine, newId()), "another");
  assert.equal(await keepVault(mine, vault), "ok");
  assert.equal(await keepVault(mine, vault), "none");
  assert.deepEqual(await erasing(theirs), { ok: true, vault, pending: null });
  // erasing at once: not from the device that has not opened it, not another vault, and then this one
  assert.equal(await eraseNow(theirs, vault), "locked");
  assert.equal(await eraseNow(mine, newId()), "another");
  assert.equal(await eraseNow(mine, vault), "ok");
  // gone, and said to be gone whoever asks (the review of this slice, finding 3): erasing it again is what was
  // asked; asking for it later or calling it off, there is nothing to ask about
  assert.equal(await eraseNow(mine, vault), "gone");
  assert.equal(await eraseNow(theirs, vault), "gone");
  assert.deepEqual(await eraseLater(theirs, vault), { ok: false, why: "gone" });
  assert.deepEqual(await erasing(theirs), { ok: true, vault: null, pending: null });
  assert.equal(await keepVault(mine, vault), "gone");
  assert.equal(await keepVault(theirs, vault), "gone");
  // the list of devices reads each of the new lines as what it is, and says there is no vault
  const read = await listing(mine);
  assert.ok(read.ok);
  assert.deepEqual(read.lines.slice(0, 3).map((line) => [line.kind, line.here]), [["vault-erased", true], ["erase-cancelled", true], ["erase-asked", false]]);
  assert.deepEqual([read.vault, read.pending], [false, null]);
});

test("the app's side, against answers that are not what they should be: each is trouble, never a date or a vault", async () => {
  const V = newId();
  const pending = { asked: T0, due: T0 + ERASE_DELAY, session: V, here: false };
  const vaultSays = (json: Record<string, unknown>) => canned({ vault: { status: 200, json: { ok: true, ...json } } });
  assert.deepEqual(await erasing(vaultSays({ vault: V, erasing: pending })), { ok: true, vault: V, pending });
  assert.deepEqual(await erasing(vaultSays({ vault: V, erasing: { ...pending, session: null } })), { ok: true, vault: V, pending: { ...pending, session: null } });
  for (const json of [
    { vault: V },
    { vault: "a vault", erasing: null },
    { vault: 7, erasing: null },
    { vault: undefined, erasing: null },
    { vault: null, erasing: pending },
    { vault: V, erasing: {} },
    { vault: V, erasing: "soon" },
    { vault: V, erasing: [] },
    { vault: V, erasing: { ...pending, asked: undefined } },
    { vault: V, erasing: { ...pending, due: "next week" } },
    { vault: V, erasing: { ...pending, due: T0 - 1 } },
    { vault: V, erasing: { ...pending, asked: -1 } },
    { vault: V, erasing: { ...pending, due: 1.5 } },
    { vault: V, erasing: { ...pending, here: "no" } },
    { vault: V, erasing: { ...pending, session: "someone" } },
    { vault: V, erasing: { ...pending, session: 7 } },
    { vault: V, erasing: { ...pending, session: null, here: true } },
  ])
    assert.deepEqual(await erasing(vaultSays(json)), { ok: false, why: "server" }, JSON.stringify(json));
  // (the same date the same day is one: asked for and due at once is still an erasing)
  assert.deepEqual(pendingOf({ ...pending, due: T0 }), { ...pending, due: T0 });
  for (const [answer, why] of [
    [null, "offline"],
    [{ status: 401, json: {} }, "signed-out"],
    [{ status: 403, json: {} }, "signed-out"],
    [{ status: 429, json: {} }, "busy"],
    [{ status: 500, json: {} }, "server"],
    [{ status: 200, json: { ok: false } }, "server"],
  ] as const)
    assert.deepEqual(await erasing(canned({ vault: answer })), { ok: false, why }, JSON.stringify(answer));

  // erasing at once: only what says so is so
  for (const [answer, said] of [
    [{ status: 200, json: { ok: true } }, "ok"],
    [{ status: 200, json: {} }, "server"],
    [{ status: 404, json: { ok: false, why: "no-vault" } }, "gone"],
    [{ status: 404, json: { ok: false, why: "no-such-thing" } }, "server"],
    [{ status: 423, json: { ok: false, why: "locked" } }, "locked"],
    [{ status: 409, json: { ok: false, why: "another-vault" } }, "another"],
    [{ status: 401, json: {} }, "signed-out"],
    [{ status: 429, json: {} }, "busy"],
    [null, "offline"],
  ] as const)
    assert.equal(await eraseNow(canned({ "vault/erase": answer }), V), said, JSON.stringify(answer));
  // asking for it later: the answer is the erasing, or it is not taken
  for (const [answer, said] of [
    [{ status: 200, json: { ok: true, erasing: pending } }, { ok: true, pending }],
    [{ status: 200, json: { ok: true, erasing: null } }, { ok: false, why: "server" }],
    [{ status: 200, json: { ok: true, erasing: { ...pending, due: "soon" } } }, { ok: false, why: "server" }],
    [{ status: 200, json: { ok: true } }, { ok: false, why: "server" }],
    [{ status: 200, json: { ok: false, erasing: pending } }, { ok: false, why: "server" }],
    [{ status: 404, json: { ok: false, why: "no-vault" } }, { ok: false, why: "gone" }],
    [{ status: 404, json: { ok: false, why: "no-such-thing" } }, { ok: false, why: "server" }],
    [{ status: 409, json: {} }, { ok: false, why: "another" }],
    [{ status: 403, json: {} }, { ok: false, why: "signed-out" }],
    [{ status: 429, json: {} }, { ok: false, why: "busy" }],
    [null, { ok: false, why: "offline" }],
  ] as const)
    assert.deepEqual(await eraseLater(canned({ "vault/erase-later": answer }), V), said, JSON.stringify(answer));
  // calling it off
  for (const [answer, said] of [
    [{ status: 200, json: { ok: true } }, "ok"],
    [{ status: 200, json: {} }, "server"],
    [{ status: 404, json: { ok: false, why: "no-erase" } }, "none"],
    [{ status: 404, json: { ok: false, why: "no-vault" } }, "gone"],
    [{ status: 404, json: { ok: false, why: "no-such-thing" } }, "server"],
    [{ status: 409, json: { ok: false, why: "another-vault" } }, "another"],
    [{ status: 423, json: {} }, "locked"],
    [{ status: 401, json: {} }, "signed-out"],
    [{ status: 500, json: {} }, "server"],
    [null, "offline"],
  ] as const)
    assert.equal(await keepVault(canned({ "vault/erase-cancel": answer }), newId()), said, JSON.stringify(answer));
});

test("the events are read by kind, and let go of by time, through indexes made where they are needed on a database made before them", async () => {
  const { db, maker } = await withVault();
  const indexed = (): boolean => (db.raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('events_by_kind', 'events_by_at')`).all() as unknown[]).length === 2;
  assert.ok(indexed());
  // a database as the code before this left it: the events answer, and the next sign-in, make them
  db.raw.exec(`DROP INDEX events_by_kind; DROP INDEX events_by_at`);
  assert.equal((await maker.ask("events", T0 + 3)).status, 200);
  assert.ok(indexed());
  db.raw.exec(`DROP INDEX events_by_kind; DROP INDEX events_by_at`);
  await device(db, T0 + 4);
  assert.ok(indexed());
  // and what each line written does goes through them: no statement reads the whole log (the review of this slice, finding 5b)
  const plan = (sql: string, ...args: (string | number)[]): string => (db.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as { detail: string }[]).map((row) => row.detail).join(" | ");
  assert.match(plan(`SELECT n FROM events WHERE kind = ? ORDER BY n DESC LIMIT 10`, "unlocked"), /events_by_kind/);
  assert.match(plan(`DELETE FROM events WHERE at < ?`, T0), /events_by_at/);
  const capped = plan(`DELETE FROM events WHERE kind = ? AND n <= (SELECT n FROM events WHERE kind = ? ORDER BY n DESC LIMIT 1 OFFSET ?)`, "sign-in", "sign-in", 500);
  assert.match(capped, /events_by_kind/);
  assert.doesNotMatch(capped, /SCAN events(?! USING)/);
  assert.match(plan(`SELECT at FROM events WHERE +kind = 'sign-in' AND at > ? ORDER BY at DESC LIMIT ?`, T0, 12), /USING INDEX events_by_at/);
});

test("the object's alarm is set once for an erasing, not at every read of the vault; put off, it is set again at the next read; and a refused alarm fails nothing (the review of this slice, finding 5a)", async () => {
  type VaultObject = { fetch(request: Request): Promise<Response>; alarm(): Promise<void> };
  const { VaultDO } = (await workerModule()) as { VaultDO: new (ctx: unknown, env: object) => VaultObject };
  const db = sqlite();
  let alarm: number | null = null;
  let refuse = false;
  const set: number[] = [];
  const storage = {
    sql: db.sql,
    transactionSync: <T>(work: () => T): T => db.atomically(work),
    deleteAll: async () => undefined,
    getAlarm: async () => alarm,
    setAlarm: async (at: number) => {
      if (refuse) throw new Error("alarm refused");
      set.push(at);
      alarm = at;
    },
  };
  const object = new VaultDO({ storage }, { ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: A });
  const enter = async (): Promise<string> => {
    const hash = (await hashOf(newToken()))!;
    assert.equal(signIn(db, { account: A, session: newId(), hash, label: "Chrome on Windows", owner: false }, Date.now(), cfg.gate), "ok");
    return hash;
  };
  const send = async (hash: string, action: string, body: unknown = {}): Promise<{ status: number; json: Record<string, unknown> }> => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const answer = await object.fetch(new Request(`https://vault.internal/${action}`, { method: "POST", headers: { "x-ml-account": A, "x-ml-hash": hash, "Content-Length": String(bytes.length) }, body: bytes }));
    return { status: answer.status, json: (await answer.json()) as Record<string, unknown> };
  };
  const [maker, other] = [await enter(), await enter()];
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")] as const;
  assert.equal((await send(maker, "vault/start", { vault, ways })).status, 200);
  assert.deepEqual(set, []);
  // asked for: set once, for when it is due; read again and again, not set again
  assert.equal((await send(other, "vault/erase-later", { vault })).status, 200);
  assert.deepEqual(set, [pendingErase(db)!.due]);
  for (let i = 0; i < 5; i++) assert.equal((await send(other, "vault")).status, 200);
  assert.equal(set.length, 1);
  // put off by wrong proofs that fill the count: the next read of the vault sets it for the new time, once
  const first = pendingErase(db)!.due;
  for (let i = 0; i < 10; i++) assert.equal((await send(other, "vault/unlock", { id: ways[0].wrapper.id, proof: newToken() })).status, 422);
  assert.ok(pendingErase(db)!.due > first);
  assert.equal(set.length, 1);
  for (let i = 0; i < 3; i++) await send(other, "vault");
  assert.deepEqual(set, [first, pendingErase(db)!.due]);
  // woken early (as at the old time: the platform clears an alarm that fires), it sets itself again for when it is due
  alarm = null;
  await object.alarm();
  assert.deepEqual(set.at(-1), pendingErase(db)!.due);
  assert.equal(count(db, "vault"), 1);
  // an alarm that cannot be set is no failure of the request
  alarm = null;
  refuse = true;
  const read = await send(other, "vault");
  assert.deepEqual([read.status, read.json.vault], [200, vault]);
});
