/**
 * Handoff codes (MoneyLens ARCH-3, docs/moneylens/accounts-requests.md): how a signed-in account
 * here reaches an app on its own domain (money.changle.ca) without its session token ever going
 * there. The main site asks for a code (`POST /api/handoff`, this account's session), sends the
 * browser on with it after a `#`, and the app trades it, server to server, through the `Handoff`
 * door (handoff.ts) for the account's id.
 *
 * A code is 256 random bits, good for 60 seconds and once, for one audience. Only its SHA-256 is
 * kept, with the account, the audience and the app's nonce (the app's own cookie, checked when it
 * trades the code, so nobody can slip their own code into someone else's browser). Five codes a
 * minute and 100 a day per account. A banned account has no session, so it gets none; one banned
 * while its code waits can't trade it, and signing out, being kicked or deleted drops any waiting.
 * Which apps an account has used (a code traded) is noted, so a deleted account's are told even
 * before their binding is in place (goneNotices.ts).
 *
 * Plain functions on the hub's SQL, so tests/handoff.test.ts can run them on Node's SQLite.
 */

/** the apps a code can be for */
export const AUDIENCES = ["moneylens"] as const;
/** each app's name in the "account gone" notices (goneNotices.ts, hub.ts tellGone) */
export const NOTICE_APP: Record<(typeof AUDIENCES)[number], string> = { moneylens: "money" };
export const CODE_TTL = 60_000;
export const PER_MINUTE = 5;
export const PER_DAY = 100;
/** what the app's nonce may look like */
export const NONCE = /^[A-Za-z0-9_-]{20,64}$/;
/** a code: 32 bytes, base64url without padding */
const CODE = /^[A-Za-z0-9_-]{43}$/;
/** an account id (hub.ts randomId: "u" and lower-case letters and digits) */
const ACCOUNT = /^u[a-z0-9]{6,24}$/;

type Value = string | number | null;
/** the part of a Durable Object's SQL these use (Node's SQLite is wrapped to match in the test) */
export type Sql = { exec(query: string, ...args: Value[]): { toArray(): Record<string, unknown>[] } };

export function handoffTables(sql: Sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS handoffs (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, aud TEXT NOT NULL, nonce TEXT NOT NULL, expires INTEGER NOT NULL)`);
  // when each code was given, for the limits (kept a day; a code traded is gone from handoffs, not from here)
  sql.exec(`CREATE TABLE IF NOT EXISTS handoffs_given (user_id TEXT NOT NULL, at INTEGER NOT NULL)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS handoffs_given_by ON handoffs_given (user_id, at)`);
  // the apps an account has used (a code traded), so they hear when it's deleted
  sql.exec(`CREATE TABLE IF NOT EXISTS handoff_apps (user_id TEXT NOT NULL, aud TEXT NOT NULL, PRIMARY KEY (user_id, aud))`);
}

/**
 * An account signed out, kicked or deleted: its waiting codes go (and, deleted, the rest it left
 * here). Gives the apps it had used, by their notice names, for the "gone" notices.
 */
export function forgetHandoffs(sql: Sql, id: string, deleted: boolean): string[] {
  sql.exec(`DELETE FROM handoffs WHERE user_id = ?`, id);
  if (!deleted) return [];
  const used = appsUsed(sql, id);
  sql.exec(`DELETE FROM handoff_apps WHERE user_id = ?`, id);
  sql.exec(`DELETE FROM handoffs_given WHERE user_id = ?`, id);
  return used;
}

/** the apps this account has used (a code traded), by their notice names */
export function appsUsed(sql: Sql, id: string): string[] {
  const rows = sql.exec(`SELECT aud FROM handoff_apps WHERE user_id = ?`, id).toArray();
  return rows.map((r) => NOTICE_APP[String(r.aud) as keyof typeof NOTICE_APP]).filter(Boolean);
}

function b64url(b: Uint8Array) {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(s: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}

/**
 * `POST /handoff`, body `{ aud, nonce }`: a code for the signed-in account `me` (null: 401). The
 * reply is what the hub sends back: `{ code }`, or `{ error }` with 400 (aud, nonce) or 429.
 */
export async function giveHandoff(sql: Sql, me: { id: string } | null, body: unknown, now = Date.now()): Promise<{ status: number; json: unknown }> {
  if (!me) return { status: 401, json: { error: "signin" } };
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof b.aud !== "string" || !(AUDIENCES as readonly string[]).includes(b.aud)) return { status: 400, json: { error: "aud" } };
  if (typeof b.nonce !== "string" || !NONCE.test(b.nonce)) return { status: 400, json: { error: "nonce" } };
  const code = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await sha256(code);
  // from here on nothing waits, so two requests can't both slip under the limit
  sql.exec(`DELETE FROM handoffs WHERE expires < ?`, now);
  sql.exec(`DELETE FROM handoffs_given WHERE at < ?`, now - 86_400_000);
  const count = (since: number) => Number(sql.exec(`SELECT COUNT(*) AS n FROM handoffs_given WHERE user_id = ? AND at > ?`, me.id, since).toArray()[0]?.n ?? 0);
  if (count(now - 60_000) >= PER_MINUTE || count(now - 86_400_000) >= PER_DAY) return { status: 429, json: { error: "slow-down" } };
  sql.exec(`INSERT INTO handoffs (hash, user_id, aud, nonce, expires) VALUES (?, ?, ?, ?, ?)`, hash, me.id, b.aud, b.nonce, now + CODE_TTL);
  sql.exec(`INSERT INTO handoffs_given (user_id, at) VALUES (?, ?)`, me.id, now);
  return { status: 200, json: { code } };
}

/**
 * A code traded by the app it was for: the account, or null (no such code, used, expired, for
 * another app, or the account gone or banned). Whatever the answer, the code is spent: looked up
 * and deleted with nothing waiting in between, so a second try is always null.
 */
export async function redeemHandoff(
  sql: Sql,
  code: unknown,
  aud: unknown,
  account: (id: string) => { banned: boolean; master: boolean } | null,
  now = Date.now(),
): Promise<{ id: string; master: boolean; nonce: string } | null> {
  if (typeof code !== "string" || !CODE.test(code) || typeof aud !== "string") return null;
  const hash = await sha256(code);
  const row = sql.exec(`SELECT user_id, aud, nonce, expires FROM handoffs WHERE hash = ?`, hash).toArray()[0];
  if (!row) return null;
  sql.exec(`DELETE FROM handoffs WHERE hash = ?`, hash);
  if (Number(row.expires) < now || row.aud !== aud) return null;
  const id = String(row.user_id);
  const u = account(id);
  if (!u || u.banned) return null;
  sql.exec(`INSERT OR IGNORE INTO handoff_apps (user_id, aud) VALUES (?, ?)`, id, aud);
  return { id, master: u.master, nonce: String(row.nonce) };
}

/**
 * Which of these accounts are still here (the app's weekly sweep). Anything wrong with the
 * question throws, an id that isn't one included: an answer of "none" would have the app delete
 * everyone's data.
 */
export function accountsThere(sql: Sql, ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((x) => typeof x !== "string" || !ACCOUNT.test(x))) throw new Error("exists: up to 100 account ids (u and 6 to 24 lower-case letters or digits)");
  const asked = [...new Set(ids as string[])];
  if (!asked.length) return [];
  const rows = sql.exec(`SELECT id FROM users WHERE id IN (${asked.map(() => "?").join(", ")})`, ...asked).toArray();
  return rows.map((r) => String(r.id));
}
