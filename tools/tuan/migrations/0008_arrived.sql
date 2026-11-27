-- The merchant's word that the goods are in, for pickup or on their way: when they said it, and a
-- line on when and where, which buyers see on the group buy's page and their order's. Null and
-- empty until said, and again if they take it back.
ALTER TABLE offers ADD COLUMN arrived_at INTEGER;
ALTER TABLE offers ADD COLUMN arrived_note TEXT NOT NULL DEFAULT '';
