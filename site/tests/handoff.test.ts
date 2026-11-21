/**
 * Handoff codes and the "account gone" notices (worker/handoffCodes.ts, worker/goneNotices.ts), on
 * Node's own SQLite in place of the hub's: what MoneyLens asked for (docs/moneylens/accounts-
 * requests.md, its tests T-3 and T-16). A code works once, for 60 seconds, for its own app; none
 * without a session; five a minute and 100 a day; only its hash is kept; the account's id, owner
 * flag and nonce come back, nothing else. Deleting an account tells each app until it has heard.
 *
 *   npx tsx tests/handoff.test.ts
 */
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { noteGone, goneTables, sendGone, waitAfter } from "../worker/goneNotices";
import { accountsThere, appsUsed, CODE_TTL, forgetHandoffs, giveHandoff, handoffTables, PER_DAY, PER_MINUTE, redeemHandoff, type Sql } from "../worker/handoffCodes";

/** Node's SQLite, shaped like a Durable Object's `ctx.storage.sql` */
function sqlite(): Sql & { db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  // (it runs at once, as a Durable Object's does; the rows are read after)
  return {
    db,
    exec: (q, ...args) => {
      const rows = db.prepare(q).all(...args) as Record<string, unknown>[];
      return { toArray: () => rows };
    },
  };
}

const NONCE = "n0nce_from-moneylens_123456";
const T0 = 1_800_000_000_000;
const people: Record<string, { banned: boolean; master: boolean }> = {
  uaaaaaaaaaaaa: { banned: false, master: false },
  ubbbbbbbbbbbb: { banned: false, master: true },
  ucccccccccccc: { banned: false, master: false },
};
const account = (id: string) => people[id] ?? null;

function fresh() {
  const sql = sqlite();
  handoffTables(sql);
  goneTables(sql);
  sql.exec(`CREATE TABLE users (id TEXT PRIMARY KEY)`);
  for (const id of Object.keys(people)) sql.exec(`INSERT INTO users (id) VALUES (?)`, id);
  return sql;
}

async function codeFor(sql: Sql, id: string, now = T0, body: unknown = { aud: "moneylens", nonce: NONCE }) {
  const r = await giveHandoff(sql, { id }, body, now);
  assert.equal(r.status, 200, `a code for ${id}: ${JSON.stringify(r.json)}`);
  return (r.json as { code: string }).code;
}

let n = 0;
const ok = (msg: string) => console.log(`ok   ${++n}. ${msg}`);

// ---- giving ----
{
  const sql = fresh();
  const r = await giveHandoff(sql, null, { aud: "moneylens", nonce: NONCE }, T0);
  assert.equal(r.status, 401);
  assert.deepEqual(r.json, { error: "signin" });
  ok("no session, no code (401)");

  assert.equal((await giveHandoff(sql, { id: "uaaaaaaaaaaaa" }, { aud: "elsewhere", nonce: NONCE }, T0)).status, 400);
  assert.equal((await giveHandoff(sql, { id: "uaaaaaaaaaaaa" }, { nonce: NONCE }, T0)).status, 400);
  ok("only for an app on the list (400 aud)");

  for (const nonce of [undefined, "", "short", "x".repeat(65), "has spaces in it 1234567", "émoji😀aaaaaaaaaaaaaaaaaa"]) {
    const r2 = await giveHandoff(sql, { id: "uaaaaaaaaaaaa" }, { aud: "moneylens", nonce }, T0);
    assert.equal(r2.status, 400, `nonce ${JSON.stringify(nonce)}`);
    assert.deepEqual(r2.json, { error: "nonce" });
  }
  ok("the nonce has to look like one (20 to 64 of A-Z a-z 0-9 _ -)");

  const code = await codeFor(sql, "uaaaaaaaaaaaa");
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  ok("a code is 256 bits, base64url");
  const rows = sql.exec(`SELECT * FROM handoffs`).toArray();
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes(code), "the code itself isn't kept");
  assert.deepEqual(Object.keys(rows[0]).sort(), ["aud", "expires", "hash", "nonce", "user_id"]);
  assert.equal(rows[0].expires, T0 + CODE_TTL);
  ok("only its SHA-256 is kept, with the account, the app, the nonce and when it ends");
  const codes = new Set([code]);
  for (let i = 0; i < 3; i++) codes.add(await codeFor(sql, "uaaaaaaaaaaaa", T0 + 1000 + i));
  assert.equal(codes.size, 4);
  ok("every code is different");
}

