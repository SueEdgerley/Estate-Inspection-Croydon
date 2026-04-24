-- Inspection reports and analytics reference estates.area. Idempotent if an earlier migration was not applied.
ALTER TABLE estates ADD COLUMN IF NOT EXISTS area VARCHAR(100);
