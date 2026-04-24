-- Blocks: active flag (default on) for soft-excluding rows from location pickers.
-- Estates are not in use yet; estate_id on blocks stays nullable for later.

ALTER TABLE blocks ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Deactivate duplicate display names (keep one row per normalized name: earliest created_at, then id).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(name))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM blocks
)
UPDATE blocks
SET active = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Deactivate common placeholder / test names (tune in Admin or set active = true to restore).
UPDATE blocks
SET active = false
WHERE COALESCE(active, true) = true
  AND (
    trim(name) = ''
    OR lower(trim(name)) IN ('test', 'test block', 'dummy', 'temp', 'asdf', 'sample', 'xxx')
  );

CREATE INDEX IF NOT EXISTS idx_blocks_active_name ON blocks (active, name);
