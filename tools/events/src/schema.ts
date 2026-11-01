// The Worker applies migrations/ itself, in order and once each, before a run touches the database:
// nothing to do by hand after a deploy. Never edit a migration that has gone out; add the next one.
import m0001 from "../migrations/0001_init.sql";

const MIGRATIONS: [name: string, sql: string][] = [["0001_init", m0001]];

/** The statements in a migration file (comments dropped, split at the semicolons). */
export function statements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function ensureSchema(db: D1Database): Promise<void> {
  await db.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
  const done = new Set((await db.prepare("SELECT name FROM schema_migrations").all<{ name: string }>()).results.map((r) => r.name));
  for (const [name, sql] of MIGRATIONS) {
    if (done.has(name)) continue;
    await db.batch([
      ...statements(sql).map((s) => db.prepare(s)),
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").bind(name, new Date().toISOString()),
    ]);
  }
}