// ---- limits ----
{
  const sql = fresh();
  for (let i = 0; i < PER_MINUTE; i++) await codeFor(sql, "uaaaaaaaaaaaa", T0 + i * 1000);
  const over = await giveHandoff(sql, { id: "uaaaaaaaaaaaa" }, { aud: "moneylens", nonce: NONCE }, T0 + 10_000);
  assert.equal(over.status, 429);
  assert.deepEqual(over.json, { error: "slow-down" });
  ok(`${PER_MINUTE} a minute, then 429`);
  await codeFor(sql, "ubbbbbbbbbbbb", T0 + 10_000);
  ok("someone else's limit is their own");
  await codeFor(sql, "uaaaaaaaaaaaa", T0 + 61_000);
  ok("the next minute, codes again");

  const day = fresh();
  for (let i = 0; i < PER_DAY; i++) await codeFor(day, "ucccccccccccc", T0 + i * 13 * 60_000);
  const busy = await giveHandoff(day, { id: "ucccccccccccc" }, { aud: "moneylens", nonce: NONCE }, T0 + (PER_DAY - 1) * 13 * 60_000 + 60_001);
  assert.equal(busy.status, 429);
  ok(`${PER_DAY} a day, then 429`);
  assert.equal((await giveHandoff(day, { id: "ucccccccccccc" }, { aud: "moneylens", nonce: NONCE }, T0 + 86_400_000 + 60_000)).status, 200);
  ok("a day after the first, codes again");
}

// ---- trading ----
{
  const sql = fresh();
  const code = await codeFor(sql, "uaaaaaaaaaaaa");
  const got = await redeemHandoff(sql, code, "moneylens", account, T0 + 5000);
  assert.deepEqual(got, { id: "uaaaaaaaaaaaa", master: false, nonce: NONCE });
  ok("traded: the account's id, owner or not, and the nonce, nothing more");
  assert.equal(await redeemHandoff(sql, code, "moneylens", account, T0 + 6000), null);
  ok("the same code a second time: null");

  const late = await codeFor(sql, "uaaaaaaaaaaaa", T0 + 100_000);
  assert.equal(await redeemHandoff(sql, late, "moneylens", account, T0 + 100_000 + 61_000), null);
  ok("61 seconds later: null");
  const inTime = await codeFor(sql, "uaaaaaaaaaaaa", T0 + 200_000);
  assert.ok(await redeemHandoff(sql, inTime, "moneylens", account, T0 + 200_000 + 59_000));
  ok("59 seconds later: still good");

  const other = await codeFor(sql, "uaaaaaaaaaaaa", T0 + 300_000);
  assert.equal(await redeemHandoff(sql, other, "elsewhere", account, T0 + 300_001), null);
  assert.equal(await redeemHandoff(sql, other, "moneylens", account, T0 + 300_002), null);
  ok("for another app: null, and the code is spent");

  const owner = await codeFor(sql, "ubbbbbbbbbbbb", T0 + 400_000);
  assert.deepEqual(await redeemHandoff(sql, owner, "moneylens", account, T0 + 400_001), { id: "ubbbbbbbbbbbb", master: true, nonce: NONCE });
  ok("the owner's account says so");

  people.ucccccccccccc.banned = true;
  const banned = await codeFor(sql, "ucccccccccccc", T0 + 500_000);
  assert.equal(await redeemHandoff(sql, banned, "moneylens", account, T0 + 500_001), null);
  people.ucccccccccccc.banned = false;
  ok("banned while the code waits: null");
  const goneCode = await codeFor(sql, "uzzzzzzzzzzzz", T0 + 600_000);
  assert.equal(await redeemHandoff(sql, goneCode, "moneylens", account, T0 + 600_001), null);
  ok("the account deleted meanwhile: null");

  for (const bad of [undefined, null, 42, "", "abc", "x".repeat(43) + "!", "a".repeat(44)]) assert.equal(await redeemHandoff(sql, bad, "moneylens", account, T0), null);
  assert.equal(await redeemHandoff(sql, "A".repeat(43), "moneylens", account, T0), null);
  ok("anything that isn't a live code: null");

  // two trades of one code at the same time: one wins
  const race = await codeFor(sql, "uaaaaaaaaaaaa", T0 + 700_000);
  const both = await Promise.all([redeemHandoff(sql, race, "moneylens", account, T0 + 700_001), redeemHandoff(sql, race, "moneylens", account, T0 + 700_001)]);
  assert.equal(both.filter(Boolean).length, 1);
  ok("the same code traded twice at once: only one gets the account");
}

