/** C8 independent review. Invented labels/accounts; credentials exist only during a test.
 * Uses Node 22's original synchronous SQLite API, with no shared buffers or newer options.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { newId } from "../src/core/ids";
import type { Db } from "../src/server/chunks";
import { checkSession, endAllSessions, endSession, hashOf, listSessions, newToken, openSession, sessionTables } from "../src/server/sessions";
import { NONCE_COOKIE, SESSION_COOKIE, fromOurOrigin, noCookie, nonceCookie, readNonce, readSession, sessionCookie } from "../src/server/request";

const T = 1_800_000_000_000;
const MINUTE = 60_000;
const HALF_HOUR = 30 * MINUTE;
const TWELVE_HOURS = 12 * 60 * MINUTE;
const ORIGIN = "https://money.changle.ca";
const ACCOUNT = "uinvented01";

function database() {
  const raw = new DatabaseSync(":memory:");
  const writes: string[] = [];
  let failAfter = 0;
  const db: Db = {
    sql: { exec(query, ...args) {
      const out = raw.prepare(query).all(...args.map(x => x instanceof ArrayBuffer ? new Uint8Array(x) : x));
      if (/^(INSERT|UPDATE|DELETE)\b/.test(query)) {
        writes.push(query);
        if (failAfter && --failAfter === 0) throw new Error("injected after write");
      }
      return { toArray: () => out.map(row => ({ ...row })) };
    } },
    atomically<T>(work: () => T): T {
      raw.exec("BEGIN IMMEDIATE");
      try { const out = work(); raw.exec("COMMIT"); return out; }
      catch (error) { raw.exec("ROLLBACK"); throw error; }
    },
  };
  sessionTables(db);
  return { db, raw, writes, fail(n: number) { failAfter = n; },
    snapshot: () => JSON.stringify(raw.prepare("SELECT * FROM sessions ORDER BY id").all()) };
}
async function credential() {
  const token = newToken();
  const hash = await hashOf(token);
  assert.ok(hash);
  return { id: newId(), token, hash, label: "Invented device" };
}

test("C8: cookie-to-hash-to-account check rejects database hashes, ids and crossed accounts", async () => {
  const a = database(), b = database();
  try {
    const c = await credential(), d = await credential();
    assert.ok(openSession(a.db, c, T));
    assert.ok(openSession(b.db, d, T));
    assert.equal(c.hash === createHash("sha256").update(c.token).digest("base64url"), true);
    const header = sessionCookie(ACCOUNT, c.token)!.split(";")[0]!;
    const parsed = readSession(header)!;
    assert.equal(parsed.account, ACCOUNT);
    assert.ok(checkSession(a.db, await hashOf(parsed.token), T));
    for (const candidate of [c.hash, c.id, d.token, newToken()]) {
      assert.equal(checkSession(a.db, await hashOf(candidate), T), null);
    }
    assert.equal(checkSession(b.db, await hashOf(parsed.token), T), null);
    const shown = listSessions(a.db, T);
    assert.deepEqual(Object.keys(shown[0]!).sort(), ["id", "label", "made", "seen"]);
    assert.equal(a.snapshot().includes(c.token), false);
    shown[0]!.seen = T + TWELVE_HOURS;
    assert.equal(checkSession(a.db, c.hash, T)!.seen, T, "returned objects do not own database state");
  } finally { a.raw.close(); b.raw.close(); }
});

test("C8: millisecond boundaries, throttled idle deadline and permanent expiry under clock reversal", async () => {
  const a = database();
  try {
    for (const offset of [0, Number.MAX_SAFE_INTEGER - TWELVE_HOURS]) {
      const c = await credential();
      assert.ok(openSession(a.db, c, offset));
      a.writes.length = 0;
      assert.ok(checkSession(a.db, c.hash, offset + MINUTE - 1));
      assert.equal(a.writes.length, 0);
      assert.equal(checkSession(a.db, c.hash, offset + MINUTE)!.seen, offset + MINUTE);
      assert.equal(a.writes.length, 1);
      assert.ok(checkSession(a.db, c.hash, offset + MINUTE + 59_999));
      assert.equal(a.writes.length, 1);
      // Last request was 59,999ms after the last persisted touch: idle ends early as documented.
      assert.equal(checkSession(a.db, c.hash, offset + MINUTE + HALF_HOUR), null);
      assert.equal(checkSession(a.db, c.hash, offset + MINUTE), null);
    }
    const c = await credential();
    assert.ok(openSession(a.db, c, T));
    for (let dt = HALF_HOUR - 1; dt < TWELVE_HOURS; dt += HALF_HOUR - 1) assert.ok(checkSession(a.db, c.hash, T + dt));
    assert.ok(checkSession(a.db, c.hash, T + TWELVE_HOURS - 1));
    assert.equal(checkSession(a.db, c.hash, T + TWELVE_HOURS), null);
    assert.equal(checkSession(a.db, c.hash, T), null);
    const d = await credential();
    assert.ok(openSession(a.db, d, T));
    assert.ok(checkSession(a.db, d.hash, T - MINUTE));
    assert.equal(checkSession(a.db, d.hash, T - MINUTE - 1), null);
    assert.equal(checkSession(a.db, d.hash, T), null);
  } finally { a.raw.close(); }
});

test("C8: wrong and malformed credentials cannot write, refresh, or evict a full account", async () => {
  const a = database();
  try {
    const credentials = await Promise.all(Array.from({ length: 8 }, credential));
    for (const c of credentials) assert.ok(openSession(a.db, c, T));
    const before = a.snapshot();
    a.writes.length = 0;
    const unknown = (await credential()).hash;
    for (let i = 0; i < 500; i++) assert.equal(checkSession(a.db, unknown, T + HALF_HOUR), null);
    for (const now of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(checkSession(a.db, credentials[0]!.hash, now), null);
      assert.deepEqual(listSessions(a.db, now), []);
    }
    const other = await credential();
    for (const c of [{ ...other, id: credentials[0]!.id }, { ...other, hash: credentials[0]!.hash }, { ...other, label: "bad\nlabel" }]) {
      assert.equal(openSession(a.db, c, T + HALF_HOUR), false);
    }
    assert.equal(a.snapshot(), before);
    assert.equal(a.writes.length, 0);
    assert.equal(endAllSessions(a.db, credentials[3]!.id), 7);
    for (let i = 0; i < 8; i++) assert.equal(Boolean(checkSession(a.db, credentials[i]!.hash, T)), i === 3);
    assert.equal(endSession(a.db, credentials[3]!.id), true);
    assert.equal(endSession(a.db, credentials[3]!.id), false);
    assert.equal(checkSession(a.db, credentials[3]!.hash, T), null);
  } finally { a.raw.close(); }
});

test("C8: rollback at every write in eviction, expiry cleanup and bulk revocation", async () => {
  const credentials = await Promise.all(Array.from({ length: 9 }, credential));
  for (const operation of ["open", "list", "endAll"] as const) {
    // open deletes eight expired rows then inserts; others delete eight rows.
    for (let cut = 1; cut <= (operation === "open" ? 9 : 8); cut++) {
      const a = database();
      try {
        for (const c of credentials.slice(0, 8)) assert.ok(openSession(a.db, c, T));
        const before = a.snapshot();
        a.fail(cut);
        assert.throws(() => operation === "open" ? openSession(a.db, credentials[8]!, T + HALF_HOUR)
          : operation === "list" ? listSessions(a.db, T + HALF_HOUR) : endAllSessions(a.db), /injected after write/);
        assert.equal(a.snapshot(), before, `${operation} cut ${cut}`);
        a.fail(0);
        assert.equal(listSessions(a.db, T).length, 8);
      } finally { a.raw.close(); }
    }
  }
  const a = database();
  try {
    for (const c of credentials.slice(0, 8)) assert.ok(openSession(a.db, c, T));
    const before = a.snapshot();
    a.fail(2); // delete a still-live least-recent session, then fail after insert
    assert.throws(() => openSession(a.db, credentials[8]!, T + 1), /injected after write/);
    assert.equal(a.snapshot(), before);
  } finally { a.raw.close(); }
});

test("C8: 3000 deterministic mixed operations agree with a separate session ledger", async () => {
  const a = database();
  type Entry = { id: string; hash: string; label: string; made: number; seen: number };
  const pool = await Promise.all(Array.from({ length: 24 }, credential));
  const ledger = new Map<string, Entry>();
  let seed = 0x8c08;
  const pick = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  let now = T;
  const active = (e: Entry) => now >= e.seen - MINUTE && now < Math.min(e.seen + HALF_HOUR, e.made + TWELVE_HOURS);
  const order = (x: Entry, y: Entry) => x.seen - y.seen || x.made - y.made || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  const visible = ({ id, label, made, seen }: Entry) => ({ id, label, made, seen });
  try {
    for (let step = 0; step < 3000; step++) {
      const c = pool[pick(pool.length)]!;
      const op = pick(9);
      if (op < 3) {
        const allowed = !ledger.has(c.id);
        assert.equal(openSession(a.db, c, now), allowed, `open ${step}`);
        if (allowed) {
          for (const e of ledger.values()) if (!active(e)) ledger.delete(e.id);
          const sorted = [...ledger.values()].sort(order);
          while (sorted.length >= 8) ledger.delete(sorted.shift()!.id);
          ledger.set(c.id, { id: c.id, hash: c.hash, label: c.label, made: now, seen: now });
        }
      } else if (op < 5) {
        const e = ledger.get(c.id);
        let expected = null;
        if (e && !active(e)) ledger.delete(c.id);
        else if (e) { if (now >= e.seen + MINUTE) e.seen = now; expected = visible(e); }
        assert.deepEqual(checkSession(a.db, c.hash, now), expected, `check ${step}`);
      } else if (op === 5) {
        for (const e of ledger.values()) if (!active(e)) ledger.delete(e.id);
        const expected = [...ledger.values()].sort((x, y) => y.seen - x.seen || y.made - x.made || (x.id < y.id ? -1 : 1)).map(visible);
        assert.deepEqual(listSessions(a.db, now), expected, `list ${step}`);
      } else if (op === 6) assert.equal(endSession(a.db, c.id), ledger.delete(c.id));
      else if (op === 7) {
        let n = 0;
        for (const e of ledger.values()) if (e.id !== c.id) { ledger.delete(e.id); n++; }
        assert.equal(endAllSessions(a.db, c.id), n);
      } else now += [-MINUTE - 1, -MINUTE, -1, 0, 1, MINUTE - 1, MINUTE, HALF_HOUR, TWELVE_HOURS][pick(9)]!;
      const stored = a.raw.prepare("SELECT * FROM sessions ORDER BY id").all().map(row => ({ ...row }));
      const expected = [...ledger.values()].sort((x, y) => x.id < y.id ? -1 : 1);
      // Compare as objects, with fixed field ordering, without ever logging a credential value.
      assert.equal(JSON.stringify(stored.map(x => [x.id, x.hash, x.label, x.made, x.seen])) === JSON.stringify(expected.map(x => [x.id, x.hash, x.label, x.made, x.seen])), true, `ledger ${step}`);
      assert.ok(stored.length <= 8);
    }
  } finally { a.raw.close(); }
});

test("C8: exact names and ambiguous cookie values fail closed, regardless of order", () => {
  const token = newToken(), nonce = newToken();
  const session = `${SESSION_COOKIE}=${ACCOUNT}.${token}`;
  const n = `${NONCE_COOKIE}=${nonce}`;
  for (const header of [session, `x=y; ${session}; ${n}`, `${n}; ${session}; x=y`]) {
    assert.equal(readSession(header)?.token === token, true);
  }
  for (const extra of [session, `${SESSION_COOKIE}=`, `${SESSION_COOKIE}=invalid`]) {
    for (const header of [`${session}; ${extra}`, `${extra}; ${session}`]) assert.equal(readSession(header), null);
  }
  for (const header of [`${n}; ${n}`, `${NONCE_COOKIE}=;${n}`, `${n};${NONCE_COOKIE}=bad`]) assert.equal(readNonce(header), null);
  for (const name of ["__host-ml", "__HOST-ml", "__Host-ML", "x__Host-ml", "__Host-ml-n"]) assert.equal(readSession(`${name}=${ACCOUNT}.${token}`), null);
  for (const value of [`${ACCOUNT}.${token}=`, `${ACCOUNT}.${token}.x`, `${ACCOUNT}.${token.slice(1)}`, `${ACCOUNT}.%41${token.slice(1)}`, `"${ACCOUNT}.${token}"`, `${ACCOUNT}..${token}`]) assert.equal(readSession(`${SESSION_COOKIE}=${value}`), null);
  assert.equal(readSession(session + ";x=" + "x".repeat(4096 - session.length - 3))?.token === token, true);
  assert.equal(readSession(session + ";x=" + "x".repeat(4097 - session.length - 3)), null);
});

test("C8: cookie writers reject every ASCII control and attribute delimiter in dynamic inputs", () => {
  const token = newToken();
  for (const ch of [...Array.from({ length: 33 }, (_, i) => String.fromCharCode(i)), String.fromCharCode(127), ";", ",", "=", '"', "\\", "%"]) {
    assert.equal(sessionCookie(ACCOUNT + ch, token), null);
    assert.equal(sessionCookie(ACCOUNT, token.slice(0, -1) + ch), null);
    assert.equal(nonceCookie(token.slice(0, -1) + ch), null);
  }
  for (const text of [sessionCookie(ACCOUNT, token)!, nonceCookie(token)!, noCookie(SESSION_COOKIE), noCookie(NONCE_COOKIE)]) {
    assert.doesNotThrow(() => new Headers({ "Set-Cookie": text }));
    const attrs = text.split("; ").slice(1);
    assert.deepEqual(attrs.slice(1).sort(), ["HttpOnly", "Path=/", "SameSite=Strict", "Secure"]);
    assert.equal(/Domain=/i.test(text), false);
  }
});

test("C8: real Headers reject sibling, opaque, duplicate and conflicting origin claims", () => {
  const origins = [null, "null", "https://changle.ca", "https://other.changle.ca", "http://money.changle.ca", "https://money.changle.ca:443", "https://money.changle.ca/", "https://money.changle.ca.evil.invalid", `${ORIGIN}, ${ORIGIN}`, ORIGIN];
  const sites = [null, "", "same-site", "cross-site", "none", "SAME-ORIGIN", "same-origin, same-origin", "same-origin"];
  for (const origin of origins) for (const site of sites) {
    const headers = new Headers();
    if (origin !== null) headers.set("oRiGiN", origin);
    if (site !== null) headers.set("sEc-FeTcH-sItE", site);
    assert.equal(fromOurOrigin(headers, ORIGIN), origin === ORIGIN && (site === null || site === "same-origin"));
  }
  const doubled = new Headers([["Origin", ORIGIN], ["Origin", ORIGIN]]);
  assert.equal(fromOurOrigin(doubled, ORIGIN), false);
  const staging = "https://money-staging.changle.ca:8443";
  assert.equal(fromOurOrigin(new Headers({ Origin: staging }), staging), true);
  assert.equal(fromOurOrigin(new Headers({ Origin: ORIGIN }), staging), false);
});
