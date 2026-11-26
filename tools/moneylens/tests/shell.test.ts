/**
 * The server's shell as plain functions (src/server/gate.ts, registry.ts, account.ts), on Node's
 * SQLite shaped like a Durable Object's storage (tests/sqlremote.ts). The same functions run on
 * Cloudflare's own runtime in tests/platform/server.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { newId } from "../src/core/ids";
import { ACTIONS, act, isSetUp, sessionFor, SIGN_INS_PER_HOUR, signEveryoneOut, signIn, type Answer } from "../src/server/account";
import { chunkTables, lastDay, pushChunks, startVault, type Db } from "../src/server/chunks";
import { admits, configOf, gateOf, QUOTA_BOUNDS, type Config, type Settings } from "../src/server/gate";
import { countAccounts, forgetAccount, noteAccount, registryTables } from "../src/server/registry";
import { labelOf } from "../src/server/request";
import { hashOf, newToken } from "../src/server/sessions";
import { packPush, unpackPulled, unpackPushed } from "../src/server/wire";
import { LIMITS } from "../src/vault/sync";
import { sqlite } from "./sqlremote";

const ORIGIN = "https://money.changle.test";
const [A, B] = ["uaaaaaa1", "ubbbbbb2"];
const T0 = Date.UTC(2026, 10, 25, 20, 0, 0);
const MINUTE = 60_000;
const config = (settings: Settings = {}): Config => configOf({ ORIGIN, GATE: "owner", ...settings })!;
const tables = (db: Db & { raw: { prepare(sql: string): { all(): unknown[] } } }): number => db.raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().length;
const json = (text: string): Uint8Array => new TextEncoder().encode(text);
const blob = (fill: number, length = 64): Uint8Array => new Uint8Array(length).fill(fill);

/** Signs a device in, as the Worker does once a code has been traded. */
async function enter(db: Db, account: string, now: number, cfg: Config, owner = true): Promise<{ token: string; hash: string; session: string; said: string }> {
  const token = newToken();
  const hash = (await hashOf(token))!;
  const session = newId();
  return { token, hash, session, said: signIn(db, { account, session, hash, label: "Chrome on Windows", owner }, now, cfg.gate) };
}
const ask = (db: Db, account: string, hash: string, action: string, now: number, cfg: Config, body: Uint8Array = new Uint8Array(0)): Answer => act(db, { account, hash, action, body }, now, cfg);
const why = (answer: Answer): [number, unknown] => [answer.status, answer.json?.why];

test("the gate: closed unless it is set open, and to whom", () => {
  assert.deepEqual(gateOf({}), { mode: "closed" });
  for (const GATE of ["closed", "open", "Owner", "OWNER", "", " owner", 1, true, null, ["owner"]]) assert.deepEqual(gateOf({ GATE }), { mode: "closed" });
  assert.deepEqual(gateOf({ GATE: "owner", ALLOWED_ACCOUNTS: A }), { mode: "owner" });
  // a list: ids apart by commas, spaces or lines; what is not an account's id is left out; no list is an empty list
  assert.deepEqual(gateOf({ GATE: "list", ALLOWED_ACCOUNTS: ` ${A},${B}\n  ucccccc3 ,, not-an-id, U1234567, u12 ` }), { mode: "list", accounts: new Set([A, B, "ucccccc3"]) });
  assert.deepEqual(gateOf({ GATE: "list" }), { mode: "list", accounts: new Set() });
  assert.deepEqual(gateOf({ GATE: "list", ALLOWED_ACCOUNTS: 7 }), { mode: "list", accounts: new Set() });
  const many = gateOf({ GATE: "list", ALLOWED_ACCOUNTS: Array.from({ length: 300 }, (_, i) => `u${String(i).padStart(6, "0")}`).join(",") });
  assert.ok(many.mode === "list" && many.accounts.size === 200);

  // who is let in
  assert.equal(admits({ mode: "closed" }, A, true), false);
  assert.deepEqual([admits({ mode: "owner" }, A, true), admits({ mode: "owner" }, A, false)], [true, false]);
  const list = gateOf({ GATE: "list", ALLOWED_ACCOUNTS: A });
  // (with a list, the list is all that counts: the owner is on it or is not let in)
  assert.deepEqual([admits(list, A, false), admits(list, A, true), admits(list, B, true), admits(list, B, false)], [true, true, false, false]);
});

