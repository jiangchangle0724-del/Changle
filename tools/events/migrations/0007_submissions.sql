-- 0007: events people send in (src/submit.ts): a link, a few words or a poster, the draft read from
-- them, and the owner's answer. Nothing here is published until the owner lets it in (status
-- 'approved'); then it's also an event of the source "submitted" (event_id).
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  lang TEXT NOT NULL,
  link TEXT,
  text TEXT,
  has_image INTEGER NOT NULL DEFAULT 0,
  contact TEXT,
  network TEXT NOT NULL,
  read_from TEXT,
  draft TEXT,
  read_error TEXT,
  event_id TEXT,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS submissions_status ON submissions(status, created_at);
