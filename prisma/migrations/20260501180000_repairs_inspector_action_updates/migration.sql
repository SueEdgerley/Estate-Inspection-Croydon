-- Repairs inspector workflow fields. Safe additive migration only.
ALTER TABLE actions ADD COLUMN IF NOT EXISTS repair_notes TEXT;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS repair_photo_url TEXT;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS repair_updated_at TIMESTAMPTZ;
