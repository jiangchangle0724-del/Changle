-- Whether a shop is shown on the tool's home (/tuan/), with the group buys it has open. Its own
-- people choose, on the shop's settings page. Shown unless they say not: a merchant's link works
-- either way.
ALTER TABLE shops ADD COLUMN listed INTEGER NOT NULL DEFAULT 1 CHECK (listed IN (0, 1));
