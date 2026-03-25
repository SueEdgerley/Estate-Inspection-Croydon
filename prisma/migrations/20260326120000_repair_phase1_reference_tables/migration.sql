-- Additive repair only: ensure Phase 1 reference tables and inspection FK columns exist.
-- Safe when prior migration rows exist but DDL never ran (or tables were dropped).
-- Idempotent: CREATE TABLE IF NOT EXISTS, ALTER TABLE ... ADD COLUMN IF NOT EXISTS.

-- Estates / blocks (create form + validateInspectionEstateAndBlock)
CREATE TABLE IF NOT EXISTS estates (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocks (
  id VARCHAR(255) PRIMARY KEY,
  estate_id VARCHAR(255) REFERENCES estates(id) ON DELETE SET NULL,
  name VARCHAR(500) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Person ↔ estate/block (admin / assignments)
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

-- Inspection location + snapshot columns (additive; no data rewrite)
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS estate_id VARCHAR(255) REFERENCES estates(id) ON DELETE SET NULL;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS block_id VARCHAR(255) REFERENCES blocks(id) ON DELETE SET NULL;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS template_version JSONB;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS full_pdf_url TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS poster_pdf_url TEXT;

-- Clerk users ↔ estate/block (dashboard scoping); users table often already exists
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  clerk_user_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_estate_assignments (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  estate_id VARCHAR(255) REFERENCES estates(id) ON DELETE CASCADE,
  block_id VARCHAR(255) REFERENCES blocks(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_estate_assignments_user_id ON user_estate_assignments(user_id);
