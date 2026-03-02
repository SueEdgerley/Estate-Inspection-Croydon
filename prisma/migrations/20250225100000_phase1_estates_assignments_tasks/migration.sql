-- Phase 1: estates, blocks, user_assignments, tasks, outbound_emails; inspection columns for template snapshot + dual PDFs

-- Estates (optional link from blocks; inspections can link to estate and/or block)
CREATE TABLE IF NOT EXISTS estates (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Blocks (optional link to estate; inspections tie to block for reporting)
CREATE TABLE IF NOT EXISTS blocks (
  id VARCHAR(255) PRIMARY KEY,
  estate_id VARCHAR(255) REFERENCES estates(id) ON DELETE SET NULL,
  name VARCHAR(500) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User assignments: time-bounded (starts_at, ends_at). Person assigned to estate/block with role.
-- Roles: caretaker, esm, housing officer, admin. Temporary cover = assignment with ends_at.
CREATE TABLE IF NOT EXISTS user_assignments (
  id VARCHAR(255) PRIMARY KEY,
  person_id VARCHAR(255) NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  estate_id VARCHAR(255) REFERENCES estates(id) ON DELETE CASCADE,
  block_id VARCHAR(255) REFERENCES blocks(id) ON DELETE CASCADE,
  role VARCHAR(100) NOT NULL,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT at_least_one_scope CHECK (estate_id IS NOT NULL OR block_id IS NOT NULL)
);

-- Tasks (created when question has triggers_task true on issue answer)
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(255) PRIMARY KEY,
  inspection_id VARCHAR(255) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  question_id VARCHAR(255),
  category VARCHAR(100),
  issue_type VARCHAR(100),
  programme_tag VARCHAR(255),
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Outbound emails log (when triggers_email true; queue/send and log here)
CREATE TABLE IF NOT EXISTS outbound_emails (
  id VARCHAR(255) PRIMARY KEY,
  inspection_id VARCHAR(255) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  question_id VARCHAR(255),
  email_to VARCHAR(500) NOT NULL,
  email_routing VARCHAR(255),
  sent_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inspections: tie to estate, block; store template snapshot; dual PDF URLs
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS estate_id VARCHAR(255) REFERENCES estates(id) ON DELETE SET NULL;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS block_id VARCHAR(255) REFERENCES blocks(id) ON DELETE SET NULL;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS template_version JSONB;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS full_pdf_url TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS poster_pdf_url TEXT;
