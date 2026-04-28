-- Phase 1 best practice guides: admin-uploaded PDFs linked to templates/forms.

CREATE TABLE IF NOT EXISTS best_practice_guides (
  id VARCHAR(255) PRIMARY KEY,
  template_id VARCHAR(255),
  template_key VARCHAR(255),
  template_name VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_key VARCHAR(500),
  content_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  active BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_best_practice_guides_template_id ON best_practice_guides(template_id, active);
CREATE INDEX IF NOT EXISTS idx_best_practice_guides_template_key ON best_practice_guides(template_key, active);
