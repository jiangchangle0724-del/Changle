/**
 * 换邮箱 (worker/emailChange.ts), on Node's own SQLite in place of the hub's: what MoneyLens asked
 * for (docs/moneylens/accounts-requests.md, request 3). A code goes to the new address and works
 * once, for 10 minutes, for five tries counted before the hash; only its hash is kept; an address
 * someone else has is turned away, at the start and again at the end; an admin's email stays put.
 *
 *   npx tsx tests/email-change.test.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { confirmEmail, dropEmail, EMAIL_CODE_TTL, EMAIL_TRIES, EMAIL_WAIT, emailTables, startEmail } from "../worker/emailChange";
import type { Sql } from "../worker/handoffCodes";

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
  return sql;
}
/** like the hub's: peppered, tied to the account and the address, and it takes a moment */
const hashFor = (id: string) => async (email: string, code: string) => {
  await new Promise((r) => setTimeout(r, 1));
  return createHash("sha256").update(`pepper|email|${id}|${email}|${code}`).digest("base64url");
};
const ok = () => true;
const nobody = () => false;
const start = (sql: Sql, me: typeof ANN, email: string, now = T0, more: Partial<{ banned(e: string): boolean; allow(): boolean }> = {}) =>
  startEmail(sql, me, email, { banned: nobody, allow: ok, hash: hashFor(me.id), now, ...more });
const confirm = (sql: Sql, me: typeof ANN, code: string, now = T0 + 1000) => confirmEmail(sql, me, code, { hash: hashFor(me.id), now });
const emailOf = (sql: Sql, id: string) => String(sql.exec(`SELECT email FROM users WHERE id = ?`, id).toArray()[0]?.email);
const waiting = (sql: Sql, id: string) => sql.exec(`SELECT * FROM email_changes WHERE user_id = ?`, id).toArray()[0];
const error = (r: unknown) => (r as { json?: { error?: string } }).json?.error;
const codeOf = (r: unknown) => {
  assert.ok(r && typeof r === "object" && "code" in r, `a code was made (${JSON.stringify(r)})`);
  return (r as { code: string }).code;
};

// ---- asking for a code ----
{
  const sql = fresh();
  assert.equal(error(await start(sql, BOSS, "new@example.com")), "admin", "an admin's email stays put");
  assert.equal(error(await start(sql, ANN, "not-an-email")), "email", "an address that isn't one");
  assert.equal(error(await start(sql, ANN, "  ANN@Example.com ")), "same", "the address it already has, whatever the case");
  assert.equal(error(await start(sql, ANN, "ben@example.com")), "taken", "another account's address");
  assert.equal(error(await start(sql, ANN, "BEN@example.com")), "taken", "another account's address, in capitals");
  assert.equal(error(await start(sql, ANN, "bad@example.com", T0, { banned: (e) => e === "bad@example.com" })), "banned", "a banned address");
  assert.equal(error(await start(sql, ANN, "new@example.com", T0, { allow: () => false })), "slow-down", "past the hourly limits");
  assert.equal(error(await start(sql, ANN, "ben@example.com", T0, { allow: () => false })), "slow-down", "past the limits, nothing said about the address");
  let counted = 0;
  await start(sql, ANN, "ben@example.com", T0, { allow: () => (counted++, true) });
  assert.equal(counted, 1, "asking about a taken address counts against the limits (no looking up who has an account)");
  assert.equal(waiting(sql, ANN.id), undefined, "none of that left a code waiting");

  const r = await start(sql, ANN, "  New@Example.com ");
  const code = codeOf(r);
  assert.match(code, /^\d{6}$/, "six digits");
  assert.equal((r as { email: string }).email, "new@example.com", "the address tidied, lower case");
  const row = waiting(sql, ANN.id)!;
  assert.equal(row.email, "new@example.com");
  assert.ok(!JSON.stringify(row).includes(code), "only the code's hash is kept");
  assert.equal(Number(row.expires), T0 + EMAIL_CODE_TTL, "ten minutes");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com", "nothing changes until the code comes back");

  assert.equal(error(await start(sql, ANN, "other@example.com", T0 + EMAIL_WAIT - 1)), "wait", "not again within 45 seconds");
  let asked = 0;
  await start(sql, ANN, "other@example.com", T0 + 1, { allow: () => (asked++, true) });
  assert.equal(asked, 0, "a request turned away for waiting doesn't use up the hourly limits");
  const again = codeOf(await start(sql, ANN, "other@example.com", T0 + EMAIL_WAIT));
  assert.equal(waiting(sql, ANN.id)!.email, "other@example.com", "a new code replaces the old one, address and all");
  if (again !== code) assert.equal(error(await confirm(sql, ANN, code, T0 + EMAIL_WAIT + 1)), "code", "the old code no longer works");
  dropEmail(sql, ANN.id);
  assert.equal(waiting(sql, ANN.id), undefined, "a code can be dropped (the mail with it didn't go out)");
}

