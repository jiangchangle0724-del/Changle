/**
 * 换邮箱 (worker/emailChange.ts) and the mail kept until it's out (worker/mailOut.ts), on Node's own
 * SQLite in place of the hub's: what MoneyLens asked for (docs/moneylens/accounts-requests.md,
 * request 3), what the reviews of #704 asked for, and Steve's 更稳 (2026-11-21). Codes go to the new
 * address and to the one the account has now (nothing said about the new one until they're typed
 * back); both typed back, the email changes at once; only the new one, the change waits three days
 * and can be cancelled, by link or from the account; codes work once, for 10 minutes, for five
 * tries counted before the hashes; only hashes are kept; codes to one address are spaced, whoever
 * asks; an address taken, banned or an admin's isn't used; every change is kept in history.
 *
 *   npx tsx tests/email-change.test.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  cancelByLink,
  cancelPending,
  confirmEmail,
  dropEmail,
  EMAIL_CODE_TTL,
  EMAIL_TRIES,
  EMAIL_WAIT,
  emailTables,
  forgetEmail,
  makeEmail,
  nextPending,
  PENDING_WAIT,
  PER_ACCOUNT,
  PER_ADDRESS,
  afterPause,
  pendingOf,
  postponeDue,
  startEmail,
  takeDue,
} from "../worker/emailChange";
import { waitAfter } from "../worker/goneNotices";
import type { Sql } from "../worker/handoffCodes";
import { GIVE_UP, mailTables, nextMail, queueMail, sendMail, type Mail } from "../worker/mailOut";

let n = 0;
const ok = (what: string) => console.log(`ok   ${++n}. ${what}`);

/** Node's SQLite, shaped like a Durable Object's `ctx.storage.sql` (it runs at once, as a Durable Object's does) */
function sqlite(): Sql & { db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    exec: (q, ...args) => {
      const rows = db.prepare(q).all(...args) as Record<string, unknown>[];
      return { toArray: () => rows };
    },
  };
}

const T0 = 1_800_000_000_000;
const ANN = { id: "uaaaaaaaaaaaa", email: "ann@example.com", admin: false };
const BEN = { id: "ubbbbbbbbbbbb", email: "ben@example.com", admin: false };
const BOSS = { id: "ucccccccccccc", email: "boss@example.com", admin: true };

