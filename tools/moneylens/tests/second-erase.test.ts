/**
 * C12 review (erasing a vault, and the events log kept by kind): the reviewer's own tests, not the author's. First look
 * at 9bffa8cc, second look at 4f2c54fb. The reviewer is the same model as the author (docs/moneylens/reviews/erase.md
 * says what that limits), so these try the code rather than read it: every way a session without the vault open might
 * erase it early, table by table what erasing takes and leaves, the day's writes across cycles, lines of every other
 * kind against the lines a person must not miss, the object's alarm (worker.ts) on Node, what the app is told by a
 * server whose vault went from elsewhere, and, at the second look, whether anything someone with only the mailbox can
 * do in MoneyLens brings an erasing about that the holder of a way in could not have stopped (a model of "kept out"
 * written apart from the server's, against random runs of what such a person may do).
 *
 * Tests marked `todo` show a finding of the review and fail while it stands. The others pin what the review checked
 * and found right. Every id, label, passphrase and proof here is invented.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { listing, openedOf } from "../src/app/devices";
import { draft, keep, open, standing, type Ask } from "../src/app/door";
import { eraseNow, erasing, keepVault } from "../src/app/erase";
import { newId } from "../src/core/ids";
import { act, dueErase, proofsIn, signIn, type Answer } from "../src/server/account";
import type { Db } from "../src/server/chunks";
import { ERASE_DELAY, pendingErase } from "../src/server/erase";
import { configOf } from "../src/server/gate";
import { crowded, hashOf, newToken } from "../src/server/sessions";
import { packPush, unpackPushed } from "../src/server/wire";
import { sqlite } from "./sqlremote";
import { workerModule } from "./workermod";

const A = "uinventedera1";
const T0 = Date.UTC(2026, 10, 28, 10, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const cfg = configOf({ ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: A, QUOTA_WRITES_PER_DAY: "10" })!;
const PASSPHRASE = "twelve slow badgers sort the lanterns";

type Store = ReturnType<typeof sqlite>;
const way = (vault: string, kind: string) => ({ wrapper: { v: 1, id: newId(), vault, kind, salt: "c2FsdA", wrapped: "d3JhcHBlZA" }, params: { v: 1, kind, salt: "cHJvb2Y" }, proof: newToken() });

/** How a session asks, as the object asks `act` (the proofs hashed first). */
const askerFor =
  (db: Store, hash: string) =>
  async (action: string, when: number, body: unknown = {}): Promise<Answer> => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const proofs = await proofsIn(action, bytes);
    return proofs ? act(db, { account: A, hash, action, body: bytes, proofs }, when, cfg) : { status: 400, json: { ok: false, why: "bad-request" } };
  };
/** A session of the account, asking as the object asks `act`, and as a browser asks (`tab`). */
async function device(db: Store, at: number, label = "Firefox on Linux") {
  const hash = (await hashOf(newToken()))!;
  const session = newId();
  assert.equal(signIn(db, { account: A, session, hash, label, owner: false }, at, cfg.gate), "ok");
  const ask = askerFor(db, hash);
  /** The same session as the app's code asks it, at the times `clock` gives. */
  const tab = (clock: { now: number }): Ask => async (action, body = {}) => {
    const answer = await ask(action, clock.now++, body);
    return { status: answer.status, json: JSON.parse(JSON.stringify(answer.json ?? {})) as Record<string, unknown> };
  };
  return { session, hash, ask, tab };
}
const count = (db: Store, table: string): number => Number((db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).all()[0] as { n: number }).n);
/** Every table of the database and how many rows it holds. */
const tables = (db: Store): Record<string, number> =>
  Object.fromEntries((db.raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as { name: string }[]).map(({ name }) => [name, count(db, `"${name}"`)]));
/** Everything in the database, as text, blobs as hex. */
const dump = (db: Store): string =>
  (db.raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[])
    .map(({ name }) => JSON.stringify(db.raw.prepare(`SELECT * FROM "${name}"`).all(), (_k, v: unknown) => (v instanceof Uint8Array ? Buffer.from(v).toString("hex") : v)))
    .join("\n");
function push(db: Store, d: { hash: string }, vault: string, at: number, blobs: Uint8Array[]): "ok" | string | number {
  const answer = act(db, { account: A, hash: d.hash, action: "sync/push", body: packPush(vault, blobs.map((blob) => ({ id: newId(), base: 0, blob }))), proofs: [] }, at, cfg);
  const read = answer.status === 200 ? unpackPushed(answer.bytes!) : null;
  return read ? (read.ok ? "ok" : read.why) : answer.status;
}
const blobs = (n: number, fill: number): Uint8Array[] => Array.from({ length: n }, () => new Uint8Array(64).fill(fill));
/** A vault made by a first session, which then locks it, with some chunks in it. */
async function lockedVault(db: Store) {
  const owner = await device(db, T0, "Safari on iPhone");
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await owner.ask("vault/start", T0 + 1, { vault, ways })).status, 200);
  assert.equal(push(db, owner, vault, T0 + 2, blobs(3, 5)), "ok");
  assert.equal((await owner.ask("vault/lock", T0 + 3)).status, 200);
  return { owner, vault, ways };
}

