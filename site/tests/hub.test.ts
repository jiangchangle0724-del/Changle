/**
 * The hub's own wiring for handoff codes and the "account gone" notices (worker/hub.ts, handoff.ts),
 * the real Durable Object class on Node's SQLite with a stand-in for the runtime (tests/support/):
 * which sessions get a code, what signing out, a kick, a ban and a delete do to waiting codes, what
 * a delete leaves for the apps, the alarm behind it, and what the Handoff door does with an error.
 *
 *   npx tsx --import ./tests/support/cloudflare.mjs tests/hub.test.ts
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Handoff } from "../worker/handoff";
import { Hub, type Call } from "../worker/hub";

let n = 0;
const ok = (what: string) => console.log(`ok   ${++n}. ${what}`);

type Row = Record<string, unknown>;
/** a Durable Object's state, as much of it as the hub uses, over one SQLite database */
function state(db = new DatabaseSync(":memory:"), alarm: number | null = null) {
  const later: Promise<unknown>[] = [];
  let ready: Promise<unknown> = Promise.resolve();
  const bind = (a: unknown) => (a === undefined ? null : typeof a === "boolean" ? Number(a) : a instanceof ArrayBuffer ? new Uint8Array(a) : a);
  const cursor = (rows: Row[], written: number) => ({
    toArray: () => rows,
    one: () => {
      if (rows.length !== 1) throw new Error(`one(): ${rows.length} rows`);
      return rows[0];
    },
    rowsWritten: written,
    [Symbol.iterator]: () => rows[Symbol.iterator](),
  });
  const sql = {
    exec(q: string, ...args: unknown[]) {
      // (several statements at once, as the hub's set-up sends some)
      if (!args.length && /;\s*\S/.test(q.trim().replace(/;\s*$/, ""))) {
        db.exec(q);
        return cursor([], 0);
      }
      const rows = db.prepare(q).all(...(args.map(bind) as never[])) as Row[];
      const written = /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(q) ? Number((db.prepare("SELECT changes() AS c").get() as Row).c) : 0;
      return cursor(rows, written);
    },
  };
  const ctx = {
    storage: {
      sql,
      getAlarm: async () => alarm,
      setAlarm: async (t: number | Date) => void (alarm = Number(t)),
      deleteAlarm: async () => void (alarm = null),
    },
    blockConcurrencyWhile: (f: () => Promise<unknown>) => (ready = f()),
    waitUntil: (p: Promise<unknown>) => void later.push(p),
    getWebSockets: () => [],
    acceptWebSocket: () => {},
  };
  return {
    db,
    ctx,
    alarm: () => alarm,
    clearAlarm: () => void (alarm = null),
    ready: () => ready,
    /** everything the hub handed to waitUntil, finished */
    settled: async () => {
      while (later.length) await Promise.allSettled(later.splice(0));
    },
  };
}

type Env = Record<string, unknown>;
async function hubOn(env: Env = {}, s = state()) {
  const hub = new Hub(s.ctx as never, { DEV_SHOW_CODES: "1", ADMIN_EMAILS: "boss@example.test", MASTER_EMAIL: "boss@example.test", ...env } as never);
  await s.ready();
  return { hub, s };
}
const req = (hub: Hub, method: string, path: string, body?: unknown, token = "", device = "test-phone-0001") =>
  hub.call({ method, path, token, device, ip: "203.0.113.9", body } as Call) as Promise<{ status: number; json: Row }>;

/** a new account, signed in: its session token and id */
async function join(hub: Hub, email: string, device = "test-phone-0001") {
  const code = (await req(hub, "POST", "/auth/code", { email, lang: "zh" }, "", device)).json.dev;
  const v = await req(hub, "POST", "/auth/verify", { email, code }, "", device);
  const r = await req(hub, "POST", "/auth/signup", { ticket: v.json.ticket, name: email.split("@")[0], phone: "+1 604 555 0199", city: "Vancouver", gender: "private", bio: "", agree: true, adult: true }, "", device);
  assert.equal(r.status, 200, `signed up ${email}: ${JSON.stringify(r.json)}`);
  return { token: String(r.json.token), id: String((r.json.user as Row).id) };
}
const NONCE = "hub-test_nonce-0123456789";
const codeFor = async (hub: Hub, token: string, device?: string) => req(hub, "POST", "/handoff", { aud: "moneylens", nonce: NONCE }, token, device);
const goneRows = (s: { db: DatabaseSync }) => (s.db.prepare("SELECT user_id, app, tries FROM gone_notices ORDER BY app").all() as Row[]).map((r) => ({ ...r }));

