-- Whether a shop is shown on the tool's home (/tuan/), with the group buys it has open. Its own
-- people choose, on the shop's settings page. Shown unless they say not: a merchant's link works
-- either way.
ALTER TABLE shops ADD COLUMN listed INTEGER NOT NULL DEFAULT 1 CHECK (listed IN (0, 1));

-- But not the test shop of 2026-11-13 (migrations/0003): the real goods, prices and pickup
-- addresses in its group buy are meant only for the people given its link, and home would lead to
-- its page, which lists that group buy. Its own people can show it on its settings page. On any
-- other database this changes nothing.
UPDATE shops SET listed = 0 WHERE slug LIKE 'damituan-test-%';