function fresh() {
  const sql = sqlite();
  sql.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL)`);
  for (const u of [ANN, BEN, BOSS]) sql.exec(`INSERT INTO users (id, email) VALUES (?, ?)`, u.id, u.email);
  emailTables(sql);
  mailTables(sql);
  return sql;
}
/** like the hub's: peppered, tied to the account and the address, and it takes a moment */
const hashFor = (id: string) => async (email: string, code: string) => {
  await new Promise((r) => setTimeout(r, 1));
  return createHash("sha256").update(`pepper|email|${id}|${email}|${code}`).digest("base64url");
};
type More = Partial<{ recent(e: string): boolean; allow(e: string): boolean }>;
const start = (sql: Sql, me: typeof ANN, email: string, now = T0, more: More = {}) =>
  startEmail(sql, me, email, { recent: () => false, allow: () => true, hash: hashFor(me.id), now, ...more });
const BAD = new Set(["banned@example.com", "boss2@example.com"]);
type Typed = { code: string; oldCode?: string; lost?: boolean };
const confirm = (sql: Sql, me: typeof ANN, typed: Typed, now = T0 + 1000) =>
  confirmEmail(sql, me, typed, { hash: hashFor(me.id), unusable: (e) => BAD.has(e), ip: "203.0.113.9", device: "phone-1", session: "session-of-ann", lang: "zh", now });
const emailOf = (sql: Sql, id: string) => String(sql.exec(`SELECT email FROM users WHERE id = ?`, id).toArray()[0]?.email);
const waiting = (sql: Sql, id: string) => sql.exec(`SELECT * FROM email_changes WHERE user_id = ?`, id).toArray()[0];
const error = (r: unknown) => (r as { json?: { error?: string } }).json?.error;
type Got = { email: string; code: string; oldCode: string; hash: string };
const codesOf = (r: unknown) => {
  assert.ok(r && typeof r === "object" && "code" in r, `codes were made (${JSON.stringify(r)})`);
  return r as Got;
};
const wrongFor = (code: string) => (code === "111111" ? "222222" : "111111");
const both = (g: Got): Typed => ({ code: g.code, oldCode: g.oldCode });

// ---- asking for the codes ----
{
  const sql = fresh();
  assert.equal(error(await start(sql, BOSS, "new@example.com")), "admin", "an admin's email stays put");
  assert.equal(error(await start(sql, ANN, "not-an-email")), "email", "an address that isn't one");
  assert.equal(error(await start(sql, ANN, "  ANN@Example.com ")), "same", "the address it already has, whatever the case");
  assert.equal(error(await start(sql, ANN, "new@example.com", T0, { allow: () => false })), "slow-down", "past the hourly limits");
  assert.equal(waiting(sql, ANN.id), undefined, "none of that left a code waiting");
  ok("asking: an admin, a bad address, the same one, or past the limits: no codes");

  const g = codesOf(await start(sql, ANN, "  New@Example.com "));
  assert.match(g.code, /^\d{6}$/, "six digits for the new address");
  assert.match(g.oldCode, /^\d{6}$/, "and six for the one it has now");
  assert.equal(g.email, "new@example.com", "the address tidied, lower case");
  const row = waiting(sql, ANN.id)!;
  assert.equal(row.email, "new@example.com");
  assert.equal(row.hash, g.hash);
  assert.ok(row.old_hash && row.old_hash !== row.hash);
  assert.ok(!JSON.stringify(row).includes(g.code) && !JSON.stringify(row).includes(g.oldCode), "only the codes' hashes are kept");
  assert.equal(Number(row.expires), T0 + EMAIL_CODE_TTL, "ten minutes");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com", "nothing changes until the codes come back");
  ok("codes for the new address and the one it has now: six digits each, ten minutes, only hashes kept");

  assert.equal(error(await start(sql, ANN, "other@example.com", T0 + EMAIL_WAIT - 1)), "wait", "not again within 45 seconds");
  let asked = 0;
  await start(sql, ANN, "other@example.com", T0 + 1, { allow: () => (asked++, true) });
  assert.equal(asked, 0, "a request turned away for waiting doesn't use up the hourly limits");
  const again = codesOf(await start(sql, ANN, "other@example.com", T0 + EMAIL_WAIT));
  assert.equal(waiting(sql, ANN.id)!.email, "other@example.com", "new codes replace the old ones, address and all");
  if (again.code !== g.code) assert.equal(error(await confirm(sql, ANN, both(g), T0 + EMAIL_WAIT + 1)), "code", "the old codes no longer work");
  ok("45 seconds between codes; new ones replace the old");
}
{
  // nothing said about the address: taken, banned or an admin's, a code goes to it like any other
  const sql = fresh();
  for (const [i, to] of ["ben@example.com", "banned@example.com", "boss2@example.com"].entries()) {
    const me = { ...ANN, id: `u${String(i).padStart(12, "d")}`, email: `d${i}@example.com` };
    sql.exec(`INSERT INTO users (id, email) VALUES (?, ?)`, me.id, me.email);
    const r = await start(sql, me, to, T0 + i * EMAIL_WAIT);
    assert.ok("code" in r, `${to}: codes, as for any address`);
  }
  ok("asking says nothing about the address (taken, banned, an admin's): no looking up who has an account");
}
{
  // codes to one address are spaced, whoever asks (no mail-bombing a stranger from many accounts)
  const sql = fresh();
  codesOf(await start(sql, ANN, "target@example.com"));
  assert.equal(error(await start(sql, BEN, "target@example.com", T0 + 1000)), "wait", "another account, the same address, 1 s on");
  assert.equal(error(await start(sql, BEN, "elsewhere@example.com", T0 + 1000, { recent: (e) => e === "elsewhere@example.com" })), "wait", "a sign-in code to it moments ago");
  codesOf(await start(sql, BEN, "target@example.com", T0 + EMAIL_WAIT));
  let address = "";
  await start(sql, { ...ANN, id: "ueeeeeeeeeeee" }, " X2@Example.com ", T0, { allow: (e) => ((address = e), true) });
  assert.equal(address, "x2@example.com", "the limits are asked about the tidied address");
  ok("one address: 45 seconds between codes whoever asks, sign-in codes counted; its hourly limit asked by address");
}
{
  // the spacing and the hourly limits hold whatever became of the codes (typed back, given up on, expired)
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "target@example.com"));
  for (let i = 0; i <= EMAIL_TRIES; i++) await confirm(sql, ANN, { code: wrongFor(g.code), oldCode: g.oldCode }, T0 + 100 + i);
  assert.equal(waiting(sql, ANN.id), undefined, "the codes given up on");
  assert.equal(error(await start(sql, ANN, "target@example.com", T0 + 1000)), "wait", "the account still waits");
  assert.equal(error(await start(sql, BEN, "target@example.com", T0 + 1000)), "wait", "the address still waits");
  const t = (i: number) => T0 + i * EMAIL_WAIT;
  for (let i = 1; i < PER_ACCOUNT; i++) codesOf(await start(sql, ANN, `a${i}@example.com`, t(i)));
  assert.equal(error(await start(sql, ANN, "a9@example.com", t(PER_ACCOUNT))), "slow-down", `${PER_ACCOUNT} an hour per account`);
  const others = Array.from({ length: PER_ADDRESS }, (_, i) => ({ ...ANN, id: `u${String(i).padStart(12, "f")}`, email: `f${i}@example.com` }));
  for (let i = 1; i < PER_ADDRESS; i++) codesOf(await start(sql, others[i], "target@example.com", t(i)));
  assert.equal(error(await start(sql, others[0], "target@example.com", t(PER_ADDRESS))), "slow-down", `${PER_ADDRESS} an hour to one address, whoever asks`);
  assert.ok("code" in (await start(sql, others[0], "target@example.com", T0 + 3600_000 + 1)), "an hour on, again");
  ok("spacing and hourly limits (per account, per address) hold after codes are given up on");
}
{
  // a throwaway account, deleted, doesn't clear the address's spacing or limit
  const sql = fresh();
  codesOf(await start(sql, ANN, "victim@example.com"));
  forgetEmail(sql, ANN.id);
  for (const tb of ["email_changes", "email_history", "email_sent", "email_pending"]) assert.equal(sql.exec(`SELECT COUNT(*) AS n FROM ${tb} WHERE user_id = ?`, ANN.id).toArray()[0].n, 0, tb);
  assert.equal(error(await start(sql, BEN, "victim@example.com", T0 + 1000)), "wait", "the address still waits");
  const t = (i: number) => T0 + i * EMAIL_WAIT;
  for (let i = 1; i < PER_ADDRESS; i++) {
    const me = { ...ANN, id: `u${String(i).padStart(12, "g")}`, email: `g${i}@example.com` };
    codesOf(await start(sql, me, "victim@example.com", t(i)));
    forgetEmail(sql, me.id);
  }
  assert.equal(error(await start(sql, BEN, "victim@example.com", t(PER_ADDRESS))), "slow-down", "and its hourly limit holds");
  ok("a deleted account leaves nothing of its own, and doesn't reset the new address's spacing or limit");
}
{
  // two requests at once for one account: one gets the codes, the other waits
  const sql = fresh();
  const [a, b] = await Promise.all([start(sql, ANN, "one@example.com"), start(sql, ANN, "two@example.com")]);
  const got = [a, b].filter((r) => "code" in r);
  assert.equal(got.length, 1, "exactly one pair");
  assert.equal(error("code" in a ? b : a), "wait");
  const g = got[0] as Got;
  assert.equal(waiting(sql, ANN.id)!.email, g.email);
  assert.equal(waiting(sql, ANN.id)!.hash, g.hash, "the row holds the codes that were given");
  ok("two requests at once: one pair of codes, the slot taken before the hashes");

  dropEmail(sql, ANN.id, "an older code's hash");
  assert.ok(waiting(sql, ANN.id), "a newer pair stays");
  dropEmail(sql, ANN.id, g.hash);
  assert.equal(waiting(sql, ANN.id), undefined, "its own goes");
  ok("a mail that didn't go out drops only its own codes");
}

// ---- both codes typed back: changed at once ----
{
  const sql = fresh();
  assert.equal(error(await confirm(sql, ANN, { code: "123456", oldCode: "123456" })), "none", "no codes asked for");
  const w = codesOf(await start(sql, ANN, "new@example.com"));
  assert.notEqual(w.code, w.oldCode, "the two codes are never the same");
  assert.equal(error(await confirm(sql, ANN, { code: wrongFor(w.code), oldCode: w.oldCode })), "code", "the new address's code wrong");
  assert.equal(error(await confirm(sql, ANN, { code: w.oldCode, oldCode: w.code })), "code", "the two swapped");
  assert.equal(error(await confirm(sql, ANN, { code: "12a456", oldCode: w.oldCode })), "code", "not six digits");
  assert.equal(Number(waiting(sql, ANN.id)!.attempts), 3, "each try counted");
  assert.equal(error(await confirm(sql, BEN, both(w))), "none", "another account can't use them");
  assert.equal(error(await confirm(sql, ANN, { code: w.code, oldCode: wrongFor(w.oldCode) })), "old-code", "the current address's code wrong");
  assert.equal(waiting(sql, ANN.id), undefined, "and with that, the pair is gone (each guess at it costs a new pair)");
  assert.equal(error(await confirm(sql, ANN, both(w))), "none", "even the right codes, after");
  const g = codesOf(await start(sql, ANN, "new@example.com", T0 + EMAIL_WAIT));
  assert.equal(error(await confirm(sql, ANN, { code: g.code }, T0 + EMAIL_WAIT + 1)), "old-code", "the current address's code missing");
  const g2 = codesOf(await start(sql, ANN, "new@example.com", T0 + 2 * EMAIL_WAIT));

  const r = await confirm(sql, ANN, both(g2), T0 + 1000 + 2 * EMAIL_WAIT);
  assert.deepEqual(r, { made: { old: "ann@example.com", email: "new@example.com" } }, "both right: made now, old and new address back");
  assert.equal(emailOf(sql, ANN.id), "new@example.com", "the account's email changed");
  assert.equal(waiting(sql, ANN.id), undefined, "the codes are spent");
  assert.equal(error(await confirm(sql, ANN, both(g2))), "none", "and work once");
  const h = sql.exec(`SELECT * FROM email_history WHERE user_id = ?`, ANN.id).toArray().map((x) => ({ ...x }));
  assert.deepEqual(h, [{ user_id: ANN.id, old: "ann@example.com", new: "new@example.com", at: T0 + 1000 + 2 * EMAIL_WAIT, ip: "203.0.113.9", device: "phone-1" }]);
  assert.equal(pendingOf(sql, ANN.id), null, "nothing waiting");
  ok("both codes right: the email changes at once, once, and the change is kept; a wrong guess at the current address's code ends the pair");
}
{
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "new@example.com"));
  assert.equal(error(await confirm(sql, ANN, both(g), T0 + EMAIL_CODE_TTL + 1)), "expired", "ten minutes on, no good");
  assert.equal(waiting(sql, ANN.id), undefined, "and forgotten");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
  ok("expired after ten minutes");
}
{
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "new@example.com"));
  for (let i = 0; i < EMAIL_TRIES; i++) assert.equal(error(await confirm(sql, ANN, { code: wrongFor(g.code), oldCode: g.oldCode })), "code");
  assert.equal(error(await confirm(sql, ANN, both(g))), "tries", "after five wrong tries even the right codes are turned away");
  assert.equal(waiting(sql, ANN.id), undefined, "and the codes forgotten");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
  ok("five wrong tries and the codes are gone");
}
{
  // tries sent all at once: each counts before the hashes, so no more than five are weighed
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "new@example.com"));
  const guesses = Array.from({ length: 40 }, (_, i) => String(100000 + i)).filter((x) => x !== g.code);
  let weighed = 0;
  const counting = { hash: async (e: string, c: string) => (weighed++, hashFor(ANN.id)(e, c)), unusable: () => false, ip: "", device: "", session: "", lang: "zh" as const, now: T0 + 1000 };
  const answers = await Promise.all(guesses.map((x) => confirmEmail(sql, ANN, { code: x, oldCode: g.oldCode }, counting)));
  assert.equal(weighed, EMAIL_TRIES, `five weighed, not ${guesses.length}`);
  assert.ok(answers.every((a) => ["code", "tries", "none"].includes(String(error(a)))), "the rest turned away");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
  ok("forty guesses at once: five weighed");
}
{
  // the right codes twice at once: one changes the email, the other finds them spent
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "new@example.com"));
  const [a, b] = await Promise.all([confirm(sql, ANN, both(g)), confirm(sql, ANN, both(g))]);
  assert.equal([a, b].filter((r) => "made" in r).length, 1, "exactly one goes through");
  assert.equal(error("made" in a ? b : a), "none");
  assert.equal(emailOf(sql, ANN.id), "new@example.com");
  ok("the right codes twice at once: one change");
}
{
  // the address taken (someone signed up meanwhile), banned, or one the settings make an admin's
  for (const [to, why] of [
    ["ben@example.com", "taken"],
    ["banned@example.com", "unusable"],
    ["boss2@example.com", "unusable"],
  ] as const) {
    for (const lost of [false, true]) {
      const sql = fresh();
      const g = codesOf(await start(sql, ANN, to));
      assert.equal(error(await confirm(sql, ANN, lost ? { code: g.code, lost } : both(g))), why, `${to}${lost ? " (waiting)" : ""}`);
      assert.equal(emailOf(sql, ANN.id), "ann@example.com", "the email stays");
      assert.equal(pendingOf(sql, ANN.id), null, "nothing waits");
      assert.equal(waiting(sql, ANN.id), undefined, "and the codes are spent");
    }
  }
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "late@example.com"));
  sql.exec(`INSERT INTO users (id, email) VALUES (?, ?)`, "udddddddddddd", "late@example.com");
  assert.equal(error(await confirm(sql, ANN, both(g))), "taken", "someone signed up with it while the codes were on their way");
  ok("at the end: an address taken, banned or an admin's isn't used, now or to wait (and only its owner hears why)");
}
{
  // made an admin while the codes were on their way
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "new@example.com"));
  assert.equal(error(await confirm(sql, { ...ANN, admin: true }, both(g))), "admin", "an admin's email stays put at the end too");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
  ok("made an admin meanwhile: the email stays");
}

// ---- only the new code (the current address lost): the change waits three days ----
{
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "new@example.com"));
  assert.equal(error(await confirm(sql, ANN, { code: wrongFor(g.code), lost: true })), "code", "the new code still has to be right");
  const r = (await confirm(sql, ANN, { code: g.code, lost: true })) as { waiting: { email: string; due: number; token: string } };
  assert.ok("waiting" in r, JSON.stringify(r));
  assert.equal(r.waiting.email, "new@example.com");
  assert.equal(r.waiting.due, T0 + 1000 + PENDING_WAIT, "three days on");
  assert.match(r.waiting.token, /^[A-Za-z0-9_-]{43}$/, "a link's key: 256 random bits");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com", "nothing changes yet");
  assert.deepEqual(pendingOf(sql, ANN.id), { email: "new@example.com", at: T0 + 1000 + PENDING_WAIT }, "the account sees what waits");
  const row = sql.exec(`SELECT * FROM email_pending WHERE user_id = ?`, ANN.id).toArray()[0];
  assert.ok(!JSON.stringify(row).includes(r.waiting.token), "only the link's hash is kept");
  assert.equal(row.session, "session-of-ann", "and the phone that asked");
  assert.equal(nextPending(sql), T0 + 1000 + PENDING_WAIT);
  assert.equal(error(await start(sql, ANN, "other@example.com", T0 + 3600_000)), "pending", "no new change while one waits");
  ok("only the new code: the change waits three days, the account sees it, the link's key comes back (only its hash kept)");

  assert.deepEqual(takeDue(sql, T0 + PENDING_WAIT), [], "not before its day");
  assert.deepEqual(takeDue(sql, T0 + 1000 + PENDING_WAIT), [{ id: ANN.id, email: "new@example.com", session: "session-of-ann", lang: "zh", ip: "203.0.113.9", device: "phone-1" }]);
  assert.equal(pendingOf(sql, ANN.id), null, "taken off the list on its day");
  const made = makeEmail(sql, ANN.id, "new@example.com", { unusable: () => false, ip: "203.0.113.9", device: "phone-1", now: T0 + PENDING_WAIT + 1000 });
  assert.deepEqual(made, { old: "ann@example.com", email: "new@example.com" });
  assert.equal(emailOf(sql, ANN.id), "new@example.com");
  ok("on its day: taken off the list and made (the hub signs the other phones out and tells the old address)");
}
{
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "new@example.com"));
  const r = (await confirm(sql, ANN, { code: g.code, lost: true })) as { waiting: { token: string } };
  assert.equal(cancelPending(sql, BEN.id), false, "another account has nothing to cancel");
  assert.equal(await cancelByLink(sql, "x".repeat(43)), null, "a made-up link");
  assert.equal(await cancelByLink(sql, r.waiting.token.slice(1)), null, "a link cut short");
  assert.equal(await cancelByLink(sql, r.waiting.token), ANN.id, "the link cancels it");
  assert.equal(pendingOf(sql, ANN.id), null);
  assert.equal(await cancelByLink(sql, r.waiting.token), null, "and works once");
  assert.equal(nextPending(sql), null);
  assert.deepEqual(takeDue(sql, T0 + 10 * PENDING_WAIT), [], "nothing made on the day");
  const g2 = codesOf(await start(sql, ANN, "new2@example.com", T0 + 3600_000 * 2));
  await confirm(sql, ANN, { code: g2.code, lost: true }, T0 + 3600_000 * 2 + 1);
  assert.equal(cancelPending(sql, ANN.id), true, "one of the account's phones cancels it too");
  assert.equal(pendingOf(sql, ANN.id), null);
  assert.equal(emailOf(sql, ANN.id), "ann@example.com", "the email never changed");
  ok("a waiting change is cancelled by its link (once) or from the account");
}
{
  // the site paused on the day: nothing is made (nobody can cancel then), it waits another hour
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "new@example.com"));
  await confirm(sql, ANN, { code: g.code, lost: true });
  const day = T0 + 1000 + PENDING_WAIT;
  postponeDue(sql, day + 5);
  assert.deepEqual(takeDue(sql, day + 5), [], "not made while paused");
  assert.equal(pendingOf(sql, ANN.id)?.at, day + 5 + 3600_000, "an hour later");
  afterPause(sql, day + 10);
  assert.equal(pendingOf(sql, ANN.id)?.at, day + 10 + 24 * 3600_000, "open again: at least a day more");
  afterPause(sql, T0);
  assert.equal(pendingOf(sql, ANN.id)?.at, day + 10 + 24 * 3600_000, "(never sooner than it was)");
  assert.equal(takeDue(sql, day + 10 + 24 * 3600_000).length, 1, "and then it's made");
  ok("paused on its day: the change waits another hour at a time, and once open again at least a day more");
}
{
  // on its day the address is checked again: someone signed up with it meanwhile
  const sql = fresh();
  const g = codesOf(await start(sql, ANN, "new@example.com"));
  await confirm(sql, ANN, { code: g.code, lost: true });
  sql.exec(`INSERT INTO users (id, email) VALUES (?, ?)`, "udddddddddddd", "new@example.com");
  const [due] = takeDue(sql, T0 + 1000 + PENDING_WAIT);
  assert.equal(error(makeEmail(sql, ANN.id, due.email, { unusable: () => false, ip: "", device: "", now: T0 + PENDING_WAIT })), "taken");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
  assert.equal(error(makeEmail(sql, ANN.id, "x@example.com", { unusable: () => true, ip: "", device: "", now: T0 })), "unusable", "or banned meanwhile");
  ok("on its day the address is checked again (taken or banned meanwhile: not made)");
}

// ---- the mail kept until it's out ----
{
  const sql = fresh();
  const note: Mail = { to: "ann@example.com", subject: "s", html: "<p>h</p>", text: "t", replyTo: "contact@example.com" };
  queueMail(sql, note, T0);
  const got: Mail[] = [];
  let fails = 1;
  const deliver = async (m: Mail) => {
    if (fails-- > 0) throw new Error("resend down");
    got.push(m);
  };
  const woken: number[] = [];
  let next = await sendMail(sql, deliver, (at) => void woken.push(at), () => T0);
  assert.equal(next, T0 + waitAfter(1));
  assert.deepEqual(woken, [T0 + waitAfter(1)], "the alarm asked for before sending");
  assert.deepEqual(got, []);
  next = await sendMail(sql, deliver, () => {}, () => next!);
  assert.deepEqual(got, [note], "sent on the next try, as it was");
  assert.equal(next, null);
  ok("a mail that didn't go out is kept and tried again, and sent as it was");

  queueMail(sql, { ...note, replyTo: undefined }, T0);
  await sendMail(sql, async (m) => void got.push(m), () => {}, () => T0);
  assert.ok(!("replyTo" in got[1]), "no reply-to when none was given");
  queueMail(sql, note, T0);
  assert.equal(await sendMail(sql, () => new Promise(() => {}), () => {}, () => T0, 50), T0 + waitAfter(1), "no answer within the time limit: tried again later");
  assert.equal(await sendMail(sql, async () => {}, () => {}, () => T0 + GIVE_UP + 1), null, "a week on, given up");
  assert.equal(nextMail(sql), null);
  ok("no reply-to unless given; a time limit on each try; given up after a week");
}

console.log(`\nall ${n} passed`);
