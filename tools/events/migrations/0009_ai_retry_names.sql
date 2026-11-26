-- Once more, as 0008 (26 November 2026): the answers turned down get their tries again, now that a
-- name kept in English may be longer than 40 characters (TITLE_MAX 70, TITLE_ZH_MAX 24). Eight
-- events, games and line-ups mostly, were turned down for their names' length.
UPDATE events SET ai_tries = 0 WHERE ai_hash LIKE '!%';
