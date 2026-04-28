-- Separate operating models: caretaker scheduled work, ESM ad-hoc checks, housing walkabouts.

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS work_type VARCHAR(50);

UPDATE inspections
SET work_type = CASE
  WHEN work_type IS NOT NULL AND trim(work_type) <> '' THEN work_type
  WHEN COALESCE(is_scheduled, false) = true THEN 'caretaker_scheduled'
  WHEN lower(COALESCE(type, '')) = 'estate_walkabout'
    OR lower(COALESCE(template_name, '')) LIKE '%walkabout%' THEN 'housing_walkabout'
  WHEN lower(COALESCE(template_name, '')) LIKE '%caretaker%' THEN 'caretaker_scheduled'
  WHEN lower(COALESCE(template_name, '')) LIKE '%esm%' THEN 'esm_adhoc'
  WHEN lower(COALESCE(source, '')) IN ('ad_hoc', 'adhoc') THEN 'esm_adhoc'
  ELSE 'esm_adhoc'
END
WHERE work_type IS NULL OR trim(work_type) = '';

CREATE INDEX IF NOT EXISTS idx_inspections_work_type ON inspections(work_type);
CREATE INDEX IF NOT EXISTS idx_inspections_work_type_status ON inspections(work_type, status);
CREATE INDEX IF NOT EXISTS idx_inspections_work_type_due_date ON inspections(work_type, due_date);

CREATE TABLE IF NOT EXISTS caretaker_schedules (
  id VARCHAR(255) PRIMARY KEY,
  caretaker_user_id VARCHAR(255),
  caretaker_person_id VARCHAR(255) REFERENCES people(id) ON DELETE SET NULL,
  estate_id VARCHAR(255) REFERENCES estates(id) ON DELETE SET NULL,
  block_id VARCHAR(255) REFERENCES blocks(id) ON DELETE SET NULL,
  template_id VARCHAR(255),
  template_name VARCHAR(255),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  frequency VARCHAR(50) NOT NULL DEFAULT 'weekly',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_caretaker_schedules_active ON caretaker_schedules(active);
CREATE INDEX IF NOT EXISTS idx_caretaker_schedules_due ON caretaker_schedules(day_of_week, active);
