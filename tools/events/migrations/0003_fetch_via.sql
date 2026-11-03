-- 0003: how each step got its answer. via is 'fetch' (the Worker asked the source) or 'handoff' (a
-- GitHub job read it before the run and handed it over: the libraries that refuse Cloudflare, see
-- src/handoff.ts), null when nothing was read (a source skipped, the publish step). note says why in a
-- few words: when a page was handed over, or why a source that is handed over was fetched directly.
ALTER TABLE fetch_log ADD COLUMN via TEXT;
ALTER TABLE fetch_log ADD COLUMN note TEXT;
