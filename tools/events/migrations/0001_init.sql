-- 玩什么 · What's On: the five tables (task A1). The Worker applies the files in this folder itself,
-- in order, once each (src/schema.ts). Never edit one that has gone out: add the next number.

-- Where events come from. The list itself is code (src/sources/index.ts); this keeps what the
-- fetching learns about each one: validators for conditional requests, and how it last went.
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  tier INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  etag TEXT,
  last_modified TEXT,
  last_ok_run TEXT,
  last_error TEXT
);

-- Places, each looked up once. Events hang off a venue; dedupe and the area go by venue id.
CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  lat REAL,
  lon REAL,
  -- one of the 7 areas (src/types.ts AREAS); null until resolved (task C5)
  area TEXT,
  -- 1: couldn't tell, put in Vancouver for now ("待确认")
  area_check INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- One row per event (a recurring one: one row per date). Times are Vancouver wall-clock ISO with
-- the offset in force that day; start_utc is the same moment in epoch ms, for ranges and order.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  -- plain text, at most 600 characters: for the AI's summary only, never shown
  description TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  start_utc INTEGER NOT NULL,
  -- when it's over (epoch ms): its end, or the end of its day when it has none
  end_utc INTEGER NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  time_tbd INTEGER NOT NULL DEFAULT 0,
  -- scheduled | cancelled | postponed | rescheduled | soldout
  status TEXT NOT NULL DEFAULT 'scheduled',
  venue_id TEXT REFERENCES venues(id),
  online INTEGER NOT NULL DEFAULT 0,
  price_min REAL,
  price_max REAL,
  is_free INTEGER,
  -- one of the 8 categories; category_by: rule | ai | steve
  category TEXT,
  category_by TEXT,
  -- the source's own labels (JSON array)
  source_categories TEXT,
  -- JSON array of the 9 tags
  tags TEXT NOT NULL DEFAULT '[]',
  -- en | zh | both
  lang TEXT,
  summary_zh TEXT,
  summary_en TEXT,
  summary_by TEXT,
  image_url TEXT,
  organizer TEXT,
  -- normalize(title) + date + venue id (task C4); merged duplicates point at the event they joined
  fingerprint TEXT,
  duplicate_of TEXT,
  -- pending | live | hidden
  visibility TEXT NOT NULL DEFAULT 'live',
  featured INTEGER NOT NULL DEFAULT 0,
  -- a hash of what the source says, to tell a change from a repeat
  content_hash TEXT NOT NULL,
  -- the runs (dates) that first and last saw it at its source
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_start ON events(start_utc);
CREATE INDEX IF NOT EXISTS events_end ON events(end_utc);
CREATE INDEX IF NOT EXISTS events_source ON events(source, last_seen);
CREATE INDEX IF NOT EXISTS events_fingerprint ON events(fingerprint);

-- Every step of every run: how many, how long, what went wrong. The morning email reads this.
CREATE TABLE IF NOT EXISTS fetch_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,
  part INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ms INTEGER NOT NULL,
  http_status INTEGER,
  not_modified INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  raw_key TEXT,
  found INTEGER NOT NULL DEFAULT 0,
  in_window INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS fetch_log_run ON fetch_log(run_id);

-- What waits for a person: submitted events, suspected duplicates, conflicting sources, reports.
CREATE TABLE IF NOT EXISTS review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- submission | duplicate | conflict | report
  kind TEXT NOT NULL,
  event_id TEXT,
  other_id TEXT,
  -- JSON: the submitted event, the fields that disagree, what the reader reported
  payload TEXT,
  -- open | approved | rejected | done
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS review_queue_open ON review_queue(status, kind);
