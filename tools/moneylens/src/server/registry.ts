/**
 * The accounts that have ever signed in to MoneyLens: their ids and the day each first did, in
 * one small database of its own, and nothing else. No session, no vault, no record is here
 * (ISO-1 is about financial records; this holds none).
 *
 * It exists because nothing else can say which people have a database: Durable Objects cannot be
 * listed from inside a Worker. The weekly sweep (ARCH-10) will ask the accounts service which of
 * these ids still exist and empty the databases of the ones that do not, and a cap on the number
 * of people (D4) will count them. An account is noted here before its own database is touched,
 * so a database can never exist that the sweep does not know of.
 *
 * Plain functions on a `Db`, like chunks.ts.
 */
import type { Db } from "./chunks";
import { isAccount } from "./request";

export function registryTables(db: Db): void {
  db.sql.exec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, first INTEGER NOT NULL)`);
}

/** Notes an account. True when it is noted, now or before; false for what is not an account's id. Writes only the first time. */
export function noteAccount(db: Db, id: unknown, now: number): boolean {
  if (!isAccount(id) || !Number.isSafeInteger(now) || now < 0) return false;
  if (!db.sql.exec(`SELECT 1 AS there FROM accounts WHERE id = ?`, id).toArray().length) db.sql.exec(`INSERT INTO accounts (id, first) VALUES (?, ?)`, id, now);
  return true;
}

/** Takes an account off, once its database has been emptied. */
export function forgetAccount(db: Db, id: unknown): void {
  if (isAccount(id)) db.sql.exec(`DELETE FROM accounts WHERE id = ?`, id);
}

export const countAccounts = (db: Db): number => Number(db.sql.exec(`SELECT COUNT(*) AS n FROM accounts`).toArray()[0]?.n ?? 0);