// ---- which apps an account has used; signing out, kicked or deleted ----
{
  const sql = fresh();
  assert.deepEqual(appsUsed(sql, "uaaaaaaaaaaaa"), []);
  const unused = await codeFor(sql, "uaaaaaaaaaaaa");
  assert.deepEqual(appsUsed(sql, "uaaaaaaaaaaaa"), [], "a code given isn't a use");
  await redeemHandoff(sql, unused, "elsewhere", account, T0 + 1);
  assert.deepEqual(appsUsed(sql, "uaaaaaaaaaaaa"), [], "nor one traded for the wrong app");
  await redeemHandoff(sql, await codeFor(sql, "uaaaaaaaaaaaa", T0 + 2), "moneylens", account, T0 + 3);
  await redeemHandoff(sql, await codeFor(sql, "uaaaaaaaaaaaa", T0 + 4), "moneylens", account, T0 + 5);
  assert.deepEqual(appsUsed(sql, "uaaaaaaaaaaaa"), ["money"], "a code traded: MoneyLens noted, once");
  ok("the apps an account has used are noted when it trades a code");

  const waiting = await codeFor(sql, "uaaaaaaaaaaaa", T0 + 10);
  assert.deepEqual(forgetHandoffs(sql, "uaaaaaaaaaaaa", false), []);
  assert.equal(await redeemHandoff(sql, waiting, "moneylens", account, T0 + 11), null);
  assert.deepEqual(appsUsed(sql, "uaaaaaaaaaaaa"), ["money"], "signing out leaves what it has used");
  ok("signed out or kicked: a code from the last minute can't be traded");

  assert.deepEqual(forgetHandoffs(sql, "uaaaaaaaaaaaa", true), ["money"]);
  const left = (t: string) => sql.exec(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`, "uaaaaaaaaaaaa").toArray()[0].n;
  assert.deepEqual([left("handoffs"), left("handoffs_given"), left("handoff_apps")], [0, 0, 0]);
  assert.deepEqual(forgetHandoffs(sql, "ubbbbbbbbbbbb", true), [], "one that never used an app: none to tell");
  ok("deleted: the apps it used, to be told (bound yet or not), and nothing of it left here");
}

// ---- which accounts are still here ----
{
  const sql = fresh();
  assert.deepEqual(accountsThere(sql, ["uaaaaaaaaaaaa", "uzzzzzzzzzzzz", "ubbbbbbbbbbbb", "uaaaaaaaaaaaa"]).sort(), ["uaaaaaaaaaaaa", "ubbbbbbbbbbbb"]);
  assert.deepEqual(accountsThere(sql, []), []);
  ok("exists: the ones still here, nothing for the rest");
  const wrong = [
    undefined,
    "uaaaaaaaaaaaa",
    [1, 2],
    Array.from({ length: 101 }, (_, i) => `u${String(i).padStart(12, "a")}`),
    ["not an id", "'; DROP TABLE users; --"],
    ["uaaaaaaaaaaaa", " ubbbbbbbbbbbb"],
    ["uaaaaaaaaaaaa", "user:ubbbbbbbbbbbb"],
    ["UAAAAAAAAAAAA"],
  ];
  for (const bad of wrong) assert.throws(() => accountsThere(sql, bad), undefined, JSON.stringify(bad)?.slice(0, 60));
  ok("a wrong question throws, one id not shaped like an account's included (never a quiet \"none\", which would delete everyone)");
}

// ---- "this account is gone", until each app has heard ----
{
  const sql = fresh();
  const heard: string[] = [];
  const woken: number[] = [];
  const wake = (at: number) => void woken.push(at);
  let moneyFails = 2;
  const tell = {
    split: async (id: string) => void heard.push(`split:${id}`),
    money: async (id: string) => {
      if (moneyFails-- > 0) throw new Error("money down");
      heard.push(`money:${id}`);
    },
  };
  noteGone(sql, "uaaaaaaaaaaaa", ["split", "money"], T0);
  let next = await sendGone(sql, tell, wake, () => T0);
  assert.deepEqual(heard, ["split:uaaaaaaaaaaaa"]);
  assert.equal(next, T0 + waitAfter(1));
  assert.deepEqual(woken, [T0 + waitAfter(1)], "the alarm asked for before the first send");
  ok("deleted: each app told at once; one that fails waits a minute; the alarm set before the sends");
  next = await sendGone(sql, tell, wake, () => T0 + 30_000);
  assert.deepEqual(heard, ["split:uaaaaaaaaaaaa"], "not before it's due");
  next = await sendGone(sql, tell, wake, () => next!);
  assert.equal(next, T0 + waitAfter(1) + waitAfter(2));
  ok("failing again, it waits longer (5 minutes)");
  next = await sendGone(sql, tell, wake, () => next!);
  assert.deepEqual(heard, ["split:uaaaaaaaaaaaa", "money:uaaaaaaaaaaaa"]);
  assert.equal(next, null);
  assert.equal(sql.exec(`SELECT COUNT(*) AS n FROM gone_notices`).toArray()[0].n, 0);
  ok("told in the end, and nothing left to do");

  noteGone(sql, "ubbbbbbbbbbbb", ["money"], T0);
  const later = await sendGone(sql, { split: tell.split }, wake, () => T0);
  assert.equal(later, T0 + 24 * 3600_000);
  ok("an app with no way to reach it yet: tried again in a day, not dropped");
  assert.equal(waitAfter(1), 60_000);
  assert.equal(waitAfter(99), 24 * 3600_000);
  ok("the waits grow to a day and stay there");
}
{
  // a slow failure waits from when it failed, not from when the pass began
  const sql = fresh();
  let t = T0;
  noteGone(sql, "uaaaaaaaaaaaa", ["money"], T0);
  const next = await sendGone(sql, { money: async () => ((t += 20_000), Promise.reject(new Error("slow, then down"))) }, () => {}, () => t);
  assert.equal(next, T0 + 20_000 + waitAfter(1));
  ok("a slow failure: the wait runs from when it failed");
}
{
  // an app that never answers: given up on after the time limit, and tried again later
  const sql = fresh();
  noteGone(sql, "uaaaaaaaaaaaa", ["money"], T0);
  const next = await sendGone(sql, { money: () => new Promise(() => {}) }, () => {}, () => T0, 50);
  assert.equal(next, T0 + waitAfter(1));
  assert.equal(Number(sql.exec(`SELECT tries FROM gone_notices`).toArray()[0].tries), 1);
  ok("no answer within the time limit: a failed try, the row kept");
}
{
  // two passes at once (the try right after a delete, and the alarm): a row goes out once
  const sql = fresh();
  noteGone(sql, "uaaaaaaaaaaaa", ["money"], T0);
  let sends = 0;
  let answer!: () => void;
  const money = () => (sends++, new Promise<void>((r) => (answer = r)));
  const first = sendGone(sql, { money }, () => {}, () => T0);
  const second = sendGone(sql, { money }, () => {}, () => T0 + 1);
  await new Promise((r) => setTimeout(r, 5));
  answer();
  await Promise.all([first, second]);
  assert.equal(sends, 1);
  assert.equal(sql.exec(`SELECT COUNT(*) AS n FROM gone_notices`).toArray()[0].n, 0);
  ok("a pass alongside another doesn't send the same row twice");
}
{
  // many due at once: one pass takes some, all at once, and asks to be woken for the rest
  const sql = fresh();
  for (let i = 0; i < 30; i++) noteGone(sql, `u${String(i).padStart(12, "a")}`, ["money"], T0);
  let busy = 0;
  let most = 0;
  const money = async () => {
    busy++;
    most = Math.max(most, busy);
    await new Promise((r) => setTimeout(r, 2));
    busy--;
  };
  const next = await sendGone(sql, { money }, () => {}, () => T0);
  assert.equal(most, 25, "the pass's sends go out together");
  assert.equal(next, T0, "the rest are due now: woken again at once");
  assert.equal(sql.exec(`SELECT COUNT(*) AS n FROM gone_notices`).toArray()[0].n, 5);
  ok("a long list goes out 25 at a time, the rest on the next wake");
}

console.log(`\nall ${n} passed`);
