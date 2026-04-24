-- Optional geographic grouping for manager reports (e.g. North / South).
ALTER TABLE estates ADD COLUMN IF NOT EXISTS area VARCHAR(100);
