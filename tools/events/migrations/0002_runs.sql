-- 0002: a morning's run goes on over several triggers (06:00, 06:20, 06:40 Vancouver time). A trigger
-- may take about 30 steps (Cloudflare allows 32 Worker invocations per request), so each continues
-- where the last stopped, and the run publishes once every source is done (or at 06:40 with what it has).
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,   -- the Vancouver date, "2026-11-02"
  next_source TEXT,          -- the step to take next: this source's part next_part (null: every source done)
  next_part INTEGER,
  steps INTEGER NOT NULL DEFAULT 0,
  triggers INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  published_at TEXT
);
