/**
 * Membership on the hub (docs/membership.md): who is a member until when, and how many of their
 * free uses each account has had of each counted tool (src/shared/member.ts). The hub runs one
 * request at a time, so a use is checked and counted in one step: a fourth use can't slip past.
 */
import { COUNTED, FREE_USES, LIFE_SLOTS, type Counted, type Membership, type Standing, type Tier, type UseResult } from "../src/shared/member";

export function memberSchema(q: (s: string) => void) {
  // `until` null = for life; `source` stripe | admin; `by` the account that gave it (admin)
  q(`CREATE TABLE IF NOT EXISTS members (uid TEXT PRIMARY KEY, tier TEXT NOT NULL, until INTEGER, since INTEGER NOT NULL, source TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', by TEXT NOT NULL DEFAULT '')`);
  // free uses had, per account and tool (counted only while not a member)
  q(`CREATE TABLE IF NOT EXISTS uses (uid TEXT NOT NULL, tool TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (uid, tool))`);
  // each lifetime membership bought with Stripe (worker/stripe.ts), from the moment checkout opens:
  // `session` its Checkout Session; `state` open (paying now, until `expires`) | pending (paid by a
  // slow method, not landed yet) | paid | refunded | disputed | ended | gone (left, or failed).
  // An open or pending one holds one of the five, so a sixth can't be sold while someone pays.
  q(`CREATE TABLE IF NOT EXISTS life_sales (session TEXT PRIMARY KEY, uid TEXT NOT NULL, mode TEXT NOT NULL, state TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', expires INTEGER NOT NULL, pi TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL)`);
}

/** The account's membership while it runs; null when it has none or it ended. */
export function memberOf(sql: SqlStorage, uid: string, now: number): Membership | null {
  const r = sql.exec(`SELECT tier, until, since FROM members WHERE uid = ?`, uid).toArray()[0];
  if (!r) return null;
  const life = r.tier === "life";
  const until = r.until == null ? null : Number(r.until);
  if (!life && (until === null || until <= now)) return null;
  return { tier: String(r.tier) as Tier, until: life ? null : until, since: Number(r.since) };
}

const usedOf = (sql: SqlStorage, uid: string, tool: Counted) => Number(sql.exec(`SELECT n FROM uses WHERE uid = ? AND tool = ?`, uid, tool).toArray()[0]?.n ?? 0);

export function standingOf(sql: SqlStorage, uid: string, now: number, master: boolean): Standing {
  const left = Object.fromEntries(COUNTED.map((t) => [t, Math.max(0, FREE_USES - usedOf(sql, uid, t))])) as Record<Counted, number>;
  return { member: memberOf(sql, uid, now), master, left };
}

/** One use of a counted tool: always for a member or the owner; for anyone else while free uses last, and then it's counted. */
export function useTool(sql: SqlStorage, uid: string, tool: Counted, now: number, master: boolean): UseResult {
  if (master || memberOf(sql, uid, now)) return { ok: true, member: true, left: null };
  const n = usedOf(sql, uid, tool);
  if (n >= FREE_USES) return { ok: false, member: false, left: 0 };
  sql.exec(`INSERT INTO uses (uid, tool, n) VALUES (?, ?, 1) ON CONFLICT (uid, tool) DO UPDATE SET n = n + 1`, uid, tool);
  return { ok: true, member: false, left: FREE_USES - n - 1 };
}

/**
 * Lifetime memberships still for sale: a lifetime one given by the owner takes one of the five too,
 * and so does one someone is paying for right now (life_sales).
 */
export function lifeLeft(sql: SqlStorage, now = Date.now()): number {
  const had = Number(sql.exec(`SELECT COUNT(*) AS n FROM members WHERE tier = 'life'`).one().n);
  const held = Number(
    sql.exec(`SELECT COUNT(DISTINCT uid) AS n FROM life_sales WHERE state IN ('open', 'pending') AND expires > ? AND uid NOT IN (SELECT uid FROM members WHERE tier = 'life')`, now).one().n,
  );
  return Math.max(0, LIFE_SLOTS - had - held);
}

/**
 * Paid with Stripe through `until` (worker/stripe.ts): a month or a year, never shortening one
 * that runs longer (months the owner gave on top), and never touching a lifetime one.
 */
