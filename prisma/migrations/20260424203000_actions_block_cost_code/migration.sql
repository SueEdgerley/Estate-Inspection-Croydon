-- Persist block and cost code on auto-routed actions for reporting and email context
ALTER TABLE actions ADD COLUMN IF NOT EXISTS block_id VARCHAR(255) REFERENCES blocks(id) ON DELETE SET NULL;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS cost_code VARCHAR(100);