test("the settings: an origin or nothing, and quotas within bounds", () => {
  for (const bad of [undefined, "", "http://money.changle.test", "https://money.changle.test/", "https://money.changle.test/app", "https://MONEY.changle.test", "money.changle.test", "https://a b", 5]) assert.equal(configOf({ ORIGIN: bad, GATE: "owner" }), null);
  const plain = configOf({ ORIGIN })!;
  assert.deepEqual(plain, { origin: ORIGIN, home: "https://changle.ca", gate: { mode: "closed" }, limits: LIMITS });
  assert.equal(configOf({ ORIGIN: "https://127.0.0.1:8795" })!.origin, "https://127.0.0.1:8795");
  assert.equal(configOf({ ORIGIN, MAIN_SITE: "https://main.changle.test" })!.home, "https://main.changle.test");
  assert.equal(configOf({ ORIGIN, MAIN_SITE: "http://main.changle.test" })!.home, "https://changle.ca");
  // quotas: text or a number, a whole number within the bounds, or else the default
  const quota = (bytes: unknown, writes: unknown): number[] => {
    const { limits } = configOf({ ORIGIN, QUOTA_VAULT_BYTES: bytes, QUOTA_WRITES_PER_DAY: writes })!;
    return [limits.vaultBytes, limits.writesPerDay];
  };
  assert.deepEqual(quota("20971520", "500"), [20971520, 500]);
  assert.deepEqual(quota(20971520, 500), [20971520, 500]);
  assert.deepEqual(quota(QUOTA_BOUNDS.vaultBytes[0], QUOTA_BOUNDS.writesPerDay[0]), [1024 * 1024, 10]);
  assert.deepEqual(quota(QUOTA_BOUNDS.vaultBytes[1], QUOTA_BOUNDS.writesPerDay[1]), [100 * 1024 * 1024, 5000]);
  for (const [bytes, writes] of [[QUOTA_BOUNDS.vaultBytes[0] - 1, 9], [QUOTA_BOUNDS.vaultBytes[1] + 1, 5001], ["1e7", "3e2"], ["-5", "-5"], ["12.5", "12.5"], [" 20971520", "500 "], ["", ""], [null, undefined], [NaN, Infinity], ["0x100000", "１２３"]]) assert.deepEqual(quota(bytes, writes), [LIMITS.vaultBytes, LIMITS.writesPerDay], `${String(bytes)} ${String(writes)}`);
  // every other limit is the code's own
  assert.deepEqual({ ...configOf({ ORIGIN, QUOTA_VAULT_BYTES: "20971520" })!.limits, vaultBytes: 0 }, { ...LIMITS, vaultBytes: 0 });
});

