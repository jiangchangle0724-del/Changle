/**
 * Telling the other apps that an account is gone, until each has heard it (MoneyLens ARCH-10,
 * docs/moneylens/accounts-requests.md). Deleting an account here leaves a row per app that keeps
 * something of its own for it (两清's receipts and ledgers, when it's bound; MoneyLens's records
 * and keys, when the account has used it, bound yet or not). The hub tells each at once, and a row
 * that fails waits and tries again (a minute, then longer, a day at most) on the hub's alarm, until
 * the app answers. The apps' own `accountGone` is safe to call twice, and throws when it fails.
 * An email changed (换邮箱, emailChange.ts) rides the same rows as app "money-changed": MoneyLens's
 * `accountChanged`, for an account that has used it.
 *
 * Plain functions on the hub's SQL (tests/handoff.test.ts runs them on Node's SQLite).
 */
import type { Sql } from "./handoffCodes";

/** how long a row waits after each failure */
const WAITS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000, 24 * 3600_000];
export const waitAfter = (tries: number) => WAITS[Math.min(Math.max(tries, 1), WAITS.length) - 1];

export function goneTables(sql: Sql) {
  // `ver`: bumped when the same notice is noted again while one waits or is on its way, so a send
  // that started before can't count for the newer one
  sql.exec(`CREATE TABLE IF NOT EXISTS gone_notices (user_id TEXT NOT NULL, app TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, ver INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, app))`);
  const cols = sql.exec(`PRAGMA table_info(gone_notices)`).toArray().map((r) => String(r.name));
  if (!cols.includes("ver")) sql.exec(`ALTER TABLE gone_notices ADD COLUMN ver INTEGER NOT NULL DEFAULT 0`);
}

/** an account just deleted (or, for "money-changed", its email changed): a row for each of these apps, due now */
export function noteGone(sql: Sql, id: string, apps: string[], now = Date.now()) {
  for (const app of apps)
    sql.exec(
      `INSERT INTO gone_notices (user_id, app, tries, next_at, ver) VALUES (?, ?, 0, ?, 0) ON CONFLICT(user_id, app) DO UPDATE SET ver = ver + 1, tries = 0, next_at = MIN(next_at, excluded.next_at)`,
      id,
      app,
      now,
    );
}

/** how long an app may take to answer before the try counts as failed */
export const SEND_TIMEOUT = 30_000;
/** how many rows one pass takes on (all at once) */
const PASS = 25;
const DAY = 24 * 3600_000;

/**
 * Every row that's due, told to its app (`tell[app]`; missing: tried again in a day). Before the
 * first send, each due row is moved on to when it would go again should this try fail, and `wake`
 * is asked for the earliest row: so a hub that stops in the middle (a deploy, a crash) still tries
 * again, and a pass running alongside doesn't send the same row twice. The sends go out together,
 * each given 30 seconds. A row is gone once its app answers (a failed `accountGone` must throw);
 * after a failure it waits from when it failed. Gives when the next row is due, or null if none
 * are left.
 */
export async function sendGone(
  sql: Sql,
  tell: Record<string, ((id: string) => Promise<unknown>) | undefined>,
  wake: (at: number) => Promise<unknown> | void,
  clock: () => number = Date.now,
  timeout = SEND_TIMEOUT,
): Promise<number | null> {
  const start = clock();
  const due = sql.exec(`SELECT user_id, app, tries, ver FROM gone_notices WHERE next_at <= ? ORDER BY next_at LIMIT ${PASS}`, start).toArray();
  const after = (app: string, tries: number) => (tell[app] ? waitAfter(tries) : DAY);
  for (const r of due) sql.exec(`UPDATE gone_notices SET next_at = ? WHERE user_id = ? AND app = ?`, start + after(String(r.app), Number(r.tries) + 1), String(r.user_id), String(r.app));
  if (due.length) await wake(nextDue(sql)!);
  await Promise.all(
    due.map(async (r) => {
      const id = String(r.user_id);
      const app = String(r.app);
      const tries = Number(r.tries) + 1;
      const ver = Number(r.ver);
      const send = tell[app];
      let done = false;
      try {
        if (send) {
          await within(timeout, send(id));
          done = true;
        } else console.error(`hub: no way to tell ${app} about an account (its binding is missing)`);
      } catch (e) {
        console.error(`hub: ${app} wasn't told about an account (try ${tries})`, e);
      }
      // (noted again meanwhile: the row stays, due, for the newer one)
      if (done) sql.exec(`DELETE FROM gone_notices WHERE user_id = ? AND app = ? AND ver = ?`, id, app, ver);
      else sql.exec(`UPDATE gone_notices SET tries = ?, next_at = ? WHERE user_id = ? AND app = ? AND ver = ?`, tries, clock() + after(app, tries), id, app, ver);
    }),
  );
  return nextDue(sql);
}

/** when the next row is due (null: none left) */
export function nextDue(sql: Sql): number | null {
  const at = sql.exec(`SELECT MIN(next_at) AS at FROM gone_notices`).toArray()[0]?.at;
  return at == null ? null : Number(at);
}

/** the promise, or a failure once `ms` have passed */
function within<T>(ms: number, p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((_, fail) => {
    timer = setTimeout(() => fail(new Error(`no answer in ${ms / 1000} s`)), ms);
  });
  return Promise.race([p, late]).finally(() => timer !== undefined && clearTimeout(timer));
}
