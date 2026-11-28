/**
 * C12 review (erasing a vault, and the events log kept by kind, at 9bffa8cc): the reviewer's own tests, not the
 * author's. The reviewer is the same model as the author (docs/moneylens/reviews/erase.md says what that limits), so
 * these try the code rather than read it: every way a session without the vault open might erase it early, table by
 * table what erasing takes and leaves, the day's writes across cycles, lines of every other kind against the lines a
 * person must not miss, the object's alarm (worker.ts, which the author's tests only read), and what the app is told
 * by a server whose vault was erased from elsewhere.
 *
 * Tests marked `todo` show a finding of the review and fail while it stands. The others pin what the review checked
 * and found right. Every id, label, passphrase and proof here is invented.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { listing, openedOf } from "../src/app/devices";
import { draft, keep, open, type Ask } from "../src/app/door";
import { eraseNow, erasing, keepVault } from "../src/app/erase";
import { newId } from "../src/core/ids";
import { act, dueErase, proofsIn, signIn, type Answer } from "../src/server/account";
import type { Db } from "../src/server/chunks";
import { ERASE_DELAY, pendingErase } from "../src/server/erase";
import { configOf } from "../src/server/gate";
import { hashOf, newToken } from "../src/server/sessions";
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

/** A session of the account, asking as the object asks `act` (the proofs hashed first), and as a browser asks (`tab`). */
async function device(db: Store, at: number, label = "Firefox on Linux") {
  const hash = (await hashOf(newToken()))!;
  const session = newId();
  assert.equal(signIn(db, { account: A, session, hash, label, owner: false }, at, cfg.gate), "ok");
  const ask = async (action: string, when: number, body: unknown = {}): Promise<Answer> => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const proofs = await proofsIn(action, bytes);
    return proofs ? act(db, { account: A, hash, action, body: bytes, proofs }, when, cfg) : { status: 400, json: { ok: false, why: "bad-request" } };
  };
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
    // calling it off, starting the vault again (the same id, with ways of its own, or another), and wrong tries
    assert.equal((await d.ask("vault/erase-cancel", at++)).status, 423);
    assert.equal((await d.ask("vault/start", at++, { vault, ways: [way(vault, "passphrase"), way(vault, "recovery")] })).status, 200);
    const other = newId();
    assert.equal((await d.ask("vault/start", at++, { vault: other, ways: [way(other, "passphrase"), way(other, "recovery")] })).status, 409);
    assert.equal((await d.ask("vault/unlock", at++, { id: ways[1]!.wrapper.id, proof: newToken() })).status, 422);
    // and starting it again did not open it for them
    assert.equal((await d.ask("vault/erase", at++, { vault })).status, 423);
  }
  // a clock gone back by a day, and forward to a millisecond before: neither a request nor the alarm erases anything
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
  assert.equal((await owner.ask("vault/erase-cancel", T0 + 6)).status, 200);
  // then, newer than all of them (by number; their times are earlier, so that they are not this hour's sign-ins), six
  // hundred lines of each kind that is not one of those
  const insert = db.raw.prepare(`INSERT INTO events (at, kind, session) VALUES (?, ?, ?)`);
  for (const kind of ["sign-in", "sign-out", "session-ended", "sessions-ended"]) for (let i = 0; i < 600; i++) insert.run(T0 - 3 * HOUR + i, kind, newId());
  // and forty of the owner's own openings from the session that looks, which are not another's (more than the ten kept in
  // sight of other sessions' openings, and with the rest more than the newest fifty)
  for (let i = 0; i < 40; i++) assert.equal((await owner.ask("vault/unlock", T0 + 700 + i, { id: ways[1]!.wrapper.id, proof: ways[1]!.proof })).status, 200);
  await device(db, T0 + 2000);
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
// The object's alarm (worker.ts), on Node: what the author's tests read but do not run
// ---------------------------------------------------------------------------------------------

type Storage = { sql: Db["sql"]; transactionSync: Db["atomically"]; deleteAll(): Promise<void>; setAlarm(at: number): Promise<void> };
type VaultObject = { fetch(request: Request): Promise<Response>; alarm(): Promise<void> };
const classes = workerModule() as Promise<{ VaultDO: new (ctx: { storage: Storage }, env: object) => VaultObject }>;

async function object() {
  const { VaultDO } = await classes;
  const db = sqlite();
  const alarms: number[] = [];
  let failAlarm = false;
  const storage: Storage = {
    sql: db.sql,
    transactionSync: (work) => db.atomically(work),
    deleteAll: async () => undefined,
    setAlarm: async (at) => {
      if (failAlarm) throw new Error("alarm refused");
      alarms.push(at);
    },
  };
  const vaultObject = new VaultDO({ storage }, { ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: A });
  const send = (hash: string, action: string, body: unknown = {}) => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    return vaultObject.fetch(new Request(`https://vault.internal/${action}`, { method: "POST", headers: { "x-ml-account": A, "x-ml-hash": hash, "Content-Length": String(bytes.length) }, body: bytes }));
  };
  return { db, alarms, vaultObject, send, failAlarms: (yes: boolean) => (failAlarm = yes) };
}