// ---------------------------------------------------------------------------------------------
// Who may erase, and when
// ---------------------------------------------------------------------------------------------

test("no session without the vault open erases it before its seven days, by any request, the alarm, or a clock gone back", async () => {
  const db = sqlite();
  const maker = await device(db, T0, "Safari on iPhone");
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await maker.ask("vault/start", T0 + 1, { vault, ways })).status, 200);
  assert.equal(push(db, maker, vault, T0 + 2, blobs(3, 7)), "ok");
  // the maker locks; one session never opens it; one opens it and locks again
  assert.equal((await maker.ask("vault/lock", T0 + 3)).status, 200);
  const stranger = await device(db, T0 + 4, "Chrome on Windows");
  const former = await device(db, T0 + 5, "Edge on Windows");
  assert.equal((await former.ask("vault/unlock", T0 + 6, { id: ways[0]!.wrapper.id, proof: ways[0]!.proof })).status, 200);
  assert.equal((await former.ask("vault/lock", T0 + 7)).status, 200);
  const held = () => [count(db, "vault"), count(db, "chunks"), count(db, "ways")];
  assert.deepEqual(held(), [1, 3, 2]);

  // the erasing is asked for by the stranger at T1
  const T1 = T0 + 10;
  assert.equal((await stranger.ask("vault/erase-later", T1, { vault })).status, 200);
  const due = T1 + ERASE_DELAY;
  const locked = [maker, stranger, former];
  let at = T1 + 1;
  for (const d of locked) {
    // at once, for this vault, another, none, or a vault named as something else
    for (const body of [{ vault }, { vault: newId() }, {}, { vault: [vault] }, { vault: `${vault} ` }]) assert.notEqual((await d.ask("vault/erase", at++, body)).status, 200, JSON.stringify(body));
    // asked again, or for another vault: the same day, never sooner
    assert.equal((await d.ask("vault/erase-later", at++, { vault: newId() })).status, 409);
    const again = await d.ask("vault/erase-later", at++, { vault });
    assert.equal((again.json!.erasing as { due: number }).due, due);
    // calling it off, starting the vault again (the same id, with ways of its own, or another), and a wrong try
    assert.equal((await d.ask("vault/erase-cancel", at++, { vault })).status, 423);
    assert.equal((await d.ask("vault/start", at++, { vault, ways: [way(vault, "passphrase"), way(vault, "recovery")] })).status, 200);
    const other = newId();
    assert.equal((await d.ask("vault/start", at++, { vault: other, ways: [way(other, "passphrase"), way(other, "recovery")] })).status, 409);
    assert.equal((await d.ask("vault/unlock", at++, { id: ways[1]!.wrapper.id, proof: newToken() })).status, 422);
    // and starting it again did not open it for them
    assert.equal((await d.ask("vault/erase", at++, { vault })).status, 423);
  }
  // (a session cannot ask under a clock set back past its own last request, sessions.ts: each moment is a new sign-in)
  for (const when of [T1 - DAY, T1 - 1, due - HOUR, due - 1]) {
    assert.equal(dueErase(db, when), due);
    const comer = await device(db, when, "Opera on Android");
    assert.equal((await comer.ask("vault", when)).status, 200);
    assert.equal((await comer.ask("vault/erase", when, { vault })).status, 423);
  }
  assert.deepEqual(held(), [1, 3, 2]);
  assert.equal(pendingErase(db)!.due, due);
  // at the time, the alarm does it, in no session's name
  assert.equal(dueErase(db, due), null);
  assert.deepEqual(held(), [0, 0, 0]);
  const last = db.raw.prepare(`SELECT kind, session FROM events ORDER BY n DESC LIMIT 1`).all()[0] as { kind: string; session: string | null };
  assert.deepEqual([last.kind, last.session], ["vault-erased", null]);
});

