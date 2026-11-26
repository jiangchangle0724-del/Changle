/**
 * Sessions in a person's own database (src/server/sessions.ts; ARCH-4, ARCH-8, T-3): signing in,
 * being recognized, running out, being ended from the server, and what all of it stores and
 * costs. On Node's SQLite shaped like a Durable Object's (tests/sqlremote.ts).
 *
 *   npx tsx --test tests/sessions.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { newId } from "../src/core/ids";
import type { Db } from "../src/server/chunks";
import { IDLE, LIFETIME, MOST, TOUCH, checkSession, endAllSessions, endSession, hashOf, listSessions, newToken, openSession, sessionTables } from "../src/server/sessions";
import { sqlite } from "./sqlremote";

const T0 = 1_800_000_000_000;
const MINUTE = 60_000;

const fresh = () => {
  const db = sqlite();
  sessionTables(db);
  return db;
};

/** Signs a device in and gives back what the browser would hold (the token) and what the list shows (the id). */
async function signIn(db: Db, now: number, label = "Invented Browser, Invented OS") {
  const [id, token] = [newId(), newToken()];
  const hash = (await hashOf(token))!;
  assert.equal(openSession(db, { id, hash, label }, now), true);
  return { id, token, hash };
}

/** Every statement the code runs from here on, as "read" or "write". */
function watch(db: Db): string[] {
  const seen: string[] = [];
  const exec = db.sql.exec;
  db.sql.exec = (query, ...args) => {
    seen.push(/^SELECT\b/.test(query) ? "read" : "write");
    return exec(query, ...args);
  };
  return seen;
}

