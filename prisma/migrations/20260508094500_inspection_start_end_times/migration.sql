ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS inspection_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inspection_end_time TIMESTAMPTZ;
