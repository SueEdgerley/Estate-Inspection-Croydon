-- Separate employment/job title from app permission/routing role.
ALTER TABLE people ADD COLUMN IF NOT EXISTS job_title VARCHAR(255);

-- Preserve existing staff job labels that were previously stored in people.role.
UPDATE people
SET job_title = CASE lower(trim(role))
  WHEN 'housing officer' THEN 'Housing Officer'
  WHEN 'caretaker' THEN 'Caretaker'
  WHEN 'esm' THEN 'Estate Services Manager'
  WHEN 'repairs officer' THEN 'Repairs Officer'
  WHEN 'repairs' THEN 'Repairs Officer'
  ELSE job_title
END
WHERE job_title IS NULL
  AND role IS NOT NULL
  AND category IS DISTINCT FROM 'issue_recipient';
