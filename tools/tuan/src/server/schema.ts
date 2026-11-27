// The database's tables, made by the Worker itself: the numbered files in migrations/, each applied
// once, in order (the same way as 玩什么, tools/events/src/schema.ts). Nothing to run by hand.
import m0001 from "../../migrations/0001_init.sql";
import m0002 from "../../migrations/0002_notices.sql";
import m0003 from "../../migrations/0003_test_shop_address.sql";
import m0004 from "../../migrations/0004_applications.sql";
import m0005 from "../../migrations/0005_photos.sql";
import m0006 from "../../migrations/0006_listed.sql";
import m0007 from "../../migrations/0007_case.sql";
import m0008 from "../../migrations/0008_arrived.sql";

// (a file that has been applied on the live database is never edited again: a change is a new file, added here)
const MIGRATIONS: [name: string, sql: string][] = [
  ["0001_init", m0001],
  ["0002_notices", m0002],
  ["0003_test_shop_address", m0003],
  ["0004_applications", m0004],
  ["0005_photos", m0005],
  ["0006_listed", m0006],
  ["0007_case", m0007],
  ["0008_arrived", m0008],
];

/** A migration file as statements: comments dropped, split at each ";". (No ";" inside a string or a comment in these files.) */
export function statements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function apply(db: D1Database): Promise<void> {
  await db.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
  const done = new Set((await db.prepare("SELECT name FROM schema_migrations").all<{ name: string }>()).results.map((r) => r.name));
  for (const [name, sql] of MIGRATIONS) {
    if (done.has(name)) continue;
    // one file is one transaction: all of it, or none
    await db.batch([...statements(sql).map((s) => db.prepare(s)), db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").bind(name, new Date().toISOString())]);
  }
}

let ready: Promise<void> | null = null;

/** Looked at once each time the Worker starts; after that, every request goes straight through. */
export function ensureSchema(db: D1Database): Promise<void> {
  return (ready ??= apply(db).catch((e) => {
    ready = null;
    throw e;
  }));
}
