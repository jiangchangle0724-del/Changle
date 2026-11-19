-- Pictures of the goods (src/server/photos.ts). The bytes are in KV (binding PHOTOS), under
-- p/<id> for the one to look at and p/<id>/s for the small square one in the list. This says
-- which there are, whose, and how big: a picture sent twice is kept once, and the ones no group
-- buy names any more can be found.
CREATE TABLE photos (
  id TEXT PRIMARY KEY,                  -- the first 128 bits of the large copy's SHA-256, in hex
  shop_id TEXT NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
  bytes INTEGER NOT NULL,               -- both copies together
  created_at INTEGER NOT NULL
);
CREATE INDEX photos_by_shop ON photos (shop_id, created_at);
