/**
 * Telling the other apps that an account is gone, until each has heard it (MoneyLens ARCH-10,
 * docs/moneylens/accounts-requests.md). Deleting an account here leaves a row per app that keeps
 * something of its own for accounts (两清's receipts and ledgers; MoneyLens's records and keys once
 * it's bound). The hub tells each at once, and a row that fails waits and tries again (a minute,
 * then longer, a day at most), on the hub's alarm, until the app says it's done. The apps' own
 * `accountGone` is safe to call twice.
 *
 * Plain functions on the hub's SQL (tests/handoff.test.ts runs them on Node's SQLite).
 */
import type { Sql } from "./handoffCodes";

/** how long a row waits after each failure */
const WAITS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000, 24 * 3600_000];
export const waitAfter = (tries: number) => WAITS[Math.min(Math.max(tries, 1), WAITS.length) - 1];

export function goneTables(sql: Sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS gone_notices (user_id TEXT NOT NULL, app TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, PRIMARY KEY (user_id, app))`);
}

/** an account just deleted: a row for each of these apps, due now */
export function noteGone(sql: Sql, id: string, apps: string[], now = Date.now()) {
  for (const app of apps) sql.exec(`INSERT OR IGNORE INTO gone_notices (user_id, app, tries, next_at) VALUES (?, ?, 0, ?)`, id, app, now);
}

/**
 * Every row that's due, told to its app (`tell[app]`, missing: tried again in a day). A row is
 * gone once its app says it's done. Gives when the next row is due, or null if none are left.
 */
export async function sendGone(sql: Sql, tell: Record<string, ((id: string) => Promise<unknown>) | undefined>, now = Date.now()): Promise<number | null> {
  const due = sql.exec(`SELECT user_id, app, tries FROM gone_notices WHERE next_at <= ? ORDER BY next_at LIMIT 50`, now).toArray();
  for (const r of due) {
    const id = String(r.user_id);
    const app = String(r.app);
    const tries = Number(r.tries) + 1;
    const send = tell[app];
    let done = false;
    try {
      if (send) {
        await send(id);
        done = true;
      } else console.error(`hub: no way to tell ${app} that an account is gone (its binding is missing)`);
    } catch (e) {
      console.error(`hub: ${app} wasn't told an account is gone (try ${tries})`, e);
    }
    if (done) sql.exec(`DELETE FROM gone_notices WHERE user_id = ? AND app = ?`, id, app);
    else sql.exec(`UPDATE gone_notices SET tries = ?, next_at = ? WHERE user_id = ? AND app = ?`, tries, now + (send ? waitAfter(tries) : 24 * 3600_000), id, app);
  }
  const next = sql.exec(`SELECT MIN(next_at) AS at FROM gone_notices`).toArray()[0]?.at;
  return next == null ? null : Number(next);
}
