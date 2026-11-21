/**
 * 换邮箱 (MoneyLens's request 3, ARCH-9: a lost mailbox shouldn't mean a lost account). Signed in,
 * someone asks for a code at the new address; typed back, the account's email changes. The hub
 * (worker/hub.ts, `emailStart` and `emailConfirm`) adds the mail out, the note to the old address
 * (kept until it's sent, mailOut.ts) and the word to MoneyLens.
 *
 * - asking says nothing about the address (taken, banned, an admin's): the code goes to whatever
 *   address is typed, and only someone who can read it hears, at the end, that it can't be used
 * - one code at a time per account: 10 minutes, five tries, each try counted before the wait for
 *   the hash, so tries sent all at once can't slip in under the five
 * - 45 s between codes per account and per address (a sign-in code to the address counts too), and
 *   5 an hour per account, 6 per address: counted in `email_sent`, which a code typed back, given
 *   up on or expired doesn't clear; the hub's per-IP limit on top
 * - the code is kept only as a hash, tied to the account and the new address
 * - an admin's email stays put, and no account moves onto an address that would make it one: the
 *   rights (the owner's too) go by the emails in the settings
 * - at the end the address is checked again: taken, banned or an admin's meanwhile, it isn't used
 * - every change is kept (email_history: old, new, when, which IP and phone) for the owner to act on
 *
 * `tests/email-change.test.ts` holds it to all of that.
 */
import type { Sql } from "./handoffCodes";

export const EMAIL_CODE_TTL = 10 * 60_000;
export const EMAIL_WAIT = 45_000;
export const EMAIL_TRIES = 5;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const PER_ACCOUNT = 5;
export const PER_ADDRESS = 6;
const HOUR = 3600_000;

export function emailTables(sql: Sql) {
  sql.exec(
    `CREATE TABLE IF NOT EXISTS email_changes (user_id TEXT PRIMARY KEY, email TEXT NOT NULL, hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL)`,
  );
  // each code given, kept an hour, for the spacing and the limits
  sql.exec(`CREATE TABLE IF NOT EXISTS email_sent (user_id TEXT NOT NULL, email TEXT NOT NULL, at INTEGER NOT NULL)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS email_sent_by ON email_sent (user_id, at)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS email_sent_to ON email_sent (email, at)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS email_history (user_id TEXT NOT NULL, old TEXT NOT NULL, new TEXT NOT NULL, at INTEGER NOT NULL, ip TEXT NOT NULL, device TEXT NOT NULL)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS email_history_by ON email_history (user_id, at)`);
}

type Me = { id: string; email: string; admin: boolean };
type No = { status: number; json: { error: string } };
const no = (status: number, error: string): No => ({ status, json: { error } });
const one = (sql: Sql, q: string, ...args: (string | number)[]) => sql.exec(q, ...args).toArray()[0];

/**
 * Forget the account's waiting code: typed back, or the account signed out everywhere or deleted.
 * With `hash`, only that code (the mail with it didn't go out; a newer request keeps its own).
 */
export function dropEmail(sql: Sql, id: string, hash?: string) {
  if (hash) sql.exec(`DELETE FROM email_changes WHERE user_id = ? AND hash = ?`, id, hash);
  else sql.exec(`DELETE FROM email_changes WHERE user_id = ?`, id);
}

/**
 * A deleted account: its waiting code and its history go. Its codes given stay counted for their
 * addresses until the hour is up, no longer tied to it (or a throwaway account, deleted, would
 * clear an address's spacing and limit).
 */
export function forgetEmail(sql: Sql, id: string) {
  dropEmail(sql, id);
  sql.exec(`DELETE FROM email_history WHERE user_id = ?`, id);
  sql.exec(`UPDATE email_sent SET user_id = '' WHERE user_id = ?`, id);
}

/**
 * Step one: a code made for the new address and its hash kept. Gives back the code for the mail
 * (and its hash, to drop it if the mail doesn't go out), or why not. `recent`: a sign-in code went
 * to the address in the last 45 s. `allow`: the hub's own limits (per IP, and the address's shared
 * with sign-in), asked last. `hash`: the hub's peppered hash of the address and the code.
 */
