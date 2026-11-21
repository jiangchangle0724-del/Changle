/**
 * 换邮箱 (MoneyLens's request 3, ARCH-9: a lost mailbox shouldn't mean a lost account). Signed in,
 * someone asks for a code at the new address; typed back, the account's email changes. The hub
 * (worker/hub.ts, `emailStart` and `emailConfirm`) adds the mail out, the note to the old address
 * and the word to MoneyLens.
 *
 * - one code at a time per account: 10 minutes, five tries, each try counted before the wait for
 *   the hash, so tries sent all at once can't slip in under the five
 * - 45 s between codes, and the hub's limits on top (5 an hour per account, 20 per IP), asked
 *   before saying an address is taken, so it can't be used to find out who has an account
 * - the code is kept only as a hash, tied to the account and the new address
 * - an admin's email stays put: their rights (the owner's too) go by the email in the settings
 * - the new address is checked again at the end: someone may have signed up with it meanwhile
 *
 * `tests/email-change.test.ts` holds it to all of that.
 */
import type { Sql } from "./handoffCodes";

export const EMAIL_CODE_TTL = 10 * 60_000;
export const EMAIL_WAIT = 45_000;
export const EMAIL_TRIES = 5;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function emailTables(sql: Sql) {
  sql.exec(
    `CREATE TABLE IF NOT EXISTS email_changes (user_id TEXT PRIMARY KEY, email TEXT NOT NULL, hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL)`,
  );
}

type Me = { id: string; email: string; admin: boolean };
type No = { status: number; json: { error: string } };
const no = (status: number, error: string): No => ({ status, json: { error } });
const one = (sql: Sql, q: string, ...args: (string | number)[]) => sql.exec(q, ...args).toArray()[0];

/** Forget the account's waiting code (a code typed back, or the mail with it that didn't go out). */
export function dropEmail(sql: Sql, id: string) {
  sql.exec(`DELETE FROM email_changes WHERE user_id = ?`, id);
}

/**
 * Step one: the new address checked, a code made and its hash kept. Gives back the code for the
 * mail to the new address, or why not. `allow` is the hub's hourly limits, asked once the request
 * is well-formed and not too soon, before anything is said about the address; `hash` is the hub's
 * peppered hash of the address and the code.
 */
export async function startEmail(
  sql: Sql,
  me: Me,
  raw: string,
  x: { banned(email: string): boolean; allow(): boolean; hash(email: string, code: string): Promise<string>; now?: number },
): Promise<No | { email: string; code: string }> {
  const email = raw.trim().toLowerCase();
  if (me.admin) return no(403, "admin");
  if (!EMAIL_RE.test(email)) return no(400, "email");
  if (email === me.email.toLowerCase()) return no(400, "same");
  const now = x.now ?? Date.now();
  const prev = one(sql, `SELECT sent_at FROM email_changes WHERE user_id = ?`, me.id);
  if (prev && now - Number(prev.sent_at) < EMAIL_WAIT) return no(429, "wait");
  // (the limits come before "taken" and "banned", so nobody can ask about address after address)
  if (!x.allow()) return no(429, "slow-down");
  if (x.banned(email)) return no(403, "banned");
  if (one(sql, `SELECT id FROM users WHERE email = ?`, email)) return no(409, "taken");
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const hash = await x.hash(email, code);
  sql.exec(
    `INSERT INTO email_changes (user_id, email, hash, expires, attempts, sent_at) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, hash = excluded.hash, expires = excluded.expires, attempts = 0, sent_at = excluded.sent_at`,
    me.id,
    email,
    hash,
    now + EMAIL_CODE_TTL,
    now,
  );
  return { email, code };
}

/** Step two: the code typed back. On a match the account's email is changed; gives back the old and new address, or why not. */
export async function confirmEmail(
  sql: Sql,
  me: Me,
  code: string,
  x: { hash(email: string, code: string): Promise<string>; now?: number },
): Promise<No | { old: string; email: string }> {
  const p = one(sql, `SELECT email, hash, expires, attempts FROM email_changes WHERE user_id = ?`, me.id);
  if (!p) return no(400, "none");
  if (Number(p.expires) < (x.now ?? Date.now())) return dropEmail(sql, me.id), no(400, "expired");
  if (Number(p.attempts) >= EMAIL_TRIES) return dropEmail(sql, me.id), no(429, "tries");
  if (me.admin) return dropEmail(sql, me.id), no(403, "admin");
  // the try counts now, before the wait below
  sql.exec(`UPDATE email_changes SET attempts = attempts + 1 WHERE user_id = ?`, me.id);
  const email = String(p.email);
  if (!/^\d{6}$/.test(code) || (await x.hash(email, code)) !== String(p.hash)) return no(400, "code");
  // (two right codes at once: only the one that still finds the code goes on)
  if (!one(sql, `SELECT user_id FROM email_changes WHERE user_id = ? AND hash = ?`, me.id, String(p.hash))) return no(400, "none");
  dropEmail(sql, me.id);
  if (one(sql, `SELECT id FROM users WHERE email = ? AND id != ?`, email, me.id)) return no(409, "taken");
  const was = one(sql, `SELECT email FROM users WHERE id = ?`, me.id);
  if (!was) return no(400, "none");
  sql.exec(`UPDATE users SET email = ? WHERE id = ?`, email, me.id);
  return { old: String(was.email), email };
}