test("a device's label is made of known words only", () => {
  const label = (ua: unknown): string => labelOf(ua);
  assert.equal(label("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"), "Chrome on Windows");
  assert.equal(label("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0"), "Edge on Windows");
  assert.equal(label("Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
  assert.equal(label("Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1"), "Chrome on iPhone");
  assert.equal(label("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15"), "Safari on Mac");
  assert.equal(label("Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0"), "Firefox on Linux");
  assert.equal(label("Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36"), "Chrome on Android");
  assert.equal(label("curl/8.5.0"), "Browser");
  assert.equal(label("Chrome/1"), "Chrome");
  assert.equal(label("(Windows)"), "Windows");
  // nothing of the request's own text goes into a label, whatever it says
  for (const odd of [undefined, null, 7, "", "<script>alert(1)</script>", "A SAMPLE's phone ", "x".repeat(5000)]) assert.equal(label(odd), "Browser");
  assert.equal(label(`<b>${"y".repeat(600)} Chrome/1 Windows`), "Browser");
});

test("the registry notes each account once", () => {
  const db = sqlite();
  registryTables(db);
  assert.equal(countAccounts(db), 0);
  assert.deepEqual([noteAccount(db, A, T0), noteAccount(db, B, T0 + 5), noteAccount(db, A, T0 + 9)], [true, true, true]);
  assert.equal(countAccounts(db), 2);
  // the day an account first signed in stays that day
  assert.deepEqual(db.raw.prepare(`SELECT id, first FROM accounts ORDER BY id`).all().map((row) => ({ ...(row as object) })), [{ id: A, first: T0 }, { id: B, first: T0 + 5 }]);
  for (const odd of ["", "A", "u12", "not an id", 5, null, undefined, `${A}'--`]) assert.equal(noteAccount(db, odd, T0), false);
  for (const when of [-1, 1.5, NaN, Infinity]) assert.equal(noteAccount(db, "uddddddd4", when), false);
  assert.equal(countAccounts(db), 2);
  forgetAccount(db, A);
  forgetAccount(db, "uzzzzzz9");
  forgetAccount(db, 7);
  assert.equal(countAccounts(db), 1);
});

test("signing in: the gate is asked, and whoever is not let in leaves nothing behind", async () => {
  // closed: nobody, the owner included
  const shut = sqlite();
  assert.equal((await enter(shut, A, T0, config({ GATE: "closed" }))).said, "not-admitted");
  assert.deepEqual([isSetUp(shut), tables(shut)], [false, 0]);
  // open to the owner: the account the accounts service calls the owner's, and no other
  const db = sqlite();
  assert.equal((await enter(db, B, T0, config(), false)).said, "not-admitted");
  assert.equal(tables(db), 0);
  const first = await enter(db, A, T0, config());
  assert.equal(first.said, "ok");
  assert.ok(isSetUp(db));
  // a database is one account's: another account's sign-in is refused there, whoever it is
  assert.equal((await enter(db, B, T0, config())).said, "refused");
  assert.equal((await enter(db, B, T0, config({ GATE: "list", ALLOWED_ACCOUNTS: B }), false)).said, "refused");
  // open to a list: the accounts on it
  const listed = config({ GATE: "list", ALLOWED_ACCOUNTS: B });
  const other = sqlite();
  assert.equal((await enter(other, A, T0, listed)).said, "not-admitted");
  assert.equal(tables(other), 0);
  assert.equal((await enter(other, B, T0, listed, false)).said, "ok");
  // what is handed over has to be an account, a session id, a hash and a label
  const blank = sqlite();
  const hash = (await hashOf(newToken()))!;
  for (const made of [
    { account: "not an id", session: newId(), hash, label: "x", owner: true },
    { account: A, session: "short", hash, label: "x", owner: true },
    { account: A, session: newId(), hash: "nope", label: "x", owner: true },
    { account: A, session: newId(), hash, label: "x\ny", owner: true },
    { account: A, session: newId(), hash, label: "x", owner: "yes" as unknown as boolean },
  ])
    assert.equal(signIn(blank, made, T0, config().gate), "refused");
  for (const when of [-1, 1.5, NaN]) assert.equal(signIn(blank, { account: A, session: newId(), hash, label: "x", owner: true }, when, config().gate), "refused");
  // (an account that was let in and then handed a bad session has its tables and no session)
  assert.equal(why(ask(blank, A, hash, "sessions", T0, config()))[0], 401);
});

test("signing in: a dozen an hour for one account, and the owner's mark is the latest sign-in's", async () => {
  const db = sqlite();
  const cfg = config();
  for (let i = 0; i < SIGN_INS_PER_HOUR; i++) assert.equal((await enter(db, A, T0 + i * MINUTE, cfg)).said, "ok");
  assert.equal((await enter(db, A, T0 + 30 * MINUTE, cfg)).said, "too-many");
  assert.equal((await enter(db, A, T0 + 60 * MINUTE - 1, cfg)).said, "too-many");
  // an hour after the first of them, there is room for one again
  const later = await enter(db, A, T0 + 60 * MINUTE, cfg);
  assert.equal(later.said, "ok");
  assert.equal((await enter(db, A, T0 + 60 * MINUTE + 1, cfg)).said, "too-many");
  // a clock set back does not make room
  assert.equal((await enter(db, A, T0 - 24 * 60 * MINUTE, cfg)).said, "too-many");
  // being refused for that ends no session and writes nothing
  assert.equal(why(ask(db, A, later.hash, "sessions", T0 + 61 * MINUTE, cfg))[0], 200);

  // The owner's mark: an account let in from the list, later found to be the owner's, and then not.
  const listed = config({ GATE: "list", ALLOWED_ACCOUNTS: B });
  const mine = sqlite();
  const asMember = await enter(mine, B, T0, listed, false);
  assert.equal(asMember.said, "ok");
  // with the gate turned to the owner alone, a session opened by someone the accounts service did not call the owner gets nothing
  assert.deepEqual(why(ask(mine, B, asMember.hash, "sessions", T0 + 1, config())), [403, "not-admitted"]);
  const asOwner = await enter(mine, B, T0 + 2, config(), true);
  assert.equal(why(ask(mine, B, asOwner.hash, "sessions", T0 + 3, config()))[0], 200);
  assert.equal(why(ask(mine, B, asMember.hash, "sessions", T0 + 3, config()))[0], 200);
  await enter(mine, B, T0 + 4, listed, false);
  assert.deepEqual(why(ask(mine, B, asOwner.hash, "sessions", T0 + 5, config())), [403, "not-admitted"]);
});

test("a request gets what its own session allows, in its own database, and nothing else (T-1, T-3, T-23)", async () => {
  const cfg = config({ GATE: "list", ALLOWED_ACCOUNTS: `${A},${B}` });
  const [dbA, dbB] = [sqlite(), sqlite()];
  const a = await enter(dbA, A, T0, cfg, false);
  const b = await enter(dbB, B, T0, cfg, false);
  const now = T0 + MINUTE;
  for (const action of ACTIONS) {
    // nobody ever signed in here: nothing, and no table is made
    const empty = sqlite();
    assert.deepEqual(why(ask(empty, A, a.hash, action, now, cfg)), [401, "signed-out"], action);
    assert.equal(tables(empty), 0);
    // another person's token in this database; this person's token in another's; a token that is none; the right token under another's name
    assert.deepEqual(why(ask(dbA, A, b.hash, action, now, cfg)), [401, "signed-out"], action);
    assert.deepEqual(why(ask(dbB, B, a.hash, action, now, cfg)), [401, "signed-out"], action);
    assert.deepEqual(why(ask(dbA, A, "x", action, now, cfg)), [401, "signed-out"], action);
    assert.deepEqual(why(ask(dbA, B, a.hash, action, now, cfg)), [401, "signed-out"], action);
    // the gate shut, or open to others
    assert.deepEqual(why(ask(dbA, A, a.hash, action, now, config({ GATE: "closed" }))), [403, "closed"], action);
    assert.deepEqual(why(ask(dbA, A, a.hash, action, now, config({ GATE: "list", ALLOWED_ACCOUNTS: B }))), [403, "not-admitted"], action);
    assert.deepEqual(why(ask(dbA, A, a.hash, action, now, config())), [403, "not-admitted"], action);
    // a time that is no time
    assert.deepEqual(why(ask(dbA, A, a.hash, action, NaN, cfg)), [500, "unavailable"], action);
  }
  // every refusal for want of a session says to clear the cookie
  assert.equal(ask(dbA, A, b.hash, "sessions", now, cfg).signedOut, true);
  assert.equal(ask(dbA, A, a.hash, "sessions", now, config()).signedOut, true);
  // what is not one of the things to ask for
  for (const action of ["", "session", "sync", "sync/pull/", "admin", "../sessions", "SESSIONS"]) assert.deepEqual(why(ask(dbA, A, a.hash, action, now, cfg)), [404, "no-such-thing"], action);
  // a session that ran out: thirty minutes unused
  assert.deepEqual(why(ask(dbA, A, a.hash, "sessions", T0 + 31 * MINUTE, cfg)), [401, "signed-out"]);
  assert.deepEqual(why(ask(dbA, A, a.hash, "sessions", now, cfg)), [401, "signed-out"]);
  // the check before a body is read answers as `act` does, and for a good session gives the session
  const fresh = await enter(dbA, A, now, cfg, false);
  const found = sessionFor(dbA, { account: A, hash: fresh.hash }, now, cfg.gate);
  assert.ok(!("status" in found) && found.id === fresh.session);
  assert.deepEqual(why(sessionFor(dbA, { account: A, hash: b.hash }, now, cfg.gate) as Answer), [401, "signed-out"]);
});

test("sessions: the list, signing out here, there and everywhere else", async () => {
  const cfg = config();
  const db = sqlite();
  const one = await enter(db, A, T0, cfg);
  const two = await enter(db, A, T0 + 1000, cfg);
  const three = await enter(db, A, T0 + 2000, cfg);
  const now = T0 + 5000;
  const listed = ask(db, A, two.hash, "sessions", now, cfg);
  assert.deepEqual(listed.json, {
    ok: true,
    sessions: [
      { id: three.session, made: T0 + 2000, seen: T0 + 2000, label: "Chrome on Windows", here: false },
      { id: two.session, made: T0 + 1000, seen: T0 + 1000, label: "Chrome on Windows", here: true },
      { id: one.session, made: T0, seen: T0, label: "Chrome on Windows", here: false },
    ],
  });
  // one device signs another out
  assert.deepEqual(ask(db, A, two.hash, "sessions/end", now, cfg, json(JSON.stringify({ id: one.session }))), { status: 200, json: { ok: true, ended: 1 } });
  assert.deepEqual(why(ask(db, A, one.hash, "sessions", now, cfg)), [401, "signed-out"]);
  // a session that is not there, an id that is none, no body, a body that is not JSON
  for (const body of [JSON.stringify({ id: one.session }), JSON.stringify({ id: newId() }), JSON.stringify({ id: 5 }), JSON.stringify({}), "", "{", "[]", JSON.stringify({ others: "yes" }), `{"id":"${"x".repeat(5000)}"}`, `{"others":true,"pad":"${"x".repeat(5000)}"}`]) assert.deepEqual(why(ask(db, A, two.hash, "sessions/end", now, cfg, json(body))), [404, "no-session"], body);
  // everywhere else: this one stays
  assert.deepEqual(ask(db, A, two.hash, "sessions/end", now, cfg, json(`{"others":true}`)), { status: 200, json: { ok: true, ended: 1 } });
  assert.deepEqual(ask(db, A, two.hash, "sessions/end", now, cfg, json(`{"others":true}`)), { status: 200, json: { ok: true, ended: 0 } });
  assert.deepEqual(why(ask(db, A, three.hash, "sessions", now, cfg)), [401, "signed-out"]);
  // signing itself out by its id clears its cookie, as signing out does
  const four = await enter(db, A, now, cfg);
  assert.deepEqual(ask(db, A, four.hash, "sessions/end", now, cfg, json(JSON.stringify({ id: four.session }))), { status: 200, json: { ok: true, ended: 1 }, signedOut: true });
  assert.deepEqual(ask(db, A, two.hash, "session/end", now, cfg), { status: 200, json: { ok: true }, signedOut: true });
  assert.deepEqual(why(ask(db, A, two.hash, "sessions", now, cfg)), [401, "signed-out"]);

  // what happened, newest first, with nothing but the kind, the time, and whether it was this session
  const last = await enter(db, A, now + 1, cfg);
  assert.deepEqual(ask(db, A, last.hash, "events", now + 2, cfg).json, {
    ok: true,
    events: [
      { at: now + 1, kind: "sign-in", here: true },
      { at: now, kind: "sign-out", here: false },
      { at: now, kind: "session-ended", here: false },
      { at: now, kind: "sign-in", here: false },
      { at: now, kind: "sessions-ended", here: false },
      { at: now, kind: "session-ended", here: false },
      { at: T0 + 2000, kind: "sign-in", here: false },
      { at: T0 + 1000, kind: "sign-in", here: false },
      { at: T0, kind: "sign-in", here: false },
    ],
  });
  // the email address changed: everyone signs in again, and it is noted once
  signEveryoneOut(db, now + 3);
  signEveryoneOut(db, now + 4);
  assert.deepEqual(why(ask(db, A, last.hash, "sessions", now + 5, cfg)), [401, "signed-out"]);
  const again = await enter(db, A, now + 6, cfg);
  assert.deepEqual((ask(db, A, again.hash, "events", now + 7, cfg).json!.events as { kind: string }[]).slice(0, 3).map((e) => e.kind), ["sign-in", "email-changed", "sign-in"]);
  // where nobody ever signed in, there is nothing to do and nothing is made
  const empty = sqlite();
  signEveryoneOut(empty, now);
  assert.equal(tables(empty), 0);
});

test("the events log keeps twelve months and five hundred lines", async () => {
  const cfg = config();
  const db = sqlite();
  const DAY = 24 * 60 * MINUTE;
  await enter(db, A, T0, cfg);
  const fill = (from: number, lines: number): void => {
    const insert = db.raw.prepare(`INSERT INTO events (at, kind, session) VALUES (?, 'sign-out', NULL)`);
    for (let i = 1; i <= lines; i++) insert.run(from + i);
  };
  fill(T0, 700);
  const count = (): number => Number((db.raw.prepare(`SELECT COUNT(*) AS n FROM events`).all()[0] as { n: number }).n);
  assert.equal(count(), 701);
  // the next sign-in keeps the newest five hundred
  await enter(db, A, T0 + DAY, cfg);
  assert.equal(count(), 500);
  // and one more than twelve months later keeps nothing older than that
  const later = await enter(db, A, T0 + 368 * DAY, cfg);
  assert.equal(count(), 1);
  // what is shown is the newest fifty
  fill(T0 + 368 * DAY, 80);
  const shown = ask(db, A, later.hash, "events", T0 + 368 * DAY + 1, cfg).json!.events as { at: number }[];
  assert.deepEqual([shown.length, shown[0]!.at, shown[49]!.at], [50, T0 + 368 * DAY + 80, T0 + 368 * DAY + 31]);
});

test("the vault and its chunks: started once, and synced through the frames", async () => {
  const cfg = config({ QUOTA_WRITES_PER_DAY: "10" });
  const db = sqlite();
  const me = await enter(db, A, T0, cfg);
  const now = T0 + 1000;
  const [vault, other] = [newId(), newId()];
  assert.deepEqual(ask(db, A, me.hash, "vault", now, cfg).json, { ok: true, vault: null, limits: { vaultBytes: LIMITS.vaultBytes, writesPerDay: 10 } });
  for (const body of ["", "{}", "[]", `{"vault":5}`, `{"vault":"short"}`]) assert.deepEqual(why(ask(db, A, me.hash, "vault/start", now, cfg, json(body))), [400, "bad-request"], body);
  assert.deepEqual(ask(db, A, me.hash, "vault/start", now, cfg, json(JSON.stringify({ vault }))), { status: 200, json: { ok: true, vault } });
  // the same vault again is the same answer; another is not taken (replacing a vault is a reset, and not done here)
  assert.deepEqual(ask(db, A, me.hash, "vault/start", now, cfg, json(JSON.stringify({ vault }))), { status: 200, json: { ok: true, vault } });
  assert.deepEqual(why(ask(db, A, me.hash, "vault/start", now, cfg, json(JSON.stringify({ vault: other })))), [409, "another-vault"]);
  assert.deepEqual(why(ask(db, A, me.hash, "vault/start", now, cfg, json("{}"))), [400, "bad-request"]);
  assert.equal(ask(db, A, me.hash, "vault", now, cfg).json!.vault, vault);
  // started once, noted once
  assert.equal((ask(db, A, me.hash, "events", now, cfg).json!.events as { kind: string }[]).filter((e) => e.kind === "vault-started").length, 1);

  // a push and a pull, as frames
  const [c1, c2] = [newId(), newId()];
  const pushed = ask(db, A, me.hash, "sync/push", now, cfg, packPush(vault, [{ id: c1, base: 0, blob: blob(1) }, { id: c2, base: 0, blob: blob(2, 200) }]));
  assert.deepEqual([pushed.status, unpackPushed(pushed.bytes!)], [200, { ok: true, versions: [{ id: c1, version: 1 }, { id: c2, version: 2 }] }]);
  const pulled = ask(db, A, me.hash, "sync/pull", now, cfg, json(JSON.stringify({ vault, since: 0 })));
  const page = unpackPulled(pulled.bytes!);
  assert.ok(page?.ok);
  assert.deepEqual(page.chunks, [{ id: c1, version: 1, blob: blob(1) }, { id: c2, version: 2, blob: blob(2, 200) }]);
  assert.deepEqual([page.cursor, page.more], [2, false]);
  // the refusals of the store come back as its own words, in a frame
  assert.deepEqual(unpackPulled(ask(db, A, me.hash, "sync/pull", now, cfg, json(JSON.stringify({ vault: other, since: 0 }))).bytes!), { ok: false, why: "wrong-vault" });
  assert.deepEqual(unpackPulled(ask(db, A, me.hash, "sync/pull", now, cfg, json(JSON.stringify({ vault, since: -1 }))).bytes!), { ok: false, why: "bad-request" });
  assert.deepEqual(unpackPushed(ask(db, A, me.hash, "sync/push", now, cfg, packPush(other, [{ id: c1, base: 0, blob: blob(1) }])).bytes!), { ok: false, why: "wrong-vault" });
  const stale = unpackPushed(ask(db, A, me.hash, "sync/push", now, cfg, packPush(vault, [{ id: c1, base: 0, blob: blob(3) }])).bytes!);
  assert.deepEqual(stale, { ok: false, why: "stale", chunks: [{ id: c1, version: 1, blob: blob(1) }] });
  // what is no frame, and no JSON, is refused before the store sees it
  for (const body of [new Uint8Array(0), json("{}"), packPush(vault, []).subarray(0, 5)]) assert.deepEqual(why(ask(db, A, me.hash, "sync/push", now, cfg, body)), [400, "bad-request"]);
  for (const body of ["", "nope", "[]"]) assert.deepEqual(why(ask(db, A, me.hash, "sync/pull", now, cfg, json(body))), [400, "bad-request"]);

  // The day's writes (T-14): ten here, two used. The day is the server's, and a clock set back is not another day.
  const eight = Array.from({ length: 8 }, (_, i) => ({ id: newId(), base: 0, blob: blob(10 + i) }));
  assert.equal(unpackPushed(ask(db, A, me.hash, "sync/push", now, cfg, packPush(vault, eight)).bytes!)!.ok, true);
  const more = (when: number): unknown => unpackPushed(ask(db, A, me.hash, "sync/push", when, cfg, packPush(vault, [{ id: newId(), base: 0, blob: blob(99) }])).bytes!);
  assert.deepEqual(more(now + 1), { ok: false, why: "quota-writes" });
  const yesterday = now - 24 * 60 * MINUTE;
  const back = await enter(db, A, yesterday, cfg);
  assert.deepEqual(unpackPushed(ask(db, A, back.hash, "sync/push", yesterday + 1, cfg, packPush(vault, [{ id: newId(), base: 0, blob: blob(98) }])).bytes!), { ok: false, why: "quota-writes" });
  assert.equal(lastDay(db), "2026-11-25");
  // the next day there is room again
  const tomorrow = now + 24 * 60 * MINUTE;
  const next = await enter(db, A, tomorrow, cfg);
  assert.equal((unpackPushed(ask(db, A, next.hash, "sync/push", tomorrow + 1, cfg, packPush(vault, [{ id: newId(), base: 0, blob: blob(97) }])).bytes!) as { ok: boolean }).ok, true);
  assert.equal(lastDay(db), "2026-11-26");
});

test("a vault's row that holds nonsense is an error, and nothing is done on it", () => {
  const db = sqlite();
  chunkTables(db);
  const vault = newId();
  assert.equal(lastDay(db), "");
  startVault(db, vault);
  const write = [{ id: newId(), base: 0, blob: blob(1) }];
  for (const damage of [`seq = 'many'`, `seq = -1`, `seq = 1.5`, `written = 'none'`, `written = -3`, `day = 'today'`, `day = 20261125`]) {
    db.raw.exec(`UPDATE vault SET seq = 0, written = 0, day = '', id = '${vault}'`);
    db.raw.exec(`UPDATE vault SET ${damage}`);
    assert.throws(() => pushChunks(db, vault, write, LIMITS, "2026-11-25"), /vault row/, damage);
    assert.throws(() => lastDay(db), /vault row/, damage);
    assert.equal(db.raw.prepare(`SELECT COUNT(*) AS n FROM chunks`).all().length && Number((db.raw.prepare(`SELECT COUNT(*) AS n FROM chunks`).all()[0] as { n: number }).n), 0, damage);
  }
  // version numbers that would pass what can be counted with: no writing
  db.raw.exec(`UPDATE vault SET seq = ${Number.MAX_SAFE_INTEGER}, written = 0, day = '', id = '${vault}'`);
  assert.throws(() => pushChunks(db, vault, write, LIMITS, "2026-11-25"), /version count/);
  assert.equal(Number((db.raw.prepare(`SELECT COUNT(*) AS n FROM chunks`).all()[0] as { n: number }).n), 0);
  db.raw.exec(`UPDATE vault SET seq = ${Number.MAX_SAFE_INTEGER - 1}`);
  assert.deepEqual(pushChunks(db, vault, write, LIMITS, "2026-11-25"), { ok: true, versions: [{ id: write[0]!.id, version: Number.MAX_SAFE_INTEGER }] });
});
