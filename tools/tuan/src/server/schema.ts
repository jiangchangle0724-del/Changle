// The database's tables, made by the Worker itself: the numbered files in migrations/, each applied
// once, in order (the same way as 玩什么, tools/events/src/schema.ts). Nothing to run by hand.
import m0001 from "../../migrations/0001_init.sql";

const MIGRATIONS: [name: string, sql: string][] = [["0001_init", m0001]];

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