test("erasing takes the vault and what went with it, table by table, and nothing of the vault is left in the database", async () => {
  const db = sqlite();
  const maker = await device(db, T0);
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await maker.ask("vault/start", T0 + 1, { vault, ways })).status, 200);
  // blobs whose bytes can be looked for afterwards
  const marked = blobs(4, 0xab);
  assert.equal(push(db, maker, vault, T0 + 2, marked), "ok");
  const other = await device(db, T0 + 3);
  assert.equal((await other.ask("vault/unlock", T0 + 4, { id: ways[0]!.wrapper.id, proof: newToken() })).status, 422);
  assert.equal((await other.ask("vault/unlock", T0 + 5, { id: ways[1]!.wrapper.id, proof: ways[1]!.proof })).status, 200);
  assert.equal((await other.ask("vault/erase-later", T0 + 6, { vault })).status, 200);
  const before = tables(db);
  assert.deepEqual(
    [before.chunks, before.vault, before.ways, before.tries, before.unlocked, before.opened, before.erasing, before.sessions, before.account],
    [4, 1, 2, 1, 2, 2, 1, 2, 1],
  );
  assert.equal((await maker.ask("vault/erase", T0 + 7, { vault })).status, 200);
  const after = tables(db);
  // exactly these change: the vault's own go to nothing, a day's count is kept for the next vault, one line is added
  assert.deepEqual(after, { ...before, chunks: 0, vault: 0, ways: 0, tries: 0, unlocked: 0, opened: 0, erasing: 0, spent: 1, events: before.events! + 1 });
  // and nothing of the vault is anywhere in the database: not its id, not a wrapper, not a byte of what it sealed
  const all = dump(db);
  assert.equal(all.includes(vault), false, "the vault's id is still in the database");
  for (const w of ways) assert.equal(all.includes(w.wrapper.id), false);
  assert.equal(all.includes("ab".repeat(32)), false, "a sealed blob is still in the database");
  // what is kept of it: the day and how many it wrote
  assert.deepEqual(db.raw.prepare(`SELECT day, written FROM spent`).all().map((row) => ({ ...(row as object) })), [{ day: new Date(T0).toISOString().slice(0, 10), written: 4 }]);
});

test("erasing and making again, over and over in a day, gives no more writes than one vault has", async () => {
  const db = sqlite();
  const maker = await device(db, T0);
  let vault = newId();
  assert.equal((await maker.ask("vault/start", T0 + 1, { vault, ways: [way(vault, "passphrase"), way(vault, "recovery")] })).status, 200);
  let at = T0 + 2;
  let written = 0;
  // ten a day: four, erase, make, four, erase, make, then two and no more
  for (const n of [4, 4]) {
    assert.equal(push(db, maker, vault, at++, blobs(n, 1)), "ok");
    written += n;
    assert.equal((await maker.ask("vault/erase", at++, { vault })).status, 200);
    vault = newId();
    assert.equal((await maker.ask("vault/start", at++, { vault, ways: [way(vault, "passphrase"), way(vault, "recovery")] })).status, 200);
  }
  assert.equal(written, 8);
  assert.equal(push(db, maker, vault, at++, blobs(3, 1)), "quota-writes");
  assert.equal(push(db, maker, vault, at++, blobs(2, 1)), "ok");
  assert.equal(push(db, maker, vault, at++, blobs(1, 1)), "quota-writes");
  // an erasing between that writes nothing hands on the full count, and the next day starts at nothing
  assert.equal((await maker.ask("vault/erase", at++, { vault })).status, 200);
  vault = newId();
  const last = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await maker.ask("vault/start", at++, { vault, ways: last })).status, 200);
  assert.equal(push(db, maker, vault, at++, blobs(1, 1)), "quota-writes");
  const tomorrow = await device(db, T0 + DAY);
  assert.equal((await tomorrow.ask("vault/unlock", T0 + DAY + 1, { id: last[0]!.wrapper.id, proof: last[0]!.proof })).status, 200);
  assert.equal(push(db, tomorrow, vault, T0 + DAY + 2, blobs(10, 1)), "ok");
  assert.equal(push(db, tomorrow, vault, T0 + DAY + 3, blobs(1, 1)), "quota-writes");
});

// ---------------------------------------------------------------------------------------------
// The events log by kind
// ---------------------------------------------------------------------------------------------

