-- The answers the AI's checks turned down get their three tries again (26 November 2026): two of
-- the checks (职业 for a game nothing says is professional, 曲棍球 for ice hockey) turned whole
-- answers down, and now put the words right instead; eleven events had spent their tries on them.
-- Only the count: the next hourly catch-up asks them again.
UPDATE events SET ai_tries = 0 WHERE ai_hash LIKE '!%';
