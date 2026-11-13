-- 跟一单 · Count Me In: the first tables.
-- Money is whole cents (CAD). Amounts of goods are whole thousandths of the item's unit
-- (1500 = 1.5 lb, 2000 = 2 bags), so nothing drifts. Times are milliseconds since 1970 (UTC).

-- A merchant: a group-buy leader, a licensed kitchen, or a farm.
CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,            -- its address: /tuan/s/<slug>
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'leader' CHECK (kind IN ('leader', 'kitchen', 'farm')),
  about TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',     -- how a buyer reaches the merchant, as the merchant wrote it
  pay TEXT NOT NULL DEFAULT '',         -- how to pay the merchant, as the merchant wrote it (the site takes no money)
  permit TEXT NOT NULL DEFAULT '',      -- the health permit, as shown on the shop's page
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'paused')),
  paid_until TEXT,                      -- YYYY-MM-DD: the monthly fee is paid up to this day
  created_at INTEGER NOT NULL
);

-- Which changle.ca accounts run which shop.
CREATE TABLE shop_members (
  shop_id TEXT NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
  email TEXT NOT NULL,                  -- the account's email, lower case
  added_at INTEGER NOT NULL,
  PRIMARY KEY (shop_id, email)
);
CREATE INDEX shop_members_by_email ON shop_members (email);

-- One group buy.
CREATE TABLE offers (
  id TEXT PRIMARY KEY,                  -- 8 characters: /tuan/t/<id>
  shop_id TEXT NOT NULL REFERENCES shops (id),
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  closes_at INTEGER NOT NULL,           -- orders stop at this moment
  roster TEXT NOT NULL DEFAULT 'names' CHECK (roster IN ('names', 'anon', 'off')),  -- the public list of who's in
  created_at INTEGER NOT NULL
);
CREATE INDEX offers_by_shop ON offers (shop_id, created_at);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  section TEXT NOT NULL DEFAULT '',     -- the heading it is listed under
  name TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  photo TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),          -- cents for one unit
  unit TEXT NOT NULL DEFAULT 'each' CHECK (unit IN ('each', 'box', 'bag', 'pack', 'portion', 'lb')),
  step INTEGER NOT NULL DEFAULT 1000 CHECK (step > 0), -- the smallest change in amount (500 = half a pound)
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),   -- how much there is; NULL: no limit
  per_buyer INTEGER CHECK (per_buyer IS NULL OR per_buyer > 0),  -- the most one phone number may take; NULL: no limit
  sold INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0),   -- how much is in orders that stand
  allergens TEXT NOT NULL DEFAULT '',
  -- an order that would take more than there is fails here, and the whole order with it
  CHECK (stock IS NULL OR sold <= stock)
);
CREATE INDEX items_by_offer ON items (offer_id, pos);

CREATE TABLE pickup_points (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  hours TEXT NOT NULL DEFAULT ''        -- when to come, as the merchant wrote it
);
CREATE INDEX pickup_points_by_offer ON pickup_points (offer_id, pos);

CREATE TABLE delivery_rules (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  label TEXT NOT NULL,                  -- where it applies, as the merchant wrote it
  min_total INTEGER NOT NULL DEFAULT 0 CHECK (min_total >= 0),  -- cents of goods before delivery is offered
  fee INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),              -- cents
  hours TEXT NOT NULL DEFAULT ''        -- when it comes, as the merchant wrote it
);
CREATE INDEX delivery_rules_by_offer ON delivery_rules (offer_id, pos);

CREATE TABLE orders (
  code TEXT PRIMARY KEY,                -- 6 characters: what the buyer quotes when paying
  offer_id TEXT NOT NULL REFERENCES offers (id),
  seq INTEGER NOT NULL,                 -- its place in the offer's list (第几位)
  client_key TEXT NOT NULL,             -- made by the buyer's phone: sending an order twice makes it once
  name TEXT NOT NULL,
  phone TEXT NOT NULL,                  -- digits, as typed
  phone_key TEXT NOT NULL,              -- its last ten digits: one buyer, however the number was typed
  wechat TEXT NOT NULL DEFAULT '',
  how TEXT NOT NULL CHECK (how IN ('pickup', 'delivery')),
  pickup_id TEXT REFERENCES pickup_points (id),
  rule_id TEXT REFERENCES delivery_rules (id),
  address TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'cancelled')),
  paid_at INTEGER,                      -- the merchant marked it paid
  picked_at INTEGER,                    -- the merchant marked it picked up or delivered
  goods INTEGER NOT NULL,               -- cents: the goods, as ordered (an estimate for anything weighed)
  fee INTEGER NOT NULL DEFAULT 0,       -- cents: delivery
  final INTEGER,                        -- cents: goods and fee once everything weighed has been weighed
  pieces INTEGER NOT NULL,              -- how many things, for the public list (anything weighed counts as one)
  rev INTEGER NOT NULL DEFAULT 0,       -- goes up with every change: a change made from an older reading is refused
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (offer_id, seq),
  UNIQUE (offer_id, client_key)
);
CREATE INDEX orders_by_offer ON orders (offer_id, created_at);
CREATE INDEX orders_by_phone ON orders (offer_id, phone_key);

CREATE TABLE order_items (
  order_code TEXT NOT NULL REFERENCES orders (code) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items (id),
  pos INTEGER NOT NULL,
  name TEXT NOT NULL,                   -- name, unit and price as they were when it was ordered
  unit TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0), -- how much was ordered
  actual INTEGER CHECK (actual IS NULL OR actual >= 0),  -- how much it turned out to be, once weighed
  PRIMARY KEY (order_code, item_id)
);

-- Daily allowances, one network at a time (orders placed, wrong order look-ups, sign-ins that weren't).
CREATE TABLE gates (
  key TEXT NOT NULL,
  day TEXT NOT NULL,                    -- the day in Vancouver
  used INTEGER NOT NULL,
  PRIMARY KEY (key, day)
);
