-- Minimal additive repair: Phase 1 reference tables for inspection create forms.
-- Ensures public.estates, public.blocks, and inspections.estate_id / inspections.block_id exist.
-- Idempotent only (CREATE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, conditional FKs).
-- Does not touch data in inspections, answers, issues, people, or users rows.

CREATE TABLE IF NOT EXISTS estates (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocks (
  id VARCHAR(255) PRIMARY KEY,
  estate_id VARCHAR(255),
  name VARCHAR(500) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- FK blocks.estate_id -> estates.id (skip if already present, including from prior DDL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blocks_estate_id_fkey'
  ) THEN
    ALTER TABLE blocks
      ADD CONSTRAINT blocks_estate_id_fkey
      FOREIGN KEY (estate_id) REFERENCES estates(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS estate_id VARCHAR(255);
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS block_id VARCHAR(255);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspections_estate_id_fkey'
  ) THEN
    ALTER TABLE inspections
      ADD CONSTRAINT inspections_estate_id_fkey
      FOREIGN KEY (estate_id) REFERENCES estates(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspections_block_id_fkey'
  ) THEN
    ALTER TABLE inspections
      ADD CONSTRAINT inspections_block_id_fkey
      FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE SET NULL;
  END IF;
END $$;
