/**
 * 换邮箱 (MoneyLens's request 3, ARCH-9: a lost mailbox shouldn't mean a lost account), made so a
 * phone left signed in can't be used to take the account (Steve 2026-11-21, 更稳). Signed in,
 * someone asks to move to a new address; a code goes to it, and one to the address the account has
 * now. Then either:
 *
 * - both codes typed back: the email changes at once, or
 * - the address it has now is lost (only the new code): the change waits three days. The address
 *   it has now is mailed at once, with a link that cancels it (the hub, `/email/cancel`), and any
 *   of the account's phones can cancel it too. On the day it's checked again and made.
 *
 * Either way, when it's made, the account's other phones are signed out (the hub). The rules:
 *
 * - asking says nothing about the new address (taken, banned, an admin's): the code goes to
 *   whatever is typed, and only someone who can read it hears, at the end, that it can't be used
 * - one code pair at a time per account: 10 minutes, five tries, each try counted before the wait
 *   for the hashes, so tries sent all at once can't slip in under the five
 * - 45 s between codes per account and per address (a sign-in code to the address counts too), and
 *   5 an hour per account, 6 per address: counted in `email_sent`, which a code typed back, given
 *   up on or expired, or its account deleted, doesn't clear; the hub's per-IP limit on top
 * - the codes are kept only as hashes, tied to the account and the address, and never the same; a
 *   wrong code for the address the account has now ends the pair (each guess costs a new pair)
 * - an admin's email stays put, and no account moves onto an address that would make it one: the
 *   rights (the owner's too) go by the emails in the settings
 * - one change waiting at a time; a new one can't start until it's made or cancelled
 * - every change made is kept (email_history: old, new, when, which IP and phone) for the owner
 *
 * `tests/email-change.test.ts` holds it to all of that; `tests/hub.test.ts` the hub's part.
 */
import { b64url, sha256, type Sql } from "./handoffCodes";

export const EMAIL_CODE_TTL = 10 * 60_000;
export const EMAIL_WAIT = 45_000;
export const EMAIL_TRIES = 5;
/** how long a change waits when the address the account has now is lost */
export const PENDING_WAIT = 3 * 24 * 3600_000;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const PER_ACCOUNT = 5;
export const PER_ADDRESS = 6;
const HOUR = 3600_000;

export function emailTables(sql: Sql) {
  // the codes waiting: `hash` for the new address's, `old_hash` for the one the account has now
  sql.exec(
    `CREATE TABLE IF NOT EXISTS email_changes (user_id TEXT PRIMARY KEY, email TEXT NOT NULL, hash TEXT NOT NULL, old_hash TEXT NOT NULL DEFAULT '', expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL)`,
  );
  const cols = sql.exec(`PRAGMA table_info(email_changes)`).toArray().map((r) => String(r.name));
  if (!cols.includes("old_hash")) sql.exec(`ALTER TABLE email_changes ADD COLUMN old_hash TEXT NOT NULL DEFAULT ''`);
  // each code given, kept an hour, for the spacing and the limits
  sql.exec(`CREATE TABLE IF NOT EXISTS email_sent (user_id TEXT NOT NULL, email TEXT NOT NULL, at INTEGER NOT NULL)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS email_sent_by ON email_sent (user_id, at)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS email_sent_to ON email_sent (email, at)`);
  // a change waiting its three days: the link's hash, and the phone that asked (it stays signed in)
  sql.exec(
    `CREATE TABLE IF NOT EXISTS email_pending (user_id TEXT PRIMARY KEY, email TEXT NOT NULL, due_at INTEGER NOT NULL, cancel_hash TEXT NOT NULL, session TEXT NOT NULL, lang TEXT NOT NULL, ip TEXT NOT NULL, device TEXT NOT NULL, made_at INTEGER NOT NULL)`,
  );
  sql.exec(`CREATE INDEX IF NOT EXISTS email_pending_link ON email_pending (cancel_hash)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS email_history (user_id TEXT NOT NULL, old TEXT NOT NULL, new TEXT NOT NULL, at INTEGER NOT NULL, ip TEXT NOT NULL, device TEXT NOT NULL)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS email_history_by ON email_history (user_id, at)`);
}