test("six hundred lines of every other kind push no line a person must not miss out of what is kept or out of sight", async () => {
  const db = sqlite();
  const owner = await device(db, T0, "Safari on iPhone");
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await owner.ask("vault/start", T0 + 1, { vault, ways })).status, 200);
  const intruder = await device(db, T0 + 2, "Chrome on Windows");
  assert.equal((await intruder.ask("vault/unlock", T0 + 3, { id: ways[0]!.wrapper.id, proof: newToken() })).status, 422);
  assert.equal((await intruder.ask("vault/unlock", T0 + 4, { id: ways[0]!.wrapper.id, proof: ways[0]!.proof })).status, 200);
  assert.equal((await intruder.ask("vault/erase-later", T0 + 5, { vault })).status, 200);
  assert.equal((await owner.ask("vault/erase-cancel", T0 + 6, { vault })).status, 200);
  // then, newer than all of them (by number; their times are earlier, so that they are not this hour's sign-ins), six
  // hundred lines of each kind that is not one of those
  const insert = db.raw.prepare(`INSERT INTO events (at, kind, session) VALUES (?, ?, ?)`);
  for (const kind of ["sign-in", "sign-out", "session-ended", "sessions-ended"]) for (let i = 0; i < 600; i++) insert.run(T0 - 3 * HOUR + i, kind, newId());
  // and one more of each written by the code, which lets go of what is past its kind's five hundred (4f2c54fb: each
  // line written tidies its own kind only)
  const leaving = await device(db, T0 + 10);
  assert.equal((await leaving.ask("session/end", T0 + 11)).status, 200);
  const ended = await device(db, T0 + 12);
  assert.equal((await owner.ask("sessions/end", T0 + 13, { id: ended.session })).status, 200);
  assert.equal((await owner.ask("sessions/end", T0 + 14, { others: true })).status, 200);
  // forty of the owner's own openings from the session that looks, which are not another's (more than the ten kept in
  // sight of other sessions' openings, and with the rest more than the newest fifty)
  for (let i = 0; i < 40; i++) assert.equal((await owner.ask("vault/unlock", T0 + 700 + i, { id: ways[1]!.wrapper.id, proof: ways[1]!.proof })).status, 200);
  for (const kind of ["sign-in", "sign-out", "session-ended", "sessions-ended", "unlocked"]) assert.ok(count(db, `events WHERE kind = '${kind}'`) <= 500, kind);
  const shown = (await owner.ask("events", T0 + 2001)).json!.events as { kind: string; session: string | null }[];
  const has = (kind: string, session: string) => shown.some((line) => line.kind === kind && line.session === session);
  assert.ok(has("unlock-failed", intruder.session), "the wrong try");
  assert.ok(has("erase-asked", intruder.session), "the erasing asked for");
  assert.ok(has("erase-cancelled", owner.session), "the erasing called off");
  assert.ok(has("vault-started", owner.session), "the vault made");
  // (the intruder's opening is not pushed out by the owner's own openings from this session: they are its own)
  assert.ok(has("unlocked", intruder.session), "the vault opened by another session");
  assert.ok(shown.length <= 200);
});

// ---------------------------------------------------------------------------------------------
// The object's alarm (worker.ts), on Node, with a stand-in for the platform's storage
// ---------------------------------------------------------------------------------------------

type Storage = { sql: Db["sql"]; transactionSync: Db["atomically"]; deleteAll(): Promise<void>; setAlarm(at: number): Promise<void>; getAlarm(): Promise<number | null> };
type VaultObject = { fetch(request: Request): Promise<Response>; alarm(): Promise<void> };
const classes = workerModule() as Promise<{ VaultDO: new (ctx: { storage: Storage }, env: object) => VaultObject }>;

async function object() {
  const { VaultDO } = await classes;
  const db = sqlite();
  /** Every time the alarm was set, and the one set now (null: none; the platform clears it when it runs). */
  const alarms: number[] = [];
  let current: number | null = null;
  let failAlarm = false;
  const storage: Storage = {
    sql: db.sql,
    transactionSync: (work) => db.atomically(work),
    deleteAll: async () => undefined,
    getAlarm: async () => current,
    setAlarm: async (at) => {
      if (failAlarm) throw new Error("alarm refused");
      alarms.push(at);
      current = at;
    },
  };
  const vaultObject = new VaultDO({ storage }, { ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: A });
  const send = (hash: string, action: string, body: unknown = {}) => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    return vaultObject.fetch(new Request(`https://vault.internal/${action}`, { method: "POST", headers: { "x-ml-account": A, "x-ml-hash": hash, "Content-Length": String(bytes.length) }, body: bytes }));
  };
  /** The platform runs the alarm: it is no longer set while it runs. */
  const fire = async (): Promise<void> => {
    current = null;
    await vaultObject.alarm();
  };
  return { db, alarms, now: () => current, vaultObject, send, fire, failAlarms: (yes: boolean) => (failAlarm = yes), loseAlarm: () => (current = null) };
}

test("the object's alarm: set once when an erasing is asked for, again when lost or put off, early is set again, due erases, and a refused one is no failure", async () => {
  const realNow = Date.now;
  let clock = T0;
  Date.now = () => clock;
  try {
    const o = await object();
    const maker = await device(o.db, clock, "Safari on iPhone");
    const vault = newId();
    const ways = [way(vault, "passphrase"), way(vault, "recovery")];
    assert.equal((await o.send(maker.hash, "vault/start", { vault, ways })).status, 200);
    assert.deepEqual(o.alarms, []);
    const asker = await device(o.db, ++clock);
    assert.equal((await o.send(asker.hash, "vault/erase-later", { vault })).status, 200);
    const due = clock + ERASE_DELAY;
    assert.deepEqual(o.alarms, [due]);
    // twenty reads of the vault: nothing more is set
    for (let i = 0; i < 20; i++) assert.equal((await o.send(asker.hash, "vault")).status, 200);
    assert.deepEqual(o.alarms, [due]);
    // lost, and refused when set again: the answer is still the vault's, and the erasing is kept
    o.loseAlarm();
    o.failAlarms(true);
    const read = await o.send(maker.hash, "vault");
    assert.equal(read.status, 200);
    assert.equal(((await read.json()) as { erasing: { due: number } }).erasing.due, due);
    o.failAlarms(false);
    await o.send(maker.hash, "vault");
    assert.deepEqual(o.alarms, [due, due]);
    // put off by ten wrong proofs in the hour: the next read sets it for the new time
    for (let i = 0; i < 10; i++) assert.equal((await o.send(asker.hash, "vault/unlock", { id: ways[0]!.wrapper.id, proof: newToken() })).status, 422);
    const later = pendingErase(o.db)!.due;
    assert.ok(later > due);
    assert.equal(o.now(), due, "(the alarm is still set for the old time)");
    await o.send(asker.hash, "vault");
    assert.deepEqual(o.alarms, [due, due, later]);
    // woken early (at the old time): set again for the time, nothing erased
    clock = due;
    await o.fire();
    assert.deepEqual([o.now(), count(o.db, "vault")], [later, 1]);
    // at the time: erased, and not set again
    clock = later;
    const before = o.alarms.length;
    await o.fire();
    assert.deepEqual([o.alarms.length, o.now(), count(o.db, "vault"), count(o.db, "erasing")], [before, null, 0, 0]);
    // an object nobody signed in to makes no tables when woken
    const blank = await object();
    await blank.fire();
    assert.equal(count(blank.db, "sqlite_master"), 0);
  } finally {
    Date.now = realNow;
  }
});

