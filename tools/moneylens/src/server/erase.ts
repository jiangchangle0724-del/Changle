/**
 * Erasing a vault (VAULT-5, VAULT-7; assessment 1.11).
 *
 * Two ways. A session that has the vault open (it has shown a right proof, ways.ts) may erase it
 * at once: it could read all of it, and may let it go. Any other signed-in session may ask for it
 * to be erased after seven days. That is the way back for someone who has lost both the
 * passphrase and the recovery code, and for an owner whose mailbox someone else used to make a
 * vault first. In those seven days every signed-in device is shown that the vault will be erased,
 * when, and from which device it was asked; and a session with the vault open can call it off.
 * Calling off needs the vault open so that whoever holds the mailbox alone cannot keep a real
 * reset from happening; whoever knows a way in can call it off, and could read the vault anyway.
 *
 * What erasing lets go of is the vault and everything that goes with it: its chunks and its row
 * (chunks.ts), its ways in, the wrong tries counted against them, and which sessions hold it open
 * or have opened it (ways.ts), and the erasing that was asked for. Never the account, its
 * sessions or its events: the line that says the vault was erased is one of them. And never what
 * the vault wrote on its last day: a vault made the same day goes on from that count, so that
 * erasing is no way to more writes in a day (LIM-1).
 *
 * The tables here are newer than the databases made before them, so they are made where they are
 * needed, as `opened` is (ways.ts). Plain synchronous functions on a `Db`; the caller holds the
 * transaction and writes the lines in the events log (account.ts).
 */
import { forgetChunks, type Db } from "./chunks";
import { forgetWays } from "./ways";

/** How long a vault waits to be erased when the session that asks does not have it open (VAULT-7). */
export const ERASE_DELAY = 7 * 24 * 3_600_000;

/** An erasing asked for: of which vault, when, when it is due, and by which session (null: one that no longer says). */
export type Erasing = { vault: string; asked: number; due: number; session: string | null };

const isTime = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

function eraseTables(db: Db): void {
  db.sql.exec(`CREATE TABLE IF NOT EXISTS erasing (one INTEGER PRIMARY KEY CHECK (one = 1), vault TEXT NOT NULL, asked INTEGER NOT NULL, due INTEGER NOT NULL, session TEXT)`);
  db.sql.exec(`CREATE TABLE IF NOT EXISTS spent (one INTEGER PRIMARY KEY CHECK (one = 1), day TEXT NOT NULL, written INTEGER NOT NULL)`);
}

/** The erasing asked for, if one is. A row that is not one (a database damaged or restored into nonsense) is an error, thrown. */
export function pendingErase(db: Db): Erasing | null {
  eraseTables(db);
  const row = db.sql.exec(`SELECT vault, asked, due, session FROM erasing WHERE one = 1`).toArray()[0];
  if (!row) return null;
  const { vault, asked, due, session } = row;
  if (typeof vault !== "string" || !isTime(asked) || !isTime(due) || due < asked || (session !== null && typeof session !== "string")) throw new Error("erasing row");
  return { vault, asked, due, session };
}

/**
 * Asks for `vault` to be erased after the delay. One that is asked for already stays as it is: asking again neither
 * puts it off nor brings it on, and writes nothing (`made` false).
 */
export function askErase(db: Db, vault: string, session: string, now: number): { erasing: Erasing; made: boolean } {
  if (!isTime(now) || !isTime(now + ERASE_DELAY)) throw new Error("erase");
  const was = pendingErase(db);
  if (was) return { erasing: was, made: false };
  const erasing: Erasing = { vault, asked: now, due: now + ERASE_DELAY, session };
  db.sql.exec(`INSERT INTO erasing (one, vault, asked, due, session) VALUES (1, ?, ?, ?, ?)`, vault, now, erasing.due, session);
  return { erasing, made: true };
}

/** Calls off the erasing that was asked for. False: none was. */
export function cancelErase(db: Db): boolean {
  if (pendingErase(db) === null) return false;
  db.sql.exec(`DELETE FROM erasing`);
  return true;
}

/** Erases the vault: everything listed above, and nothing else. A database without a vault is left as it is, but for an erasing asked for. */
export function eraseVault(db: Db): void {
  eraseTables(db);
  const last = forgetChunks(db);
  forgetWays(db);
  db.sql.exec(`DELETE FROM erasing`);
  db.sql.exec(`DELETE FROM spent`);
  if (last && last.written > 0) db.sql.exec(`INSERT INTO spent (one, day, written) VALUES (1, ?, ?)`, last.day, last.written);
}

/** For a vault just started: it goes on from what the vault erased before it wrote on its last day (the day's count is chunks.ts's). */
export function carrySpent(db: Db): void {
  eraseTables(db);
  const row = db.sql.exec(`SELECT day, written FROM spent WHERE one = 1`).toArray()[0];
  if (row && typeof row.day === "string" && isTime(row.written)) db.sql.exec(`UPDATE vault SET day = ?, written = ? WHERE one = 1`, row.day, row.written);
  db.sql.exec(`DELETE FROM spent`);
}

/**
 * The erasing that is due, done. "erased": the vault it was asked for was erased. "dropped": it was asked for a vault
 * this database no longer holds, and is let go of. Otherwise when the one asked for is due (for an alarm), or null
 * when none is. `holds` says which vault the database holds; it is asked only when an erasing is due, so that a vault
 * whose row cannot be read keeps from no request but those that read the vault.
 */
export function settleErase(db: Db, now: number, holds: () => string | null): { did: "erased" | "dropped" } | { due: number | null } {
  const erasing = pendingErase(db);
  if (!erasing) return { due: null };
  if (!isTime(now) || now < erasing.due) return { due: erasing.due };
  if (holds() !== erasing.vault) {
    db.sql.exec(`DELETE FROM erasing`);
    return { did: "dropped" };
  }
  eraseVault(db);
  return { did: "erased" };
}
