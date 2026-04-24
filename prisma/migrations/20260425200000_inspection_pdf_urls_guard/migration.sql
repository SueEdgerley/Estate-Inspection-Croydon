-- Idempotent guard for deployments that predate full/poster PDF columns.
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS full_pdf_url TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS poster_pdf_url TEXT;