test("a token is 256 random bits, and what is kept of it is its SHA-256 and nothing else", async () => {
  const tokens = new Set(Array.from({ length: 200 }, () => newToken()));
  assert.equal(tokens.size, 200);
  for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  // a known answer: SHA-256 of these 43 characters, as URL-safe base64 without padding (worked out with OpenSSL and with Python's hashlib)
  assert.equal(await hashOf("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), "DwBzhbb51LfusnSGBa_hqYSgo7-j8BTQnip4TOnlzRo");
  // what is not a token has no hash
  for (const bad of ["", "short", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}=`, `${"A".repeat(42)} `, 7, null, undefined]) assert.equal(await hashOf(bad), null, String(bad));
  // The database: one table, these columns, and after a sign-in no column of it holds the token.
  const db = fresh();
  const { token, hash } = await signIn(db, T0, "MARKER-LABEL");
  assert.deepEqual((db.raw.prepare(`PRAGMA table_info(sessions)`).all() as { name: string; type: string }[]).map((c) => `${c.name} ${c.type}`), ["id TEXT", "hash TEXT", "made INTEGER", "seen INTEGER", "label TEXT"]);
  const stored = JSON.stringify(db.raw.prepare(`SELECT * FROM sessions`).all());
  assert.ok(!stored.includes(token));
  assert.ok(stored.includes(hash) && stored.includes("MARKER-LABEL"));
  // making the table again changes nothing
  sessionTables(db);
  assert.ok(checkSession(db, hash, T0));
});

test("a session is recognized by its token alone, in its own database, and what comes back names no hash (T-3, ISO-2)", async () => {
  const [mine, theirs] = [fresh(), fresh()];
  const a = await signIn(mine, T0);
  const b = await signIn(theirs, T0);
  assert.deepEqual(checkSession(mine, a.hash, T0 + 5), { id: a.id, made: T0, seen: T0, label: "Invented Browser, Invented OS" });
  // another person's token is nothing here, and mine is nothing there
  assert.equal(checkSession(mine, b.hash, T0 + 5), null);
  assert.equal(checkSession(theirs, a.hash, T0 + 5), null);
  // the id of a session is not its token: knowing it signs nobody in
  assert.equal(checkSession(mine, (await hashOf(newToken()))!, T0 + 5), null);
  assert.equal(await hashOf(a.id), null);
  // the token itself, handed over where its hash belongs, is not recognized either
  assert.equal(checkSession(mine, a.token, T0 + 5), null);
  for (const bad of ["", a.hash.slice(1), `${a.hash}A`, a.hash.toLowerCase() === a.hash ? a.hash.toUpperCase() : a.hash.toLowerCase(), null, undefined, 7, {}]) assert.equal(checkSession(mine, bad, T0 + 5), null, String(bad));
  // a time that is not a time is not checked against, and costs the session nothing
  for (const never of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(checkSession(mine, a.hash, never), null, String(never));
  assert.ok(checkSession(mine, a.hash, T0 + 6));
  // Two hashes that are alike up to their last character are two sessions: each is recognized as itself, and a third
  // that differs from both in one character is nobody.
  const twins = fresh();
  const [one, two, three] = ["A".repeat(43), `${"A".repeat(42)}B`, `${"A".repeat(42)}C`];
  assert.equal(openSession(twins, { id: newId(), hash: one, label: "one" }, T0), true);
  assert.equal(openSession(twins, { id: newId(), hash: two, label: "two" }, T0), true);
  assert.equal(checkSession(twins, one, T0)!.label, "one");
  assert.equal(checkSession(twins, two, T0)!.label, "two");
  assert.equal(checkSession(twins, three, T0), null);
  assert.equal(checkSession(twins, `B${"A".repeat(42)}`, T0), null);
  // a database with no sessions, and one where the table is all there is
  assert.equal(checkSession(fresh(), a.hash, T0), null);
});

test("a session ends 30 minutes after it was last seen, and 12 hours after it was made whatever its use (ARCH-4)", async () => {
  const db = fresh();
  const a = await signIn(db, T0);
  // one millisecond short of 30 minutes: still on. (The check itself counts as being seen.)
  assert.ok(checkSession(db, a.hash, T0 + IDLE - 1));
  assert.ok(checkSession(db, a.hash, T0 + IDLE - 1 + IDLE - 1));
  // 30 minutes to the millisecond after that: ended, and taken out
  const last = T0 + 2 * IDLE - 2;
  assert.equal(checkSession(db, a.hash, last + IDLE), null);
  assert.equal(db.raw.prepare(`SELECT count(*) AS n FROM sessions`).get()!.n, 0);
  // and it does not come back when the clock does
  assert.equal(checkSession(db, a.hash, last + 1), null);

  // used every 20 minutes, a session lives to the last millisecond before 12 hours and no longer
  const b = await signIn(db, T0);
  let now = T0;
  while (now + 20 * MINUTE < T0 + LIFETIME) {
    now += 20 * MINUTE;
    assert.ok(checkSession(db, b.hash, now), `at ${(now - T0) / MINUTE} minutes`);
  }
  assert.ok(checkSession(db, b.hash, T0 + LIFETIME - 1));
  assert.equal(checkSession(db, b.hash, T0 + LIFETIME), null);
  assert.equal(listSessions(db, T0 + LIFETIME).length, 0);
});

test("a clock that went back: within a minute nothing changes, and beyond it the sessions seen since have ended", async () => {
  const db = fresh();
  const a = await signIn(db, T0);
  assert.ok(checkSession(db, a.hash, T0 + 10 * MINUTE));
  // Two machines that disagree by half a minute: the session is on, nothing is written, and its times do not go back.
  const seen = watch(db);
  assert.deepEqual(checkSession(db, a.hash, T0 + 10 * MINUTE - 30_000), { id: a.id, made: T0, seen: T0 + 10 * MINUTE, label: "Invented Browser, Invented OS" });
  assert.deepEqual(checkSession(db, a.hash, T0 + 9 * MINUTE), { id: a.id, made: T0, seen: T0 + 10 * MINUTE, label: "Invented Browser, Invented OS" });
  assert.deepEqual(seen.splice(0), ["read", "read"]);
  // and the half hour is counted from the later time, not from the clock that is behind
  assert.ok(checkSession(db, a.hash, T0 + 10 * MINUTE + IDLE - 1));
  // The clock goes back by more than a minute. How long ago the session was really seen cannot be told: it has ended,
  // is taken out, and does not come back when the clock catches up.
  const b = await signIn(db, T0 + 5 * 60 * MINUTE, "seen under the later clock");
  assert.equal(checkSession(db, b.hash, T0 + 5 * 60 * MINUTE - MINUTE - 1), null);
  assert.equal(checkSession(db, b.hash, T0 + 5 * 60 * MINUTE), null);
  // the same when it is the list or a new sign-in that notices
  const c = await signIn(db, T0 + 8 * 60 * MINUTE);
  assert.deepEqual(listSessions(db, T0).map((s) => s.id), []);
  assert.equal(checkSession(db, c.hash, T0 + 8 * 60 * MINUTE), null);
  const d = await signIn(db, T0 + 8 * 60 * MINUTE);
  const e = await signIn(db, T0);
  assert.equal(db.raw.prepare(`SELECT count(*) AS n FROM sessions`).get()!.n, 1);
  assert.equal(checkSession(db, d.hash, T0 + 8 * 60 * MINUTE), null);
  assert.ok(checkSession(db, e.hash, T0));
});

test("\"last seen\" is written at most once a minute, and a check that finds nothing writes nothing (LIM-1)", async () => {
  const db = fresh();
  const a = await signIn(db, T0);
  const seen = watch(db);
  const count = () => {
    const out = { read: 0, write: 0 };
    for (const what of seen.splice(0)) out[what as "read" | "write"] += 1;
    return out;
  };
  // sixty requests in the first minute: one read each, and nothing written
  for (let i = 1; i < 60; i++) assert.equal(checkSession(db, a.hash, T0 + i * 999)!.seen, T0);
  assert.deepEqual(count(), { read: 59, write: 0 });
  // at one minute it is written, once, and the next minute starts from there
  assert.equal(checkSession(db, a.hash, T0 + TOUCH)!.seen, T0 + TOUCH);
  assert.equal(checkSession(db, a.hash, T0 + TOUCH + 1)!.seen, T0 + TOUCH);
  assert.deepEqual(count(), { read: 2, write: 1 });
  // a token nobody has, a thousand times: a thousand reads and no write
  const stranger = (await hashOf(newToken()))!;
  for (let i = 0; i < 1000; i++) assert.equal(checkSession(db, stranger, T0 + TOUCH + 2), null);
  assert.deepEqual(count(), { read: 1000, write: 0 });
  // what is not even a hash is turned away without a look
  assert.equal(checkSession(db, "nonsense", T0), null);
  assert.deepEqual(count(), { read: 0, write: 0 });
});

test("an account has at most eight sessions: ended ones go first, then the ones seen longest ago", async () => {
  const db = fresh();
  const made = [];
  for (let i = 0; i < MOST; i++) made.push(await signIn(db, T0 + i * MINUTE, `device ${i}`));
  assert.equal(listSessions(db, T0 + MOST * MINUTE).length, MOST);
  // device 0 is used again, so device 1 is now the one seen longest ago
  assert.ok(checkSession(db, made[0]!.hash, T0 + 9 * MINUTE));
  const ninth = await signIn(db, T0 + 10 * MINUTE, "device 8");
  const now = T0 + 10 * MINUTE;
  assert.deepEqual(listSessions(db, now).map((s) => s.label), ["device 8", "device 0", "device 7", "device 6", "device 5", "device 4", "device 3", "device 2"]);
  assert.equal(checkSession(db, made[1]!.hash, now), null);
  assert.ok(checkSession(db, ninth.hash, now));
  // twenty-five minutes on, devices 2 to 7 have run out (not seen for 30 minutes); a new sign-in takes them out and ends nobody who is on
  const later = T0 + 38 * MINUTE;
  assert.ok(checkSession(db, made[0]!.hash, later));
  assert.ok(checkSession(db, ninth.hash, later));
  const tenth = await signIn(db, later, "device 9");
  assert.deepEqual(listSessions(db, later).map((s) => s.label).sort(), ["device 0", "device 8", "device 9"]);
  assert.equal(db.raw.prepare(`SELECT count(*) AS n FROM sessions`).get()!.n, 3);
  assert.ok(checkSession(db, tenth.hash, later));
});

test("signing in is refused, and writes nothing, for what is not an id, a hash, a label and a time, or is there already", async () => {
  const db = fresh();
  const a = await signIn(db, T0);
  const before = JSON.stringify(db.raw.prepare(`SELECT * FROM sessions`).all());
  const good = { id: newId(), hash: (await hashOf(newToken()))!, label: "x" };
  const bad: [string, unknown, number][] = [
    ["no id", { ...good, id: "" }, T0],
    ["an id that is not one", { ...good, id: "not-an-id" }, T0],
    ["a hash that is not one", { ...good, hash: "abc" }, T0],
    ["a token of another length", { ...good, hash: `${good.hash}A` }, T0],
    ["a label that is too long", { ...good, label: "x".repeat(61) }, T0],
    ["a label with a line break", { ...good, label: "one\ntwo" }, T0],
    ["a label with a control character", { ...good, label: `one${String.fromCharCode(27)}[31m` }, T0],
    ["a label with a line separator", { ...good, label: `one${String.fromCharCode(0x2028)}two` }, T0],
    ["a label that is not text", { ...good, label: 7 }, T0],
    ["no time", good, Number.NaN],
    ["a time before time", good, -1],
    ["nothing", null, T0],
    ["the id of a session that is there", { ...good, id: a.id }, T0],
    ["the hash of a session that is there", { ...good, hash: a.hash }, T0],
  ];
  for (const [what, made, now] of bad) {
    assert.equal(openSession(db, made as { id: string; hash: string; label: string }, now), false, what);
    assert.equal(JSON.stringify(db.raw.prepare(`SELECT * FROM sessions`).all()), before, what);
  }
  // labels people's devices really have are fine: other scripts, an empty one
  for (const label of ["Safari, iPhone", "微信内置浏览器，安卓", "Firefox · Linux", ""]) assert.equal(openSession(db, { id: newId(), hash: (await hashOf(newToken()))!, label }, T0), true, label);
});

test("the server can end one session or all of them, and the list shows what is on without any hash (ARCH-8)", async () => {
  const db = fresh();
  const phone = await signIn(db, T0, "phone");
  const laptop = await signIn(db, T0 + MINUTE, "laptop");
  const old = await signIn(db, T0 + 2 * MINUTE, "old tablet");
  const now = T0 + 3 * MINUTE;
  const list = listSessions(db, now);
  assert.deepEqual(list, [
    { id: old.id, made: T0 + 2 * MINUTE, seen: T0 + 2 * MINUTE, label: "old tablet" },
    { id: laptop.id, made: T0 + MINUTE, seen: T0 + MINUTE, label: "laptop" },
    { id: phone.id, made: T0, seen: T0, label: "phone" },
  ]);
  for (const s of [phone, laptop, old]) assert.ok(!JSON.stringify(list).includes(s.hash) && !JSON.stringify(list).includes(s.token));
  // the laptop signs the old tablet out: at once, and for good
  assert.equal(endSession(db, old.id), true);
  assert.equal(checkSession(db, old.hash, now), null);
  assert.equal(endSession(db, old.id), false, "there is no such session any more");
  for (const bad of ["", "nope", old.hash, null, undefined, 7]) assert.equal(endSession(db, bad), false, String(bad));
  assert.deepEqual(listSessions(db, now).map((s) => s.label), ["laptop", "phone"]);
  // "sign out everywhere else" from the laptop
  await signIn(db, now, "borrowed computer");
  assert.equal(endAllSessions(db, laptop.id), 2);
  assert.deepEqual(listSessions(db, now).map((s) => s.label), ["laptop"]);
  assert.equal(checkSession(db, phone.hash, now), null);
  assert.ok(checkSession(db, laptop.hash, now));
  // and all of them, as when the account's email address has changed: everyone signs in again
  assert.equal(endAllSessions(db), 1);
  assert.equal(endAllSessions(db), 0);
  assert.equal(checkSession(db, laptop.hash, now), null);
  assert.deepEqual(listSessions(db, now), []);
  assert.deepEqual(listSessions(db, Number.NaN), []);
});

test("signing in is whole: when the database fails half-way, the sessions that were to make room are still there", async () => {
  const db = fresh();
  const made = [];
  for (let i = 0; i < MOST; i++) made.push(await signIn(db, T0 + i, `device ${i}`));
  const before = JSON.stringify(db.raw.prepare(`SELECT * FROM sessions ORDER BY id`).all());
  const exec = db.sql.exec;
  db.sql.exec = (query, ...args) => {
    if (/^INSERT /.test(query)) throw new Error("the disk is full");
    return exec(query, ...args);
  };
  assert.throws(() => openSession(db, { id: newId(), hash: "A".repeat(43), label: "one more" }, T0 + 100), /the disk is full/);
  db.sql.exec = exec;
  assert.equal(JSON.stringify(db.raw.prepare(`SELECT * FROM sessions ORDER BY id`).all()), before);
  assert.ok(checkSession(db, made[0]!.hash, T0 + 100));
});
