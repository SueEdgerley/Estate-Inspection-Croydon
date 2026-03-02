-- Initial schema: idempotent (CREATE TABLE IF NOT EXISTS) so safe on existing DBs.
-- Apply with: npx prisma migrate deploy
-- Requires DATABASE_URL (or set it from POSTGRES_URL / POSTGRES_PRISMA_URL in .env).

DROP VIEW IF EXISTS inspections CASCADE;

CREATE TABLE IF NOT EXISTS inspections (
  id VARCHAR(255) PRIMARY KEY,
  legacy_inspection_id NUMERIC NULL,
  type VARCHAR(50) NOT NULL,
  location_label VARCHAR(500),
  inspector_name VARCHAR(255),
  inspector_id VARCHAR(255),
  template_id VARCHAR(255),
  template_name VARCHAR(255),
  due_date TIMESTAMP WITH TIME ZONE,
  submitted_at TIMESTAMP WITH TIME ZONE,
  grading VARCHAR(50),
  pdf_url TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  scheduled_id VARCHAR(255),
  is_scheduled BOOLEAN DEFAULT false,
  title VARCHAR(500),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS legacy_inspection_id NUMERIC NULL;

CREATE TABLE IF NOT EXISTS people (
  id VARCHAR(255) PRIMARY KEY,
  airtable_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  category VARCHAR(50),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(email)
);

CREATE TABLE IF NOT EXISTS inspection_photos (
  id VARCHAR(255) PRIMARY KEY,
  inspection_id VARCHAR(255) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  question_id VARCHAR(255) NOT NULL,
  blob_url TEXT NOT NULL,
  blob_key VARCHAR(500),
  filename VARCHAR(255),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inspection_answers (
  id VARCHAR(255) PRIMARY KEY,
  inspection_id VARCHAR(255) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  section_id VARCHAR(50) NOT NULL,
  question_id VARCHAR(255) NOT NULL,
  question_type VARCHAR(50) NOT NULL,
  answer_value TEXT,
  answer_text TEXT,
  answer_number NUMERIC,
  answer_boolean BOOLEAN,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(inspection_id, question_id)
);

CREATE TABLE IF NOT EXISTS actions (
  id VARCHAR(255) PRIMARY KEY,
  inspection_id VARCHAR(255) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  section_id VARCHAR(50),
  section_name VARCHAR(255),
  question_id VARCHAR(255),
  category VARCHAR(50) NOT NULL,
  priority VARCHAR(20),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  location VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  comment TEXT,
  recipient_person_id VARCHAR(255) REFERENCES people(id) ON DELETE SET NULL,
  auto_created BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE actions ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS job_number VARCHAR(100);
ALTER TABLE actions ADD COLUMN IF NOT EXISTS expected_completion_date DATE;

CREATE TABLE IF NOT EXISTS action_photos (
  id VARCHAR(255) PRIMARY KEY,
  action_id VARCHAR(255) NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  photo_id VARCHAR(255) NOT NULL REFERENCES inspection_photos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inspection_recipients (
  id VARCHAR(255) PRIMARY KEY,
  inspection_id VARCHAR(255) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  person_id VARCHAR(255) REFERENCES people(id) ON DELETE SET NULL,
  person_email VARCHAR(255) NOT NULL,
  recipient_type VARCHAR(50) NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS issues (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  location VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS completed_inspections (
  photobook_id INTEGER PRIMARY KEY,
  template_name TEXT,
  location_text TEXT,
  inspector_name TEXT,
  inspector_email TEXT,
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  actual_score INTEGER,
  total_possible_score INTEGER,
  is_ad_hoc BOOLEAN,
  is_completed BOOLEAN
);

CREATE TABLE IF NOT EXISTS photobook_import_raw (
  id INTEGER PRIMARY KEY,
  frequency TEXT,
  template_name TEXT,
  location TEXT,
  band TEXT,
  actual_score INTEGER,
  total_possible_score INTEGER,
  inspection_date TEXT,
  inspection_time TEXT,
  inspection_datetime TEXT,
  due_date TEXT,
  completed_date TEXT,
  completed_time TEXT,
  completed_datetime TEXT,
  inspector_name TEXT,
  inspector_email TEXT,
  email_to TEXT,
  is_ad_hoc INTEGER,
  is_completed INTEGER,
  source_status TEXT
);
