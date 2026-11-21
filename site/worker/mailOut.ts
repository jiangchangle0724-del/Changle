/**
 * Mail that has to arrive: the note to an old address that its account's email changed (换邮箱,
 * emailChange.ts), the one warning if it wasn't them. Kept in `mail_out` until Resend takes it,
 * tried again on the hub's alarm like the gone notices (goneNotices.ts): rows claimed and the alarm
 * set before sending, 30 seconds each, a minute's wait and then longer, a day at most. A mail still
 * not out after a week is given up on (and said so in the log), so an address is kept no longer.
 *
 * Plain functions on the hub's SQL (tests/email-change.test.ts runs them on Node's SQLite).
 */
import { SEND_TIMEOUT, waitAfter, within } from "./goneNotices";
import type { Sql } from "./handoffCodes";

export type Mail = { to: string; subject: string; html: string; text: string; replyTo?: string };
export const GIVE_UP = 7 * 24 * 3600_000;
/** how many mails one pass takes on (all at once) */
const PASS = 10;

export function mailTables(sql: Sql) {
  sql.exec(
    `CREATE TABLE IF NOT EXISTS mail_out (id INTEGER PRIMARY KEY AUTOINCREMENT, to_addr TEXT NOT NULL, subject TEXT NOT NULL, html TEXT NOT NULL, text TEXT NOT NULL, reply_to TEXT, tries INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, made_at INTEGER NOT NULL)`,
  );
}

/** a mail to go out now, and again later until it has */
export function queueMail(sql: Sql, m: Mail, now = Date.now()) {
  sql.exec(
    `INSERT INTO mail_out (to_addr, subject, html, text, reply_to, tries, next_at, made_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    m.to,
    m.subject,
    m.html,
    m.text,
    m.replyTo ?? null,
    now,
    now,
  );
}

/** Every mail that's due, handed to `deliver` (which throws when it isn't sent). Gives when the next is due, or null. */
export async function sendMail(
  sql: Sql,
  deliver: (m: Mail) => Promise<unknown>,
  wake: (at: number) => Promise<unknown> | void,
  clock: () => number = Date.now,
  timeout = SEND_TIMEOUT,
): Promise<number | null> {
  const start = clock();
  const old = Number(sql.exec(`SELECT COUNT(*) AS n FROM mail_out WHERE made_at < ?`, start - GIVE_UP).toArray()[0]?.n ?? 0);
  if (old) {
    console.error(`hub: ${old} mail(s) given up on after a week`);
    sql.exec(`DELETE FROM mail_out WHERE made_at < ?`, start - GIVE_UP);
  }
  const due = sql.exec(`SELECT id, to_addr, subject, html, text, reply_to, tries FROM mail_out WHERE next_at <= ? ORDER BY next_at LIMIT ${PASS}`, start).toArray();
  for (const r of due) sql.exec(`UPDATE mail_out SET next_at = ? WHERE id = ?`, start + waitAfter(Number(r.tries) + 1), Number(r.id));
  if (due.length) await wake(nextMail(sql)!);
  await Promise.all(
    due.map(async (r) => {
      const id = Number(r.id);
      const tries = Number(r.tries) + 1;
      try {
        await within(timeout, deliver({ to: String(r.to_addr), subject: String(r.subject), html: String(r.html), text: String(r.text), ...(r.reply_to ? { replyTo: String(r.reply_to) } : {}) }));
        sql.exec(`DELETE FROM mail_out WHERE id = ?`, id);
      } catch (e) {
        console.error(`hub: a mail didn't go out (try ${tries})`, e);
        sql.exec(`UPDATE mail_out SET tries = ?, next_at = ? WHERE id = ?`, tries, clock() + waitAfter(tries), id);
      }
    }),
  );
  return nextMail(sql);
}

/** when the next mail is due (null: none waiting) */
export function nextMail(sql: Sql): number | null {
  const at = sql.exec(`SELECT MIN(next_at) AS at FROM mail_out`).toArray()[0]?.at;
  return at == null ? null : Number(at);
}
