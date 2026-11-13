-- Telling a merchant about new orders by mail (src/server/notify.ts): at most one mail per group
-- buy every half hour, each covering the orders the merchant hasn't been told about yet.

ALTER TABLE offers ADD COLUMN mailed_at INTEGER NOT NULL DEFAULT 0; -- when a notice last went out for this group buy (epoch ms; 0: never)

ALTER TABLE orders ADD COLUMN noticed INTEGER NOT NULL DEFAULT 0; -- 1 once the merchant has been told of it: by mail, or by opening the group buy

CREATE INDEX orders_unnoticed ON orders (offer_id) WHERE noticed = 0;
