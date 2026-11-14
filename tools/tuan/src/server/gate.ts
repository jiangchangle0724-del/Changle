// Daily allowances: so many orders from one network, so many wrong tries at one order. A network is
// told apart by its address, kept only as a fingerprint. Counts live in the `gates` table, one row a
// key a day (the day in Vancouver), and are dropped two days later.
import { vancouverDay } from "../engine/time";

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The network a request came from, as a fingerprint. */
export const networkOf = async (req: Request): Promise<string> => (await sha256(`tuan:${req.headers.get("cf-connecting-ip") ?? "local"}`)).slice(0, 32);

/** How many times `key` was used today. */
export async function used(db: D1Database, key: string, now: number): Promise<number> {
  const row = await db.prepare("SELECT used FROM gates WHERE key = ? AND day = ?").bind(key, vancouverDay(now)).first<{ used: number }>();
  return row?.used ?? 0;
}

/** One more use of `key` today; answers how many that makes. */
export async function bump(db: D1Database, key: string, now: number): Promise<number> {
  const day = vancouverDay(now);
  const row = await db.prepare("INSERT INTO gates (key, day, used) VALUES (?, ?, 1) ON CONFLICT (key, day) DO UPDATE SET used = used + 1 RETURNING used").bind(key, day).first<{ used: number }>();
  const count = row?.used ?? 1;
  // a key's first use of the day sweeps out the days nobody needs any more
  if (count === 1) await db.prepare("DELETE FROM gates WHERE day < ?").bind(vancouverDay(now - 2 * 86_400_000)).run();
  return count;
}