test("the object's alarm: set when an erasing is asked for and when the vault is read, early is set again, due erases, and a lost one is no failure", async () => {
  const realNow = Date.now;
  let clock = T0;
  Date.now = () => clock;
  try {
    const o = await object();
    const maker = await device(o.db, clock, "Safari on iPhone");
    const vault = newId();
    assert.equal((await o.send(maker.hash, "vault/start", { vault, ways: [way(vault, "passphrase"), way(vault, "recovery")] })).status, 200);
    assert.deepEqual(o.alarms, []);
    const asker = await device(o.db, ++clock);
    const asked = await o.send(asker.hash, "vault/erase-later", { vault });
    assert.equal(asked.status, 200);
    const due = clock + ERASE_DELAY;
    assert.deepEqual(o.alarms, [due]);
    // an alarm that cannot be set: the answer is still the vault's, and the erasing is kept
    o.failAlarms(true);
    const read = await o.send(maker.hash, "vault");
    assert.equal(read.status, 200);
    assert.equal(((await read.json()) as { erasing: { due: number } }).erasing.due, due);
    o.failAlarms(false);
    await o.send(maker.hash, "vault");
    assert.deepEqual(o.alarms, [due, due]);
    // woken early: set again for the time, nothing erased
    clock = due - MINUTE;
    await o.vaultObject.alarm();
    assert.deepEqual([o.alarms.at(-1), count(o.db, "vault")], [due, 1]);
    // at the time: erased, and not set again
    clock = due;
    const before = o.alarms.length;
    await o.vaultObject.alarm();
    assert.deepEqual([o.alarms.length, count(o.db, "vault"), count(o.db, "erasing")], [before, 0, 0]);
    // an object nobody signed in to makes no tables when woken
    const blank = await object();
    await blank.vaultObject.alarm();
    assert.equal(count(blank.db, "sqlite_master"), 0);
  } finally {
    Date.now = realNow;
  }
});

// ---------------------------------------------------------------------------------------------
// Findings (todo while each stands)
// ---------------------------------------------------------------------------------------------

test("finding 1: whoever holds only the mailbox cannot have the vault erased while its owner keeps trying to open it and call that off", { todo: "finding 1: the wrong-proof count keeps the owner from opening the vault, and calling an erasing off needs it open: a mailbox holder can force the erasing" }, async () => {
  const db = sqlite();
  const owner = await device(db, T0, "Safari on iPhone");
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await owner.ask("vault/start", T0 + 1, { vault, ways })).status, 200);
  assert.equal(push(db, owner, vault, T0 + 2, blobs(3, 5)), "ok");
  assert.equal((await owner.ask("vault/lock", T0 + 3)).status, 200);
  // Someone with the owner's mailbox signs in and guesses wrong on purpose, trying again every five minutes, so that
  // every place in the count that comes free is theirs (1.9: past the count, every proof waits, the right one too).
  const STEP = 5 * MINUTE;
  let attacker = await device(db, T0 + STEP, "Chrome on Windows");
  let due = Number.POSITIVE_INFINITY;
  const guess = async (at: number): Promise<void> => {
    let tried = await attacker.ask("vault/unlock", at, { id: ways[0]!.wrapper.id, proof: newToken() });
    // (sessions end after twelve hours, and an eighth sign-in pushes the oldest out: they sign in again)
    if (tried.status === 401) {
      attacker = await device(db, at, "Chrome on Windows");
      tried = await attacker.ask("vault/unlock", at, { id: ways[0]!.wrapper.id, proof: newToken() });
    }
    // (wrong, or turned away past the count; and once the vault is erased, there is no way in to guess at)
    assert.ok(tried.status === 422 || tried.status === 429 || (at >= due && tried.status === 404), String(tried.status));
  };
  let at = T0 + STEP;
  for (; at < T0 + 3 * HOUR; at += STEP) await guess(at);
  // then they ask for the vault to be erased in seven days
  assert.equal((await attacker.ask("vault/erase-later", at, { vault })).status, 200);
  due = at + ERASE_DELAY;
  // The owner sees the notice, and every three hours for the seven days opens the vault to call it off.
  let ownerIn = 0;
  let kept = false;
  for (let next = at + 150_000; at < due + HOUR; at += STEP) {
    await guess(at);
    if (at + STEP > next && next < due) {
      const own = await device(db, next, "Safari on iPhone");
      const opened = await own.ask("vault/unlock", next, { id: ways[1]!.wrapper.id, proof: ways[1]!.proof });
      if (opened.status === 200) {
        ownerIn++;
        kept ||= (await own.ask("vault/erase-cancel", next + 1)).status === 200;
      }
      next += 3 * HOUR;
    }
  }
  assert.deepEqual(
    { ownerGotIn: ownerIn > 0, calledOff: kept, vaultLeft: count(db, "vault") === 1 && count(db, "chunks") === 3 },
    { ownerGotIn: true, calledOff: true, vaultLeft: true },
    "the owner tried 56 times in seven days to open the vault and call the erasing off, never got past the count, and the vault was erased",
  );
});

