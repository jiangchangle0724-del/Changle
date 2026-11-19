-- 0004: what the AI writes for the Chinese page (src/ai.ts). title_zh is the event's name in Chinese;
-- summary_zh (in 0001) says in a sentence what kind of event it is. text_hash is a hash of what the AI
-- reads (title, description, venue), refreshed with every fetch; ai_hash is the text_hash it last
-- wrote from, so a changed text is written again. ai_tries counts answers it couldn't use for the
-- text as it is now; after three it leaves the event in English.
ALTER TABLE events ADD COLUMN title_zh TEXT;
ALTER TABLE events ADD COLUMN text_hash TEXT;
ALTER TABLE events ADD COLUMN ai_hash TEXT;
ALTER TABLE events ADD COLUMN ai_tries INTEGER NOT NULL DEFAULT 0;