// ---- who gets a code ----
{
  const { hub } = await hubOn();
  const ann = await join(hub, "ann@example.test");
  assert.equal((await codeFor(hub, "")).status, 401);
  assert.equal((await codeFor(hub, "not-a-session")).status, 401);
  ok("no session, or a made-up one: no code");
  const r = await codeFor(hub, ann.token);
  assert.equal(r.status, 200);
  assert.match(String(r.json.code), /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await hub.redeemHandoff(String(r.json.code), "moneylens"), { id: ann.id, master: false, nonce: NONCE });
  ok("signed in: a code, and the app trades it for the account");

  const waiting = String((await codeFor(hub, ann.token)).json.code);
  assert.equal((await req(hub, "POST", "/auth/logout", {}, ann.token)).status, 200);
  assert.equal(await hub.redeemHandoff(waiting, "moneylens"), null);
  assert.equal((await codeFor(hub, ann.token)).status, 401);
  ok("signed out: the code from a moment ago can't be traded, and the old session gets none");
}
{
  const { hub } = await hubOn();
  const boss = await join(hub, "boss@example.test", "boss-phone-0001");
  const ben = await join(hub, "ben@example.test", "ben-phone-0001");
  const waiting = String((await codeFor(hub, ben.token, "ben-phone-0001")).json.code);
  const kicked = await req(hub, "POST", "/admin/kick", { uid: ben.id }, boss.token, "boss-phone-0001");
  assert.equal(kicked.status, 200, JSON.stringify(kicked.json));
  assert.equal(await hub.redeemHandoff(waiting, "moneylens"), null);
  ok("kicked: a waiting code can't be traded");

  const cat = await join(hub, "cat@example.test", "cat-phone-0001");
  const before = String((await codeFor(hub, cat.token, "cat-phone-0001")).json.code);
  assert.equal((await req(hub, "POST", "/admin/ban", { uid: cat.id }, boss.token, "boss-phone-0001")).status, 200);
  assert.equal(await hub.redeemHandoff(before, "moneylens"), null);
  assert.equal((await codeFor(hub, cat.token, "cat-phone-0001")).status, 403, "its phone is banned too");
  assert.equal((await codeFor(hub, cat.token, "other-phone-0002")).status, 401, "and its session is gone");
  ok("banned: no code for its session, on any phone, and none from before can be traded");
  const dan = await join(hub, "dan@example.test", "dan-phone-0001");
  assert.equal((await codeFor(hub, dan.token, "cat-phone-0001")).status, 403);
  ok("an account on a banned phone: no code");
}