// ---------------------------------------------------------------------------------------------
// Second look: kept out, put off, called off
// ---------------------------------------------------------------------------------------------

test("whoever holds only the mailbox, keeping the count full for two weeks, keeps the vault from being erased and never brings it nearer; once they stop, the owner's right proof calls it off", async () => {
  const db = sqlite();
  const { vault, ways } = await lockedVault(db);
  const STEP = 5 * MINUTE;
  let attacker = await device(db, T0 + STEP, "Chrome on Windows");
  const guess = async (at: number): Promise<void> => {
    let tried = await attacker.ask("vault/unlock", at, { id: ways[0]!.wrapper.id, proof: newToken() });
    // (sessions end after twelve hours, and the ninth sign-in pushes the oldest out: they sign in again)
    if (tried.status === 401) {
      attacker = await device(db, at, "Chrome on Windows");
      tried = await attacker.ask("vault/unlock", at, { id: ways[0]!.wrapper.id, proof: newToken() });
    }
    assert.ok(tried.status === 422 || tried.status === 429, String(tried.status));
  };
  let at = T0 + STEP;
  for (; at < T0 + 3 * HOUR; at += STEP) await guess(at);
  assert.equal((await attacker.ask("vault/erase-later", at, { vault })).status, 200);
  let due = pendingErase(db)!.due;
  // two weeks: the guesser at every five minutes, the owner every three hours, half a step after them
  let ownerIn = 0;
  for (let next = at + 150_000; at < T0 + 14 * DAY; at += STEP) {
    dueErase(db, at);
    await guess(at);
    const now = pendingErase(db);
    assert.ok(now !== null && now.due >= due, "an erasing came nearer, or went");
    due = now.due;
    if (at + STEP > next) {
      const own = await device(db, next, "Safari on iPhone");
      if ((await own.ask("vault/unlock", next, { id: ways[1]!.wrapper.id, proof: ways[1]!.proof })).status === 200) ownerIn++;
      next += 3 * HOUR;
    }
  }
  assert.equal(ownerIn, 0);
  assert.deepEqual([count(db, "vault"), count(db, "chunks")], [1, 3]);
  // they stop; the count frees within a day; the owner's next right proof calls the erasing off, and says so
  let said: unknown;
  for (let t = at; said === undefined && t < at + 2 * DAY; t += 3 * HOUR) {
    const own = await device(db, t, "Safari on iPhone");
    const opened = await own.ask("vault/unlock", t, { id: ways[1]!.wrapper.id, proof: ways[1]!.proof });
    if (opened.status === 200) said = opened.json!.erasing;
  }
  assert.equal(said, "called-off");
  assert.equal(pendingErase(db), null);
  assert.deepEqual([count(db, "vault"), count(db, "chunks")], [1, 3]);
});

