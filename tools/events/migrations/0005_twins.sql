-- 0005: the same text in a source (a weekly storytime's every date, a show's three nights) shares its
-- Chinese (src/ai.ts, settle and keepWritten): they're found by source and text_hash.
CREATE INDEX IF NOT EXISTS events_text ON events(source, text_hash);
