// The Worker applies migrations/ itself, in order and once each, before a run touches the database:
// nothing to do by hand after a deploy. Never edit a migration that has gone out; add the next one.
import m0001 from "../migrations/0001_init.sql";
import m0002 from "../migrations/0002_runs.sql";
import m0003 from "../migrations/0003_fetch_via.sql";
import m0004 from "../migrations/0004_zh.sql";
import m0005 from "../migrations/0005_twins.sql";
import m0006 from "../migrations/0006_eventbrite.sql";
import m0007 from "../migrations/0007_submissions.sql";
import m0008 from "../migrations/0008_ai_retry.sql";
import m0009 from "../migrations/0009_ai_retry_names.sql";

const MIGRATIONS: [name: string, sql: string][] = [
  ["0001_init", m0001],
  ["0002_runs", m0002],
  ["0003_fetch_via", m0003],
  ["0004_zh", m0004],
  ["0005_twins", m0005],
  ["0006_eventbrite", m0006],
  ["0007_submissions", m0007],
  ["0008_ai_retry", m0008],
  ["0009_ai_retry_names", m0009],
];

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