type Me = { id: string; email: string; admin: boolean };
type No = { status: number; json: { error: string } };
const no = (status: number, error: string): No => ({ status, json: { error } });
const one = (sql: Sql, q: string, ...args: (string | number)[]) => sql.exec(q, ...args).toArray()[0];
const sixDigits = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
/** (the code for the address the account has now is hashed under this, so the two codes can't stand in for each other) */
export const oldKey = (email: string) => `now|${email}`;

/**
 * Forget the account's waiting codes: typed back, or the account signed out everywhere or deleted.
 * With `hash`, only those codes (the mail with them didn't go out; a newer request keeps its own).
 */
export function dropEmail(sql: Sql, id: string, hash?: string) {
  if (hash) sql.exec(`DELETE FROM email_changes WHERE user_id = ? AND hash = ?`, id, hash);
  else sql.exec(`DELETE FROM email_changes WHERE user_id = ?`, id);
}

/**
 * A deleted account: its waiting codes, a waiting change and its history go. Its codes given stay
 * counted for their addresses until the hour is up, no longer tied to it (or a throwaway account,
 * deleted, would clear an address's spacing and limit).
 */
export function forgetEmail(sql: Sql, id: string) {
  dropEmail(sql, id);
  sql.exec(`DELETE FROM email_pending WHERE user_id = ?`, id);
  sql.exec(`DELETE FROM email_history WHERE user_id = ?`, id);
  sql.exec(`UPDATE email_sent SET user_id = '' WHERE user_id = ?`, id);
}

/**
 * Step one: a code for the new address and one for the address the account has now, their hashes
 * kept. Gives back both codes for the mail (and the new one's hash, to drop them if a mail doesn't
 * go out), or why not. `recent`: a sign-in code went to the new address in the last 45 s. `allow`:
 * the hub's own limits (per IP, and the address's shared with sign-in), asked last. `hash`: the
 * hub's peppered hash of an address and a code.
 */
export async function startEmail(
  sql: Sql,
  me: Me,
  raw: string,
  x: { recent(email: string): boolean; allow(email: string): boolean; hash(email: string, code: string): Promise<string>; now?: number },
): Promise<No | { email: string; code: string; oldCode: string; hash: string }> {
  const email = raw.trim().toLowerCase();
  if (me.admin) return no(403, "admin");
  if (one(sql, `SELECT 1 AS x FROM email_pending WHERE user_id = ?`, me.id)) return no(409, "pending");
  if (!EMAIL_RE.test(email)) return no(400, "email");
  if (email === me.email.toLowerCase()) return no(400, "same");
  const now = x.now ?? Date.now();
  sql.exec(`DELETE FROM email_changes WHERE expires < ?`, now);
  sql.exec(`DELETE FROM email_sent WHERE at <= ?`, now - HOUR);
  const given = (by: "user_id" | "email", v: string, since: number) => Number(one(sql, `SELECT COUNT(*) AS n FROM email_sent WHERE ${by} = ? AND at > ?`, v, since)?.n ?? 0);
  if (given("user_id", me.id, now - EMAIL_WAIT) || given("email", email, now - EMAIL_WAIT) || x.recent(email)) return no(429, "wait");
  if (given("user_id", me.id, now - HOUR) >= PER_ACCOUNT || given("email", email, now - HOUR) >= PER_ADDRESS || !x.allow(email)) return no(429, "slow-down");
  const code = sixDigits();
  let oldCode = sixDigits();
  // (never the same: whoever reads the new address mustn't hold the other code too)
  while (oldCode === code) oldCode = sixDigits();
  // the slot is taken before the wait for the hashes, so two requests at once can't both get codes
  sql.exec(`INSERT INTO email_sent (user_id, email, at) VALUES (?, ?, ?)`, me.id, email, now);
  const held = `held:${crypto.randomUUID()}`;
  sql.exec(
    `INSERT INTO email_changes (user_id, email, hash, old_hash, expires, attempts, sent_at) VALUES (?, ?, ?, '', ?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, hash = excluded.hash, old_hash = '', expires = excluded.expires, attempts = 0, sent_at = excluded.sent_at`,
    me.id,
    email,
    held,
    now + EMAIL_CODE_TTL,
    now,
  );
  const hash = await x.hash(email, code);
  const oldHash = await x.hash(oldKey(me.email.toLowerCase()), oldCode);
  if (!one(sql, `SELECT 1 AS x FROM email_changes WHERE user_id = ? AND hash = ?`, me.id, held)) return no(429, "wait");
  sql.exec(`UPDATE email_changes SET hash = ?, old_hash = ? WHERE user_id = ? AND hash = ?`, hash, oldHash, me.id, held);
  return { email, code, oldCode, hash };
}

