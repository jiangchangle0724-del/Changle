-- An item the merchant gets only by the case (a 30 lb case of lamb, a box of 12): how much one case
-- holds, in the same thousandths as every amount, or null for an item that comes as it is ordered.
-- The group buy's page shows how far its orders have filled the case (src/engine/cases.ts).
ALTER TABLE items ADD COLUMN case_qty INTEGER CHECK (case_qty IS NULL OR case_qty > 0);