export function setPaid(sql: SqlStorage, uid: string, tier: "month" | "year", until: number, now: number) {
  sql.exec(
    `INSERT INTO members (uid, tier, until, since, source, note, by) VALUES (?, ?, ?, ?, 'stripe', '', '')
     ON CONFLICT (uid) DO UPDATE SET tier = excluded.tier, until = MAX(COALESCE(members.until, 0), excluded.until),
       since = CASE WHEN members.until > ? THEN members.since ELSE excluded.since END, source = 'stripe'
     WHERE members.tier != 'life'`,
    uid,
    tier,
    until,
    now,
    now,
  );
}

/** A paid month or year ended (cancelled, or never paid after all): it runs no later than `at`. */
export function endPaid(sql: SqlStorage, uid: string, at: number) {
  sql.exec(`UPDATE members SET until = MIN(COALESCE(until, ?), ?) WHERE uid = ? AND tier IN ('month', 'year')`, at, at, uid);
}

/** A lifetime membership paid for: for good, whatever ran before it. */
export function setLife(sql: SqlStorage, uid: string, now: number) {
  sql.exec(
    `INSERT INTO members (uid, tier, until, since, source, note, by) VALUES (?, 'life', NULL, ?, 'stripe', '', '')
     ON CONFLICT (uid) DO UPDATE SET tier = 'life', until = NULL, since = excluded.since, source = 'stripe'`,
    uid,
    now,
  );
}

/** A paid lifetime membership taken back (refunded, or the payment disputed): its place is for sale again. */
export function dropLife(sql: SqlStorage, uid: string) {
  sql.exec(`DELETE FROM members WHERE uid = ? AND tier = 'life' AND source = 'stripe'`, uid);
}

/** The same day of the month, `months` later (the 31st becomes the month's last day). */
export function addMonths(from: number, months: number): number {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

/**
 * The owner gives a membership: some months (added to the end of one that's running), or a
 * lifetime one while any of the five are left. A lifetime member needs nothing more.
 */
export function grant(sql: SqlStorage, uid: string, what: { life: true } | { months: number }, note: string, by: string, now: number): { ok: true } | { error: "full" | "life" | "bad" } {
  const cur = memberOf(sql, uid, now);
  if (cur?.tier === "life") return { error: "life" };
  if ("life" in what) {
    if (lifeLeft(sql) <= 0) return { error: "full" };
    sql.exec(
      `INSERT INTO members (uid, tier, until, since, source, note, by) VALUES (?, 'life', NULL, ?, 'admin', ?, ?)
       ON CONFLICT (uid) DO UPDATE SET tier = 'life', until = NULL, since = excluded.since, source = 'admin', note = excluded.note, by = excluded.by`,
      uid,
      now,
      note,
      by,
    );
    return { ok: true };
  }
  const months = Math.floor(what.months);
  if (!(months >= 1 && months <= 120)) return { error: "bad" };
  const until = addMonths(cur?.until && cur.until > now ? cur.until : now, months);
  sql.exec(
    `INSERT INTO members (uid, tier, until, since, source, note, by) VALUES (?, 'gift', ?, ?, 'admin', ?, ?)
     ON CONFLICT (uid) DO UPDATE SET tier = CASE WHEN members.until > ? THEN members.tier ELSE 'gift' END, until = excluded.until,
       since = CASE WHEN members.until > ? THEN members.since ELSE excluded.since END, note = excluded.note, by = excluded.by`,
    uid,
    until,
    now,
    note,
    by,
    now,
    now,
  );
  return { ok: true };
}

/** The owner ends a membership now (a refund, a mistake). */
export function revoke(sql: SqlStorage, uid: string): boolean {
  return sql.exec(`DELETE FROM members WHERE uid = ?`, uid).rowsWritten > 0;
}

export type MemberRow = Membership & { uid: string; name: string; email: string; source: string; note: string; active: boolean };

/** Every membership the hub knows, running ones first, newest first. */
export function listMembers(sql: SqlStorage, now: number): MemberRow[] {
  return sql
    .exec(`SELECT m.uid, m.tier, m.until, m.since, m.source, m.note, u.name, u.email FROM members m LEFT JOIN users u ON u.id = m.uid ORDER BY m.since DESC`)
    .toArray()
    .map((r) => {
      const life = r.tier === "life";
      const until = r.until == null ? null : Number(r.until);
      return {
        uid: String(r.uid),
        tier: String(r.tier) as Tier,
        until: life ? null : until,
        since: Number(r.since),
        source: String(r.source),
        note: String(r.note),
        name: String(r.name ?? ""),
        email: String(r.email ?? ""),
        active: life || (until !== null && until > now),
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active));
}
