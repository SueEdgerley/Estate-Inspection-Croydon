-- Permission order is explicit:
-- owner = full access always, admin = full operational/admin access, user = filtered by job_title.

ALTER TABLE users ADD COLUMN IF NOT EXISTS system_role VARCHAR(50);

UPDATE users
SET system_role = CASE
  WHEN lower(trim(COALESCE(role, ''))) = 'owner' THEN 'owner'
  WHEN lower(trim(COALESCE(system_role, role, ''))) = 'admin' THEN 'admin'
  ELSE 'user'
END
WHERE system_role IS NULL
   OR trim(system_role) = ''
   OR lower(trim(COALESCE(role, ''))) = 'owner';

ALTER TABLE users ALTER COLUMN system_role SET DEFAULT 'user';
