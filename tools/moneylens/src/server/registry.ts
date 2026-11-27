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
 * It also keeps one value that is about no account: the stamp (flows.ts). Whoever comes to say
 * that an account is gone, or that its address changed, sets a new stamp before doing anything
 * else, and a sign-in reads the stamp before it trades its code and again once its session is
 * open. This database is one object that does one thing at a time, so those reads and writes
 * have an order, which is what a sign-in in one object and a notice in another need.
 *
 * Plain functions on a `Db`, like chunks.ts.
 */
import { isId } from "../core/ids";
import type { Db } from "./chunks";
import { isAccount } from "./request";

export function registryTables(db: Db): void {
  db.sql.exec(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, first INTEGER NOT NULL)`);
  db.sql.exec(`CREATE TABLE IF NOT EXISTS fence (one INTEGER PRIMARY KEY CHECK (one = 1), stamp TEXT NOT NULL)`);
}

/** The stamp as it stands. Empty until the first one is set. */
export const stampOf = (db: Db): string => {
  const stamp = db.sql.exec(`SELECT stamp FROM fence WHERE one = 1`).toArray()[0]?.stamp;
  return typeof stamp === "string" ? stamp : "";
};

/**
 * Sets a new stamp. `stamp` is made by the caller, new and random each time (`newId`), and not counted up: a
 * database put back from a copy would count the same numbers twice, and a sign-in could then read the same stamp
 * before and after a notice. What is not an id is refused, loudly: a notice whose stamp was not set must not go on.
 */
export function setStamp(db: Db, stamp: unknown): void {
  if (!isId(stamp)) throw new Error("stamp");
  db.sql.exec(`INSERT INTO fence (one, stamp) VALUES (1, ?) ON CONFLICT (one) DO UPDATE SET stamp = excluded.stamp`, stamp);
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
