-- Persist poster PDF generation failure without blocking submission (dashboard uses status=submitted).
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS pdf_generation_error TEXT;