/** A repeatable stream of numbers in [0, 1). */
function stream(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("whatever someone with only the mailbox does in MoneyLens, an erasing is never brought nearer, and goes through only seven days after nobody was kept out (random runs)", async () => {
  // What keeps someone out, written here apart from the server's code (1.9, 1.11): the count of wrong proofs full (ten
  // in an hour, thirty in a day), the hour's twelve sign-ins, a sign-in that pushes a live session out, and a session
  // signing another out. The server is to put the erasing off for each; this checks that it never does less.
  // weights: wrong proof, sign in, sign one out, sign all others out, read the vault, try to erase or call off, nothing
  const mixes = [
    [40, 10, 5, 3, 10, 2, 30],
    [0, 30, 15, 5, 10, 5, 35],
    [5, 5, 2, 1, 5, 2, 80],
  ];
  for (const [round, mix] of mixes.entries()) {
    const rand = stream(20261128 + round);
    const db = sqlite();
    const { vault, ways } = await lockedVault(db);
    const signIns: number[] = [T0];
    const tries: number[] = [];
    let lastOut = 0;
    const out = (until: number) => void (lastOut = Math.max(lastOut, until));
    const mine: { id: string; ask: ReturnType<typeof askerFor> }[] = [];
    const signInAs = async (t: number) => {
      const wasCrowded = crowded(db, t);
      const hash = (await hashOf(newToken()))!;
      const id = newId();
      if (signIn(db, { account: A, session: id, hash, label: "Chrome on Windows", owner: false }, t, cfg.gate) !== "ok") return null;
      signIns.push(t);
      if (wasCrowded) out(t);
      const hour = signIns.filter((s) => s > t - HOUR).sort((a, b) => b - a);
      if (hour.length >= 12) out(hour[11]! + HOUR);
      const one = { id, ask: askerFor(db, hash) };
      mine.push(one);
      return one;
    };
    const anyone = async (t: number) => mine[Math.floor(rand() * mine.length)] ?? (await signInAs(t));
    const drop = (id: string) => mine.splice(mine.findIndex((one) => one.id === id), 1);
    let askedAt: number | null = null;
    let erasedAt: number | null = null;
    let due = 0;
    const STEP = 7 * MINUTE;
    const total = mix.reduce((sum, w) => sum + w!, 0);
    for (let step = 0, t = T0 + 10 * MINUTE; t < T0 + 21 * DAY; step++, t += STEP) {
      // the platform's alarm, and the check before every request
      const had = pendingErase(db);
      dueErase(db, t);
      if (had && count(db, "vault") === 0) {
        erasedAt = t;
        break;
      }
      const s = await anyone(t);
      if (s === null) continue;
      let pick = rand() * total;
      const action = mix.findIndex((w) => (pick -= w!) < 0);
      if (step >= 30 && askedAt === null) {
        const asked = await s.ask("vault/erase-later", t, { vault });
        if (asked.status === 200) askedAt = (asked.json!.erasing as { asked: number }).asked;
        if (asked.status === 401) drop(s.id);
      } else if (action === 0) {
        const tried = await s.ask("vault/unlock", t, { id: ways[Math.floor(rand() * 2)]!.wrapper.id, proof: newToken() });
        if (tried.status === 401) drop(s.id);
        if (tried.status === 422) {
          tries.push(t);
          const day = tries.filter((at) => at > t - DAY).sort((a, b) => b - a);
          const hour = day.filter((at) => at > t - HOUR);
          const wait = Math.max(0, hour.length >= 10 ? hour[9]! + HOUR - t : 0, day.length >= 30 ? day[29]! + DAY - t : 0);
          if (wait > 0) out(t + wait);
        }
      } else if (action === 1) await signInAs(t);
      else if (action === 2) {
        const other = mine.find((one) => one.id !== s.id);
        if (other) {
          const ended = await s.ask("sessions/end", t, { id: other.id });
          if (ended.status === 200) out(t);
          if (ended.status === 401) drop(s.id);
          else drop(other.id);
        }
      } else if (action === 3) {
        const ended = await s.ask("sessions/end", t, { others: true });
        if (ended.status === 200) {
          if ((ended.json!.ended as number) > 0) out(t);
          mine.splice(0, mine.length, s);
        } else if (ended.status === 401) drop(s.id);
      } else if (action === 4) {
        if ((await s.ask("vault", t)).status === 401) drop(s.id);
      } else if (action === 5) {
        const tried = await s.ask(rand() < 0.5 ? "vault/erase" : "vault/erase-cancel", t, { vault });
        assert.ok(tried.status === 423 || tried.status === 401, String(tried.status));
        if (tried.status === 401) drop(s.id);
      }
      // never brought nearer
      const now = pendingErase(db);
      if (now) {
        assert.ok(now.due >= due || had === null, `round ${round}: brought nearer at step ${step}`);
        due = now.due;
      }
    }
    assert.notEqual(askedAt, null, `round ${round}: asked`);
    // then they stop; the alarm runs every hour until the erasing is done
    for (let t = T0 + 21 * DAY; erasedAt === null && t < T0 + 60 * DAY; t += HOUR) {
      dueErase(db, t);
      if (count(db, "vault") === 0) erasedAt = t;
    }
    assert.ok(erasedAt !== null, `round ${round}: never erased`);
    const earliest = Math.max(askedAt!, lastOut) + ERASE_DELAY;
    // never before seven days after the last time anyone was kept out (the server holds at least what this model counts)
    assert.ok(erasedAt >= earliest, `round ${round}: erased ${(earliest - erasedAt) / HOUR} hours early`);
    // and not held for longer than that once they stop (nothing else puts it off); the hour is the alarm's step here
    assert.ok(erasedAt < Math.max(earliest, T0 + 21 * DAY) + HOUR, `round ${round}: erased ${(erasedAt - earliest) / HOUR} hours after the model's time`);
  }
});

test("what calls an erasing off: a right proof of the vault held, or an open vault's press naming it; nothing else", async () => {
  const db = sqlite();
  const { vault, ways } = await lockedVault(db);
  const asker = await device(db, T0 + 10, "Chrome on Windows");
  const still = () => pendingErase(db) !== null;
  const lastLine = () => db.raw.prepare(`SELECT kind, session FROM events ORDER BY n DESC LIMIT 1`).all()[0] as { kind: string; session: string };
  assert.equal((await asker.ask("vault/erase-later", T0 + 11, { vault })).status, 200);
  // a wrong proof, a proof of a way in that is not there, a press without the vault open: nothing called off
  assert.equal((await asker.ask("vault/unlock", T0 + 12, { id: ways[0]!.wrapper.id, proof: newToken() })).status, 422);
  assert.equal((await asker.ask("vault/unlock", T0 + 13, { id: newId(), proof: ways[0]!.proof })).status, 404);
  assert.equal((await asker.ask("vault/erase-cancel", T0 + 14, { vault })).status, 423);
  assert.equal(still(), true);
  // another device's right proof calls it off, in its own name, and its answer says so
  const opener = await device(db, T0 + 15);
  const opened = await opener.ask("vault/unlock", T0 + 16, { id: ways[0]!.wrapper.id, proof: ways[0]!.proof });
  assert.deepEqual([opened.status, opened.json!.erasing, still(), lastLine().kind, lastLine().session], [200, "called-off", false, "erase-cancelled", opener.session]);
  // asked again: the press of a session with the vault open, naming another vault or none, calls nothing off
  assert.equal((await asker.ask("vault/erase-later", T0 + 17, { vault })).status, 200);
  assert.equal((await opener.ask("vault/erase-cancel", T0 + 18, { vault: newId() })).status, 409);
  assert.equal((await opener.ask("vault/erase-cancel", T0 + 19, {})).status, 400);
  assert.equal(still(), true);
  // naming the vault it holds, it does, once
  assert.deepEqual((await opener.ask("vault/erase-cancel", T0 + 20, { vault })).json, { ok: true });
  assert.deepEqual((await opener.ask("vault/erase-cancel", T0 + 21, { vault })).json, { ok: false, why: "no-erase" });
  // the session that asked, finding its secret after all, calls its own reset off by opening, and is told so
  assert.equal((await asker.ask("vault/erase-later", T0 + 22, { vault })).status, 200);
  const found = await asker.ask("vault/unlock", T0 + 23, { id: ways[1]!.wrapper.id, proof: ways[1]!.proof });
  assert.deepEqual([found.status, found.json!.erasing, still(), lastLine().session], [200, "called-off", false, asker.session]);
  // a right proof with nothing asked for says nothing of an erasing, and writes no line of one
  const fresh = await device(db, T0 + 24);
  const plain = await fresh.ask("vault/unlock", T0 + 25, { id: ways[0]!.wrapper.id, proof: ways[0]!.proof });
  assert.deepEqual([plain.status, "erasing" in plain.json!, lastLine().kind], [200, false, "unlocked"]);
  // a right proof turned away because the count is full calls nothing off (and the erasing is put off)
  const stranger = await device(db, T0 + 26);
  assert.equal((await stranger.ask("vault/erase-later", T0 + 27, { vault })).status, 200);
  const askedDue = pendingErase(db)!.due;
  for (let i = 0; i < 9; i++) assert.equal((await stranger.ask("vault/unlock", T0 + 30 + i, { id: ways[1]!.wrapper.id, proof: newToken() })).status, 422);
  const blocked = await device(db, T0 + 40);
  assert.equal((await blocked.ask("vault/unlock", T0 + 41, { id: ways[1]!.wrapper.id, proof: ways[1]!.proof })).status, 429);
  assert.equal(still(), true);
  assert.ok(pendingErase(db)!.due > askedDue);
});

// ---------------------------------------------------------------------------------------------
// The first look's findings 2, 3 and 5, restated for what holds now (plain); finding 4 still todo
// ---------------------------------------------------------------------------------------------

test("finding 2 (resolved at 4f2c54fb): opening the vault calls an erasing off, as the screens say, and the app is told so", async () => {
  const db = sqlite();
  const clock = { now: T0 };
  const phone = await device(db, clock.now++, "Safari on iPhone");
  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  assert.equal(await keep(phone.tab(clock), made.draft), "ok");
  // the owner, on another device, asks to start over, then finds the passphrase and opens the vault with it
  const laptop = await device(db, clock.now++, "Firefox on Windows");
  assert.equal((await laptop.ask("vault/erase-later", clock.now++, { vault: made.draft.vault.id })).status, 200);
  const opened = await open(laptop.tab(clock), made.draft.vault.id, { kind: "passphrase", passphrase: PASSPHRASE });
  assert.ok(opened.ok && opened.calledOff === true);
  assert.equal(pendingErase(db), null);
  // opened again, with nothing asked for: nothing is said
  const again = await open(phone.tab(clock), made.draft.vault.id, { kind: "passphrase", passphrase: PASSPHRASE });
  assert.ok(again.ok && again.calledOff === undefined);
});

test("finding 3 (resolved at 4f2c54fb): a device that had the vault open, after it was erased from elsewhere or by its seven days, is told it is gone, not 'locked'", async () => {
  const db = sqlite();
  const clock = { now: T0 };
  const phone = await device(db, clock.now++, "Safari on iPhone");
  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  assert.equal(await keep(phone.tab(clock), made.draft), "ok");
  const laptop = await device(db, clock.now++, "Firefox on Windows");
  const opened = await open(laptop.tab(clock), made.draft.vault.id, { kind: "passphrase", passphrase: PASSPHRASE });
  assert.ok(opened.ok);
  // the phone erases it at once; the laptop still shows it open, and its person presses "Erase the vault", or "Don't
  // erase it", or locks and tries to open it again
  assert.equal(await eraseNow(phone.tab(clock), made.draft.vault.id), "ok");
  assert.equal(await eraseNow(laptop.tab(clock), made.draft.vault.id), "gone");
  assert.equal(await keepVault(laptop.tab(clock), made.draft.vault.id), "gone");
  const tried = await open(laptop.tab(clock), made.draft.vault.id, { kind: "passphrase", passphrase: PASSPHRASE });
  assert.deepEqual(tried, { ok: false, why: "no-way" });
  // (where the screen then asks where things stand)
  assert.deepEqual(await standing(laptop.tab(clock)), { at: "no-vault" });

  // (The first look's second case, "Don't erase it" pressed a second after the seven days, cannot come about now: a
  // session is unlocked only by a right proof shown in its twelve hours, and while an erasing is asked for that proof
  // calls it off. So no device holds the vault open when its seven days come; the review says so.)
});

test("finding 5 (resolved at 4f2c54fb): reading the vault while an erasing is asked for sets the object's alarm once, not at every request", async () => {
  const realNow = Date.now;
  let clock = T0;
  Date.now = () => clock;
  try {
    const o = await object();
    const maker = await device(o.db, clock);
    const vault = newId();
    assert.equal((await o.send(maker.hash, "vault/start", { vault, ways: [way(vault, "passphrase"), way(vault, "recovery")] })).status, 200);
    // a session that has never opened the vault asks for it to be erased, and then reads the vault fifty times
    const stranger = await device(o.db, ++clock);
    assert.equal((await o.send(stranger.hash, "vault/erase-later", { vault })).status, 200);
    for (let i = 0; i < 50; i++) {
      clock += 100;
      assert.equal((await o.send(stranger.hash, "vault")).status, 200);
    }
    assert.equal(o.alarms.length, 1, `the alarm was set ${o.alarms.length} times for one erasing`);
  } finally {
    Date.now = realNow;
  }
});

test("finding 4: an intruder's opening of the vault stays in sight after two weeks of the owner's own use", { todo: "finding 4: the openings shown apart are the newest ten by any session but the one asking, nameless once their session ends, so the owner's own other sign-ins push an intruder's out of sight" }, async () => {
  const db = sqlite();
  const owner = await device(db, T0, "Safari on iPhone");
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await owner.ask("vault/start", T0 + 1, { vault, ways })).status, 200);
  // someone who knows the passphrase opens the vault, once, and signs out
  const intruder = await device(db, T0 + HOUR, "Chrome on Windows");
  assert.equal((await intruder.ask("vault/unlock", T0 + HOUR + 1, { id: ways[0]!.wrapper.id, proof: ways[0]!.proof })).status, 200);
  assert.equal((await intruder.ask("session/end", T0 + HOUR + 2)).status, 200);
  // two weeks of the owner's own use: his laptop and his phone open the vault morning and evening, each a new
  // sign-in, and he locks and signs out after
  for (let i = 0; i < 28; i++) {
    const at = T0 + DAY + i * 12 * HOUR;
    const own = await device(db, at, i % 2 ? "Safari on iPhone" : "Safari on Mac");
    assert.equal((await own.ask("vault/unlock", at + 1, { id: ways[0]!.wrapper.id, proof: ways[0]!.proof })).status, 200);
    assert.equal((await own.ask("session/end", at + 2)).status, 200);
  }
  // on the fifteenth day, the owner looks at the list from his phone
  const now = T0 + 15 * DAY;
  const looking = await device(db, now, "Safari on iPhone");
  const read = await listing(looking.tab({ now: now + 1 }));
  assert.ok(read.ok);
  assert.ok(
    openedOf(read.lines).some((line) => line.session === intruder.session),
    "the intruder's opening, two weeks old, is no longer on the screen",
  );
});

void erasing;