// ---- typing it back ----
{
  const sql = fresh();
  assert.equal(error(await confirm(sql, ANN, "123456")), "none", "no code asked for");
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  const wrong = code === "111111" ? "222222" : "111111";
  assert.equal(error(await confirm(sql, ANN, wrong)), "code", "a wrong code");
  assert.equal(error(await confirm(sql, ANN, "12a456")), "code", "not six digits");
  assert.equal(Number(waiting(sql, ANN.id)!.attempts), 2, "each try counted");
  assert.equal(error(await confirm(sql, BEN, code)), "none", "another account can't use it");

  const r = await confirm(sql, ANN, code);
  assert.deepEqual(r, { old: "ann@example.com", email: "new@example.com" }, "the right code: old and new address back");
  assert.equal(emailOf(sql, ANN.id), "new@example.com", "the account's email changed");
  assert.equal(waiting(sql, ANN.id), undefined, "the code is spent");
  assert.equal(error(await confirm(sql, ANN, code)), "none", "and works once");
  assert.equal(error(await start(sql, BEN, "ann@example.com")), undefined, "the old address is free again");
}
{
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  assert.equal(error(await confirm(sql, ANN, code, T0 + EMAIL_CODE_TTL + 1)), "expired", "ten minutes on, no good");
  assert.equal(waiting(sql, ANN.id), undefined, "and forgotten");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
}
{
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  const wrong = code === "111111" ? "222222" : "111111";
  for (let i = 0; i < EMAIL_TRIES; i++) assert.equal(error(await confirm(sql, ANN, wrong)), "code");
  assert.equal(error(await confirm(sql, ANN, code)), "tries", "after five wrong tries even the right code is turned away");
  assert.equal(waiting(sql, ANN.id), undefined, "and the code forgotten");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
}
{
  // tries sent all at once: each counts before the hash, so no more than five are weighed
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  const guesses = Array.from({ length: 40 }, (_, i) => String(100000 + i)).filter((g) => g !== code);
  let weighed = 0;
  const counting = { hash: async (e: string, c: string) => (weighed++, hashFor(ANN.id)(e, c)), now: T0 + 1000 };
  const answers = await Promise.all(guesses.map((g) => confirmEmail(sql, ANN, g, counting)));
  assert.equal(weighed, EMAIL_TRIES, `five weighed, not ${guesses.length}`);
  assert.ok(answers.every((a) => ["code", "tries", "none"].includes(String(error(a)))), "the rest turned away");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
}
{
  // the right code twice at once: one changes the email, the other finds the code spent
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  const [a, b] = await Promise.all([confirm(sql, ANN, code), confirm(sql, ANN, code)]);
  assert.equal([a, b].filter((r) => "old" in r).length, 1, "exactly one goes through");
  assert.equal(error("old" in a ? b : a), "none");
  assert.equal(emailOf(sql, ANN.id), "new@example.com");
}
{
  // someone signs up with the address while the code is on its way
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  sql.exec(`INSERT INTO users (id, email) VALUES (?, ?)`, "udddddddddddd", "new@example.com");
  assert.equal(error(await confirm(sql, ANN, code)), "taken", "checked again at the end");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com", "the email stays");
  assert.equal(waiting(sql, ANN.id), undefined, "and the code is spent");
}
{
  // made an admin while the code was on its way
  const sql = fresh();
  const code = codeOf(await start(sql, ANN, "new@example.com"));
  assert.equal(error(await confirm(sql, { ...ANN, admin: true }, code)), "admin", "an admin's email stays put at the end too");
  assert.equal(emailOf(sql, ANN.id), "ann@example.com");
}

console.log("email change: all checks pass");
