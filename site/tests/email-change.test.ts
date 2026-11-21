/**
 * 换邮箱 (worker/emailChange.ts) and the mail kept until it's out (worker/mailOut.ts), on Node's own
 * SQLite in place of the hub's: what MoneyLens asked for (docs/moneylens/accounts-requests.md,
 * request 3), and what the reviews of #704 asked for. A code goes to whatever new address is typed
 * (nothing said about it until it's typed back); it works once, for 10 minutes, for five tries
 * counted before the hash; only its hash is kept; codes to one address are spaced, whoever asks; an
 * address taken, banned or an admin's is turned away at the end; every change is kept in history.
 *
 *   npx tsx tests/email-change.test.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { confirmEmail, dropEmail, EMAIL_CODE_TTL, EMAIL_TRIES, EMAIL_WAIT, emailTables, forgetEmail, PER_ACCOUNT, PER_ADDRESS, startEmail } from "../worker/emailChange";
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
const confirm = (sql: Sql, me: typeof ANN, code: string, now = T0 + 1000) =>
  confirmEmail(sql, me, code, { hash: hashFor(me.id), unusable: (e) => BAD.has(e), ip: "203.0.113.9", device: "phone-1", now });
const emailOf = (sql: Sql, id: string) => String(sql.exec(`SELECT email FROM users WHERE id = ?`, id).toArray()[0]?.email);
const waiting = (sql: Sql, id: string) => sql.exec(`SELECT * FROM email_changes WHERE user_id = ?`, id).toArray()[0];
const error = (r: unknown) => (r as { json?: { error?: string } }).json?.error;
const codeOf = (r: unknown) => {
  assert.ok(r && typeof r === "object" && "code" in r, `a code was made (${JSON.stringify(r)})`);
  return (r as { code: string }).code;
};
const wrongFor = (code: string) => (code === "111111" ? "222222" : "111111");

// ---- asking for a code ----
{
  const sql = fresh();
  assert.equal(error(await start(sql, BOSS, "new@example.com")), "admin", "an admin's email stays put");
  assert.equal(error(await start(sql, ANN, "not-an-email")), "email", "an address that isn't one");
  assert.equal(error(await start(sql, ANN, "  ANN@Example.com ")), "same", "the address it already has, whatever the case");
  assert.equal(error(await start(sql, ANN, "new@example.com", T0, { allow: () => false })), "slow-down", "past the hourly limits");
  assert.equal(waiting(sql, ANN.id), undefined, "none of that left a code waiting");
  ok("asking: an admin, a bad address, the same one, or past the limits: no code");

  const r = await start(sql, ANN, "  New@Example.com ");
  const code = codeOf(r);
  assert.match(code, /^\d{6}$/, "six digits");
  assert.equal((r as { email: string }).email, "new@example.com", "the address tidied, lower case");
  const row = waiting(sql, ANN.id)!;
  assert.equal(row.email, "new@example.com");
  assert.equal(row.hash, (r as { hash: string }).hash);
  assert.ok(!JSON.stringify(row).includes(code), "only the code's hash is kept");
  assert.equal(Number(row.expires), T0 + EMAIL_CODE_TTL, "ten minutes");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com", "nothing changes until the code comes back");
  ok("a code for the new address: six digits, ten minutes, only its hash kept");

  assert.equal(error(await start(sql, ANN, "other@example.com", T0 + EMAIL_WAIT - 1)), "wait", "not again within 45 seconds");
  let asked = 0;
  await start(sql, ANN, "other@example.com", T0 + 1, { allow: () => (asked++, true) });
  assert.equal(asked, 0, "a request turned away for waiting doesn't use up the hourly limits");
  const again = codeOf(await start(sql, ANN, "other@example.com", T0 + EMAIL_WAIT));
  assert.equal(waiting(sql, ANN.id)!.email, "other@example.com", "a new code replaces the old one, address and all");
  if (again !== code) assert.equal(error(await confirm(sql, ANN, code, T0 + EMAIL_WAIT + 1)), "code", "the old code no longer works");
  ok("45 seconds between codes; a new one replaces the old");
}
{
  // nothing said about the address: taken, banned or an admin's, a code goes to it like any other
  const sql = fresh();
  for (const [i, to] of ["ben@example.com", "banned@example.com", "boss2@example.com"].entries()) {
    const me = { ...ANN, id: `u${String(i).padStart(12, "d")}`, email: `d${i}@example.com` };
    sql.exec(`INSERT INTO users (id, email) VALUES (?, ?)`, me.id, me.email);
    const r = await start(sql, me, to, T0 + i * EMAIL_WAIT);
    assert.ok("code" in r, `${to}: a code, as for any address`);
  }
  ok("asking says nothing about the address (taken, banned, an admin's): no looking up who has an account");
}
{
  // codes to one address are spaced, whoever asks (no mail-bombing a stranger from many accounts)
  const sql = fresh();
  codeOf(await start(sql, ANN, "target@example.com"));
  assert.equal(error(await start(sql, BEN, "target@example.com", T0 + 1000)), "wait", "another account, the same address, 1 s on");
  assert.equal(error(await start(sql, BEN, "elsewhere@example.com", T0 + 1000, { recent: (e) => e === "elsewhere@example.com" })), "wait", "a sign-in code to it moments ago");
  codeOf(await start(sql, BEN, "target@example.com", T0 + EMAIL_WAIT));
  let address = "";
  await start(sql, { ...ANN, id: "ueeeeeeeeeeee" }, " X2@Example.com ", T0, { allow: (e) => ((address = e), true) });
  assert.equal(address, "x2@example.com", "the limits are asked about the tidied address");
  ok("one address: 45 seconds between codes whoever asks, sign-in codes counted; its hourly limit asked by address");
}
{
  // the spacing and the hourly limits hold whatever became of the codes (typed back, given up on, expired)
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "target@example.com"));
  for (let i = 0; i <= EMAIL_TRIES; i++) await confirm(sql, ANN, wrongFor(code), T0 + 100 + i);
  assert.equal(waiting(sql, ANN.id), undefined, "the code given up on");
  assert.equal(error(await start(sql, ANN, "target@example.com", T0 + 1000)), "wait", "the account still waits");
  assert.equal(error(await start(sql, BEN, "target@example.com", T0 + 1000)), "wait", "the address still waits");
  const t = (i: number) => T0 + i * EMAIL_WAIT;
  for (let i = 1; i < PER_ACCOUNT; i++) codeOf(await start(sql, ANN, `a${i}@example.com`, t(i)));
  assert.equal(error(await start(sql, ANN, "a9@example.com", t(PER_ACCOUNT))), "slow-down", `${PER_ACCOUNT} an hour per account`);
  const others = Array.from({ length: PER_ADDRESS }, (_, i) => ({ ...ANN, id: `u${String(i).padStart(12, "f")}`, email: `f${i}@example.com` }));
  for (let i = 1; i < PER_ADDRESS; i++) codeOf(await start(sql, others[i], "target@example.com", t(i)));
  assert.equal(error(await start(sql, others[0], "target@example.com", t(PER_ADDRESS))), "slow-down", `${PER_ADDRESS} an hour to one address, whoever asks`);
  assert.ok("code" in (await start(sql, others[0], "target@example.com", T0 + 3600_000 + 1)), "an hour on, again");
  forgetEmail(sql, ANN.id);
  for (const tb of ["email_changes", "email_history", "email_sent"]) assert.equal(sql.exec(`SELECT COUNT(*) AS n FROM ${tb} WHERE user_id = ?`, ANN.id).toArray()[0].n, 0, tb);
  ok("spacing and hourly limits (per account, per address) hold after a code is given up on; a deleted account leaves nothing of its own");
}
{
  // a throwaway account, deleted, doesn't clear the address's spacing or limit
  const sql = fresh();
  codeOf(await start(sql, ANN, "victim@example.com"));
  forgetEmail(sql, ANN.id);
  assert.equal(error(await start(sql, BEN, "victim@example.com", T0 + 1000)), "wait", "the address still waits");
  const t = (i: number) => T0 + i * EMAIL_WAIT;
  for (let i = 1; i < PER_ADDRESS; i++) {
    const me = { ...ANN, id: `u${String(i).padStart(12, "g")}`, email: `g${i}@example.com` };
    codeOf(await start(sql, me, "victim@example.com", t(i)));
    forgetEmail(sql, me.id);
  }
  assert.equal(error(await start(sql, BEN, "victim@example.com", t(PER_ADDRESS))), "slow-down", "and its hourly limit holds");
  ok("deleting the account that asked doesn't reset the new address's spacing or limit");
}
{
  // two requests at once for one account: one gets the code, the other waits
  const sql = fresh();
  const [a, b] = await Promise.all([start(sql, ANN, "one@example.com"), start(sql, ANN, "two@example.com")]);
  const got = [a, b].filter((r) => "code" in r);
  assert.equal(got.length, 1, "exactly one code");
  assert.equal(error("code" in a ? b : a), "wait");
  const r = got[0] as { email: string; hash: string };
  assert.equal(waiting(sql, ANN.id)!.email, r.email);
  assert.equal(waiting(sql, ANN.id)!.hash, r.hash, "the row holds the code that was given");
  ok("two requests at once: one code, the slot taken before the hash");

  // the mail with an older code didn't go out: dropping it leaves a newer code alone
  dropEmail(sql, ANN.id, "an older code's hash");
  assert.ok(waiting(sql, ANN.id), "a newer code stays");
  dropEmail(sql, ANN.id, r.hash);
  assert.equal(waiting(sql, ANN.id), undefined, "its own goes");
  ok("a mail that didn't go out drops only its own code");
}

// ---- typing it back ----
{
  const sql = fresh();
  assert.equal(error(await confirm(sql, ANN, "123456")), "none", "no code asked for");
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  assert.equal(error(await confirm(sql, ANN, wrongFor(code))), "code", "a wrong code");
  assert.equal(error(await confirm(sql, ANN, "12a456")), "code", "not six digits");
  assert.equal(Number(waiting(sql, ANN.id)!.attempts), 2, "each try counted");
  assert.equal(error(await confirm(sql, BEN, code)), "none", "another account can't use it");

  const r = await confirm(sql, ANN, code);
  assert.deepEqual(r, { old: "ann@example.com", email: "new@example.com" }, "the right code: old and new address back");
  assert.equal(emailOf(sql, ANN.id), "new@example.com", "the account's email changed");
  assert.equal(waiting(sql, ANN.id), undefined, "the code is spent");
  assert.equal(error(await confirm(sql, ANN, code)), "none", "and works once");
  const h = sql.exec(`SELECT * FROM email_history WHERE user_id = ?`, ANN.id).toArray().map((x) => ({ ...x }));
  assert.deepEqual(h, [{ user_id: ANN.id, old: "ann@example.com", new: "new@example.com", at: T0 + 1000, ip: "203.0.113.9", device: "phone-1" }]);
  ok("the right code: the email changes, once, and the change is kept (old, new, when, IP, phone)");
}
{
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  assert.equal(error(await confirm(sql, ANN, code, T0 + EMAIL_CODE_TTL + 1)), "expired", "ten minutes on, no good");
  assert.equal(waiting(sql, ANN.id), undefined, "and forgotten");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
  ok("expired after ten minutes");
}
{
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  for (let i = 0; i < EMAIL_TRIES; i++) assert.equal(error(await confirm(sql, ANN, wrongFor(code))), "code");
  assert.equal(error(await confirm(sql, ANN, code)), "tries", "after five wrong tries even the right code is turned away");
  assert.equal(waiting(sql, ANN.id), undefined, "and the code forgotten");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
  ok("five wrong tries and the code is gone");
}
{
  // tries sent all at once: each counts before the hash, so no more than five are weighed
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  const guesses = Array.from({ length: 40 }, (_, i) => String(100000 + i)).filter((g) => g !== code);
  let weighed = 0;
  const counting = { hash: async (e: string, c: string) => (weighed++, hashFor(ANN.id)(e, c)), unusable: () => false, ip: "", device: "", now: T0 + 1000 };
  const answers = await Promise.all(guesses.map((g) => confirmEmail(sql, ANN, g, counting)));
  assert.equal(weighed, EMAIL_TRIES, `five weighed, not ${guesses.length}`);
  assert.ok(answers.every((a) => ["code", "tries", "none"].includes(String(error(a)))), "the rest turned away");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
  ok("forty guesses at once: five weighed");
}
{
  // the right code twice at once: one changes the email, the other finds the code spent
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  const [a, b] = await Promise.all([confirm(sql, ANN, code), confirm(sql, ANN, code)]);
  assert.equal([a, b].filter((r) => "old" in r).length, 1, "exactly one goes through");
  assert.equal(error("old" in a ? b : a), "none");
  assert.equal(emailOf(sql, ANN.id), "new@example.com");
  ok("the right code twice at once: one change");
}
{
  // the address taken (someone signed up meanwhile), banned, or one the settings make an admin's
  for (const [to, why] of [
    ["ben@example.com", "taken"],
    ["banned@example.com", "unusable"],
    ["boss2@example.com", "unusable"],
  ] as const) {
    const sql = fresh();
    const code = codeOf(await start(sql, ANN, to));
    assert.equal(error(await confirm(sql, ANN, code)), why, to);
    assert.equal(emailOf(sql, ANN.id), "ann@example.com", "the email stays");
    assert.equal(waiting(sql, ANN.id), undefined, "and the code is spent");
  }
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "late@example.com"));
  sql.exec(`INSERT INTO users (id, email) VALUES (?, ?)`, "udddddddddddd", "late@example.com");
  assert.equal(error(await confirm(sql, ANN, code)), "taken", "someone signed up with it while the code was on its way");
  ok("at the end: an address taken, banned or an admin's isn't used (and only its owner hears why)");
}
{
  // made an admin while the code was on its way
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  assert.equal(error(await confirm(sql, { ...ANN, admin: true }, code)), "admin", "an admin's email stays put at the end too");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
  ok("made an admin meanwhile: the email stays");
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