/** The English words of a key in web/app/i18n.ts, read as text (the module needs a browser to load). */
function english(key: string): string {
  const source = readFileSync(new URL("../web/app/i18n.ts", import.meta.url), "utf8");
  const found = new RegExp(`^\\s*${key}: \\{ zh: "[^"]*", en: "([^"]*)" \\}`, "m").exec(source);
  assert.ok(found, key);
  return found[1]!;
}

test("finding 2: no screen says that opening the vault calls an erasing off, unless opening it does", { todo: "finding 2: three English sentences say opening the vault calls the erasing off; only 'Don't erase it', pressed on the open vault, does" }, async () => {
  const db = sqlite();
  const owner = await device(db, T0);
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await owner.ask("vault/start", T0 + 1, { vault, ways })).status, 200);
  assert.equal((await owner.ask("vault/lock", T0 + 2)).status, 200);
  // the owner asks to start over, then finds the recovery code and opens the vault with it, as the screen tells him
  assert.equal((await owner.ask("vault/erase-later", T0 + 3, { vault })).status, 200);
  assert.equal((await owner.ask("vault/unlock", T0 + 4, { id: ways[1]!.wrapper.id, proof: ways[1]!.proof })).status, 200);
  const calledOffByOpening = pendingErase(db) === null;
  const claims = ["erasingOpenHint", "resetHow", "erasingIfNotYou"].filter((key) => /open(?:ing)? the vault[^.]*\bcalls it off\b|open the vault to call it off/i.test(english(key)));
  assert.ok(calledOffByOpening || claims.length === 0, `opening left the erasing in place, and these say it calls it off: ${claims.join(", ")}`);
});

test("finding 3: a device that had the vault open, after it was erased from elsewhere or by its seven days, is told it is gone, not 'locked'", { todo: "finding 3: vault/erase and vault/erase-cancel answer 423 'locked' for a vault that no longer exists, and the screens say to lock and open it again" }, async () => {
  const db = sqlite();
  const clock = { now: T0 };
  const phone = await device(db, clock.now++, "Safari on iPhone");
  const made = await draft(PASSPHRASE);
  assert.ok(made.ok);
  assert.equal(await keep(phone.tab(clock), made.draft), "ok");
  const laptop = await device(db, clock.now++, "Firefox on Windows");
  const opened = await open(laptop.tab(clock), made.draft.vault.id, { kind: "passphrase", passphrase: PASSPHRASE });
  assert.ok(opened.ok);
  // the phone erases it at once; the laptop still shows it open, and its person presses "Erase the vault"
  assert.equal(await eraseNow(phone.tab(clock), made.draft.vault.id), "ok");
  const said = await eraseNow(laptop.tab(clock), made.draft.vault.id);
  // (and what the server says of the account the laptop could have been told instead)
  assert.deepEqual(await erasing(laptop.tab(clock)), { ok: true, vault: null, pending: null });

  // the same seconds late: an erasing comes due while the owner's open vault shows "Don't erase it", which he presses
  const db2 = sqlite();
  const owner = await device(db2, T0, "Safari on iPhone");
  const vault = newId();
  const ways = [way(vault, "passphrase"), way(vault, "recovery")];
  assert.equal((await owner.ask("vault/start", T0 + 1, { vault, ways })).status, 200);
  const asker = await device(db2, T0 + 2);
  assert.equal((await asker.ask("vault/erase-later", T0 + 3, { vault })).status, 200);
  const due = T0 + 3 + ERASE_DELAY;
  const late = await device(db2, due - 10 * MINUTE);
  assert.equal((await late.ask("vault/unlock", due - 10 * MINUTE + 1, { id: ways[0]!.wrapper.id, proof: ways[0]!.proof })).status, 200);
  const pressed = await keepVault(late.tab({ now: due + 1000 }));
  assert.deepEqual(
    { eraseNow: said, keepVault: pressed === "locked" ? "locked" : "not locked" },
    { eraseNow: "gone", keepVault: "not locked" },
    "a vault that no longer exists is answered as 'locked on the server', and the screens say to lock it and open it again",
  );
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

test("finding 5: reading the vault while an erasing is asked for sets the object's alarm once, not at every request", { todo: "finding 5: every 'vault' answer while an erasing is asked for sets the alarm again, which any signed-in session can ask for at the rate limit" }, async () => {
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
    assert.ok(o.alarms.length <= 2, `the alarm was set ${o.alarms.length} times for one erasing`);
  } finally {
    Date.now = realNow;
  }
});
