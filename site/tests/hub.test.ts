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
/** (each phone its own IP, so the per-IP limits on codes don't run out across a test's phones) */
const ipOf = (device: string) => `203.0.113.${[...device].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 250}`;
const req = (hub: Hub, method: string, path: string, body?: unknown, token = "", device = "test-phone-0001") =>
  hub.call({ method, path, token, device, ip: ipOf(device), body } as Call) as Promise<{ status: number; json: Row }>;

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
/** how many 换邮箱 changes wait */
const pendingOf = (s: { db: DatabaseSync }) => Number((s.db.prepare("SELECT COUNT(*) AS n FROM email_pending").get() as Row).n);
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
  assert.ok(at! >= due && at! <= Math.max(due, Date.now() + 1000), "a hub starting with notices waiting and no alarm sets one, for when they're due");
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

// ---- 换邮箱 through the hub ----
{
  // the mail out goes to a stand-in for Resend (DEV_MAIL_URL), kept here; `down` turns the next ones away
  const mails: Row[] = [];
  let down = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    if (down > 0) return down--, new Response("busy", { status: 503 });
    mails.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify({ id: "fake" }), { status: 200 });
  }) as typeof fetch;
  const quiet = console.error;
  console.error = () => {};
  const changed: string[] = [];
  const { hub, s } = await hubOn({
    DEV_MAIL_URL: "http://mail.test/emails",
    ADMIN_EMAILS: "boss@example.test,chief@example.test",
    MONEY: { accountGone: async () => {}, accountChanged: async (id: string) => void changed.push(id) },
  });
  /** signed in again, on another phone: a second session of the account */
  const signIn = async (email: string, device: string) => {
    const code = (await req(hub, "POST", "/auth/code", { email, lang: "zh" }, "", device)).json.dev;
    return String((await req(hub, "POST", "/auth/verify", { email, code }, "", device)).json.token);
  };
  const later = () => s.db.prepare("UPDATE email_sent SET at = at - 60000").run(); // (a minute passes, for the spacing)
  const me = async (token: string, device: string) => req(hub, "GET", "/me", undefined, token, device);
  const ann = await join(hub, "ann@example.test");
  const ben = await join(hub, "ben@example.test", "ben-phone-0001");
  const boss = await join(hub, "boss@example.test", "boss-phone-0001");
  const cat = await join(hub, "cat@example.test", "cat-phone-0001");
  const dan = await join(hub, "dan@example.test", "dan-phone-0001");
  await hub.redeemHandoff(String((await codeFor(hub, ann.token)).json.code), "moneylens");
  assert.equal((await req(hub, "POST", "/me/email", { email: "new@example.test" })).status, 401);
  assert.deepEqual((await req(hub, "POST", "/me/email", { email: "new@example.test" }, boss.token, "boss-phone-0001")).json, { error: "admin" });
  ok("换邮箱: none without a session, none for an admin");

  const toBen = await req(hub, "POST", "/me/email", { email: "ben@example.test" }, ann.token);
  assert.equal(toBen.status, 200, "an address that's taken: codes like any other (nothing said yet)");
  assert.deepEqual((await req(hub, "POST", "/me/email/confirm", { code: toBen.json.dev, oldCode: toBen.json.devNow }, ann.token)).json, { error: "taken" });
  const toChief = await req(hub, "POST", "/me/email", { email: "chief@example.test" }, cat.token, "cat-phone-0001");
  assert.deepEqual((await req(hub, "POST", "/me/email/confirm", { code: toChief.json.dev, oldCode: toChief.json.devNow }, cat.token, "cat-phone-0001")).json, { error: "unusable" });
  assert.equal(((await me(cat.token, "cat-phone-0001")).json.user as Row).admin, false);
  ok("换邮箱: taken or an admin's address is said only once the codes come back, and isn't used");
  assert.deepEqual((await req(hub, "POST", "/me/email", { email: "chief@example.test" }, ben.token, "ben-phone-0001")).json, { error: "wait" });
  ok("换邮箱: codes to one address are spaced, whoever asks");

  // both codes: changed at once, the other phones signed out
  const ann2 = await signIn("ann@example.test", "ann-tablet-0002");
  assert.equal((await me(ann2, "ann-tablet-0002")).status, 200, "Ann on a second phone");
  later();
  mails.length = 0;
  down = 1; // (the first try of the note to the old address fails)
  const guess = await req(hub, "POST", "/me/email", { email: "New@Example.test", lang: "zh" }, ann.token);
  assert.deepEqual((await req(hub, "POST", "/me/email/confirm", { code: guess.json.dev, oldCode: "000000" === guess.json.devNow ? "111111" : "000000" }, ann.token)).json, { error: "old-code" });
  assert.deepEqual((await req(hub, "POST", "/me/email/confirm", { code: guess.json.dev, oldCode: guess.json.devNow }, ann.token)).json, { error: "none" }, "a wrong guess at the current address's code ends the pair");
  later();
  const sent = await req(hub, "POST", "/me/email", { email: "New@Example.test", lang: "zh" }, ann.token);
  assert.equal(sent.status, 200);
  const done = await req(hub, "POST", "/me/email/confirm", { code: sent.json.dev, oldCode: sent.json.devNow, lang: "zh" }, ann.token, "test-phone-0001");
  assert.equal(done.status, 200, JSON.stringify(done.json));
  assert.equal((done.json.user as Row).email, "new@example.test");
  assert.equal((await me(ann.token, "test-phone-0001")).status, 200, "the phone that changed it stays signed in");
  assert.equal((await me(ann2, "ann-tablet-0002")).status, 401, "the other phone is signed out");
  ok("换邮箱, both codes: changed at once; the phone that did it stays signed in, the others are signed out");
  await s.settled();
  const toOld = () => mails.find((m) => JSON.stringify(m.to) === JSON.stringify(["ann@example.test"]));
  assert.equal(toOld(), undefined, "Resend said no");
  assert.equal((s.db.prepare("SELECT COUNT(*) AS n FROM mail_out").get() as Row).n, 1, "the note is kept");
  s.db.prepare("UPDATE mail_out SET next_at = ?").run(Date.now() - 1); // (time passes)
  await hub.alarm();
  const note = toOld();
  assert.ok(note, "the old address is told on the next try");
  assert.match(String(note.text), /n\*\*\*@example\.test/, "the new address shown masked");
  assert.ok(!String(note.text).includes("new@example.test"), "and only masked");
  assert.equal(note.reply_to, "boss@example.test", "a reply goes to the site's contact (CONTACT_EMAIL, or the first admin)");
  assert.deepEqual(changed, [ann.id], "MoneyLens told, for an account that used it");
  assert.deepEqual(goneRows(s), []);
  const h = (s.db.prepare("SELECT old, new, device FROM email_history WHERE user_id = ?").all(ann.id) as Row[]).map((r) => ({ ...r }));
  assert.deepEqual(h, [{ old: "ann@example.test", new: "new@example.test", device: "test-phone-0001" }]);
  ok("换邮箱: the change is kept, the old address is told (tried until it's sent), MoneyLens hears");

  const v = await req(hub, "POST", "/auth/verify", { email: "new@example.test", code: (await req(hub, "POST", "/auth/code", { email: "new@example.test", lang: "zh" })).json.dev });
  assert.equal((v.json.user as Row | undefined)?.id, ann.id, "the new address signs in to the same account");
  const old = await req(hub, "POST", "/auth/verify", { email: "ann@example.test", code: (await req(hub, "POST", "/auth/code", { email: "ann@example.test", lang: "zh" })).json.dev });
  assert.ok(old.json.ticket && !old.json.token, "the old one would make a new account");
  ok("换邮箱: the new address opens the account, the old one doesn't");

  const sentBen = await req(hub, "POST", "/me/email", { email: "ben2@example.test" }, ben.token, "ben-phone-0001");
  assert.equal(sentBen.status, 200, JSON.stringify(sentBen.json));
  await req(hub, "POST", "/me/email/confirm", { code: sentBen.json.dev, oldCode: sentBen.json.devNow }, ben.token, "ben-phone-0001");
  await s.settled();
  assert.deepEqual(changed, [ann.id], "an account that never used MoneyLens: nothing for it");
  ok("换邮箱: MoneyLens isn't told about accounts it doesn't know");

  // the current address lost: only the new code, and the change waits three days
  const dan2 = await signIn("dan@example.test", "dan-tablet-0002");
  const wait3 = async (to: string) => {
    later();
    const r = await req(hub, "POST", "/me/email", { email: to, lang: "zh" }, dan.token, "dan-phone-0001");
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return req(hub, "POST", "/me/email/confirm", { code: r.json.dev, lost: true, lang: "zh" }, dan.token, "dan-phone-0001");
  };
  mails.length = 0;
  const w = await wait3("dan-new@example.test");
  assert.equal(w.status, 200, JSON.stringify(w.json));
  const pending = (w.json.user as Row).emailPending as Row;
  assert.equal(pending.email, "dan-new@example.test");
  assert.ok(Math.abs(Number(pending.at) - (Date.now() + 3 * 24 * 3600_000)) < 60_000, "in three days");
  assert.equal(((await me(dan2, "dan-tablet-0002")).json.user as Row).email, "dan@example.test", "nothing changes yet, and nobody is signed out");
  assert.deepEqual(((await me(dan2, "dan-tablet-0002")).json.user as Row).emailPending, pending, "every phone of the account sees it");
  later();
  assert.deepEqual((await req(hub, "POST", "/me/email", { email: "dan-other@example.test" }, dan.token, "dan-phone-0001")).json, { error: "pending" });
  await s.settled();
  const warn = mails.find((m) => JSON.stringify(m.to) === JSON.stringify(["dan@example.test"]));
  assert.ok(warn, "the address it has now is told at once");
  assert.match(String(warn.text), /d\*\*\*@example\.test/, "the new address masked");
  assert.ok(/有人要把/.test(String(warn.text)) && /Someone asked/.test(String(warn.text)), "in both languages (whoever asked chose theirs)");
  const link = /https:\/\/changle\.ca\/me\/email-cancel#([A-Za-z0-9_-]{43})/.exec(String(warn.text));
  assert.ok(link && String(warn.html).includes(link[0]), "with the link that cancels it");
  ok("换邮箱, the current address lost: the change waits three days, every phone sees it, the current address gets a cancel link at once");

  assert.deepEqual((await req(hub, "POST", "/email/cancel", { token: link![1] }, "", "someone-else-0009")).json, { cancelled: true });
  assert.equal(((await me(dan.token, "dan-phone-0001")).json.user as Row).emailPending, null);
  assert.deepEqual((await req(hub, "POST", "/email/cancel", { token: link![1] }, "", "someone-else-0009")).json, { error: "link" }, "the link works once");
  ok("换邮箱: the link cancels the waiting change, signed in or not, once");

  await wait3("dan-new@example.test");
  assert.equal((await req(hub, "POST", "/me/email/cancel", {}, dan2, "dan-tablet-0002")).status, 200);
  assert.equal(((await me(dan.token, "dan-phone-0001")).json.user as Row).emailPending, null);
  ok("换邮箱: any of the account's phones can cancel it too");

  // paused: cancelling stays open; on the day nothing is made, it waits another hour
  const pause = (on: boolean) => req(hub, "POST", "/admin/pause", { on }, boss.token, "boss-phone-0001");
  await wait3("dan-new@example.test");
  await pause(true);
  assert.equal((await me(dan.token, "dan-phone-0001")).status, 503, "the site is paused");
  assert.equal((await req(hub, "POST", "/me/email/cancel", {}, dan2, "dan-tablet-0002")).status, 200, "cancelling from a phone works while paused");
  assert.equal(pendingOf(s), 0);
  await pause(false);
  await wait3("dan-new@example.test");
  await pause(true);
  s.db.prepare("UPDATE email_pending SET due_at = ?").run(Date.now() - 1); // (three days pass, paused)
  await hub.alarm();
  assert.equal((s.db.prepare("SELECT email FROM users WHERE id = ?").get(dan.id) as Row).email, "dan@example.test", "not made while paused");
  assert.ok(Number((s.db.prepare("SELECT due_at FROM email_pending WHERE user_id = ?").get(dan.id) as Row).due_at) > Date.now() + 3500_000, "it waits another hour");
  await pause(false);
  ok("换邮箱: paused, cancelling still works, and nothing is made on the day (it waits another hour)");

  mails.length = 0;
  s.db.prepare("UPDATE email_pending SET due_at = ?").run(Date.now() - 1); // (the site open again, the day come)
  await hub.alarm();
  assert.equal(((await me(dan.token, "dan-phone-0001")).json.user as Row).email, "dan-new@example.test", "made on its day");
  assert.equal((await me(dan2, "dan-tablet-0002")).status, 401, "the other phone is signed out");
  assert.ok(mails.some((m) => JSON.stringify(m.to) === JSON.stringify(["dan-new@example.test"])), "the new address is told it's done");
  assert.ok(mails.some((m) => JSON.stringify(m.to) === JSON.stringify(["dan@example.test"]) && /换了邮箱/.test(String(m.subject))), "and the old one");
  ok("换邮箱: on its day the change is made on the alarm, the asking phone stays signed in, the others are signed out");

  // on its day the new address turned out taken: not made, and the new address hears why
  const eve = await join(hub, "eve@example.test", "eve-phone-0001");
  later();
  const e1 = await req(hub, "POST", "/me/email", { email: "eve-new@example.test", lang: "en" }, eve.token, "eve-phone-0001");
  await req(hub, "POST", "/me/email/confirm", { code: e1.json.dev, lost: true, lang: "en" }, eve.token, "eve-phone-0001");
  await join(hub, "eve-new@example.test", "squatter-0001");
  mails.length = 0;
  s.db.prepare("UPDATE email_pending SET due_at = ? WHERE user_id = ?").run(Date.now() - 1, eve.id);
  await hub.alarm();
  assert.equal(((await me(eve.token, "eve-phone-0001")).json.user as Row).email, "eve@example.test", "not made");
  assert.ok(mails.some((m) => JSON.stringify(m.to) === JSON.stringify(["eve-new@example.test"]) && /didn't move/.test(String(m.subject))), "the new address hears why");
  ok("换邮箱: on its day the address is checked again, and if it's taken by then, the new address hears why");

  // every other phone signed out, from /me
  const eve2 = await signIn("eve@example.test", "eve-tablet-0002");
  const eve3 = await signIn("eve@example.test", "eve-laptop-0003");
  assert.deepEqual((await req(hub, "POST", "/me/sessions/others", {}, eve.token, "eve-phone-0001")).json, { out: 2 });
  assert.equal((await me(eve.token, "eve-phone-0001")).status, 200, "this phone stays");
  assert.equal((await me(eve2, "eve-tablet-0002")).status, 401);
  assert.equal((await me(eve3, "eve-laptop-0003")).status, 401);
  ok("退出其他手机: every other phone signed out, this one stays");

  later();
  assert.equal((await req(hub, "POST", "/me/email", { email: "later@example.test" }, ann.token)).status, 200);
  await req(hub, "DELETE", "/me", {}, ann.token);
  for (const t of ["email_changes", "email_history", "email_pending"]) assert.equal((s.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(ann.id) as Row).n, 0, t);
  ok("换邮箱: a deleted account's waiting codes and email history go with it");
  console.error = quiet;
  globalThis.fetch = realFetch;
}

console.log(`\nall ${n} passed`);
// (the first hub in "stopped mid-try" still has its never-answered send on a 30-second timer)
process.exit(0);
