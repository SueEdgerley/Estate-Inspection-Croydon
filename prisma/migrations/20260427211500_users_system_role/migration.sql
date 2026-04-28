-- Keep permission role separate from operational job title.
-- users.system_role controls app permissions; people.job_title controls forms/workflow/reporting.

ALTER TABLE users ADD COLUMN IF NOT EXISTS system_role VARCHAR(50);

UPDATE users
SET system_role = CASE
  WHEN lower(trim(COALESCE(system_role, role, 'user'))) IN ('owner', 'admin') THEN 'admin'
  ELSE 'user'
END
WHERE system_role IS NULL OR trim(system_role) = '';

ALTER TABLE users ALTER COLUMN system_role SET DEFAULT 'user';
CREATE INDEX IF NOT EXISTS idx_users_system_role ON users(system_role);