export async function startEmail(
  sql: Sql,
  me: Me,
  raw: string,
  x: { recent(email: string): boolean; allow(email: string): boolean; hash(email: string, code: string): Promise<string>; now?: number },
): Promise<No | { email: string; code: string; hash: string }> {
  const email = raw.trim().toLowerCase();
  if (me.admin) return no(403, "admin");
  if (!EMAIL_RE.test(email)) return no(400, "email");
  if (email === me.email.toLowerCase()) return no(400, "same");
  const now = x.now ?? Date.now();
  sql.exec(`DELETE FROM email_changes WHERE expires < ?`, now);
  sql.exec(`DELETE FROM email_sent WHERE at <= ?`, now - HOUR);
  const given = (by: "user_id" | "email", v: string, since: number) => Number(one(sql, `SELECT COUNT(*) AS n FROM email_sent WHERE ${by} = ? AND at > ?`, v, since)?.n ?? 0);
  if (given("user_id", me.id, now - EMAIL_WAIT) || given("email", email, now - EMAIL_WAIT) || x.recent(email)) return no(429, "wait");
  if (given("user_id", me.id, now - HOUR) >= PER_ACCOUNT || given("email", email, now - HOUR) >= PER_ADDRESS || !x.allow(email)) return no(429, "slow-down");
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  // the slot is taken before the wait for the hash, so two requests at once can't both get a code
  sql.exec(`INSERT INTO email_sent (user_id, email, at) VALUES (?, ?, ?)`, me.id, email, now);
  const held = `held:${crypto.randomUUID()}`;
  sql.exec(
    `INSERT INTO email_changes (user_id, email, hash, expires, attempts, sent_at) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, hash = excluded.hash, expires = excluded.expires, attempts = 0, sent_at = excluded.sent_at`,
    me.id,
    email,
    held,
    now + EMAIL_CODE_TTL,
    now,
  );
  const hash = await x.hash(email, code);
  if (!one(sql, `SELECT 1 AS x FROM email_changes WHERE user_id = ? AND hash = ?`, me.id, held)) return no(429, "wait");
  sql.exec(`UPDATE email_changes SET hash = ? WHERE user_id = ? AND hash = ?`, hash, me.id, held);
  return { email, code, hash };
}

/**
 * Step two: the code typed back. On a match the account's email is changed and the change kept in
 * email_history; gives back the old and new address, or why not. `unusable`: the address is banned,
 * or the settings would make an account with it an admin.
 */
export async function confirmEmail(
  sql: Sql,
  me: Me,
  code: string,
  x: { hash(email: string, code: string): Promise<string>; unusable(email: string): boolean; ip: string; device: string; now?: number },
): Promise<No | { old: string; email: string }> {
  const now = x.now ?? Date.now();
  const p = one(sql, `SELECT email, hash, expires, attempts FROM email_changes WHERE user_id = ?`, me.id);
  if (!p) return no(400, "none");
  if (Number(p.expires) < now) return dropEmail(sql, me.id), no(400, "expired");
  if (Number(p.attempts) >= EMAIL_TRIES) return dropEmail(sql, me.id), no(429, "tries");
  if (me.admin) return dropEmail(sql, me.id), no(403, "admin");
  // the try counts now, before the wait below
  sql.exec(`UPDATE email_changes SET attempts = attempts + 1 WHERE user_id = ?`, me.id);
  const email = String(p.email);
  if (!/^\d{6}$/.test(code) || (await x.hash(email, code)) !== String(p.hash)) return no(400, "code");
  // (two right codes at once: only the one that still finds the code goes on)
  if (!one(sql, `SELECT user_id FROM email_changes WHERE user_id = ? AND hash = ?`, me.id, String(p.hash))) return no(400, "none");
  dropEmail(sql, me.id);
  if (x.unusable(email)) return no(400, "unusable");
  if (one(sql, `SELECT id FROM users WHERE email = ? AND id != ?`, email, me.id)) return no(409, "taken");
  const was = one(sql, `SELECT email FROM users WHERE id = ?`, me.id);
  if (!was) return no(400, "none");
  sql.exec(`UPDATE users SET email = ? WHERE id = ?`, email, me.id);
  sql.exec(`INSERT INTO email_history (user_id, old, new, at, ip, device) VALUES (?, ?, ?, ?, ?, ?)`, me.id, String(was.email), email, now, x.ip, x.device);
  return { old: String(was.email), email };
}
