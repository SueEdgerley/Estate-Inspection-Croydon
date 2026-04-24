-- Per-action issue / repair job sheet PDF (Vercel Blob URL), distinct from full inspection report
ALTER TABLE actions ADD COLUMN IF NOT EXISTS issue_pdf_url TEXT;