type Made = { old: string; email: string };
type Waiting = { email: string; due: number; token: string };

/**
 * Step two: the codes typed back. With both (`oldCode`), the change is made now; with only the new
 * one and `lost`, it waits three days (`token`: for the cancel link to the address it has now).
 * Gives back what happened, or why not. `unusable`: the address is banned, or the settings would
 * make an account with it an admin. `session`: the asking phone's (it stays signed in).
 */
export async function confirmEmail(
  sql: Sql,
  me: Me,
  typed: { code: string; oldCode?: string; lost?: boolean },
  x: {
    hash(email: string, code: string): Promise<string>;
    unusable(email: string): boolean;
    ip: string;
    device: string;
    session: string;
    lang: "zh" | "en";
    now?: number;
  },
): Promise<No | { made: Made } | { waiting: Waiting }> {
  const now = x.now ?? Date.now();
  const p = one(sql, `SELECT email, hash, old_hash, expires, attempts FROM email_changes WHERE user_id = ?`, me.id);
  if (!p) return no(400, "none");
  if (Number(p.expires) < now) return dropEmail(sql, me.id), no(400, "expired");
  if (Number(p.attempts) >= EMAIL_TRIES) return dropEmail(sql, me.id), no(429, "tries");
  if (me.admin) return dropEmail(sql, me.id), no(403, "admin");
  // the try counts now, before the waits below
  sql.exec(`UPDATE email_changes SET attempts = attempts + 1 WHERE user_id = ?`, me.id);
  const email = String(p.email);
  const lost = typed.lost === true;
  if (!/^\d{6}$/.test(typed.code) || (await x.hash(email, typed.code)) !== String(p.hash)) return no(400, "code");
  if (!lost) {
    // (the new code was right, so whoever this is reads the new address: a wrong guess at the other
    // code ends the pair, each guess costing a new pair, and a new mail to the current address)
    const old = String(typed.oldCode ?? "");
    if (!/^\d{6}$/.test(old) || !p.old_hash || (await x.hash(oldKey(me.email.toLowerCase()), old)) !== String(p.old_hash)) {
      dropEmail(sql, me.id, String(p.hash));
      return no(400, "old-code");
    }
  }
  // (for the wait: the cancel link, made before the last check so nothing waits after it)
  const token = lost ? b64url(crypto.getRandomValues(new Uint8Array(32))) : "";
  const tokenHash = lost ? await sha256(token) : "";
  // (two right answers at once: only the one that still finds the codes goes on)
  if (!one(sql, `SELECT user_id FROM email_changes WHERE user_id = ? AND hash = ?`, me.id, String(p.hash))) return no(400, "none");
  dropEmail(sql, me.id);
  if (!lost) {
    const made = makeEmail(sql, me.id, email, { unusable: x.unusable, ip: x.ip, device: x.device, now });
    return "status" in made ? made : { made };
  }
  // the wait: said now if the address can't be used, and checked again on the day
  if (x.unusable(email)) return no(400, "unusable");
  if (one(sql, `SELECT id FROM users WHERE email = ? AND id != ?`, email, me.id)) return no(409, "taken");
  if (one(sql, `SELECT 1 AS x FROM email_pending WHERE user_id = ?`, me.id)) return no(409, "pending");
  const due = now + PENDING_WAIT;
  sql.exec(
    `INSERT INTO email_pending (user_id, email, due_at, cancel_hash, session, lang, ip, device, made_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    me.id,
    email,
    due,
    tokenHash,
    x.session,
    x.lang,
    x.ip,
    x.device,
    now,
  );
  return { waiting: { email, due, token } };
}

/** The change made: the address checked (unusable, taken), the account's email set, the change kept. */
export function makeEmail(sql: Sql, id: string, email: string, x: { unusable(email: string): boolean; ip: string; device: string; now: number }): No | Made {
  if (x.unusable(email)) return no(400, "unusable");
  if (one(sql, `SELECT id FROM users WHERE email = ? AND id != ?`, email, id)) return no(409, "taken");
  const was = one(sql, `SELECT email FROM users WHERE id = ?`, id);
  if (!was) return no(400, "none");
  sql.exec(`UPDATE users SET email = ? WHERE id = ?`, email, id);
  sql.exec(`INSERT INTO email_history (user_id, old, new, at, ip, device) VALUES (?, ?, ?, ?, ?, ?)`, id, String(was.email), email, x.now, x.ip, x.device);
  return { old: String(was.email), email };
}

/** the account's waiting change, if any: the new address and when it's made */
export function pendingOf(sql: Sql, id: string): { email: string; at: number } | null {
  const r = one(sql, `SELECT email, due_at FROM email_pending WHERE user_id = ?`, id);
  return r ? { email: String(r.email), at: Number(r.due_at) } : null;
}

/** cancel the account's waiting change (from one of its phones); false when there was none */
export function cancelPending(sql: Sql, id: string): boolean {
  const had = !!one(sql, `SELECT 1 AS x FROM email_pending WHERE user_id = ?`, id);
  sql.exec(`DELETE FROM email_pending WHERE user_id = ?`, id);
  return had;
}

/** cancel a waiting change by its link (from the address the account has now): the account, or null */
export async function cancelByLink(sql: Sql, token: unknown): Promise<string | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const h = await sha256(token);
  const r = one(sql, `SELECT user_id FROM email_pending WHERE cancel_hash = ?`, h);
  if (!r) return null;
  sql.exec(`DELETE FROM email_pending WHERE cancel_hash = ?`, h);
  return String(r.user_id);
}

/** the changes whose day has come, taken off the waiting list (the hub makes them) */
export function takeDue(sql: Sql, now: number) {
  const rows = sql.exec(`SELECT user_id, email, session, lang, ip, device FROM email_pending WHERE due_at <= ? ORDER BY due_at LIMIT 25`, now).toArray();
  for (const r of rows) sql.exec(`DELETE FROM email_pending WHERE user_id = ?`, String(r.user_id));
  return rows.map((r) => ({ id: String(r.user_id), email: String(r.email), session: String(r.session), lang: (r.lang === "en" ? "en" : "zh") as "zh" | "en", ip: String(r.ip), device: String(r.device) }));
}

/** the site paused: nothing is made while it is (nobody can cancel then), so what's due waits another hour */
export function postponeDue(sql: Sql, now: number) {
  sql.exec(`UPDATE email_pending SET due_at = ? WHERE due_at <= ?`, now + HOUR, now);
}

/** when the next waiting change is due (null: none) */
export function nextPending(sql: Sql): number | null {
  const at = one(sql, `SELECT MIN(due_at) AS at FROM email_pending`)?.at;
  return at == null ? null : Number(at);
}
