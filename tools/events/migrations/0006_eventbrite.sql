-- 0006: the Eventbrite organizations followed (src/follows.ts), each learned from one of its events:
-- organization_id is filled in when Eventbrite has said whose the event is; error when it can't.
CREATE TABLE IF NOT EXISTS eventbrite_follows (
  event_id TEXT PRIMARY KEY,
  organization_id TEXT,
  name TEXT,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS eventbrite_follows_org ON eventbrite_follows(organization_id);
