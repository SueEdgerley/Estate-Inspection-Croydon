-- Archive duplicate inspections/actions without deleting them.
-- Original IDs, PDFs, photographs and answers remain. Status and submitted_at are unchanged.
-- Rollback: SET superseded_by = NULL, superseded_at = NULL for the same IDs.

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS superseded_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS superseded_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS inspections_superseded_by_idx
  ON inspections (superseded_by)
  WHERE superseded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS actions_superseded_by_idx
  ON actions (superseded_by)
  WHERE superseded_by IS NOT NULL;