// ---- a deleted account, and the apps it used ----
{
  // MoneyLens not bound yet: an account that used it is still noted, to be told once it is
  const { hub, s } = await hubOn();
  const ann = await join(hub, "ann@example.test");
  const ben = await join(hub, "ben@example.test", "ben-phone-0001");
  await hub.redeemHandoff(String((await codeFor(hub, ann.token)).json.code), "moneylens");
  assert.equal((await req(hub, "DELETE", "/me", {}, ann.token)).status, 200);
  assert.deepEqual(goneRows(s), [{ user_id: ann.id, app: "money", tries: 0 }]);
  assert.ok(s.alarm() != null, "the alarm is set at once");
  await s.settled();
  assert.equal(goneRows(s)[0]?.tries, 1, "tried (no way to reach it yet), kept for later");
  assert.ok(s.alarm()! > Date.now() + 23 * 3600_000, "next try in a day");
  ok("deleted before MoneyLens is bound: kept, and tried again daily until it is");
  assert.equal((await req(hub, "DELETE", "/me", {}, ben.token, "ben-phone-0001")).status, 200);
  assert.equal(goneRows(s).length, 1);
  ok("an account that never used MoneyLens: nothing for it");
  for (const t of ["handoffs", "handoffs_given", "handoff_apps"]) assert.equal((s.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(ann.id) as Row).n, 0, t);
  ok("nothing of a deleted account's handoffs left");
}
{
  // bound: told at once
  const heard: string[] = [];
  const { hub, s } = await hubOn({ MONEY: { accountGone: async (id: string) => void heard.push(id) } });
  const ann = await join(hub, "ann@example.test");
  await hub.redeemHandoff(String((await codeFor(hub, ann.token)).json.code), "moneylens");
  await req(hub, "DELETE", "/me", {}, ann.token);
  await s.settled();
  assert.deepEqual(heard, [ann.id]);
  assert.deepEqual(goneRows(s), []);
  ok("deleted with MoneyLens bound: told at once, nothing left waiting");
}
{
  // the hub stops in the middle of a try: the next one to start sets the alarm again
  const s = state();
  const first = await hubOn({ MONEY: { accountGone: () => new Promise(() => {}) } }, s);
  const ann = await join(first.hub, "ann@example.test");
  await first.hub.redeemHandoff(String((await codeFor(first.hub, ann.token)).json.code), "moneylens");
  await req(first.hub, "DELETE", "/me", {}, ann.token);
  await new Promise((r) => setTimeout(r, 20)); // (the try is on its way, and hangs)
  s.clearAlarm(); // (as if lost with the hub)
  const heard: string[] = [];
  const again = await hubOn({ MONEY: { accountGone: async (id: string) => void heard.push(id) } }, state(s.db));
  assert.equal(goneRows(s).length, 1);
  const at = await again.s.ctx.storage.getAlarm();
  const due = Number((s.db.prepare("SELECT next_at FROM gone_notices").get() as Row).next_at);
  assert.equal(at, Math.max(due, at!), "a hub starting with notices waiting and no alarm sets one, for when they're due");
  await again.hub.alarm();
  assert.equal(heard.length, 0, "not before it's due");
  s.db.prepare("UPDATE gone_notices SET next_at = ?").run(Date.now() - 1); // (time passes)
  await again.hub.alarm();
  assert.deepEqual(heard, [ann.id]);
  assert.deepEqual(goneRows(s), []);
  ok("a hub that stopped mid-try: the next start sets the alarm again, and the notice goes out on it");
}
{
  // the only alarm a day away (a notice for an app not bound yet), and a new notice whose alarm was never set
  const s = state();
  await hubOn({}, s);
  const now = Date.now();
  s.db.prepare("INSERT INTO gone_notices (user_id, app, tries, next_at, ver) VALUES (?, ?, ?, ?, 0)").run("uaaaaaaaaaaaa", "money", 3, now + 86_400_000);
  s.db.prepare("INSERT INTO gone_notices (user_id, app, tries, next_at, ver) VALUES (?, ?, ?, ?, 0)").run("ubbbbbbbbbbbb", "split", 0, now);
  const again = await hubOn({}, state(s.db, now + 86_400_000));
  assert.ok(again.s.alarm()! <= Date.now() + 1000, `woken in a second, not in a day (${again.s.alarm()! - now} ms)`);
  ok("a later alarm is brought forward on start when a notice is due sooner");
}

// ---- the Handoff door ----
{
  const hubThat = (stub: Row) => ({ HUB: { idFromName: () => "hub", get: () => stub } });
  const fine = new Handoff({} as never, hubThat({ redeemHandoff: async () => ({ id: "uaaaaaaaaaaaa", master: false, nonce: NONCE }), accountsThere: async () => ["uaaaaaaaaaaaa"] }) as never);
  assert.deepEqual(await fine.redeem("x".repeat(43), "moneylens"), { id: "uaaaaaaaaaaaa", master: false, nonce: NONCE });
  assert.deepEqual(await fine.exists(["uaaaaaaaaaaaa"]), ["uaaaaaaaaaaaa"]);
  const broken = new Handoff({} as never, hubThat({ redeemHandoff: async () => Promise.reject(new Error("hub down")), accountsThere: async () => Promise.reject(new Error("hub down")) }) as never);
  const quiet = console.error;
  console.error = () => {};
  assert.equal(await broken.redeem("x".repeat(43), "moneylens"), null);
  console.error = quiet;
  ok("redeem: the hub's error is a plain null (no account)");
  await assert.rejects(() => broken.exists(["uaaaaaaaaaaaa"]), /hub down/);
  const { hub } = await hubOn();
  await assert.rejects(async () => hub.accountsThere(["uaaaaaaaaaaaa", "not an id"]));
  ok("exists: an error goes back to the app as an error, never as \"none\"");
}

console.log(`\nall ${n} passed`);
// (the first hub in "stopped mid-try" still has its never-answered send on a 30-second timer)
process.exit(0);
